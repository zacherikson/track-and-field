import { CONFIG } from '../config.js';
import { points } from '../events/scoring.js';

/**
 * SURVIVAL MODE, as in the original: you against one computer rival. A round
 * is the five events in a random order; win all five and a new round starts,
 * the rival a little better (and under a new name). Lose any event and it's
 * over. Every event scores decathlon points (scoring.js), added up across the
 * whole run: your total goes on the Survival leaderboard (registry.js
 * SURVIVAL_BOARD).
 *
 * Beating him: a better mark (lower time, longer jump or throw, your best of
 * the attempts against his). The same mark to the hundredth is a tie, and a
 * tie keeps you in. No mark (a DNF, three fouls) loses, unless he has none
 * either.
 *
 * His skill (`skill`, CONFIG.survival): 0 is the Amateur rivals', 1 the Pro
 * ones', and the events blend every rival setting between the two, or carry
 * on past either end (aiLevel, blend).
 *
 * This module only imports leaf modules (config, scoring), so storage.js and
 * the events can ask it whether a run is on without an import loop.
 */

/** The five, in the tournament's order (a round shuffles them). */
export const EVENT_IDS = ['sprint100', 'longjump', 'hurdles110', 'polevault', 'javelin'];

/**
 * The rival's look: a native South American runner, shirtless (his "shirt" is
 * his skin), in green shorts, long black hair under a red headband. A new
 * first name each round.
 */
export const RIVAL_COLORS = { shirt: '#8A5A3B', skin: '#8A5A3B', shorts: '#2E8B3E', hair: '#121212', style: 'long', band: '#D32020', height: 1.04 };

export const RIVAL_NAMES = [
  'Ivan', 'Dmitri', 'Sergei', 'Alexei', 'Nikolai', 'Vladimir', 'Mikhail', 'Yuri', 'Boris', 'Pavel',
  'Andrei', 'Viktor', 'Oleg', 'Igor', 'Maxim', 'Anatoly', 'Konstantin', 'Fyodor', 'Gennady', 'Leonid',
  'Stanislav', 'Vasily', 'Grigory', 'Arkady', 'Ruslan', 'Kirill', 'Roman', 'Artyom', 'Yevgeny', 'Valentin',
  'Stepan', 'Lev', 'Gleb', 'Timofei', 'Matvei', 'Yaroslav', 'Vadim', 'Pyotr', 'Semyon', 'Zakhar',
];

/** The rival's skill in round `round` (1, 2, ...): see CONFIG.survival. */
export function skillFor(round) {
  const { skill, ceiling, climb } = CONFIG.survival;
  if (round <= skill.length) return skill[Math.max(1, round) - 1];
  const last = skill[skill.length - 1];
  return ceiling - (ceiling - last) * (1 - climb) ** (round - skill.length);
}

/**
 * A rival setting `skill` of the way from its Amateur value `a` to its Pro
 * value `p` (carried on past either end). Numbers and [lo, hi] ranges blend;
 * a number never crosses zero (an error shrinks to none, never flips side);
 * a range stays lo <= hi; anything else (a flag) is Amateur's below halfway
 * and Pro's after.
 */
export function blend(a, p, skill) {
  if (typeof a === 'number' && typeof p === 'number') {
    const v = a * (1 - skill) + p * skill; // exactly a at 0 and p at 1
    if (a >= 0 && p >= 0) return Math.max(0, v);
    if (a <= 0 && p <= 0) return Math.min(0, v);
    return v;
  }
  if (Array.isArray(a) && Array.isArray(p) && a.length === p.length) {
    const out = a.map((x, i) => blend(x, p[i], skill));
    if (out.length === 2 && out[0] > out[1]) out.reverse();
    return out;
  }
  if (a && p && typeof a === 'object' && typeof p === 'object') {
    const out = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(p)])) out[k] = k in a && k in p ? blend(a[k], p[k], skill) : a[k] ?? p[k];
    return out;
  }
  return skill < 0.5 ? a : p;
}

/**
 * The rival settings an event should use from `table` ({ amateur, pro }, as
 * CONFIG.ai and every event's cfg.ai): in a survival run, blended to the
 * rival's skill; else the `level` named (the campaign's).
 */
export function aiLevel(table, level) {
  if (!survival.active || !table?.amateur || !table?.pro) return table?.[level];
  return blend(table.amateur, table.pro, survival.skill);
}

/** Did your mark beat (or tie) his? Each is { mark, status }. */
export function survives(ev, me, him) {
  const mine = me?.status === 'ok' && me.mark != null;
  const his = him?.status === 'ok' && him.mark != null;
  if (!mine) return !his; // no mark: out, unless he has none either
  if (!his) return true;
  return ev.lowerIsBetter ? me.mark <= him.mark : me.mark >= him.mark;
}

function shuffled(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const survival = {
  active: false,
  round: 1, // 1, 2, ...
  index: 0, // which of this round's five is next / being played
  order: [], // this round's event ids
  total: 0, // points so far, every event of every round
  won: 0, // events won (or tied)
  history: [], // per event: { round, ev, me, him, pts, hisPts, survived }
  over: false,
  names: [], // the rival's names for this run, a new one each round
  rng: Math.random,

  /** A new run. `rng` (like Math.random) for the event order and the names. */
  start(rng = Math.random) {
    Object.assign(this, { active: true, round: 1, index: 0, total: 0, won: 0, history: [], over: false, rng });
    this.names = shuffled(RIVAL_NAMES, rng);
    this.order = shuffled(EVENT_IDS, rng);
  },

  end() {
    this.active = false;
  },

  get skill() {
    return skillFor(this.round);
  },

  /** This round's rival: always the same athlete, a new first name each round. */
  get rival() {
    const name = this.names[(this.round - 1) % this.names.length] ?? RIVAL_NAMES[0];
    return { id: 'survival-rival', name, tagline: 'Your rival in Survival.', colors: RIVAL_COLORS };
  },

  get eventId() {
    return this.order[this.index];
  },

  /** The event after this one: the next in the round, or the first of the next round (not known yet: null). */
  get nextEventId() {
    return this.index + 1 < this.order.length ? this.order[this.index + 1] : null;
  },

  get lastOfRound() {
    return this.index === this.order.length - 1;
  },

  /**
   * An event's results in: score them, add yours to the total, and see if
   * you're still in. Returns this event's entry for history.
   */
  record(ev, results) {
    const me = results.find((r) => r.isPlayer);
    const him = results.find((r) => !r.isPlayer && !r.ghost);
    const pts = points(ev.id, me?.mark, me?.status);
    const hisPts = points(ev.id, him?.mark, him?.status);
    const survived = survives(ev, me, him);
    const entry = { round: this.round, ev, me, him, pts, hisPts, survived };
    this.history.push(entry);
    this.total += pts;
    if (survived) this.won++;
    else this.over = true;
    return entry;
  },

  /** On to the next event (a new round after the fifth: a new order, a better rival with a new name). */
  advance() {
    if (this.index + 1 < this.order.length) {
      this.index++;
      return;
    }
    this.round++;
    this.index = 0;
    this.order = shuffled(EVENT_IDS, this.rng);
  },

  /** Rounds won outright (all five events). */
  get roundsSurvived() {
    return this.round - 1;
  },
};
