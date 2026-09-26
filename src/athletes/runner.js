import { CONFIG } from '../config.js';

/**
 * Runner physics shared by every running event (100m, hurdles, run-ups).
 * Player and AI both drive a Runner only through `tap(side, t)`, so the rules
 * are identical for everyone. Pure logic: no DOM, so tools/simulate.mjs can run it in Node.
 */
export class Runner {
  constructor(params = CONFIG.runner) {
    this.p = params;
    this.reset();
  }

  reset() {
    this.x = 0; // meters from the start line
    this.prevX = 0;
    this.v = 0; // m/s
    this.phase = 0; // stride animation phase (radians)
    this.started = false;
    this.lastSide = null;
    this.lastTapT = 0;
    this.avgInterval = null; // smoothed seconds between valid taps
    this.taps = 0;
    this.finished = false; // true after crossing the line: brake, ignore taps
  }

  /** Start the clock for tap intervals: the first interval is your reaction time. */
  go(t) {
    this.started = true;
    this.lastTapT = t;
  }

  /**
   * Register a tap. Returns 'ok', 'same' (same side twice: ignored),
   * 'fast' (too close to the previous tap: ignored) or 'idle'.
   */
  tap(side, t) {
    if (!this.started || this.finished) return 'idle';
    if (side === this.lastSide) return 'same';
    const interval = t - this.lastTapT;
    const first = this.taps === 0;
    // The first "interval" is your reaction time. Never reject it, but don't let
    // a lucky anticipation of the gun count as superhuman cadence either.
    if (!first && interval < this.p.minTapInterval) return 'fast';
    const floor = first ? 1 / this.p.cadenceForTopSpeed : 0;
    const iv = Math.min(Math.max(interval, floor), this.p.maxIntervalForAvg);
    this.avgInterval = this.avgInterval == null ? iv : this.avgInterval + this.p.cadenceSmoothing * (iv - this.avgInterval);
    this.lastSide = side;
    this.lastTapT = t;
    this.taps++;
    return 'ok';
  }

  /** Current effective cadence (taps/s). Decays on its own if you stop tapping. */
  cadence(t) {
    if (this.avgInterval == null) return 0;
    return 1 / Math.max(this.avgInterval, t - this.lastTapT);
  }

  targetSpeed(cadence) {
    const k = Math.min(1, cadence / this.p.cadenceForTopSpeed);
    return this.p.topSpeed * Math.pow(k, this.p.speedCurve);
  }

  update(dt, t) {
    const p = this.p;
    this.prevX = this.x;
    if (this.finished) {
      this.v = Math.max(0, this.v - p.finishDecel * dt);
    } else if (this.started) {
      const target = this.targetSpeed(this.cadence(t));
      if (this.v < target) {
        const a = p.accelMax * Math.max(0.1, 1 - (p.accelFalloff * this.v) / p.topSpeed);
        this.v = Math.min(target, this.v + a * dt);
      } else {
        this.v = Math.max(target, this.v - p.coastDecel * dt);
      }
    }
    this.x += this.v * dt;
    this.phase += ((this.v * dt) / p.strideLength) * Math.PI * 2;
  }

  /**
   * If this step carried the runner across `lineX`, return the exact crossing
   * time (linear interpolation within the step), else null. Without this, times
   * would be rounded to the step size and ties would be common.
   */
  crossing(lineX, stepStartT, dt) {
    if (this.prevX < lineX && this.x >= lineX) {
      return stepStartT + (dt * (lineX - this.prevX)) / (this.x - this.prevX);
    }
    return null;
  }
}
