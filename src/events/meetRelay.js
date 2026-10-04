import { CONFIG } from '../config.js';
import { Relay4x100, TEAM_PROPS, LEG_PROPS, MODES, LIVE_TRACE } from './relay4x100.js';
import { LaneRace, nearestLanes } from './laneRace.js';
import { Exchange, exchangeSpot, takeOver, LEG } from './relayRules.js';
import { Runner } from '../athletes/runner.js';
import { AIController } from '../athletes/ai.js';
import { player as chosenPlayer, theirAthlete, heightOf } from '../athletes/roster.js';
import { LiveTrace } from '../online/liveTrace.js';
import { HEAD } from '../online/trace.js';
import { text } from '../core/ui.js';
import { rand, clamp } from '../core/math.js';
import { flow } from '../flow.js';
import { meet } from '../meet/meet.js';

const STRIDE = HEAD + TEAM_PROPS; // numbers per frame of a team's stream
const AHEAD = 0.5; // s at most a teammate's runner is carried on past their newest frame

/**
 * THE 4x100m RELAY IN A SQUAD MEET (docs/meets.md): one race, a team a squad,
 * and each runner on their own phone. The meet server says who runs which leg
 * (meet/relayLegs.js: someone runs again for anyone gone before the start)
 * and, when a runner's phone drops during the race, which teammate's phone
 * runs their leg instead, as an Amateur computer runner (`proxies`).
 *
 * Every phone runs the legs it CONTROLS (yours, and any it stands in for) and
 * sends its team's frame (relay4x100.js traceFrameProps) as a live relay
 * does; every other leg, of your team or another, is drawn from the phone that
 * controls it.
 *
 * AN EXCHANGE is decided on the phone of the runner TAKING the baton. That
 * phone runs both runners through the zone (relayRules.js: in the zone the
 * incoming runner only carries their speed, so where they are follows from
 * when they came in, how fast, and when they pressed PASS): the incoming
 * runner's phone sends PASS (`xp/<k>`, race time), and the taking phone sends
 * how the handover went (`xt/<k>` = { t, g }) for everyone. The incoming
 * runner's phone runs its own runner through the zone meanwhile and hands
 * over when it hears.
 *
 * Your thumbs only work on your own leg: the targets while you have the
 * baton, PASS coming into the zone, TAKE when it's coming to you. Waiting,
 * you watch the baton come round.
 */
export class MeetRelay extends Relay4x100 {
  constructor(ev) {
    super(ev);
    this.level = 'amateur'; // a computer runner standing in for someone runs like an Amateur rival
    this.difficulty = CONFIG.ai.amateur;
    this.exchangeAI = this.cfg.ai.amateur;
  }

  enter() {
    this.mev = meet.events[meet.index];
    this.proxies = this.mev.proxies ?? {};
    this.traces = new Map(); // uid -> LiveTrace of their team's frames
    super.enter();
  }

  // ------------------------------------------------------------------ teams

  /** A team a squad: yours in your lane, the others beside it in lane order. */
  buildField() {
    const cfg = this.cfg;
    const mine = meet.me?.squad;
    const squads = meet.lanes.filter((s) => this.mev.legs?.[s.key]);
    const lanes = nearestLanes(cfg.playerLane, cfg.lanes);
    const field = [];
    if (this.mev.legs[mine]) field.push(this.meetTeam(cfg.playerLane, meet.squads.get(mine), true));
    squads.filter((s) => s.key !== mine).forEach((s, i) => lanes[i] && field.push(this.meetTeam(lanes[i], s, false)));
    return field.sort((a, b) => a.lane - b.lane);
  }

  /** Squad `squad`'s team: its four legs, each in its runner's athlete and the squad's colour. */
  meetTeam(lane, squad, isPlayer) {
    const cfg = this.cfg;
    const uids = this.mev.legs[squad.key];
    const team = { lane, isPlayer, name: squad.name, squad: squad.key, uids, mark: null, status: 'ok', idlePhase: rand(0, Math.PI * 2), exchanges: [] };
    team.legs = uids.map((uid, k) => {
      const who = uid === meet.uid ? chosenPlayer(this.ev.id) : theirAthlete(meet.player(uid), this.ev.id);
      const runner = new Runner(this.runnerParams, undefined, k === 0 ? cfg.startX : exchangeSpot(cfg, k - 1).wait);
      const colors = { ...who.colors, shirt: squad.color, shorts: '#1b2a41' };
      const name = meet.members.get(uid)?.name ?? who.name;
      return { who: { ...who, name }, uid, colors, runner, ai: null, view: { lane, runner, colors, legIndex: k, team, idlePhase: rand(0, Math.PI * 2), mark: null } };
    });
    this.toLeg(team, 0);
    return team;
  }

  /** The phone that runs leg `k` of team `a`: its runner's, or a teammate's standing in for them. */
  controller(a, k) {
    const u = a.uids[k];
    return this.proxies[u] ?? u;
  }

  /** This phone runs leg `k` (as you, or as a computer runner for someone gone). */
  mine(a, k) {
    return this.controller(a, k) === meet.uid;
  }

  /** You run leg `k` with your thumbs. */
  human(a, k) {
    return a.uids[k] === meet.uid && !this.proxies[meet.uid];
  }

  /** A computer runner on this phone runs leg `k` (its runner's phone dropped). */
  computer(a, k) {
    return this.mine(a, k) && !this.human(a, k);
  }

  resetField() {
    for (const a of this.athletes) this.toLeg(a, 0);
    LaneRace.prototype.resetField.call(this); // leg 1 back in the blocks
    for (const a of this.athletes) {
      for (const l of a.legs) {
        l.runner.reset();
        l.ai = null;
      }
      a.exchanges = [];
      this.takeControl(a, this.game.time);
    }
    this.popup = null;
    this.whiffT = -Infinity;
  }

  /** Who runs what on this phone, now: computer runners for legs it stands in for, and the exchanges it runs. */
  takeControl(a, t) {
    a.legs.forEach((l, k) => {
      if (!this.computer(a, k)) {
        l.ai = null;
        return;
      }
      if (l.ai) return;
      const r = l.runner;
      if (r.started && !r.finished && k === a.leg) takeOver(r, t); // on the run: carries on at the pace they had
      l.ai = new AIController(r, this.difficulty);
      if (r.started) l.ai.nextTapT = t + 1 / l.ai.cadence;
    });
    a.ai = a.legs[a.leg].ai;
    a.exchanges = [0, 1, 2].map((k) => this.exchangeFor(a, k, a.exchanges[k]));
    a.ex = a.exchanges[a.leg] ?? null;
  }

  /**
   * Exchange `k` (leg k to leg k+1) as this phone runs it:
   *   'local'   both runners here (you and a stand-in, or you on every leg)
   *   'recv'    the taker here: this phone decides it
   *   'send'    the incoming runner here: the taker's phone decides it
   *   'remote'  neither: it's watched through the others' frames
   */
  exchangeFor(a, k, old) {
    const inMine = this.mine(a, k);
    const outMine = this.mine(a, k + 1);
    const kind = inMine && outMine ? 'local' : outMine ? 'recv' : inMine ? 'send' : 'remote';
    if (old && old.kind === kind) return old;
    if (old && old.stage !== 'approach' && old.stage !== 'zone' && old.stage !== 'reach') return old; // done (or missed): as it was
    if (kind === 'remote') return { k, kind, stage: old?.stage === 'reach' ? 'reach' : 'approach', reachT: old?.reachT ?? null, grade: null };
    const robot = this.computer(a, k) || this.computer(a, k + 1);
    const ex = old instanceof Exchange ? old : new Exchange(this.cfg, k, a.legs[k].runner, a.legs[k + 1].runner, robot ? this.exchangeAI : null);
    if (robot && !ex.ai) {
      ex.ai = this.exchangeAI;
      ex.plan();
    }
    ex.kind = kind;
    ex.aiPass = this.computer(a, k);
    ex.aiTake = this.computer(a, k + 1);
    ex.remoteOut = kind === 'send';
    if (old && !(old instanceof Exchange) && old.stage === 'reach' && ex.stage === 'approach') ex.passPending = (old.reachT ?? this.game.time) - this.goT;
    return ex;
  }

  // ------------------------------------------------------------------ the race

  simulate(dt, t) {
    this.pollTeams(t);
    super.simulate(dt, t);
  }

  /** The other phones' frames in, and a stand-in to run if someone's phone dropped. */
  pollTeams(t) {
    const s = this.live;
    for (const a of this.athletes) {
      for (const k of [0, 1, 2, 3]) {
        const uid = this.controller(a, k);
        if (uid === meet.uid || this.traces.has(uid)) continue;
        this.traces.set(uid, new LiveTrace(this.ev.id, TEAM_PROPS, this.stage, LIVE_TRACE.maxFrames));
      }
    }
    for (const [uid, tr] of this.traces) {
      const doc = s.docs.get(uid);
      if (doc) tr.receive(doc);
      tr.advanceTo();
    }
    if (this.mev.proxies && this.mev.proxies !== this.proxies) {
      this.proxies = this.mev.proxies;
      for (const a of this.athletes) this.takeControl(a, t);
    }
  }

  stepAthlete(a, dt, t) {
    const D = this.cfg.distance;
    // Legs run elsewhere follow their phone (unless an exchange here is moving them).
    a.legs.forEach((l, k) => {
      if (!this.mine(a, k) && !this.held(a, k)) this.follow(a, k);
    });
    // The baton carrier, if they're run here, on strides until their exchange takes over in the zone.
    const b = a.leg;
    const r = a.runner;
    if (this.mine(a, b) && (!a.ex || a.ex.stage === 'approach')) {
      if (b === 3 && D - r.x <= CONFIG.dip.promptDistance && r.mode === 'run' && !r.dipUsed) {
        r.carry();
        if (this.human(a, b)) this.carryT = t;
      }
      a.legs[b].ai?.update(t, dt, clamp((r.x - b * LEG) / LEG, 0, 1), D - r.x);
      r.update(dt, t);
    }
    // The exchanges this phone runs.
    for (const ex of a.exchanges) {
      if (ex.kind === 'remote' || (ex.stage === 'done' && ex.tOut != null)) continue; // (a done one runs on until the baton's out of the zone: its time)
      this.feed(a, ex, t + dt);
      if (ex.step(t, dt) === 'handoff') this.handOff(a, ex, t + dt);
    }
    this.watchBaton(a, t + dt);
    // Everyone this phone runs who's done their leg pulls up.
    a.legs.forEach((l, k) => {
      if (this.mine(a, k) && l.runner.finished && l.runner !== a.runner) l.runner.update(dt, t);
    });
  }

  /** True while an exchange on this phone is moving leg `k` (the incoming runner, from the zone to the handover). */
  held(a, k) {
    const ex = a.exchanges[k];
    return !!ex && ex.kind === 'recv' && (ex.stage === 'zone' || ex.stage === 'reach' || ex.stage === 'missed');
  }

  /** Leg `k`'s runner as its phone's frames have them (drawn a moment behind, smoothly). */
  follow(a, k) {
    const f = this.traces.get(this.controller(a, k))?.frame;
    if (!f) return;
    const r = a.legs[k].runner;
    const o = k * LEG_PROPS;
    const at = (i) => f.pa[i] + (f.pb[i] - f.pa[i]) * f.k;
    const pick = (i) => (f.k < 0.5 ? f.pa[i] : f.pb[i]);
    r.prevX = r.x;
    r.x = at(o);
    r.v = Math.max(0, at(o + 1));
    r.phase = at(o + 2);
    r.reach = Math.max(0, at(o + 3));
    const m = Math.round(pick(o + 4));
    r.mode = MODES[m % 3] ?? 'run';
    r.finished = m >= 3;
    if (r.v > 0) r.started = true;
  }

  /** Leg `k` as its phone last said, carried on to race time `rt` at their speed: { x, v, phase, mode, t }, or null. */
  latest(a, k, rt) {
    const tr = this.traces.get(this.controller(a, k));
    const n = tr?.frames ?? 0;
    if (!n) return null;
    const f = tr.data.f;
    const base = (n - 1) * STRIDE;
    const o = base + HEAD + k * LEG_PROPS;
    const ahead = clamp(rt - f[base], 0, AHEAD);
    return { x: f[o] + Math.max(0, f[o + 1]) * ahead, v: Math.max(0, f[o + 1]), phase: f[o + 2], mode: MODES[Math.round(f[o + 4]) % 3] ?? 'run', t: f[base] };
  }

  /**
   * The runner on the other phone, for an exchange run here: the incoming
   * runner until they reach the zone (then this phone moves them), or the
   * taker, for the incoming runner's phone. As near to now as their frames allow,
   * so the check mark and the gap are judged on where they are, not a moment ago.
   */
  feed(a, ex, t) {
    const rt = t - this.goT;
    if (ex.kind === 'recv') {
      if (ex.stage === 'approach') this.place(ex.in, this.latest(a, ex.k, rt));
      // Their PASS: their phone said when.
      const tp = ex.passPending ?? this.live.docs.get(this.controller(a, ex.k))?.xp?.[ex.k];
      if (Number.isFinite(tp) && ex.stage === 'zone') {
        ex.pass(this.goT + tp);
        ex.in.v = Math.max(0, ex.in.v - this.cfg.reachDecel * Math.max(0, t - (this.goT + tp))); // it came a moment late: the slowing they've done since
        ex.passPending = null;
      }
    } else if (ex.kind === 'send') {
      this.place(ex.out, this.latest(a, ex.k + 1, rt));
      // The taker's phone says it's done.
      const xt = this.live.docs.get(this.controller(a, ex.k + 1))?.xt?.[ex.k];
      if (xt && typeof xt === 'object' && ex.stage !== 'done') {
        ex.remoteHandoff(t, xt.g ?? 'good');
        this.handOff(a, ex, t);
      }
    }
  }

  place(r, s) {
    if (!s) return;
    r.prevX = r.x;
    r.x = s.x;
    r.v = s.v;
    r.phase = s.phase;
    if (s.v > 0) r.started = true;
  }

  /**
   * Exchanges run on other phones: the baton moves on when the taker's phone
   * says so (or any of the team's frames have it further on), and the
   * incoming runner reaches it out when their frames do.
   */
  watchBaton(a, t) {
    const ex = a.exchanges[a.leg];
    if (!ex || ex.kind !== 'remote') return;
    const k = ex.k;
    const xt = this.live.docs.get(this.controller(a, k + 1))?.xt?.[k];
    let on = xt && typeof xt === 'object';
    if (!on) {
      for (const j of [k, k + 1]) {
        const f = this.traces.get(this.controller(a, j))?.frame;
        if (f && Math.round(f.pb[4 * LEG_PROPS]) > k) on = true;
      }
    }
    if (on) {
      ex.stage = 'done';
      ex.grade = xt?.g ?? ex.grade ?? 'good';
      this.handOff(a, ex, t);
      return;
    }
    const f = this.traces.get(this.controller(a, k))?.frame;
    const out = f ? f.pb[4 * LEG_PROPS + 1 + k] > 0.5 : false;
    if (out && ex.stage !== 'reach') Object.assign(ex, { stage: 'reach', reachT: this.game.time });
  }

  /** The baton changed hands in exchange `ex` at `t`: the next leg has it; if this phone decided it, it says so. */
  handOff(a, ex, t) {
    this.toLeg(a, ex.k + 1);
    if (ex.kind === 'recv' || ex.kind === 'local') this.live.send({ [`xt/${ex.k}`]: { t: Math.round((t - this.goT) * 1000) / 1000, g: ex.grade ?? 'good' } }, true);
    const l = a.legs[a.leg];
    if (l.ai) l.ai.nextTapT = t + 1 / l.ai.cadence;
    if (!a.isPlayer) return;
    this.popup = { ex, t0: t };
    if (this.human(a, a.leg)) {
      // Your thumbs are on your runner now: a fresh green target right away.
      this.judge.runner = a.runner;
      this.judge.start(t);
      this.spawnT = t;
      this.missSide = null;
      navigator.vibrate?.(ex.grade === 'perfect' ? [20, 40, 20] : 30);
    }
  }

  /** The team's time: the anchor over the line here, or the anchor's phone says. */
  crossing(a, t, dt) {
    if (a.leg === 3 && this.mine(a, 3)) return a.runner.crossing(this.cfg.distance, t, dt);
    const res = this.live.docs.get(this.controller(a, 3))?.res?.[this.stage];
    return res && Number.isFinite(res.mark) ? this.goT + res.mark : null;
  }

  /** No late hits after the relay: the meet's final standings come up over it. */
  lateHits() {}

  /** The results, as they stand (the server has every team's time for the standings). */
  finish() {
    const results = this.athletes.map((a) => ({
      name: a.name,
      lane: this.track.laneNumber(a.lane),
      colors: a.legs[3].colors,
      isPlayer: a.isPlayer,
      key: a.squad,
      mark: a.mark,
      status: a.mark != null ? 'ok' : 'dnf',
    }));
    results.sort((x, y) => (x.mark ?? 1e6) - (y.mark ?? 1e6));
    flow.results(this.game, this.ev, results, { ...this.raceStats(), live: true });
  }

  // ------------------------------------------------------------------ your thumbs

  /** Your part in an exchange now: PASS coming in, TAKE as it comes to you. { ex, kind } or null. */
  get myButton() {
    const a = this.player;
    if (this.state !== 'race' || !a) return null;
    const ex = a.exchanges[a.leg];
    if (!ex || ex.kind === 'remote') return null;
    if (ex.stage === 'zone' && this.human(a, ex.k)) return { ex, kind: 'PASS' };
    if (ex.stage === 'reach' && ex.kind !== 'send' && this.human(a, ex.k + 1)) return { ex, kind: 'TAKE' };
    return null;
  }

  get batonUp() {
    return !!this.myButton;
  }

  mapInput(e) {
    const a = this.player;
    if (!this.batonUp && !(a && this.human(a, a.leg))) return null; // not your leg: watching
    return super.mapInput(e);
  }

  /** PASS, then TAKE, on your side of the exchange. */
  batonAction(action, t) {
    const b = this.myButton;
    if (!b || (action !== 'BATON' && action !== 'DIP')) return 'exchange';
    const ex = b.ex;
    if (b.kind === 'PASS') {
      if (!ex.pass(t)) return 'exchange';
      if (ex.kind === 'send') this.live.send({ [`xp/${ex.k}`]: Math.round((t - this.goT) * 1000) / 1000 }, true);
      return 'pass';
    }
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

  drawControls(ctx) {
    const a = this.player;
    if (this.batonUp) return super.drawControls(ctx);
    if (!this.human(a, a.leg)) return; // not your leg
    if (a.ex && a.ex.stage !== 'approach') return; // passed: it's your teammate's to take
    super.drawControls(ctx);
  }

  /** A handover decided on another phone has no zone time here: its banner just shows a moment. */
  drawBanner(ctx, view) {
    const p = this.popup;
    if (p && (p.ex.kind === 'remote' || p.ex.tIn == null) && this.game.time > p.t0 + this.cfg.banner) this.popup = null;
    super.drawBanner(ctx, view);
  }

  // ------------------------------------------------------------------ drawing

  /** The baton carriers by name, in their squad's colour, and you on your mark. */
  drawAthlete(ctx, view, v, H) {
    super.drawAthlete(ctx, view, v, H);
    const team = v.team;
    if (!team) return;
    const k = v.legIndex;
    const carrier = team.leg === k;
    const you = team.uids[k] === meet.uid && !carrier && !v.runner.finished;
    if (!carrier && !you) return;
    const r = v.runner;
    const p = this.track.toScreen(this.camera, view, r.x + r.reach * 0.5 + this.startNudge(v), v.lane);
    if (p.x < -80 || p.x > view.w + 80) return;
    const h = H * this.track.figureScale(v.lane) * heightOf(v.colors);
    const label = you ? `YOU · LEG ${k + 1}` : team.legs[k].who.name;
    text(ctx, label, p.x, p.y - h - 8, { size: 14, color: you ? '#ffd35c' : '#fff', shadow: true });
  }

  /** Whose leg it is, and yours. */
  drawHUD(ctx, view) {
    super.drawHUD(ctx, view);
    const a = this.player;
    if (!a || this.state !== 'race' || this.human(a, a.leg)) return;
    const mine = a.uids.map((u, k) => (u === meet.uid ? k : -1)).filter((k) => k > a.leg);
    if (!mine.length) return;
    const next = mine[0];
    const msg = next === a.leg + 1 ? 'The baton’s coming to you: TAKE it when the ring meets the button' : `You run leg ${next + 1}`;
    text(ctx, msg, view.w / 2, view.h - 40 - view.safe.b, { size: 18, color: '#ffd35c', shadow: true, maxWidth: view.w - 40 });
  }
}
