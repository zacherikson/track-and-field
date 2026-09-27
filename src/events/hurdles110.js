import { CONFIG } from '../config.js';
import { clamp } from '../core/math.js';
import { LaneRace } from './laneRace.js';
import { ButtonSet, HurdleRun, HurdleAI, hurdlePositions } from './hurdleRules.js';
import { hurdlePose, tripPose } from '../athletes/stickFigure.js';
import { ORANGE, RIM, drawPad, drawX, drawNumberButton } from '../render/pads.js';

const SLOT_KEYS = [['ArrowLeft', 'KeyA'], ['ArrowDown', 'KeyS'], ['ArrowRight', 'KeyD']];
const NUMBER_KEYS = { Digit1: 1, Numpad1: 1, Digit2: 2, Numpad2: 2, Digit3: 3, Numpad3: 3 };
const DIP_KEYS = ['Space', 'ArrowUp'];

/**
 * 110m Hurdles, as in the original (from gameplay footage):
 * - At GO, and every time you go over a hurdle, three blue numbered buttons
 *   appear along the top in a shuffled order. Tap 1, 2, 3 wherever they are.
 *   Each tapped button vanishes, leaving an expanding ring.
 * - A wrong number turns into a red ✕ and is lost (no stride for it); carry on
 *   with the lowest number left.
 * - With no buttons left you run on at the pace you set until the next hurdle,
 *   where the next set appears. ANY error in the set (a wrong number, or a
 *   button not tapped in time) and you trip at that hurdle: you catch it and
 *   knock it down, and stumble on (arms flailing, speed knocked down) without
 *   falling.
 * - 7 hurdles. After the last one the two outer spots turn orange: press both
 *   to lean, as in the 100m.
 * Each button's hit zone is its third of the screen. Rules in hurdleRules.js;
 * start, rivals and finish are the shared lane race.
 */
export class Hurdles110 extends LaneRace {
  constructor(ev) {
    super(ev, { ...CONFIG.sprint100, ...CONFIG.hurdles110 });
    // Same rival skill levels, with set-reading speeds for hurdles and the same miss price as you.
    this.difficulty = { ...CONFIG.ai[this.level], ...this.cfg.ai[this.level], missSpeedLoss: this.cfg.missSpeedLoss };
  }

  enter() {
    this.runnerParams = { ...CONFIG.runner, ...this.cfg.runner };
    this.positions = hurdlePositions(this.cfg.hurdles);
    this.slotPos = [0, 1, 2].map(() => ({ x: 0, y: 0 }));
    this.rings = []; // { slot, t0 }
    super.enter();
    this.set = new ButtonSet(this.player.runner, this.cfg);
  }

  createAI(runner, prev = null) {
    return new HurdleAI(runner, this.difficulty, prev?.skill);
  }

  onResetField() {
    for (const a of this.athletes) a.hurdles = new HurdleRun(this.positions, this.cfg.clear);
  }

  onResize(view) {
    super.onResize(view);
    const b = this.cfg.buttons;
    const r = b.radius;
    this.slotPos = b.slotsX.map((fx) => ({
      x: clamp(view.w * fx, view.safe.l + r + 12, view.w - view.safe.r - r - 12),
      y: view.h * b.y,
    }));
  }

  onCountdown() {
    this.rings = [];
    if (this.set) this.set.slots = null;
  }

  onGo() {
    this.set.start(this.goT);
  }

  /** After each physics step: hurdle takeoffs, and the new button set each one brings. */
  afterStep(a, t) {
    const ctrl = a.isPlayer ? this.set : a.ai;
    const hop = a.hurdles?.update(a.runner, t, ctrl.faults);
    if (!hop) return;
    if (hop.last) ctrl.stop();
    else ctrl.start(t);
    if (a.isPlayer && hop.trip) navigator.vibrate?.(80);
  }

  /** Player numbers for the results screen. */
  raceStats() {
    const trips = this.player.hurdles.trips;
    const st = this.set.setTimes;
    return {
      hits: this.set.hits,
      misses: this.set.misses,
      topSpeed: this.playerTopV ?? 0,
      input: this.inputStats(),
      extra: `${trips} ${trips === 1 ? 'trip' : 'trips'}`,
      paceText: st.length ? `avg set ${(st.reduce((a, b) => a + b, 0) / st.length).toFixed(2)}s` : null,
    };
  }

  /** Taps: the slot (0 left, 1 centre, 2 right) by screen third; halves in the lean zone. */
  mapInput(e) {
    const carry = this.player.runner.mode === 'carry';
    if (e.type === 'down') {
      const w = this.game.view.w;
      if (carry) return e.x < w / 2 ? 'L' : 'R';
      return e.x < w / 3 ? 0 : e.x < (2 * w) / 3 ? 1 : 2;
    }
    if (DIP_KEYS.includes(e.code)) return 'DIP';
    const slot = SLOT_KEYS.findIndex((keys) => keys.includes(e.code));
    if (slot >= 0) return carry ? (slot === 0 ? 'L' : slot === 2 ? 'R' : null) : slot;
    const n = NUMBER_KEYS[e.code]; // a number key presses wherever that number is
    if (n && !carry && this.set?.slots) return this.set.slots.indexOf(n);
    return null;
  }

  onPlayerAction(slot, t) {
    if (typeof slot !== 'number') return 'ignored';
    const result = this.set.press(slot, t);
    if (result === 'hit') this.rings.push({ slot, t0: t });
    else if (result === 'miss') navigator.vibrate?.(40);
    return result;
  }

  updateControls() {
    const now = this.game.time;
    this.rings = this.rings.filter((ring) => now - ring.t0 < this.cfg.pads.hitRing.duration);
  }

  poseFor(a) {
    let pose = super.poseFor(a);
    if (this.state !== 'race' && this.state !== 'finished') return pose;
    const k = a.hurdles?.hopProgress(a.runner.x);
    if (k != null) pose = hurdlePose(pose, Math.pow(Math.sin(Math.PI * k), 0.6));
    // Caught the hurdle: stumble on from the hurdling pose.
    const trip = a.hurdles?.tripAge(this.game.time);
    return trip != null ? tripPose(pose, trip, this.cfg.clear.trip) : pose;
  }

  // ---------------------------------------------------------------- drawing

  drawControls(ctx) {
    if (this.state !== 'race') return;
    const mode = this.player.runner.mode;
    const now = this.game.time;
    const r = this.cfg.buttons.radius;
    const set = this.set;
    if (mode === 'run' && set.slots) {
      const fade = clamp((now - set.shownT) / this.cfg.buttons.fadeIn, 0, 1);
      set.slots.forEach((n, i) => {
        const { x, y } = this.slotPos[i];
        if (set.state[i] === 'lost') {
          // A wrong number turns into a red ✕, then it's gone.
          if (now - set.lostT[i] < this.cfg.pads.missX + 0.05) drawX(ctx, x, y);
          return;
        }
        if (set.state[i] !== 'live') return;
        ctx.save();
        ctx.globalAlpha = fade;
        drawNumberButton(ctx, x, y, r, n);
        ctx.restore();
      });
    } else if (mode === 'carry') {
      drawPad(ctx, ORANGE, this.slotPos[0].x, this.slotPos[0].y, r);
      drawPad(ctx, ORANGE, this.slotPos[2].x, this.slotPos[2].y, r);
    }
    for (const ring of this.rings) this.drawHitRing(ctx, this.slotPos[ring.slot], r, now - ring.t0);
  }

  drawHitRing(ctx, pos, r, age) {
    const cfg = this.cfg.pads.hitRing;
    const k = clamp(age / cfg.duration, 0, 1);
    const grow = 1 - (1 - k) * (1 - k);
    ctx.save();
    ctx.globalAlpha = Math.pow(1 - k, 1.2);
    ctx.strokeStyle = RIM;
    ctx.lineWidth = r * (0.12 - 0.06 * k);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r * (0.95 + (cfg.grow - 0.95) * grow), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The hurdles in one lane, drawn just before that lane's athlete. Two posts
   * inset from the lane lines (the top bar follows the perspective), little
   * feet pointing back toward the start, and a striped top bar. A hurdle you
   * trip over tips forward and lies flat.
   */
  drawLaneProps(ctx, view, a) {
    const tr = this.track;
    const cam = this.camera;
    const now = this.game.time;
    const pxPerM = cam.ppm * tr.figureScale(a.lane); // same scale as the athletes
    const hh = this.cfg.hurdles.height * pxPerM;
    const zN = tr.zNear + a.lane - 1 + 0.3;
    const zF = tr.zNear + a.lane - 0.3;
    this.positions.forEach((hx, i) => {
      const n = tr.project(cam, view, hx, zN);
      const f = tr.project(cam, view, hx, zF);
      if (Math.max(n.x, f.x) < -hh || Math.min(n.x, f.x) > view.w + hh) return;
      n.y += 4;
      f.y += 4;
      // Knocked down: starts to tip as the body reaches it (~0.18 s after takeoff).
      const kt = a.hurdles?.knocked.get(i);
      const ang = kt == null ? 0 : clamp((now - kt - 0.18) / 0.22, 0, 1) * 1.45;
      const dx = Math.sin(ang) * hh;
      const dy = -Math.cos(ang) * hh;
      const lw = Math.max(2, 0.035 * pxPerM);
      ctx.lineCap = 'round';
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
