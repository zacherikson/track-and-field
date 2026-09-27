import { CONFIG } from '../config.js';
import { clamp } from '../core/math.js';
import { text } from '../core/ui.js';
import { LaneRace } from './laneRace.js';
import { SequenceJudge, HurdleRun, hurdlePositions } from './hurdleRules.js';
import { hurdlePose } from '../athletes/stickFigure.js';
import { GREEN, ORANGE, RIM, drawPad, drawX } from '../render/pads.js';

const KEYS = {
  1: ['Digit1', 'Numpad1', 'ArrowLeft', 'KeyA'],
  2: ['Digit2', 'Numpad2', 'ArrowDown', 'KeyS'],
  3: ['Digit3', 'Numpad3', 'ArrowRight', 'KeyD'],
};
const DIP_KEYS = ['Space', 'ArrowUp'];

/**
 * 110m Hurdles: three buttons, 1-2-3 in order, over and over. Each correct tap
 * is a stride. The hurdles are jumped automatically, but a wrong tap just
 * before one (or coming in too slow) clips it: it falls over and you lose a lot
 * of speed. Rules in hurdleRules.js; the start, rivals and finish lean are the
 * shared lane race.
 *
 * Controls: the three buttons sit left, centre and right; the hit zones are
 * the screen's thirds, so a thumb near a button always counts for it. The
 * button you owe next is lit green, the other two are dimmed. In the lean zone
 * (after the last hurdle) the outer two turn orange, as in the 100m.
 */
export class Hurdles110 extends LaneRace {
  constructor(ev) {
    super(ev, { ...CONFIG.sprint100, ...CONFIG.hurdles110 });
    // Same rival skill levels, but with a hurdles tapping pace and the same miss price as you.
    this.difficulty = { ...CONFIG.ai[this.level], ...this.cfg.ai[this.level], missSpeedLoss: this.cfg.missSpeedLoss };
  }

  enter() {
    this.runnerParams = { ...CONFIG.runner, ...this.cfg.runner };
    this.positions = hurdlePositions(this.cfg.hurdles);
    const r = this.cfg.pads.radius;
    this.pads = { 1: { home: { x: 0, y: 0 }, r }, 2: { home: { x: 0, y: 0 }, r }, 3: { home: { x: 0, y: 0 }, r } };
    this.missBtn = null;
    this.missT = -Infinity;
    this.rings = []; // { btn, t0 }
    super.enter();
    this.judge = new SequenceJudge(this.player.runner, this.cfg);
  }

  onResetField() {
    for (const a of this.athletes) a.hurdles = new HurdleRun(this.positions, this.cfg.clear);
  }

  onResize(view) {
    super.onResize(view);
    const p = this.cfg.pads;
    const y = view.h * p.homeY;
    this.pads[1].home = { x: view.safe.l + p.edgeInset + p.radius, y };
    this.pads[2].home = { x: view.w / 2, y };
    this.pads[3].home = { x: view.w - view.safe.r - p.edgeInset - p.radius, y };
  }

  onCountdown() {
    this.missBtn = null;
    this.rings = [];
    if (this.judge) this.judge.expected = null;
  }

  onGo() {
    this.judge.start();
  }

  afterStep(a, t) {
    const ev = a.hurdles?.update(a.runner, t);
    if (ev === 'clip' && a.isPlayer) navigator.vibrate?.(60);
  }

  /** Player numbers for the results screen. */
  raceStats() {
    const clips = this.player.hurdles.clips;
    return {
      hits: this.judge.hits,
      misses: this.judge.misses,
      topSpeed: this.playerTopV ?? 0,
      input: this.inputStats(),
      extra: `${clips} ${clips === 1 ? 'hurdle' : 'hurdles'} hit`,
    };
  }

  mapInput(e) {
    const carry = this.player.runner.mode === 'carry';
    if (e.type === 'down') {
      const w = this.game.view.w;
      if (carry) return e.x < w / 2 ? 'L' : 'R';
      return e.x < w / 3 ? 1 : e.x < (2 * w) / 3 ? 2 : 3;
    }
    if (DIP_KEYS.includes(e.code)) return 'DIP';
    for (const b of [1, 2, 3]) {
      if (KEYS[b].includes(e.code)) return carry ? (b === 1 ? 'L' : b === 3 ? 'R' : null) : b;
    }
    return null;
  }

  onPlayerAction(btn, t) {
    if (typeof btn !== 'number') return 'ignored';
    const result = this.judge.press(btn, t);
    if (result === 'hit') this.rings.push({ btn, t0: t });
    else if (result === 'miss') {
      this.missBtn = btn;
      this.missT = t;
      navigator.vibrate?.(40);
    }
    return result;
  }

  updateControls() {
    const now = this.game.time;
    this.rings = this.rings.filter((ring) => now - ring.t0 < this.cfg.pads.hitRing.duration);
  }

  poseFor(a) {
    const pose = super.poseFor(a);
    const k = a.hurdles?.hopProgress(a.runner.x);
    if (k == null || (this.state !== 'race' && this.state !== 'finished')) return pose;
    return hurdlePose(pose, Math.pow(Math.sin(Math.PI * k), 0.6));
  }

  // ---------------------------------------------------------------- drawing

  drawControls(ctx) {
    if (this.state !== 'race') return;
    const mode = this.player.runner.mode;
    const now = this.game.time;
    const P = this.pads;
    if (mode === 'run' && this.judge.expected) {
      for (const b of [1, 2, 3]) {
        const { x, y } = P[b].home;
        const next = b === this.judge.expected;
        ctx.save();
        ctx.globalAlpha = next ? 1 : 0.28;
        drawPad(ctx, GREEN, x, y, P[b].r);
        ctx.restore();
        text(ctx, String(b), x, y + 2, { size: 40, weight: 800, color: next ? '#fff' : 'rgba(255,255,255,0.55)', shadow: next });
      }
      if (now - this.missT < this.cfg.pads.missX) drawX(ctx, P[this.missBtn].home.x, P[this.missBtn].home.y);
    } else if (mode === 'carry') {
      drawPad(ctx, ORANGE, P[1].home.x, P[1].home.y, P[1].r);
      drawPad(ctx, ORANGE, P[3].home.x, P[3].home.y, P[3].r);
    }
    for (const ring of this.rings) this.drawHitRing(ctx, P[ring.btn], now - ring.t0);
  }

  drawHitRing(ctx, pad, age) {
    const cfg = this.cfg.pads.hitRing;
    const k = clamp(age / cfg.duration, 0, 1);
    const grow = 1 - (1 - k) * (1 - k);
    ctx.save();
    ctx.globalAlpha = Math.pow(1 - k, 1.2);
    ctx.strokeStyle = RIM;
    ctx.lineWidth = pad.r * (0.12 - 0.06 * k);
    ctx.beginPath();
    ctx.arc(pad.home.x, pad.home.y, pad.r * (0.95 + (cfg.grow - 0.95) * grow), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The hurdles in one lane, drawn just before that lane's athlete. Each has two
   * posts at the lane's near and far edges (so the top bar follows the
   * perspective) with little feet pointing back toward the start, and a
   * striped top bar. A knocked hurdle tips forward and lies flat.
   */
  drawLaneProps(ctx, view, a) {
    const tr = this.track;
    const cam = this.camera;
    const now = this.game.time;
    const pxPerM = cam.ppm * tr.figureScale(a.lane); // same scale as the athletes
    const hh = this.cfg.hurdles.height * pxPerM;
    const zN = tr.zNear + a.lane - 1 + 0.3; // posts inset from the lane lines so neighbouring hurdles don't join up
    const zF = tr.zNear + a.lane - 0.3;
    this.positions.forEach((hx, i) => {
      const n = tr.project(cam, view, hx, zN);
      const f = tr.project(cam, view, hx, zF);
      if (Math.max(n.x, f.x) < -hh || Math.min(n.x, f.x) > view.w + hh) return;
      n.y += 4;
      f.y += 4;
      const kt = a.hurdles?.knocked.get(i);
      const ang = kt == null ? 0 : clamp((now - kt) / 0.22, 0, 1) * 1.45; // tips forward
      const dx = Math.sin(ang) * hh;
      const dy = -Math.cos(ang) * hh;
      const lw = Math.max(2, 0.035 * pxPerM);
      ctx.lineCap = 'round';
      // Feet and posts, far side first.
      for (const p of [f, n]) {
        ctx.strokeStyle = '#2d3340';
        ctx.lineWidth = lw * 1.3;
        ctx.beginPath();
        ctx.moveTo(p.x - 0.45 * pxPerM, p.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.strokeStyle = '#8b93a3';
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + dx, p.y + dy);
        ctx.stroke();
      }
      // Top bar: white with black bands.
      const bw = Math.max(4, 0.09 * pxPerM);
      const x0 = f.x + dx, y0 = f.y + dy, x1 = n.x + dx, y1 = n.y + dy;
      ctx.lineCap = 'butt';
      ctx.lineWidth = bw;
      const bands = 5;
      for (let b = 0; b < bands; b++) {
        ctx.strokeStyle = b % 2 ? '#111' : '#fff';
        ctx.beginPath();
        ctx.moveTo(x0 + ((x1 - x0) * b) / bands, y0 + ((y1 - y0) * b) / bands);
        ctx.lineTo(x0 + ((x1 - x0) * (b + 1)) / bands, y0 + ((y1 - y0) * (b + 1)) / bands);
        ctx.stroke();
      }
    });
  }
}
