import { POINTS, LOWER_IS_BETTER } from './rules.js';

/**
 * Meet scoring (docs/meets.md): every athlete in an event is ranked across all
 * the heats, and places 1 to 8 score POINTS for their squad.
 *
 * - Times are ranked to the thousandth (shown to the hundredth), so 9.871 and
 *   9.874 aren't a tie. Distances and heights to the centimetre.
 * - A field event ranks your best mark; a tie on it goes to the second best,
 *   then the third, as in a real meet.
 * - A true tie shares the points of the places it covers: two tied for 2nd
 *   get (8 + 6) / 2 = 7 each, and the next athlete is 4th.
 * - No mark (DNF, every attempt a foul, missed the cutoff) scores 0 and isn't ranked.
 */

/** A mark as it's compared: times to 0.001 s, the rest to 0.01 m. */
function rounded(evId, mark) {
  const k = LOWER_IS_BETTER.has(evId) ? 1000 : 100;
  return Math.round(mark * k) / k;
}

/**
 * What an entry is ranked on, best first: [best, second best, third best].
 * `entry.marks`: every valid mark (a field event's attempts), or `entry.mark`: the one.
 */
function rankKey(evId, entry) {
  const marks = (entry.marks ?? (entry.mark == null ? [] : [entry.mark])).filter((m) => Number.isFinite(m)).map((m) => rounded(evId, m));
  return marks.sort((a, b) => (LOWER_IS_BETTER.has(evId) ? a - b : b - a));
}

/** <0 if key `a` ranks ahead of `b`, >0 if behind, 0 if they tie. */
function compareKeys(evId, a, b) {
  const lower = LOWER_IS_BETTER.has(evId);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    if (a[i] == null) return 1; // fewer valid marks: behind
    if (b[i] == null) return -1;
    return lower ? a[i] - b[i] : b[i] - a[i];
  }
  return 0;
}

/** Points for places `from`..`from + n - 1` shared between `n` tied athletes. */
export function sharedPoints(from, n) {
  let sum = 0;
  for (let p = from; p < from + n; p++) sum += POINTS[p - 1] ?? 0;
  return Math.round((sum / n) * 1000) / 1000;
}

/**
 * Ranks one event across all its heats.
 * @param evId     the event (rules.js MEET_ORDER)
 * @param entries  [{ id, squad, mark? , marks? }]: one per athlete (or relay team)
 * @returns [{ id, squad, mark, place, pts }] best first; unranked entries
 *          (no mark) last, with place null and 0 points. `mark` is the best mark.
 */
export function rankEvent(evId, entries) {
  const keyed = entries.map((e) => ({ e, key: rankKey(evId, e) }));
  const ranked = keyed.filter((k) => k.key.length).sort((a, b) => compareKeys(evId, a.key, b.key) || String(a.e.id).localeCompare(String(b.e.id)));
  const out = [];
  for (let i = 0; i < ranked.length; ) {
    let j = i + 1;
    while (j < ranked.length && compareKeys(evId, ranked[i].key, ranked[j].key) === 0) j++;
    const place = i + 1;
    const pts = sharedPoints(place, j - i);
    for (let k = i; k < j; k++) out.push({ id: ranked[k].e.id, squad: ranked[k].e.squad, mark: ranked[k].key[0], place, pts });
    i = j;
  }
  for (const k of keyed) if (!k.key.length) out.push({ id: k.e.id, squad: k.e.squad, mark: null, place: null, pts: 0 });
  return out;
}

/**
 * The squads' standings after any number of events.
 * @param squads  the squads' keys
 * @param events  rankEvent results, one per event scored so far
 * @returns [{ squad, total, places, rank }] best first. `places[p]` = how many
 *          (p+1)th places the squad has. Level on points, the most 1sts goes
 *          ahead, then 2nds, and so on; still level, they share the rank.
 */
export function squadStandings(squads, events) {
  const rows = new Map(squads.map((s) => [s, { squad: s, total: 0, places: POINTS.map(() => 0) }]));
  for (const ranked of events) {
    for (const r of ranked) {
      const row = rows.get(r.squad);
      if (!row) continue;
      row.total += r.pts;
      if (r.place != null && r.place <= POINTS.length) row.places[r.place - 1]++;
    }
  }
  const list = [...rows.values()];
  for (const r of list) r.total = Math.round(r.total * 1000) / 1000;
  const cmp = (a, b) => {
    if (a.total !== b.total) return b.total - a.total;
    for (let p = 0; p < POINTS.length; p++) if (a.places[p] !== b.places[p]) return b.places[p] - a.places[p];
    return 0;
  };
  list.sort((a, b) => cmp(a, b) || String(a.squad).localeCompare(String(b.squad)));
  list.forEach((r, i) => (r.rank = i > 0 && cmp(list[i - 1], r) === 0 ? list[i - 1].rank : i + 1));
  return list;
}

/** Points as shown: whole numbers plain, shared ones to one decimal (7, 0.3). */
export function formatPoints(pts) {
  return Number.isInteger(pts) ? String(pts) : pts.toFixed(1);
}
