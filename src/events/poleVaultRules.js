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
 * - While you hold, the spark climbs back up the pole as you swing up it,
 *   starting at the plant (or at your press, if that came later). The swing
 *   runs on your speed: `swing.timeAt10` s at 10 m/s, quicker the faster you
 *   planted (releaseTarget). Let go as the spark reaches your hands, at the
 *   very end of the pole, upside down at the top: the RELEASE quality (within
 *   `release.window` either side; hold on too long and you get nothing from
 *   it). What you see is what's scored.
 * - Height cleared, from energy (vaultHeight): your speed at the plant turns
 *   into height, v² / 2g, and the pole gives back a share of it, from
 *   `height.effMin` (plant and release both missed) to `height.effMax` (both
 *   perfect), weighed by `plantWeight` and `releaseWeight`. Plus
 *   `height.base`, your hips' height at takeoff. So speed counts more and more
 *   the faster you go. Never below `height.min`. Best of three counts.
 */

const G = 9.81;

/** Plant quality 0..1 from press time minus plant time (s). */
export function pressQuality(err, p) {
  return Math.max(0, 1 - Math.abs(err) / p.window);
}

/** Release quality 0..1 from how long the spark had been climbing when you let go (s), planted at v m/s. */
export function releaseQuality(held, cfg, v) {
  return Math.max(0, 1 - Math.abs(held - releaseTarget(cfg, v)) / cfg.release.window);
}

/** The best time to let go (s after the spark starts climbing), planted at v m/s: the swing's length, as the spark reaches your hands. */
export function releaseTarget(cfg, v) {
  return (cfg.swing.timeAt10 * 10) / Math.max(3, v);
}

/** Height cleared (m) for plant speed v (m/s) and the plant and release qualities (0..1). */
export function vaultHeight({ v, pq, rq }, cfg) {
  const h = cfg.height;
  const total = h.plantWeight + h.releaseWeight || 1;
  const timing = (h.plantWeight * pq + h.releaseWeight * rq) / total;
  const eff = h.effMin + (h.effMax - h.effMin) * timing;
  return Math.max(h.min, h.base + (eff * v * v) / (2 * G));
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
  const rq = releaseQuality(releaseTarget(cfg, v) + rand(-level.releaseErr, level.releaseErr, rng), cfg, v);
  return { mark: vaultHeight({ v, pq, rq }, cfg) };
}
