import { CONFIG } from '../config.js';
import { clamp } from '../core/math.js';
import { LaneRace } from './laneRace.js';
import { StrideTargets } from './strideTargets.js';

// Glossy "candy" button palettes: highlight, body, and rim shade.
const GREEN = { hi: '#b6ff8a', mid: '#39e626', lo: '#0f9e1c' };
const ORANGE = { hi: '#ffe08a', mid: '#ff9d14', lo: '#d9580a' };
const RIM = '#eaf8ff'; // the pad's white rim; also the colour of its echoes and hit outline

const LEFT_KEYS = ['ArrowLeft', 'KeyA', 'KeyZ', 'KeyF'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD', 'KeyX', 'KeyJ'];
const DIP_KEYS = ['Space', 'ArrowUp', 'ArrowDown'];

/**
 * 100m Dash controls: ONE green target at a time, on a RANDOM side, but never
 * more than two in a row on the same side (see strideTargets.js). Reading the
 * pattern, not mashing, is what makes you fast.
 *
 * Look and motion (measured from footage of the original):
 * - Each side's target has one fixed spot. The first target simply appears at
 *   GO; every one after that DROPS onto its spot from above: it accelerates like it's falling (ease-in), with a faint trailing
 *   echo of its rim, and stops dead on the spot, with no bounce.
 * - When you hit it, the green body vanishes instantly and its rim is left
 *   behind as a thin white outline that expands and fades.
 * - The circle is only a cue: the hit zone is that whole half of the screen, so
 *   touching just outside the circle still counts.
 * - Only two states: a green target (tap now) or a red ✕ (wrong side, wait).
 *   A wrong tap costs speed and flashes the ✕ on the side you tapped. The
 *   green target stays where it landed; it only drops once.
 * - Nothing is shown during the countdown, and taps then are ignored. The first
 *   thing to appear is the first green target at GO.
 * - In the lean zone both pads show orange: press both together to lean.
 */
export class Sprint100 extends LaneRace {
  constructor(ev) {
    super(ev, CONFIG.sprint100);
  }

  enter() {
    const r = CONFIG.sprint100.pads.radius;
    this.pads = { L: { home: { x: 0, y: 0 }, r }, R: { home: { x: 0, y: 0 }, r } };
    this.missSide = null; // side of the last wrong tap (✕ shows there briefly)
    this.missT = -Infinity;
    this.spawnT = -Infinity; // when the current target started dropping in
    this.rings = []; // hit outlines: { side, t0 }
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
    this.rings = [];
    if (this.judge) this.judge.target = null;
  }

  onGo() {
    this.judge.start(this.goT);
    this.spawnT = -Infinity; // the first target just appears in place at GO; later ones drop in
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
    const result = this.judge.press(side, t);
    if (result === 'hit') {
      this.rings.push({ side, t0: t });
      this.spawnT = t; // the next target drops in right away (even on the same side)
    } else if (result === 'miss') {
      this.missSide = side; // the green target stays put: no re-drop
      this.missT = t;
      navigator.vibrate?.(40);
    }
  }

  updateControls() {
    const now = this.game.time;
    this.rings = this.rings.filter((ring) => now - ring.t0 < CONFIG.sprint100.pads.hitRing.duration);
  }

  drawControls(ctx) {
    if (this.state !== 'race') return; // nothing during the countdown
    const mode = this.player.runner.mode;
    const now = this.game.time;
    if (mode === 'run' && this.target) {
      this.drawDrop(ctx, this.pads[this.target], now - this.spawnT);
      if (now - this.missT < CONFIG.sprint100.pads.missX) this.drawX(ctx, this.pads[this.missSide].home);
    } else if (mode === 'carry') {
      this.drawPad(ctx, ORANGE, this.pads.L);
      this.drawPad(ctx, ORANGE, this.pads.R);
    }
    for (const ring of this.rings) this.drawHitRing(ctx, this.pads[ring.side], now - ring.t0);
  }

  /**
   * A target falling onto its spot. Offset = height * (1 - k²): slow at the top,
   * fastest just before it lands (like gravity), then a dead stop.
   */
  drawDrop(ctx, pad, age) {
    const cfg = CONFIG.sprint100.pads.drop;
    const k = clamp(age / cfg.duration, 0, 1);
    const fall = cfg.height * pad.r;
    const yAt = (kk) => pad.home.y - fall * (1 - kk * kk);
    // Trailing rim echoes above the pad while it falls (and for a blink after landing).
    const echoFade = clamp(1 - (age - cfg.duration) / 0.04, 0, 1);
    for (let i = cfg.trail; i >= 1; i--) {
      const kk = k - 0.22 * i;
      if (kk < 0 || echoFade === 0) continue;
      ctx.save();
      ctx.globalAlpha = (0.4 / i) * echoFade;
      ctx.strokeStyle = RIM;
      ctx.lineWidth = pad.r * 0.1;
      ctx.beginPath();
      ctx.arc(pad.home.x, yAt(kk), pad.r * 0.94, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = cfg.startAlpha + (1 - cfg.startAlpha) * k;
    this.drawPad(ctx, GREEN, { home: { x: pad.home.x, y: yAt(k) }, r: pad.r });
    ctx.restore();
  }

  /**
   * What's left after a hit: the pad's rim as a thin outline that expands
   * quickly at first, then slows, while fading out.
   */
  drawHitRing(ctx, pad, age) {
    const cfg = CONFIG.sprint100.pads.hitRing;
    const k = clamp(age / cfg.duration, 0, 1);
    const grow = 1 - (1 - k) * (1 - k); // ease-out
    ctx.save();
    ctx.globalAlpha = Math.pow(1 - k, 1.2);
    ctx.strokeStyle = RIM;
    ctx.lineWidth = pad.r * (0.12 - 0.06 * k);
    ctx.beginPath();
    ctx.arc(pad.home.x, pad.home.y, pad.r * (0.95 + (cfg.grow - 0.95) * grow), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
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
