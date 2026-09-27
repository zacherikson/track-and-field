import { CONFIG } from '../config.js';
import { Camera } from '../core/camera.js';
import { rand, shuffle, clamp } from '../core/math.js';
import { text, roundRect } from '../core/ui.js';
import { Runner } from '../athletes/runner.js';
import { AIController } from '../athletes/ai.js';
import { HERO, RIVALS } from '../athletes/roster.js';
import { drawFigure, runPose, lerpPose, leanPose, handReach, POSES } from '../athletes/stickFigure.js';
import { TrackRenderer } from '../render/track.js';
import { ORANGE, drawPad } from '../render/pads.js';
import { flow } from '../flow.js';

/**
 * Base scene for lane races (100m now, 110m hurdles next).
 *
 * STATE MACHINE (inner, per race):
 *
 *   waiting --(tap)--> ready --(timer)--> set --(random timer)--> race --(player crosses)--> finished --(timer)--> results
 *
 * `waiting`: athletes stand at the line while a start button and the player's
 * lane flash together; a tap (anywhere) starts READY / GET SET / GO.
 *
 * Each state only reacts to what matters in that state (a tap during `set` is
 * simply ignored, the same tap during `race` is a stride). Keeping this explicit
 * avoids piles of boolean flags like `isRunning && !hasFinished && ...`.
 * There are no false starts: nobody should worry about brushing the screen early.
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
    this.track = new TrackRenderer(cfg.lanes, cfg.distance, cfg.startX);
    this.track.blocksNudge = (lane) => this.laneNudge(lane);
    this.camera = new Camera();

    // Build the field: player in their lane, rivals in the others.
    const rivals = shuffle([...RIVALS]);
    this.athletes = [];
    for (let lane = 1; lane <= cfg.lanes; lane++) {
      const isPlayer = lane === cfg.playerLane;
      const who = isPlayer ? HERO : rivals.pop();
      const runner = new Runner(undefined, undefined, cfg.startX);
      this.athletes.push({
        lane,
        isPlayer,
        name: who.name,
        colors: who.colors,
        runner,
        ai: isPlayer ? null : new AIController(runner, this.difficulty),
        mark: null,
        status: 'ok',
        idlePhase: rand(0, Math.PI * 2), // so the waiting athletes don't sway in unison
      });
    }
    this.player = this.athletes.find((a) => a.isPlayer);
    this.exitBtn = { x: 0, y: 0, w: 44, h: 40 };
    this.onResize(this.game.view);
    this.resetField();
    this.setState('waiting', this.game.time);
  }

  /** Everyone back on the line, camera on the player. */
  resetField() {
    for (const a of this.athletes) {
      a.runner.reset();
      if (a.ai) a.ai = new AIController(a.runner, this.difficulty, a.ai.cadence);
      a.mark = null;
    }
    this.camera.snapTo(this.player.runner.x);
    this.dipPress = null;
    this.carryT = Infinity;
  }

  onResize(view) {
    this.exitBtn.x = 10 + view.safe.l;
    this.exitBtn.y = 8 + view.safe.t;
  }

  startCountdown(t) {
    const c = this.cfg.countdown;
    this.resetField();
    // Each athlete moves on their own timing, like real sprinters.
    for (const a of this.athletes) {
      a.crouchDelay = rand(...c.crouchDelay);
      a.setDelay = rand(...c.setDelay);
    }
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
      this.onGo?.();
    }

    // 2. Input, each event at its own precise time.
    for (const e of this.game.input.consume(end)) {
      if (e.type === 'down' && this.hitExit(e)) return flow.menu(this.game);
      if (e.type === 'key' && e.code === 'Escape') return flow.menu(this.game);
      if (this.state === 'waiting') {
        // Any tap or key starts READY / GET SET / GO.
        if (e.type === 'down' || this.mapInput(e) != null || e.code === 'Enter') this.startCountdown(e.t);
        continue;
      }
      const action = this.mapInput(e);
      if (action == null) continue;
      // Taps before GO are ignored (no false starts).
      if (this.state !== 'race' || e.t < this.goT) continue;
      const mode = this.player.runner.mode;
      if (mode === 'carry') this.onDipAction(action, e);
      else if (mode === 'run') this.onPlayerAction(action, e.t, e);
    }

    // 3. Simulation.
    if (this.state === 'race' || this.state === 'finished') this.simulate(dt, t);

    // 4. State timers.
    if (this.state === 'race' && end - this.goT > this.cfg.maxRaceTime) {
      this.player.status = 'dnf';
      this.setState('finished', t);
    }
    if (this.state === 'finished' && end - this.stateT >= this.cfg.finishHold) return this.finish();

    this.updateControls?.(dt);
    const pr = this.player.runner;
    this.camera.follow(pr.x, pr.v, dt);
  }

  /** One physics step for one athlete, shared by live play and the fast-forward in finish(). */
  stepAthlete(a, dt, t) {
    const D = this.cfg.distance;
    const r = a.runner;
    if (D - r.x <= CONFIG.dip.promptDistance && r.mode === 'run' && !r.dipUsed) {
      r.carry();
      if (a.isPlayer) this.carryT = t;
    }
    a.ai?.update(t, dt, r.x / D, D - r.x);
    r.update(dt, t);
  }

  /**
   * Finish lean input. Strides don't count in the lean zone: press BOTH thumbs
   * together (within chordWindow) to lean. Space / Up arrow on a keyboard.
   */
  onDipAction(action, e) {
    const dip = CONFIG.dip;
    if (e.t - this.carryT < dip.armDelay) return; // stray stride taps as the zone begins
    if (action === 'DIP') {
      this.player.runner.lean();
      return;
    }
    this.dipPress ??= { L: -Infinity, R: -Infinity };
    this.dipPress[action] = e.t;
    const other = action === 'L' ? 'R' : 'L';
    if (e.t - this.dipPress[other] <= dip.chordWindow) this.player.runner.lean();
  }

  simulate(dt, t) {
    const D = this.cfg.distance;
    for (const a of this.athletes) {
      this.stepAthlete(a, dt, t);
      if (a.isPlayer) this.playerTopV = Math.max(this.playerTopV ?? 0, a.runner.v);
      const cross = a.runner.crossing(D, t, dt);
      if (cross != null && a.mark == null && a.status === 'ok') {
        a.mark = cross - this.goT;
        a.runner.finished = true;
        if (a.isPlayer && this.state === 'race') this.setState('finished', t);
      }
    }
  }

  /** Fast-forward any rivals still running, then show results. */
  finish() {
    const D = this.cfg.distance;
    const step = CONFIG.loop.fixedStep;
    let t = this.game.time;
    const goT = this.goT;
    const pending = () => this.athletes.filter((a) => !a.isPlayer && a.mark == null);
    for (let guard = 0; pending().length && guard < 60 / step; guard++) {
      for (const a of pending()) {
        this.stepAthlete(a, step, t);
        const cross = a.runner.crossing(D, t, step);
        if (cross != null) a.mark = cross - goT;
      }
      t += step;
    }

    const results = this.athletes.map((a) => ({
      name: a.name,
      lane: this.track.laneNumber(a.lane),
      colors: a.colors,
      isPlayer: a.isPlayer,
      mark: a.mark,
      status: a.isPlayer ? a.status : a.mark == null ? 'dnf' : 'ok',
    }));
    const rank = (r) => (r.status === 'ok' ? r.mark : r.status === 'dnf' ? 1e6 : 2e6);
    results.sort((a, b) => rank(a) - rank(b));
    flow.results(this.game, this.ev, results, this.raceStats?.());
  }

  hitExit(e) {
    const b = this.exitBtn;
    return e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h;
  }

  // ---------------------------------------------------------------- rendering

  render(ctx, view) {
    this.track.draw(ctx, view, this.camera);
    const blinkOn = this.state === 'waiting' && this.startBlinkOn();
    if (blinkOn) this.track.highlightLane(ctx, view, this.player.lane, 0.32);
    // Back-to-front so nearer lanes overlap further ones.
    const H = CONFIG.figure.height * this.camera.ppm;
    for (let i = this.athletes.length - 1; i >= 0; i--) {
      const a = this.athletes[i];
      const p = this.track.toScreen(this.camera, view, a.runner.x + a.runner.reach * 0.5 + this.startNudge(a), a.lane);
      if (p.x < -80 || p.x > view.w + 80) continue;
      const scale = this.track.figureScale(a.lane);
      drawFigure(ctx, p.x, p.y + 4, H * scale, this.poseFor(a), a.colors);
    }
    this.drawHUD(ctx, view);
    if (blinkOn) this.drawStartButton(ctx, view);
    this.drawControls(ctx, view);
    this.drawBanner(ctx, view);
    if (this.game.debug) this.drawDebug(ctx, view);
  }

  /**
   * Runners are drawn at nearly the same size in every lane while the track
   * shrinks with distance, so a crouched athlete's hands would sit a different
   * distance from the line in each lane. At the start we shift each lane's
   * drawing so the hands are `handGap` behind the line everywhere, fading the
   * shift out over the first 2 m (physics positions are untouched: fair race).
   */
  startNudge(a) {
    const r = a.runner;
    const fade = Math.max(0, 1 - (r.x - r.startX) / 2);
    return fade === 0 ? 0 : this.laneNudge(a.lane) * fade;
  }

  /** The start-position drawing shift for a lane (see startNudge), cached. */
  laneNudge(lane) {
    this.nudges ??= {};
    if (this.nudges[lane] == null) {
      const z = this.track.laneZ(lane);
      const H0 = CONFIG.figure.height * this.camera.ppm;
      const handPx = Math.max(handReach(POSES.blocks), handReach(POSES.set)) * H0 * this.track.figureScale(lane);
      const handM = handPx / (this.camera.ppm * this.track.scaleAt(z));
      this.nudges[lane] = -this.cfg.handGap - (this.cfg.startX + handM);
    }
    return this.nudges[lane];
  }

  /** The start button and the player's lane flash together: on, off, on, off... */
  startBlinkOn() {
    const b = this.cfg.startBlink;
    return (this.game.time - this.stateT) % b.period < b.on;
  }

  /** Where the flashing start button sits: on the screen's centre line, like the original (it may cover runners). */
  startButtonPos(view) {
    return { x: view.w / 2, y: view.h * CONFIG.sprint100.pads.homeY };
  }

  drawStartButton(ctx, view) {
    const { x, y } = this.startButtonPos(view);
    drawPad(ctx, ORANGE, x, y, CONFIG.sprint100.pads.radius);
  }

  poseFor(a) {
    const r = a.runner;
    const now = this.game.time;
    const c = this.cfg.countdown;
    const ease = (k) => k * k * (3 - 2 * k);
    if (this.state === 'waiting') {
      // Standing at the line, shifting weight a little.
      const s = Math.sin(now * 1.7 + a.idlePhase);
      return { ...POSES.stand, hipY: POSES.stand.hipY + 0.006 * s, lean: POSES.stand.lean + 0.02 * s };
    }
    if (this.state === 'ready') {
      // Wait a beat, bend down, then settle into the blocks.
      const k = clamp((now - this.stateT - a.crouchDelay) / c.crouchTime, 0, 1);
      if (k < 0.5) return lerpPose(POSES.stand, POSES.bend, ease(k / 0.5));
      return lerpPose(POSES.bend, POSES.blocks, ease((k - 0.5) / 0.5));
    }
    if (this.state === 'set') {
      return lerpPose(POSES.blocks, POSES.set, ease(clamp((now - this.stateT - a.setDelay) / c.riseTime, 0, 1)));
    }
    // Racing. Until an athlete reacts to the gun they hold the set position.
    const d = r.x - r.startX; // meters out of the blocks
    if (d <= 0 && r.v === 0 && !r.finished) return POSES.set;
    const amp = clamp(r.v / 9, 0.3, 1);
    const run = runPose(r.phase, amp);
    if (r.mode === 'lean') return leanPose(run, r.leanAmount);
    // Drive phase: out of the blocks low and pitched forward, rising to upright.
    const drive = Math.pow(clamp(1 - d / this.cfg.driveDistance, 0, 1), 1.5);
    run.lean += 0.75 * drive;
    run.hipY += 0.07 * drive;
    if (d < 0.8) return lerpPose(POSES.set, run, ease(clamp(d / 0.8, 0, 1)));
    if (r.finished && r.v < 2) return lerpPose(POSES.stand, run, r.v / 2);
    return run;
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
    const cy = 110;
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
        else if (this.player.runner.mode === 'carry') {
          const pulse = 0.75 + 0.25 * Math.sin(now * 18);
          text(ctx, 'LEAN!', cx, cy, { size: 64, color: `rgba(255,140,40,${pulse})`, shadow: true });
          roundRect(ctx, cx - 130, cy + 32, 260, 32, 16);
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fill();
          text(ctx, 'Both thumbs together', cx, cy + 49, { size: 19 });
        }
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
