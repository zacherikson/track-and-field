import { CONFIG } from '../config.js';
import { MEDALS } from './wallet.js';

/**
 * CONTRACTS (the design doc's "Contracts"): pure rules, shared by the meet
 * server (which alone keeps them: server/src/firestoreAdmin.js, api.js) and the
 * game (which shows them: online/contracts.js, scenes/home/contractPanel.js (the Contract tab)).
 *
 * - Offers: beat a campaign's tournament for its contract (High School: the
 *   Scholarship, Collegiate: an NIL deal, Pro: a Pro contract, which also needs
 *   medals from live races). How good the offer is (Rookie, Starter, Star) comes
 *   from your medals and from the contract's qualifying standards your best
 *   marks meet. Offers are only ever better than what you have; signing one
 *   replaces it, with a signing bonus.
 * - Pay: collected once a day when you open the game; a day you don't is lost.
 *   Days end at your own midnight (`tz`, which can change once every few days).
 * - One clause, checked each week from the day you signed: race `clauseRaces`
 *   times (any race but Training). Miss it: probation, at a pay cut. Meet it
 *   and full pay is back; miss it again and the contract is gone.
 * - Lost it: offers come back after `requalify` top-3 finishes.
 * There are no scheduled jobs: whenever the server touches a contract, it first
 * catches up on the weeks gone by (advance).
 *
 * A contract as stored (contracts/{uid}):
 *   { tier: '' | TIER id, grade, pay, status: '' | 'active' | 'probation',
 *     start: day signed, week: the clause week we're in, races: this week's,
 *     paid: last day paid, tz: minutes behind UTC (Date#getTimezoneOffset), tzDay: when it last changed,
 *     lost: '' | the tier lost, lostDay, requal: top-3 finishes since }
 * Days are whole days since 1970 at the player's own midnight (localDay).
 */
export const TIERS = [
  { id: 'scholarship', name: 'Scholarship', level: 'highschool', levelName: 'High School' },
  { id: 'nil', name: 'NIL deal', level: 'amateur', levelName: 'Collegiate' }, // 'amateur': Collegiate's save key
  { id: 'pro', name: 'Pro contract', level: 'pro', levelName: 'Pro' },
];
export const STANDARD_EVENTS = ['sprint100', 'hurdles110', 'longjump', 'polevault', 'javelin'];
const LOWER_IS_BETTER = new Set(['sprint100', 'hurdles110']);
const MEDAL_POINTS = { gold: 6, silver: 3, bronze: 2 }; // 1 gold = 2 silver = 3 bronze
const DAY = 864e5;

const K = () => CONFIG.economy.contracts;
export const tierOf = (id) => TIERS.find((t) => t.id === id) ?? null;

/** Your day (days since 1970, ending at your midnight) at time `now`, `tz` minutes behind UTC. */
export function localDay(now, tz = 0) {
  return Math.floor((now - tz * 60000) / DAY);
}

export function emptyContract() {
  return { tier: '', grade: 0, pay: 0, status: '', start: 0, week: 0, races: 0, paid: -1, tz: 0, tzDay: -1, lost: '', lostDay: -1, requal: 0 };
}

const int = (v, min, max, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : d;
};

/** A contract as stored, whatever was read (null: none yet). */
export function cleanContract(raw) {
  const c = emptyContract();
  if (!raw) return c;
  c.tier = tierOf(raw.tier) ? raw.tier : '';
  c.status = c.tier ? (raw.status === 'probation' ? 'probation' : 'active') : '';
  c.grade = c.tier ? int(raw.grade, 0, K().grades.length - 1, 0) : 0;
  c.pay = c.tier ? int(raw.pay, 0, 1e9, 0) : 0;
  c.start = int(raw.start, 0, 1e7, 0);
  c.week = int(raw.week, 0, 1e6, 0);
  c.races = int(raw.races, 0, 1e6, 0);
  c.paid = int(raw.paid, -1, 1e7, -1);
  c.tz = int(raw.tz, -840, 840, 0);
  c.tzDay = int(raw.tzDay, -1, 1e7, -1);
  c.lost = !c.tier && tierOf(raw.lost) ? raw.lost : '';
  c.lostDay = c.lost ? int(raw.lostDay, -1, 1e7, -1) : -1;
  c.requal = c.lost ? int(raw.requal, 0, 1e6, 0) : 0;
  return c;
}

/** Your time zone (minutes behind UTC): taken if it's new and the last change was `zoneEvery` days ago or more (or never). */
export function setZone(contract, tz, day) {
  const c = { ...contract };
  if (!Number.isInteger(tz) || tz < -840 || tz > 840 || tz === c.tz) return c;
  if (c.tzDay >= 0 && day - c.tzDay < K().zoneEvery) return c;
  c.tz = tz;
  c.tzDay = day;
  return c;
}

/**
 * Catches up on the clause weeks that have ended by `day`: each one met or
 * missed. Returns { contract, news: ['probation' | 'restored' | 'lost'] }.
 */
export function advance(contract, day) {
  const c = { ...contract };
  const news = [];
  const now = Math.floor((day - c.start) / 7);
  while (c.tier && c.week < now) {
    if (c.races >= K().clauseRaces) {
      if (c.status === 'probation') {
        c.status = 'active';
        news.push('restored');
      }
    } else if (c.status === 'active') {
      c.status = 'probation';
      news.push('probation');
    } else {
      Object.assign(c, { lost: c.tier, lostDay: c.start + 7 * (c.week + 1), requal: 0, tier: '', grade: 0, pay: 0, status: '', races: 0 });
      news.push('lost');
      break;
    }
    c.week++;
    c.races = 0;
  }
  return { contract: c, news };
}

/** What a day pays now: the contract's pay, less the cut on probation. */
export function payToday(c) {
  if (!c.tier) return 0;
  return c.status === 'probation' ? Math.round(c.pay * (1 - K().probationCut)) : c.pay;
}

/** Today's pay, if it isn't collected yet: { contract, amount, news }. */
export function collect(contract, day) {
  const { contract: c, news } = advance(contract, day);
  if (!c.tier || c.paid >= day) return { contract: c, amount: 0, news };
  c.paid = day;
  return { contract: c, amount: payToday(c), news };
}

/**
 * Races finished on `day` (one per place: 1, 2, ..., or 0 for a race with no
 * place): they count toward the week's clause, or, with the contract lost,
 * the top-3 ones toward new offers. { contract, news }.
 */
export function countRaces(contract, day, places) {
  const { contract: c, news } = advance(contract, day);
  if (c.tier) c.races += places.length;
  else if (c.lost) c.requal += places.filter((p) => p >= 1 && p <= 3).length;
  return { contract: c, news };
}

/** Medal points: gold 6, silver 3, bronze 2. */
export function medalPoints(wallet) {
  return MEDALS.reduce((sum, m) => sum + MEDAL_POINTS[m] * (Number(wallet?.[m]) || 0), 0);
}

/** Your best mark on a board, from your progress's top lists (null if none). */
function bestOf(top, eventId) {
  const marks = (Array.isArray(top?.[eventId]) ? top[eventId] : []).map((e) => Number(e?.mark)).filter((m) => Number.isFinite(m) && m > 0);
  if (!marks.length) return null;
  return LOWER_IS_BETTER.has(eventId) ? Math.min(...marks) : Math.max(...marks);
}

/** Which of a contract's qualifying standards your best marks meet: [eventId]. */
export function standardsMet(tierId, top) {
  const std = K().standards[tierId] ?? {};
  return STANDARD_EVENTS.filter((id) => {
    const best = bestOf(top, id);
    if (best == null || std[id] == null) return false;
    return LOWER_IS_BETTER.has(id) ? best <= std[id] : best >= std[id];
  });
}

/** The grade (index into CONFIG grades) `points` earn. */
export function gradeOf(points) {
  let g = 0;
  K().grades.forEach((grade, i) => points >= grade.points && (g = i));
  return g;
}

/** A contract's daily pay at a grade (rounded to 10). */
export function payOf(tierId, grade) {
  return Math.round((K().pay[tierId] * K().grades[grade].pay) / 10) * 10;
}

/**
 * The offers open to you: [{ tier, grade, pay, met: [eventId], points }], best last.
 * `progress` = your account's progress ({ beaten, top }: online/progress.js),
 * `wallet` = yours (its medals). Only offers that pay more than what you have.
 */
export function offers({ contract, progress, wallet }) {
  const c = cleanContract(contract);
  if (c.lost && c.requal < K().requalify) return [];
  const medals = medalPoints(wallet);
  const out = [];
  for (const t of TIERS) {
    if (!progress?.beaten?.[t.level]?.tournament) continue;
    if (t.id === 'pro' && medals < K().proProof) continue;
    const met = standardsMet(t.id, progress.top);
    const points = medals + met.length * K().standardPoints;
    const grade = gradeOf(points);
    const pay = payOf(t.id, grade);
    if (c.tier && pay <= c.pay) continue;
    out.push({ tier: t.id, grade, pay, met, points });
  }
  return out;
}

/** Signs `offer` on `day`: { contract, bonus }. It replaces what you had; today's pay is still collected as usual. */
export function sign(contract, offer, day) {
  const c = cleanContract(contract);
  const signed = { ...emptyContract(), tier: offer.tier, grade: offer.grade, pay: offer.pay, status: 'active', start: day, paid: c.paid, tz: c.tz, tzDay: c.tzDay };
  return { contract: signed, bonus: Math.round(offer.pay * K().signingBonus) };
}

/** What the game shows of a contract on `day` (after advance). */
export function contractView(c, day) {
  const view = { tier: c.tier, grade: c.grade, pay: c.pay, status: c.status, lost: c.lost, requal: c.requal, requalNeed: K().requalify };
  if (!c.tier) return view;
  return {
    ...view,
    payToday: payToday(c),
    paidToday: c.paid >= day,
    races: c.races,
    need: K().clauseRaces,
    daysLeft: c.start + 7 * (c.week + 1) - day, // in this clause week, today included
  };
}
