import { CONFIG } from '../config.js';
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
 * Deliberately plain, with no animation:
 * - Each side's target sits on the same fixed spot. It appears instantly and
 *   disappears the moment you hit it.
 * - The circle is only a cue: the hit zone is that whole half of the screen, so
 *   touching just outside the circle still counts.
 * - Only two states: a green target (tap now) or a red ✕ (wrong side, wait).
 *   A wrong tap costs speed and shows only the ✕ for the short lockout; then
 *   the green target is back.
 * - Nothing is shown during the countdown. The first thing to appear is the
 *   first green target at GO; tapping before it is a false start.
 * - In the dip zone both pads show orange: press both together to dip.
 */
export class Sprint100 extends LaneRace {
  constructor(ev) {
    super(ev, CONFIG.sprint100);
  }

  enter() {
    const r = CONFIG.sprint100.pads.radius;
    this.pads = { L: { home: { x: 0, y: 0 }, r }, R: { home: { x: 0, y: 0 }, r } };
    this.missSide = null; // side of the last wrong tap (✕ shows there during the lockout)
    super.enter();
    this.judge = new StrideTargets(this.player.runner, CONFIG.sprint100.targets);
  }

  /** Player numbers for the results screen. */
  raceStats() {
    return { hits: this.judge.hits, misses: this.judge.misses, topSpeed: this.playerTopV ?? 0 };
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
    this.missSide = null;
    if (this.judge) this.judge.target = null;
  }

  onGo() {
    this.judge.start(this.goT);
  }

  mapInput(e) {
    if (e.type === 'down') return e.x < this.game.view.w / 2 ? 'L' : 'R';
    if (LEFT_KEYS.includes(e.code)) return 'L';
    if (RIGHT_KEYS.includes(e.code)) return 'R';
    if (DIP_KEYS.includes(e.code)) return 'DIP';
    return null;
  }

  onPlayerAction(side, t) {
    if (side === 'DIP') return;
    if (this.judge.press(side, t) === 'miss') {
      this.missSide = side;
      navigator.vibrate?.(40);
    }
  }

  drawControls(ctx) {
    if (this.state !== 'race') return; // nothing during the countdown
    const mode = this.player.runner.mode;
    if (mode === 'run' && this.target) {
      if (this.game.time < this.judge.lockedUntil) this.drawX(ctx, this.pads[this.missSide].home);
      else this.drawPad(ctx, GREEN, this.pads[this.target]);
    } else if (mode === 'carry') {
      this.drawPad(ctx, ORANGE, this.pads.L);
      this.drawPad(ctx, ORANGE, this.pads.R);
    }
  }

  /** Bold red ✕ with a white outline. */
  drawX(ctx, { x, y }) {
    const s = 30;
    const cross = () => {
      ctx.beginPath();
      ctx.moveTo(-s, -s);
      ctx.lineTo(s, s);
      ctx.moveTo(s, -s);
      ctx.lineTo(-s, s);
    };
    ctx.save();
    ctx.translate(x, y);
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
    ctx.restore();
  }

  /** A glossy candy button: gradient body, darker rim, thick white ring, highlight. */
  drawPad(ctx, pal, { home: { x, y }, r }) {
    ctx.save();
    ctx.translate(x, y);

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
