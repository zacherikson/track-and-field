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
 * - While you hold, the spark climbs back up the pole (`spark.climbTime`). Let
 *   go as it reaches your hands: the RELEASE quality (within `release.window`
 *   either side; hold on too long and you get nothing from it). The sweet
 *   spot is `release.lead` s after the spark gets there, to cover the delay
 *   between seeing it arrive and your finger leaving the screen.
 * - Height cleared = base + speed at the plant + both qualities (vaultHeight).
 *   Best of three counts, as in the long jump.
 */

/** Plant quality 0..1 from press time minus plant time (s). */
export function pressQuality(err, p) {
  return Math.max(0, 1 - Math.abs(err) / p.window);
}

/** Release quality 0..1 from how long you held (s) vs. the spark's climb. */
export function releaseQuality(held, cfg) {
  return Math.max(0, 1 - Math.abs(held - releaseTarget(cfg)) / cfg.release.window);
}

/** The best hold time (s): the spark reaches your hands, plus the allowance for reaction and screen delay. */
export function releaseTarget(cfg) {
  return cfg.spark.climbTime + (cfg.release.lead ?? 0);
}

/** Height cleared (m) for plant speed v (m/s) and the two qualities. */
export function vaultHeight({ v, pq, rq }, cfg) {
  const h = cfg.height;
  const q = h.pressWeight * pq + (1 - h.pressWeight) * rq;
  return h.base + h.perMps * (v - h.vRef) + h.gain * q;
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
