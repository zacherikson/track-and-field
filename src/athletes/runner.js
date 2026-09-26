import { CONFIG } from '../config.js';

/**
 * Runner physics shared by every running event (100m, hurdles, run-ups).
 * Player and AI both drive a Runner only through `stride(t)` (one correct input
 * = one stride) and `stumble()`, so the physics is identical for everyone. Each
 * event decides what counts as a correct input (random L/R targets, 1-2-3...).
 * Pure logic: no DOM, so tools/simulate.mjs can run it in Node.
 */
export class Runner {
  constructor(params = CONFIG.runner, dip = CONFIG.dip) {
    this.p = params;
    this.dip = dip;
    this.reset();
  }

  reset() {
    this.x = 0; // meters from the start line
    this.prevX = 0;
    this.v = 0; // m/s
    this.phase = 0; // stride animation phase (radians)
    this.started = false;
    this.lastTapT = 0;
    this.avgInterval = null; // smoothed seconds between valid taps
    this.taps = 0;
    this.finished = false; // true after crossing the line: brake, ignore taps
    // Finish-dip state. 'run' -> 'carry' (in the dip zone: strides stop counting,
    // momentum carries you) -> 'dive' (lunging for the line).
    this.mode = 'run';
    this.diveT = 0;
    this.reach = 0; // meters the chest is ahead of the hips (the chest is what crosses the line)
    this.prevFront = 0;
    this.dipUsed = false;
  }

  /** Front of the torso: finish times are taken when this crosses the line. */
  get front() {
    return this.x + this.reach;
  }

  get airborne() {
    return this.mode === 'dive' && this.diveT < this.dip.riseTime + this.dip.airTime;
  }

  /** Enter the dip zone: stop reacting to strides, carry your speed. */
  carry() {
    // Only a runner with real momentum can coast: a slow one keeps running normally.
    if (this.mode === 'run' && !this.dipUsed && !this.finished && this.v >= this.dip.minCarrySpeed) this.mode = 'carry';
  }

  /** Distance from the line at which a dive puts the chest at full stretch right on it. */
  idealDipDistance() {
    return this.v * this.dip.riseTime + this.dip.reach;
  }

  /** Throw yourself at the line. Returns false if a dip isn't possible now. */
  dive() {
    if (this.dipUsed || this.finished || !this.started) return false;
    this.mode = 'dive';
    this.dipUsed = true;
    this.diveT = 0;
    return true;
  }

  /** Start the clock for tap intervals: the first interval is your reaction time. */
  go(t) {
    this.started = true;
    this.lastTapT = t;
  }

  /**
   * Register one stride (a correct input). Returns 'ok', 'fast' (too soon after
   * the previous stride: ignored) or 'idle' (not running right now).
   */
  stride(t) {
    if (!this.started || this.finished || this.mode !== 'run') return 'idle';
    const interval = t - this.lastTapT;
    const first = this.taps === 0;
    // The first "interval" is your reaction time. Never reject it, but don't let
    // a lucky anticipation of the gun count as superhuman cadence either.
    if (!first && interval < this.p.minStrideInterval) return 'fast';
    const floor = first ? 1 / this.p.cadenceForTopSpeed : 0;
    const iv = Math.min(Math.max(interval, floor), this.p.maxIntervalForAvg);
    this.avgInterval = this.avgInterval == null ? iv : this.avgInterval + this.p.cadenceSmoothing * (iv - this.avgInterval);
    this.lastTapT = t;
    this.taps++;
    return 'ok';
  }

  /** A wrong input: lose some speed on the spot. */
  stumble(speedLoss) {
    if (this.mode === 'run' && !this.finished) this.v = Math.max(0, this.v - speedLoss);
  }

  /** Current effective cadence (taps/s). Decays on its own if you stop tapping. */
  cadence(t) {
    if (this.avgInterval == null) return 0;
    // A gap only starts to cost you once it's clearly longer than your usual
    // rhythm (idleGrace x), so an ordinary hesitation doesn't wobble your speed.
    return 1 / Math.max(this.avgInterval, (t - this.lastTapT) / this.p.idleGrace);
  }

  targetSpeed(cadence) {
    const k = Math.min(1, cadence / this.p.cadenceForTopSpeed);
    return this.p.topSpeed * Math.pow(k, this.p.speedCurve);
  }

  update(dt, t) {
    const p = this.p;
    this.prevX = this.x;
    this.prevFront = this.front;
    if (this.mode === 'dive') {
      this.updateDive(dt);
    } else if (this.finished) {
      this.v = Math.max(0, this.v - p.finishDecel * dt);
    } else if (this.mode === 'carry') {
      this.v = Math.max(0, this.v - this.dip.carryDecel * dt);
      if (this.v < this.dip.minCarrySpeed) this.mode = 'run';
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
   * The dive: the chest lunges forward by up to `reach` meters (smoothstep over
   * riseTime), hangs for airTime, then the athlete hits the track and slides.
   * Dive too early and you slide to a stop before the line, then have to get
   * up and run again: a big penalty. Dive at the right moment and your chest
   * crosses the line a few hundredths early.
   */
  updateDive(dt) {
    const d = this.dip;
    this.diveT += dt;
    const k = Math.min(1, this.diveT / d.riseTime);
    this.reach = d.reach * k * k * (3 - 2 * k); // smoothstep: a late dip barely gets going
    const decel = this.airborne ? d.airDecel : d.slideDecel;
    this.v = Math.max(0, this.v - decel * dt);
    if (this.v === 0 && !this.finished) {
      // Slid to a stop short of the line: get up and run it in.
      this.mode = 'run';
      this.reach = 0;
      this.avgInterval = null;
    }
  }

  /**
   * If this step carried the runner's chest across `lineX`, return the exact crossing
   * time (linear interpolation within the step), else null. Without this, times
   * would be rounded to the step size and ties would be common.
   */
  crossing(lineX, stepStartT, dt) {
    const a = this.prevFront;
    const b = this.front;
    if (a < lineX && b >= lineX) return stepStartT + (dt * (lineX - a)) / (b - a);
    return null;
  }
}
