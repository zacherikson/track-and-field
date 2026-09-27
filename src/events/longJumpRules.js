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
 * The whole flight, as in the original: a projectile from your run-up speed.
 * - STRETCH (press both at the top): you throw yourself forward. A kick of
 *   `stretch.kickX` / `kickY` m/s (times the stretch quality) from that
 *   moment, legs thrust out in front: the hips come down lower before the heels
 *   touch (`jump.landDrop`) and the heels land `jump.reach` ahead of the hips.
 * - NO STRETCH: you crumple. Legs tucked under, you hit the sand sooner
 *   (`collapse.landDrop`) with your heels at `collapse.reach` from the hips,
 *   then flop forward onto your face.
 * `stretchDelay`: s after the top of the jump that you pressed (null = never).
 * Returns { k, apex, stretchAt, time, at(t) -> {x, y} hips, markX, collapse }.
 */
export function flightPath({ takeoffX, v, stretchDelay = null }, cfg) {
  const j = cfg.jump;
  const s = cfg.stretch;
  const c = j.collapse;
  const g = j.gravity;
  const { vx, vy } = launch(v, j);
  const apex = vy / g;
  const plain = (t) => ({ x: takeoffX + vx * t, y: vy * t - 0.5 * g * t * t });
  const tCollapse = fallTime(vy, 0, c.landDrop, g);
  let k = stretchQuality(stretchDelay, s);
  if (apex + (stretchDelay ?? 0) >= tCollapse) k = 0; // too late: already in the sand
  if (k === 0) {
    return { k, apex, stretchAt: null, time: tCollapse, at: plain, markX: plain(tCollapse).x + c.reach, collapse: true };
  }
  const ts = apex + stretchDelay;
  const p1 = plain(ts);
  const vx2 = vx + s.kickX * k;
  const vy2 = vy - g * ts + s.kickY * k;
  const tau = fallTime(vy2, p1.y, lerp(c.landDrop, j.landDrop, k), g);
  const at = (t) => {
    if (t <= ts) return plain(t);
    const u = t - ts;
    return { x: p1.x + vx2 * u, y: p1.y + vy2 * u - 0.5 * g * u * u };
  };
  return { k, apex, stretchAt: ts, time: ts + tau, at, markX: p1.x + vx2 * tau + lerp(c.reach, j.reach, k), collapse: false };
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
