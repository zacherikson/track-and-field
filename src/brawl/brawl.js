import { CONFIG } from '../config.js';
import { clamp, damp, rand } from '../core/math.js';
import { text } from '../core/ui.js';
import { drawFigure, handPos, headCircle } from '../athletes/stickFigure.js';
import { Fighter, WALK, INVULN } from './fighter.js';
import { PUNCH, KICK, SLAM, EMOTES } from './poses.js';
import { wound, drawWounds } from './wounds.js';

/**
 * LATE HITS: once an event is over, everyone who took part hangs around where
 * it finished (past the finish line, round the pit) and you can walk up to
 * them and punch, kick, body slam them, or emote. Nothing here counts for
 * anything: it's for fun while you wait for the next event.
 *
 * The Brawl is the world: the athletes (fighter.js), who hit whom, the
 * wounds, the POW!s and the blood, drawn on the event's own venue (venue.js).
 * What moves each athlete comes from outside: your controls (controls.js),
 * the computer rivals' brains (bots.js), or another phone (liveBrawl.js).
 *
 * Hits are decided by the attacker's side: your punches here, a bot's here,
 * another player's on their phone (they arrive through liveBrawl.js and are
 * applied with applyHit).
 */
const DEPTH_REACH = 0.6; // m across the track that a hit still connects
const SPACE = { x: 0.42, d: 0.3 }; // how close two athletes stand before they push apart
const COMBO = { count: 3, within: 1.5 }; // this many punches in this many seconds knock you down

export class Brawl {
  /**
   * @param venue   where it happens (venue.js)
   * @param people  [{ id, scarKey, name, colors, x, d, facing, isMe, remote, wounds }]
   */
  constructor(venue, people) {
    this.venue = venue;
    this.fighters = people.map((p) => new Fighter(p));
    this.me = this.fighters.find((f) => f.isMe) ?? null;
    this.pops = []; // POW! WHAM! SLAM! { text, x, d, h, t0, color }
    this.drops = []; // flying blood: { x, d, h, vx, vd, vh }
    this.splats = []; // blood on the ground: { x, d, r }
    this.shake = 0; // s of screen shake left
    this.onHit = null; // (attacker, victim, kind, seed) for each hit decided here (liveBrawl sends them on)
    this.onChange = null; // (fighter) when your athlete starts a new move (liveBrawl sends it at once)
    this.t = 0;
  }

  byId(id) {
    return this.fighters.find((f) => f.id === id) ?? null;
  }

  /** Adds an athlete (someone done with the event, or a live player arriving). */
  add(p) {
    const f = new Fighter(p);
    this.fighters.push(f);
    return f;
  }

  remove(f) {
    this.fighters = this.fighters.filter((g) => g !== f);
    for (const g of this.fighters) {
      if (g.grabbed === f) g.grabbed = null;
      if (g.holder === f) {
        g.holder = null;
        this.setState(g, 'fly', this.t);
      }
    }
  }

  setState(f, state, t, variant) {
    f.set(state, t, variant);
    if (f.isMe) this.onChange?.(f);
  }

  // ---------------------------------------------------------------- moves

  /** `f` tries a move: 'punch', 'kick', 'slam' or 'emote' (with `variant` = the emote's id). True if it started. */
  command(f, move, t, variant) {
    if (!f.free) return false;
    if (move === 'emote') {
      this.setState(f, 'emote', t, variant);
      return true;
    }
    // A little help aiming: turn to (and line up with) the nearest athlete in range.
    const reach = move === 'kick' ? KICK.reach : move === 'slam' ? SLAM.reach : PUNCH.reach;
    let best = null;
    let bestD = Infinity;
    for (const v of this.fighters) {
      if (v === f || !v.vulnerable(t)) continue;
      const dx = Math.abs(v.x - f.x);
      const dd = Math.abs(v.d - f.d);
      if (dx > reach + 0.9 || dd > DEPTH_REACH + 0.35) continue;
      const score = dx + 2 * dd;
      if (score < bestD) [best, bestD] = [v, score];
    }
    if (best) {
      if (Math.abs(best.x - f.x) > 0.05) f.facing = Math.sign(best.x - f.x);
      f.d += clamp(best.d - f.d, -0.3, 0.3);
    }
    if (move === 'punch') f.punchArm = 1 - (f.punchArm ?? 1); // jab, cross, jab...
    this.setState(f, move, t, move === 'punch' ? f.punchArm : 0);
    f.grabbed = null;
    return true;
  }

  /** Who `a`'s attack with this reach would hit now, if anyone. */
  target(a, reach, t) {
    let best = null;
    let bestD = Infinity;
    for (const v of this.fighters) {
      if (v === a || !v.vulnerable(t)) continue;
      if (a.brain && !v.isMe) continue; // a computer rival only ever hits you
      const dx = (v.x - a.x) * a.facing;
      const dd = Math.abs(v.d - a.d);
      if (dx < -0.15 || dx > reach + 0.1 || dd > DEPTH_REACH) continue;
      const score = Math.abs(dx) + dd;
      if (score < bestD) [best, bestD] = [v, score];
    }
    return best;
  }

  /**
   * `a` hits `v` with `kind` (punch, kick, slam). `seed` picks the wound, the
   * same on every phone. Decided here or on the attacker's phone.
   */
  applyHit(a, v, kind, t, seed = (Math.random() * 2 ** 32) >>> 0) {
    // Hit while holding someone up: you drop them.
    if (v.grabbed) {
      const g = v.grabbed;
      v.grabbed = null;
      if (g.holder === v) {
        g.holder = null;
        g.vx = 0;
        this.setState(g, 'fly', t);
      }
    }
    if (v.state === 'emote' || v.free) v.facing = -a.facing;
    let shown = kind;
    if (kind === 'punch') {
      v.punches = v.punches.filter((p) => t - p < COMBO.within);
      v.punches.push(t);
      if (v.punches.length >= COMBO.count) {
        // The third punch in a row puts them down.
        v.punches = [];
        this.setState(v, 'fly', t);
        v.vx = a.facing * 2.6;
        shown = 'combo';
      } else {
        this.setState(v, 'hurt', t);
        v.vx = a.facing * 2.4;
      }
    } else if (kind === 'kick') {
      this.setState(v, 'fly', t);
      v.vx = a.facing * 3.4;
    } else if (kind === 'slam') {
      a.grabbed = v;
      v.holder = a;
      v.dropSeed = seed;
      v.facing = a.facing;
      v.vx = 0;
      this.setState(v, 'held', t);
    }
    v.vd = 0;
    if (kind !== 'slam') {
      const w = wound(v.wounds, kind, seed);
      this.bleed(v, w && w.type !== 'bruise' && w.type !== 'eye' ? 4 : 1, a.facing);
    }
    const word = { punch: 'POW!', combo: 'KO!', kick: 'WHAM!', slam: 'GOTCHA!' }[shown];
    this.pop(word, v, shown === 'combo' ? '#ff4b3e' : '#ffd23f');
    if (a.isMe || v.isMe) this.shake = Math.max(this.shake, kind === 'punch' ? 0.12 : 0.2);
    if (v.isMe) navigator.vibrate?.(kind === 'punch' ? 40 : 80);
    else if (a.isMe) navigator.vibrate?.(20);
    // The computer rivals only fight once you've started it, and gloat when they put you down (bots.js).
    if (a.isMe) v.brain?.provoked(a, t);
    if (v.isMe && v.floored) a.brain?.beatYou();
    if (!a.remote) this.onHit?.(a, v, kind, seed);
  }

  /** A held athlete hits the ground in front of whoever slammed them. */
  land(v, t) {
    const a = v.holder;
    v.holder = null;
    if (a) {
      v.x = a.x + a.facing * 0.95;
      v.d = a.d;
      if (a.grabbed === v) a.grabbed = null;
    }
    v.vx = 0;
    this.setState(v, 'down', t);
    wound(v.wounds, 'slam', v.dropSeed);
    this.bleed(v, 4, a?.facing ?? 1, 0.2);
    this.pop('SLAM!', v, '#ff7a1a', 0.9);
    if (v.isMe || a?.isMe) this.shake = Math.max(this.shake, 0.3);
    if (v.isMe) navigator.vibrate?.(120);
  }

  pop(word, v, color, h = 2.0) {
    this.pops.push({ text: word, x: v.x, d: v.d, h: h * v.tall, t0: this.t, color });
  }

  /** A few drops of blood from `v`'s head, flying away from the hit. */
  bleed(v, n, dir, h = 1.6) {
    for (let i = 0; i < n; i++) {
      this.drops.push({ x: v.x, d: v.d, h: h * v.tall, vx: dir * rand(0.6, 2.4), vd: rand(-0.5, 0.5), vh: rand(0.5, 2.6), r: rand(0.8, 1.6) });
    }
  }

  // ---------------------------------------------------------------- simulation

  update(dt, t) {
    this.t = t;
    const v = this.venue;
    for (const f of this.fighters) {
      f.updateGuard(dt, t);
      this.advance(f, t);
      if (f.remote) this.follow(f, dt);
      else this.move(f, dt, t);
      if (!f.remote) this.strike(f, t);
    }
    this.separate();
    for (const f of this.fighters) {
      if (f.holder) continue;
      // Someone walking over from off screen is let in from outside the ground.
      if (f.entering && f.x > v.xMin && f.x < v.xMax) f.entering = false;
      if (!f.entering) f.x = clamp(f.x, v.xMin, v.xMax);
      f.d = clamp(f.d, v.dMin, v.dMax);
    }
    // Blood: flies, falls, and stays where it lands.
    for (const p of this.drops) {
      p.x += p.vx * dt;
      p.d += p.vd * dt;
      p.h += p.vh * dt;
      p.vh -= 9.8 * dt;
    }
    for (const p of this.drops) if (p.h <= 0) this.splats.push({ x: p.x, d: p.d, r: p.r });
    this.drops = this.drops.filter((p) => p.h > 0);
    if (this.splats.length > 40) this.splats.splice(0, this.splats.length - 40);
    this.pops = this.pops.filter((p) => t - p.t0 < 0.8);
    this.shake = Math.max(0, this.shake - dt);
    if (this.me) v.follow(this.me.x, dt);
  }

  /** Moves that end by themselves. */
  advance(f, t) {
    const u = t - f.st;
    if (u < f.duration()) return;
    switch (f.state) {
      case 'fly':
        f.vx = 0;
        this.setState(f, 'down', t);
        break;
      case 'down':
        this.setState(f, 'getup', t);
        break;
      case 'getup':
        f.invulnUntil = t + INVULN;
        this.setState(f, 'idle', t);
        break;
      case 'held':
        this.land(f, t);
        break;
      case 'slam':
        f.grabbed = null;
        this.setState(f, 'idle', t);
        break;
      case 'idle':
      case 'walk':
        break;
      default:
        this.setState(f, 'idle', t);
    }
  }

  /** Your athlete and the bots: walk where the stick says, and slide from knockback. */
  move(f, dt, t) {
    if (f.holder) return;
    const mag = Math.min(1, Math.hypot(f.mx, f.md));
    if (f.free) {
      if (mag > 0.15) {
        if (f.state !== 'walk') this.setState(f, 'walk', t);
        f.x += f.mx * WALK.x * dt;
        f.d += f.md * WALK.d * dt;
        if (Math.abs(f.mx) > 0.25) f.facing = Math.sign(f.mx);
        f.phase += (mag * WALK.x / 1.3) * Math.PI * dt;
      } else if (f.state === 'walk') this.setState(f, 'idle', t);
    }
    f.x += f.vx * dt;
    f.d += f.vd * dt;
    if (f.state !== 'fly') {
      f.vx = damp(f.vx, 0, 7, dt);
      f.vd = damp(f.vd, 0, 7, dt);
    }
  }

  /** Another player: glide to where their phone last said they were. */
  follow(f, dt) {
    if (!f.net || f.holder) return;
    if (f.arriving) {
      // Just turned up from where they were here: walk over to where their phone has them.
      const dx = f.net.x - f.x;
      const dd = f.net.d - f.d;
      const m = Math.hypot(dx, dd);
      const step = WALK.x * 0.8 * dt;
      if (m <= step || !f.free) {
        f.arriving = false;
        f.mx = f.md = 0;
        if (f.state === 'walk') f.state = 'idle';
      } else {
        f.x += (dx / m) * step;
        f.d += (dd / m) * step;
        f.mx = dx / m;
        f.md = dd / m;
        f.state = 'walk';
        if (Math.abs(dx) > 0.05) f.facing = Math.sign(dx);
        f.phase += (WALK.x * 0.8 / 1.3) * Math.PI * dt;
        return;
      }
    }
    const k = 1 - Math.exp(-12 * dt);
    f.x += (f.net.x - f.x) * k;
    f.d += (f.net.d - f.d) * k;
    if (f.state === 'walk' || f.state === 'idle') f.phase += Math.min(1, Math.abs(f.net.x - f.x) * 4) * 6 * dt;
  }

  /** An attack's moment of contact: see if it lands. */
  strike(a, t) {
    const u = t - a.st;
    if (a.hitDone) return;
    if (a.state === 'punch' && u >= PUNCH.hitFrom) {
      if (u > PUNCH.hitTo) return void (a.hitDone = true);
      const v = this.target(a, PUNCH.reach, t);
      if (v) {
        a.hitDone = true;
        this.applyHit(a, v, 'punch', t);
      }
    } else if (a.state === 'kick' && u >= KICK.hitFrom) {
      if (u > KICK.hitTo) return void (a.hitDone = true);
      const v = this.target(a, KICK.reach, t);
      if (v) {
        a.hitDone = true;
        this.applyHit(a, v, 'kick', t);
      }
    } else if (a.state === 'slam' && u >= SLAM.grab) {
      a.hitDone = true;
      const v = this.target(a, SLAM.reach, t);
      if (v) this.applyHit(a, v, 'slam', t);
    }
  }

  /** Athletes standing too close step apart. */
  separate() {
    const fs = this.fighters.filter((f) => !f.holder && !f.floored);
    for (let i = 0; i < fs.length; i++) {
      for (let j = i + 1; j < fs.length; j++) {
        const a = fs[i];
        const b = fs[j];
        const dx = b.x - a.x;
        const dd = b.d - a.d;
        if (Math.abs(dx) >= SPACE.x || Math.abs(dd) >= SPACE.d) continue;
        const push = (SPACE.x - Math.abs(dx)) * 0.5;
        const s = dx === 0 ? (a.isMe ? -1 : 1) : Math.sign(dx);
        if (!a.remote) a.x -= s * push;
        if (!b.remote) b.x += s * push;
      }
    }
  }

  // ---------------------------------------------------------------- drawing

  /**
   * Draws it all. `extras` are other things standing in the venue, drawn in
   * depth order with the athletes: [{ d, draw(ctx) }] (the event's athletes
   * who are still finishing).
   */
  render(ctx, view, extras = []) {
    const v = this.venue;
    const t = this.t;
    ctx.save();
    if (this.shake > 0) ctx.translate(rand(-5, 5) * this.shake * 5, rand(-4, 4) * this.shake * 5);
    v.draw(ctx, view);
    for (const s of this.splats) {
      const p = v.screen(view, s.x, s.d);
      ctx.fillStyle = 'rgba(150,12,18,0.75)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 2, s.r * 0.05 * p.px, s.r * 0.018 * p.px, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Far to near; someone held up is drawn with whoever's holding them.
    const order = [...this.fighters.filter((f) => !f.holder), ...extras].sort((a, b) => b.d - a.d);
    for (const f of order) {
      if (f.draw) {
        f.draw(ctx);
        continue;
      }
      this.drawFighter(ctx, view, f, t);
      if (f.grabbed?.holder === f) this.drawHeld(ctx, view, f.grabbed, f, t);
    }
    for (const p of this.drops) {
      const s = v.screen(view, p.x, p.d);
      ctx.fillStyle = '#c4161c';
      ctx.beginPath();
      ctx.arc(s.x, s.y - p.h * s.px, Math.max(1.5, p.r * 0.022 * s.px), 0, Math.PI * 2);
      ctx.fill();
    }
    v.drawFront?.(ctx, view);
    for (const p of this.pops) {
      const s = v.screen(view, p.x, p.d);
      const k = (t - p.t0) / 0.8;
      const size = Math.round(34 * (0.7 + 0.5 * Math.min(1, k * 6)) * (s.px / CONFIG.world.pixelsPerMeter));
      ctx.save();
      ctx.globalAlpha = 1 - Math.max(0, k - 0.6) / 0.4;
      text(ctx, p.text, s.x, s.y - p.h * s.px - k * 30, { size: Math.max(18, size), color: p.color, shadow: true, weight: 900 });
      ctx.restore();
    }
    ctx.restore();
  }

  /** Screen spot, size and pose of an athlete standing on their own feet. */
  place(view, f, t) {
    const s = this.venue.screen(view, f.x, f.d);
    const H = CONFIG.figure.height * s.px * f.tall;
    const floor = this.venue.floorAt(f.x, f.d) * s.px;
    const ground = s.y - floor;
    return { x: s.x, ground, y: ground - f.lift(t) * s.px, H, px: s.px };
  }

  drawFighter(ctx, view, f, t) {
    const p = this.place(view, f, t);
    if (p.x < -120 || p.x > view.w + 120) return;
    const pose = f.pose(t);
    if (f.isMe) {
      // A ring round your feet, so you can find yourself in a pile-up.
      ctx.strokeStyle = 'rgba(255,210,63,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.ground + 1, 0.3 * p.H / f.tall, 0.07 * p.H / f.tall, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const blink = t < f.invulnUntil && Math.floor(t * 12) % 2 === 0;
    ctx.save();
    if (blink) ctx.globalAlpha = 0.45;
    drawFigure(ctx, p.x, p.y, p.H, f.facing < 0 ? { ...pose, flip: true } : pose, f.colors, p.ground);
    drawWounds(ctx, p.x, p.y, p.H, pose, f.wounds, f.facing);
    ctx.restore();
    const head = headCircle(0, p.y, p.H, pose);
    const hx = p.x + head.x * f.facing;
    if (f.state === 'down' || (f.state === 'getup' && t - f.st < 0.3)) this.drawStars(ctx, hx, head.y, head.r, t);
    if (f.state === 'emote') {
      const u = t - f.st;
      const e = EMOTES.find((x) => x.id === f.variant);
      const top = p.y - p.H * 1.08;
      if (e && u < 1.6) text(ctx, e.icon, p.x, top - 14 - Math.min(u, 0.2) * 40, { size: 30, shadow: false });
      if (f.variant === 'laugh') text(ctx, 'HA HA!', hx + 26 * f.facing, head.y - head.r * 2 - 4 * Math.sin(u * 20), { size: 15, color: '#fff', shadow: true, weight: 900 });
      if (f.variant === 'chicken' && Math.floor(u * 3) % 2 === 0) text(ctx, 'BAWK!', hx + 24 * f.facing, head.y - head.r * 2.2, { size: 14, color: '#fff', shadow: true, weight: 900 });
    }
    if (!f.isMe) {
      const top = p.y - p.H * (f.floored || f.state === 'getup' ? 0.35 : 1.05);
      ctx.globalAlpha = Math.min(1, (t - (f.bornT ?? -1)) / 0.6); // name tags fade in as people join
      text(ctx, f.name, p.x, top - 8, { size: 13, color: f.remote ? '#ffb400' : 'rgba(255,255,255,0.85)', shadow: true });
      ctx.globalAlpha = 1;
    }
  }

  /** Someone held up over `a`'s head in a slam. */
  drawHeld(ctx, view, f, a, t) {
    const pa = this.place(view, a, t);
    const apose = a.pose(t);
    const flipA = a.facing < 0 ? { ...apose, flip: true } : apose;
    const h0 = handPos(pa.x, pa.y, pa.H, flipA, 0);
    const h1 = handPos(pa.x, pa.y, pa.H, flipA, 1);
    const hx = (h0.x + h1.x) / 2;
    const hy = Math.min(h0.y, h1.y);
    const H = CONFIG.figure.height * pa.px * f.tall;
    const pose = f.pose(t);
    const y = hy - 0.03 * H - pose.hipY * H; // their hips on your hands
    drawFigure(ctx, hx, y, H, f.facing < 0 ? { ...pose, flip: true } : pose, f.colors, pa.ground);
    drawWounds(ctx, hx, y, H, pose, f.wounds, f.facing);
    if (!f.isMe) text(ctx, f.name, hx, y - H * 0.75, { size: 13, color: f.remote ? '#ffb400' : 'rgba(255,255,255,0.85)', shadow: true });
  }

  /** Cartoon stars circling a knocked-down head. */
  drawStars(ctx, x, y, r, t) {
    ctx.fillStyle = '#ffd23f';
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + (i * Math.PI * 2) / 3;
      const sx = x + Math.cos(a) * r * 2;
      const sy = y - r * 1.2 + Math.sin(a) * r * 0.6;
      star(ctx, sx, sy, Math.max(3, r * 0.45));
    }
  }
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const q = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  ctx.closePath();
  ctx.fill();
}

