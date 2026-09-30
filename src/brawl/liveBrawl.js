import { serverNow } from '../online/live.js';

/**
 * The late hits played live (online/live.js): each phone moves its own
 * athlete and says where it is and what it's doing; each phone decides its
 * own player's hits and says who they hit. In your doc in the room:
 *
 *   b        = { k, x, d, f, s, n, e, h }: which brawl (k: the event just
 *              finished), where you stand (x, d), which way you face (f), your
 *              move (s) and its count (n, so a new punch reads as new), the
 *              punching arm or the emote (e), and who's holding you up (h)
 *   h/{n}    = { k, to, t, s, f, at }: your n-th hit: on whom, what (punch,
 *              kick, slam), the wound seed, which way you faced, when
 *
 * Positions go out about ten times a second; a new move or a hit at once. The
 * others glide to where you say (brawl.js follow) and play your moves as they
 * hear of them. A hit is applied on every phone when it arrives: the one hit
 * takes the knockback, everyone sees the POW! and the same wound.
 */
const EVERY = 0.1; // s between position updates
const KEEP_HITS = 12; // hits kept in your doc (older ones are deleted as you go)
const STALE = 3000; // ms: hits older than this when they arrive are ignored

export class LiveBrawl {
  constructor(brawl, session, key) {
    this.brawl = brawl;
    this.session = session;
    this.key = key;
    this.n = 0;
    this.seen = new Set();
    this.clock = 0;
    brawl.onHit = (a, v, kind, seed) => a.isMe && this.sendHit(a, v, kind, seed);
    brawl.onChange = (f) => f.state !== 'walk' && f.state !== 'idle' && this.sendState(true);
    session.send({ h: null }, true);
    this.sendState(true);
    this.stop = session.listen((uid, doc) => this.onDoc(uid, doc));
  }

  update(dt) {
    this.clock += dt;
    if (this.clock >= EVERY) {
      this.clock = 0;
      this.sendState(false);
    }
  }

  sendState(now) {
    const me = this.brawl.me;
    if (!me) return;
    const r = (v) => Math.round(v * 100) / 100;
    this.session.send({
      b: { k: this.key, x: r(me.x), d: r(me.d), f: me.facing, s: me.state, n: me.seq, e: me.variant ?? 0, h: me.holder?.id ?? '' },
    }, now);
  }

  sendHit(a, v, kind, seed) {
    this.n++;
    const patch = { [`h/${this.n}`]: { k: this.key, to: v.id, t: kind, s: seed, f: a.facing, at: Math.round(serverNow()) } };
    if (this.n > KEEP_HITS) patch[`h/${this.n - KEEP_HITS}`] = null;
    this.session.send(patch, true);
  }

  onDoc(uid, doc) {
    const brawl = this.brawl;
    const f = brawl.byId(uid);
    if (!f) return;
    if (doc.left || (doc.b === undefined && f.net)) {
      // Gone (or on to the next event): off the field.
      if (doc.left || !doc.b) brawl.remove(f);
      return;
    }
    const b = doc.b;
    if (b && b.k === this.key && Number.isFinite(b.x) && Number.isFinite(b.d)) {
      f.net = { x: b.x, d: b.d };
      if (b.f === 1 || b.f === -1) f.facing = b.f;
      if (b.n !== f.netSeq) {
        f.netSeq = b.n;
        this.mirror(f, b);
      }
    }
    for (const [n, h] of Object.entries(doc.h ?? {})) {
      if (!h || h.k !== this.key) continue;
      const id = `${uid}/${n}`;
      if (this.seen.has(id)) continue;
      this.seen.add(id);
      if (serverNow() - h.at > STALE) continue;
      const v = brawl.byId(h.to);
      if (!v || !['punch', 'kick', 'slam'].includes(h.t)) continue;
      const t = brawl.t;
      if (!v.vulnerable(t)) continue;
      if (h.f === 1 || h.f === -1) f.facing = h.f;
      brawl.applyHit(f, v, h.t, t, h.s >>> 0);
    }
  }

  /** Another player started a move: play it here (unless it's the one we already showed). */
  mirror(f, b) {
    const t = this.brawl.t;
    const same = b.s === f.state && t - f.st < 0.5;
    if (b.s === 'held') {
      const holder = this.brawl.byId(b.h);
      if (holder) {
        f.holder = holder;
        holder.grabbed = f;
      }
    } else if (f.holder && b.s !== 'held') {
      if (f.holder.grabbed === f) f.holder.grabbed = null;
      f.holder = null;
    }
    if (same || b.s === 'walk' || b.s === 'idle') {
      if (!same && (f.state === 'walk' || f.state === 'idle')) f.state = b.s;
      return;
    }
    f.set(b.s, t, b.e);
  }

  /** Leaving the brawl: off the others' screens. */
  close() {
    this.stop?.();
    this.session.send({ b: null }, true);
  }
}
