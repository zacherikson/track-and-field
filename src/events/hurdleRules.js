/**
 * 110m Hurdles rules: the 1-2-3 buttons and clearing (or clipping) hurdles.
 *
 * Pure logic (no DOM), shared by the game and tools/simulate.mjs.
 *
 * Buttons: tap 1, 2, 3, 1, 2, 3... in order. Each correct tap is a stride
 * (feeds the Runner). A wrong or out-of-order tap stumbles you (lose speed) and
 * the button you still owe stays the same, so you just carry on from there.
 *
 * Hurdles (real 110m spacing: first at 13.72 m, then every 9.14 m, 10 in all):
 * every runner hops each one automatically. At takeoff the hurdle is CLIPPED if
 *   - you're too slow (speed under `minSpeed`), or
 *   - your rhythm just broke (a wrong tap within `rhythmWindow` s before
 *     takeoff, or any wrong tap during the hop before you're over the bar).
 * A clean clearance costs a little speed (`cleanLoss`), a clip costs a lot
 * (`clipLoss`) and knocks the hurdle over. Knocking hurdles down is legal in
 * real track, it just costs time.
 */

export const hurdlePositions = (h) => Array.from({ length: h.count }, (_, i) => h.first + i * h.spacing);

export class SequenceJudge {
  constructor(runner, cfg) {
    this.runner = runner;
    this.cfg = cfg;
    this.expected = null; // the button you owe next: 1, 2 or 3 (null before GO)
    this.hits = 0;
    this.misses = 0;
  }

  /** The gun: start at 1. */
  start() {
    this.expected = 1;
  }

  /** Returns 'hit', 'miss', 'no target' or 'not running'. */
  press(button, t) {
    if (this.expected == null) return 'no target';
    if (button !== this.expected) {
      this.misses++;
      this.runner.stumble(this.cfg.missSpeedLoss, t);
      return 'miss';
    }
    if (this.runner.stride(t) !== 'ok') return 'not running';
    this.hits++;
    this.expected = (this.expected % 3) + 1;
    return 'hit';
  }
}

/** One runner's way down the hurdle course. */
export class HurdleRun {
  constructor(positions, clear) {
    this.positions = positions;
    this.clear = clear;
    this.next = 0; // index of the next hurdle to take off for
    this.hop = null; // { i, x0, x1, clip, t0 } while going over a hurdle
    this.knocked = new Map(); // hurdle index -> time it was knocked
    this.clips = 0;
  }

  /** How far through the current hop (0..1), or null when not hurdling. */
  hopProgress(x) {
    if (!this.hop) return null;
    return Math.min(1, Math.max(0, (x - this.hop.x0) / (this.hop.x1 - this.hop.x0)));
  }

  /** Call after each physics step. Returns 'clear', 'clip' or null. */
  update(r, t) {
    const c = this.clear;
    let event = null;
    if (this.hop) {
      const h = this.hop;
      // A stumble while still short of the bar takes it down.
      if (!h.clip && r.lastStumbleT >= h.t0 && r.x < this.positions[h.i]) event = this.knock(r, h, t);
      if (r.x >= h.x1) this.hop = null;
    }
    if (!this.hop && this.next < this.positions.length) {
      const hx = this.positions[this.next];
      if (r.x >= hx - c.takeoff) {
        const h = { i: this.next, x0: hx - c.takeoff, x1: hx + c.landing, clip: false, t0: t };
        this.hop = h;
        this.next++;
        const tooSlow = r.v < c.minSpeed;
        const broken = t - r.lastStumbleT < c.rhythmWindow;
        if (tooSlow || broken) event = this.knock(r, h, t);
        else {
          r.v = Math.max(0, r.v - c.cleanLoss);
          event = 'clear';
        }
      }
    }
    return event;
  }

  knock(r, h, t) {
    h.clip = true;
    this.clips++;
    this.knocked.set(h.i, t);
    r.v = Math.max(0, r.v - this.clear.clipLoss);
    return 'clip';
  }
}
