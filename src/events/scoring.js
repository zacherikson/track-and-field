/**
 * Decathlon points, from the official World Athletics scoring tables (the
 * same formulas real decathletes are scored with):
 *   running events:  points = A * (B - time)^C        (time in seconds)
 *   jumps:           points = A * (mark - B)^C        (mark in centimetres)
 *   throws:          points = A * (mark - B)^C        (mark in metres)
 * Rounded down, never below 0. No mark, a DNF or a foul-out scores 0.
 */
const TABLE = {
  sprint100: { A: 25.4347, B: 18, C: 1.81, track: true },
  hurdles110: { A: 5.74352, B: 28.5, C: 1.92, track: true },
  longjump: { A: 0.14354, B: 220, C: 1.4, cm: true },
  polevault: { A: 0.2797, B: 100, C: 1.35, cm: true },
  javelin: { A: 10.14, B: 7, C: 1.08 },
};

export function points(eventId, mark, status = 'ok') {
  const t = TABLE[eventId];
  if (!t || status !== 'ok' || mark == null) return 0;
  const m = t.cm ? mark * 100 : mark;
  const d = t.track ? t.B - m : m - t.B;
  return d > 0 ? Math.floor(t.A * Math.pow(d, t.C)) : 0;
}
