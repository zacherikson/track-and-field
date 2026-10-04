import { CONFIG } from '../config.js';
import { Sprint100 } from './sprint100.js';
import { Exchange, exchangeSpot, LEG } from './relayRules.js';
import { Runner } from '../athletes/runner.js';
import { CHARACTERS, player as chosenPlayer, theirAthlete, heightOf } from '../athletes/roster.js';
import { POSES, lerpPose, runPose, leanPose, handPos } from '../athletes/stickFigure.js';
import { rand, shuffle, clamp } from '../core/math.js';
import { text, roundRect } from '../core/ui.js';
import { drawPad } from '../render/pads.js';
import { LAYOUT } from '../render/track.js';
import { VENUES } from '../render/venues.js';
import { getSpecialLevel } from '../core/storage.js';
import { nearestLanes } from './laneRace.js';
import { LiveTrace } from '../online/liveTrace.js';

const BLUE = { hi: '#bfe0ff', mid: '#2f80ff', lo: '#1347b8' };
const GRADES = {
  perfect: { label: 'PERFECT!', color: '#59cd90' },
  good: { label: 'GOOD', color: '#ffffff' },
  late: { label: 'LATE', color: '#ff9d1c' },
  missed: { label: 'MISSED!', color: '#ff5a4e' },
};
const REACH_ARM = { upper: 1.45, fore: 1.55 }; // incoming: baton held out in front
const BACK_ARM = { upper: -1.2, fore: -1.4 }; // outgoing: hand back for it

// Live: what each frame of your team carries for the others (online/liveTrace.js),
// besides the baton carrier's own body: every runner as LEG_PROPS numbers
// (x, speed, stride phase, lean reach, mode), which leg has the baton, and
// whether each exchange's baton is held out.
export const MODES = ['run', 'carry', 'lean'];
export const LEG_PROPS = 5;
export const TEAM_PROPS = 4 * LEG_PROPS + 1 + 3;
export const LIVE_TRACE = { hz: 20, maxFrames: 1500 }; // the longest relay (maxRaceTime) at 20 frames a second

/**
 * 4x100m RELAY: six teams of four, one long straight, the baton changing hands
 * in the blue zone around each 100 m line (relayRules.js).
 *
 * Each lane is a team, in its captain's kit: the captain anchors and the next
 * three athletes on the roster run the first three legs. Yours is captained by
 * whoever does the relay in your lineup (tap them on the intro card to swap).
 *
 * You run every leg of your team with the 100m's green targets. In the zone
 * the targets give way to one blue button in the middle: PASS, then TAKE.
 * Your teammate sets off on their own as you come in; TAKE when they're at
 * arm's length. Then you're them, on the next leg. The anchor leans at the
 * line with the orange pads, as in the 100m.
 *
 * A team (`athletes` entry) carries its four `legs` ({ who, colors, runner, ai,
 * view }) and the one holding the baton: `leg`, with `runner`, `ai` and
 * `colors` pointing at that leg's, so LaneRace's start, finish line, late hits
 * and results all work on the baton carrier. Each leg's `view` is what the
 * race draws: every runner on the track, waiting, running or pulled up.
 *
 * LIVE (a squad's practice, online/live.js): each other player's team takes
 * a lane next to yours, and nobody else runs. Every phone sends its own team
 * frame by frame (where each of the four is, how fast, their stride, which leg
 * has the baton: traceFrameProps), and the others' teams are drawn from that
 * with the same poses as yours (stepLiveTeam). Their times come from their phones.
 */
export class Relay4x100 extends Sprint100 {
  constructor(ev) {
    super(ev);
    this.cfg = { ...CONFIG.sprint100, ...CONFIG.relay };
    this.recordGhost = false;
    this.level = getSpecialLevel(); // Special Events' RIVALS toggle (the campaigns don't come into it)
    this.difficulty = CONFIG.ai[this.level];
  }

  enter() {
    if (this.live) {
      // Your team goes out to the others frame by frame (LaneRace.openLive streams it).
      this.traceProps = TEAM_PROPS;
      this.traceOpts = LIVE_TRACE;
    }
    super.enter();
    this.track.zones = [0, 1, 2].map((k) => exchangeSpot(this.cfg, k));
    if (!this.live) this.track.venue = VENUES[this.level]; // raced where its rivals race: the high school, or the big stadium (live: the big stadium)
  }

  /** Six teams, yours in your lane: always against rivals (Special Events are never Training). Live: yours and the other players'. */
  buildField() {
    const cfg = this.cfg;
    const captain = chosenPlayer(this.ev.id);
    if (this.live) {
      const mine = Object.assign(this.team(cfg.playerLane, captain, true), { name: this.live.name });
      const others = this.live.others;
      const theirs = nearestLanes(cfg.playerLane, cfg.lanes)
        .slice(0, others.length)
        .map((lane, i) => this.liveTeam(lane, others[i]));
      return [mine, ...theirs].sort((a, b) => a.lane - b.lane);
    }
    const rivals = shuffle(CHARACTERS.filter((c) => c !== captain));
    const field = [];
    for (let lane = 1; lane <= cfg.lanes; lane++) {
      const isPlayer = lane === cfg.playerLane;
      const cap = isPlayer ? captain : rivals.pop();
      if (cap) field.push(this.team(lane, cap, isPlayer));
    }
    return field;
  }

  /** Another player's team in a live relay, captained by their relay athlete and named for them. */
  liveTeam(lane, p) {
    const team = this.team(lane, theirAthlete(p, this.ev.id), false, false);
    return Object.assign(team, { name: p.name, uid: p.uid, live: new LiveTrace(this.ev.id, TEAM_PROPS, this.stage, LIVE_TRACE.maxFrames) });
  }

  /** A team in `cap`'s kit: the three after them on the roster run legs 1-3, and they anchor. `ai`: the computer runs it. */
  team(lane, cap, isPlayer, ai = !isPlayer) {
    const cfg = this.cfg;
    const i = CHARACTERS.indexOf(cap);
    const squad = [1, 2, 3].map((k) => CHARACTERS[(i + k) % CHARACTERS.length]).concat(cap);
    const kit = { shirt: cap.colors.shirt, shorts: cap.colors.shorts };
    const team = { lane, isPlayer, name: `Team ${cap.name}`, mark: null, status: 'ok', idlePhase: rand(0, Math.PI * 2), exchanges: [] };
    team.legs = squad.map((who, k) => {
      const runner = new Runner(this.runnerParams, undefined, k === 0 ? cfg.startX : exchangeSpot(cfg, k - 1).wait);
      const colors = { ...who.colors, ...kit };
      return { who, colors, runner, ai: ai ? this.createAI(runner) : null, view: { lane, runner, colors, legIndex: k, team, idlePhase: rand(0, Math.PI * 2), mark: null } };
    });
    this.toLeg(team, 0);
    return team;
  }

  /** The baton is with leg `k`: the team's runner, thumbs and look are theirs now. */
  toLeg(a, k) {
    const l = a.legs[k];
    a.leg = a.legIndex = k;
    a.runner = l.runner;
    a.ai = l.ai;
    a.colors = l.colors;
    a.ex = a.exchanges[k] ?? null; // the exchange this leg is running toward (none for the anchor)
  }

  resetField() {
    for (const a of this.athletes) this.toLeg(a, 0);
    super.resetField(); // leg 1 back in the blocks, with fresh thumbs
    for (const a of this.athletes) {
      a.legs[0].ai = a.ai;
      for (const l of a.legs.slice(1)) {
        l.runner.reset();
        if (l.ai) l.ai = this.createAI(l.runner, l.ai);
      }
      // A live team's exchanges only say what its frames do (stepLiveTeam): its own phone runs them.
      a.exchanges = [0, 1, 2].map((k) => (a.live ? { k, stage: 'approach', reachT: null } : new Exchange(this.cfg, k, a.legs[k].runner, a.legs[k + 1].runner, a.isPlayer ? null : this.cfg.ai[this.level])));
      a.ex = a.exchanges[0];
    }
    this.popup = null;
    this.whiffT = -Infinity;
  }

  startCountdown(t) {
    super.startCountdown(t);
    // Leg 1 settles into the blocks on the team's own timing.
    for (const a of this.athletes) Object.assign(a.legs[0].view, { crouchDelay: a.crouchDelay, setDelay: a.setDelay });
  }

  // ---------------------------------------------------------------- the race

  stepAthlete(a, dt, t) {
    if (a.live) return this.stepLiveTeam(a);
    const r = a.runner;
    const D = this.cfg.distance;
    // The baton carrier runs on strides until their exchange takes over in the zone.
    if (!a.ex || a.ex.stage === 'approach') {
      if (a.leg === 3 && D - r.x <= CONFIG.dip.promptDistance && r.mode === 'run' && !r.dipUsed) {
        r.carry();
        if (a.isPlayer) this.carryT = t;
      }
      a.ai?.update(t, dt, clamp((r.x - a.leg * LEG) / LEG, 0, 1), D - r.x);
      r.update(dt, t);
    }
    for (const ex of a.exchanges) if (ex.step(t, dt) === 'handoff') this.handOff(a, ex, t + dt);
    // Everyone who's run their leg pulls up.
    for (const l of a.legs) if (l.runner.finished && l.runner !== a.runner) l.runner.update(dt, t);
  }

  /** Another player's team, as their latest frames have it (see traceFrameProps). */
  stepLiveTeam(a) {
    a.live.advanceTo();
    const f = a.live.frame;
    if (!f) return;
    const at = (i) => f.pa[i] + (f.pb[i] - f.pa[i]) * f.k;
    const pick = (i) => (f.k < 0.5 ? f.pa[i] : f.pb[i]);
    a.legs.forEach((l, k) => {
      const r = l.runner;
      const o = k * LEG_PROPS;
      r.x = at(o);
      r.v = Math.max(0, at(o + 1));
      r.phase = at(o + 2);
      r.reach = Math.max(0, at(o + 3));
      const m = Math.round(pick(o + 4));
      r.mode = MODES[m % 3] ?? 'run';
      r.finished = m >= 3;
      if (r.v > 0) r.started = true;
    });
    const leg = clamp(Math.round(pick(4 * LEG_PROPS)), 0, 3);
    if (leg !== a.leg) this.toLeg(a, leg);
    a.exchanges.forEach((ex, k) => {
      const out = pick(4 * LEG_PROPS + 1 + k) > 0.5;
      if (out && ex.stage !== 'reach') Object.assign(ex, { stage: 'reach', reachT: this.game.time });
      else if (!out) ex.stage = k < leg ? 'done' : 'approach';
    });
  }

  /** Your team for the others, with each frame (TEAM_PROPS numbers, read back by stepLiveTeam). */
  traceFrameProps(a) {
    const legs = a.legs.flatMap(({ runner: r }) => [r.x, r.v, r.phase, r.reach, Math.max(0, MODES.indexOf(r.mode)) + (r.finished ? 3 : 0)]);
    const reaching = a.exchanges.map((ex) => (ex.stage === 'reach' || ex.stage === 'missed' ? 1 : 0));
    return [...legs, a.leg, ...reaching];
  }

  /** The baton changed hands in exchange `ex` at time t: the next leg is the team's runner now. */
  handOff(a, ex, t) {
    this.toLeg(a, ex.k + 1);
    if (a.ai) a.ai.nextTapT = t + 1 / a.ai.cadence;
    if (!a.isPlayer) return;
    // Your thumbs are on the new runner: a fresh green target right away.
    this.judge.runner = a.runner;
    this.judge.start(t);
    this.spawnT = t;
    this.missSide = null;
    this.popup = { ex, t0: t };
    navigator.vibrate?.(ex.grade === 'perfect' ? [20, 40, 20] : 30);
  }

  /** The player's exchange, while its button (or a missed handover) is up. */
  get batonUp() {
    const ex = this.player.ex;
    return !!ex && this.state === 'race' && ex.stage !== 'approach' && ex.stage !== 'done';
  }

  mapInput(e) {
    // The blue button answers to a wide strip down the middle of the screen.
    if (e.type === 'down' && this.batonUp) {
      const w = this.game.view.w;
      if (Math.abs(e.x - w / 2) <= (w * this.cfg.button.hit) / 2) return 'BATON';
    }
    return super.mapInput(e);
  }

  onPlayerAction(side, t, e) {
    if (this.batonUp) return this.batonAction(side, t);
    return super.onPlayerAction(side, t, e);
  }

  onDipAction(action, e) {
    if (this.batonUp) return this.batonAction(action, e.t);
    return super.onDipAction(action, e); // the anchor's lean
  }

  /** PASS, then TAKE: the blue button (Space on a keyboard). Taps off it do nothing in the zone. */
  batonAction(action, t) {
    const ex = this.player.ex;
    if (!ex.open || (action !== 'BATON' && action !== 'DIP')) return 'exchange';
    if (ex.stage === 'zone') return ex.pass(t) ? 'pass' : 'exchange';
    const res = ex.take(t);
    if (res === 'whiff') {
      this.whiffT = t;
      navigator.vibrate?.(40);
      return 'whiff';
    }
    if (res === 'handoff') {
      this.handOff(this.player, ex, t);
      return 'take';
    }
    return 'exchange';
  }

  /** In the late hits a team is its anchor, by name (it keeps the team's name as its id). Live: the player's name. */
  fighterOf(a) {
    const f = super.fighterOf(a);
    return a.legs && !this.live ? { ...f, name: a.legs[a.leg].who.name } : f;
  }

  /** Your numbers, with how each of your exchanges went. */
  raceStats() {
    return { ...super.raceStats(), exchanges: this.player.exchanges.map((ex) => ({ grade: ex.grade, zone: zoneTime(ex), whiffs: ex.whiffs })) };
  }

  // ---------------------------------------------------------------- drawing

  /** Every runner on the track: waiting for the baton, running with it, or pulled up after their leg. */
  drawField(ctx, view, blinkOn = false) {
    this.track.draw(ctx, view, this.camera);
    if (blinkOn) this.track.highlightLane(ctx, view, this.player.lane, 0.32);
    const H = CONFIG.figure.height * this.camera.ppm;
    for (let i = this.athletes.length - 1; i >= 0; i--) {
      const a = this.athletes[i];
      a.legs.forEach((l, k) => {
        l.view.mark = k === 3 ? a.mark : null;
        this.drawAthlete(ctx, view, l.view, H);
      });
    }
    // Live: your team's frame, for the others (LaneRace takes one as it draws the player; here that's the legs' views).
    if (this.tracer && (this.state === 'race' || this.state === 'finished')) {
      const a = this.player;
      const r = a.runner;
      this.tracer.sample(this.game.time - this.goT, r.x + r.reach * 0.5, 0, this.poseFor(a.legs[a.leg].view), this.traceFrameProps(a));
      this.stream?.pump();
    }
  }

  /** A runner, with the baton in their hand if it's theirs. */
  drawAthlete(ctx, view, a, H) {
    super.drawAthlete(ctx, view, a, H);
    const team = a.team ?? a;
    if (team.leg !== a.legIndex || !team.legs) return;
    const r = a.runner;
    const p = this.track.toScreen(this.camera, view, r.x + r.reach * 0.5 + this.startNudge(a), a.lane);
    if (p.x < -80 || p.x > view.w + 80) return;
    const h = H * this.track.figureScale(a.lane) * heightOf(a.colors);
    // Live: another player's baton carrier has their name over them (a team drawn whole, LaneRace names already).
    if (team.live && a.team) text(ctx, team.live.left ? `${team.name} (left)` : team.name, p.x, p.y - h - 6, { size: 14, color: '#ffb400', shadow: true });
    const pose = this.poseFor(a);
    const hand = handPos(p.x, p.y + 4, h, pose, 0);
    const fore = pose.arms[0].fore;
    const [dx, dy] = [Math.sin(fore), Math.cos(fore)];
    const back = 0.03 * h;
    const ahead = 0.1 * h;
    ctx.save();
    ctx.lineCap = 'round';
    for (const [color, w] of [
      ['rgba(0,0,0,0.55)', Math.max(4, 0.04 * h)],
      ['#f2f2f2', Math.max(2.5, 0.026 * h)],
    ]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(hand.x - dx * back, hand.y - dy * back);
      ctx.lineTo(hand.x + dx * ahead, hand.y + dy * ahead);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Only leg 1 starts in the blocks (see LaneRace.startNudge). */
  startNudge(a) {
    return (a.legIndex ?? 0) === 0 ? super.startNudge(a) : 0;
  }

  poseFor(a) {
    const k = a.legIndex ?? 0;
    const pose = k === 0 ? super.poseFor(a) : this.flyingPose(a);
    return this.batonArms(a.team ?? a, k, pose);
  }

  /** Legs 2-4: waiting on their mark, then a running start. */
  flyingPose(a) {
    const r = a.runner;
    const racing = this.state === 'race' || this.state === 'finished';
    if (!racing || r.v === 0) {
      // Waiting: half crouched, weight forward, ready to go.
      const s = Math.sin(this.game.time * 1.7 + a.idlePhase);
      const wait = lerpPose(POSES.stand, POSES.bend, 0.32);
      return r.finished ? POSES.stand : { ...wait, hipY: wait.hipY + 0.005 * s };
    }
    const d = r.x - r.startX;
    const amp = clamp(r.v / 11, 0.15, 1);
    const drive = 0.6 * Math.pow(clamp(1 - d / 8, 0, 1), 1.5);
    const run = runPose(r.phase, amp, drive);
    if (r.mode === 'lean') return leanPose(run, r.leanAmount);
    if (r.finished && r.v < 2) return lerpPose(POSES.stand, run, r.v / 2);
    if (r.v < 2) return lerpPose(lerpPose(POSES.stand, POSES.bend, 0.32), run, r.v / 2); // just setting off
    return run;
  }

  /** In an exchange the incoming runner holds the baton out and the outgoing one reaches back for it. */
  batonArms(team, k, pose) {
    const reaching = (ex) => ex && (ex.stage === 'reach' || ex.stage === 'missed');
    const out = team.exchanges?.[k]; // this runner bringing the baton in
    const inc = team.exchanges?.[k - 1]; // this runner waiting for it
    let arm = null;
    let since = 0;
    if (reaching(out) && team.leg === k) {
      arm = REACH_ARM;
      since = out.reachT ?? 0;
    } else if (reaching(inc) && team.leg === k - 1) {
      arm = BACK_ARM;
      since = inc.reachT ?? 0;
    }
    if (!arm) return pose;
    const blend = clamp((this.game.time - since) / 0.12, 0, 1);
    const near = pose.arms[0];
    return { ...pose, arms: [{ upper: near.upper + (arm.upper - near.upper) * blend, fore: near.fore + (arm.fore - near.fore) * blend }, pose.arms[1]] };
  }

  drawControls(ctx) {
    if (this.batonUp) return this.drawBatonButton(ctx, this.game.view, this.player.ex);
    super.drawControls(ctx);
  }

  /**
   * The blue button: PASS, then TAKE. While it says TAKE, a ring around it
   * shows how far your teammate is: it closes in as you catch them, and when
   * it meets the button they're in reach. A missed exchange shows no button.
   */
  drawBatonButton(ctx, view, ex) {
    if (!ex.open) return;
    const c = this.cfg;
    const r = c.button.radius;
    const x = view.w / 2;
    const y = view.h * c.button.y;
    const now = this.game.time;
    const take = ex.stage === 'reach';
    const gap = ex.gapNow;
    const inReach = take && gap <= c.reach;
    if (take && !inReach) {
      const k = clamp((gap - c.reach) / 2.5, 0, 1);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(x, y, r + 6 + k * r * 1.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    const pulse = inReach ? 1 + 0.06 * Math.sin(now * 30) : 1;
    drawPad(ctx, BLUE, x, y, r * pulse);
    text(ctx, take ? 'TAKE' : 'PASS', x, y + 1, { size: 30, weight: 900, color: '#fff', shadow: true });
    if (now - this.whiffT < 0.5) text(ctx, 'TOO SOON', x, y + r + 26, { size: 22, weight: 900, color: '#ff5a4e', shadow: true });
  }

  /** How the last handover went, under the GO / FINISH banners. */
  drawBanner(ctx, view) {
    super.drawBanner(ctx, view);
    if (this.batonUp && this.player.ex.stage === 'missed') {
      // Pulling up for it: say why the button went.
      text(ctx, GRADES.missed.label, view.w / 2, this.cfg.bannerY ?? 110, { size: 54, color: GRADES.missed.color, shadow: true });
      return;
    }
    const p = this.popup;
    if (!p || this.state !== 'race') return;
    const now = this.game.time;
    const zone = zoneTime(p.ex);
    const timing = p.ex.grade !== 'missed' && zone == null; // the baton's still in the zone: its time is coming
    if (!timing && now > Math.max(p.t0 + this.cfg.banner, zone != null ? p.ex.tOut + 0.8 : 0)) return;
    const g = GRADES[p.ex.grade];
    const cy = this.cfg.bannerY ?? 110;
    text(ctx, g.label, view.w / 2, cy, { size: 54, color: g.color, shadow: true });
    if (zone != null) text(ctx, `Through the zone ${zone.toFixed(2)}s`, view.w / 2, cy + 44, { size: 20, color: '#fff', shadow: true });
  }

  /** The leg you're on, under the clock. */
  drawHUD(ctx, view) {
    super.drawHUD(ctx, view);
    const a = this.player;
    text(ctx, `LEG ${a.leg + 1} OF 4 · ${a.legs[a.leg].who.name.toUpperCase()}`, view.w - 16 - view.safe.r, 72 + view.safe.t, { size: 15, align: 'right', color: '#fff', shadow: true });
  }

  /** Under the results: your three exchanges. */
  lateRender(ctx, view) {
    super.lateRender(ctx, view);
    const exs = this.player.exchanges;
    const w = 168;
    const gap = 8;
    const x0 = view.w / 2 - (exs.length * w + (exs.length - 1) * gap) / 2;
    const y = LAYOUT.farY - 6;
    exs.forEach((ex, i) => {
      const g = GRADES[ex.grade];
      const zone = zoneTime(ex);
      const x = x0 + i * (w + gap);
      roundRect(ctx, x, y - 14, w, 28, 14);
      ctx.fillStyle = 'rgba(12,22,44,0.7)';
      ctx.fill();
      const label = g ? `${i + 1}→${i + 2} ${g.label.replace('!', '')}${zone != null ? ` ${zone.toFixed(2)}s` : ''}` : `${i + 1}→${i + 2} —`;
      text(ctx, label, x + w / 2, y + 1, { size: 14, weight: 800, color: g?.color ?? '#fff', maxWidth: w - 14 });
    });
  }
}

/**
 * Seconds the baton took through an exchange's zone, once it's out of it.
 * None for a missed one: it left the zone in a hand that then stopped, so its
 * time would leave out the standing start that follows.
 */
export function zoneTime(ex) {
  return ex.grade !== 'missed' && ex.tIn != null && ex.tOut != null ? ex.tOut - ex.tIn : null;
}
