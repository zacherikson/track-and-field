import { CONFIG } from '../config.js';
import { Runner } from '../athletes/runner.js';
import { StrideTargets } from './strideTargets.js';
import { ORANGE, drawPad, drawX } from '../render/pads.js';
import { drawDrop, drawHitRing } from '../render/targetPads.js';

/**
 * YOUR RUN-UP in a field event (long jump, javelin, pole vault): the 100m's
 * green targets on the two pads, and the same Runner. The pure half, and the
 * rivals' run-ups, are runUpRules.js.
 *
 * Each round: begin() puts a new Runner at the back of the runway with the
 * first target up; stride() takes your taps (a hit is a stride, the wrong
 * side a stumble, as in the 100m); enterZone() stops the targets when you
 * reach the event's zone, where you carry your speed in and the event takes
 * over (the takeoff, the throw, the plant: its orange pads are its own).
 *
 * `stats` ({ hits, misses }) counts your taps over the whole competition.
 */
export class RunUp {
  constructor(stats) {
    this.stats = stats;
    const r = CONFIG.sprint100.pads.radius;
    this.pads = { L: { home: { x: 0, y: 0 }, r }, R: { home: { x: 0, y: 0 }, r } };
    this.rings = [];
  }

  /** The pads where the 100m has them. */
  layout(view) {
    const cfg = CONFIG.sprint100.pads;
    const y = view.h * cfg.homeY;
    this.pads.L.home = { x: view.safe.l + cfg.edgeInset + this.pads.L.r, y };
    this.pads.R.home = { x: view.w - view.safe.r - cfg.edgeInset - this.pads.R.r, y };
  }

  /** A new run-up from `startX` at time t; `rng`: the targets' random numbers (live: the same for everyone). Returns the Runner. */
  begin(startX, t, rng) {
    this.runner = new Runner(undefined, undefined, startX);
    this.judge = new StrideTargets(this.runner, CONFIG.sprint100.targets, rng);
    this.runner.go(t); // the first tap's interval is your reaction to the first target
    this.judge.start(t);
    this.spawnT = -Infinity; // the first target just appears; later ones drop in
    this.rings = [];
    this.missSide = null;
    this.missT = -Infinity;
    this.zoneT = null; // when the targets stopped for the event's zone
    return this.runner;
  }

  /** Still on the targets (not in the zone yet). */
  get striding() {
    return this.zoneT == null;
  }

  /** A tap on side 'L' or 'R' at t: StrideTargets' answer ('hit', 'miss', ...). */
  stride(side, t) {
    if (side !== 'L' && side !== 'R') return null;
    const result = this.judge.press(side, t);
    if (result === 'hit') {
      this.stats.hits++;
      this.rings.push({ side, t0: t });
      this.spawnT = t;
      if (this.judge.target === this.missSide) this.missT = -Infinity;
    } else if (result === 'miss') {
      this.stats.misses++;
      this.missSide = side;
      this.missT = t;
      navigator.vibrate?.(40);
    }
    return result;
  }

  /** The event's zone, at t: the targets stop and you carry your speed in. */
  enterZone(t) {
    this.zoneT = t;
    this.judge.target = null;
    this.runner.carry();
  }

  /** The hit rings fade (`end`: the end of this frame). */
  update(end) {
    this.rings = this.rings.filter((ring) => end - ring.t0 < CONFIG.sprint100.pads.hitRing.duration);
  }

  /** True on the zone's orange blink (`blink`: the event's { period, on }). */
  blinkOn(now, blink) {
    return this.zoneT != null && (now - this.zoneT) % blink.period < blink.on;
  }

  /** The target to hit (and an X on a miss), while `running` and still on the targets. */
  drawTargets(ctx, now, running) {
    const cfg = CONFIG.sprint100.pads;
    if (!running || !this.striding || !this.judge.target) return;
    drawDrop(ctx, this.pads[this.judge.target], now - this.spawnT, cfg);
    if (now - this.missT < cfg.missX) drawX(ctx, this.pads[this.missSide].home.x, this.pads[this.missSide].home.y);
  }

  /** Both pads orange (`scale`: of their size). */
  drawOrange(ctx, scale = 1) {
    for (const p of [this.pads.L, this.pads.R]) drawPad(ctx, ORANGE, p.home.x, p.home.y, p.r * scale);
  }

  /** The rings left by your hits. */
  drawRings(ctx, now) {
    for (const ring of this.rings) drawHitRing(ctx, this.pads[ring.side], now - ring.t0, CONFIG.sprint100.pads);
  }
}
