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
 *   pads come back: press both for the STRETCH and you throw yourself forward
 *   and land far out on your heels; the later you press, the weaker it is
 *   (`stretch.window`). Don't, and you crumple and land short (flightPath).
 */

/** Launch velocity for a takeoff at run-up speed v (m/s). */
export function launch(v, j) {
  return { vx: v * j.keepX, vy: j.liftBase + v * j.liftPerMps };
}

/** Stretch quality 0..1 from how long after the top of the jump you pressed (null = never). */
export function stretchQuality(delay, s) {
  if (delay == null || delay < 0) return 0;
  return Math.max(0, 1 - delay / s.window);
}

// Time for a body at height y0 moving up at vy to drop to height -drop.
const fallTime = (vy, y0, drop, g) => (vy + Math.sqrt(vy * vy + 2 * g * (y0 + drop))) / g;
const lerp = (a, b, k) => a + (b - a) * k;

/**
 * Slow motion in the air, as in the original: just after takeoff the clock
 * eases down to `rate` (over `ramp` real s), so you hang and fly for longer and
 * have time to see the top of the jump coming. Distances don't change: the
 * physics is the same, only played slower. Converts real s <-> physics s.
 */
export function flightClock({ rate: s, ramp: r }) {
  const p0 = (r * (1 + s)) / 2; // physics s elapsed by the end of the ramp
  const a = (1 - s) / (2 * r);
  return {
    toPhys: (t) => (t <= 0 ? t : t < r ? t - a * t * t : p0 + s * (t - r)),
    toReal: (p) => (p <= 0 ? p : p < p0 ? (a === 0 ? p : (1 - Math.sqrt(1 - 4 * a * p)) / (2 * a)) : r + (p - p0) / s),
  };
}

/**
 * The whole flight, as in the original (arcs sketched from it):
 * - Up to the TOP of the jump: a projectile from your run-up speed.
 * - NO STRETCH: past the top the arc collapses. You crumple into a ball, your
 *   forward speed dies (`collapse.keepX` of it is left) and you drop steeply
 *   into the sand, feet under you (`collapse.landDrop`, `collapse.reach`), then
 *   flop forward onto your face.
 * - STRETCH (press both at the top): a mini double jump. A little hop up
 *   (`stretch.kickY`) and you carry on forward (`stretch.carryX` of your
 *   takeoff speed) on a long, flat glide, legs thrust out in front: the hips
 *   come down lower before the heels touch (`jump.landDrop`) and the heels land
 *   `jump.reach` ahead of them. Both scale with the stretch quality, and the
 *   later you press the more you've already crumpled.
 * `stretchDelay`: s after the top of the jump that you pressed (null = never).
 * Times in and out are REAL (slow-motion) seconds since takeoff.
 * Returns { k, apex, stretchAt, time, at(t) -> {x, y} hips, markX, collapse }.
 */
export function flightPath({ takeoffX, v, stretchDelay = null }, cfg) {
  const j = cfg.jump;
  const s = cfg.stretch;
  const c = j.collapse;
  const g = j.gravity;
  const clock = flightClock(cfg.flight.slowMo);
  const { vx, vy } = launch(v, j);
  // Physics seconds from here on.
  const ta = vy / g; // the top of the jump
  const top = { x: takeoffX + vx * ta, y: (vy * vy) / (2 * g) };
  const vxc = vx * c.keepX; // crumpling: forward speed dies past the top
  const plain = (t) => {
    if (t <= ta) return { x: takeoffX + vx * t, y: vy * t - 0.5 * g * t * t };
    const u = t - ta;
    return { x: top.x + vxc * u, y: top.y - 0.5 * g * u * u };
  };
  const tCollapse = ta + Math.sqrt((2 * (top.y + c.landDrop)) / g);
  const apex = clock.toReal(ta);
  let k = stretchQuality(stretchDelay, s);
  const ts = k > 0 ? clock.toPhys(apex + stretchDelay) : Infinity;
  if (ts >= tCollapse) k = 0; // too late: already in the sand
  if (k === 0) {
    const at = (t) => plain(clock.toPhys(t));
    return { k, apex, stretchAt: null, time: clock.toReal(tCollapse), at, markX: plain(tCollapse).x + c.reach, collapse: true };
  }
  const p1 = plain(ts);
  const vx2 = lerp(vxc, vx * s.carryX, k);
  const vy2 = -g * (ts - ta) + s.kickY * k;
  const tau = fallTime(vy2, p1.y, lerp(c.landDrop, j.landDrop, k), g);
  const at = (t) => {
    const p = clock.toPhys(t);
    if (p <= ts) return plain(p);
    const u = p - ts;
    return { x: p1.x + vx2 * u, y: p1.y + vy2 * u - 0.5 * g * u * u };
  };
  return { k, apex, stretchAt: clock.toReal(ts), time: clock.toReal(ts + tau), at, markX: p1.x + vx2 * tau + lerp(c.reach, j.reach, k), collapse: false };
}

/** Where you land, measured from the foul line (x = 0). `takeoffX` < 0 = behind the line. */
export function jumpMark({ takeoffX, v, stretchDelay = null }, cfg) {
  return flightPath({ takeoffX, v, stretchDelay }, cfg).markX;
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
  return { mark: jumpMark({ takeoffX: -gap, v, stretchDelay: rand(...level.stretchDelay, rng) }, cfg) };
}
