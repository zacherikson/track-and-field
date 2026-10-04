import { getPlayerName } from '../core/storage.js';
import { applyPatch } from '../meet/protocol.js';
import { Conn, meetServer } from './net.js';
import { MAX_PLAYERS, CLOSE_BEFORE } from './liveRules.js';

export { MAX_PLAYERS, CLOSE_BEFORE };

/**
 * LIVE: a waiting room, then an event (or a whole tournament) against the other
 * people in it.
 *
 * It runs on the meet server (server/, a WebSocket; online/net.js):
 *   /lobby/public        the public waiting rooms (server/src/lobbyCore.js)
 *   /squad/<key>         a squad's PRACTICE waiting rooms, on its SquadHub,
 *                        which lists them on its members' Squad tabs (`rooms`)
 *   /room/<id>           one room's play (server/src/roomCore.js)
 *
 * `kind` is an event id or 'tournament' (tournament.js TOURNAMENT_KIND).
 * Whoever is in a kind's waiting room plays together. When a second player
 * arrives the server sets a start time (`startAt`, server clock, ms) a few
 * seconds ahead; everyone starts then. CLOSE_BEFORE that the room closes: the
 * next player to arrive starts a new one.
 *
 * In the room each player has a DOC, { v, name, athlete, left, s, t0, run, n,
 * done, f, res, ready, b, h }, which they patch and the server passes on (as in
 * a meet). Play is split into STAGES: a race, or one round of a field event; a
 * tournament has one stage per race and per round. `s` is the stage you're on
 * and `t0` when it started (server ms). While it runs your phone sends what the
 * others need to draw you:
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
 * hit (brawl/liveBrawl.js). `left`: your socket closed before the end (the
 * server says so for you), until it's back.
 */
const SEND_EVERY = 100; // ms between updates during a stage
const READY_WAIT = 20000; // ms after the first player is ready for a stage that it starts without the others
const ROUND_LEAD = 6000; // ms from everyone finishing a field-event round to the next one starting (a look at the marks first)
export const EVENT_LEAD = 22000; // ms from everyone finishing a tournament event to the next one's start (standings and late hits, then its title card)
const HANDOVER = 3000; // ms the waiting room's socket stays open after you go to the event, so the server has closed the room with you in it

let clockConn = null; // the live socket whose clock is the server's (the waiting room's, then the room's)
let clock = null; // a meet's clock, while one is on (setClock)
export const serverNow = () => (clock ? clock() : clockConn ? clockConn.now() : Date.now());

/** A squad meet (meet/meet.js) runs on the meet server's clock: `fn` () => ms, or null to go back to live play's. */
export function setClock(fn) {
  clock = fn;
}

/** Where a waiting room lives: the public ones, or squad `squad`'s Practice ({ key }). */
const lobbyPath = (squad) => (squad ? `/squad/${encodeURIComponent(squad.key)}` : '/lobby/public');

/**
 * The waiting room for one event, or a tournament (`kind`). `onChange(view)` gets
 * { room, players: [{ uid, name, athlete, me }], startAt, setLen, closed, uid } whenever it changes.
 * `who` = the athlete you play as: { athlete } (a character id). `squad` ({ key, name }): that
 * squad's Practice room instead of a public one.
 */
export class Lobby {
  constructor(kind, onChange, who, squad = null) {
    this.kind = kind;
    this.onChange = onChange;
    this.who = who;
    this.squad = squad;
    this.data = null;
  }

  /** Resolves once you're in the waiting room; rejects if the server won't have you. */
  join() {
    if (!meetServer()) return Promise.reject(new Error('no live server'));
    return new Promise((resolve, reject) => {
      this.conn = new Conn(
        lobbyPath(this.squad),
        {
          message: (m) => {
            if (m.t !== 'waiting') return;
            this.data = m;
            resolve();
            this.onChange(this.view());
          },
          status: (s) => {
            if (s === 'open') this.conn.send({ t: 'join', kind: this.kind, name: getPlayerName(), ...this.who }); // again after a reconnect
            if (s === 'denied' || s === 'reload') reject(new Error(s));
          },
        },
        { squadName: this.squad?.name },
      );
      clockConn = this.conn;
    });
  }

  view() {
    const d = this.data;
    const uid = this.conn?.uid ?? null;
    const players = (d?.players ?? []).map((p) => ({ uid: p.uid, name: p.name, athlete: p.athlete || null, at: p.at, me: p.uid === uid }));
    const closed = !!d?.closed || (d?.startAt != null && serverNow() > d.startAt - CLOSE_BEFORE);
    return { room: d?.room ?? null, players, startAt: d?.startAt ?? null, setLen: d?.setLen ?? null, closed, uid };
  }

  /** Stops listening. `leave` also takes you out of the room; otherwise (going to the event) the socket stays a moment, so the room closes with you in it. */
  close(leave = true) {
    const conn = this.conn;
    if (!conn) return;
    if (leave) {
      conn.send({ t: 'leave' });
      conn.close();
    } else setTimeout(() => conn.close(), HANDOVER);
  }
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
    this.docs = new Map(); // uid -> their doc, as patched
    this.listeners = new Set();
    this.batches = []; // updates waiting to go out, in order
    this.lastSent = 0;
    this.readyAt = {}; // stage -> when you said you were ready (server ms)
    this.step = 0; // which event of the room this is (a tournament has five)
    this.starts = new Map([[this.eventStage(first), info.startAt]]); // stage -> start (server ms), once known
    this.done = false; // played to the end: leaving now isn't leaving early
    const me = info.players.find((p) => p.uid === info.uid);
    this.send({ v: 2, name: info.name ?? '', athlete: me?.athlete ?? '' }, true);
  }

  /** Connects to the room's play on the server; it says `left` for you if your phone drops off. */
  open() {
    const prev = clockConn;
    this.conn = new Conn(`/room/${this.room}`, {
      message: (m) => {
        if (m.t === 'docs') for (const [id, doc] of Object.entries(m.docs ?? {})) this.update(id, () => doc);
        else if (m.t === 'doc') this.update(m.u, (doc) => applyPatch(doc, m.p));
      },
      status: (s) => s === 'open' && this.flush(),
    });
    this.conn.adoptClock(prev); // the waiting room's clock until this one has its own
    clockConn = this.conn;
  }

  /** Player `id`'s doc changed (`change(doc)` returns the new one). */
  update(id, change) {
    if (id === this.uid) return;
    const doc = change(this.docs.get(id) ?? {});
    if (!doc || typeof doc !== 'object') return;
    this.docs.set(id, doc);
    for (const fn of this.listeners) fn(id, doc);
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

  /** What every phone seeds `stage`'s buttons with (core/random.js liveRandom). */
  seedOf(stage) {
    return `${this.room}/${stage}`;
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
    if (!this.conn || this.closed || !this.batches.length) return;
    const wait = this.urgent ? 0 : this.lastSent + SEND_EVERY - Date.now();
    if (wait > 0) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), wait);
      return;
    }
    // The socket keeps them in order (and holds them while it's reconnecting).
    while (this.batches.length) this.conn.send({ t: 'patch', p: this.batches.shift() });
    this.urgent = false;
    this.lastSent = Date.now();
  }

  /** Stops listening. Unless you played to the end, the others see you've left (the server says so as the socket closes). */
  end() {
    if (this.closed) return;
    if (this.done) {
      this.conn?.send({ t: 'finished' }); // nothing to say when the socket closes
      this.send({ b: null }, true); // off the others' late hits (brawl/liveBrawl.js)
    }
    this.closed = true;
    clearTimeout(this.timer);
    this.listeners.clear();
    this.conn?.close();
  }
}

// The room being played, from the waiting room closing until you leave it.
let current = null;

/** Starts a room's play (see LiveSession) and makes it the current one. */
export function startLive(info, first) {
  endLive();
  current = new LiveSession(info, first);
  current.open();
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
