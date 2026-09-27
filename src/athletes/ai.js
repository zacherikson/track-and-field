import { rand } from '../core/math.js';

/**
 * AI "thumbs": hits stride targets at a personal cadence (with reaction-time
 * jitter and the occasional misread) and feeds them into a Runner, exactly like
 * the player's input does. Difficulty = the cadence range in CONFIG.ai.<level>.
 */
export class AIController {
  constructor(runner, level, cadence = rand(...level.cadence)) {
    this.runner = runner;
    this.level = level;
    this.cadence = cadence;
    this.reaction = rand(...level.reaction);
    this.nextTapT = Infinity;
    this.dipError = rand(...level.dipError);
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
      let interval = (1 / (this.cadence * tired)) * (1 + rand(-lv.jitter, lv.jitter));
      if (Math.random() < lv.missChance) {
        // Rivals misread a target now and then, and pay the same price the player does.
        r.stumble(lv.missSpeedLoss, this.nextTapT);
        interval += lv.missLockout;
      } else {
        r.stride(this.nextTapT);
      }
      this.nextTapT += interval;
    }
  }
}
