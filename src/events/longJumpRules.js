/**
 * Long jump rules and flight physics, from footage of the original plus real
 * long jump rules. Pure logic (no DOM), shared by the game and tools/simulate.mjs.
 *
 * - Run-up: the 100m's green targets and runner physics.
 * - Takeoff zone: `zoneDistance` m before the foul line the pads turn orange
 *   and blink; strides stop counting and you carry your speed. Press BOTH to
 *   take off where you are.
 * - Measured from the FOUL LINE (the front edge of the board) to where you
 *   land, as in real long jump: taking off early wastes the gap, and taking off
 *   past the line is a foul (no mark). Run through without jumping: foul.
 * - Flight: a projectile from your run-up speed. At the top of the jump the
 *   pads come back: press both for the STRETCH (legs thrust forward), worth up
 *   to `stretch.bonus` m, less the longer you wait (`stretch.window`).
 */

/** Launch velocity for a takeoff at run-up speed v (m/s). */
export function launch(v, j) {
  return { vx: v * j.keepX, vy: j.liftBase + v * j.liftPerMps };
}

/** Time (s) from takeoff until the hips drop to landing height. */
export function flightTime(vy, j) {
  // hips: y(t) = vy t - g t^2 / 2, landing when y = -j.landDrop
  return (vy + Math.sqrt(vy * vy + 2 * j.gravity * j.landDrop)) / j.gravity;
}

/** Stretch quality 0..1 from how long after the pads appear (at the apex) you pressed. */
export function stretchQuality(delay, s) {
  if (delay == null || delay < 0) return 0;
  return Math.max(0, 1 - delay / s.window);
}

/**
 * Where you land, measured from the foul line (x = 0). `takeoffX` is your
 * takeoff foot's position (negative = behind the line).
 */
export function jumpMark({ takeoffX, v, stretchK }, cfg) {
  const j = cfg.jump;
  const { vx, vy } = launch(v, j);
  const hipLand = takeoffX + vx * flightTime(vy, j);
  return hipLand + j.reach + cfg.stretch.bonus * stretchK;
}

const rand = (a, b, rng) => a + (b - a) * rng();

/**
 * One rival's jump, through the same physics as the player: a run-up with the
 * rival's tapping pace (AIController + Runner, built by `makeRunUp`), takeoff
 * some distance from the line (negative = over it: foul), a stretch after a
 * reaction delay. Returns { mark } or { foul: true }.
 */
export function rivalJump(level, cfg, makeRunUp, rng = Math.random) {
  const v = makeRunUp(cfg.runway);
  const gap = rand(...level.takeoffGap, rng);
  if (gap < 0) return { foul: true };
  const stretchK = stretchQuality(rand(...level.stretchDelay, rng), cfg.stretch);
  return { mark: jumpMark({ takeoffX: -gap, v, stretchK }, cfg) };
}
