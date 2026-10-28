/**
 * Tournament points (also Survival's), one table per event, set so the same
 * skill scores the same in every event: a perfect run is worth 1200 in each,
 * so a perfect tournament comes to about 6000.
 *
 * Each table is a list of [mark, points], worst first. A mark between two rows
 * scores in proportion; a mark past the best row keeps climbing at the
 * good-to-perfect rate (a new record still scores more). Rounded down, never
 * below 0. No mark, a DNF or a foul-out scores 0.
 *
 * The rows are the players in tools/simulate.mjs (100m: the "reader" players;
 * the others: casual 3.0/s, good 3.7/s, expert 4.7/s, perfect 5.2/s, or the
 * hurdles' "machine"), with 0 where the official decathlon tables give 0:
 *
 *            zero    casual 650   good 900   expert 1100   perfect 1200
 *
 * (100m: 8.5 s for 1100 and 8.28 s, the best on the board, for 1250.)
 */
const TABLE = {
  // The 100m's top is the best anyone runs (the board's 8.28), not the
  // simulator's 5.7-taps-a-second player (8.15): its players bunch up there
  // (its expert already runs 8.27), so that would leave real records at expert.
  sprint100: [[18, 0], [9.7, 650], [8.75, 900], [8.5, 1100], [8.28, 1250]], // s
  hurdles110: [[28.5, 0], [14.4, 650], [12.3, 900], [11.6, 1100], [11.25, 1200]], // s
  longjump: [[2.2, 0], [6.85, 650], [8.1, 900], [9.5, 1100], [10.35, 1200]], // m
  polevault: [[1, 0], [3.65, 650], [4.5, 900], [5.8, 1100], [6.5, 1200]], // m
  javelin: [[7, 0], [77, 650], [85, 900], [95.5, 1100], [100.5, 1200]], // m
};

export function points(eventId, mark, status = 'ok') {
  const t = TABLE[eventId];
  if (!t || status !== 'ok' || mark == null || !Number.isFinite(mark)) return 0;
  // Times go down as they get better: score them as how far under the zero mark.
  const dir = Math.sign(t[t.length - 1][0] - t[0][0]);
  const at = (i) => (t[i][0] - t[0][0]) * dir;
  const m = (mark - t[0][0]) * dir;
  if (m <= 0) return 0;
  let i = 1;
  while (i < t.length - 1 && m > at(i)) i++;
  // Past the best row: the good-to-perfect rate.
  const [a, b] = m > at(t.length - 1) ? [t.length - 3, t.length - 1] : [i - 1, i];
  const p = t[a][1] + ((t[b][1] - t[a][1]) * (m - at(a))) / (at(b) - at(a));
  return Math.max(0, Math.floor(p + 1e-9));
}
