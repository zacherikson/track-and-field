import { applyPatch } from '../../src/meet/protocol.js';
import { roomStandings } from '../../src/online/liveResults.js';
import { CONFIG } from '../../src/config.js';

const NO_SHOW = 5000; // ms after the start that a player who never connected counts as gone
const EMPTY_FOR = 120000; // ms with nobody connected before the room ends

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
 * `io`: { now(), ended(), settle?(standings) }.
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
    let s = roomStandings(this.info.kind, players, this.docs, gone);
    if (!s) return; // a kind settled some other way (live survival)
    if (!s.done) {
      // Someone's result never came: a while after the last one, it's settled without them.
      if (this.lastResultAt == null || this.io.now() - this.lastResultAt < CONFIG.economy.live.giveUp) return;
      s = roomStandings(this.info.kind, players, this.docs, new Set(players.map((p) => p.uid)));
    }
    this.settled = true;
    this.io.settle(s);
  }

  /** Applies `p` to `uid`'s doc and passes it on. */
  patch(uid, p) {
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
