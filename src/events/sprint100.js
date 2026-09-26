import { CONFIG } from '../config.js';
import { clamp, rand } from '../core/math.js';
import { LaneRace } from './laneRace.js';
import { StrideTargets } from './strideTargets.js';

const LEFT_KEYS = ['ArrowLeft', 'KeyA', 'KeyZ', 'KeyF'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD', 'KeyX', 'KeyJ'];
const DIP_KEYS = ['Space', 'ArrowUp', 'ArrowDown'];

/**
 * 100m Dash controls: ONE green target at a time, on a RANDOM side, but never
 * more than two in a row on the same side (see strideTargets.js). Reading the
 * pattern, not mashing, is what makes you fast.
 *
 * - Hit zones are whole screen halves, so a thumb never "misses" physically.
 *   Tapping the unlit side is a wrong tap: red ✕, speed loss, short lockout
 *   (the target greys out until you can go again).
 * - Each side's target settles where that thumb last tapped (no reaching), but
 *   every appearance FLIES IN: from a slightly different angle each time, with an
 *   overshoot, a motion trail and a ring closing in on the landing spot. A hit
 *   bursts into a ring and sparks. See drawSpawn() and CONFIG.sprint100.pads.spawn.
 * - Before the gun both pads are red. In the dip zone both turn orange: press
 *   both together to dip.
 */
export class Sprint100 extends LaneRace {
  constructor(ev) {
    super(ev, CONFIG.sprint100);
  }

  enter() {
    const r = CONFIG.sprint100.pads.radius;
    this.pads = {
      L: { home: { x: 0, y: 0 }, pos: null, spawnT: -Infinity, spawnAngle: 0, r },
      R: { home: { x: 0, y: 0 }, pos: null, spawnT: -Infinity, spawnAngle: 0, r },
    };
    this.fx = []; // short-lived effects: { kind: 'ring' | 'x' | 'sparks', x, y, t0 }
    this.dipShown = false;
    super.enter();
    this.judge = new StrideTargets(this.player.runner, CONFIG.sprint100.targets);
  }

  get target() {
    return this.judge?.target ?? null;
  }

  onResize(view) {
    super.onResize(view);
    const cfg = CONFIG.sprint100.pads;
    const { L, R } = this.pads;
    const y = view.h * cfg.homeY;
    L.home = { x: view.safe.l + cfg.edgeInset + L.r, y };
    R.home = { x: view.w - view.safe.r - cfg.edgeInset - R.r, y };
    L.pos = null; // re-home after a resize
    R.pos = null;
  }

  onCountdown() {
    this.fx = [];
    this.dipShown = false;
    if (this.judge) this.judge.target = null;
    this.spawn('L');
    this.spawn('R');
  }

  onGo() {
    this.judge.start(this.goT);
    this.spawn(this.target);
  }

  /**
   * Start a pad's entrance. It flies in toward its resting spot from above and
   * the screen-center side, at a slightly random angle, so no two look alike.
   */
  spawn(side) {
    const cfg = CONFIG.sprint100.pads.spawn;
    const p = this.pads[side];
    const base = side === 'L' ? -Math.PI / 4 : (-3 * Math.PI) / 4; // up-right / up-left
    p.spawnT = this.game.time;
    p.spawnAngle = base + rand(-cfg.arc, cfg.arc);
  }

  mapInput(e) {
    if (e.type === 'down') return e.x < this.game.view.w / 2 ? 'L' : 'R';
    if (LEFT_KEYS.includes(e.code)) return 'L';
    if (RIGHT_KEYS.includes(e.code)) return 'R';
    if (DIP_KEYS.includes(e.code)) return 'DIP';
    return null;
  }

  padPos(side) {
    const p = this.pads[side];
    return p.pos ?? p.home;
  }

  /** Keep a remembered thumb spot inside that thumb's half of the screen. */
  clampToZone(side, x, y) {
    const v = this.game.view;
    const r = this.pads[side].r;
    const half = v.w / 2;
    const minX = side === 'L' ? v.safe.l + r + 6 : half + r + 10;
    const maxX = side === 'L' ? half - r - 10 : v.w - v.safe.r - r - 6;
    return { x: clamp(x, minX, maxX), y: clamp(y, 110 + r, v.h - r - 6) };
  }

  onPlayerAction(side, t, e) {
    if (side === 'DIP') return;
    const result = this.judge.press(side, t);
    const now = this.game.time;
    const touch = e.type === 'down' ? { x: e.x, y: e.y } : null;
    if (result === 'hit') {
      const at = this.padTransform(side, now);
      this.fx.push({ kind: 'ring', x: at.x, y: at.y, t0: now });
      this.fx.push({
        kind: 'sparks',
        x: at.x,
        y: at.y,
        t0: now,
        parts: Array.from({ length: 8 }, (_, i) => ({ a: (i / 8) * Math.PI * 2 + rand(-0.3, 0.3), v: rand(160, 320) })),
      });
      if (touch && CONFIG.sprint100.pads.followThumb) this.pads[side].pos = this.clampToZone(side, touch.x, touch.y);
      this.spawn(this.target); // flies in again even if it's the same side
    } else if (result === 'miss') {
      const at = touch ?? this.padPos(side);
      this.fx.push({ kind: 'x', x: at.x, y: at.y, t0: now });
      navigator.vibrate?.(40);
    }
  }

  updateControls() {
    const now = this.game.time;
    this.fx = this.fx.filter((f) => now - f.t0 < 0.4);
    if (this.state === 'race' && this.player.runner.mode === 'carry' && !this.dipShown) {
      this.dipShown = true;
      this.spawn('L');
      this.spawn('R');
    }
  }

  drawControls(ctx) {
    const now = this.game.time;
    const mode = this.player.runner.mode;
    const before = this.state === 'ready' || this.state === 'set';
    const racing = this.state === 'race';

    if (before) {
      for (const side of ['L', 'R']) this.drawSpawn(ctx, side, '#d7263d', 0.9);
    } else if (racing && mode === 'run' && this.target) {
      // Faint rings where each thumb rests; the lit side gets the green target.
      for (const side of ['L', 'R']) if (side !== this.target) this.drawGhost(ctx, side);
      const locked = now < this.judge.lockedUntil;
      this.drawSpawn(ctx, this.target, locked ? '#7d8a86' : '#2bb673', 1);
    } else if (racing && mode === 'carry') {
      const pulse = 0.5 + 0.5 * Math.sin(now * 18);
      for (const side of ['L', 'R']) this.drawSpawn(ctx, side, '#ff8c28', 0.8 + 0.2 * pulse);
    }

    for (const f of this.fx) {
      const k = (now - f.t0) / 0.4;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      if (f.kind === 'sparks') {
        const d = (now - f.t0) * (1 - k * 0.5);
        ctx.fillStyle = '#e8ffe9';
        for (const q of f.parts) {
          ctx.beginPath();
          ctx.arc(f.x + Math.cos(q.a) * q.v * d, f.y + Math.sin(q.a) * q.v * d, 4 * (1 - k) + 1, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (f.kind === 'ring') {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 5 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(f.x, f.y, this.pads.L.r * (1 + 0.6 * k), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const s = 26;
        ctx.translate(f.x + Math.sin(k * 40) * 4 * (1 - k), f.y);
        ctx.strokeStyle = '#ff3b30';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-s, -s);
        ctx.lineTo(s, s);
        ctx.moveTo(s, -s);
        ctx.lineTo(-s, s);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /**
   * Where a pad is drawn right now, including its entrance. The flight uses an
   * "ease-out-back" curve: fast start, slight overshoot past the resting spot,
   * then settle. That overshoot is what makes it feel snappy rather than linear.
   */
  padTransform(side, now) {
    const cfg = CONFIG.sprint100.pads.spawn;
    const p = this.pads[side];
    const rest = this.padPos(side);
    const k = clamp((now - p.spawnT) / cfg.duration, 0, 1);
    const at = (kk) => {
      const e = easeOutBack(kk, cfg.overshoot);
      const off = (1 - e) * cfg.distance;
      return { x: rest.x + Math.cos(p.spawnAngle) * off, y: rest.y + Math.sin(p.spawnAngle) * off };
    };
    const settled = now - p.spawnT - cfg.duration;
    const breathe = settled > 0 ? 1 + 0.025 * Math.sin(settled * 10) : 1;
    return {
      ...at(k),
      k,
      at,
      angle: p.spawnAngle,
      scale: (0.7 + 0.3 * easeOutBack(k, cfg.overshoot)) * breathe,
      stretch: 1 + 0.35 * (1 - k) * (1 - k), // squash & stretch along the flight path
      alpha: Math.min(1, 0.5 + k),
    };
  }

  /** A pad with its fly-in: motion trail, closing ring, then the pad itself. */
  drawSpawn(ctx, side, color, alpha) {
    const cfg = CONFIG.sprint100.pads.spawn;
    const now = this.game.time;
    const tf = this.padTransform(side, now);
    const r = this.pads[side].r;
    if (tf.k < 1) {
      // Motion trail: fading copies at earlier points of the flight.
      for (let i = cfg.trail; i >= 1; i--) {
        const kk = tf.k - i * 0.1;
        if (kk < 0) continue;
        const q = tf.at(kk);
        ctx.save();
        ctx.globalAlpha = alpha * 0.45 * (1 - i / (cfg.trail + 1)) * (1 - tf.k);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(q.x, q.y, r * (0.7 + 0.3 * kk), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    // Landing ring: closes in on the resting spot as the pad arrives.
    const lk = clamp((now - this.pads[side].spawnT) / (cfg.duration * 1.6), 0, 1);
    if (lk < 1) {
      const rest = this.padPos(side);
      ctx.save();
      ctx.globalAlpha = alpha * 0.8 * Math.sin(Math.PI * lk);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(rest.x, rest.y, r * (1.9 - 0.9 * lk), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    this.drawPad(ctx, color, { ...tf, r: r * tf.scale, alpha: alpha * tf.alpha });
  }

  drawPad(ctx, color, { x, y, r, alpha, angle = 0, stretch = 1 }) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    // Stretch along the flight direction, squash across it (area stays ~constant).
    ctx.rotate(angle);
    ctx.scale(stretch, 1 / stretch);
    ctx.rotate(-angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 4;
    ctx.stroke();
    // Glossy highlight so it reads as a button.
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.18, -r * 0.4, r * 0.55, r * 0.3, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Faint outline where the other thumb will go next. */
  drawGhost(ctx, side) {
    const p = this.padPos(side);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, this.pads[side].r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/** 0 -> 1 with an overshoot past 1 near the end (s controls how far). */
function easeOutBack(k, s) {
  const t = k - 1;
  return 1 + (s + 1) * t * t * t + s * t * t;
}
