import { CONFIG } from '../config.js';
import { clamp } from '../core/math.js';
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
 * - Each side's target appears where that thumb last tapped, following your grip.
 * - A hit bursts into an expanding ring. A repeat on the same side pops in again.
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
      L: { home: { x: 0, y: 0 }, pos: null, spawnT: -1, r },
      R: { home: { x: 0, y: 0 }, pos: null, spawnT: -1, r },
    };
    this.fx = []; // short-lived effects: { kind: 'ring' | 'x', x, y, t0 }
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
    if (this.judge) this.judge.target = null;
  }

  onGo() {
    this.judge.start(this.goT);
    this.pads[this.target].spawnT = this.game.time;
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
      const at = this.padPos(side);
      this.fx.push({ kind: 'ring', x: at.x, y: at.y, t0: now });
      if (touch && CONFIG.sprint100.pads.followThumb) this.pads[side].pos = this.clampToZone(side, touch.x, touch.y);
      this.pads[this.target].spawnT = now; // pops in again even if it's the same side
    } else if (result === 'miss') {
      const at = touch ?? this.padPos(side);
      this.fx.push({ kind: 'x', x: at.x, y: at.y, t0: now });
      navigator.vibrate?.(40);
    }
  }

  updateControls() {
    const now = this.game.time;
    this.fx = this.fx.filter((f) => now - f.t0 < 0.4);
  }

  drawControls(ctx) {
    const now = this.game.time;
    const mode = this.player.runner.mode;
    const before = this.state === 'ready' || this.state === 'set';
    const racing = this.state === 'race';

    if (before) {
      for (const side of ['L', 'R']) this.drawPad(ctx, side, '#d7263d', 0.85, 1);
    } else if (racing && mode === 'run' && this.target) {
      // Faint rings where each thumb rests; the lit side gets the green target.
      for (const side of ['L', 'R']) if (side !== this.target) this.drawGhost(ctx, side);
      // Pop-in: the new target grows from 60% over ~0.1s so the switch reads instantly.
      const k = clamp((now - this.pads[this.target].spawnT) / 0.1, 0, 1);
      const locked = now < this.judge.lockedUntil;
      this.drawPad(ctx, this.target, locked ? '#7d8a86' : '#2bb673', 0.5 + 0.45 * k, 0.6 + 0.4 * k);
    } else if (racing && mode === 'carry') {
      const pulse = 0.5 + 0.5 * Math.sin(now * 18);
      for (const side of ['L', 'R']) this.drawPad(ctx, side, '#ff8c28', 0.8 + 0.15 * pulse, 0.95 + 0.08 * pulse);
    }

    for (const f of this.fx) {
      const k = (now - f.t0) / 0.4;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      if (f.kind === 'ring') {
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

  drawPad(ctx, side, color, alpha, scale) {
    const p = this.padPos(side);
    const r = this.pads[side].r * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 4;
    ctx.stroke();
    // Glossy highlight so it reads as a button.
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.ellipse(p.x - r * 0.18, p.y - r * 0.4, r * 0.55, r * 0.3, -0.3, 0, Math.PI * 2);
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
