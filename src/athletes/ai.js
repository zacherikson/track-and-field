import { rand } from '../core/math.js';

/**
 * AI "thumbs": generates alternating taps at a personal cadence and feeds them
 * into a Runner, exactly like the player's input does. Difficulty = the
 * cadence range in CONFIG.ai.<level>.
 */
export class AIController {
  constructor(runner, level, cadence = rand(...level.cadence)) {
    this.runner = runner;
    this.level = level;
    this.cadence = cadence;
    this.reaction = rand(...level.reaction);
    this.nextTapT = Infinity;
    this.side = 'L';
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
    if (r.mode === 'carry' && toLine <= r.idealDipDistance() + this.dipError) r.dive();
    const lv = this.level;
    const tired = 1 - lv.fatigue * Math.max(0, (progress - 0.6) / 0.4);
    while (this.nextTapT < t + dt) {
      this.runner.tap(this.side, this.nextTapT);
      this.side = this.side === 'L' ? 'R' : 'L';
      const interval = (1 / (this.cadence * tired)) * (1 + rand(-lv.jitter, lv.jitter));
      this.nextTapT += interval;
    }
  }
}
