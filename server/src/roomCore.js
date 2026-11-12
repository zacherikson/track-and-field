import { applyPatch } from '../../src/meet/protocol.js';
import { roomStandings } from '../../src/online/liveResults.js';
import { CONFIG } from '../../src/config.js';
import { BOARDS } from './marks.js';

const NO_SHOW = 5000; // ms after the start that a player who never connected counts as gone
const EMPTY_FOR = 120000; // ms with nobody connected before the room ends
const EARLY = 750; // ms a race's result may come before the race could have been run (clocks and rounding)
const RES = /^res\/(\d+)-([a-z0-9]+)(?:-\d+)?$/; // a result's path in a doc: res/{step}-{event}[-{round}]

/**
 * ONE LIVE ROOM's play (src/online/live.js LiveSession), from its waiting
 * room closing to the end of its event or tournament. Each player has a DOC,
 * as in a meet: they send `patch` { p } updates, the room keeps the doc and
 * passes the patch on to the others as `doc` { u, p }. A player whose socket
 * closes is `left` (unless they said `finished`: played to the end), and back
 * if it reconnects. The stages' starts are worked out on the phones from the
 * docs' ready times, so the room only relays.
 *
 * SETTLING: once everyone's results are in (src/online/liveResults.js), or
 * the rest have left, or a while after the last result came (giveUp), the
 * room works out its standings from the docs, the same for everyone, and
 * hands them to `io.settle` (the Room pays out from them: index.js), once.
 * `sendTo` gets a word to one player (their payout).
 *
 * WHAT A RESULT HAS TO BE to count when the room settles (the phones still
 * show each other whatever they sent; this is only what gets paid):
 * - the first one sent for a stage: it can't be changed afterwards;
 * - possible at all (marks.js BOARDS: the same limits as the online boards);
 * - for a race, not in before the race could have been run: the room knows
 *   when it started, and when each player's last result came, so a 9.5 s
 *   100m can't arrive 3 s after the start.
 * One that fails counts as no mark (a DNF, or a foul in a field event).
 *
 * `io`: { now(), ended(), settle?(standings), audit?(note) }: `audit` gets a note of each result that didn't count (audit.js).
 */
export class RoomCore {
  constructor(io) {
    this.io = io;
    this.info = null; // { kind, startAt, setLen, players: [{ uid, name, athlete }] }
    this.docs = new Map(); // uid -> doc
    this.peers = new Map(); // uid -> socket
    this.finished = new Set();
    this.emptySince = null;
    this.over = false;
    this.settled = false;
    this.lastResultAt = null; // when the last result came in (server ms)
    this.resultAt = new Map(); // uid -> { [res path]: when it first came (server ms) }
    this.noted = new Set(); // results already noted as not counted
  }

  /** From the waiting room: who plays. */
  init(info) {
    if (this.info) return;
    this.info = info;
    this.emptySince = this.io.now();
  }

  /** A player connects: theirs only. Gets everyone else's doc so far. */
  connect(peer) {
    if (this.over || !this.info?.players.some((p) => p.uid === peer.uid)) return false;
    const old = this.peers.get(peer.uid);
    if (old && old !== peer) {
      old.send({ t: 'replaced' });
      old.close();
    }
    this.peers.set(peer.uid, peer);
    this.emptySince = null;
    const docs = Object.fromEntries([...this.docs].filter(([uid]) => uid !== peer.uid));
    peer.send({ t: 'docs', docs });
    // Back after a drop: the others see you're here again.
    if (this.docs.get(peer.uid)?.left) this.patch(peer.uid, { left: null });
    return true;
  }

  disconnect(peer) {
    if (this.peers.get(peer.uid) !== peer) return; // replaced by a newer socket
    this.peers.delete(peer.uid);
    if (!this.finished.has(peer.uid)) this.patch(peer.uid, { left: true });
    if (!this.peers.size) this.emptySince = this.io.now();
  }

  message(peer, msg) {
    if (this.peers.get(peer.uid) !== peer) return;
    if (msg.t === 'patch' && msg.p && typeof msg.p === 'object') this.patch(peer.uid, msg.p);
    else if (msg.t === 'finished') this.finished.add(peer.uid);
  }

  /** Sends `msg` to player `uid`, if they're connected. */
  sendTo(uid, msg) {
    this.peers.get(uid)?.send(msg);
  }

  /** Settles the room if it's time (see the top), once. */
  checkSettle() {
    if (this.settled || !this.info || !this.io.settle) return;
    const players = this.info.players;
    const gone = new Set(players.filter((p) => this.docs.get(p.uid)?.left).map((p) => p.uid));
    const docs = this.vetted();
    let s = roomStandings(this.info.kind, players, docs, gone);
    if (!s) return; // a kind settled some other way (live survival)
    if (!s.done) {
      // Someone's result never came: a while after the last one, it's settled without them.
      if (this.lastResultAt == null || this.io.now() - this.lastResultAt < CONFIG.economy.live.giveUp) return;
      s = roomStandings(this.info.kind, players, docs, new Set(players.map((p) => p.uid)));
    }
    this.settled = true;
    this.io.settle(s);
  }

  /**
   * The docs as the room settles them: each result that isn't possible, or
   * came before its race could have been run, replaced by no mark.
   */
  vetted() {
    const out = new Map();
    for (const [uid, doc] of this.docs) {
      const at = this.resultAt.get(uid) ?? {};
      const res = {};
      for (const [key, r] of Object.entries(doc.res && typeof doc.res === 'object' ? doc.res : {})) {
        const why = this.wrong(key, r, at);
        if (why && !this.noted.has(`${uid}/${key}`)) {
          this.noted.add(`${uid}/${key}`); // once: a room is vetted every time it looks at settling
          console.warn('result not counted', this.info?.id, uid, key, why);
          this.io.audit?.({ uid, kind: 'live-result', why, detail: `${this.info?.id ?? ''} ${key} ${r?.mark}` });
        }
        res[key] = why ? { status: 'void' } : r;
      }
      out.set(uid, { ...doc, res });
    }
    return out;
  }

  /** Why result `r` at `key` (a doc's res path, less 'res/') doesn't count, or null. `at` = when each of that player's results came. */
  wrong(key, r, at) {
    const m = RES.exec(`res/${key}`);
    const board = m && Object.hasOwn(BOARDS, m[2]) ? BOARDS[m[2]] : null;
    if (!board || !r || typeof r !== 'object' || !Number.isFinite(r.mark)) return null; // no mark to doubt (or an event with no limits)
    if (board.lower ? r.mark < board.min : r.mark > board.max) return 'impossible';
    if (board.unit !== 's') return null;
    // A race: it began no sooner than the room did, or than this player's last result before it.
    const step = Number(m[1]);
    const came = at[`res/${key}`];
    const before = Object.entries(at)
      .filter(([path]) => Number(RES.exec(path)?.[1]) < step)
      .map(([, t]) => t);
    const since = Math.max(this.info.startAt, ...before);
    return came != null && came - since < r.mark * 1000 - EARLY ? 'too soon' : null;
  }

  /** Applies `p` to `uid`'s doc and passes it on. A result already in stands: a second one for the same stage is dropped. */
  patch(uid, p) {
    const at = this.resultAt.get(uid) ?? {};
    this.resultAt.set(uid, at);
    const now = this.io.now();
    p = Object.fromEntries(
      Object.entries(p).filter(([path]) => {
        if (path === 'res') return false; // results come one by one
        if (!path.startsWith('res/')) return true;
        if (!RES.test(path) || at[path] != null) return false;
        at[path] = now;
        return true;
      }),
    );
    if (!Object.keys(p).length) return;
    const doc = this.docs.get(uid) ?? {};
    applyPatch(doc, p);
    this.docs.set(uid, doc);
    for (const [id, peer] of this.peers) if (id !== uid) peer.send({ t: 'doc', u: uid, p });
    if (Object.keys(p).some((k) => k.startsWith('res/'))) this.lastResultAt = this.io.now();
    this.checkSettle();
  }

  tick() {
    if (!this.info || this.over) return;
    this.checkSettle(); // a result that never came
    const now = this.io.now();
    // Never came (their phone went between the waiting room and here): gone.
    if (now >= this.info.startAt + NO_SHOW) for (const p of this.info.players) if (!this.docs.has(p.uid) && !this.peers.has(p.uid)) this.patch(p.uid, { left: true });
    if (this.emptySince != null && now - this.emptySince >= EMPTY_FOR) {
      this.over = true;
      this.io.ended();
    }
  }
}
