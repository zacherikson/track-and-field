import { CONFIG } from '../config.js';
import { Runner } from '../athletes/runner.js';
import { AIController } from '../athletes/ai.js';
import { runPose } from '../athletes/stickFigure.js';
import { clamp } from '../core/math.js';

/**
 * THE FIELD EVENTS' RUN-UP (long jump, javelin, pole vault), the parts with
 * no screen: pure, shared by the game and tools/simulate.mjs. It's the 100m's
 * running: the same Runner, the same strides, and a rival's are the same
 * AIController a 100m rival has. Your own run-up, on the screen, is runUp.js.
 *
 * Every run-up goes the same way: from the back of the runway on strides,
 * until `zoneDistance` before the `line` (the board, the foul line, the
 * plant), where the strides stop and the athlete carries their speed in
 * (Runner.carry), to the point the event takes over.
 */

/**
 * An athlete's run-up on their own, start to finish: their speed (m/s) when they
 * reach `end`. They tap as a rival does (`level`: CONFIG.ai.<level> with the event's
 * own, and their `cadence`, or the level's), or steadily at `rate` taps a second (a
 * player in tools/simulate.mjs).
 *
 * @param from          where they start (m; the line is at `line`)
 * @param line          where the event's line is: the strides stop zoneDistance before it
 * @param end           where the run-up ends (the board, a step short of it, the plant)
 * @param zoneDistance  m before `line` that the strides stop
 */
export function runUpSpeed({ from, line, end, zoneDistance, level = null, cadence = null, rate = 0 }) {
  const step = CONFIG.loop.fixedStep;
  const r = new Runner(undefined, undefined, from);
  const ai = level && new AIController(r, level, cadence);
  if (ai) ai.go(0);
  else r.go(0);
  let next = 0.25; // a steady tapper's first stride
  for (let t = 0; r.x < end && t < 20; t += step) {
    if (line - r.x <= zoneDistance) r.carry();
    else if (ai) ai.update(t, step, 0, Infinity);
    else if (t >= next) {
      r.stride(t);
      next += 1 / rate;
    }
    r.update(step, t);
  }
  return r.v;
}

/** An athlete on the runway, running: the 100m's run, without its drive out of the blocks. */
export function runUpPose(r) {
  return runPose(r.phase, clamp(r.v / 11, 0.15, 1), 0);
}
