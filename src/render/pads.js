// Shared drawing for the on-screen tap targets (race pads, start button, ✕).

// Glossy "candy" button palettes: highlight, body, and rim shade.
export const GREEN = { hi: '#b6ff8a', mid: '#39e626', lo: '#0f9e1c' };
export const ORANGE = { hi: '#ffe08a', mid: '#ff9d14', lo: '#d9580a' };
export const RIM = '#eaf8ff'; // a pad's white rim; also its echoes and hit outline

/** A glossy candy button: gradient body, darker rim, thick white ring, highlight. */
export function drawPad(ctx, pal, x, y, r) {
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

/**
 * A numbered button (hurdles), styled after the original for legibility: a
 * thin dark outline, a pale ring, a nearly flat blue disc (lighter top half,
 * no gloss streak across the number) and a big heavy white number with no
 * shadow.
 */
export function drawNumberButton(ctx, x, y, r, n) {
  ctx.save();
  ctx.translate(x, y);
  // Soft shadow under the whole button so it lifts off the stadium.
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#2a3542'; // dark outline
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#e8f7ff'; // pale ring
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.93, 0, Math.PI * 2);
  ctx.fill();
  // Blue disc: two flat-ish tones, lighter above the middle.
  const d = r * 0.8;
  const g = ctx.createLinearGradient(0, -d, 0, d);
  g.addColorStop(0, '#5aa9ff');
  g.addColorStop(0.46, '#3f8ef8');
  g.addColorStop(0.54, '#2c6fe8');
  g.addColorStop(1, '#2a66e0');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, d, 0, Math.PI * 2);
  ctx.fill();
  // The number: big and heavy.
  ctx.fillStyle = '#f7fcff';
  ctx.font = `900 ${Math.round(r * 1.25)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 0, r * 0.06);
  ctx.restore();
}

/** Bold red ✕ with a white outline. */
export function drawX(ctx, x, y) {
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
