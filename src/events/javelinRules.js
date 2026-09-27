/**
 * Javelin rules, from footage of the original plus real javelin rules. Pure
 * logic (no DOM), shared by the game and tools/simulate.mjs.
 *
 * - Run-up: the 100m's green targets and runner physics, javelin carried over
 *   the shoulder.
 * - Throw zone: `zoneDistance` m before the foul line the pads turn orange and
 *   blink. Strides stop and you carry your speed.
 * - Press and HOLD both: you draw the javelin back (withdrawal, crossover
 *   steps) and its angle climbs from `angle.start` at `angle.rate` deg/s, up to
 *   `angle.max`. Sparks gather at its tail.
 * - LET GO to throw. The best angle is `angle.best`; the further off you are,
 *   the shorter (`angle.spread`). Measured from the foul line, so let go close
 *   to it: throwing early wastes the gap. Reach the line still holding, or let
 *   go past it: FOUL.
 * - Distance = (base + speed at release) x angle efficiency - the gap.
 */

/** Javelin angle (deg) after holding for `held` s. */
export function angleAt(held, a) {
  return Math.min(a.max, a.start + a.rate * Math.max(0, held));
}

/** 0..1: how good a release angle (deg) is. */
export function angleEfficiency(deg, a) {
  const k = (deg - a.best) / a.spread;
  return Math.max(0, 1 - k * k);
}

/** Distance the javelin flies from where it leaves the hand (m). */
export function flightRange(v, deg, cfg) {
  const d = cfg.distance;
  return Math.max(4, (d.base + d.perMps * (v - d.vRef)) * angleEfficiency(deg, cfg.angle));
}

/**
 * The throw measured from the foul line (x = 0): released at `releaseX`
 * (negative = behind the line) at speed v and angle deg.
 */
export function throwMark({ releaseX, v, deg }, cfg) {
  return flightRange(v, deg, cfg) + releaseX;
}

const rand = (a, b, rng) => a + (b - a) * rng();

/**
 * One rival's throw through the same rules as the player: a run-up with the
 * rival's pace (`makeRunUp` returns the speed at the release), a release some
 * way behind the line (negative gap = past it: foul) at an angle off the best
 * by up to `angleErr` deg. Returns { mark } or { foul: true }.
 */
export function rivalThrow(level, cfg, makeRunUp, rng = Math.random) {
  const v = makeRunUp();
  const gap = rand(...level.gap, rng);
  if (gap < 0) return { foul: true };
  const deg = cfg.angle.best + rand(-level.angleErr, level.angleErr, rng);
  return { mark: throwMark({ releaseX: -gap, v, deg }, cfg) };
}
