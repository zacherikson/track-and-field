import { CONFIG } from '../config.js';
import { damp, shuffle, clamp } from '../core/math.js';
import { text, roundRect } from '../core/ui.js';
import { player as chosenPlayer, rivals as rivalRoster, heightOf } from '../athletes/roster.js';
import { Bike, BikeAI, buildCourse } from './cyclingRules.js';
import { RoadRenderer, ROAD, drawCyclist } from '../render/road.js';
import { VENUES } from '../render/venues.js';
import { GREEN, ORANGE, drawPad, drawX } from '../render/pads.js';
import { getSpecialLevel } from '../core/storage.js';
import { flow } from '../flow.js';

const LEFT_KEYS = ['ArrowLeft', 'KeyA', 'KeyZ', 'KeyF'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD', 'KeyX', 'KeyJ'];
const UP_KEYS = ['ArrowUp', 'KeyW', 'KeyE'];
const DOWN_KEYS = ['ArrowDown', 'KeyS', 'KeyQ'];
const GREY = { hi: '#d9dee6', mid: '#8b93a1', lo: '#5a6170' };
const SHIFT = { hi: '#bfe0ff', mid: '#2f80ff', lo: '#1347b8' };

/**
 * TIME TRIAL (special event): one hilly road against the clock, the rivals
 * as see-through ghosts on it with you (physics in cyclingRules.js, the road
 * in render/road.js).
 *
 * Controls: pedal with the two big pads, left and right in turn: the one to
 * press next is green (the same foot twice is a missed stroke: ✕). The small
 * blue buttons above them shift: − easier, + harder. Hold both pads to tuck
 * (no pedalling, less drag: for the descent). In the last stretch both pads
 * turn orange: press both to throw the bike at the line. Keyboard: ← → to
 * pedal, ↑ ↓ to shift, hold Space to tuck (and to throw).
 *
 * The pedal meter over the gears says how fast the pedals are going round
 * (the needle) against your rhythm (the yellow tick): keep the needle in the
 * green. SHIFT UP / SHIFT DOWN / TUCK! prompt you when it isn't.
 *
 * States: 'waiting' (tap to start) → 'count' (3, 2, 1 on the ramp) → 'ride'
 * → 'finished' (crossed the line) → the results.
 */
export class TimeTrial {
  constructor(ev) {
    this.ev = ev;
    this.cfg = CONFIG.cycling;
    this.level = getSpecialLevel(); // Special Events' RIVALS toggle
    this.wantsReleases = true; // holding both pads tucks
  }

  enter() {
    const cfg = this.cfg;
    this.road = buildCourse(cfg.course);
    this.track = new RoadRenderer(this.road, VENUES[this.level]); // out in the country, but at the level's time of day
    const me = chosenPlayer(this.ev.id);
    this.player = { name: me.name, colors: me.colors, isPlayer: true, bike: new Bike(cfg, this.road), mark: null, checks: [] };
    this.rivals = shuffle(rivalRoster(this.ev.id))
      .slice(0, 5)
      .map((c) => {
        const bike = new Bike(cfg, this.road);
        return { name: c.name, colors: c.colors, isPlayer: false, bike, ai: new BikeAI(bike, cfg.ai[this.level]), mark: null, checks: [] };
      });
    this.riders = [this.player, ...this.rivals];
    this.cam = { x: 2, h: 0 };
    this.held = new Map(); // finger id (or 'Space') -> 'L' | 'R' | 'BOTH': what's held down
    this.bothSince = null;
    this.missT = -Infinity;
    this.missSide = null;
    this.shiftFlash = { '-1': -Infinity, '1': -Infinity };
    this.note = null; // { text, sub, color, t0 }: a time check
    this.topSpeed = 0;
    this.exitBtn = { x: 0, y: 0, w: 44, h: 40 };
    this.onResize(this.game.view);
    this.setState('waiting');
  }

  onResize(view) {
    const r = 58;
    const inset = 24;
    this.pads = {
      L: { x: view.safe.l + inset + r, y: view.h * 0.72, r },
      R: { x: view.w - view.safe.r - inset - r, y: view.h * 0.72, r },
    };
    const sr = 36;
    this.shifters = {
      '-1': { x: this.pads.L.x + 4, y: view.h * 0.4, r: sr },
      1: { x: this.pads.R.x - 4, y: view.h * 0.4, r: sr },
    };
    this.exitBtn.x = 10 + view.safe.l;
    this.exitBtn.y = 8 + view.safe.t;
  }

  setState(s) {
    this.state = s;
    this.stateT = this.game.time;
  }

  get bike() {
    return this.player.bike;
  }

  get raceTime() {
    return this.state === 'ride' || this.state === 'finished' ? Math.max(0, this.game.time - this.goT) : 0;
  }

  /** In the last stretch: both pads throw the bike instead of tucking. */
  get throwZone() {
    return this.state === 'ride' && this.road.length - this.bike.front <= this.cfg.throw.zone && this.bike.throwT == null;
  }

  // ---------------------------------------------------------------- input

  update(dt, t) {
    const end = t + dt;
    for (const e of this.game.input.consume(end)) {
      if (e.type === 'down' && this.hitExit(e)) return flow.menu(this.game);
      if (e.type === 'key' && e.code === 'Escape') return flow.menu(this.game);
      if (this.state === 'waiting') {
        if (e.type === 'down' || e.code === 'Enter' || e.code === 'Space' || LEFT_KEYS.includes(e.code) || RIGHT_KEYS.includes(e.code)) this.startCount(e.t);
        continue;
      }
      if (e.type === 'up' || e.type === 'keyup') {
        this.held.delete(e.type === 'up' ? e.id : e.code);
        continue;
      }
      if (this.state !== 'ride') continue; // nothing counts on the ramp (no false starts) or after the line
      this.press(e);
    }
    if (this.state === 'count' && end >= this.goT) this.go();
    if (this.state === 'ride' || this.state === 'finished') this.simulate(dt, t);
    else this.cam.h = this.road.heightAt(this.bike.x);
  }

  press(e) {
    const t = e.t;
    const b = this.bike;
    if (e.type === 'key') {
      if (LEFT_KEYS.includes(e.code)) this.pedal('L', t);
      else if (RIGHT_KEYS.includes(e.code)) this.pedal('R', t);
      else if (UP_KEYS.includes(e.code)) this.shift(1, t);
      else if (DOWN_KEYS.includes(e.code)) this.shift(-1, t);
      else if (e.code === 'Space') {
        if (this.throwZone) b.throwBike();
        else this.held.set('Space', 'BOTH');
      }
      return;
    }
    // A shifter, if the touch is on one (they're small: a little slack around them).
    for (const [dir, s] of Object.entries(this.shifters)) {
      if (Math.hypot(e.x - s.x, e.y - s.y) <= s.r + 14) return this.shift(Number(dir), t);
    }
    const side = e.x < this.game.view.w / 2 ? 'L' : 'R';
    this.held.set(e.id, side);
    const both = this.bothHeld();
    if (both && this.throwZone) {
      b.throwBike();
      return;
    }
    if (!both) this.pedal(side, t);
  }

  pedal(side, t) {
    if (this.bike.tuck) return;
    const res = this.bike.stroke(side, t);
    if (res === 'wrong') {
      this.missSide = side;
      this.missT = t;
      navigator.vibrate?.(30);
    }
  }

  shift(dir, t) {
    if (this.bike.shift(dir)) this.shiftFlash[dir] = t;
  }

  bothHeld() {
    const sides = new Set(this.held.values());
    return sides.has('BOTH') || (sides.has('L') && sides.has('R'));
  }

  // ---------------------------------------------------------------- the race

  startCount(t) {
    this.goT = t + this.cfg.countdown;
    this.setState('count');
  }

  go() {
    this.setState('ride');
    this.stateT = this.goT;
    for (const r of this.riders) {
      if (r.ai) r.ai.go(this.goT);
      else r.bike.start(this.goT);
    }
    this.game.input.resetStats();
  }

  simulate(dt, t) {
    const end = t + dt;
    const b = this.bike;
    // Both thumbs held a moment: tuck (not in the throw zone, and not once you're over the line).
    if (this.bothHeld() && this.state === 'ride' && b.throwT == null) {
      this.bothSince ??= t;
      b.tuck = end - this.bothSince >= this.cfg.tuckHold;
    } else {
      this.bothSince = null;
      b.tuck = false;
    }
    for (const r of this.riders) {
      r.ai?.update(t, dt);
      r.bike.update(dt, t);
      this.passChecks(r, t, dt);
      const cross = r.mark == null ? r.bike.crossing(this.road.length, t, dt) : null;
      if (cross != null) {
        r.mark = cross - this.goT;
        r.bike.finished = true;
        r.bike.tuck = false;
        if (r.isPlayer) this.setState('finished');
      }
    }
    this.topSpeed = Math.max(this.topSpeed, b.v);
    if (this.state === 'ride' && end - this.goT > this.cfg.maxTime) {
      b.finished = true;
      this.setState('finished');
    }
    this.cam.x = damp(this.cam.x, b.x + 2, 6, dt);
    this.cam.h = damp(this.cam.h, this.road.heightAt(b.x), 5, dt);
    if (this.state === 'finished' && end - this.stateT >= this.cfg.finishHold) this.finish();
  }

  /** Each time check a rider passes: when. Yours comes up against the fastest through it so far. */
  passChecks(r, t, dt) {
    const bk = r.bike;
    this.road.checks.forEach((x, i) => {
      if (r.checks[i] != null || bk.prevX >= x || bk.x < x) return;
      const at = t + (dt * (x - bk.prevX)) / Math.max(1e-6, bk.x - bk.prevX) - this.goT;
      r.checks[i] = at;
      if (!r.isPlayer) return;
      const ahead = this.rivals.filter((o) => o.checks[i] != null && o.checks[i] < at).sort((a, b) => a.checks[i] - b.checks[i]);
      this.note = ahead.length
        ? { text: `TIME CHECK ${i + 1} · ${at.toFixed(2)}`, sub: `+${(at - ahead[0].checks[i]).toFixed(2)} on ${ahead[0].name}`, color: '#ff8a5c', t0: this.game.time }
        : { text: `TIME CHECK ${i + 1} · ${at.toFixed(2)}`, sub: 'FASTEST', color: '#59cd90', t0: this.game.time };
    });
  }

  /** The results: rivals still on the road are ridden out to the line first. */
  finish() {
    const step = CONFIG.loop.fixedStep;
    let t = this.game.time;
    for (let guard = 0; this.rivals.some((r) => r.mark == null) && guard < this.cfg.maxTime / step; guard++) {
      for (const r of this.rivals) {
        if (r.mark != null) continue;
        r.ai.update(t, step);
        r.bike.update(step, t);
        const cross = r.bike.crossing(this.road.length, t, step);
        if (cross != null) r.mark = cross - this.goT;
      }
      t += step;
    }
    const results = this.riders.map((r) => ({
      name: r.name,
      colors: r.colors,
      isPlayer: r.isPlayer,
      mark: r.mark,
      status: r.mark == null ? 'dnf' : 'ok',
    }));
    results.sort((a, b) => (a.mark ?? 1e6) - (b.mark ?? 1e6));
    const b = this.bike;
    const checks = this.player.checks.map((c) => (c == null ? '—' : c.toFixed(2))).join(' / ');
    flow.results(this.game, this.ev, results, {
      hits: b.strokes,
      hitWord: 'strokes',
      misses: b.wrong,
      topSpeed: this.topSpeed,
      extra: `${b.shifts} ${b.shifts === 1 ? 'shift' : 'shifts'}`,
      paceText: `checks ${checks}`,
    });
  }

  hitExit(e) {
    const x = this.exitBtn;
    return e.x >= x.x && e.x <= x.x + x.w && e.y >= x.y && e.y <= x.y + x.h;
  }

  // ---------------------------------------------------------------- drawing

  render(ctx, view) {
    this.track.draw(ctx, view, this.cam);
    const H = CONFIG.figure.height * ROAD.ppm;
    // Ghosts first (see-through, named), then you.
    this.rivals.forEach((r, i) => this.drawRider(ctx, view, r, H, i));
    this.drawRider(ctx, view, this.player, H, null);
    this.drawHUD(ctx, view);
    this.drawControls(ctx, view);
    this.drawBanner(ctx, view);
  }

  /** A rider where they are on the road; a rival (`ghost` = their index) see-through, named (tags staggered so a bunch can be read). */
  drawRider(ctx, view, r, H, ghost) {
    const b = r.bike;
    const p = this.track.ground(this.cam, view, b.x);
    if (p.x < -120 || p.x > view.w + 120) return;
    const tall = heightOf(r.colors);
    ctx.save();
    if (ghost != null) ctx.globalAlpha = 0.42;
    drawCyclist(ctx, p.x, p.y, H * tall, this.track.slope(b.x), { crank: b.crank, wheel: b.wheel, tuck: b.tuck, reach: b.reach }, r.colors);
    ctx.restore();
    if (ghost != null) text(ctx, r.name, p.x, p.y - 1.6 * ROAD.ppm * tall - (ghost % 3) * 15, { size: 13, color: 'rgba(255,255,255,0.8)', shadow: true });
  }

  drawHUD(ctx, view) {
    const s = view.safe;
    const b = this.bike;
    // Exit.
    const x = this.exitBtn;
    roundRect(ctx, x.x, x.y, x.w, x.h, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    text(ctx, '✕', x.x + x.w / 2, x.y + x.h / 2 + 1, { size: 20 });
    // Clock, speed and gradient (top right).
    const rx = view.w - 16 - s.r;
    text(ctx, (this.player.mark ?? this.raceTime).toFixed(2), rx, 34 + s.t, { size: 40, align: 'right', shadow: true });
    text(ctx, `${(b.v * 3.6).toFixed(0)} km/h`, rx, 70 + s.t, { size: 17, align: 'right', shadow: true });
    const g = Math.round(b.grade * 100);
    text(ctx, `${g > 0 ? '▲' : g < 0 ? '▼' : '▶'} ${Math.abs(g)}%`, rx, 92 + s.t, { size: 15, align: 'right', color: g > 3 ? '#ffb27a' : g < -3 ? '#8fd4ff' : '#fff', shadow: true });
    this.drawProfile(ctx, view);
    this.drawGears(ctx, view);
  }

  /** The course from above the race: its climbs and drops, where everyone is, the time checks and the finish. */
  drawProfile(ctx, view) {
    const w = Math.min(420, view.w - 380);
    const h = 44;
    const x0 = view.w / 2 - w / 2;
    const y0 = 12 + view.safe.t;
    const road = this.road;
    const span = Math.max(1, road.top - road.bottom);
    const X = (m) => x0 + 8 + ((w - 16) * m) / road.length;
    const Y = (m) => y0 + h - 8 - ((h - 16) * (road.heightAt(m) - road.bottom)) / span;
    roundRect(ctx, x0, y0, w, h, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.moveTo(X(0), y0 + h - 6);
    for (let m = 0; m <= road.length; m += 5) ctx.lineTo(X(m), Y(m));
    ctx.lineTo(X(road.length), y0 + h - 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let m = 0; m <= road.length; m += 5) (m ? ctx.lineTo(X(m), Y(m)) : ctx.moveTo(X(m), Y(m)));
    ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    for (const c of road.checks) ctx.fillRect(X(c) - 1, y0 + 6, 2, h - 12);
    text(ctx, '🏁', X(road.length) - 2, y0 + 12, { size: 13 });
    for (const r of this.rivals) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(X(clamp(r.bike.x, 0, road.length)), Y(r.bike.x), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = this.player.colors.shirt;
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.arc(X(clamp(this.bike.x, 0, road.length)), Y(this.bike.x), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  /**
   * Bottom middle: the pedal meter (the needle is how fast the pedals turn, the
   * yellow tick your rhythm; keep the needle in the green) over the gears.
   */
  drawGears(ctx, view) {
    const cfg = this.cfg;
    const b = this.bike;
    const n = cfg.gears.length;
    const bw = 26;
    const gap = 5;
    const w = n * bw + (n - 1) * gap;
    const x0 = view.w / 2 - w / 2;
    const y = view.h - 46 - view.safe.b;
    // Meter.
    const my = y - 30;
    const maxC = 7;
    const X = (c) => x0 + (w * clamp(c, 0, maxC)) / maxC;
    roundRect(ctx, x0, my, w, 12, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();
    ctx.fillStyle = 'rgba(89,205,144,0.85)';
    ctx.fillRect(X(cfg.band[0]), my + 1, X(cfg.band[1]) - X(cfg.band[0]), 10);
    const tap = b.tapCadence(this.game.time);
    if (tap > 0) {
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(X(tap) - 1.5, my - 4, 3, 20);
    }
    const nx = X(b.pedalCadence);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(nx, my + 11);
    ctx.lineTo(nx - 7, my + 24);
    ctx.lineTo(nx + 7, my + 24);
    ctx.closePath();
    ctx.fill();
    text(ctx, 'PEDALS', x0 - 8, my + 6, { size: 12, align: 'right', color: 'rgba(255,255,255,0.75)', shadow: true });
    // Gears.
    for (let i = 0; i < n; i++) {
      const gx = x0 + i * (bw + gap);
      roundRect(ctx, gx, y, bw, 26, 6);
      ctx.fillStyle = i === b.gear ? '#2f80ff' : 'rgba(0,0,0,0.45)';
      ctx.fill();
      text(ctx, String(i + 1), gx + bw / 2, y + 14, { size: 15, color: i === b.gear ? '#fff' : 'rgba(255,255,255,0.6)' });
    }
    text(ctx, 'GEAR', x0 - 8, y + 14, { size: 12, align: 'right', color: 'rgba(255,255,255,0.75)', shadow: true });
    const hint = this.hint();
    if (hint) text(ctx, hint.text, view.w / 2, my - 24, { size: 20, weight: 900, color: hint.color, shadow: true });
  }

  /** What to do about the pedals right now, if anything. */
  hint() {
    if (this.state !== 'ride') return null;
    const b = this.bike;
    const cfg = this.cfg;
    const blink = Math.floor(this.game.time * 4) % 2 === 0;
    if (this.throwZone) return blink ? { text: 'THROW THE BIKE: BOTH!', color: '#ff9d1c' } : null;
    if (b.tuck) return { text: 'TUCKED', color: '#8fd4ff' };
    if (b.v < 3) return null; // getting going
    const c = b.pedalCadence;
    const top = b.gear === cfg.gears.length - 1;
    if (b.grade < -0.03 && top && b.pushing === 0) return blink ? { text: 'TUCK! HOLD BOTH', color: '#8fd4ff' } : null;
    if (c > cfg.band[1] && !top) return { text: 'SHIFT UP ▶', color: '#fff' };
    if (c < cfg.band[0] - 0.3 && b.gear > 0) return { text: '◀ SHIFT DOWN', color: '#ffb27a' };
    return null;
  }

  drawControls(ctx, view) {
    if (this.state === 'waiting' || this.state === 'finished') return;
    const b = this.bike;
    const now = this.game.time;
    const both = this.throwZone || b.tuck;
    for (const side of ['L', 'R']) {
      const p = this.pads[side];
      // Next foot green; tucked (or the throw coming up) both orange.
      const pal = both ? ORANGE : this.state === 'ride' && b.lastSide !== side ? GREEN : GREY;
      drawPad(ctx, pal, p.x, p.y, p.r);
      text(ctx, side === 'L' ? 'L' : 'R', p.x, p.y + 2, { size: 24, weight: 900, color: 'rgba(255,255,255,0.85)' });
      if (now - this.missT < 0.25 && this.missSide === side) drawX(ctx, p.x, p.y);
    }
    for (const [dir, s] of Object.entries(this.shifters)) {
      const flash = now - this.shiftFlash[dir] < 0.15;
      drawPad(ctx, SHIFT, s.x, s.y, s.r * (flash ? 0.9 : 1));
      text(ctx, dir === '1' ? '+' : '−', s.x, s.y + 1, { size: 30, weight: 900, color: '#fff' });
      text(ctx, dir === '1' ? 'HARDER' : 'EASIER', s.x, s.y + s.r + 14, { size: 12, weight: 800, color: '#fff', shadow: true });
    }
  }

  drawBanner(ctx, view) {
    const cx = view.w / 2;
    const cy = 150;
    const now = this.game.time;
    if (this.state === 'waiting') {
      text(ctx, 'Tap to start', cx, cy, { size: 40, shadow: true });
      text(ctx, 'Pedal left, right, left… shift with − and +', cx, cy + 40, { size: 18, weight: 600, color: 'rgba(255,255,255,0.85)', shadow: true });
    } else if (this.state === 'count') {
      text(ctx, String(Math.max(1, Math.ceil(this.goT - now))), cx, cy, { size: 72, color: '#fff', shadow: true });
    } else if (this.state === 'ride' && now - this.goT < 0.8) {
      text(ctx, 'GO!', cx, cy, { size: 72, color: '#59cd90', shadow: true });
    } else if (this.state === 'finished') {
      const place = this.riders.filter((r) => r.mark != null && this.player.mark != null && r.mark <= this.player.mark).length;
      text(ctx, this.player.mark == null ? 'TIME!' : place === 1 ? 'FASTEST!' : 'FINISH', cx, cy, { size: 64, color: place === 1 ? '#ffb400' : '#fff', shadow: true });
    }
    const n = this.note;
    if (n && now - n.t0 < 2.4 && this.state === 'ride') {
      text(ctx, n.text, cx, cy - 20, { size: 30, color: '#fff', shadow: true });
      text(ctx, n.sub, cx, cy + 14, { size: 26, weight: 900, color: n.color, shadow: true });
    }
  }
}
