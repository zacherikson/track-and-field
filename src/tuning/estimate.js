import { CONFIG } from '../config.js';
import { Runner } from '../athletes/runner.js';
import { AIController } from '../athletes/ai.js';

/**
 * Quick race estimates for the tuning panel, run through the real physics
 * with whatever values CONFIG currently holds. Pure logic, no DOM.
 */
const STEP = CONFIG.loop.fixedStep;

/**
 * 100m time for a steady player hitting `rate` correct taps per second, with an
 * ideal dip. `missAt` (meters) adds one wrong tap there: the stumble, the
 * penalty pause, plus a moment to find the target again.
 */
export function estimateTime(rate, { missAt = null, reaction = 0.25 } = {}) {
  const D = CONFIG.sprint100.distance;
  const dip = CONFIG.dip;
  const tg = CONFIG.sprint100.targets;
  const r = new Runner();
  r.go(0);
  let nextTap = reaction;
  let missed = false;
  for (let t = 0; t < 60; t += STEP) {
    if (D - r.x <= dip.promptDistance) r.carry();
    if (r.mode === 'carry' && D - r.x <= r.idealDipDistance()) r.lean();
    while (nextTap < t + STEP) {
      if (r.mode === 'run' && missAt != null && !missed && r.x >= missAt) {
        missed = true;
        r.stumble(tg.missSpeedLoss);
        nextTap += tg.missLockout + 0.15;
        continue;
      }
      if (r.mode === 'run') r.stride(nextTap);
      nextTap += 1 / rate;
    }
    r.update(STEP, t);
    const cross = r.crossing(D, t, STEP);
    if (cross != null) return cross;
  }
  return Infinity;
}

/** Typical winning time of an Amateur rival field (median of `races` races). */
export function estimateRivalWin(races = 15) {
  const D = CONFIG.sprint100.distance;
  const level = CONFIG.ai.amateur;
  const winners = [];
  for (let i = 0; i < races; i++) {
    let best = Infinity;
    for (let k = 0; k < CONFIG.sprint100.lanes - 1; k++) {
      const r = new Runner();
      const ai = new AIController(r, level);
      ai.go(0);
      for (let t = 0; t < 40; t += STEP) {
        if (D - r.x <= CONFIG.dip.promptDistance) r.carry();
        ai.update(t, STEP, r.x / D, D - r.x);
        r.update(STEP, t);
        const cross = r.crossing(D, t, STEP);
        if (cross != null) {
          best = Math.min(best, cross);
          break;
        }
      }
    }
    winners.push(best);
  }
  winners.sort((a, b) => a - b);
  return winners[Math.floor(winners.length / 2)];
}
