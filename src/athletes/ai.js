import { CONFIG } from '../config.js';
import { rand } from '../core/math.js';

/**
 * AI "thumbs": hits stride targets at a personal cadence (with reaction-time
 * jitter and the occasional misread) and feeds them into a Runner, exactly like
 * the player's input does. Difficulty = the cadence range in CONFIG.ai.<level>.
 */
export class AIController {
  /** `rng`: where its randomness comes from (a seeded one runs the same on every phone: events/relaySim.js). */
  constructor(runner, level, cadence = null, rng = Math.random) {
    this.runner = runner;
    this.level = level;
    this.rng = rng;
    this.cadence = cadence ?? rand(...level.cadence, rng);
    this.reaction = rand(...level.reaction, rng);
    this.nextTapT = Infinity;
    this.dipError = rand(...level.dipError, rng);
  }

  go(t) {
    this.runner.go(t);
    this.nextTapT = t + this.reaction;
  }

  /**
   * Emit every tap due within [t, t + dt). `progress` is 0..1 of the race,
   * `toLine` the meters left, used to time the finish dip.
   */
  update(t, dt, progress, toLine = Infinity) {
    const r = this.runner;
    if (r.mode === 'carry' && toLine <= r.idealDipDistance() + this.dipError) r.lean();
    const lv = this.level;
    const tired = 1 - lv.fatigue * Math.max(0, (progress - 0.6) / 0.4);
    while (this.nextTapT < t + dt) {
      let interval = (1 / (this.cadence * tired)) * (1 + rand(-lv.jitter, lv.jitter, this.rng));
      if (this.rng() < lv.missChance) {
        // Rivals misread a target now and then, and pay the same price the player does
        // (the 100m's targets, unless the event has its own: hurdles110.js).
        const tg = CONFIG.sprint100.targets;
        r.stumble(lv.missSpeedLoss ?? tg.missSpeedLoss, this.nextTapT);
        interval += lv.missLockout ?? tg.missLockout;
      } else {
        r.stride(this.nextTapT);
      }
      this.nextTapT += interval;
    }
  }
}
