import { CONFIG } from '../config.js';
import { aiLevel } from '../survival/survival.js';
import { Camera } from '../core/camera.js';
import { clamp, damp, rand, shuffle } from '../core/math.js';
import { text, roundRect } from '../core/ui.js';
import { player as chosenPlayer, rivals as rivalRoster, heightOf } from '../athletes/roster.js';
import { drawFigure, drawHand, armIK, shoulderPos, lerpPose, sampleTrack, handPos, vaultSwingPose, wrapNear, smoothKeys, VAULT_POSES, POSES } from '../athletes/stickFigure.js';
import { RunUp } from './runUp.js';
import { Thumbs } from '../core/thumbs.js';
import { runUpSpeed, runUpPose } from './runUpRules.js';
import { liveRandom } from '../core/random.js';
import { pressQuality, releaseQuality, releaseTarget, vaultHeight, rivalVault } from './poleVaultRules.js';
import { VaultRenderer } from '../render/vaultArena.js';
import { getDifficulty, hasRivals } from '../core/storage.js';
import { venueFor } from '../render/venues.js';
import { flow } from '../flow.js';
import { Venue, FIELD_DEPTH } from '../brawl/venue.js';
import { startFieldLateHits, fieldLateStep, fieldLateRender } from '../brawl/fieldLateHits.js';
import { FieldGhost } from '../online/fieldGhost.js';
import { LiveField } from '../online/liveField.js';

const LEFT_KEYS = ['ArrowLeft', 'KeyA', 'KeyZ', 'KeyF'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD', 'KeyX', 'KeyJ'];
const BOTH_KEYS = ['Space', 'ArrowUp'];
const ease = (k) => k * k * (3 - 2 * k);
/** The same pose seen in the mirror (for the turn at the top of the pole). */
const mirror = (p) => ({
  ...p,
  flip: !p.flip,
  hipX: -p.hipX,
  lean: -p.lean,
  legs: p.legs.map((l) => ({ ...l, thigh: -l.thigh, shin: -l.shin, toe: -(l.toe ?? 0) })),
  arms: p.arms.map((a) => ({ upper: -a.upper, fore: -a.fore })),
});
const G = 9.81;
const PLANT_BLEND = 0.16; // s: the run's pose and hips blend into the swing's at the plant
const POLE_SPRING = 0.22; // s: a pole still bent when you let go springs straight over this
const FAR_ARM_RATE = 28; // 1/s: how quickly the bottom hand's arm follows its target (no snaps)
const FAR_ARM_MAX = 12; // rad/s: and never faster than this (letting go of the pole)
const PUSH_BLEND = 0.1; // s: the push off the top of the pole picks up speed over this
const FIG_H = CONFIG.figure.height;
// Ghost frames keep the pole (registry traceProps = 9): shown (1/0), then its
// end, hands, bend and tip, each x, y in m from where the figure is drawn.
// The swing, keyed from a phase diagram of a real vault (takeoff, swing,
// rock back, L, extension, inversion), per swing progress u:
//   phi   pole chord angle above level, as a share of the way from the plant
//         angle to upright (every vault ends with the pole upright)
//   bend  how much the pole is bent (share of swing.bend)
//   alpha where the hips are relative to the hands (0 = hanging straight
//         below, PI/2 = level toward the pit, PI = upside down above)
const SWING_KEYS = [
  // u     phi    bend   alpha
  [0, 0, 0, -0.3], // takeoff: hips behind the hands, trail leg pushing off
  [0.22, 0.12, 0.75, 0.05], // swing: hanging under the bending pole
  [0.45, 0.35, 1, 0.8], // rock back: lying back, feet coming up to the pole
  [0.65, 0.6, 0.65, 1.9], // L: hips up level with the hands
  [0.83, 0.85, 0.25, 2.8], // extension up the pole as it straightens
  [1, 1, 0, Math.PI], // inverted over the top of the pole
];
const SWING_U = SWING_KEYS.map((k) => k[0]);
const SWING_COLS = [1, 2, 3].map((c) => SWING_KEYS.map((k) => k[c]));
/** Column `col` of SWING_KEYS at swing progress u, on one smooth curve through the keys (no stop at each). */
function swingKey(u, col) {
  return smoothKeys(SWING_U, SWING_COLS[col - 1], clamp(u, 0, 1));
}

/**
 * Pole vault, from footage of the original (rules in poleVaultRules.js):
 * - Three attempts; your best height counts against five rivals' best.
 * - Run-up: the 100m's green targets, carrying the pole.
 * - Plant zone: the pads turn orange and blink, strides stop, the pole comes
 *   down and a spark runs from your hands to its tip, reaching it as the tip
 *   plants in the box.
 * - Press and HOLD both at the plant. The spark climbs back up the pole
 *   (from the plant, or from your press if that came later); let go as it
 *   reaches your hands at the end of the pole. You hold the very end of the
 *   pole the whole way. The swing is timed to the spark: as it reaches your
 *   hands you're at the top, upside down and straight with the pole upright,
 *   on every vault: the same swing, quicker the faster you planted (as in
 *   the original). How high you leap off the top is what differs. Thumbs
 *   already down when the plant window
 *   opens (one pressed since the pads lit, the other maybe still down from
 *   the last stride) plant then: an early hold registers, scored by
 *   `press.earlyHoldOnTime` (core/thumbs.js). You swing up the bending pole, push off the
 *   top, arch over the bar and drop onto the mat. The camera rises with you,
 *   and so does the bar (as in the original): it waits at `bar.rest`, rides
 *   up with your hips and stops at the height you clear. Every attempt starts
 *   it from rest again.
 * - No press at all: you run through. No height.
 *
 * States: 'ready' → 'run' → 'vault' (on the pole) → 'fly' → 'landed' → 'mark';
 * or 'run' → 'balk' (no press) → 'mark'. Then the next attempt, or results.
 */
export class PoleVault {
  constructor(ev) {
    this.ev = ev;
    this.cfg = CONFIG.poleVault;
    this.level = getDifficulty();
    this.lv = { ...aiLevel(CONFIG.ai, this.level), ...aiLevel(this.cfg.ai, this.level) }; // survival: blended to the rival's skill
    this.wantsReleases = true; // hold-and-release controls
    this.thumbs = new Thumbs(); // which thumbs are down, strides included
  }

  enter() {
    const cfg = this.cfg;
    // A shorter athlete (Joey) is smaller all over and plants with the hands lower.
    this.tall = heightOf(chosenPlayer(this.ev.id).colors);
    this.figH = FIG_H * this.tall;
    this.measurePole();
    this.track = new VaultRenderer(cfg, venueFor(this.live));
    this.camera = new Camera();
    const me = chosenPlayer(this.ev.id);
    this.player = { name: this.live ? this.live.name : me.name, colors: me.colors, isPlayer: true, jumps: [] }; // live: your username, as the others see you
    this.rivals = shuffle(rivalRoster(this.ev.id))
      .slice(0, 5)
      .map((r) => ({ name: r.name, colors: r.colors, isPlayer: false, jumps: [], cadence: rand(...this.lv.cadence) }));
    this.exitBtn = { x: 0, y: 0, w: 44, h: 40 };
    this.stats = { hits: 0, misses: 0, topSpeed: 0 };
    this.runUp = new RunUp(this.stats); // the 100m's targets and running (runUp.js)
    this.round = 0;
    this.liveField = this.live ? new LiveField(this) : null;
    if (this.liveField) this.rivals = this.liveField.people; // live: just the other players, so every phone has the same results
    else if (!hasRivals()) this.rivals = []; // Training: just you (and your ghost)
    this.ghost = new FieldGhost(this.ev, this.liveField);
    this.onResize(this.game.view);
    this.startRound();
  }

  /** The pole's geometry, from config (again every attempt, so tuning applies from the next one). */
  measurePole() {
    const P = this.cfg.pole;
    this.L = P.length;
    const gripY = Math.min(P.gripY * this.tall, 0.95 * P.length);
    this.plantX = -Math.sqrt(P.length ** 2 - gripY ** 2);
    this.phi0 = Math.asin(gripY / P.length);
  }

  exit() {
    if (this.handedOver) return; // still running under the results (leave())
    this.liveField?.close();
    this.after?.exit();
    this.game.input.wantReleases = false;
  }

  /** The results screen is done with the vault underneath it. */
  leave() {
    this.handedOver = false;
    this.exit();
  }

  onResize(view) {
    this.runUp.layout(view);
    this.exitBtn.x = 10 + view.safe.l;
    this.exitBtn.y = 8 + view.safe.t;
  }

  get now() {
    return this.game.time;
  }

  startRound() {
    this.round++;
    this.measurePole();
    const t = this.now;
    this.runner = this.runUp.begin(-this.cfg.runway, t, liveRandom(this.live, this.live?.stage(this.ev.id, this.round), 'targets')); // live: this round's run-up targets are the same for everyone
    this.thumbs.reset();
    this.holdT = null; // both thumbs down (the plant press)
    this.releaseT = null;
    this.plantT = null;
    this.vault = null; // { v, u, pq, rq, height, sw }
    this.fly = null; // { t0, x0, y0, vx, vy, T }
    this.mark = null; // { mark } or { fail: true }
    this.failWhy = null; // why there's no height, for the card
    this.hip = { x: this.runner.x, y: 0.5 * (this.figH ?? FIG_H) };
    this.barTop = 0; // the highest your hips have been on this attempt (the bar rises with them)
    this.track.bar = this.cfg.bar.rest;
    this.camY = (this.game.view.h * (this.cfg.camera.drop ?? 0)) / this.cfg.camera.zoom; // at rest: the runway low
    this.zoom = this.cfg.camera.zoom;
    this.puff = [];
    this.kickLeft = 0; // m of the plant jolt still to apply
    this.plantFrom = null; // where the run left you at the plant, blended into the swing
    this.farArm = null; // the bottom hand's arm last frame (smoothed)
    this.ghost.startAttempt(t);
    this.liveField?.begin();
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
    if (this.liveField?.update(dt, t)) return; // live: waiting for a round, or for the others
    if (this.after) return fieldLateStep(this, dt, t); // after your last vault
    const end = t + dt;
    for (const e of this.game.input.consume(end)) {
      if (e.type === 'down' && this.hitExit(e)) return flow.menu(this.game);
      if (e.type === 'key' && e.code === 'Escape') return flow.menu(this.game);
      this.thumbs.track(e, (x) => this.side(x)); // every press and lift, strides too
      if (this.state === 'mark') {
        if (end - this.stateT > 0.4 && (e.type === 'down' || (e.type === 'key' && (e.code === 'Enter' || e.code === 'Space')))) return this.next();
        continue;
      }
      const side = this.side(e);
      if (side == null) continue;
      if (e.type === 'down' || e.type === 'key') this.press(side, e);
      else this.lift(side, e);
    }
    this.holdGates();
    this.simulate(dt, t);
    this.runUp.update(end);
  }

  press(side, e) {
    const t = e.t;
    if ((this.state === 'ready' || this.state === 'run') && this.runUp.striding) {
      this.stride(side, t);
      return;
    }
    if (this.holdT != null || !(this.state === 'run' || this.state === 'vault')) return;
    // Both thumbs down (one pressed since the pads lit): the plant press, if it's close enough to the plant.
    if (this.thumbs.both(this.runUp.armT) != null && this.canPlant(t)) this.holdT = t;
  }

  /** You let go when both thumbs are up: one thumb slipping (or still coming up from a stride) isn't a release. */
  lift(side, e) {
    if (this.holdT != null && this.releaseT == null && !this.thumbs.anyDown) this.release(e.t);
  }

  /**
   * A hold, checked every step: thumbs down from before the plant window
   * (pressed too early) plant when it opens instead of being lost. Scored as
   * pressed then (`press.miss` early: plant quality 0), or with
   * `press.earlyHoldOnTime` as pressed right on the plant.
   */
  holdGates() {
    if (this.holdT != null || !((this.state === 'run' && !this.runUp.striding) || this.state === 'vault')) return;
    const t2 = this.thumbs.both(this.runUp.armT);
    if (t2 == null) return;
    const t = this.now;
    if (!this.cfg.press.earlyHoldOnTime) {
      if (this.canPlant(t)) this.holdT = Math.max(t2, t);
    } else if (this.state === 'vault' && this.canPlant(t)) this.holdT = Math.max(t2, this.plantT);
  }

  /** A press counts from `press.miss` before the plant (predicted from your speed) until that long after it. */
  canPlant(t) {
    const m = this.cfg.press.miss;
    if (this.plantT != null) return t - this.plantT <= m;
    const r = this.runner;
    return r.v > 0.5 && (this.plantX - r.x) / r.v <= m;
  }

  stride(side, t) {
    if (this.runUp.stride(side, t) === 'hit' && this.state === 'ready') this.setState('run');
  }

  release(t) {
    this.releaseT = t;
    if (this.vault) this.decide();
  }

  /** Both press and release known (or given up on): work out the height. */
  decide() {
    const vt = this.vault;
    if (vt.height != null) return;
    const cfg = this.cfg;
    vt.pq = pressQuality(this.holdT - this.plantT, cfg.press);
    vt.rq = this.releaseT == null ? 0 : releaseQuality(this.releaseT - this.climbStart(), cfg, vt.v);
    vt.height = vaultHeight({ v: vt.v, pq: vt.pq, rq: vt.rq }, cfg);
  }

  /**
   * When the spark starts back up the pole: at the plant, or at your press if
   * that came later (pressed early, it still runs all the way down to the box
   * first). The release is timed from here, exactly as the spark is drawn.
   */
  climbStart() {
    if (this.holdT == null || this.plantT == null) return null;
    return Math.max(this.holdT, this.plantT);
  }

  /** How high a vault of `height` is drawn (flight.heightScale: everything in the air looks bigger than the mark). */
  shown(height) {
    return height * (this.cfg.flight.heightScale ?? 1);
  }

  // ---------------------------------------------------------------- simulation

  /**
   * On the pole at swing progress u (0 plant .. 1 top): the pole rotates up
   * about the box to upright while it bends and straightens again, all the way,
   * on every vault (as in the original: a slow vault is the same swing, just
   * slower); the figure hangs from the end of the pole by its hands, swinging
   * from below them to upside down and straight above them.
   */
  swingAt(u) {
    const vt = this.vault;
    const phi = this.phi0 + (Math.PI / 2 - this.phi0) * swingKey(u, 1);
    const c = this.L * (1 - this.cfg.swing.bend * swingKey(u, 2));
    const hands = { x: -c * Math.cos(phi), y: c * Math.sin(phi) };
    const alpha = swingKey(u, 3);
    const pose = vaultSwingPose(alpha, u);
    const off = handPos(0, 0, this.figH, pose, 0); // top hand relative to the hips (m, y down)
    return { phi, c, hands, alpha, pose, hip: { x: hands.x - off.x, y: hands.y + off.y } };
  }

  simulate(dt, t) {
    const cfg = this.cfg;
    const r = this.runner;
    const end = t + dt;
    if (this.state === 'ready' || this.state === 'run') {
      r.update(dt, t);
      this.hip = { x: r.x, y: 0.5 * this.figH };
      // Plant zone: strides stop, the pads turn orange, the pole comes down.
      if (this.state === 'run' && this.runUp.striding && this.plantX - r.x <= cfg.zoneDistance) this.runUp.enterZone(t, end);
      if (this.state === 'run' && r.x >= this.plantX) this.plant(end);
    } else if (this.state === 'vault') {
      const vt = this.vault;
      if (this.holdT == null && end - this.plantT > cfg.press.miss) return this.balk(end);
      const c0 = this.climbStart();
      // Held on too long: you stall on top of the pole and topple back (release.heldFoul, as in
      // the original), or are let go with nothing from the release.
      const swingT = releaseTarget(cfg, vt.v); // quicker the faster you planted
      if (c0 != null && this.releaseT == null && end - c0 > swingT + cfg.release.window) {
        if (cfg.release.heldFoul) return this.stall(end);
        this.release(end);
      }
      // The swing reaches the top (upside down, straight, pole upright) exactly
      // as the spark reaches your hands. Before you press, that's a climb from
      // now, so the swing only creeps.
      const tTop = (c0 ?? end) + swingT;
      vt.u = tTop <= end ? 1 : vt.u + (1 - vt.u) * Math.min(1, dt / (tTop - t));
      const sw = this.swingAt(vt.u);
      vt.sw = sw;
      this.hip = sw.hip;
      // The first moment on the pole blends in from where the run left you (no pop at the plant).
      const k = this.plantBlend(end);
      if (k < 1) this.hip = { x: this.plantFrom.hip.x + (sw.hip.x - this.plantFrom.hip.x) * k, y: this.plantFrom.hip.y + (sw.hip.y - this.plantFrom.hip.y) * k };
      // At the top you stay there, upside down, until you let go (or are made to).
      // Let go and you come off the pole there and then, so an early release shows. Not before
      // `flight.leaveFrom` of the swing, though: even letting go at once, the original rides the
      // pole about half way before you come off it.
      if (vt.height != null && vt.u >= Math.min(1, this.cfg.flight.leaveFrom ?? 1)) this.takeOff(end);
    } else if (this.state === 'fly') {
      const f = this.fly;
      const ta = this.flyClock(end);
      this.hip = this.flyAt(Math.min(ta, f.T));
      this.peak = Math.max(this.peak, this.hip.y);
      if (ta >= f.T) this.land(end);
    } else if (this.state === 'balk') {
      // Came off the pole: drop back to the runway.
      const b = this.balkFall;
      const ta = end - b.t0;
      this.hip = { x: b.x + b.vx * Math.min(ta, b.T), y: Math.max(0.5 * this.figH, b.y + b.vy * ta - 0.5 * G * ta * ta) };
      // A stall comes down from the top of the pole: on your back, then up again first.
      if (ta > (b.stall ? b.fallT + (this.cfg.standUp ?? 1.9) + 0.2 : 1.6)) this.showMark();
    } else if (this.state === 'landed') {
      if (t - this.stateT > cfg.markHold) this.showMark();
    }
    for (const p of this.puff) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= 3 * dt;
      p.life -= dt;
    }
    this.puff = this.puff.filter((p) => p.life > 0);
    if (this.state === 'vault' || this.state === 'fly') this.barTop = Math.max(this.barTop, this.hip.y);
    this.track.bar = damp(this.track.bar, this.barHeight(), cfg.bar.follow, dt);
    this.followCamera(dt);
  }

  /**
   * Where the crossbar is headed: at rest until your hips pass it, then with
   * them, but never above the height you're clearing (once it's known), so it
   * stops right where you go over.
   */
  barHeight() {
    const top = Math.max(this.cfg.bar.rest, this.barTop);
    const h = this.vault?.height;
    return h == null ? top : Math.min(this.shown(h), top);
  }

  /** 0 at the plant .. 1 once the swing has fully taken over from the run (PLANT_BLEND s). */
  plantBlend(t) {
    if (!this.plantFrom) return 1;
    return ease(clamp((t - this.plantT) / PLANT_BLEND, 0, 1));
  }

  plant(t) {
    const r = this.runner;
    this.plantT = t;
    this.stats.topSpeed = Math.max(this.stats.topSpeed, r.v);
    this.vault = { v: r.v, u: 0, pq: null, rq: null, height: null };
    // Pressed early and already let go? Then that's your release.
    if (this.holdT != null && this.releaseT != null) this.decide();
    this.kickLeft = this.cfg.camera.plantKick ?? 0; // the jolt as the pole bites (followCamera)
    this.plantFrom = { hip: { ...this.hip }, pose: this.lastPose ?? null };
    navigator.vibrate?.(20);
    this.setState('vault');
  }

  /**
   * Off the top of the pole, under gravity (`flight.gravity`): you push off and
   * fly forward to the bar (`uprightX`), peaking over it at your height, then
   * fall onto the mat at `landX`. A higher vault falls further, so it hangs
   * and drops for longer.
   */
  takeOff(t) {
    const vt = this.vault;
    const g = this.cfg.flight.gravity;
    const h0 = this.hip;
    // You're at the same top of the pole on every vault; the leap off it is what differs (as in
    // the original): up to your mark, or at least a `push` hop. Let go far too late (release
    // quality under `flight.dropBelow`) and you just drop off the top onto the front of the mat,
    // as the original's 1 m vaults do. The bar still stops at your mark.
    const weak = vt.rq < (this.cfg.flight.dropBelow ?? 0);
    const shownH = this.shown(vt.height); // where you cross the bar
    const hop = this.cfg.flight.push * clamp(shownH / h0.y, 0.3, 1); // a low mark barely leaves the pole
    const peak = weak ? h0.y + 0.08 : Math.max(shownH, h0.y + hop);
    const xBar = weak ? h0.x + 0.15 : this.cfg.uprightX;
    const landX = weak ? this.cfg.mat.from + 1.1 : this.cfg.landX;
    const yLand = this.cfg.mat.height + 0.2;
    const rise = Math.sqrt((2 * (peak - h0.y)) / g); // s up to the peak
    const fall = Math.sqrt((2 * Math.max(0, peak - yLand)) / g); // s from the peak to the mat
    this.fly = {
      // tBar: when you cross the bar, at your mark: at the peak on a high vault, on the way down
      // after a hop off the top on a low one (as in the original; you never pass over it high).
      tBar: weak ? rise : Math.min(rise + Math.sqrt((2 * Math.max(0, peak - shownH)) / g), 0.9 * (rise + fall)),
      t0: t, x0: h0.x, y0: h0.y, xBar, landX, weak, peak, yLand, rise, fall, T: rise + fall, poleT: t, phiEnd: vt.sw.phi, cEnd: vt.sw.c,
      topPose: mirror(this.state === 'vault' && this.lastPose ? this.lastPose : vt.sw.pose), // as drawn (the hands as they held the pole)
    };
    this.peak = h0.y;
    this.setState('fly');
  }

  /** The pose keys off the top of the pole, each turned to lie nearest the one before (no limb spins the long way round). */
  flyTrack() {
    const f = this.fly;
    if (f.track) return f.track;
    const V = VAULT_POSES;
    const keys = f.weak
      ? [[0, f.topPose], [f.T * 0.3, V.turn], [f.T * 0.65, V.drop], [f.T, V.landBack]] // dropping off the top
      : this.overBarKeys(f.topPose, Math.min(f.tBar, f.T - 0.4), f.T); // face down over the bar as you cross it, time left to land
    for (let i = 1; i < keys.length; i++) keys[i] = [keys[i][0], wrapNear(keys[i][1], keys[i - 1][1])];
    f.track = keys;
    return keys;
  }

  /**
   * Flight time at `t`: the push off the pole picks up speed over PUSH_BLEND s
   * (the clock starts slow), so you don't go from still to full speed at once.
   */
  flyClock(t) {
    const ta = t - this.fly.t0;
    return ta < PUSH_BLEND ? (ta * ta) / (2 * PUSH_BLEND) : ta - PUSH_BLEND / 2;
  }

  /** Pose keys off the pole: turn, face down over the bar at `tOver`, then hang, drop and land on your back at T. */
  overBarKeys(top, tOver, T) {
    const V = VAULT_POSES;
    const after = T - tOver;
    return [[0, top], [tOver * 0.7, V.turn], [tOver, V.overBar], [tOver + after * 0.35, V.hang], [tOver + after * 0.7, V.drop], [T, V.landBack]];
  }

  /** Hips during the flight, `ta` s after leaving the pole. */
  flyAt(ta) {
    const f = this.fly;
    const g = this.cfg.flight.gravity;
    const t = clamp(ta, 0, f.T);
    // Forward off the pole to the bar by the peak (the push), then on to where you land: one smooth
    // curve (no change of pace at the peak), slowing a little as you come down onto the mat.
    const after = f.T - f.tBar;
    const s1 = (f.xBar - f.x0) / Math.max(1e-6, f.tBar);
    const s2 = (f.landX - f.xBar) / Math.max(1e-6, after);
    const sp = f.tBar > 1e-6 && after > 1e-6 ? (2 * s1 * s2) / Math.max(1e-6, s1 + s2) : s1 || s2; // pace over the bar
    const x = t < f.tBar ? hermite(f.x0, f.xBar, s1, sp, t, f.tBar) : hermite(f.xBar, f.landX, sp, 0.6 * s2, t - f.tBar, after);
    const d = t - f.rise; // s after the peak (negative on the way up)
    return { x, y: f.peak - 0.5 * g * d * d };
  }

  land(t) {
    const vt = this.vault;
    this.mark = { mark: vt.height };
    this.fly.landT = t;
    this.track.lastHeight = this.shown(vt.height); // where the bar stopped
    for (let i = 0; i < 14; i++) {
      this.puff.push({ x: this.hip.x + rand(-0.6, 0.6), y: this.cfg.mat.height, vx: rand(-0.6, 0.6), vy: rand(0.3, 1.2), life: rand(0.3, 0.6), r: rand(3, 7) });
    }
    navigator.vibrate?.(30);
    this.setState('landed');
  }

  /** No press by the time it counted: you come off the pole. No height. */
  balk(t) {
    const sw = this.vault.sw ?? this.swingAt(this.vault.u);
    this.balkFall = { t0: t, x: this.hip.x, y: this.hip.y, vx: 0.8, vy: 0.5, T: 0.6, poleT: t, phiEnd: sw.phi, cEnd: sw.c };
    this.mark = { fail: true };
    navigator.vibrate?.(60);
    this.setState('balk');
  }

  /**
   * Held on past the release: you stall upside down on top of the pole and it
   * topples back toward the runway with you (as in the original). No height.
   */
  stall(t) {
    const sw = this.vault.sw ?? this.swingAt(this.vault.u);
    this.releaseT = t;
    const fallT = Math.sqrt((2 * Math.max(0, this.hip.y - 0.5 * this.figH)) / G); // s to the runway
    this.balkFall = { t0: t, x: this.hip.x, y: this.hip.y, vx: -1.4, vy: 0, T: 1.1, poleT: t, phiEnd: sw.phi, cEnd: sw.c, stall: true, fallT, topPose: mirror(sw.pose) };
    this.mark = { fail: true };
    this.failWhy = 'held on too long';
    navigator.vibrate?.(60);
    this.setState('balk');
  }

  followCamera(dt) {
    const view = this.game.view;
    const r = this.runner;
    // The plant jolt: back over a few frames (about two of the original's), then the follow eases it out.
    if (this.kickLeft > 0) {
      const d = Math.min(this.kickLeft, ((this.cfg.camera.plantKick ?? 0) * dt) / 0.05);
      this.camera.x -= d;
      this.kickLeft -= d;
    }
    // Ahead of you, as in the original: you're in the left third running, further left through
    // the zone as the box comes into view, then back toward the middle off the pole.
    const C = this.cfg.camera;
    const zoneLead = (C.lead ?? 0) + (C.zoneLead ?? 0);
    let lead = C.flyLead ?? 0;
    if (this.state === 'ready' || this.state === 'run') lead = (C.lead ?? 0) + (C.zoneLead ?? 0) * this.zoneProgress();
    else if (this.state === 'vault') lead = zoneLead + (lead - zoneLead) * ease(clamp(this.vault.u, 0, 1));
    let cx = (this.state === 'ready' || this.state === 'run' ? r.x : this.hip.x) + lead;
    if ((this.state === 'landed' || this.state === 'mark') && this.fly) cx = this.fly.landX - 1.5;
    this.camera.follow(cx, this.state === 'run' ? r.v : 0, dt);
    // Rise with the vaulter: keep the head at least topFrac down the screen. At rest the world
    // sits camera.drop of the screen lower (the runway low, as in the original).
    const ground = this.track.toScreen(this.camera, view, this.hip.x, 1).y + 4;
    const headY = ground - (this.hip.y + 0.5 * this.figH) * this.camera.ppm;
    const z = this.zoom;
    let want = Math.max((view.h * (this.cfg.camera.drop ?? 0)) / z, (view.h * this.cfg.camera.topFrac) / z - headY);
    // Running: keep the tip of the carried pole on screen too.
    if ((this.state === 'ready' || this.state === 'run') && this.poleTop != null) want = Math.max(want, (view.safe.t + 12) / z - this.poleTop);
    this.camY = damp(this.camY, want, 6, dt);
  }

  showMark() {
    this.player.jumps.push(this.mark);
    this.ghost.endAttempt(this.mark);
    this.liveField?.result(this.mark);
    for (const rv of this.rivals) {
      if (rv.live) continue; // another player: their marks come from their phone
      const level = { ...this.lv, cadence: [rv.cadence, rv.cadence] };
      rv.jumps.push(rivalVault(level, this.cfg, () => this.rivalRunUp(rv)));
    }
    this.setState('mark');
    // Your last vault: on your feet (on the mat, facing back the way you came), the late hits start
    // (brawl/fieldLateHits.js). Live, straight away (the rounds run on the room's clock); offline,
    // after this vault's card, like the others, so you can see your plant and release (next()).
    if (this.round >= this.cfg.rounds && this.liveField) this.startLateHits();
  }

  /** A rival's speed at the plant (same physics as yours). */
  rivalRunUp(rv) {
    return runUpSpeed({ from: -this.cfg.runway, line: this.plantX, end: this.plantX, zoneDistance: this.cfg.zoneDistance, level: this.lv, cadence: rv.cadence });
  }


  next() {
    if (this.liveField) return this.liveField.next();
    if (this.round < this.cfg.rounds) this.startRound();
    else this.startLateHits(); // the results follow (fieldLateStep)
  }

  startLateHits() {
    startFieldLateHits(this, this.hip.x, this.poseFor(), this.fly ? -1 : 1);
  }

  /** The line under your mark: your plant, release and speed (or why there's no height). */
  markDetail() {
    const vt = this.vault;
    if (this.mark?.fail || !vt) return this.failWhy ?? 'no press at the plant';
    return `plant ${Math.round(vt.pq * 100)}% · release ${Math.round(vt.rq * 100)}% · ${(vt.v * 3.6).toFixed(0)} km/h`;
  }

  best(a) {
    const ok = a.jumps.filter((j) => !j.fail).map((j) => j.mark);
    return ok.length ? Math.max(...ok) : null;
  }

  finish() {
    const all = [this.player, ...this.rivals];
    const results = all.map((a) => {
      const b = this.best(a);
      return { name: a.name, key: a.uid, colors: a.colors, isPlayer: a.isPlayer, mark: b, status: b == null ? 'nm' : 'ok' };
    });
    results.sort((a, b) => (b.mark ?? -1) - (a.mark ?? -1));
    const fails = this.player.jumps.filter((j) => j.fail).length;
    flow.results(this.game, this.ev, results, {
      hits: this.stats.hits,
      misses: this.stats.misses,
      topSpeed: this.stats.topSpeed,
      extra: `${fails} ${fails === 1 ? 'miss' : 'misses'}`,
      paceText: `vaults ${this.player.jumps.map((j) => (j.fail ? 'X' : j.mark.toFixed(2))).join(' / ')}`,
      run: this.ghost.best(), // your best vault, frame by frame, for the ghost
      live: !!this.live,
    });
  }

  // ---------------------------------------------------------------- late hits

  /** Round the landing mat, and up on it (brawl/venue.js). */
  lateVenue() {
    const tr = this.track;
    const m = this.cfg.mat;
    return new Venue({
      track: tr,
      camera: this.camera,
      draw: (ctx, view, camera) => {
        tr.draw(ctx, view, camera);
        tr.drawMat(ctx, view, camera);
        tr.drawUprightsBack(ctx, view, camera);
      },
      drawFront: (ctx, view, camera) => tr.drawUprightsFront(ctx, view, camera),
      x: [-12, 17],
      depth: FIELD_DEPTH,
      zPerM: 1 / FIELD_DEPTH,
      // The mat stands `height` off the ground over its middle stretch of the infield (as drawMat).
      floor: (x, d) => (x > m.from && x < m.to && d > 0.12 * FIELD_DEPTH && d < 0.88 * FIELD_DEPTH ? m.height : 0),
    });
  }

  lateUpdate(dt, t) {
    this.after.update(dt, t);
    this.camY = damp(this.camY, 0, 6, dt);
    this.zoom = damp(this.zoom, 1, 6, dt); // back to the usual framing for the late hits
  }

  /** The world's framing: zoomed in from the top of the screen (`camera.zoom`), raised by camY. */
  frame(ctx, view) {
    ctx.translate(view.w / 2, 0);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-view.w / 2, this.camY);
  }

  lateRender(ctx, view) {
    ctx.save();
    this.frame(ctx, view);
    this.after.render(ctx, view);
    ctx.restore();
  }

  markLabel() {
    return this.mark.fail ? 'NO HEIGHT' : `${this.mark.mark.toFixed(2)} m`;
  }

  hitExit(e) {
    const b = this.exitBtn;
    return e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h;
  }

  // ---------------------------------------------------------------- drawing

  /** How far into the plant zone you are: 0 at its start, 1 at the plant. */
  zoneProgress() {
    if (this.runUp.striding) return 0;
    const start = this.plantX - this.cfg.zoneDistance;
    return clamp((this.runner.x - start) / (this.plantX - start), 0, 1);
  }

  poseFor() {
    const now = this.now;
    const r = this.runner;
    const V = VAULT_POSES;
    switch (this.state) {
      case 'ready': {
        const s = Math.sin(now * 1.7);
        return { ...POSES.stand, hipY: POSES.stand.hipY + 0.006 * s, lean: POSES.stand.lean + 0.02 * s, arms: V.carryArms };
      }
      case 'run': {
        // Running with the pole; the hands come up overhead for the plant.
        const run = runUpPose(r);
        const k = ease(clamp((this.zoneProgress() - 0.7) / 0.3, 0, 1)); // hands come up smoothly over the last stretch
        const carry = { ...run, arms: V.carryArms };
        return lerpPose(carry, { ...run, arms: V.plantArms }, k);
      }
      case 'vault': {
        const pose = (this.vault.sw ?? this.swingAt(this.vault.u)).pose;
        const k = this.plantBlend(now);
        const from = this.plantFrom?.pose;
        return k < 1 && from ? lerpPose(wrapNear(from, pose), pose, k) : pose;
      }
      case 'fly': {
        // Off the top (traced from the original): turn to face the bar, face down
        // over it at the peak with the legs dangling, then drop onto your back.
        const pose = sampleTrack(this.flyTrack(), this.flyClock(now));
        return { ...pose, flip: true };
      }
      case 'balk': {
        const ta = now - this.stateT;
        const b = this.balkFall;
        if (b?.stall) {
          // Toppled off the top of the pole: upside down, onto your back on the runway, up again.
          const k = (this.cfg.standUp ?? 1.9) / 1.9;
          const after = [[0.12, V.landBack], [0.45, V.landBack], [0.85, V.lie], [1.2, V.sitMat], [1.5, V.crouchMat], [1.9, POSES.stand]];
          const keys = [[0, b.topPose], [0.4 * b.fallT, V.hang], [0.75 * b.fallT, V.drop], [b.fallT, V.landBack], ...after.map(([t, p]) => [b.fallT + t * k, p])];
          return { ...sampleTrack(keys, ta), flip: true };
        }
        const from = wrapNear(this.lastPose ?? POSES.stand, POSES.stand);
        return lerpPose(from, POSES.stand, ease(clamp(ta / 0.6, 0, 1)));
      }
      default: {
        if (!this.fly) return this.balkFall?.stall ? { ...POSES.stand, flip: true } : POSES.stand;
        // On the mat: land on your back, lie there a moment, sit up, stand.
        // On the mat (from the original): on your back, legs up, legs come down, sit up, stand.
        const age = now - (this.fly.landT ?? this.fly.t0 + this.fly.T);
        const from = { ...wrapNear(this.lastAirPose ?? V.landBack, V.landBack), hipY: V.landBack.hipY };
        const k = (this.cfg.standUp ?? 1.9) / 1.9; // quick, as in the original
        const keys = [[0, from], [0.12, V.landBack], [0.45, V.landBack], [0.85, V.lie], [1.2, V.sitMat], [1.5, V.crouchMat], [1.9, POSES.stand]];
        const pose = sampleTrack(keys.map(([t, p]) => [t * k, p]), age);
        return { ...pose, flip: true };
      }
    }
  }

  render(ctx, view) {
    if (this.after) return fieldLateRender(this, ctx, view);
    const tr = this.track;
    const cam = this.camera;
    const pxPerM = cam.ppm * tr.figureScale(1);
    const H = this.figH * pxPerM;
    ctx.save();
    this.frame(ctx, view);
    tr.draw(ctx, view, cam);
    tr.drawMat(ctx, view, cam);
    tr.drawUprightsBack(ctx, view, cam);

    const base = this.poseFor();
    const pose = { ...base, arms: [...base.arms] }; // the grip sets the arms
    this.lastPose = pose;
    const ground = tr.toScreen(cam, view, this.hip.x, 1);
    const groundY = ground.y + 4;
    const onMat = this.hip.x > this.cfg.mat.from && this.hip.x < this.cfg.mat.to;
    const floorY = groundY - (onMat ? this.cfg.mat.height * pxPerM : 0);
    let y;
    if (this.state === 'landed' || this.state === 'mark') {
      y = this.fly ? floorY : groundY; // on the mat (or the runway after a balk)
    } else if (this.state === 'ready' || this.state === 'run') {
      y = groundY;
    } else {
      // Place the figure by its hips.
      y = groundY - this.hip.y * pxPerM - pose.hipY * H;
      if (this.state === 'fly') this.lastAirPose = pose;
    }
    if (this.state === 'balk' && this.hip.y <= 0.5 * this.figH + 0.01) y = groundY;

    const sx = ground.x;
    this.drawGhost(ctx, view, pxPerM);
    // The pole passes the near side of the body: the athlete, then the pole,
    // then the hands gripping it (the top hand on the very end).
    const pole = this.poleGrip(view, sx, y, H, pose, pxPerM);
    drawFigure(ctx, sx, y, H, pose, this.player.colors, onMat ? floorY : groundY);
    if (pole) {
      strokePole(ctx, pole.e, pole.a, pole.c, pole.b, H);
      if (pole.low) drawHand(ctx, pole.low, H, this.player.colors, true);
      if (pole.held) drawHand(ctx, pole.a, H, this.player.colors);
    }
    if (this.state !== 'mark') {
      const p = this.poleDrawn;
      const rel = (q) => [(q.x - sx) / pxPerM, (q.y - y) / pxPerM];
      const props = p ? [1, ...rel(p.e), ...rel(p.a), ...rel(p.c), ...rel(p.b)] : [0];
      this.ghost.sample(this.now, this.hip.x, (groundY - y) / pxPerM, pose, props);
    }
    this.drawSpark(ctx);
    for (const p of this.puff) {
      const s = tr.toScreen(cam, view, p.x, 1);
      ctx.fillStyle = `rgba(255,236,160,${clamp(p.life / 0.5, 0, 1) * 0.8})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y + 4 - p.y * pxPerM, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    tr.drawUprightsFront(ctx, view, cam);
    ctx.restore();

    this.drawControls(ctx, view);
    this.drawHUD(ctx, view);
    if (this.state === 'mark') this.drawMark(ctx, view);
    this.liveField?.draw(ctx, view);
  }

  /** The ghost vaulter (or the other live players) and the pole, see-through, from recorded frames. */
  drawGhost(ctx, view, pxPerM) {
    for (const fig of this.ghost.figures(this.now)) this.drawGhostFigure(ctx, view, pxPerM, fig);
  }

  drawGhostFigure(ctx, view, pxPerM, fig) {
    const g = fig.frame;
    const tr = this.track;
    const ground = tr.toScreen(this.camera, view, g.x, 1);
    const groundY = ground.y + 4;
    const onMat = g.x > this.cfg.mat.from && g.x < this.cfg.mat.to;
    const floorY = groundY - (onMat ? this.cfg.mat.height * pxPerM : 0);
    const y = groundY - g.e * pxPerM;
    const H = FIG_H * heightOf(fig.colors) * pxPerM;
    // The pole: blended between frames while it's shown in both.
    const [pa, pb] = [g.pa, g.pb];
    const p = pa[0] && pb[0] ? pa.map((v, i) => v + (pb[i] - v) * g.k) : g.k < 0.5 ? pa : pb;
    if (p[0] > 0.5) {
      const pt = (i) => ({ x: ground.x + p[i] * pxPerM, y: y + p[i + 1] * pxPerM });
      ctx.save();
      ctx.globalAlpha = 0.45;
      strokePole(ctx, pt(1), pt(3), pt(5), pt(7), H);
      ctx.restore();
    }
    this.ghost.drawFigure(ctx, fig, ground.x, y, H, onMat ? floorY : groundY);
  }

  /**
   * The pole and how you hold it: the top hand (the near arm, the one you see)
   * holds the very end the whole time, the bottom hand (far arm) grips about
   * `pole.grip` m further up. Running, the top hand carries the end at the
   * back hip and the bottom hand holds the pole up in front of the chest, tip
   * high; through the plant zone the tip drops to the box and the top hand
   * drives up overhead. On the pole the top hand stays on the end; the bottom
   * hand keeps hold while it can reach and lets go near the top (it leaves
   * first, as in a real vault). Sets the arms of `pose` (a copy), this.sparkAt
   * for drawSpark and this.poleTop for the camera; returns the pole (screen
   * points: e end, a top hand, c bend, b tip, low the bottom hand or null) or
   * null once you've let go and it's fallen.
   */
  poleGrip(view, sx, y, H, pose, pxPerM) {
    const cfg = this.cfg;
    const tr = this.track;
    const box = tr.toScreen(this.camera, view, 0, 1);
    const boxP = { x: box.x, y: box.y + 4 };
    const len = this.L * pxPerM;
    const S = shoulderPos(sx, y, H, pose);
    this.sparkAt = null;
    this.poleTop = null;
    let a, b, sag = 0; // a = top hand (the end), b = tip
    const grip = this.state === 'ready' || this.state === 'run' || this.state === 'vault';
    if (this.state === 'ready' || this.state === 'run') {
      const p = this.zoneProgress();
      // Top hand: at the back hip, driving up overhead over the last stretch of the zone.
      const k = ease(clamp((p - 0.75) / 0.25, 0, 1));
      const C = VAULT_POSES.carryHand;
      const P = VAULT_POSES.plantHand;
      // Swung round in front of the shoulder (a straight line from hip to overhead passes through
      // the shoulder itself, and the elbow flips).
      const ang0 = Math.atan2(C.x, C.y); // 0 = straight down, + = forward
      let ang1 = Math.atan2(P.x, P.y);
      if (ang1 < ang0) ang1 += 2 * Math.PI;
      const ang = ang0 + (ang1 - ang0) * k;
      const rad = Math.hypot(C.x, C.y) + (Math.hypot(P.x, P.y) - Math.hypot(C.x, C.y)) * k;
      a = { x: S.x + H * rad * Math.sin(ang), y: S.y + H * rad * Math.cos(ang) };
      pose.arms[0] = armIK(S, a, H, -1);
      // Tip high while running, like a real vaulter. Through the plant zone the
      // pole drops, turning to aim at the box: the tip stays on the line from
      // your hands to the box, so it never touches the ground before the box
      // and slides into it at the plant.
      const toBox = Math.atan2(a.y - boxP.y, boxP.x - a.x);
      const drop = ease(clamp(p / cfg.pole.dropShare, 0, 1)); // down early in the zone, then low to the plant
      const psi = cfg.pole.carryAngle + (toBox - cfg.pole.carryAngle) * drop;
      const reach = Math.min(len, Math.hypot(boxP.x - a.x, boxP.y - a.y));
      b = { x: a.x + reach * Math.cos(psi), y: a.y - reach * Math.sin(psi) };
      // The spark sets off from your hands a moment into the zone and runs down to the tip.
      const sd = cfg.pole.sparkDelay ?? 0;
      if (!this.runUp.striding) this.sparkS = p < sd ? null : (p - sd) / (1 - sd);
      this.poleTop = Math.min(a.y, b.y);
    } else if (this.state === 'vault') {
      const sw = this.vault.sw ?? this.swingAt(this.vault.u);
      a = handPos(sx, y, H, pose, 0); // the swing hangs you from the top hand
      b = boxP;
      sag = Math.sqrt(Math.max(0, (3 * this.L * (this.L - sw.c)) / 8)) * pxPerM;
    } else {
      // Let go: the pole falls back toward the runway.
      const f = this.state === 'balk' ? this.balkFall : this.fly;
      this.poleDrawn = null;
      if (!f) return null;
      const ta = this.now - f.poleT;
      const phi = Math.max(0.12, f.phiEnd - 1.6 * ta * ta);
      // A pole still bent when you let go springs straight (not all at once).
      const c0 = f.cEnd ?? this.L;
      const chord = c0 + (this.L - c0) * ease(clamp(ta / POLE_SPRING, 0, 1));
      b = boxP;
      a = { x: boxP.x - chord * pxPerM * Math.cos(phi), y: boxP.y - chord * pxPerM * Math.sin(phi) };
      sag = Math.sqrt(Math.max(0, (3 * this.L * (this.L - chord)) / 8)) * pxPerM;
    }
    // Quadratic curve, bowing forward (away from the vaulter) when bent.
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d;
    const ny = dx / d;
    const flip = nx > 0 || ny < 0 ? 1 : -1; // toward the pit / up
    const c = { x: mx + nx * sag * 2 * flip, y: my + ny * sag * 2 * flip };
    const e = a; // the top hand holds the very end
    // Points along the pole by distance from the end (even spacing on a bent pole).
    const q = (k) => ({
      x: (1 - k) * (1 - k) * a.x + 2 * (1 - k) * k * c.x + k * k * b.x,
      y: (1 - k) * (1 - k) * a.y + 2 * (1 - k) * k * c.y + k * k * b.y,
    });
    const N = 32;
    const acc = [0];
    let prev = q(0);
    for (let i = 1; i <= N; i++) {
      const pt = q(i / N);
      acc.push(acc[i - 1] + Math.hypot(pt.x - prev.x, pt.y - prev.y));
      prev = pt;
    }
    const at = (dist) => {
      let i = 1;
      while (i < N && acc[i] < dist) i++;
      const k = (i - 1 + (dist - acc[i - 1]) / Math.max(1e-6, acc[i] - acc[i - 1])) / N;
      return q(clamp(k, 0, 1));
    };
    // Bottom hand: `pole.grip` m up the pole, or as far as the arm reaches; on
    // the pole, too far to reach at all and it has let go (the swing pose's arm).
    let low = null;
    if (grip) {
      const armLen = 0.33 * H * 0.99;
      const g = cfg.pole.grip * this.tall * pxPerM;
      for (let dist = g; dist >= 0.12 * g; dist -= 0.01 * g) {
        const pt = at(dist);
        if (Math.hypot(pt.x - S.x, pt.y - S.y) <= armLen) {
          low = pt;
          break;
        }
      }
      if (!low && this.state !== 'vault') low = at(0.12 * g); // running: always holding on
      if (low) pose.arms[1] = armIK(S, low, H, -1);
      // On the pole the bottom hand follows its target smoothly (letting go, or the grip sliding
      // as the pole bends), and the hand is drawn where the arm actually is.
      if (this.state === 'vault') {
        const prev = this.farArm;
        const dtR = prev ? this.now - prev.t : 0;
        if (prev && dtR > 0 && dtR < 0.1) {
          const k = 1 - Math.exp(-FAR_ARM_RATE * dtR);
          const w = (x, r) => x + 2 * Math.PI * Math.round((r - x) / (2 * Math.PI));
          const cap = FAR_ARM_MAX * dtR; // rad this frame at most
          const go = (from, to) => from + clamp((w(to, from) - from) * k, -cap, cap);
          const t1 = pose.arms[1];
          pose.arms[1] = { upper: go(prev.upper, t1.upper), fore: go(prev.fore, t1.fore) };
        }
        if (!prev || dtR > 0) this.farArm = { ...pose.arms[1], t: this.now };
        else pose.arms[1] = { upper: prev.upper, fore: prev.fore };
        if (low) low = handPos(sx, y, H, pose, 1);
      } else this.farArm = { ...pose.arms[1], t: this.now }; // running: where the plant's smoothing starts from
    }
    this.poleDrawn = { e, a, c, b }; // for the ghost recording
    // Spark: down the pole in the plant zone (reaching the tip as it plants),
    // waiting there until you press, then back up to your hands while you hold.
    let s = null; // 0 = hands, 1 = tip
    if (this.state === 'run' && !this.runUp.striding) s = this.sparkS;
    else if (this.state === 'vault' && this.releaseT == null) {
      const c0 = this.climbStart();
      s = c0 == null ? 1 : 1 - clamp((this.now - c0) / releaseTarget(cfg, this.vault.v), 0, 1);
    }
    if (s != null) this.sparkAt = at(s * acc[N]);
    return { e, a, c, b, low, held: grip };
  }

  drawSpark(ctx) {
    const p = this.sparkAt;
    if (!p) return;
    const t = this.now;
    const r = 7 + Math.sin(t * 40) * 1.5;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,240,140,0.95)');
    g.addColorStop(1, 'rgba(255,170,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
    ctx.fill();
    // A few flying sparks.
    ctx.strokeStyle = 'rgba(255,230,120,0.9)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const ang = i * 1.3 + t * 17;
      const l = r * (1.4 + 0.6 * Math.sin(t * 23 + i));
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(ang) * r * 0.8, p.y + Math.sin(ang) * r * 0.8);
      ctx.lineTo(p.x + Math.cos(ang) * l, p.y + Math.sin(ang) * l);
      ctx.stroke();
    }
  }

  drawControls(ctx) {
    if (this.liveField?.holding) return; // live: the round hasn't started
    const now = this.now;
    const ru = this.runUp;
    ru.drawTargets(ctx, now, this.state === 'ready' || this.state === 'run');
    const orange = (held) => {
      ru.drawOrange(ctx, held ? 0.86 : 1);
      if (held) {
        for (const p of [ru.pads.L, ru.pads.R]) {
          ctx.strokeStyle = 'rgba(255,240,150,0.9)';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(p.home.x, p.home.y, p.r * 1.05, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    };
    const holding = this.holdT != null && this.releaseT == null;
    if (holding && (this.state === 'run' || this.state === 'vault')) orange(true);
    else if (this.state === 'vault' && this.holdT == null) orange(false); // planted: press now
    else if (this.state === 'run' && this.holdT == null && ru.blinkOn(now, this.cfg.blink)) orange(false);
    ru.drawRings(ctx, now);
  }

  drawHUD(ctx, view) {
    const s = view.safe;
    const b = this.exitBtn;
    roundRect(ctx, b.x, b.y, b.w, b.h, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    text(ctx, '✕', b.x + b.w / 2, b.y + b.h / 2 + 1, { size: 20 });
    const mx = b.x + b.w + 12;
    const my = b.y + 6;
    const mw = 150;
    const v = this.vault ? this.vault.v : this.runner.v;
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
    const best = this.best(this.player);
    text(ctx, `ATTEMPT ${this.round}/${this.cfg.rounds}`, view.w - 16 - s.r, 22 + s.t, { size: 20, align: 'right', color: '#fff', shadow: true });
    text(ctx, `Best ${best == null ? '—' : best.toFixed(2) + ' m'}`, view.w - 16 - s.r, 48 + s.t, { size: 15, align: 'right', color: 'rgba(255,255,255,0.85)', shadow: true });
    // Live height while in the air.
    if (this.state === 'fly' || this.state === 'landed') {
      const h = this.state === 'fly' ? Math.min(this.peak / (this.cfg.flight.heightScale ?? 1), this.vault.height) : this.vault.height;
      text(ctx, `${h.toFixed(2)} m`, view.w / 2, 40 + s.t, { size: 30, color: '#fff', shadow: true });
    }
  }

  /** After each vault: your height (or NO HEIGHT) and everyone's best so far. */
  drawMark(ctx, view) {
    const cx = view.w / 2;
    const w = Math.min(560, view.w - 40);
    const x0 = cx - w / 2;
    roundRect(ctx, x0, 70, w, 330, 18);
    ctx.fillStyle = 'rgba(12,22,44,0.88)';
    ctx.fill();
    const m = this.mark;
    text(ctx, `ATTEMPT ${this.round} OF ${this.cfg.rounds}`, cx, 98, { size: 16, color: 'rgba(255,255,255,0.7)' });
    if (m.fail) text(ctx, 'NO HEIGHT', cx, 150, { size: 52, color: '#ff4b3e', shadow: true });
    else text(ctx, `${m.mark.toFixed(2)} m`, cx, 150, { size: 60, color: '#fff', shadow: true });
    text(ctx, this.markDetail(), cx, 192, { size: 14, weight: 500, color: 'rgba(255,255,255,0.75)', maxWidth: w - 30 });
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
    text(ctx, this.liveField?.hint() ?? (last ? 'Tap to continue' : 'Tap for the next vault'), cx, 372, { size: 18, color: `rgba(255,255,255,${pulse})` });
  }
}

/** Cubic from p0 (slope m0) to p1 (slope m1) over `len` s, at time t (0..len). */
function hermite(p0, p1, m0, m1, t, len) {
  if (len <= 1e-6) return p1;
  const k = clamp(t / len, 0, 1);
  const k2 = k * k;
  const k3 = k2 * k;
  return (2 * k3 - 3 * k2 + 1) * p0 + (k3 - 2 * k2 + k) * len * m0 + (-2 * k3 + 3 * k2) * p1 + (k3 - k2) * len * m1;
}

/** A pole from its end `e` through the hands `a`, bending toward `c`, to the tip `b` (screen points). */
function strokePole(ctx, e, a, c, b, H) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#2e6b12';
  ctx.lineWidth = Math.max(3, 0.05 * H);
  ctx.beginPath();
  ctx.moveTo(e.x, e.y);
  ctx.lineTo(a.x, a.y);
  ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
  ctx.stroke();
  ctx.strokeStyle = '#9be14a';
  ctx.lineWidth = Math.max(2, 0.03 * H);
  ctx.stroke();
}
