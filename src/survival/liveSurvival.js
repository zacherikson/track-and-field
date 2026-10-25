import { CONFIG } from '../config.js';
import { points } from '../events/scoring.js';
import { seededRandom } from '../core/random.js';
import { EVENT_IDS } from './survival.js';

/**
 * LIVE SURVIVAL: up to ten people (online/liveRules.js), the five events in a
 * random order, again and again. Whoever comes last in an event is out; the
 * last one standing wins.
 *
 * Every phone works out the same thing from the same data, with nobody in
 * charge: the order of the events is seeded with the room (a new shuffle every
 * five), and who's out comes from everyone's results for the event (their
 * `res/{stage}` docs, online/live.js), compared to the hundredth.
 *
 * - LAST PLACE IS OUT, every player tied for it too. Unless that's everyone
 *   still in: then nobody is, and the event doesn't count.
 * - No mark (a DNF, three fouls) is last.
 * - LEAVING IS OUT: a player whose phone drops off (the server says `left`)
 *   before they have a result is out, and stays out if it comes back. So is
 *   one whose result never comes (GIVE_UP).
 *
 * Points add up as in a tournament (scoring.js), for every player, but nobody
 * is shown them (`totals`). Your XP comes from each race you finish, as
 * everywhere (flow.results, online/xp.js).
 *
 * The players who are out keep the room open to watch (survival/liveSurvivalScene.js):
 * `decide` keeps settling each event as the results come in, on their phone
 * too, until there's a winner.
 */

const LOWER = new Set(['sprint100', 'hurdles110']); // times: lower is better
const ROUNDS = { longjump: CONFIG.longJump.rounds, polevault: CONFIG.poleVault.rounds, javelin: CONFIG.javelin.rounds };
export const GIVE_UP = 90000; // ms of waiting for someone's result before they count as gone

/** Live survival's event order for its `round` (1, 2, ...) in room `room`: the same on every phone. */
export function orderFor(room, round) {
  const rng = seededRandom(`${room}/survival/${round}`);
  const a = [...EVENT_IDS];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The event `step` (0, 1, ...) of room `room`. */
export function eventAt(room, step) {
  return orderFor(room, Math.floor(step / EVENT_IDS.length) + 1)[step % EVENT_IDS.length];
}

const round2 = (v) => Math.round(v * 100) / 100;

/**
 * A player's result for event `evId` at `step` from their `res` docs (stage
 * -> { mark } | { foul } | { fail } | { status }): { mark, status }, or null
 * while it isn't all in. A field event: the best of its rounds, once all of
 * them are in.
 */
export function resultFrom(res, step, evId) {
  if (!res || typeof res !== 'object') return null;
  const rounds = ROUNDS[evId];
  if (!rounds) {
    const r = res[`${step}-${evId}`];
    if (!r || typeof r !== 'object') return null;
    return Number.isFinite(r.mark) ? { mark: round2(r.mark), status: 'ok' } : { mark: null, status: 'dnf' };
  }
  let best = null;
  for (let k = 1; k <= rounds; k++) {
    const r = res[`${step}-${evId}-${k}`];
    if (!r || typeof r !== 'object') return null;
    if (Number.isFinite(r.mark) && (best == null || r.mark > best)) best = r.mark;
  }
  return best == null ? { mark: null, status: 'nm' } : { mark: round2(best), status: 'ok' };
}

/**
 * Who's out of an event: `field` = [{ uid, result }] for everyone still in,
 * `result` null if they left (or never sent one). Returns { ranked (best
 * first, each with `place`), knocked (last place), gone (no result), void
 * (nobody out: they all tied) }.
 */
export function settle(evId, field) {
  const lower = LOWER.has(evId);
  // A score where lower is worse for everyone: no mark is the worst there is.
  const score = (r) => (r.status !== 'ok' || r.mark == null ? -Infinity : lower ? -r.mark : r.mark);
  const ranked = field.filter((f) => f.result).sort((a, b) => score(b.result) - score(a.result));
  ranked.forEach((f, i) => (f.place = i && score(f.result) === score(ranked[i - 1].result) ? ranked[i - 1].place : i + 1));
  const gone = field.filter((f) => !f.result);
  const worst = ranked.length ? score(ranked[ranked.length - 1].result) : null;
  const last = ranked.filter((f) => score(f.result) === worst);
  const knocked = last.length < ranked.length ? last : []; // all tied: nobody
  return { ranked, knocked, gone, void: !knocked.length && !gone.length };
}

export const liveSurvival = {
  active: false,
  live: null, // the room (online/live.js LiveSession)
  players: new Map(), // uid -> { uid, name, athlete, me }
  alive: new Set(), // uids still in
  out: [], // { uid, step, place } in the order they went out
  history: [], // per event: { step, evId, rows, out: [uid], void }
  totals: new Map(), // uid -> points (not shown)
  step: 0, // events settled so far: the one being played or waited on
  gone: new Set(), // uids whose phone dropped off while they were still in
  over: false,
  winner: null, // uid, once there's one left (null if nobody is)
  waitSince: null, // ms this phone began waiting on this step's results

  /** A new game in `session`. */
  start(session) {
    this.active = true;
    this.live = session;
    this.players = new Map(session.players.map((p) => [p.uid, { uid: p.uid, name: p.name, athlete: p.athlete, me: p.uid === session.uid }]));
    this.alive = new Set(this.players.keys());
    Object.assign(this, { out: [], history: [], totals: new Map(), step: 0, gone: new Set(), over: false, winner: null, waitSince: null });
    this.unlisten = session.listen((uid, doc) => {
      if (doc.left && this.alive.has(uid) && !this.over) this.gone.add(uid);
    });
  },

  end() {
    this.unlisten?.();
    this.unlisten = null;
    this.active = false;
    this.live = null;
  },

  get uid() {
    return this.live?.uid;
  },

  /** The event being played (or the one about to be). */
  get eventId() {
    return eventAt(this.live.room, this.step);
  },

  eventAt(step) {
    return eventAt(this.live.room, step);
  },

  get meIn() {
    return this.alive.has(this.uid);
  },

  /** The ones still in, by name. */
  get standing() {
    return [...this.alive].map((uid) => this.players.get(uid));
  },

  /** `uid`'s result for this step, or null while it's not all in. */
  resultOf(uid) {
    const res = uid === this.uid ? this.live.mine : this.live.docs.get(uid)?.res;
    return resultFrom(res, this.step, this.eventId);
  },

  /** The players still in whose result for this step hasn't come yet (and who haven't gone). */
  pending() {
    return [...this.alive].filter((uid) => !this.resultOf(uid) && !this.gone.has(uid)).map((uid) => this.players.get(uid));
  },

  /**
   * Settles this step once everyone still in has a result for it (or has
   * gone, or GIVE_UP has passed): who's out, the points, a winner if there's
   * one left. Then on to the next step. Returns its history entry, or null if
   * it's still waiting. `now`: ms (server clock).
   */
  decide(now) {
    if (this.over || !this.live) return null;
    const evId = this.eventId;
    this.waitSince ??= now;
    const field = [...this.alive].map((uid) => ({ uid, result: this.gone.has(uid) ? null : this.resultOf(uid) }));
    if (field.some((f) => !f.result && !this.gone.has(f.uid)) && now - this.waitSince < GIVE_UP) return null;
    const { ranked, knocked, gone, void: none } = settle(evId, field);
    for (const f of ranked) this.totals.set(f.uid, (this.totals.get(f.uid) ?? 0) + points(evId, f.result.mark, f.result.status));
    const leaving = [...knocked, ...gone];
    for (const f of leaving) this.alive.delete(f.uid);
    const left = this.alive.size;
    for (const f of knocked) this.out.push({ uid: f.uid, step: this.step, place: left + 1 });
    for (const f of gone) this.out.push({ uid: f.uid, step: this.step, place: left + knocked.length + 1, left: true });
    const outSet = new Set(leaving.map((f) => f.uid));
    const rows = [...ranked, ...gone].map((f) => ({ ...this.players.get(f.uid), uid: f.uid, place: f.place ?? null, mark: f.result?.mark ?? null, status: f.result?.status ?? 'left', out: outSet.has(f.uid), left: !f.result }));
    const entry = { step: this.step, evId, rows, out: [...outSet], void: none };
    this.history.push(entry);
    if (left <= 1) {
      this.over = true;
      this.winner = left ? [...this.alive][0] : null;
    }
    // The others' phones only wait for (and race) the ones still in.
    this.live.others = this.live.others.filter((p) => this.alive.has(p.uid));
    this.step++;
    this.waitSince = null;
    return entry;
  },

  /** Settles every step whose results are all in (an eliminated phone, watching). Returns the entries settled. */
  catchUp(now) {
    const out = [];
    for (let e; (e = this.decide(now)); ) out.push(e);
    return out;
  },

  /** Where `uid` finished: 1 for the winner, else their place when they went out (null while still in). */
  placeOf(uid) {
    if (this.over && this.winner === uid) return 1;
    return this.out.find((o) => o.uid === uid)?.place ?? null;
  },
};
