import { CONFIG } from '../config.js';
import { Camera } from '../core/camera.js';
import { clamp, rand, shuffle } from '../core/math.js';
import { text, roundRect } from '../core/ui.js';
import { Runner } from '../athletes/runner.js';
import { AIController } from '../athletes/ai.js';
import { HERO, RIVALS } from '../athletes/roster.js';
import { drawFigure, runPose, lerpPose, JUMP_POSES, POSES } from '../athletes/stickFigure.js';
import { StrideTargets } from './strideTargets.js';
import { launch, flightTime, stretchQuality, jumpMark, rivalJump } from './longJumpRules.js';
import { RunwayRenderer } from '../render/runway.js';
import { ORANGE, drawPad, drawX } from '../render/pads.js';
import { drawDrop, drawHitRing } from '../render/targetPads.js';
import { getDifficulty } from '../core/storage.js';
import { flow } from '../flow.js';

const LEFT_KEYS = ['ArrowLeft', 'KeyA', 'KeyZ', 'KeyF'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD', 'KeyX', 'KeyJ'];
const BOTH_KEYS = ['Space', 'ArrowUp'];
const ease = (k) => k * k * (3 - 2 * k);

/**
 * Long jump, from footage of the original (rules and physics in
 * longJumpRules.js):
 * - Three rounds; your best jump counts against five rivals' best.
 * - Run-up: the 100m's green targets (tap the lit side). The first tap starts
 *   you off.
 * - `zoneDistance` before the board the pads turn orange and BLINK: strides
 *   stop and you carry your speed. Press BOTH to take off. Measured from the
 *   foul line (front of the board), so jump late but not over it.
 * - At the top of the jump the orange pads come back: press both for the
 *   STRETCH. The sooner, the further.
 * - You land in the sand, sit, get up; your mark (or FOUL) is shown. Tap to go on.
 *
 * States: 'ready' (standing, first target up) → 'run' → 'air' → 'landed' →
 * 'mark' (banner) → next round, or results after the last. A run-through
 * without jumping: 'overrun' → 'mark' (FOUL).
 */
export class LongJump {
  constructor(ev) {
    this.ev = ev;
    this.cfg = CONFIG.longJump;
    this.level = getDifficulty();
    this.lv = { ...CONFIG.ai[this.level], ...this.cfg.ai[this.level] };
  }

  enter() {
    const cfg = this.cfg;
    this.track = new RunwayRenderer(cfg.runway, { from: 1, to: 10.5 });
    this.camera = new Camera();
    this.player = { name: HERO.name, colors: HERO.colors, isPlayer: true, jumps: [] };
    // Five rivals, each with a fixed run-up pace for the whole competition.
    this.rivals = shuffle([...RIVALS])
      .slice(0, 5)
      .map((r) => ({ name: r.name, colors: r.colors, isPlayer: false, jumps: [], cadence: rand(...this.lv.cadence) }));
    const r = CONFIG.sprint100.pads.radius;
    this.pads = { L: { home: { x: 0, y: 0 }, r }, R: { home: { x: 0, y: 0 }, r } };
    this.exitBtn = { x: 0, y: 0, w: 44, h: 40 };
    this.stats = { hits: 0, misses: 0, topSpeed: 0 };
    this.round = 0;
    this.onResize(this.game.view);
    this.startRound();
  }

  onResize(view) {
    const cfg = CONFIG.sprint100.pads;
    const y = view.h * cfg.homeY;
    this.pads.L.home = { x: view.safe.l + cfg.edgeInset + this.pads.L.r, y };
    this.pads.R.home = { x: view.w - view.safe.r - cfg.edgeInset - this.pads.R.r, y };
    this.exitBtn.x = 10 + view.safe.l;
    this.exitBtn.y = 8 + view.safe.t;
  }

  get now() {
    return this.game.time;
  }

  startRound() {
    this.round++;
    const t = this.now;
    this.runner = new Runner(undefined, undefined, -this.cfg.runway);
    this.judge = new StrideTargets(this.runner, CONFIG.sprint100.targets);
    this.runner.go(t); // the first tap's interval is your reaction to the first target
    this.judge.start(t);
    this.spawnT = -Infinity; // the first target just appears; later ones drop in
    this.rings = [];
    this.missSide = null;
    this.missT = -Infinity;
    this.zoneT = null; // when the orange takeoff pads appeared
    this.press = { L: -Infinity, R: -Infinity };
    this.jump = null; // { x0, vx, vy, t0, apexT, stretchT, stretchK, foul, hipX, hipY }
    this.mark = null; // this round's result: { mark } or { foul: true }
    this.puff = [];
    this.track.marks = [];
    this.lastPose = null;
    this.setState('ready');
    this.camera.snapTo(this.runner.x);
  }

  setState(s) {
    this.state = s;
    this.stateT = this.now;
  }

  // ---------------------------------------------------------------- input

  mapInput(e) {
    if (e.type === 'down') return e.x < this.game.view.w / 2 ? 'L' : 'R';
    if (LEFT_KEYS.includes(e.code)) return 'L';
    if (RIGHT_KEYS.includes(e.code)) return 'R';
    if (BOTH_KEYS.includes(e.code)) return 'BOTH';
    return null;
  }

  /** Both thumbs within the chord window (or the both-key) → true. */
  chord(action, t) {
    if (action === 'BOTH') return true;
    this.press[action] = t;
    const other = action === 'L' ? 'R' : 'L';
    return t - this.press[other] <= this.cfg.chordWindow;
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
      const action = this.mapInput(e);
      if (action == null) continue;
      if ((this.state === 'ready' || this.state === 'run') && this.zoneT == null) this.stride(action, e.t);
      else if (this.state === 'run' && this.zoneT != null) {
        if (this.chord(action, e.t)) this.takeoff(e.t);
      } else if (this.state === 'air' && this.jump.apexT != null && this.jump.stretchT == null) {
        if (this.chord(action, e.t)) this.stretch(e.t);
      }
    }
    this.simulate(dt, t);
    this.rings = this.rings.filter((ring) => end - ring.t0 < CONFIG.sprint100.pads.hitRing.duration);
  }

  stride(side, t) {
    if (side === 'BOTH') return;
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

  takeoff(t) {
    const r = this.runner;
    const j = this.cfg.jump;
    const { vx, vy } = launch(r.v, j);
    this.jump = { x0: r.x, v: r.v, vx, vy, t0: t, apexT: null, stretchT: null, stretchK: 0, foul: r.x > 0, hipX: r.x, hipY: 0 };
    this.jump.flight = flightTime(vy, j);
    this.stats.topSpeed = Math.max(this.stats.topSpeed, r.v);
    this.setState('air');
  }

  stretch(t) {
    const j = this.jump;
    j.stretchT = t;
    j.stretchK = stretchQuality(t - j.apexT, this.cfg.stretch);
  }

  // ---------------------------------------------------------------- simulation

  simulate(dt, t) {
    const cfg = this.cfg;
    const r = this.runner;
    if (this.state === 'ready' || this.state === 'run' || this.state === 'overrun') {
      r.update(dt, t);
      if (this.state === 'run' && this.zoneT == null && -r.x <= cfg.zoneDistance) {
        // Takeoff zone: strides stop, the pads turn orange and blink.
        this.zoneT = t;
        this.judge.target = null;
        r.carry();
      }
      if (this.state === 'run' && r.x > cfg.overrun) {
        // Ran over the line without jumping: foul.
        this.mark = { foul: true };
        this.stats.topSpeed = Math.max(this.stats.topSpeed, r.v);
        r.finished = true; // brake
        this.setState('overrun');
      }
      if (this.state === 'overrun' && t - this.stateT > 1.2) this.showMark();
    } else if (this.state === 'air') {
      const j = this.jump;
      const g = cfg.jump.gravity;
      const ta = t + dt - j.t0;
      j.hipX = j.x0 + j.vx * ta;
      j.hipY = j.vy * ta - 0.5 * g * ta * ta;
      if (j.apexT == null && j.vy - g * ta <= 0) j.apexT = t + dt; // top of the jump: stretch pads appear
      if (ta >= j.flight) this.land(t + dt);
    } else if (this.state === 'landed') {
      if (t - this.stateT > cfg.markHold) this.showMark();
    }
    for (const p of this.puff) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= 6 * dt;
      p.life -= dt;
    }
    this.puff = this.puff.filter((p) => p.life > 0 && p.y > -0.05);
    const cx = this.state === 'air' || this.state === 'landed' || this.state === 'mark' ? this.jump?.hipX ?? r.x : r.x;
    this.camera.follow(cx, this.state === 'air' ? this.jump.vx : r.v, dt);
  }

  land(t) {
    const j = this.jump;
    j.landT = t;
    const markX = jumpMark({ takeoffX: j.x0, v: j.v, stretchK: j.stretchK }, this.cfg);
    this.mark = j.foul ? { foul: true } : { mark: markX };
    this.track.marks.push({ x: markX });
    // Sand kicked up where the heels go in.
    for (let i = 0; i < 16; i++) {
      this.puff.push({ x: markX + rand(-0.3, 0.2), y: 0, vx: rand(-0.6, 1.4), vy: rand(0.6, 2.2), life: rand(0.4, 0.8), r: rand(2, 5) });
    }
    navigator.vibrate?.(30);
    this.setState('landed');
  }

  /** Record this round for everyone and show the banner. */
  showMark() {
    this.player.jumps.push(this.mark);
    const cfg = this.cfg;
    for (const rv of this.rivals) {
      const level = { ...this.lv, cadence: [rv.cadence, rv.cadence] };
      rv.jumps.push(rivalJump(level, cfg, (runway) => this.rivalRunUp(rv, runway)));
    }
    this.setState('mark');
  }

  /** A rival's speed at takeoff after their run-up (same physics as yours). */
  rivalRunUp(rv, runway) {
    const step = CONFIG.loop.fixedStep;
    const r = new Runner(undefined, undefined, -runway);
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
      paceText: `jumps ${this.player.jumps.map((j) => (j.foul ? 'X' : j.mark.toFixed(2))).join(' / ')}`,
    });
  }

  hitExit(e) {
    const b = this.exitBtn;
    return e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h;
  }

  // ---------------------------------------------------------------- drawing

  poseFor() {
    const now = this.now;
    const r = this.runner;
    const run = () => runPose(r.phase, clamp(r.v / 11, 0.15, 1), 0);
    const P = JUMP_POSES;
    switch (this.state) {
      case 'ready': {
        const s = Math.sin(now * 1.7);
        return { ...POSES.stand, hipY: POSES.stand.hipY + 0.006 * s, lean: POSES.stand.lean + 0.02 * s };
      }
      case 'run':
        return run();
      case 'overrun':
        return r.v > 2 ? run() : lerpPose(run(), POSES.stand, 1 - r.v / 2);
      case 'air': {
        const j = this.jump;
        const ta = now - j.t0;
        let pose = lerpPose(this.takeoffPose ?? run(), P.hang, ease(clamp(ta / 0.16, 0, 1)));
        if (j.stretchT != null) {
          pose = lerpPose(pose, P.stretch, ease(clamp((now - j.stretchT) / 0.12, 0, 1)) * (0.45 + 0.55 * j.stretchK));
        } else {
          pose = lerpPose(pose, P.land, ease(clamp((ta - (j.flight - 0.25)) / 0.2, 0, 1)));
        }
        return pose;
      }
      default: {
        // Landed: drop into a sit, then get up. (After a run-through foul: just stand.)
        if (!this.jump?.landT) return POSES.stand;
        const age = now - this.jump.landT;
        const sit = lerpPose(this.lastAirPose ?? P.sit, P.sit, ease(clamp(age / 0.1, 0, 1)));
        return lerpPose(sit, POSES.stand, ease(clamp((age - 1.0) / 0.45, 0, 1)));
      }
    }
  }

  render(ctx, view) {
    this.track.draw(ctx, view, this.camera);
    const tr = this.track;
    const pxPerM = this.camera.ppm * tr.figureScale(1);
    const H = CONFIG.figure.height * pxPerM;
    const air = this.state === 'air';
    const x = air || this.state === 'landed' || this.state === 'mark' ? this.jump?.hipX ?? this.runner.x : this.runner.x;
    const ground = tr.toScreen(this.camera, view, x, 1);
    const groundY = ground.y + 4;
    const pose = this.poseFor();
    if (this.state === 'run') this.takeoffPose = pose;
    let y = groundY;
    if (air) {
      // Place the figure so its hips are at the flight height.
      const hipScreenY = groundY - (0.5 * CONFIG.figure.height + this.jump.hipY) * pxPerM;
      y = hipScreenY - pose.hipY * H;
      this.lastAirPose = pose;
    }
    // Sand puff behind the figure.
    for (const p of this.puff) {
      const s = tr.toScreen(this.camera, view, p.x, 1);
      ctx.fillStyle = `rgba(214,190,140,${clamp(p.life / 0.6, 0, 1) * 0.9})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y + 4 - p.y * pxPerM, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    drawFigure(ctx, ground.x, y, H, pose, HERO.colors, groundY);
    this.drawControls(ctx, view);
    this.drawHUD(ctx, view);
    if (this.state === 'mark') this.drawMark(ctx, view);
  }

  drawControls(ctx) {
    const now = this.now;
    const padsCfg = CONFIG.sprint100.pads;
    const { L, R } = this.pads;
    if ((this.state === 'ready' || this.state === 'run') && this.zoneT == null && this.judge.target) {
      drawDrop(ctx, this.pads[this.judge.target], now - this.spawnT, padsCfg);
      if (now - this.missT < padsCfg.missX) drawX(ctx, this.pads[this.missSide].home.x, this.pads[this.missSide].home.y);
    }
    const blink = this.cfg.blink;
    const showOrange = () => {
      drawPad(ctx, ORANGE, L.home.x, L.home.y, L.r);
      drawPad(ctx, ORANGE, R.home.x, R.home.y, R.r);
    };
    if (this.state === 'run' && this.zoneT != null && (now - this.zoneT) % blink.period < blink.on) showOrange();
    const j = this.jump;
    if (this.state === 'air' && j.apexT != null && j.stretchT == null && now - j.apexT < this.cfg.stretch.show) showOrange();
    for (const ring of this.rings) drawHitRing(ctx, this.pads[ring.side], now - ring.t0, padsCfg);
  }

  drawHUD(ctx, view) {
    const s = view.safe;
    const b = this.exitBtn;
    roundRect(ctx, b.x, b.y, b.w, b.h, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    text(ctx, '✕', b.x + b.w / 2, b.y + b.h / 2 + 1, { size: 20 });
    // Speed meter.
    const mx = b.x + b.w + 12;
    const my = b.y + 6;
    const mw = 150;
    const v = this.state === 'air' ? this.jump.v : this.runner.v;
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
    // Round and best (top right).
    const best = this.best(this.player);
    text(ctx, `ROUND ${this.round}/${this.cfg.rounds}`, view.w - 16 - s.r, 22 + s.t, { size: 20, align: 'right', color: '#fff', shadow: true });
    text(ctx, `Best ${best == null ? '—' : best.toFixed(2) + ' m'}`, view.w - 16 - s.r, 48 + s.t, { size: 15, align: 'right', color: 'rgba(255,255,255,0.85)', shadow: true });
  }

  /** After each jump: your mark (or FOUL) and everyone's best so far. */
  drawMark(ctx, view) {
    const cx = view.w / 2;
    const w = Math.min(560, view.w - 40);
    const x0 = cx - w / 2;
    roundRect(ctx, x0, 70, w, 330, 18);
    ctx.fillStyle = 'rgba(12,22,44,0.88)';
    ctx.fill();
    const m = this.mark;
    text(ctx, `ROUND ${this.round} OF ${this.cfg.rounds}`, cx, 98, { size: 16, color: 'rgba(255,255,255,0.7)' });
    if (m.foul) text(ctx, 'FOUL', cx, 150, { size: 60, color: '#ff4b3e', shadow: true });
    else text(ctx, `${m.mark.toFixed(2)} m`, cx, 150, { size: 60, color: '#fff', shadow: true });
    const j = this.jump;
    if (j && !m.foul) {
      const gap = -j.x0;
      const detail = `took off ${(gap * 100).toFixed(0)} cm before the line · stretch ${Math.round(j.stretchK * 100)}%`;
      text(ctx, detail, cx, 192, { size: 14, weight: 500, color: 'rgba(255,255,255,0.75)', maxWidth: w - 30 });
    } else if (j && m.foul) {
      text(ctx, `over the line by ${(j.x0 * 100).toFixed(0)} cm`, cx, 192, { size: 14, weight: 500, color: 'rgba(255,255,255,0.75)' });
    } else {
      text(ctx, 'ran through without jumping', cx, 192, { size: 14, weight: 500, color: 'rgba(255,255,255,0.75)' });
    }
    // Standings: everyone's best so far.
    const all = [this.player, ...this.rivals].map((a) => ({ a, b: this.best(a) }));
    all.sort((p, q) => (q.b ?? -1) - (p.b ?? -1));
    all.forEach(({ a, b }, i) => {
      const yy = 222 + i * 24;
      const col = i < 3 ? x0 + 40 : x0 + w / 2 + 10;
      const row = i < 3 ? yy : 222 + (i - 3) * 24;
      ctx.fillStyle = a.colors.shirt;
      ctx.fillRect(col, row - 8, 5, 16);
      text(ctx, `${i + 1}. ${a.name}`, col + 12, row, { size: 15, align: 'left', weight: a.isPlayer ? 800 : 600 });
      text(ctx, b == null ? '—' : `${b.toFixed(2)}`, col + w / 2 - 70, row, { size: 15, align: 'right', weight: a.isPlayer ? 800 : 500 });
    });
    const last = this.round >= this.cfg.rounds;
    const pulse = 0.6 + 0.4 * Math.sin(this.now * 5);
    text(ctx, last ? 'Tap for results' : 'Tap for the next jump', cx, 372, { size: 18, color: `rgba(255,255,255,${pulse})` });
  }
}
