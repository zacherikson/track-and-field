import { CONFIG } from '../config.js';
import { Camera } from '../core/camera.js';
import { rand, shuffle, clamp } from '../core/math.js';
import { text, roundRect } from '../core/ui.js';
import { Runner } from '../athletes/runner.js';
import { AIController } from '../athletes/ai.js';
import { CHARACTERS, player as chosenPlayer, rivals as rivalRoster, heightOf } from '../athletes/roster.js';
import { drawFigure, runPose, lerpPose, leanPose, launchPose, handReach, POSES, LAUNCH } from '../athletes/stickFigure.js';
import { TrackRenderer } from '../render/track.js';
import { ORANGE, drawPad } from '../render/pads.js';
import { flow } from '../flow.js';
import { getDifficulty } from '../core/storage.js';
import { GhostRecorder, GhostRun } from '../online/ghost.js';
import { TraceRecorder, TracePlayer } from '../online/trace.js';
import { LiveChannel, serverNow } from '../online/live.js';
import { LiveRun } from '../online/liveRun.js';


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
 *
 * GHOSTS: a subclass can set `recordGhost` to record the player's run for an
 * exact replay (online/ghost.js, the 100m), or `traceProps` (how many event
 * numbers each frame keeps, see traceFrameProps) to record it frame by frame
 * (online/trace.js). `ghostSpec` ({ name, data, overlay }) races a recording in
 * the lane next to the player instead of one rival, or with `overlay` in the
 * player's own lane (a tournament keeps its five rivals). A ghost is never
 * scored in a tournament.
 *
 * LIVE: with `live` set (a session from the waiting room, online/live.js:
 * { room, uid, players, startAt, setLen }) the other players take the lanes
 * next to yours, the countdown runs itself so the gun fires at `startAt` on
 * every phone, and runners travel both ways as the race goes (liveRun.js).
 */
export class LaneRace {
  constructor(ev, cfg) {
    this.ev = ev;
    this.cfg = cfg;
    this.level = getDifficulty(); // 'amateur' | 'pro', chosen on the menu
    this.difficulty = CONFIG.ai[this.level];
  }

  enter() {
    const cfg = this.cfg;
    this.track = new TrackRenderer(cfg.lanes, cfg.distance, cfg.startX);
    this.track.blocksNudge = (lane) => this.laneNudge(lane);
    this.camera = new Camera();

    // Build the field: player in their lane, rivals in the others (a ghost, if
    // there is one, takes the lane next to the player, or shares the player's).
    const rivals = shuffle(rivalRoster());
    const spec = this.ghostSpec;
    const ghostLane = spec && !spec.overlay ? (cfg.playerLane < cfg.lanes ? cfg.playerLane + 1 : cfg.playerLane - 1) : null;
    // Live: the other players in the lanes nearest yours.
    const others = this.live ? this.live.players.filter((p) => p.uid !== this.live.uid) : [];
    const liveLanes = new Map(nearestLanes(cfg.playerLane, cfg.lanes).slice(0, others.length).map((lane, i) => [lane, others[i]]));
    this.athletes = [];
    for (let lane = 1; lane <= cfg.lanes; lane++) {
      if (lane === ghostLane) {
        this.athletes.push(this.ghostAthlete(lane));
        continue;
      }
      if (liveLanes.has(lane)) {
        this.athletes.push(this.liveAthlete(lane, liveLanes.get(lane)));
        continue;
      }
      const isPlayer = lane === cfg.playerLane;
      const who = isPlayer ? chosenPlayer() : rivals.pop();
      const runner = new Runner(this.runnerParams, undefined, cfg.startX); // event-specific physics, if any
      this.athletes.push({
        lane,
        isPlayer,
        name: who.name,
        colors: who.colors,
        runner,
        ai: isPlayer ? null : this.createAI(runner),
        mark: null,
        status: 'ok',
        idlePhase: rand(0, Math.PI * 2), // so the waiting athletes don't sway in unison
      });
      // Sharing the player's lane: drawn just behind them.
      if (isPlayer && spec?.overlay) this.athletes.push(this.ghostAthlete(lane));
    }
    this.player = this.athletes.find((a) => a.isPlayer);
    if (this.traceProps != null) this.tracer = new TraceRecorder(this.ev.id, this.traceProps);
    if (this.recordGhost) {
      this.recorder = new GhostRecorder(this.player.runner, {
        step: CONFIG.loop.fixedStep,
        distance: cfg.distance,
        startX: cfg.startX,
        prompt: cfg.dipPromptDistance ?? CONFIG.dip.promptDistance,
        athlete: chosenPlayer().id, // so the ghost looks like the athlete who ran it
      });
    }
    this.exitBtn = { x: 0, y: 0, w: 44, h: 40 };
    this.onResize(this.game.view);
    this.resetField();
    this.setState('waiting', this.game.time);
    if (this.live) this.openLive();
  }

  /** Another player in a live race, replayed from what their phone sends. */
  liveAthlete(lane, p) {
    const who = CHARACTERS.find((c) => c.id === p.athlete) ?? chosenPlayer();
    const live = new LiveRun(this.cfg.startX);
    return { lane, isPlayer: false, name: p.name, uid: p.uid, colors: who.colors, runner: live.runner, ai: null, live, mark: null, status: 'ok', idlePhase: rand(0, Math.PI * 2) };
  }

  /** Live race: when the gun fires here (this game's clock), and the channel to the others. */
  openLive() {
    const c = this.cfg.countdown;
    const now = this.game.time;
    this.liveGoT = now + (this.live.startAt - serverNow()) / 1000;
    this.liveSetT = this.liveGoT - this.live.setLen;
    this.liveReadyT = Math.max(now, this.liveSetT - c.readyTime);
    const byUid = new Map(this.athletes.filter((a) => a.live).map((a) => [a.uid, a]));
    this.channel = new LiveChannel(this.live, (uid, doc) => {
      const a = byUid.get(uid);
      if (a?.live.receive(doc)) a.runner = a.live.runner;
    });
    this.channel.open().catch(() => {});
  }

  /** Your runner so far, for the others (the same data as a 100m ghost, plus how far it's got). */
  sendLive(force = false) {
    const done = this.player.mark != null || this.player.status !== 'ok';
    this.channel.send({ name: this.live.name ?? '', athlete: chosenPlayer().id, run: this.recorder.data(null), n: this.stepN, done }, force || done);
  }

  exit() {
    if (!this.channel) return;
    const done = this.player.mark != null;
    this.channel.close(done ? null : { name: this.live.name ?? '', athlete: chosenPlayer().id, left: true });
  }

  /**
   * The ghost, looking like the athlete who made the recording. An exact replay
   * (`ghost`) has its own Runner; a frame-by-frame one (`trace`) only needs a
   * stand-in with a position.
   */
  ghostAthlete(lane) {
    const spec = this.ghostSpec;
    const who = CHARACTERS.find((c) => c.id === spec.data.athlete) ?? chosenPlayer();
    const trace = spec.data.kind === 'trace' ? new TracePlayer(spec.data) : null;
    const ghost = trace ? null : new GhostRun(spec.data);
    return {
      lane,
      isPlayer: false,
      name: spec.name,
      colors: who.colors,
      runner: ghost ? ghost.runner : new TraceBody(this.cfg.startX),
      ai: null,
      ghost,
      trace,
      overlay: !!spec.overlay,
      mark: null,
      status: 'ok',
      idlePhase: rand(0, Math.PI * 2),
    };
  }

  /** A rival's thumbs. `prev` is their controller from the last race (keeps their pace). */
  createAI(runner, prev = null) {
    return new AIController(runner, this.difficulty, prev?.cadence);
  }

  /** Everyone back on the line, camera on the player. */
  resetField() {
    this.tapLog = []; // optional tap markers: { x, y, t, result }
    this.tapCounts = {};
    for (const a of this.athletes) {
      a.runner.reset();
      a.ghost?.reset();
      a.frame = null;
      if (a.ai) a.ai = this.createAI(a.runner, a.ai);
      a.mark = null;
    }
    this.onResetField?.();
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
    // Live: the same gun on every phone.
    if (this.live) {
      this.setT = Math.max(t, this.liveSetT);
      this.goT = this.liveGoT;
    }
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
    if (this.live && this.state === 'waiting' && end >= this.liveReadyT) this.startCountdown(this.liveReadyT);
    if (this.state === 'ready' && end >= this.setT) this.setState('set', this.setT);
    if (this.state === 'set' && end >= this.goT) {
      this.setState('race', this.goT);
      for (const a of this.athletes) {
        if (a.ghost) a.ghost.go();
        else if (!a.trace && !a.live) (a.ai ?? a.runner).go(this.goT);
      }
      // Count physics steps from the gun, and note where this step sat relative
      // to it, so a recorded run can replay on exactly the same step grid.
      this.stepN = 0;
      this.recorder?.start(this.goT, t - this.goT);
      this.tracer?.start();
      this.game.input.resetStats(); // input diagnostics cover the race itself
      this.game.worstFrameMs = 0;
      this.onGo?.();
    }

    // 2. Input, each event at its own precise time.
    const racing = this.state === 'race' || this.state === 'finished';
    if (racing && this.recorder) this.recorder.n = this.stepN;
    for (const e of this.game.input.consume(end)) {
      if (e.type === 'down' && this.hitExit(e)) return flow.menu(this.game);
      if (e.type === 'key' && e.code === 'Escape') return flow.menu(this.game);
      if (this.state === 'waiting') {
        // Any tap or key starts READY / GET SET / GO (a live race starts itself).
        if (!this.live && (e.type === 'down' || this.mapInput(e) != null || e.code === 'Enter')) this.startCountdown(e.t);
        continue;
      }
      const action = this.mapInput(e);
      if (action == null) continue;
      // Taps before GO are ignored (no false starts).
      if (this.state !== 'race' || e.t < this.goT) {
        this.logTap(e, this.state === 'finished' ? 'after finish' : 'early');
        continue;
      }
      const mode = this.player.runner.mode;
      if (mode === 'carry') this.logTap(e, this.onDipAction(action, e) ?? 'lean zone');
      else if (mode === 'run') this.logTap(e, this.onPlayerAction(action, e.t, e));
      else this.logTap(e, 'after lean');
    }

    // 3. Simulation.
    if (racing) {
      this.simulate(dt, t);
      this.stepN++;
      if (this.channel) this.sendLive();
    }

    // 4. State timers.
    if (this.state === 'race' && end - this.goT > this.cfg.maxRaceTime) {
      this.player.status = 'dnf';
      this.setState('finished', t);
    }
    // Live: wait for the others to finish (or give up on them).
    const waitLive = this.athletes.some((a) => a.live && a.mark == null && !a.live.left) && end - this.stateT < this.cfg.finishHold + LIVE_WAIT;
    if (this.state === 'finished' && end - this.stateT >= this.cfg.finishHold && !waitLive) return this.finish();

    this.updateControls?.(dt);
    const pr = this.player.runner;
    this.camera.follow(pr.x, pr.v, dt);
  }

  /** One physics step for one athlete, shared by live play and the fast-forward in finish(). */
  stepAthlete(a, dt, t) {
    if (a.ghost) return a.ghost.advanceTo(t + dt - this.goT); // replays on its own step grid
    if (a.live) return a.live.advanceTo(t + dt - this.goT, dt); // as far as their phone has told us
    if (a.trace) return this.stepTrace(a, t + dt - this.goT);
    const D = this.cfg.distance;
    const r = a.runner;
    if (D - r.x <= (this.cfg.dipPromptDistance ?? CONFIG.dip.promptDistance) && r.mode === 'run' && !r.dipUsed) {
      r.carry();
      if (a.isPlayer) this.carryT = t;
    }
    a.ai?.update(t, dt, r.x / D, D - r.x);
    r.update(dt, t);
    this.afterStep?.(a, t + dt);
  }

  /** Moves a frame-by-frame ghost to race time `rt`; it holds its last frame at the end. */
  stepTrace(a, rt) {
    const f = a.trace.at(rt);
    if (!f) return;
    a.frame = f;
    a.runner.x = f.x;
    this.onTraceFrame?.(a, f, rt);
  }

  /** The event numbers to keep with each recorded frame of the player (see traceProps). */
  traceFrameProps() {
    return [];
  }

  /**
   * Finish lean input. Strides don't count in the lean zone: press BOTH thumbs
   * together (within chordWindow) to lean. Space / Up arrow on a keyboard.
   */
  onDipAction(action, e) {
    const dip = CONFIG.dip;
    if (e.t - this.carryT < dip.armDelay) return 'lean zone'; // stray stride taps as the zone begins
    if (action === 'DIP') {
      this.player.runner.lean();
      return 'lean';
    }
    this.dipPress ??= { L: -Infinity, R: -Infinity };
    this.dipPress[action] = e.t;
    const other = action === 'L' ? 'R' : 'L';
    if (e.t - this.dipPress[other] <= dip.chordWindow && this.player.runner.lean()) return 'lean';
    return 'lean zone';
  }

  /** Remember what a tap did, for the optional tap markers (CONFIG.debug.tapMarkers). */
  logTap(e, result) {
    if (e.type !== 'down') return;
    this.tapCounts[result] = (this.tapCounts[result] ?? 0) + 1;
    if (CONFIG.debug.tapMarkers) this.tapLog.push({ x: e.x, y: e.y, t: e.t, result });
  }

  /** What the browser delivered vs what the game did with it, for the results screen. */
  inputStats() {
    const s = this.game.input.stats;
    const judged = Object.values(this.tapCounts).reduce((a, b) => a + b, 0);
    const ignored = Object.entries(this.tapCounts).filter(([k]) => !['hit', 'miss', 'lean'].includes(k));
    const d = s.delays.map((x) => x.ms).sort((a, b) => a - b);
    const slow = s.delays.filter((x) => x.ms > 60);
    return {
      touches: s.touches,
      cancels: s.cancels,
      lagMax: s.lagMax,
      judged,
      ignored,
      worstFrameMs: this.game.worstFrameMs ?? 0,
      phoneTypical: d.length ? d[Math.floor(d.length / 2)] : 0,
      phoneMax: d.length ? d[d.length - 1] : 0,
      slow: slow.length,
      slowEdge: slow.filter((x) => x.edge).length,
      slowMulti: slow.filter((x) => x.fingers > 1).length,
    };
  }

  drawTapMarkers(ctx, view) {
    const now = this.game.time;
    const life = 0.7;
    this.tapLog = this.tapLog.filter((m) => now - m.t < life);
    const colors = { hit: '#35e05a', miss: '#ff3b30', lean: '#ff9d1c' };
    for (const m of this.tapLog) {
      const k = 1 - (now - m.t) / life;
      const c = colors[m.result] ?? '#c8c8c8';
      ctx.save();
      ctx.globalAlpha = Math.min(1, 1.5 * k);
      ctx.strokeStyle = c;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 4, 0, Math.PI * 2);
      ctx.fill();
      if (!(m.result in colors) || m.result === 'lean') text(ctx, m.result, m.x, m.y - 26, { size: 14, color: c, shadow: true });
      ctx.restore();
    }
    // Running tally, bottom centre.
    const c = this.tapCounts;
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    const other = Object.entries(c).filter(([k]) => k !== 'hit' && k !== 'miss').map(([k, v]) => `${k} ${v}`).join(' · ');
    const line = `taps ${total} · hit ${c.hit ?? 0} · miss ${c.miss ?? 0}${other ? ' · ' + other : ''}`;
    const y = view.h - 16 - view.safe.b;
    ctx.font = '600 14px system-ui, sans-serif';
    const w = Math.min(view.w - 32, ctx.measureText(line).width + 24);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    roundRect(ctx, view.w / 2 - w / 2, y - 13, w, 26, 13);
    ctx.fill();
    text(ctx, line, view.w / 2, y, { size: 14, weight: 600, color: '#fff', maxWidth: view.w - 40 });
  }

  /** If athlete `a` crossed the line during this step, the exact crossing time, else null. */
  crossing(a, t, dt) {
    if (a.ghost) return a.ghost.mark == null ? null : this.goT + a.ghost.mark;
    if (a.live) return a.live.mark == null ? null : this.goT + a.live.mark;
    if (a.trace) return t + dt - this.goT >= a.trace.data.mark ? this.goT + a.trace.data.mark : null;
    return a.runner.crossing(this.cfg.distance, t, dt);
  }

  simulate(dt, t) {
    for (const a of this.athletes) {
      this.stepAthlete(a, dt, t);
      if (a.isPlayer) this.playerTopV = Math.max(this.playerTopV ?? 0, a.runner.v);
      const cross = this.crossing(a, t, dt);
      if (cross != null && a.mark == null && a.status === 'ok') {
        a.mark = cross - this.goT;
        a.runner.finished = true;
        if (a.isPlayer && this.state === 'race') this.setState('finished', t);
      }
    }
  }

  /** Fast-forward any rivals still running, then show results. */
  finish() {
    const step = CONFIG.loop.fixedStep;
    let t = this.game.time;
    const goT = this.goT;
    const pending = () => this.athletes.filter((a) => !a.isPlayer && !a.live && a.mark == null);
    for (let guard = 0; pending().length && guard < 60 / step; guard++) {
      for (const a of pending()) {
        this.stepAthlete(a, step, t);
        const cross = this.crossing(a, t, step);
        if (cross != null) a.mark = cross - goT;
      }
      t += step;
    }

    const results = this.athletes.map((a) => ({
      name: a.name,
      lane: this.track.laneNumber(a.lane),
      colors: a.colors,
      isPlayer: a.isPlayer,
      ghost: !!(a.ghost || a.trace),
      mark: a.mark,
      status: a.isPlayer ? a.status : a.mark == null ? 'dnf' : 'ok',
    }));
    const rank = (r) => (r.status === 'ok' ? r.mark : r.status === 'dnf' ? 1e6 : 2e6);
    results.sort((a, b) => rank(a) - rank(b));
    const stats = this.raceStats?.();
    if (stats && this.live) stats.live = true;
    // The player's run, for the ghost and the online leaderboard.
    if (stats && this.player.status === 'ok' && this.player.mark != null) {
      if (this.recorder) stats.run = this.recorder.data(this.player.mark);
      else if (this.tracer) stats.run = this.tracer.data(this.player.mark, chosenPlayer().id);
    }
    flow.results(this.game, this.ev, results, stats);
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
      if (!a.overlay) this.drawLaneProps?.(ctx, view, a); // e.g. hurdles, under the athlete in the same lane
      const p = this.track.toScreen(this.camera, view, a.runner.x + a.runner.reach * 0.5 + this.startNudge(a) + (a.live?.dx ?? 0), a.lane);
      const tall = heightOf(a.colors);
      if (p.x < -80 || p.x > view.w + 80) continue;
      const scale = this.track.figureScale(a.lane);
      // Events can lift an athlete off the track (a short one bouncing over a hurdle); the shadow stays down.
      const liftM = a.trace ? (a.frame?.e ?? 0) : this.liftFor?.(a) ?? 0;
      const lift = liftM * this.camera.ppm * scale;
      const pose = this.poseFor(a);
      if (a.ghost || a.trace) {
        // See-through, with a name tag, so it never reads as a real rival.
        ctx.save();
        ctx.globalAlpha = 0.45;
        drawFigure(ctx, p.x, p.y + 4 - lift, H * scale * tall, pose, a.colors, p.y + 4);
        ctx.restore();
        text(ctx, a.name, p.x, p.y - H * scale * tall - 6 - (a.overlay ? 18 : 0), { size: 14, color: 'rgba(255,255,255,0.8)', shadow: true });
      } else {
        drawFigure(ctx, p.x, p.y + 4 - lift, H * scale * tall, pose, a.colors, p.y + 4);
        // Live: the other players are real rivals, named.
        if (a.live) text(ctx, a.live.left ? `${a.name} (left)` : a.name, p.x, p.y - H * scale * tall - 6, { size: 14, color: '#ffb400', shadow: true });
      }
      // Keep the player's frames for a frame-by-frame ghost.
      if (a.isPlayer && this.tracer && (this.state === 'race' || this.state === 'finished')) {
        this.tracer.sample(this.game.time - this.goT, a.runner.x + a.runner.reach * 0.5, liftM, pose, this.traceFrameProps(a));
      }
    }
    this.drawHUD(ctx, view);
    if (blinkOn) this.drawStartButton(ctx, view);
    this.drawControls(ctx, view);
    this.drawBanner(ctx, view);
    if (CONFIG.debug.tapMarkers) this.drawTapMarkers(ctx, view);
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
    return fade === 0 ? 0 : this.laneNudge(a.lane, heightOf(a.colors)) * fade;
  }

  /** The start-position drawing shift for a lane (see startNudge), cached. */
  laneNudge(lane, tall = 1) {
    this.nudges ??= {};
    const key = `${lane}:${tall}`;
    if (this.nudges[key] == null) {
      const z = this.track.laneZ(lane);
      const H0 = CONFIG.figure.height * this.camera.ppm * tall;
      const handPx = Math.max(handReach(POSES.blocks), handReach(POSES.set)) * H0 * this.track.figureScale(lane);
      const handM = handPx / (this.camera.ppm * this.track.scaleAt(z));
      this.nudges[key] = -this.cfg.handGap - (this.cfg.startX + handM);
    }
    return this.nudges[key];
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
      // Standing in front of the blocks, just behind the line, shifting weight a little.
      const s = Math.sin(now * 1.7 + a.idlePhase);
      return { ...POSES.stand, hipY: POSES.stand.hipY + 0.006 * s, lean: POSES.stand.lean + 0.02 * s };
    }
    if (this.state === 'ready') {
      // Wait a beat, drop onto the hands at the line, kick the rear leg back
      // into its block, then step the front foot back onto its block and settle
      // (as in the original: only the rear leg kicks).
      const k = clamp((now - this.stateT - a.crouchDelay) / c.crouchTime, 0, 1);
      const keys = [
        [0, POSES.stand],
        [0.18, POSES.bend],
        [0.34, POSES.squat],
        [0.55, POSES.kickRear],
        [0.76, POSES.stepFront],
        [1, POSES.blocks],
      ];
      for (let i = 1; i < keys.length; i++) {
        if (k <= keys[i][0]) {
          const [k0, p0] = keys[i - 1];
          return lerpPose(p0, keys[i][1], ease((k - k0) / (keys[i][0] - k0)));
        }
      }
      return POSES.blocks;
    }
    if (this.state === 'set') {
      return lerpPose(POSES.blocks, POSES.set, ease(clamp((now - this.stateT - a.setDelay) / c.riseTime, 0, 1)));
    }
    // Racing. A frame-by-frame ghost shows what it recorded.
    if (a.trace && a.frame) return a.frame.pose;
    // Until an athlete reacts to the gun they hold the set position.
    const d = r.x - r.startX; // meters out of the blocks
    if (d <= 0 && r.v === 0 && !r.finished) return POSES.set;
    const amp = clamp(r.v / 11, 0.15, 1); // knee lift, back-kick and arm swing grow with speed
    // Drive phase: out of the blocks low and pitched forward, rising to upright.
    const drive = Math.pow(clamp(1 - d / this.cfg.driveDistance, 0, 1), 1.5);
    const run = runPose(r.phase, amp, drive);
    if (r.mode === 'lean') return leanPose(run, r.leanAmount);
    // Explode out of the blocks: snap from set into the launch pose (ease-out:
    // fastest at the gun), then flow from the launch into the drive run.
    if (d < LAUNCH.distance) return launchPose(1 - (1 - d / LAUNCH.distance) ** 2);
    if (d < LAUNCH.blend) return lerpPose(launchPose(1), run, ease((d - LAUNCH.distance) / (LAUNCH.blend - LAUNCH.distance)));
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
  }

  drawBanner(ctx, view) {
    const now = this.game.time;
    const cx = view.w / 2;
    const cy = this.cfg.bannerY ?? 110; // hurdles move it down, clear of the buttons
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

const LIVE_WAIT = 12; // s after you finish to wait for the other live runners

/** Lanes from nearest to `lane` outwards (not `lane` itself). */
function nearestLanes(lane, lanes) {
  const out = [];
  for (let d = 1; out.length < lanes - 1; d++) {
    if (lane + d <= lanes) out.push(lane + d);
    if (lane - d >= 1) out.push(lane - d);
  }
  return out;
}

/** Where a frame-by-frame ghost is, in the shape the lane drawing reads from a Runner. */
class TraceBody {
  constructor(startX) {
    this.startX = startX;
    this.reach = 0; // the recorded x is already where the body is drawn
    this.reset();
  }

  reset() {
    this.x = this.startX;
    this.v = 0;
    this.mode = 'run';
    this.finished = false;
  }
}
