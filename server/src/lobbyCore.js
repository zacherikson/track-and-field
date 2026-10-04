import { MAX_PLAYERS, START_DELAY, CLOSE_BEFORE } from '../../src/online/liveRules.js';

/**
 * LIVE WAITING ROOMS (src/online/live.js): one per `kind` (an event, or the
 * tournament). Used by the Lobby object for the public ones and by each
 * squad's SquadHub for its Practice.
 *
 * Whoever is in a kind's waiting room plays together. When a second player
 * arrives it gets a start (`startAt`, server ms) START_DELAY ahead and a GET
 * SET length; dropping back to one player calls it off. CLOSE_BEFORE the
 * start it closes: its players are handed to a Room (io.openRoom), which runs
 * the play, and the next player to arrive starts a new waiting room.
 *
 * `io`: { now(), newId(), openRoom(id, info), changed() }: `changed` says the
 * list of open rooms (rooms()) may have changed. `kinds`: what can be played.
 */
export class LobbyCore {
  constructor(io, kinds) {
    this.io = io;
    this.kinds = kinds;
    this.nodes = new Map(); // kind -> { room, players: Map(peer -> { uid, name, athlete, at }), startAt, setLen }
    this.where = new Map(); // peer -> the kind it's waiting for
  }

  /** `peer` asks to wait for `kind` as { name, athlete }. Takes it out of any other waiting room. */
  join(peer, msg) {
    const kind = String(msg.kind ?? '');
    if (!this.kinds.has(kind)) return;
    this.leave(peer, false);
    const now = this.io.now();
    let node = this.nodes.get(kind);
    // Someone else on the same account counts as them (another tab, a reconnect).
    const same = node && [...node.players.keys()].find((p) => p.uid === peer.uid);
    if (same) this.remove(node, same);
    if (!node || node.players.size >= MAX_PLAYERS) {
      // Full: a new room takes over the kind (the full one plays on, but nobody else can get in).
      if (node) this.close(kind, node, false);
      node = { room: this.io.newId(), players: new Map(), startAt: null, setLen: null };
      this.nodes.set(kind, node);
    }
    node.players.set(peer, { uid: peer.uid, name: String(msg.name ?? peer.name ?? '?').slice(0, 16), athlete: String(msg.athlete ?? '').slice(0, 24), at: now });
    this.where.set(peer, kind);
    this.restart(node, now);
    this.changed(kind);
  }

  /** `peer` leaves its waiting room (it tapped Leave, or its socket closed). */
  leave(peer, announce = true) {
    const kind = this.where.get(peer);
    if (kind == null) return;
    this.where.delete(peer);
    const node = this.nodes.get(kind);
    if (!node) return;
    this.remove(node, peer);
    if (!node.players.size) this.nodes.delete(kind);
    else this.restart(node, this.io.now());
    if (announce) this.changed(kind);
  }

  remove(node, peer) {
    node.players.delete(peer);
    this.where.delete(peer);
  }

  /** Two or more players: the start is set. Fewer: it's off. */
  restart(node, now) {
    if (node.players.size < 2) node.startAt = node.setLen = null;
    else if (node.startAt == null) {
      node.startAt = Math.round(now + START_DELAY);
      node.setLen = 1.1 + Math.random() * 1.2; // GET SET lasts a random time, as offline
    }
  }

  /** Closes the rooms whose start is near. */
  tick() {
    const now = this.io.now();
    for (const [kind, node] of this.nodes) if (node.startAt != null && now >= node.startAt - CLOSE_BEFORE) this.close(kind, node);
  }

  /** Hands `node`'s players to their Room and frees the kind. `announce`: tell them (a full room still waits for its start). */
  close(kind, node, announce = true) {
    if (node.startAt != null && node.players.size >= 2) {
      this.io.openRoom(node.room, { kind, startAt: node.startAt, setLen: node.setLen, players: this.list(node) });
      if (announce) this.send(node, { closed: true });
    }
    for (const p of node.players.keys()) this.where.delete(p);
    if (this.nodes.get(kind) === node) this.nodes.delete(kind);
    if (announce) this.io.changed();
  }

  list(node) {
    return [...node.players.values()].sort((a, b) => a.at - b.at);
  }

  /** Tells `node`'s players how it stands. */
  send(node, extra = {}) {
    const msg = { t: 'waiting', room: node.room, players: this.list(node), startAt: node.startAt, setLen: node.setLen, ...extra };
    for (const p of node.players.keys()) p.send(msg);
  }

  changed(kind) {
    const node = this.nodes.get(kind);
    if (node) this.send(node);
    this.io.changed();
  }

  /** The open waiting rooms (for a squad's Practice list), oldest first: [{ kind, host, players: [{ uid, name }], full, at }]. */
  rooms() {
    return [...this.nodes]
      .map(([kind, node]) => {
        const players = this.list(node).map(({ uid, name, at }) => ({ uid, name, at }));
        return { kind, host: players[0]?.name ?? '?', players, full: players.length >= MAX_PLAYERS, at: players[0]?.at ?? 0 };
      })
      .filter((r) => r.players.length)
      .sort((a, b) => a.at - b.at);
  }
}
