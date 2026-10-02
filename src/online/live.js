import { connectSDK, SDK_URL } from './firebase.js';
import { getPlayerName } from '../core/storage.js';

/**
 * LIVE: a waiting room, then an event (or a whole tournament) against the other
 * people in it.
 *
 * It runs on Firebase's Realtime Database (the leaderboards stay in
 * Firestore): it's quick with small, frequent messages, tells us the server's
 * clock, and marks a player whose phone drops off (onDisconnect).
 * database.rules.json says who may write what.
 *
 *   lobby/{kind}               = { room, startAt, setLen, players: { uid: { name, athlete, at } } }
 *   squadlobby/{squad}/{kind}  = the same, for one squad's practice (squadRoomKey)
 *   live/{room}/{uid}          = { v, name, athlete, left, s, t0, run, n, done, f, res, ready, b, h }
 *
 * `kind` is an event id, 'tournament' (solo) or 'teamtournament' (tournament.js TOUR_KINDS).
 * PRACTICE is a squad's own waiting rooms: started from the Squad tab, and only
 * listed there, on its members' Squad tabs (watchSquadRooms). The lobby node IS the waiting room:
 * whoever is in `players` plays together. When a second player arrives it gets
 * a start time (`startAt`, server clock, ms) a few seconds ahead; everyone
 * starts then. Shortly before, the room closes: the next player to arrive
 * starts a new room in the same node.
 *
 * In the room, play is split into STAGES: a race, or one round of a field
 * event; a tournament has one stage per race and per round. `s` is the stage
 * you're on and `t0` when it started (server ms). While it runs your phone
 * sends what the others need to draw you:
 * - the 100m: your inputs (`run`, the same data as a 100m ghost, online/ghost.js)
 *   and `n`, the physics steps run so far; the others replay them through the
 *   same physics (liveRun.js), so every phone works out every time exactly;
 * - everything else: your athlete frame by frame (`f`, chunks of a trace,
 *   online/trace.js), drawn a moment behind (liveTrace.js).
 * `res/{stage}` is your result for each stage, kept for the whole room.
 * `ready/{stage}` says you're ready for a stage, which the game says for you
 * as soon as you've finished the one before (nobody has to tap): once everyone
 * is (or a while after the first), it starts on every phone at the same
 * moment, a few seconds later (startOf), with a countdown on screen.
 * `b` and `h` are the late hits between events: where you are and who you
 * hit (brawl/liveBrawl.js).
 */
export const MAX_PLAYERS = 4;
const START_DELAY = 10000; // ms from the second player arriving to the start
export const CLOSE_BEFORE = 6000; // ms before the start the room stops taking players (and everyone goes to the event)
const SEND_EVERY = 100; // ms between updates during a stage
const READY_WAIT = 20000; // ms after the first player is ready for a stage that it starts without the others
const ROUND_LEAD = 6000; // ms from everyone finishing a field-event round to the next one starting (a look at the marks first)
export const EVENT_LEAD = 22000; // ms from everyone finishing a tournament event to the next one's start (standings and late hits, then its title card)

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

/** Two or more players: the start is set. Fewer: it's off. */
function withStart(d, now) {
  const n = Object.keys(d.players ?? {}).length;
  if (n < 2) return { ...d, startAt: null, setLen: null };
  if (d.startAt != null) return d;
  return { ...d, startAt: Math.round(now + START_DELAY), setLen: 1.1 + Math.random() * 1.2 }; // GET SET lasts a random time, as offline
}

/**
 * A squad's key as a database key: squad names may have a '.' in them, which
 * the Realtime Database doesn't allow in a key (nor # $ [ ] /).
 */
export const squadRoomKey = (squadKey) => encodeURIComponent(squadKey).replace(/\./g, '%2E');

/** Where the waiting room for `kind` lives: the public one, or squad `squad`'s practice ({ key }). */
const lobbyPath = (kind, squad) => (squad ? `squadlobby/${squadRoomKey(squad.key)}/${kind}` : `lobby/${kind}`);

/**
 * The waiting room for one event, or a tournament (`kind`). `onChange(view)` gets
 * { room, players: [{ uid, name, athlete, lineup, me }], startAt, setLen, closed, uid } whenever it changes.
 * `who` = the athletes you play as: { athlete } (a character id), plus a team
 * tournament's `lineup` ({ [eventId]: character id }). `squad` ({ key }): that
 * squad's practice room instead of the public one.
 */
export class Lobby {
  constructor(kind, onChange, who, squad = null) {
    this.kind = kind;
    this.onChange = onChange;
    this.who = who;
    this.path = lobbyPath(kind, squad);
    this.data = null;
  }

  async join() {
    const { rt, db, uid } = await connectRT();
    Object.assign(this, { rt, db, uid });
    this.ref = rt.ref(db, this.path);
    const me = { name: getPlayerName(), ...this.who };
    await this.update((d, now) => {
      // Join the room in the node unless it's closed or full; otherwise start a new one.
      const players = d?.players ?? {};
      const open = !!d?.room && !closed(d, now) && (players[uid] != null || Object.keys(players).length < MAX_PLAYERS);
      const next = open ? { ...d, players: { ...players } } : { room: newRoomId(), players: {} };
      next.players[uid] = { ...me, at: now };
      return withStart(next, now);
    });
    // Your phone drops off: the server takes you out of the room.
    this.gone = rt.onDisconnect(rt.ref(db, `${this.path}/players/${uid}`));
    this.gone.remove();
    this.stop = rt.onValue(this.ref, (snap) => {
      this.data = snap.val();
      const v = this.view();
      // Someone dropped off and left one player: call the start off.
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
      .map(([uid, p]) => ({ uid, name: p.name, athlete: p.athlete ?? null, lineup: p.lineup ?? null, at: p.at, me: uid === this.uid }))
      .sort((a, b) => a.at - b.at);
    return { room: d?.room ?? null, players, startAt: d?.startAt ?? null, setLen: d?.setLen ?? null, closed: closed(d, serverNow()), uid: this.uid };
  }

  /** Stops listening. `leave` also takes you out of the room (unless it has closed for the start). */
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
 * Follows squad `squadKey`'s practice rooms: `onChange(rooms)` gets the ones
 * that are open, now and on every change, oldest first:
 * [{ kind, host, players: [{ uid, name, me }], full, mine }] (`host`: the name
 * of whoever started it, `mine`: you're in it). Resolves to a function that stops it.
 */
export async function watchSquadRooms(squadKey, onChange) {
  const { rt, db, uid } = await connectRT();
  return rt.onValue(rt.ref(db, `squadlobby/${squadRoomKey(squadKey)}`), (snap) => {
    const now = serverNow();
    const rooms = [];
    for (const [kind, d] of Object.entries(snap.val() ?? {})) {
      if (!d || typeof d !== 'object' || closed(d, now)) continue;
      const players = Object.entries(d.players ?? {})
        .map(([id, p]) => ({ uid: id, name: p?.name ?? '?', at: p?.at ?? 0, me: id === uid }))
        .sort((a, b) => a.at - b.at);
      if (!players.length) continue;
      rooms.push({ kind, host: players[0].name, players, full: players.length >= MAX_PLAYERS, mine: players.some((p) => p.me), at: players[0].at });
    }
    onChange(rooms.sort((a, b) => a.at - b.at));
  });
}

/** The field events: three rounds, each its own stage. */
export const FIELD = new Set(['longjump', 'polevault', 'javelin']);

/** True if `a` would clash with `b` in one update (one path inside the other). */
const clash = (a, b) => a !== b && (a.startsWith(`${b}/`) || b.startsWith(`${a}/`));

/**
 * One room's play, from the waiting room closing to the end of the event or
 * tournament: your updates out, everyone else's in, and when each stage starts.
 * `info` = { kind, room, uid, name, players, startAt, setLen, squad } from the waiting
 * room (`squad`: { key, name } for a squad's practice), and `first` = the event it starts with.
 */
export class LiveSession {
  constructor(info, first) {
    Object.assign(this, info);
    this.first = first;
    this.others = info.players.filter((p) => p.uid !== info.uid);
    this.docs = new Map(); // uid -> their latest doc
    this.listeners = new Set();
    this.batches = []; // updates waiting to go out, in order
    this.lastSent = 0;
    this.readyAt = {}; // stage -> when you said you were ready (server ms)
    this.step = 0; // which event of the room this is (a tournament has five)
    this.starts = new Map([[this.eventStage(first), info.startAt]]); // stage -> start (server ms), once known
    this.done = false; // played to the end: leaving now isn't leaving early
    const me = info.players.find((p) => p.uid === info.uid);
    this.send({ v: 2, name: info.name ?? '', athlete: me?.athlete ?? '', ...(me?.lineup ? { lineup: me.lineup } : {}) }, true);
  }

  async open() {
    const { rt, db, uid } = await connectRT();
    if (this.closed) return;
    Object.assign(this, { rt, db, uid });
    this.ref = rt.ref(db, `live/${this.room}/${uid}`);
    // Your phone drops off: the others see you've left.
    this.gone = rt.onDisconnect(this.ref);
    this.gone.update({ left: true });
    this.stop = rt.onValue(rt.ref(db, `live/${this.room}`), (snap) => {
      for (const [id, doc] of Object.entries(snap.val() ?? {})) {
        if (id === uid || !doc || typeof doc !== 'object') continue;
        this.docs.set(id, doc);
        for (const fn of this.listeners) fn(id, doc);
      }
    });
    this.flush();
  }

  /** Calls `fn(uid, doc)` with each other player's latest doc, now and on every change. Returns a function that stops it. */
  listen(fn) {
    this.listeners.add(fn);
    for (const [id, doc] of this.docs) fn(id, doc);
    return () => this.listeners.delete(fn);
  }

  /** True if that player has left (or their phone dropped off). */
  left(uid) {
    return !!this.docs.get(uid)?.left;
  }

  /** A stage's key: this event of the room, and the round for a field event. */
  stage(evId, round = 0) {
    return `${this.step}-${evId}${round ? `-${round}` : ''}`;
  }

  /** The stage an event starts with (of event `step` of the room: this one unless given). */
  eventStage(evId, step = this.step) {
    return `${step}-${evId}${FIELD.has(evId) ? '-1' : ''}`;
  }

  /** How long GET SET lasts before the gun of a race stage: the waiting room's for the first, then random but the same on every phone. */
  setLenFor(stage) {
    if (stage === this.eventStage(this.first, 0) && this.setLen != null) return this.setLen;
    let h = 0;
    for (const c of `${this.room}/${stage}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return 1.1 + (h % 1000) / 1000 * 1.2;
  }

  /** You're ready for `stage`. */
  ready(stage) {
    if (this.readyAt[stage] != null) return;
    this.readyAt[stage] = Math.round(serverNow());
    this.send({ [`ready/${stage}`]: this.readyAt[stage] }, true);
  }

  /**
   * When `stage` starts (server ms): a little after everyone still here is
   * ready for it (ROUND_LEAD for a field event's later rounds, EVENT_LEAD for
   * an event), or after READY_WAIT if someone isn't. Null until that's known.
   * Every phone works out the same time from the same ready times.
   */
  startOf(stage) {
    if (this.starts.has(stage)) return this.starts.get(stage);
    const mine = this.readyAt[stage];
    if (mine == null) return null;
    const times = [mine];
    let missing = 0;
    for (const p of this.others) {
      const d = this.docs.get(p.uid);
      if (d?.left) continue;
      const t = d?.ready?.[stage];
      if (Number.isFinite(t)) times.push(t);
      else missing++;
    }
    const first = Math.min(...times);
    let at;
    if (!missing) at = Math.max(...times);
    else if (serverNow() >= first + READY_WAIT) at = first + READY_WAIT;
    else return null;
    const start = at + (/-[2-9]$/.test(stage) ? ROUND_LEAD : EVENT_LEAD);
    this.starts.set(stage, start);
    return start;
  }

  /** The other players still here who aren't ready for `stage` yet. */
  waitingFor(stage) {
    return this.others.filter((p) => !this.left(p.uid) && !Number.isFinite(this.docs.get(p.uid)?.ready?.[stage]));
  }

  /** You've started `stage` at `t0` (server ms): what you send from now on is for it. */
  begin(stage, t0) {
    this.send({ s: stage, t0: Math.round(t0), run: null, n: null, done: null, f: null }, true);
  }

  /** Your result for `stage`: { mark } or { foul } / { fail } / { status: 'dnf' }. */
  result(stage, r) {
    this.send({ [`res/${stage}`]: r }, true);
  }

  /**
   * Queues an update to your doc (`patch` = { path: value }, null deletes).
   * Updates go out at most every SEND_EVERY ms, merged, in order; `now` sends at once.
   */
  send(patch, now = false) {
    let b = this.batches[this.batches.length - 1];
    if (!b || Object.keys(patch).some((k) => Object.keys(b).some((j) => clash(k, j)))) this.batches.push((b = {}));
    Object.assign(b, patch);
    if (now) this.urgent = true;
    this.flush();
  }

  flush() {
    if (!this.ref || this.closed || !this.batches.length) return;
    const wait = this.urgent ? 0 : this.lastSent + SEND_EVERY - Date.now();
    if (wait > 0) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), wait);
      return;
    }
    // The database keeps one phone's writes in order, so they can all go now.
    while (this.batches.length) this.rt.update(this.ref, this.batches.shift()).catch((err) => console.warn('live update failed', err));
    this.urgent = false;
    this.lastSent = Date.now();
  }

  /** Stops listening. Unless you played to the end, the others see you've left. */
  end() {
    if (this.closed) return;
    if (!this.done) {
      this.batches = [];
      this.send({ left: true }, true);
    } else this.send({ b: null }, true); // off the others' late hits (brawl/liveBrawl.js)
    this.closed = true;
    clearTimeout(this.timer);
    this.stop?.();
    this.listeners.clear();
    if (this.done) this.gone?.cancel(); // nothing to say if the phone drops off now
  }
}

// The room being played, from the waiting room closing until you leave it.
let current = null;

/** Starts a room's play (see LiveSession) and makes it the current one. */
export function startLive(info, first) {
  endLive();
  current = new LiveSession(info, first);
  current.open().catch((err) => console.warn('live room unavailable', err));
  return current;
}

export function currentLive() {
  return current;
}

/** Leaves the current room, if any. */
export function endLive() {
  current?.end();
  current = null;
}
