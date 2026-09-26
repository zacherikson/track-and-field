import { CONFIG } from '../config.js';
import { clamp } from '../core/math.js';
import { LaneRace } from './laneRace.js';

const LEFT_KEYS = ['ArrowLeft', 'KeyA', 'KeyZ', 'KeyF'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD', 'KeyX', 'KeyJ'];
const DIP_KEYS = ['Space', 'ArrowUp', 'ArrowDown'];

/**
 * 100m Dash controls: ONE green target at a time, alternating sides.
 *
 * - Hit zones are whole screen halves, so a thumb never "misses". The target is
 *   the visual cue for which thumb goes next.
 * - Each side's target reappears where that thumb last tapped, so it follows
 *   your grip instead of making you reach for a fixed spot.
 * - A hit bursts into an expanding ring. A tap on the wrong side shows a red ✕
 *   and doesn't count.
 * - Before the gun both pads are red. The first target after GO is on the left.
 * - In the dip zone both pads turn orange: press both together to dip.
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
    this.target = 'L';
    this.fx = []; // short-lived effects: { kind: 'ring' | 'x', x, y, t0 }
    super.enter();
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
    this.target = 'L';
    this.fx = [];
  }

  onGo() {
    // The first target is on the left, so the first valid stride is a left tap.
    this.player.runner.lastSide = 'R';
    this.target = 'L';
    this.pads.L.spawnT = this.game.time;
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
    const result = this.player.runner.tap(side, t);
    const now = this.game.time;
    if (result === 'ok') {
      const at = this.padPos(side);
      this.fx.push({ kind: 'ring', x: at.x, y: at.y, t0: now });
      if (e.type === 'down' && CONFIG.sprint100.pads.followThumb) this.pads[side].pos = this.clampToZone(side, e.x, e.y);
      this.target = side === 'L' ? 'R' : 'L';
      this.pads[this.target].spawnT = now;
    } else if (result === 'same') {
      const at = e.type === 'down' ? { x: e.x, y: e.y } : this.padPos(side);
      this.fx.push({ kind: 'x', x: at.x, y: at.y, t0: now });
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
    } else if (racing && mode === 'run') {
      const off = this.target === 'L' ? 'R' : 'L';
      this.drawGhost(ctx, off);
      // Pop-in: the new target grows from 60% over ~0.1s so the switch reads instantly.
      const k = clamp((now - this.pads[this.target].spawnT) / 0.1, 0, 1);
      this.drawPad(ctx, this.target, '#2bb673', 0.5 + 0.45 * k, 0.6 + 0.4 * k);
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
