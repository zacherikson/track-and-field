import { CONFIG } from '../config.js';
import { clamp, rand } from '../core/math.js';
import { LaneRace } from './laneRace.js';
import { StrideTargets } from './strideTargets.js';

// Glossy "candy" button palettes: highlight, body, and rim shade.
const GREEN = { hi: '#b6ff8a', mid: '#39e626', lo: '#0f9e1c' };
const ORANGE = { hi: '#ffe08a', mid: '#ff9d14', lo: '#d9580a' };

const LEFT_KEYS = ['ArrowLeft', 'KeyA', 'KeyZ', 'KeyF'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD', 'KeyX', 'KeyJ'];
const DIP_KEYS = ['Space', 'ArrowUp', 'ArrowDown'];

/**
 * 100m Dash controls: ONE green target at a time, on a RANDOM side, but never
 * more than two in a row on the same side (see strideTargets.js). Reading the
 * pattern, not mashing, is what makes you fast.
 *
 * - Each side's target always lands on the same spot, so your eyes and thumbs
 *   learn where to go.
 * - The circle is only a cue: the hit zone is that whole half of the screen, so
 *   touching just outside the circle still counts.
 * - Only two states: a green target (tap now) or a red ✕ (wrong side, wait).
 *   A wrong tap costs speed and hides the target behind the ✕ for the short
 *   lockout; then the target flies back in.
 * - Nothing is shown during the countdown. The first thing to appear is the
 *   first green target at GO; tapping before it is a false start.
 * - Every appearance flies in (random approach angle, overshoot, trail, closing
 *   ring) so it doesn't feel static. A hit bursts into a ring and sparks.
 * - In the dip zone both pads appear orange: press both together to dip.
 */
export class Sprint100 extends LaneRace {
  constructor(ev) {
    super(ev, CONFIG.sprint100);
  }

  enter() {
    const r = CONFIG.sprint100.pads.radius;
    this.pads = {
      L: { home: { x: 0, y: 0 }, spawnT: -Infinity, spawnAngle: 0, r },
      R: { home: { x: 0, y: 0 }, spawnT: -Infinity, spawnAngle: 0, r },
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
  }

  onCountdown() {
    this.fx = [];
    this.dipShown = false;
    if (this.judge) this.judge.target = null;
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
    return this.pads[side].home;
  }

  onPlayerAction(side, t) {
    if (side === 'DIP') return;
    const result = this.judge.press(side, t);
    const now = this.game.time;
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
      this.spawn(this.target); // flies in again even if it's the same side
    } else if (result === 'miss') {
      const at = this.padPos(side);
      this.fx.push({ kind: 'x', x: at.x, y: at.y, t0: now, until: this.judge.lockedUntil });
      // The target stays hidden during the lockout, then flies back in.
      this.spawn(this.target);
      this.pads[this.target].spawnT = this.judge.lockedUntil;
      navigator.vibrate?.(40);
    }
  }

  updateControls() {
    const now = this.game.time;
    this.fx = this.fx.filter((f) => (f.kind === 'x' ? now < f.until + 0.1 : now - f.t0 < 0.4));
    if (this.state === 'race' && this.player.runner.mode === 'carry' && !this.dipShown) {
      this.dipShown = true;
      this.spawn('L');
      this.spawn('R');
    }
  }

  drawControls(ctx) {
    const now = this.game.time;
    const mode = this.player.runner.mode;
    const racing = this.state === 'race';

    // Nothing during the countdown: the first green target at GO is the cue.
    if (racing && mode === 'run' && this.target) {
      // Two states only: green target, or (during a miss lockout) just the red ✕.
      if (now >= this.judge.lockedUntil) this.drawSpawn(ctx, this.target, GREEN, 1);
    } else if (racing && mode === 'carry') {
      const pulse = 0.5 + 0.5 * Math.sin(now * 18);
      for (const side of ['L', 'R']) this.drawSpawn(ctx, side, ORANGE, 0.8 + 0.2 * pulse);
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
        // Bold red ✕ with a white outline: solid for the whole lockout, then a quick fade.
        const fade = clamp((now - f.until) / 0.1, 0, 1);
        const pop = clamp((now - f.t0) / 0.06, 0, 1);
        const shake = Math.sin((now - f.t0) * 70) * 5 * Math.max(0, 1 - (now - f.t0) / 0.2);
        ctx.globalAlpha = 1 - fade;
        ctx.translate(f.x + shake, f.y);
        ctx.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
        const s = 30;
        const cross = () => {
          ctx.beginPath();
          ctx.moveTo(-s, -s);
          ctx.lineTo(s, s);
          ctx.moveTo(s, -s);
          ctx.lineTo(-s, s);
        };
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 24;
        cross();
        ctx.stroke();
        ctx.shadowColor = 'transparent';
        const g = ctx.createLinearGradient(0, -s, 0, s);
        g.addColorStop(0, '#ff6b5e');
        g.addColorStop(0.5, '#ff1f1f');
        g.addColorStop(1, '#c80d12');
        ctx.strokeStyle = g;
        ctx.lineWidth = 14;
        cross();
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
  drawSpawn(ctx, side, pal, alpha) {
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
        ctx.fillStyle = pal.mid;
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
    this.drawPad(ctx, pal, { ...tf, r: r * tf.scale, alpha: alpha * tf.alpha });
  }

  /** A glossy candy button: gradient body, darker rim, thick white ring, highlight. */
  drawPad(ctx, pal, { x, y, r, alpha, angle = 0, stretch = 1 }) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    // Stretch along the flight direction, squash across it (area stays ~constant).
    ctx.rotate(angle);
    ctx.scale(stretch, 1 / stretch);
    ctx.rotate(-angle);

    // White ring with a soft drop shadow so it pops off the busy track.
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Body: light from the top-left, deep shade at the bottom rim.
    const inner = r * 0.84;
    const g = ctx.createRadialGradient(-inner * 0.3, -inner * 0.4, inner * 0.1, 0, 0, inner * 1.05);
    g.addColorStop(0, pal.hi);
    g.addColorStop(0.45, pal.mid);
    g.addColorStop(1, pal.lo);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, inner, 0, Math.PI * 2);
    ctx.fill();

    // Glossy highlight across the top half.
    const hg = ctx.createLinearGradient(0, -inner, 0, -inner * 0.1);
    hg.addColorStop(0, 'rgba(255,255,255,0.75)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.ellipse(0, -inner * 0.45, inner * 0.72, inner * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** 0 -> 1 with an overshoot past 1 near the end (s controls how far). */
function easeOutBack(k, s) {
  const t = k - 1;
  return 1 + (s + 1) * t * t * t + s * t * t;
}
