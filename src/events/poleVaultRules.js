/**
 * Pole vault rules, from footage of the original. Pure logic (no DOM), shared
 * by the game and tools/simulate.mjs.
 *
 * - Run-up: the 100m's green targets and runner physics, carrying the pole.
 * - Plant zone: `zoneDistance` m before the plant the pads turn orange and
 *   blink. Strides stop and you carry your speed; the pole comes down and a
 *   SPARK runs from your hands down the pole. It reaches the tip just as the
 *   tip plants in the box.
 * - At that moment press and HOLD both. How close to the plant you press is
 *   the PLANT quality (0 at `press.window` either side; no press within
 *   `press.miss` and you run through: no height).
 * - While you hold, the spark climbs back up the pole (`spark.climbTime`),
 *   starting at the plant (or at your press, if that came later). Let go as
 *   it reaches your hands, at the very end of the pole: the RELEASE quality
 *   (within `release.window` either side; hold on too long and you get
 *   nothing from it). What you see is what's scored: the spark arrives
 *   exactly at the best moment.
 * - Height cleared: from `height.min` (everything wrong) to `height.max`
 *   (everything right), by a score that weighs your speed at the plant, the
 *   plant and the release (`height.speedWeight` etc., 50 / 25 / 25 by
 *   default). See vaultHeight. Best of three counts, as in the long jump.
 */

/** Plant quality 0..1 from press time minus plant time (s). */
export function pressQuality(err, p) {
  return Math.max(0, 1 - Math.abs(err) / p.window);
}

/** Release quality 0..1 from how long the spark had been climbing when you let go (s). */
export function releaseQuality(held, cfg) {
  return Math.max(0, 1 - Math.abs(held - releaseTarget(cfg)) / cfg.release.window);
}

/** The best time to let go (s after the spark starts climbing): as it reaches your hands. */
export function releaseTarget(cfg) {
  return cfg.spark.climbTime;
}

/** Speed quality 0..1: 0 at `height.slowSpeed` m/s at the plant or slower, 1 at `height.fastSpeed` or faster. */
export function speedQuality(v, cfg) {
  const h = cfg.height;
  return Math.max(0, Math.min(1, (v - h.slowSpeed) / (h.fastSpeed - h.slowSpeed)));
}

/**
 * Height cleared (m) for plant speed v (m/s) and the plant and release
 * qualities (0..1): min + (max - min) × score, where the score weighs the
 * three by `speedWeight`, `plantWeight` and `releaseWeight` (shares of their total).
 */
export function vaultHeight({ v, pq, rq }, cfg) {
  const h = cfg.height;
  const total = h.speedWeight + h.plantWeight + h.releaseWeight || 1;
  const score = (h.speedWeight * speedQuality(v, cfg) + h.plantWeight * pq + h.releaseWeight * rq) / total;
  return h.min + (h.max - h.min) * score;
}

const rand = (a, b, rng) => a + (b - a) * rng();

/**
 * One rival's vault through the same rules as the player: a run-up with the
 * rival's pace (`makeRunUp` returns the speed at the plant), a press within
 * ±`pressErr` s of the plant and a release within ±`releaseErr` s of the
 * spark's climb. Now and then they miss the plant: no height.
 */
export function rivalVault(level, cfg, makeRunUp, rng = Math.random) {
  const v = makeRunUp();
  if (rng() < level.missChance) return { fail: true }; // missed the plant
  const pq = pressQuality(rand(-level.pressErr, level.pressErr, rng), cfg.press);
  const rq = releaseQuality(releaseTarget(cfg) + rand(-level.releaseErr, level.releaseErr, rng), cfg);
  return { mark: vaultHeight({ v, pq, rq }, cfg) };
}
