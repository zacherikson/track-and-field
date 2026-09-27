/**
 * Random stride targets: the heart of the 100m's skill.
 *
 * Each target appears on a random side, with one rule: never more than
 * `maxSameSide` (2) in a row on the same side. Two lefts in a row means the next
 * one MUST be right, so a sharp player pre-empts it. Reading the pattern beats
 * mashing.
 *
 * Pure logic (no DOM), shared by the game and tools/simulate.mjs.
 */

const other = (side) => (side === 'L' ? 'R' : 'L');

export class TargetSequence {
  constructor({ maxSameSide = 2, switchChance = 0.5 } = {}, rng = Math.random) {
    this.maxSameSide = maxSameSide;
    this.switchChance = switchChance;
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.last = null;
    this.run = 0; // how many targets in a row on `last`
  }

  /** True if the next target's side is already determined by the rule. */
  get forced() {
    return this.last !== null && this.run >= this.maxSameSide;
  }

  next() {
    let side;
    if (this.last === null) side = this.rng() < 0.5 ? 'L' : 'R';
    else if (this.forced) side = other(this.last);
    else side = this.rng() < this.switchChance ? other(this.last) : this.last;
    this.run = side === this.last ? this.run + 1 : 1;
    this.last = side;
    return side;
  }
}

/**
 * Judges presses against the current target and drives the Runner.
 *
 *   press on the lit side          -> 'hit'   (a stride; next target appears)
 *   press on the other side        -> 'miss'  (stumble: lose speed, brief lockout)
 *   press during a miss lockout    -> 'locked'
 *   press within minStrideInterval of the last hit -> 'double press' (ignored,
 *     so drumming both thumbs at once can't score two strides per chord)
 *   no target / runner not running -> 'no target' / 'not running' (ignored)
 */
export class StrideTargets {
  constructor(runner, cfg, rng = Math.random) {
    this.runner = runner;
    this.cfg = cfg;
    this.seq = new TargetSequence(cfg, rng);
    this.target = null;
    this.lockedUntil = -Infinity;
    this.lastHitT = -Infinity;
    this.hits = 0;
    this.misses = 0;
  }

  /** The gun: first target appears. */
  start(t) {
    this.seq.reset();
    this.target = this.seq.next();
    this.targetT = t;
    this.lockedUntil = -Infinity;
    this.lastHitT = -Infinity;
  }

  press(side, t) {
    if (this.target == null) return 'no target';
    if (t < this.lockedUntil) return 'locked';
    if (t - this.lastHitT < this.runner.p.minStrideInterval) return 'double press';
    if (side !== this.target) {
      this.misses++;
      this.lockedUntil = t + this.cfg.missLockout;
      this.runner.stumble(this.cfg.missSpeedLoss, t);
      return 'miss';
    }
    if (this.runner.stride(t) !== 'ok') return 'not running';
    this.hits++;
    this.lastHitT = t;
    this.target = this.seq.next();
    this.targetT = t;
    return 'hit';
  }
}
