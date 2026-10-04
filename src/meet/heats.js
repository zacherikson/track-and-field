import { LOWER_IS_BETTER } from './rules.js';

/**
 * Heats (or flights) for one event of a meet: heat k has every squad's k-th
 * athlete, so each heat is one athlete from each squad, and athletes of a
 * similar standard meet (squads seed their four by personal best in that
 * event, best last: the last heat is the fast heat). Heats are drawn afresh
 * for every event.
 *
 * @param evId    the event
 * @param squads  [{ key, members: [{ uid, pb }] }]: the athletes in this event
 *                (`pb`: their personal best, or null)
 * @returns [[uid]]: the heats, slowest first, each in squad order. A squad
 *          with fewer athletes is missing from the slowest heats; empty
 *          heats are dropped.
 */
export function seedHeats(evId, squads) {
  const lower = LOWER_IS_BETTER.has(evId);
  const worstFirst = (a, b) => {
    // No best yet: seeded slowest.
    const an = Number.isFinite(a.pb);
    const bn = Number.isFinite(b.pb);
    if (an !== bn) return an ? 1 : -1;
    if (an && a.pb !== b.pb) return lower ? b.pb - a.pb : a.pb - b.pb;
    return String(a.uid).localeCompare(String(b.uid));
  };
  const n = Math.max(0, ...squads.map((s) => s.members.length));
  const heats = Array.from({ length: n }, () => []);
  for (const s of squads) {
    const sorted = [...s.members].sort(worstFirst);
    // The best goes in the last heat, so a squad short of athletes leaves the slow heats.
    sorted.forEach((m, i) => heats[n - sorted.length + i].push(m.uid));
  }
  return heats.filter((h) => h.length);
}
