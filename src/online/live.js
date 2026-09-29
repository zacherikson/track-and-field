import { connectSDK } from './firebase.js';
import { getPlayerName } from '../core/storage.js';
import { player as chosenPlayer } from '../athletes/roster.js';

/**
 * LIVE RACES: a waiting room, then a 100m against the other people in it.
 *
 * Firestore layout (firestore.rules says who may write what):
 *   lobby/{eventId}                  = { room, players: { uid: { name, athlete, at } }, startAt, setLen }
 *   live/{room}/runners/{uid}        = { name, athlete, run, n, done, left, v }
 *   clock/{uid}                      = { t }  (a server timestamp, to read the server's clock)
 *
 * The lobby doc IS the waiting room: whoever is in `players` races together.
 * When a second player arrives it gets a start time (`startAt`, server clock,
 * ms) a few seconds ahead; everyone's gun fires then. Shortly before, the room
 * closes: the next player to arrive starts a new room in the same doc.
 *
 * In the race each phone sends its runner's inputs as they happen (the same
 * data as a 100m ghost, online/ghost.js) and replays everyone else's through
 * the same physics (liveRun.js), so each phone works out every time exactly.
 */
export const MAX_PLAYERS = 4;
const START_DELAY = 10000; // ms from the second player arriving to the gun
export const CLOSE_BEFORE = 6000; // ms before the gun the room stops taking players (and everyone goes to the track)
const STALE = 12000; // ms without a heartbeat before a waiting player counts as gone
const HEARTBEAT = 3000;
const SEND_EVERY = 120; // ms between updates of your runner during a race

// The server's clock minus this phone's (ms), once measured.
let offset = 0;
export const serverNow = () => Date.now() + offset;

/** Measures the server's clock: write a server timestamp, read it back, keep the quickest of two tries. */
async function syncClock(fs, db, uid) {
  const ref = fs.doc(db, 'clock', uid);
  let best = null;
  for (let i = 0; i < 2; i++) {
    const t0 = Date.now();
    await fs.setDoc(ref, { t: fs.serverTimestamp() });
    const t1 = Date.now();
    const server = (await fs.getDoc(ref)).data().t.toMillis();
    if (!best || t1 - t0 < best.rtt) best = { rtt: t1 - t0, offset: server - (t0 + t1) / 2 };
  }
  offset = best.offset;
}

const newRoomId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Players still waiting (heard from recently). */
function present(players, now) {
  return Object.fromEntries(Object.entries(players ?? {}).filter(([, p]) => now - p.at < STALE));
}

/**
 * The waiting room for one event. `onChange(view)` gets
 * { room, players: [{ uid, name, athlete, me }], startAt, setLen, closed } whenever it changes.
 */
export class Lobby {
  constructor(evId, onChange) {
    this.evId = evId;
    this.onChange = onChange;
    this.data = null;
  }

  async join() {
    const { fs, db, uid } = await connectSDK();
    Object.assign(this, { fs, db, uid });
    await syncClock(fs, db, uid);
    this.ref = fs.doc(db, 'lobby', this.evId);
    await this.update((d, now) => {
      // Join the room in the doc unless it's closed or full; otherwise start a new one.
      const waiting = d ? present(d.players, now) : {};
      const open = !!d && !this.closed(d, now) && (waiting[uid] != null || Object.keys(waiting).length < MAX_PLAYERS);
      const players = open ? waiting : {};
      players[uid] = { name: getPlayerName(), athlete: chosenPlayer().id, at: now };
      return this.withStart({ room: open ? d.room : newRoomId(), players, startAt: open ? d.startAt ?? null : null, setLen: open ? d.setLen ?? null : null }, now);
    });
    this.stop = fs.onSnapshot(this.ref, (snap) => {
      this.data = snap.exists() ? snap.data() : null;
      this.onChange(this.view());
    });
    this.beat = setInterval(() => this.heartbeat().catch(() => {}), HEARTBEAT);
  }

  /** Runs `change(doc, now)` on the lobby doc in a transaction (`change` returns the new doc, or null for none). */
  update(change) {
    const { fs, db } = this;
    return fs.runTransaction(db, async (tx) => {
      const snap = await tx.get(this.ref);
      const next = change(snap.exists() ? snap.data() : null, serverNow());
      if (next) tx.set(this.ref, next);
    });
  }

  closed(d, now) {
    return d?.startAt != null && now > d.startAt - CLOSE_BEFORE;
  }

  /** Two or more players: the gun is set. Fewer: it's off. */
  withStart(d, now) {
    const n = Object.keys(d.players).length;
    if (n < 2) return { ...d, startAt: null, setLen: null };
    if (d.startAt != null) return d;
    return { ...d, startAt: Math.round(now + START_DELAY), setLen: 1.1 + Math.random() * 1.2 }; // GET SET lasts a random time, as offline
  }

  /** Still here: refresh your time, drop players who've gone quiet. */
  heartbeat() {
    return this.update((d, now) => {
      if (!d || d.players?.[this.uid] == null || this.closed(d, now)) return null;
      const players = present(d.players, now);
      players[this.uid] = { ...d.players[this.uid], at: now };
      return this.withStart({ ...d, players }, now);
    });
  }

  view() {
    const d = this.data;
    const players = Object.entries(d?.players ?? {})
      .map(([uid, p]) => ({ uid, name: p.name, athlete: p.athlete, at: p.at, me: uid === this.uid }))
      .sort((a, b) => a.at - b.at);
    return { room: d?.room ?? null, players, startAt: d?.startAt ?? null, setLen: d?.setLen ?? null, closed: this.closed(d, serverNow()), uid: this.uid };
  }

  /** Stops listening. `leave` also takes you out of the room (unless it has closed for the race). */
  async close(leave = true) {
    clearInterval(this.beat);
    this.stop?.();
    if (!leave || !this.ref) return;
    await this.update((d, now) => {
      if (!d || d.players?.[this.uid] == null || this.closed(d, now)) return null;
      const players = { ...d.players };
      delete players[this.uid];
      return this.withStart({ ...d, players }, now);
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
    const { fs, db, uid } = await connectSDK();
    Object.assign(this, { fs, db, uid });
    const runners = fs.collection(db, 'live', this.session.room, 'runners');
    this.ref = fs.doc(runners, uid);
    this.stop = fs.onSnapshot(runners, (snap) => {
      snap.forEach((d) => {
        if (d.id !== uid) this.onRunner(d.id, d.data());
      });
    });
    if (this.latest) this.flush();
  }

  /** Queues your runner's latest state; it goes out at most every SEND_EVERY ms (at once with `now`). */
  send(doc, now = false) {
    this.latest = { v: 1, ...doc };
    this.lastDoc = this.latest;
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
    this.fs
      .setDoc(this.ref, doc)
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
    if (last && this.ref) this.fs.setDoc(this.ref, { v: 1, ...this.lastDoc, ...last }).catch(() => {});
  }
}
