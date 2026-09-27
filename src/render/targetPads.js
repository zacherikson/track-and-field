import { clamp } from '../core/math.js';
import { GREEN, RIM, drawPad } from './pads.js';

/**
 * Race target animations shared by the 100m and the long jump run-up (measured
 * from footage of the original). `pad` is { home: { x, y }, r }; `cfg` is
 * CONFIG.sprint100.pads.
 */

/**
 * A target falling onto its spot. Offset = height * (1 - k²): slow at the top,
 * fastest just before it lands (like gravity), then a dead stop.
 */
export function drawDrop(ctx, pad, age, cfg) {
  const d = cfg.drop;
  const k = clamp(age / d.duration, 0, 1);
  const fall = d.height * pad.r;
  const yAt = (kk) => pad.home.y - fall * (1 - kk * kk);
  // Trailing rim echoes above the pad while it falls (and for a blink after landing).
  const echoFade = clamp(1 - (age - d.duration) / 0.04, 0, 1);
  for (let i = d.trail; i >= 1; i--) {
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
  ctx.globalAlpha = d.startAlpha + (1 - d.startAlpha) * k;
  drawPad(ctx, GREEN, pad.home.x, yAt(k), pad.r);
  ctx.restore();
}

/**
 * What's left after a hit: the pad's rim as a thin outline that expands
 * quickly at first, then slows, while fading out.
 */
export function drawHitRing(ctx, pad, age, cfg) {
  const h = cfg.hitRing;
  const k = clamp(age / h.duration, 0, 1);
  const grow = 1 - (1 - k) * (1 - k); // ease-out
  ctx.save();
  ctx.globalAlpha = Math.pow(1 - k, 1.2);
  ctx.strokeStyle = RIM;
  ctx.lineWidth = pad.r * (0.12 - 0.06 * k);
  ctx.beginPath();
  ctx.arc(pad.home.x, pad.home.y, pad.r * (0.95 + (h.grow - 0.95) * grow), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
