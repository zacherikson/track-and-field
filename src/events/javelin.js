import { CONFIG } from '../config.js';
import { Camera } from '../core/camera.js';
import { clamp, rand, shuffle } from '../core/math.js';
import { text, roundRect } from '../core/ui.js';
import { Runner } from '../athletes/runner.js';
import { AIController } from '../athletes/ai.js';
import { player as chosenPlayer, rivals as rivalRoster, heightOf } from '../athletes/roster.js';
import { drawFigure, runPose, lerpPose, sampleTrack, handPos, headCircle, JAVELIN_POSES, POSES } from '../athletes/stickFigure.js';
import { StrideTargets } from './strideTargets.js';
import { angleAt, flightRange, rivalThrow } from './javelinRules.js';
import { JavelinRenderer, drawJavelin } from '../render/javelinField.js';
import { ORANGE, drawPad, drawX } from '../render/pads.js';
import { drawDrop, drawHitRing } from '../render/targetPads.js';
import { getDifficulty } from '../core/storage.js';
import { flow } from '../flow.js';

const LEFT_KEYS = ['ArrowLeft', 'KeyA', 'KeyZ', 'KeyF'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD', 'KeyX', 'KeyJ'];
const BOTH_KEYS = ['Space', 'ArrowUp'];
const G = 9.81;
const DEG = Math.PI / 180;
const RELEASE_H = 2.1; // m: the javelin leaves the hand this high
const FIG_H = CONFIG.figure.height;

/**
 * Javelin, from footage of the original (rules in javelinRules.js):
 * - Three throws; your best counts against five rivals' best.
 * - Run-up: the 100m's green targets, javelin over the shoulder.
 * - `zoneDistance` before the foul line the pads turn orange and blink:
 *   strides stop and you carry your speed.
 * - Press and HOLD both: the javelin is drawn back and its tip rises (sparks
 *   gather at its tail) while you keep running (crossover steps). LET GO to
 *   throw: block, arm over the top, fold forward and drop onto your hands.
 * - Too early and you waste the gap to the line; reach the line still holding,
 *   or let go past it: FOUL.
 * - The camera follows the javelin up over the stands and back down until it
 *   sticks in the grass; a line marks the spot with the distance. The ▶▶
 *   button skips straight to the landing. Tap to go on.
 *
 * States: 'ready' → 'run' (zoneT, holdT inside it) → 'throw' → 'flight' →
 * 'landed' → 'mark'; or 'run' → 'overrun' (FOUL) → 'mark'.
 */
export class Javelin {
  constructor(ev) {
    this.ev = ev;
    this.cfg = CONFIG.javelin;
    this.level = getDifficulty();
    this.lv = { ...CONFIG.ai[this.level], ...this.cfg.ai[this.level] };
    this.wantsReleases = true; // press-and-hold controls
  }

  enter() {
    this.track = new JavelinRenderer(this.cfg, this.ev.record);
    this.camera = new Camera();
    const me = chosenPlayer();
    this.player = { name: me.name, colors: me.colors, isPlayer: true, jumps: [] };
    this.rivals = shuffle(rivalRoster())
      .slice(0, 5)
      .map((r) => ({ name: r.name, colors: r.colors, isPlayer: false, jumps: [], cadence: rand(...this.lv.cadence) }));
    const r = CONFIG.sprint100.pads.radius;
    this.pads = { L: { home: { x: 0, y: 0 }, r }, R: { home: { x: 0, y: 0 }, r } };
    this.exitBtn = { x: 0, y: 0, w: 44, h: 40 };
    this.ffBtn = { x: 0, y: 0, r: 34 };
    this.stats = { hits: 0, misses: 0, topSpeed: 0 };
    this.round = 0;
    this.onResize(this.game.view);
    this.startRound();
  }

  exit() {
    this.game.input.wantReleases = false;
  }

  onResize(view) {
    const cfg = CONFIG.sprint100.pads;
    const y = view.h * cfg.homeY;
    this.pads.L.home = { x: view.safe.l + cfg.edgeInset + this.pads.L.r, y };
    this.pads.R.home = { x: view.w - view.safe.r - cfg.edgeInset - this.pads.R.r, y };
    this.exitBtn.x = 10 + view.safe.l;
    this.exitBtn.y = 8 + view.safe.t;
    this.ffBtn.x = view.w - view.safe.r - 60;
    this.ffBtn.y = view.h - 60;
  }

  get now() {
    return this.game.time;
  }

  startRound() {
    this.round++;
    const t = this.now;
    this.runner = new Runner(undefined, undefined, -this.cfg.runway);
    this.judge = new StrideTargets(this.runner, CONFIG.sprint100.targets);
    this.runner.go(t);
    this.judge.start(t);
    this.spawnT = -Infinity;
    this.rings = [];
    this.missSide = null;
    this.missT = -Infinity;
    this.zoneT = null; // orange pads up
    this.down = { L: null, R: null }; // thumbs down: { id, t }
    this.holdT = null; // both thumbs down: drawing the javelin back
    this.shot = null; // after letting go: { t0, x0, v, deg, range, foul, vx, vy, T, outT }
    this.flightT = null; // when the flight shot started
    this.landT = null;
    this.mark = null; // { mark } or { foul: true }
    this.sparks = [];
    this.lastPose = null;
    this.setState('ready');
    this.camera.snapTo(this.runner.x);
  }

  setState(s) {
    this.state = s;
    this.stateT = this.now;
  }

  // ---------------------------------------------------------------- input

  side(e) {
    if (e.type === 'down' || e.type === 'up') return e.x < this.game.view.w / 2 ? 'L' : 'R';
    if (LEFT_KEYS.includes(e.code)) return 'L';
    if (RIGHT_KEYS.includes(e.code)) return 'R';
    if (BOTH_KEYS.includes(e.code)) return 'BOTH';
    return null;
  }

  update(dt, t) {
    const end = t + dt;
    for (const e of this.game.input.consume(end)) {
      if (e.type === 'down' && this.hitExit(e)) return flow.menu(this.game);
      if (e.type === 'key' && e.code === 'Escape') return flow.menu(this.game);
      if (this.state === 'mark') {
        if (end - this.stateT > 0.4 && (e.type === 'down' || e.code === 'Enter' || e.code === 'Space')) return this.next();
        continue;
      }
      if (this.state === 'flight' && (e.code === 'Enter' || (e.type === 'down' && Math.hypot(e.x - this.ffBtn.x, e.y - this.ffBtn.y) < this.ffBtn.r + 10))) {
        this.land(end); // skip to where it landed
        continue;
      }
      const side = this.side(e);
      if (side == null) continue;
      if (e.type === 'down' || e.type === 'key') this.press(side, e);
      else this.lift(side, e);
    }
    this.simulate(dt, t);
    this.rings = this.rings.filter((ring) => end - ring.t0 < CONFIG.sprint100.pads.hitRing.duration);
  }

  press(side, e) {
    const t = e.t;
    if ((this.state === 'ready' || this.state === 'run') && this.zoneT == null) {
      if (side !== 'BOTH') this.stride(side, t);
      return;
    }
    if (this.state !== 'run' || this.holdT != null) return;
    const id = e.id ?? e.code;
    if (side === 'BOTH') this.down = { L: { id, t }, R: { id, t } };
    else this.down[side] = { id, t };
    const { L, R } = this.down;
    if (L && R && Math.abs(L.t - R.t) <= this.cfg.chordWindow) this.holdT = t;
    else if (L && R) this.holdT = t; // both down, however far apart: you're holding
  }

  lift(side, e) {
    const id = e.id ?? e.code;
    for (const s of ['L', 'R']) if (this.down[s]?.id === id) this.down[s] = null;
    if (this.state === 'run' && this.holdT != null && (this.down.L == null || this.down.R == null)) this.letGo(e.t);
  }

  stride(side, t) {
    const result = this.judge.press(side, t);
    if (result === 'hit') {
      this.stats.hits++;
      this.rings.push({ side, t0: t });
      this.spawnT = t;
      if (this.judge.target === this.missSide) this.missT = -Infinity;
      if (this.state === 'ready') this.setState('run');
    } else if (result === 'miss') {
      this.stats.misses++;
      this.missSide = side;
      this.missT = t;
      navigator.vibrate?.(40);
    }
  }

  /** Let go: the throw, at the angle you've reached, from where you are. */
  letGo(t) {
    const r = this.runner;
    const cfg = this.cfg;
    const deg = angleAt(t - this.holdT, cfg.angle);
    const range = flightRange(r.v, deg, cfg);
    // The flight: from the hand at RELEASE_H, launched at `deg`, landing `range` m on.
    const th = deg * DEG;
    const s2 = (G * range * range) / (2 * Math.cos(th) ** 2 * (RELEASE_H + range * Math.tan(th)));
    const sp = Math.sqrt(Math.max(1, s2));
    const vx = sp * Math.cos(th);
    const vy = sp * Math.sin(th);
    this.shot = { t0: t, x0: r.x, v: r.v, deg, range, foul: r.x > 0, vx, vy, T: range / vx, outT: t + cfg.throwTime };
    this.stats.topSpeed = Math.max(this.stats.topSpeed, r.v);
    r.finished = true; // brake at the line
    for (let i = 0; i < 18; i++) this.spark(t, 1);
    navigator.vibrate?.(25);
    this.setState('throw');
  }

  // ---------------------------------------------------------------- simulation

  simulate(dt, t) {
    const cfg = this.cfg;
    const r = this.runner;
    const end = t + dt;
    if (this.state === 'ready' || this.state === 'run' || this.state === 'overrun' || this.state === 'throw') {
      r.update(dt, t);
    }
    if (this.state === 'run') {
      if (this.zoneT == null && -r.x <= cfg.zoneDistance) {
        // Throw zone: strides stop, the pads turn orange and blink.
        this.zoneT = t;
        this.judge.target = null;
        r.carry();
      }
      if (this.holdT != null) this.spark(t, Math.min(1, (end - this.holdT) / 1.2));
      if (r.x > cfg.overrun) {
        // Reached the line still holding (or never pressed): foul.
        this.mark = { foul: true };
        this.stats.topSpeed = Math.max(this.stats.topSpeed, r.v);
        r.finished = true;
        this.setState('overrun');
      }
    } else if (this.state === 'overrun') {
      if (end - this.stateT > 1.4) this.showMark();
    } else if (this.state === 'throw') {
      if (end - this.shot.outT > 0.7) {
        this.flightT = end;
        this.setState('flight');
      }
    } else if (this.state === 'flight') {
      if (this.flightAge(end) >= this.shot.T) this.land(end);
    } else if (this.state === 'landed') {
      if (end - this.stateT > cfg.landHold) this.showMark();
    }
    for (const p of this.sparks) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.sparks = this.sparks.filter((p) => p.life > 0);
    this.camera.follow(r.x, r.v, dt);
  }

  /** Sparkles gathering at the javelin's tail (screen-space offsets, px). */
  spark(t, k) {
    const n = 1 + Math.round(2 * k);
    for (let i = 0; i < n; i++) {
      // A streaming trail behind the tail, as in the original.
      this.sparks.push({ x: rand(-6, 10), y: rand(-5, 5), vx: rand(-170, -40) * (0.4 + k), vy: rand(-25, 25) * (0.4 + k), life: rand(0.3, 0.7), r: rand(1.2, 3.4) * (0.7 + 0.8 * k) });
    }
  }

  /** Seconds of javelin flight at time t (the flight shot plays at `flight.speed`). */
  flightAge(t) {
    const s = this.shot;
    const early = this.flightT - s.outT;
    return early + (t - this.flightT) * this.cfg.flight.speed;
  }

  /** Javelin position (m; x from the line, y height) `ta` s after it left the hand. */
  javelinAt(ta) {
    const s = this.shot;
    const tt = Math.min(ta, s.T);
    return { x: s.x0 + 0.3 + s.vx * tt, y: RELEASE_H + s.vy * tt - 0.5 * G * tt * tt, ang: Math.atan2(s.vy - G * tt, s.vx) };
  }

  land(t) {
    const s = this.shot;
    const mark = s.x0 + s.range; // measured from the foul line
    this.mark = s.foul ? { foul: true } : { mark };
    this.landT = t;
    this.landAng = this.javelinAt(s.T).ang; // stuck at the angle it came down at
    navigator.vibrate?.(30);
    this.setState('landed');
  }

  showMark() {
    this.player.jumps.push(this.mark);
    for (const rv of this.rivals) {
      const level = { ...this.lv, cadence: [rv.cadence, rv.cadence] };
      rv.jumps.push(rivalThrow(level, this.cfg, () => this.rivalRunUp(rv)));
    }
    this.setState('mark');
  }

  /** A rival's speed arriving at the line (same physics as yours). */
  rivalRunUp(rv) {
    const step = CONFIG.loop.fixedStep;
    const r = new Runner(undefined, undefined, -this.cfg.runway);
    const ai = new AIController(r, this.lv, rv.cadence);
    ai.go(0);
    let t = 0;
    while (r.x < -1 && t < 20) {
      if (-r.x <= this.cfg.zoneDistance) r.carry();
      ai.update(t, step, 0, Infinity);
      r.update(step, t);
      t += step;
    }
    return r.v;
  }

  next() {
    if (this.round < this.cfg.rounds) this.startRound();
    else this.finish();
  }

  best(a) {
    const ok = a.jumps.filter((j) => !j.foul).map((j) => j.mark);
    return ok.length ? Math.max(...ok) : null;
  }

  finish() {
    const all = [this.player, ...this.rivals];
    const results = all.map((a) => {
      const b = this.best(a);
      return { name: a.name, colors: a.colors, isPlayer: a.isPlayer, mark: b, status: b == null ? 'nm' : 'ok' };
    });
    results.sort((a, b) => (b.mark ?? -1) - (a.mark ?? -1));
    const fouls = this.player.jumps.filter((j) => j.foul).length;
    flow.results(this.game, this.ev, results, {
      hits: this.stats.hits,
      misses: this.stats.misses,
      topSpeed: this.stats.topSpeed,
      extra: `${fouls} ${fouls === 1 ? 'foul' : 'fouls'}`,
      paceText: `throws ${this.player.jumps.map((j) => (j.foul ? 'X' : j.mark.toFixed(2))).join(' / ')}`,
    });
  }

  hitExit(e) {
    const b = this.exitBtn;
    return e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h;
  }

  // ---------------------------------------------------------------- drawing

  /** The javelin's angle in the hand right now (deg, tip up). */
  heldAngle() {
    if (this.shot) return this.shot.deg;
    if (this.holdT == null) return 0;
    return angleAt(this.now - this.holdT, this.cfg.angle);
  }

  poseFor() {
    const now = this.now;
    const r = this.runner;
    const J = JAVELIN_POSES;
    const run = () => runPose(r.phase, clamp(r.v / 11, 0.15, 1), 0);
    switch (this.state) {
      case 'ready': {
        const s = Math.sin(now * 1.7);
        return { ...POSES.stand, hipY: POSES.stand.hipY + 0.006 * s, lean: POSES.stand.lean + 0.02 * s, arms: J.carryArms };
      }
      case 'run': {
        const p = run();
        if (this.holdT == null) return { ...p, arms: [J.carryArms[0], p.arms[1]] };
        // Drawing the javelin back while the legs keep running (crossover steps).
        const k = clamp((now - this.holdT) / 0.25, 0, 1);
        const carry = { ...p, arms: [J.carryArms[0], p.arms[1]] };
        const back = { ...p, lean: -0.12, arms: J.withdrawArms };
        return lerpPose(carry, back, k * k * (3 - 2 * k));
      }
      case 'overrun':
        return r.v > 2 ? { ...run(), arms: J.withdrawArms } : lerpPose({ ...run(), arms: J.withdrawArms }, POSES.stand, 1 - r.v / 2);
      default: {
        // Let go: block, arm over the top, fold forward, down onto the hands, get up.
        const s = this.shot;
        if (!s) return POSES.stand;
        const age = now - s.t0;
        const T = this.cfg.throwTime;
        const from = this.lastRunPose ?? { ...run(), arms: J.withdrawArms };
        return sampleTrack([
          [0, from],
          [T * 0.45, J.brace],
          [T, J.release],
          [T + 0.16, J.follow],
          [T + 0.4, J.lunge],
          [T + 1.3, J.lunge],
          [T + 1.8, { ...POSES.stand, hipX: J.lunge.hipX }],
        ], age);
      }
    }
  }

  render(ctx, view) {
    // The flight shot carries on to the landing: the javelin sticks in the grass and the mark line appears.
    if (this.state === 'flight' || this.state === 'landed' || (this.state === 'mark' && this.flightT != null)) return this.renderFlight(ctx, view);
    const tr = this.track;
    tr.draw(ctx, view, this.camera);
    const pxPerM = this.camera.ppm * tr.figureScale(1);
    const H = FIG_H * pxPerM * heightOf(this.player.colors);
    const ground = tr.toScreen(this.camera, view, this.runner.x, 1);
    const groundY = ground.y + 4;
    const pose = this.poseFor();
    if (this.state === 'run') this.lastRunPose = pose;
    this.drawReferee(ctx, view, pxPerM);
    // The javelin behind the near arm: in the hand until it leaves, then flying.
    const s = this.shot;
    const hand = handPos(ground.x, groundY, H, pose, 0);
    const len = this.cfg.javelinLength * pxPerM;
    if (!s || this.now < s.outT) {
      const ang = this.javelinHandAngle(pose);
      // Gripped a little behind its middle: more of it ahead of the hand.
      const c = { x: hand.x + Math.cos(ang) * len * 0.1, y: hand.y - Math.sin(ang) * len * 0.1 };
      drawFigure(ctx, ground.x, groundY, H, pose, this.player.colors);
      drawJavelin(ctx, c.x, c.y, len, ang, Math.max(3, 0.03 * H));
      this.drawSparks(ctx, { x: c.x - Math.cos(ang) * len * 0.5, y: c.y + Math.sin(ang) * len * 0.5 });
    } else {
      const j = this.javelinAt(this.now - s.outT);
      const p = tr.toScreen(this.camera, view, j.x, 1);
      drawFigure(ctx, ground.x, groundY, H, pose, this.player.colors);
      drawJavelin(ctx, p.x, p.y + 4 - j.y * pxPerM, len, j.ang, Math.max(3, 0.03 * H));
      this.drawSparks(ctx, hand);
    }
    this.drawControls(ctx, view);
    this.drawHUD(ctx, view);
    if (this.state === 'mark') this.drawMark(ctx, view);
  }

  /** The javelin's angle on screen while in the hand: level when carried, the held angle when drawn back, over the top at the release. */
  javelinHandAngle() {
    const s = this.shot;
    const held = this.heldAngle() * DEG;
    if (!s) {
      if (this.holdT == null) return 0;
      return held * clamp((this.now - this.holdT) / 0.25, 0, 1);
    }
    return held;
  }

  drawSparks(ctx, at) {
    for (const p of this.sparks) {
      const a = clamp(p.life / 0.3, 0, 1);
      const x = at.x + p.x;
      const y = at.y + p.y;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(190,235,255,${a})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - p.r * 2, y);
      ctx.lineTo(x + p.r * 2, y);
      ctx.moveTo(x, y - p.r * 2);
      ctx.lineTo(x, y + p.r * 2);
      ctx.stroke();
    }
  }

  /**
   * The flight shot, followed through to the landing (as in the original): the
   * camera stays on the javelin until its tip goes into the grass, then a line
   * draws across the field where it landed, with the distance.
   */
  renderFlight(ctx, view) {
    const s = this.shot;
    const landed = this.state !== 'flight';
    const j = this.javelinAt(landed ? s.T : this.flightAge(this.now));
    const cam = { x: j.x, ppm: this.cfg.flight.ppm };
    const tr = this.track;
    tr.drawFlight(ctx, view, cam, j.x, j.y);
    const len = this.cfg.javelinLength * this.cfg.flight.ppm;
    // The javelin's tip is at (tipX, tipY) on screen; it comes down into the field at landY.
    const landY = tr.flightGround(view, 0) + 55;
    const tipX = view.w * 0.45;
    let ang = j.ang;
    let tipY = landY - j.y * 16;
    const age = landed ? this.now - this.landT : 0;
    if (landed) {
      ang = this.landAng + Math.sin(age * 30) * Math.exp(-age * 5) * 0.06; // quivering in the grass
      tipY = landY + len * 0.08; // tip sunk in
    }
    const cx = tipX - (Math.cos(ang) * len) / 2;
    const cy = tipY + (Math.sin(ang) * len) / 2;
    const lift = Math.max(0, view.h * 0.16 - cy); // keep the whole javelin on screen at the top of the climb
    if (landed) this.drawMarkLine(ctx, view, tipX, landY, age);
    drawJavelin(ctx, cx, cy + lift, len, ang, 5);
    if (landed) {
      // A little spray of turf where it went in.
      for (let i = 0; i < 6; i++) {
        const k = clamp(age / 0.4, 0, 1);
        ctx.fillStyle = `rgba(92,64,34,${0.8 * (1 - k)})`;
        ctx.beginPath();
        ctx.arc(tipX + (i - 2.5) * 7 * (0.5 + k), landY - 10 * Math.sin(Math.PI * k) * (1 + (i % 3)), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (!landed) this.drawSkipButton(ctx);
    this.drawHUD(ctx, view);
    if (!landed) text(ctx, `${Math.max(0, j.x).toFixed(1)} m`, view.w / 2, 40 + view.safe.t, { size: 30, color: '#fff', shadow: true });
    if (this.state === 'mark') this.drawMark(ctx, view);
  }

  /** The line across the field where the javelin landed, drawing out from the spot, with the distance (or FOUL). */
  drawMarkLine(ctx, view, x, y, age) {
    const tr = this.track;
    const top = tr.flightGround(view, 0);
    const k = clamp((age - 0.15) / 0.35, 0, 1);
    if (k <= 0) return;
    const foul = this.shot.foul;
    const slope = 0.35; // leans with the field's perspective: further away = further right
    const y0 = y - (y - top) * k;
    const y1 = y + (view.h - y) * k;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = foul ? '#e8281e' : '#ffffff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + (y - y0) * slope, y0);
    ctx.lineTo(x - (y1 - y) * slope, y1);
    ctx.stroke();
    ctx.restore();
    if (k < 1) return;
    const label = foul ? 'FOUL' : `${this.mark.mark.toFixed(2)} m`;
    const lx = x - (view.h - y) * slope * 0.55;
    const ly = y + (view.h - y) * 0.55;
    ctx.font = '800 26px system-ui, sans-serif';
    const w = ctx.measureText(label).width + 24;
    roundRect(ctx, lx + 14, ly - 20, w, 40, 10);
    ctx.fillStyle = foul ? 'rgba(200,30,30,0.9)' : 'rgba(12,22,44,0.85)';
    ctx.fill();
    text(ctx, label, lx + 14 + w / 2, ly, { size: 26, color: '#fff' });
  }

  /** ▶▶: skip the rest of the flight and go straight to where it landed. */
  drawSkipButton(ctx) {
    const b = this.ffBtn;
    ctx.fillStyle = 'rgba(20,24,40,0.85)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    for (const dx of [-12, 2]) {
      ctx.beginPath();
      ctx.moveTo(b.x + dx, b.y - 11);
      ctx.lineTo(b.x + dx + 14, b.y);
      ctx.lineTo(b.x + dx, b.y + 11);
      ctx.closePath();
      ctx.fill();
    }
  }

  /**
   * The official just past the foul line, on the far side (as in the
   * original): white uniform, red cap; raises a white flag for a fair throw,
   * a red one for a foul.
   */
  drawReferee(ctx, view, pxPerM) {
    const tr = this.track;
    const z = tr.zNear + 0.9;
    const p = tr.project(this.camera, view, 1.4, z);
    if (p.x < -60 || p.x > view.w + 60) return;
    const H = FIG_H * pxPerM * Math.pow(tr.scaleAt(z), 0.2) * 0.95;
    const y = p.y + 4;
    const s = this.shot;
    const foul = this.state === 'overrun' ? this.now - this.stateT > 0.4 : s && this.now - s.t0 > 0.6 ? s.foul : null;
    const up = foul != null && foul !== false ? true : s && this.now - s.t0 > 0.6;
    const pose = up
      ? { ...POSES.stand, arms: [{ upper: 2.9, fore: 3.05 }, { upper: -0.1, fore: 0.05 }] }
      : { ...POSES.stand, arms: [{ upper: -0.15, fore: 0.35 }, { upper: -0.2, fore: 0.3 }] };
    drawFigure(ctx, p.x, y, H, pose, { shirt: '#f2f2f2', shorts: '#f2f2f2', skin: '#f1c9a5' });
    const h = headCircle(p.x, y, H, pose);
    ctx.fillStyle = '#d32020';
    ctx.beginPath();
    ctx.arc(h.x, h.y - h.r * 0.15, h.r * 1.05, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(h.x, h.y - h.r * 0.3, h.r * 1.4, h.r * 0.28);
    if (up) {
      const hand = handPos(p.x, y, H, pose, 0);
      ctx.strokeStyle = '#6b5a3a';
      ctx.lineWidth = Math.max(2, 0.02 * H);
      ctx.beginPath();
      ctx.moveTo(hand.x, hand.y + 0.05 * H);
      ctx.lineTo(hand.x, hand.y - 0.28 * H);
      ctx.stroke();
      ctx.fillStyle = foul ? '#e8281e' : '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(hand.x, hand.y - 0.28 * H, 0.2 * H, 0.14 * H);
      ctx.fill();
      ctx.stroke();
    }
  }

  drawControls(ctx) {
    const now = this.now;
    const padsCfg = CONFIG.sprint100.pads;
    const { L, R } = this.pads;
    if ((this.state === 'ready' || this.state === 'run') && this.zoneT == null && this.judge.target) {
      drawDrop(ctx, this.pads[this.judge.target], now - this.spawnT, padsCfg);
      if (now - this.missT < padsCfg.missX) drawX(ctx, this.pads[this.missSide].home.x, this.pads[this.missSide].home.y);
    }
    if (this.state === 'run' && this.zoneT != null) {
      if (this.holdT != null) {
        // Held: the pads turn into rings, as in the original.
        for (const p of [L, R]) {
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(p.home.x, p.home.y, p.r * 0.95, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if ((now - this.zoneT) % this.cfg.blink.period < this.cfg.blink.on) {
        drawPad(ctx, ORANGE, L.home.x, L.home.y, L.r);
        drawPad(ctx, ORANGE, R.home.x, R.home.y, R.r);
      }
    }
    for (const ring of this.rings) drawHitRing(ctx, this.pads[ring.side], now - ring.t0, padsCfg);
  }

  drawHUD(ctx, view) {
    const s = view.safe;
    const b = this.exitBtn;
    roundRect(ctx, b.x, b.y, b.w, b.h, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    text(ctx, '✕', b.x + b.w / 2, b.y + b.h / 2 + 1, { size: 20 });
    if (this.state === 'ready' || this.state === 'run' || this.state === 'overrun' || this.state === 'throw') {
      const mx = b.x + b.w + 12;
      const my = b.y + 6;
      const mw = 150;
      const v = this.shot ? this.shot.v : this.runner.v;
      roundRect(ctx, mx, my, mw, 16, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
      const frac = clamp(v / CONFIG.runner.topSpeed, 0, 1);
      if (frac > 0.02) {
        roundRect(ctx, mx, my, mw * frac, 16, 8);
        ctx.fillStyle = frac > 0.92 ? '#ffb400' : '#59cd90';
        ctx.fill();
      }
      text(ctx, `${(v * 3.6).toFixed(0)} km/h`, mx, my + 30, { size: 13, align: 'left', color: '#fff', shadow: true });
    }
    const best = this.best(this.player);
    text(ctx, `THROW ${this.round}/${this.cfg.rounds}`, view.w - 16 - s.r, 22 + s.t, { size: 20, align: 'right', color: '#fff', shadow: true });
    text(ctx, `Best ${best == null ? '—' : best.toFixed(2) + ' m'}`, view.w - 16 - s.r, 48 + s.t, { size: 15, align: 'right', color: 'rgba(255,255,255,0.85)', shadow: true });
  }

  /** After each throw: your mark (or FOUL) and everyone's best so far. */
  drawMark(ctx, view) {
    const cx = view.w / 2;
    const w = Math.min(560, view.w - 40);
    const x0 = cx - w / 2;
    roundRect(ctx, x0, 70, w, 330, 18);
    ctx.fillStyle = 'rgba(12,22,44,0.88)';
    ctx.fill();
    const m = this.mark;
    text(ctx, `THROW ${this.round} OF ${this.cfg.rounds}`, cx, 98, { size: 16, color: 'rgba(255,255,255,0.7)' });
    if (m.foul) text(ctx, 'FOUL', cx, 150, { size: 60, color: '#ff4b3e', shadow: true });
    else text(ctx, `${m.mark.toFixed(2)} m`, cx, 150, { size: 60, color: '#fff', shadow: true });
    const s = this.shot;
    let detail;
    if (!s) detail = 'reached the line without letting go';
    else if (s.foul) detail = `let go ${(s.x0 * 100).toFixed(0)} cm past the line`;
    else detail = `let go ${(-s.x0 * 100).toFixed(0)} cm before the line · angle ${s.deg.toFixed(0)}° · ${(s.v * 3.6).toFixed(0)} km/h`;
    text(ctx, detail, cx, 192, { size: 14, weight: 500, color: 'rgba(255,255,255,0.75)', maxWidth: w - 30 });
    const all = [this.player, ...this.rivals].map((a) => ({ a, b: this.best(a) }));
    all.sort((p, q) => (q.b ?? -1) - (p.b ?? -1));
    all.forEach(({ a, b }, i) => {
      const col = i < 3 ? x0 + 40 : x0 + w / 2 + 10;
      const row = i < 3 ? 222 + i * 24 : 222 + (i - 3) * 24;
      ctx.fillStyle = a.colors.shirt;
      ctx.fillRect(col, row - 8, 5, 16);
      text(ctx, `${i + 1}. ${a.name}`, col + 12, row, { size: 15, align: 'left', weight: a.isPlayer ? 800 : 600 });
      text(ctx, b == null ? '—' : `${b.toFixed(2)}`, col + w / 2 - 70, row, { size: 15, align: 'right', weight: a.isPlayer ? 800 : 500 });
    });
    const last = this.round >= this.cfg.rounds;
    const pulse = 0.6 + 0.4 * Math.sin(this.now * 5);
    text(ctx, last ? 'Tap for results' : 'Tap for the next throw', cx, 372, { size: 18, color: `rgba(255,255,255,${pulse})` });
  }
}
