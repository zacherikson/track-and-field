import { connectSDK, SDK_URL } from './firebase.js';
import { getPlayerName } from '../core/storage.js';
import { player as chosenPlayer } from '../athletes/roster.js';

/**
 * LIVE RACES: a waiting room, then a 100m against the other people in it.
 *
 * They run on Firebase's Realtime Database (the leaderboards stay in
 * Firestore): it's quick with small, frequent messages, tells us the server's
 * clock, and removes a player whose phone drops off (onDisconnect).
 * database.rules.json says who may write what.
 *
 *   lobby/{eventId}            = { room, startAt, setLen, players: { uid: { name, athlete, at } } }
 *   live/{room}/{uid}          = { name, athlete, run, n, done, left, v }
 *
 * The lobby node IS the waiting room: whoever is in `players` races together.
 * When a second player arrives it gets a start time (`startAt`, server clock,
 * ms) a few seconds ahead; everyone's gun fires then. Shortly before, the room
 * closes: the next player to arrive starts a new room in the same node.
 *
 * In the race each phone sends its runner's inputs as they happen (the same
 * data as a 100m ghost, online/ghost.js) and replays everyone else's through
 * the same physics (liveRun.js), so each phone works out every time exactly.
 */
export const MAX_PLAYERS = 4;
const START_DELAY = 10000; // ms from the second player arriving to the gun
export const CLOSE_BEFORE = 6000; // ms before the gun the room stops taking players (and everyone goes to the track)
const SEND_EVERY = 120; // ms between updates of your runner during a race

// The server's clock minus this phone's (ms), from the database.
let offset = 0;
export const serverNow = () => Date.now() + offset;

let connecting = null;

/** The Realtime Database SDK and your sign-in: { rt, db, uid }. Also starts following the server's clock. */
function connectRT() {
  connecting ??= (async () => {
    const [{ app, uid }, rt] = await Promise.all([connectSDK(), import(`${SDK_URL}/firebase-database.js`)]);
    const db = rt.getDatabase(app);
    await new Promise((resolve) => {
      rt.onValue(rt.ref(db, '.info/serverTimeOffset'), (snap) => {
        offset = snap.val() ?? 0;
        resolve();
      });
    });
    return { rt, db, uid };
  })();
  connecting.catch(() => {
    connecting = null; // try again next time
  });
  return connecting;
}

const newRoomId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const closed = (d, now) => d?.startAt != null && now > d.startAt - CLOSE_BEFORE;

/** Two or more players: the gun is set. Fewer: it's off. */
function withStart(d, now) {
  const n = Object.keys(d.players ?? {}).length;
  if (n < 2) return { ...d, startAt: null, setLen: null };
  if (d.startAt != null) return d;
  return { ...d, startAt: Math.round(now + START_DELAY), setLen: 1.1 + Math.random() * 1.2 }; // GET SET lasts a random time, as offline
}

/**
 * The waiting room for one event. `onChange(view)` gets
 * { room, players: [{ uid, name, athlete, me }], startAt, setLen, closed, uid } whenever it changes.
 */
export class Lobby {
  constructor(evId, onChange) {
    this.evId = evId;
    this.onChange = onChange;
    this.data = null;
  }

  async join() {
    const { rt, db, uid } = await connectRT();
    Object.assign(this, { rt, db, uid });
    this.ref = rt.ref(db, `lobby/${this.evId}`);
    const me = { name: getPlayerName(), athlete: chosenPlayer().id };
    await this.update((d, now) => {
      // Join the room in the node unless it's closed or full; otherwise start a new one.
      const players = d?.players ?? {};
      const open = !!d?.room && !closed(d, now) && (players[uid] != null || Object.keys(players).length < MAX_PLAYERS);
      const next = open ? { ...d, players: { ...players } } : { room: newRoomId(), players: {} };
      next.players[uid] = { ...me, at: now };
      return withStart(next, now);
    });
    // Your phone drops off: the server takes you out of the room.
    this.gone = rt.onDisconnect(rt.ref(db, `lobby/${this.evId}/players/${uid}`));
    this.gone.remove();
    this.stop = rt.onValue(this.ref, (snap) => {
      this.data = snap.val();
      const v = this.view();
      // Someone dropped off and left one runner: call the start off.
      if (v.startAt != null && !v.closed && v.players.length < 2) this.update((d, now) => (!d || closed(d, now) ? undefined : withStart(d, now))).catch(() => {});
      this.onChange(v);
    });
  }

  /** Runs `change(node, now)` on the lobby node in a transaction (`change` returns the new node, or undefined for none). */
  update(change) {
    return this.rt.runTransaction(this.ref, (d) => change(d, serverNow()));
  }

  view() {
    const d = this.data;
    const players = Object.entries(d?.players ?? {})
      .map(([uid, p]) => ({ uid, name: p.name, athlete: p.athlete ?? null, at: p.at, me: uid === this.uid }))
      .sort((a, b) => a.at - b.at);
    return { room: d?.room ?? null, players, startAt: d?.startAt ?? null, setLen: d?.setLen ?? null, closed: closed(d, serverNow()), uid: this.uid };
  }

  /** Stops listening. `leave` also takes you out of the room (unless it has closed for the race). */
  async close(leave = true) {
    this.stop?.();
    this.gone?.cancel();
    if (!leave || !this.ref) return;
    await this.update((d, now) => {
      if (!d?.players?.[this.uid] || closed(d, now)) return undefined;
      const players = { ...d.players };
      delete players[this.uid];
      return withStart({ ...d, players }, now);
    }).catch(() => {});
  }
}

/**
 * One live race's messages: your runner out, everyone else's in.
 * `onRunner(uid, doc)` gets each other runner's latest doc.
 */
export class LiveChannel {
  constructor(session, onRunner) {
    this.session = session;
    this.onRunner = onRunner;
    this.latest = null;
    this.sending = false;
    this.lastSent = 0;
  }

  async open() {
    const { rt, db, uid } = await connectRT();
    Object.assign(this, { rt, db, uid });
    this.ref = rt.ref(db, `live/${this.session.room}/${uid}`);
    // Your phone drops off mid-race: the others see you've left.
    this.gone = rt.onDisconnect(this.ref);
    this.gone.update({ left: true });
    this.stop = rt.onValue(rt.ref(db, `live/${this.session.room}`), (snap) => {
      for (const [id, doc] of Object.entries(snap.val() ?? {})) if (id !== uid) this.onRunner(id, doc);
    });
    if (this.latest) this.flush();
  }

  /** Queues your runner's latest state; it goes out at most every SEND_EVERY ms (at once with `now`). */
  send(doc, now = false) {
    this.latest = { v: 1, ...doc };
    if (now) this.lastSent = 0;
    this.flush();
  }

  flush() {
    if (!this.ref || this.closed || this.sending || !this.latest) return;
    const wait = this.lastSent + SEND_EVERY - Date.now();
    if (wait > 0) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), wait);
      return;
    }
    const doc = this.latest;
    this.latest = null;
    this.sending = true;
    this.lastSent = Date.now();
    this.rt
      .set(this.ref, doc)
      .catch(() => {})
      .finally(() => {
        this.sending = false;
        this.flush();
      });
  }

  /** Stops listening; `last` (e.g. { left: true }) goes out first if given. */
  close(last = null) {
    this.closed = true; // nothing queued goes out after this
    clearTimeout(this.timer);
    this.stop?.();
    if (!this.ref) return;
    if (last) this.rt.update(this.ref, { v: 1, ...last }).catch(() => {});
    else this.gone?.cancel(); // finished: nothing to say if the phone drops off now
  }
}
