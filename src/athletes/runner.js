import { CONFIG } from '../config.js';

/**
 * Runner physics shared by every running event (100m, hurdles, run-ups).
 * Player and AI both drive a Runner only through `stride(t)` (one correct input
 * = one stride) and `stumble()`, so the physics is identical for everyone. Each
 * event decides what counts as a correct input (random L/R targets, 1-2-3...).
 * Pure logic: no DOM, so tools/simulate.mjs can run it in Node.
 */
export class Runner {
  /** @param startX where the body starts, in m from the start line (negative = behind it) */
  constructor(params = CONFIG.runner, dip = CONFIG.dip, startX = 0) {
    this.p = params;
    this.dip = dip;
    this.startX = startX;
    this.reset();
  }

  reset() {
    this.x = this.startX; // meters from the start line
    this.prevX = this.x;
    this.v = 0; // m/s
    this.phase = 0; // stride animation phase (radians)
    this.started = false;
    this.lastTapT = 0;
    this.avgInterval = null; // smoothed seconds between valid taps
    this.taps = 0;
    this.lastStumbleT = -Infinity;
    this.cruise = false; // true: keep the current pace without tapping (see cadence())
    this.fallFrom = this.fallUntil = -Infinity;
    this.fallSpeed = 0;
    this.finished = false; // true after crossing the line: brake, ignore taps
    // Finish-lean state. 'run' -> 'carry' (in the lean zone: strides stop counting,
    // momentum carries you) -> 'lean' (torso pitched forward at the line).
    this.mode = 'run';
    this.leanT = 0;
    this.reach = 0; // meters the chest is ahead of the hips (the chest is what crosses the line)
    this.prevFront = this.front;
    this.dipUsed = false;
  }

  /**
   * Leading edge of the torso. Finish times are taken when this crosses the line,
   * as in real track: the torso counts, not the head, arms, legs or feet. Running
   * upright the chest is torsoLead ahead of the hips; a lean pushes it out to
   * `reach`.
   */
  get front() {
    return this.x + Math.max(this.dip.torsoLead, this.reach);
  }

  /** Enter the dip zone: stop reacting to strides, carry your speed. */
  carry() {
    // Only a runner with real momentum can coast: a slow one keeps running normally.
    if (this.mode === 'run' && !this.dipUsed && !this.finished && this.v >= this.dip.minCarrySpeed) this.mode = 'carry';
  }

  /** Distance from the line at which a lean puts the chest at full stretch right on it. */
  idealDipDistance() {
    return this.v * this.dip.riseTime + this.dip.reach;
  }

  /** Lean for the line. Returns false if a lean isn't possible now. */
  lean() {
    if (this.dipUsed || this.finished || !this.started) return false;
    this.mode = 'lean';
    this.dipUsed = true;
    this.leanT = 0;
    return true;
  }

  /** How far into the lean the body is, 0 (upright) .. 1 (full lean). */
  get leanAmount() {
    return this.mode === 'lean' ? this.reach / this.dip.reach : 0;
  }

  /** The gun: start the clock for tap intervals. */
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
    if (!first && interval < this.p.minStrideInterval) return 'fast';
    if (first) {
      // Explode out of the blocks: start at startSpeed with your pace assumed to
      // be startPace. From here your real taps pull the pace toward your actual
      // rhythm, so you start fast and only slow down if you can't keep it up.
      this.v = Math.max(this.v, this.p.startSpeed);
      this.avgInterval = 1 / this.p.startPace;
    } else {
      const iv = Math.min(interval, this.p.maxIntervalForAvg);
      this.avgInterval += this.p.cadenceSmoothing * (iv - this.avgInterval);
    }
    this.lastTapT = t;
    this.taps++;
    return 'ok';
  }

  /** Stumble (hurdles trip): from time `from`, for `dur` s, speed is capped at `speed`; then you build up again. */
  fall(from, dur, speed) {
    this.fallFrom = from;
    this.fallUntil = from + dur;
    this.fallSpeed = speed;
  }

  /** Measure the next stride's interval from time t (e.g. when new buttons appear), not from the last stride. */
  restartInterval(t) {
    this.lastTapT = t;
  }

  /** A wrong input at time t: lose some speed on the spot. */
  stumble(speedLoss, t = null) {
    if (this.mode === 'run' && !this.finished) this.v = Math.max(0, this.v - speedLoss);
    if (t != null) this.lastStumbleT = t; // the hurdles check this: a broken rhythm clips the next hurdle
  }

  /** Current effective cadence (taps/s). Decays on its own if you stop tapping. */
  cadence(t) {
    if (this.avgInterval == null) return 0;
    if (this.cruise) return 1 / this.avgInterval; // holding the pace you set (hurdles, between button sets)
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
    if (this.mode === 'lean') {
      this.updateLean(dt);
    } else if (this.finished) {
      this.v = Math.max(0, this.v - p.finishDecel * dt);
    } else if (this.mode === 'carry') {
      this.v = Math.max(0, this.v - this.dip.carryDecel * dt);
      if (this.v < this.dip.minCarrySpeed) this.mode = 'run';
    } else if (this.started && t >= this.fallFrom && t < this.fallUntil) {
      this.v = Math.min(this.v, this.fallSpeed); // stumbling: speed knocked down, no acceleration
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
    this.phase += ((this.v * dt) / (p.strideBase + p.stridePerMps * this.v)) * Math.PI * 2;
  }

  /**
   * The finish lean (from footage of the original): the legs keep running while
   * the torso pitches forward, pushing the chest up to `reach` meters ahead
   * (smoothstep over riseTime). The lean is held for holdTime, then the runner
   * straightens up over recoverTime. Once the lean starts to come back up, the
   * runner slows at postLeanDecel. Lean at the right moment and your chest is
   * at full stretch on the line. Lean too early and you're upright and slowing
   * by the time you get there, and a rival who timed it well can pass you.
   */
  updateLean(dt) {
    const d = this.dip;
    this.leanT += dt;
    const t = this.leanT;
    const smooth = (k) => k * k * (3 - 2 * k);
    let k;
    if (t < d.riseTime) k = smooth(t / d.riseTime);
    else if (t < d.riseTime + d.holdTime) k = 1;
    else k = 1 - smooth(Math.min(1, (t - d.riseTime - d.holdTime) / d.recoverTime));
    this.reach = d.reach * k;
    const recovering = t >= d.riseTime + d.holdTime;
    if (this.finished) {
      this.v = Math.max(0, this.v - this.p.finishDecel * dt);
      if (t >= d.riseTime + d.holdTime + d.recoverTime) this.mode = 'run'; // lean over: normal braking
    } else {
      const decel = recovering ? d.postLeanDecel : d.leanDecel;
      this.v = Math.max(Math.min(this.v, d.minLeanSpeed), this.v - decel * dt);
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
