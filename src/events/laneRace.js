import { CONFIG } from '../config.js';
import { Camera } from '../core/camera.js';
import { rand, shuffle, clamp } from '../core/math.js';
import { text, roundRect } from '../core/ui.js';
import { Runner } from '../athletes/runner.js';
import { AIController } from '../athletes/ai.js';
import { HERO, RIVALS } from '../athletes/roster.js';
import { drawFigure, runPose, lerpPose, POSES } from '../athletes/stickFigure.js';
import { TrackRenderer } from '../render/track.js';
import { flow } from '../flow.js';

/**
 * Base scene for lane races (100m now, 110m hurdles next).
 *
 * STATE MACHINE (inner, per race):
 *
 *   ready --(timer)--> set --(random timer)--> race --(player crosses)--> finished --(timer)--> results
 *     ^                  |                                                   ^
 *     |   tap before GO  v                                                   |
 *     +---------- falseStart --(too many)--> dq ------------------------------+
 *
 * Each state only reacts to what matters in that state (a tap during `set` is
 * a false start, the same tap during `race` is a stride). Keeping this explicit
 * avoids piles of boolean flags like `isRunning && !hasFinished && ...`.
 *
 * Subclasses provide the controls: mapInput(), onPlayerAction(), drawControls().
 */
export class LaneRace {
  constructor(ev, cfg) {
    this.ev = ev;
    this.cfg = cfg;
    this.difficulty = CONFIG.ai.amateur;
  }

  enter() {
    const cfg = this.cfg;
    this.track = new TrackRenderer(cfg.lanes, cfg.distance);
    this.camera = new Camera();
    this.falseStarts = 0;

    // Build the field: player in their lane, rivals in the others.
    const rivals = shuffle([...RIVALS]);
    this.athletes = [];
    for (let lane = 1; lane <= cfg.lanes; lane++) {
      const isPlayer = lane === cfg.playerLane;
      const who = isPlayer ? HERO : rivals.pop();
      const runner = new Runner();
      this.athletes.push({
        lane,
        isPlayer,
        name: who.name,
        colors: who.colors,
        runner,
        ai: isPlayer ? null : new AIController(runner, this.difficulty),
        mark: null,
        status: 'ok',
      });
    }
    this.player = this.athletes.find((a) => a.isPlayer);
    this.exitBtn = { x: 0, y: 0, w: 44, h: 40 };
    this.onResize(this.game.view);
    this.startCountdown(this.game.time);
  }

  onResize(view) {
    this.exitBtn.x = 10 + view.safe.l;
    this.exitBtn.y = 8 + view.safe.t;
  }

  startCountdown(t) {
    const c = this.cfg.countdown;
    for (const a of this.athletes) {
      a.runner.reset();
      if (a.ai) a.ai = new AIController(a.runner, this.difficulty, a.ai.cadence);
      a.mark = null;
    }
    this.camera.snapTo(this.player.runner.x);
    this.state = 'ready';
    this.stateT = t;
    this.setT = t + c.readyTime;
    this.goT = this.setT + rand(c.setMin, c.setMax);
    this.onCountdown?.();
  }

  setState(state, t) {
    this.state = state;
    this.stateT = t;
  }

  get raceTime() {
    return this.state === 'race' || this.state === 'finished' ? Math.max(0, this.game.time - this.goT) : 0;
  }

  update(dt, t) {
    const end = t + dt;

    // 1. Timed transitions that happen inside this step.
    if (this.state === 'ready' && end >= this.setT) this.setState('set', this.setT);
    if (this.state === 'set' && end >= this.goT) {
      this.setState('race', this.goT);
      for (const a of this.athletes) (a.ai ?? a.runner).go(this.goT);
    }

    // 2. Input, each event at its own precise time.
    for (const e of this.game.input.consume(end)) {
      if (e.type === 'down' && this.hitExit(e)) return flow.menu(this.game);
      if (e.type === 'key' && e.code === 'Escape') return flow.menu(this.game);
      const action = this.mapInput(e);
      if (action == null) continue;
      const beforeGun = this.state === 'ready' || this.state === 'set' || (this.state === 'race' && e.t < this.goT);
      if (beforeGun) {
        this.falseStart(t);
        break;
      }
      if (this.state === 'race') this.onPlayerAction(action, e.t);
    }

    // 3. Simulation.
    if (this.state === 'race' || this.state === 'finished') this.simulate(dt, t);

    // 4. State timers.
    if (this.state === 'race' && end - this.goT > this.cfg.maxRaceTime) {
      this.player.status = 'dnf';
      this.setState('finished', t);
    }
    if (this.state === 'finished' && end - this.stateT >= this.cfg.finishHold) return this.finish();
    if (this.state === 'falseStart' && end - this.stateT >= this.cfg.falseStartPause) this.startCountdown(end);
    if (this.state === 'dq' && end - this.stateT >= this.cfg.falseStartPause) {
      this.player.status = 'dq';
      return this.finish();
    }

    this.updateControls?.(dt);
    const pr = this.player.runner;
    this.camera.follow(pr.x, pr.v, dt);
  }

  simulate(dt, t) {
    const D = this.cfg.distance;
    for (const a of this.athletes) {
      a.ai?.update(t, dt, a.runner.x / D);
      a.runner.update(dt, t);
      const cross = a.runner.crossing(D, t, dt);
      if (cross != null && a.mark == null && a.status === 'ok') {
        a.mark = cross - this.goT;
        a.runner.finished = true;
        if (a.isPlayer && this.state === 'race') this.setState('finished', t);
      }
    }
  }

  falseStart(t) {
    this.falseStarts++;
    for (const a of this.athletes) a.runner.reset();
    this.setState(this.falseStarts > this.cfg.falseStartsAllowed ? 'dq' : 'falseStart', t);
    navigator.vibrate?.(120);
  }

  /** Fast-forward any rivals still running (or the whole race if you were DQ'd), then show results. */
  finish() {
    const D = this.cfg.distance;
    const step = CONFIG.loop.fixedStep;
    let t = this.game.time;
    let goT = this.goT;
    if (this.player.status === 'dq') {
      t = goT = 0;
      for (const a of this.athletes) {
        a.runner.reset();
        a.ai?.go(0);
      }
    }
    const pending = () => this.athletes.filter((a) => !a.isPlayer && a.mark == null);
    for (let guard = 0; pending().length && guard < 60 / step; guard++) {
      for (const a of pending()) {
        a.ai.update(t, step, a.runner.x / D);
        a.runner.update(step, t);
        const cross = a.runner.crossing(D, t, step);
        if (cross != null) a.mark = cross - goT;
      }
      t += step;
    }

    const results = this.athletes.map((a) => ({
      name: a.name,
      lane: a.lane,
      colors: a.colors,
      isPlayer: a.isPlayer,
      mark: a.mark,
      status: a.isPlayer ? a.status : a.mark == null ? 'dnf' : 'ok',
    }));
    const rank = (r) => (r.status === 'ok' ? r.mark : r.status === 'dnf' ? 1e6 : 2e6);
    results.sort((a, b) => rank(a) - rank(b));
    flow.results(this.game, this.ev, results);
  }

  hitExit(e) {
    const b = this.exitBtn;
    return e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h;
  }

  // ---------------------------------------------------------------- rendering

  render(ctx, view) {
    this.track.draw(ctx, view, this.camera);
    // Back-to-front so nearer lanes overlap further ones.
    const H = CONFIG.figure.height * this.camera.ppm;
    for (let i = this.athletes.length - 1; i >= 0; i--) {
      const a = this.athletes[i];
      const p = this.track.toScreen(this.camera, view, a.runner.x, a.lane);
      if (p.x < -80 || p.x > view.w + 80) continue;
      const scale = 1 - (a.lane - 1) * 0.035; // slightly smaller further back
      const head = drawFigure(ctx, p.x, p.y + 4, H * scale, this.poseFor(a), a.colors);
      if (a.isPlayer && (this.state !== 'race' || this.raceTime < 2)) this.drawYouMarker(ctx, head.headX, head.headY - 8);
    }
    this.drawHUD(ctx, view);
    this.drawControls(ctx, view);
    this.drawBanner(ctx, view);
    if (this.game.debug) this.drawDebug(ctx, view);
  }

  poseFor(a) {
    const r = a.runner;
    const now = this.game.time;
    if (this.state === 'ready' || this.state === 'falseStart' || this.state === 'dq') return POSES.blocks;
    if (this.state === 'set') return lerpPose(POSES.blocks, POSES.set, clamp((now - this.stateT) / 0.45, 0, 1));
    // Racing: blend out of the set position over the first ~1.2m, into standing as they stop.
    const amp = clamp(r.v / 9, 0.3, 1);
    const run = runPose(r.phase, amp);
    if (r.x < 1.2) return lerpPose(POSES.set, run, clamp(r.x / 1.2, 0, 1));
    if (r.finished && r.v < 2) return lerpPose(POSES.stand, run, r.v / 2);
    return run;
  }

  drawYouMarker(ctx, x, y) {
    ctx.fillStyle = '#ffb400';
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 12);
    ctx.lineTo(x + 8, y - 12);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
    text(ctx, 'YOU', x, y - 24, { size: 14, color: '#ffb400', shadow: true });
  }

  drawHUD(ctx, view) {
    const s = view.safe;
    // Exit button.
    const b = this.exitBtn;
    roundRect(ctx, b.x, b.y, b.w, b.h, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    text(ctx, '✕', b.x + b.w / 2, b.y + b.h / 2 + 1, { size: 20 });

    // Speed meter.
    const mx = b.x + b.w + 12;
    const my = b.y + 6;
    const mw = 150;
    const v = this.player.runner.v;
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

    // Timer (top-right).
    const tStr = (this.player.mark ?? this.raceTime).toFixed(2);
    text(ctx, tStr, view.w - 16 - s.r, 34 + s.t, { size: 40, align: 'right', color: '#fff', shadow: true });

    // Mini-map: everyone's progress along the full race.
    const mapW = Math.min(260, view.w - 2 * (mx + mw + 20) + 40);
    const mapX = view.w / 2 - mapW / 2;
    const mapY = 22 + s.t;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, mapX - 8, mapY - 10, mapW + 16, 20, 10);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(mapX, mapY - 1, mapW, 2);
    ctx.fillRect(mapX + mapW - 2, mapY - 7, 3, 14);
    for (const a of [...this.athletes].sort((p, q) => p.isPlayer - q.isPlayer)) {
      const px = mapX + clamp(a.runner.x / this.cfg.distance, 0, 1) * mapW;
      ctx.fillStyle = a.colors.shirt;
      ctx.beginPath();
      ctx.arc(px, mapY, a.isPlayer ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
      if (a.isPlayer) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  drawBanner(ctx, view) {
    const now = this.game.time;
    const cx = view.w / 2;
    const cy = 140;
    const big = (str, color) => text(ctx, str, cx, cy, { size: 64, color, shadow: true });
    switch (this.state) {
      case 'ready':
        big('READY', '#fff');
        break;
      case 'set':
        big('GET SET', '#fff');
        break;
      case 'race':
        if (now - this.goT < this.cfg.countdown.goBanner) big('GO!', '#59cd90');
        break;
      case 'falseStart':
        big('FALSE START', '#ff5252');
        roundRect(ctx, cx - 230, cy + 34, 460, 34, 17);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fill();
        text(ctx, 'Wait for green! One more and you are out.', cx, cy + 52, { size: 19, maxWidth: 440 });
        break;
      case 'dq':
        big('DISQUALIFIED', '#ff5252');
        break;
      case 'finished': {
        const place = this.athletes.filter((a) => a.mark != null && a.mark <= (this.player.mark ?? -1)).length;
        if (this.player.status === 'dnf') big('TIME!', '#fff');
        else big(place === 1 ? 'WINNER!' : 'FINISH', place === 1 ? '#ffb400' : '#fff');
        break;
      }
    }
  }

  drawDebug(ctx, view) {
    const r = this.player.runner;
    const t = this.game.time;
    const c = r.cadence(t);
    const lines = [
      `state ${this.state}`,
      `cadence ${c.toFixed(1)} taps/s`,
      `target ${r.targetSpeed(c).toFixed(2)} m/s  v ${r.v.toFixed(2)}`,
      `x ${r.x.toFixed(1)}m  taps ${r.taps}`,
    ];
    lines.forEach((l, i) => text(ctx, l, 12 + view.safe.l, 90 + i * 16, { size: 12, align: 'left', weight: 500, shadow: true }));
  }
}
