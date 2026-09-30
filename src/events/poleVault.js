import { CONFIG } from '../config.js';
import { Camera } from '../core/camera.js';
import { clamp, damp, rand, shuffle } from '../core/math.js';
import { text, roundRect } from '../core/ui.js';
import { Runner } from '../athletes/runner.js';
import { AIController } from '../athletes/ai.js';
import { player as chosenPlayer, rivals as rivalRoster, heightOf } from '../athletes/roster.js';
import { drawFigure, runPose, lerpPose, sampleTrack, handPos, vaultSwingPose, wrapNear, VAULT_POSES, POSES } from '../athletes/stickFigure.js';
import { StrideTargets } from './strideTargets.js';
import { pressQuality, releaseQuality, releaseTarget, vaultHeight, rivalVault } from './poleVaultRules.js';
import { VaultRenderer } from '../render/vaultArena.js';
import { ORANGE, drawPad, drawX } from '../render/pads.js';
import { drawDrop, drawHitRing } from '../render/targetPads.js';
import { getDifficulty } from '../core/storage.js';
import { flow } from '../flow.js';
import { Venue, FIELD_DEPTH } from '../brawl/venue.js';
import { startFieldLateHits, fieldLateStep, fieldLateRender } from '../brawl/fieldLateHits.js';
import { FieldGhost } from '../online/fieldGhost.js';
import { LiveField } from '../online/liveField.js';

const LEFT_KEYS = ['ArrowLeft', 'KeyA', 'KeyZ', 'KeyF'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD', 'KeyX', 'KeyJ'];
const BOTH_KEYS = ['Space', 'ArrowUp'];
const ease = (k) => k * k * (3 - 2 * k);
const easeOut = (k) => 1 - (1 - k) * (1 - k);
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
const FIG_H = CONFIG.figure.height;
// Ghost frames keep the pole (registry traceProps = 9): shown (1/0), then its
// end, hands, bend and tip, each x, y in m from where the figure is drawn.
// The swing, keyed from a phase diagram of a real vault (takeoff, swing,
// rock back, L, extension, inversion), per swing progress u:
//   phi   pole chord angle above level, as a share of the way from the plant
//         angle to the vault's final angle (upright for a good vault)
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
function swingKey(u, col) {
  let i = 1;
  while (i < SWING_KEYS.length - 1 && u > SWING_KEYS[i][0]) i++;
  const a = SWING_KEYS[i - 1];
  const b = SWING_KEYS[i];
  return a[col] + (b[col] - a[col]) * ease(clamp((u - a[0]) / (b[0] - a[0]), 0, 1));
}

/**
 * Pole vault, from footage of the original (rules in poleVaultRules.js):
 * - Three attempts; your best height counts against five rivals' best.
 * - Run-up: the 100m's green targets, carrying the pole.
 * - Plant zone: the pads turn orange and blink, strides stop, the pole comes
 *   down and a spark runs from your hands to its tip, reaching it as the tip
 *   plants in the box.
 * - Press and HOLD both at the plant. The spark climbs back up the pole; let
 *   go as it reaches your hands. You swing up the bending pole, push off the
 *   top, arch over the bar and drop onto the mat. The camera rises with you.
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
    this.lv = { ...CONFIG.ai[this.level], ...this.cfg.ai[this.level] };
    this.wantsReleases = true; // hold-and-release controls
  }

  enter() {
    const cfg = this.cfg;
    const P = cfg.pole;
    this.L = P.length;
    // A shorter athlete (Joey) is smaller all over and plants with the hands lower.
    this.tall = heightOf(chosenPlayer(this.ev.id).colors);
    this.figH = FIG_H * this.tall;
    const gripY = P.gripY * this.tall;
    this.plantX = -Math.sqrt(P.length ** 2 - gripY ** 2);
    this.phi0 = Math.asin(gripY / P.length);
    // Hips to hands upside down at the top of the pole (arms straight along the body).
    const top = handPos(0, 0, this.figH, vaultSwingPose(Math.PI, 1), 0);
    this.reach = Math.hypot(top.x, top.y);
    this.track = new VaultRenderer(cfg);
    this.camera = new Camera();
    const me = chosenPlayer(this.ev.id);
    this.player = { name: this.live ? this.live.name : me.name, colors: me.colors, isPlayer: true, jumps: [] }; // live: your username, as the others see you
    this.rivals = shuffle(rivalRoster(this.ev.id))
      .slice(0, 5)
      .map((r) => ({ name: r.name, colors: r.colors, isPlayer: false, jumps: [], cadence: rand(...this.lv.cadence) }));
    const r = CONFIG.sprint100.pads.radius;
    this.pads = { L: { home: { x: 0, y: 0 }, r }, R: { home: { x: 0, y: 0 }, r } };
    this.exitBtn = { x: 0, y: 0, w: 44, h: 40 };
    this.stats = { hits: 0, misses: 0, topSpeed: 0 };
    this.round = 0;
    this.liveField = this.live ? new LiveField(this) : null;
    if (this.liveField) this.rivals = this.liveField.people; // live: just the other players, so every phone has the same results
    this.ghost = new FieldGhost(this.ev, this.liveField);
    this.onResize(this.game.view);
    this.startRound();
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
    this.runner.go(t);
    this.judge.start(t);
    this.spawnT = -Infinity;
    this.rings = [];
    this.missSide = null;
    this.missT = -Infinity;
    this.zoneT = null; // orange pads up, spark running down the pole
    this.down = { L: null, R: null }; // thumbs currently down: { id, t }
    this.holdT = null; // both thumbs down (the plant press)
    this.releaseT = null;
    this.plantT = null;
    this.vault = null; // { v, u, pq, rq, height, phiEnd, released, ... }
    this.fly = null; // { t0, x0, y0, vx, vy, T }
    this.mark = null; // { mark } or { fail: true }
    this.hip = { x: this.runner.x, y: 0.5 * (this.figH ?? FIG_H) };
    this.camY = 0;
    this.puff = [];
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
      if (this.state === 'mark') {
        if (end - this.stateT > 0.4 && (e.type === 'down' || e.code === 'Enter' || e.code === 'Space')) return this.next();
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
    if (this.holdT != null || !(this.state === 'run' || this.state === 'vault')) return;
    const id = e.id ?? e.code;
    if (side === 'BOTH') this.down = { L: { id, t }, R: { id, t } };
    else this.down[side] = { id, t };
    const { L, R } = this.down;
    // Both thumbs down: the plant press, if it's close enough to the plant.
    if (L && R && this.canPlant(t)) this.holdT = t;
  }

  lift(side, e) {
    const id = e.id ?? e.code;
    for (const s of ['L', 'R']) if (this.down[s]?.id === id) this.down[s] = null;
    if (this.holdT != null && this.releaseT == null && (this.down.L == null || this.down.R == null)) this.release(e.t);
  }

  /** A press counts from `press.miss` before the plant (predicted from your speed) until that long after it. */
  canPlant(t) {
    const m = this.cfg.press.miss;
    if (this.plantT != null) return t - this.plantT <= m;
    const r = this.runner;
    return r.v > 0.5 && (this.plantX - r.x) / r.v <= m;
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
    vt.rq = this.releaseT == null ? 0 : releaseQuality(this.releaseT - this.holdT, cfg);
    vt.height = vaultHeight({ v: vt.v, pq: vt.pq, rq: vt.rq }, cfg);
    vt.phiEnd = this.phiFor(vt.height);
  }

  /**
   * How far the pole rises for a vault of `height`: far enough that you're
   * just below it (upside down over your hands) at the top of the pole, then
   * the push takes you the rest of the way. Straight up for a good vault.
   */
  phiFor(height) {
    const s = (height - 0.15 - this.reach) / this.L;
    return s >= 1 ? Math.PI / 2 + 0.04 : clamp(Math.asin(clamp(s, -1, 1)), this.phi0 + 0.5, Math.PI / 2);
  }

  /** Until the release is known, aim the pole for a perfect release (with the plant you had). */
  predictPhi() {
    const vt = this.vault;
    if (vt.phiEnd != null) return vt.phiEnd;
    const pq = this.holdT == null ? 1 : pressQuality(this.holdT - this.plantT, this.cfg.press);
    return this.phiFor(vaultHeight({ v: vt.v, pq, rq: 1 }, this.cfg));
  }

  // ---------------------------------------------------------------- simulation

  /**
   * On the pole at swing progress u (0 plant .. 1 top): the pole rotates up
   * about the box while it bends and straightens again; the figure hangs from
   * the top by its hands (so the hands are always on the pole), swinging from
   * below the hands to upside down above them.
   */
  swingAt(u) {
    const vt = this.vault;
    const phi = this.phi0 + (vt.phiCur - this.phi0) * swingKey(u, 1);
    const c = this.L * (1 - this.cfg.swing.bend * swingKey(u, 2));
    const hands = { x: -c * Math.cos(phi), y: c * Math.sin(phi) };
    // A weak vault never gets the pole upright, so you don't get fully upside down either.
    const k = clamp((vt.phiCur - this.phi0) / (Math.PI / 2 - this.phi0), 0.45, 1);
    const alpha = swingKey(u, 3) * k;
    const pose = vaultSwingPose(alpha, u);
    const off = handPos(0, 0, this.figH, pose, 0); // hand relative to the hips (m, y down)
    return { phi, c, hands, alpha, pose, hip: { x: hands.x - off.x, y: hands.y + off.y } };
  }

  simulate(dt, t) {
    const cfg = this.cfg;
    const r = this.runner;
    const end = t + dt;
    if (this.state === 'ready' || this.state === 'run') {
      r.update(dt, t);
      this.hip = { x: r.x, y: 0.5 * this.figH };
      if (this.state === 'run' && this.zoneT == null && this.plantX - r.x <= cfg.zoneDistance) {
        // Plant zone: strides stop, the pads turn orange, the pole comes down.
        this.zoneT = t;
        this.judge.target = null;
        r.carry();
      }
      if (this.state === 'run' && r.x >= this.plantX) this.plant(end);
    } else if (this.state === 'vault') {
      const vt = this.vault;
      if (this.holdT == null && end - this.plantT > cfg.press.miss) return this.balk(end);
      // Held on too long: you get nothing from the release.
      if (this.holdT != null && this.releaseT == null && end - this.holdT > releaseTarget(cfg) + cfg.release.window) this.release(end);
      vt.u = Math.min(1, vt.u + dt / cfg.swing.time);
      vt.phiCur = damp(vt.phiCur, this.predictPhi(), 8, dt);
      const sw = this.swingAt(vt.u);
      vt.sw = sw;
      this.hip = sw.hip;
      if (vt.u >= 1) {
        if (vt.height == null) this.release(end); // top of the pole: let go now
        this.takeOff(end);
      }
    } else if (this.state === 'fly') {
      const f = this.fly;
      this.hip = this.flyAt(Math.min(end - f.t0, f.T));
      this.peak = Math.max(this.peak, this.hip.y);
      if (end - f.t0 >= f.T) this.land(f.t0 + f.T);
    } else if (this.state === 'balk') {
      // Came off the pole: drop back to the runway.
      const b = this.balkFall;
      const ta = end - b.t0;
      this.hip = { x: b.x + b.vx * Math.min(ta, b.T), y: Math.max(0.5 * this.figH, b.y + b.vy * ta - 0.5 * G * ta * ta) };
      if (ta > 1.6) this.showMark();
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
    this.followCamera(dt);
  }

  plant(t) {
    const r = this.runner;
    this.plantT = t;
    this.stats.topSpeed = Math.max(this.stats.topSpeed, r.v);
    this.vault = { v: r.v, u: 0, pq: null, rq: null, height: null, phiEnd: null };
    this.vault.phiCur = this.predictPhi();
    // Pressed early and already let go? Then that's your release.
    if (this.holdT != null && this.releaseT != null) this.decide();
    navigator.vibrate?.(20);
    this.setState('vault');
  }

  /**
   * Off the top of the pole, timed like the original rather than by gravity:
   * rise to your height while turning to face the bar (`flight.rise`), hang
   * face down over the bar (`flight.hang`), then drop onto the mat (`flight.fall`).
   */
  takeOff(t) {
    const vt = this.vault;
    const F = this.cfg.flight;
    const h0 = this.hip;
    const xb = this.cfg.uprightX;
    this.fly = {
      t0: t, x0: h0.x, y0: h0.y, peak: Math.max(vt.height, h0.y), yLand: this.cfg.mat.height + 0.2,
      xa: xb - 0.1, xc: xb + 0.35, T: F.rise + F.hang + F.fall, poleT: t, phiEnd: vt.sw.phi,
      topPose: mirror(vt.sw.pose),
    };
    this.peak = h0.y;
    this.setState('fly');
  }

  /** Hips during the flight, `ta` s after leaving the pole. */
  flyAt(ta) {
    const f = this.fly;
    const F = this.cfg.flight;
    const L = this.cfg.landX;
    if (ta < F.rise) {
      const k = easeOut(ta / F.rise);
      return { x: f.x0 + (f.xa - f.x0) * k, y: f.y0 + (f.peak - f.y0) * k };
    }
    if (ta < F.rise + F.hang) {
      const k = (ta - F.rise) / F.hang;
      return { x: f.xa + (f.xc - f.xa) * k, y: f.peak - 0.15 * k * k };
    }
    const k = clamp((ta - F.rise - F.hang) / F.fall, 0, 1);
    return { x: f.xc + (L - f.xc) * k, y: f.peak - 0.15 + (f.yLand - f.peak + 0.15) * k * k };
  }

  land(t) {
    const vt = this.vault;
    this.mark = { mark: vt.height };
    this.track.lastHeight = vt.height;
    for (let i = 0; i < 14; i++) {
      this.puff.push({ x: this.hip.x + rand(-0.6, 0.6), y: this.cfg.mat.height, vx: rand(-0.6, 0.6), vy: rand(0.3, 1.2), life: rand(0.3, 0.6), r: rand(3, 7) });
    }
    navigator.vibrate?.(30);
    this.setState('landed');
  }

  /** No press by the time it counted: you come off the pole. No height. */
  balk(t) {
    const sw = this.vault.sw ?? this.swingAt(this.vault.u);
    this.balkFall = { t0: t, x: this.hip.x, y: this.hip.y, vx: 0.8, vy: 0.5, T: 0.6, poleT: t, phiEnd: sw.phi };
    this.mark = { fail: true };
    navigator.vibrate?.(60);
    this.setState('balk');
  }

  followCamera(dt) {
    const view = this.game.view;
    const r = this.runner;
    let cx = this.state === 'ready' || this.state === 'run' ? r.x : this.hip.x;
    if (this.state === 'landed' || this.state === 'mark') cx = this.cfg.landX - 1.5;
    this.camera.follow(cx, this.state === 'run' ? r.v : 0, dt);
    // Rise with the vaulter: keep the head at least topFrac down the screen.
    const ground = this.track.toScreen(this.camera, view, this.hip.x, 1).y + 4;
    const headY = ground - (this.hip.y + 0.5 * this.figH) * this.camera.ppm;
    const want = Math.max(0, view.h * this.cfg.camera.topFrac - headY);
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
    const best = this.best(this.player);
    this.track.bar = best;
    this.setState('mark');
    // Your last vault: on your feet (on the mat, facing back the way you came), the late hits start (brawl/fieldLateHits.js).
    if (this.round >= this.cfg.rounds) startFieldLateHits(this, this.hip.x, this.poseFor(), this.fly ? -1 : 1);
  }

  /** A rival's speed at the plant (same physics as yours). */
  rivalRunUp(rv) {
    const step = CONFIG.loop.fixedStep;
    const r = new Runner(undefined, undefined, -this.cfg.runway);
    const ai = new AIController(r, this.lv, rv.cadence);
    ai.go(0);
    let t = 0;
    while (r.x < this.plantX && t < 20) {
      if (this.plantX - r.x <= this.cfg.zoneDistance) r.carry();
      ai.update(t, step, 0, Infinity);
      r.update(step, t);
      t += step;
    }
    return r.v;
  }

  next() {
    if (this.liveField) return this.liveField.next();
    if (this.round < this.cfg.rounds) this.startRound();
    else this.finish();
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
  }

  lateRender(ctx, view) {
    ctx.save();
    ctx.translate(0, this.camY);
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
    if (this.zoneT == null) return 0;
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
        const run = runPose(r.phase, clamp(r.v / 11, 0.15, 1), 0);
        const k = ease(clamp((this.zoneProgress() - 0.88) / 0.12, 0, 1)); // hands up over the last two strides
        const carry = { ...run, arms: V.carryArms };
        return lerpPose(carry, { ...run, arms: V.plantArms }, k);
      }
      case 'vault':
        return (this.vault.sw ?? this.swingAt(this.vault.u)).pose;
      case 'fly': {
        // Off the top (traced from the original): turn to face the bar, face down
        // over it with the legs dangling, hang there, then drop onto your back.
        const f = this.fly;
        const F = this.cfg.flight;
        const ta = now - f.t0;
        const pose = sampleTrack([
          [0, f.topPose],
          [F.rise * 0.7, V.turn],
          [F.rise, V.overBar],
          [F.rise + F.hang, V.hang],
          [F.rise + F.hang + F.fall * 0.45, V.drop],
          [f.T, V.landBack],
        ], ta);
        return { ...pose, flip: true };
      }
      case 'balk': {
        const ta = now - this.stateT;
        const from = wrapNear(this.lastPose ?? POSES.stand, POSES.stand);
        return lerpPose(from, POSES.stand, ease(clamp(ta / 0.6, 0, 1)));
      }
      default: {
        if (!this.fly) return POSES.stand;
        // On the mat: land on your back, lie there a moment, sit up, stand.
        // On the mat (from the original): on your back, legs up, legs come down, sit up, stand.
        const age = now - (this.fly.t0 + this.fly.T);
        const from = { ...wrapNear(this.lastAirPose ?? V.landBack, V.landBack), hipY: V.landBack.hipY };
        const pose = sampleTrack([[0, from], [0.12, V.landBack], [0.45, V.landBack], [0.85, V.lie], [1.2, V.sitMat], [1.5, V.crouchMat], [1.9, POSES.stand]], age);
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
    ctx.translate(0, this.camY);
    tr.draw(ctx, view, cam);
    tr.drawMat(ctx, view, cam);
    tr.drawUprightsBack(ctx, view, cam);

    const pose = this.poseFor();
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
    // Pole behind the athlete's near arm: draw it first, then the athlete.
    this.drawPole(ctx, view, sx, y, H, pose, pxPerM);
    drawFigure(ctx, sx, y, H, pose, this.player.colors, onMat ? floorY : groundY);
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
   * The pole: carried up in front while running, lowered through the plant
   * zone to the box, bending as you swing on it, then falling back after you
   * let go. Also sets this.sparkAt (screen point) for drawSpark.
   */
  drawPole(ctx, view, sx, y, H, pose, pxPerM) {
    const cfg = this.cfg;
    const tr = this.track;
    const box = tr.toScreen(this.camera, view, 0, 1);
    const boxP = { x: box.x, y: box.y + 4 };
    const hand = handPos(sx, y, H, pose, 0);
    const len = this.L * pxPerM;
    this.sparkAt = null;
    let a, b, sag = 0; // a = hands end, b = tip end
    if (this.state === 'ready' || this.state === 'run') {
      const p = this.zoneProgress();
      // Tip high while running, like a real vaulter. Through the plant zone the
      // pole drops, turning to aim at the box: the tip stays on the line from
      // your hands to the box, so it never touches the ground before the box
      // and slides into it at the plant.
      const toBox = Math.atan2(hand.y - boxP.y, boxP.x - hand.x);
      const psi = cfg.pole.carryAngle + (toBox - cfg.pole.carryAngle) * ease(p);
      const reach = Math.min(len, Math.hypot(boxP.x - hand.x, boxP.y - hand.y));
      a = hand;
      b = { x: hand.x + reach * Math.cos(psi), y: hand.y - reach * Math.sin(psi) };
      if (this.zoneT != null) this.sparkS = p; // the spark runs down to the tip
    } else if (this.state === 'vault') {
      const sw = this.vault.sw ?? this.swingAt(this.vault.u);
      a = hand;
      b = boxP;
      sag = Math.sqrt(Math.max(0, (3 * this.L * (this.L - sw.c)) / 8)) * pxPerM;
    } else {
      // Let go: the pole falls back toward the runway.
      const f = this.state === 'balk' ? this.balkFall : this.fly;
      this.poleDrawn = null;
      if (!f) return;
      const ta = this.now - f.poleT;
      const phi = Math.max(0.12, f.phiEnd - 1.6 * ta * ta);
      b = boxP;
      a = { x: boxP.x - len * Math.cos(phi), y: boxP.y - len * Math.sin(phi) };
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
    // The end of the pole sticks out behind the hands, as in the original.
    const tx = a.x - c.x;
    const ty = a.y - c.y;
    const tl = Math.hypot(tx, ty) || 1;
    const over = this.cfg.pole.overhang * pxPerM;
    const e = { x: a.x + (tx / tl) * over, y: a.y + (ty / tl) * over };
    strokePole(ctx, e, a, c, b, H);
    this.poleDrawn = { e, a, c, b }; // for the ghost recording
    // Spark: down the pole in the plant zone, back up it while you hold.
    let s = null; // 0 = hands, 1 = tip
    if ((this.state === 'run' && this.zoneT != null) || (this.state === 'vault' && this.holdT == null)) s = this.state === 'vault' ? 1 : this.sparkS;
    if (this.holdT != null && this.releaseT == null && this.state !== 'fly') s = 1 - clamp((this.now - this.holdT) / cfg.spark.climbTime, 0, 1);
    if (s != null) {
      const q = (k) => ({
        x: (1 - k) * (1 - k) * a.x + 2 * (1 - k) * k * c.x + k * k * b.x,
        y: (1 - k) * (1 - k) * a.y + 2 * (1 - k) * k * c.y + k * k * b.y,
      });
      // Even speed along the pole: s is a share of the pole's length, not of the curve's parameter
      // (which runs faster near the ends of a bent pole).
      const N = 24;
      const acc = [0];
      let prev = q(0);
      for (let i = 1; i <= N; i++) {
        const p = q(i / N);
        acc.push(acc[i - 1] + Math.hypot(p.x - prev.x, p.y - prev.y));
        prev = p;
      }
      const want = s * acc[N];
      let i = 1;
      while (i < N && acc[i] < want) i++;
      const k = (i - 1 + (want - acc[i - 1]) / Math.max(1e-6, acc[i] - acc[i - 1])) / N;
      this.sparkAt = q(clamp(k, 0, 1));
    }
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
    const padsCfg = CONFIG.sprint100.pads;
    const { L, R } = this.pads;
    if ((this.state === 'ready' || this.state === 'run') && this.zoneT == null && this.judge.target) {
      drawDrop(ctx, this.pads[this.judge.target], now - this.spawnT, padsCfg);
      if (now - this.missT < padsCfg.missX) drawX(ctx, this.pads[this.missSide].home.x, this.pads[this.missSide].home.y);
    }
    const blink = this.cfg.blink;
    const orange = (held) => {
      for (const p of [L, R]) {
        drawPad(ctx, ORANGE, p.home.x, p.home.y, held ? p.r * 0.86 : p.r);
        if (held) {
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
    else if (this.state === 'run' && this.zoneT != null && this.holdT == null && (now - this.zoneT) % blink.period < blink.on) orange(false);
    for (const ring of this.rings) drawHitRing(ctx, this.pads[ring.side], now - ring.t0, padsCfg);
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
      const h = this.state === 'fly' ? Math.min(this.peak, this.vault.height) : this.vault.height;
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
    const vt = this.vault;
    const detail = m.fail
      ? 'no press at the plant'
      : `plant ${Math.round(vt.pq * 100)}% · release ${Math.round(vt.rq * 100)}% · ${(vt.v * 3.6).toFixed(0)} km/h`;
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
    text(ctx, this.liveField?.hint() ?? (last ? 'Tap for results' : 'Tap for the next vault'), cx, 372, { size: 18, color: `rgba(255,255,255,${pulse})` });
  }
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
