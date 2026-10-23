// The menus' flat poster scenery (Art/Home screen redesign v1, kit/poster-ui.js):
// banded skies, lobed clouds, faceted ranges, round trees and pines, the
// track, and the three venues drawn into any rectangle (backdrops and card
// vignettes): pinebrook (Training), westfield (Amateur), olympic (Pro, and Live
// at night). Plus the TRACK ROYALE wordmark. Flat fills only.
//
// The race venues (render/venues.js) are drawn separately and don't share
// these colours yet.
import { PAL } from '../core/ui.js';
import { WORDMARK } from './wordmark.js';

const P2D = {}; // the wordmark's Path2D, made on first use

/** The wordmark, centred on (cx, cy), `capH` tall: cream letters, a hard violet block shadow, lane stripes behind. */
export function wordmark(ctx, cx, cy, capH, { face = PAL.cream, block = PAL.ink, stripes = [PAL.orange, PAL.gold], depth = 0.09, which = 'line' } = {}) {
  const g = WORDMARK[which]; const s = capH / WORDMARK.cap; const skew = 0.2;
  const p = (P2D['wm_' + which] ??= new Path2D(g.d));
  const w = g.w * s + skew * capH;
  const x0 = cx - w / 2; const base = cy + capH / 2;
  // lane stripes behind the lower half
  const sh = capH * 0.13;
  stripes.forEach((c, i) => { ctx.fillStyle = c; const yy = base - capH * 0.42 + i * sh * 1.6; ctx.beginPath(); ctx.moveTo(x0 - capH * 0.5, yy); ctx.lineTo(x0 + w + capH * 0.5, yy); ctx.lineTo(x0 + w + capH * 0.5 - sh * skew, yy + sh); ctx.lineTo(x0 - capH * 0.5 - sh * skew, yy + sh); ctx.closePath(); ctx.fill(); });
  const draw = (dx, dy, col) => { ctx.save(); ctx.translate(x0 + dx, base + dy); ctx.transform(1, 0, -skew, 1, 0, 0); ctx.scale(s, -s); ctx.fillStyle = col; ctx.fill(p); ctx.restore(); };
  const D = capH * depth; for (let k = D; k > 0; k -= 1) draw(k * 0.6, k, block);
  draw(0, 0, face);
  return { x: x0, w };
}

// ---------- poster scenery (flat, layered) ----------
export function bands(ctx, x, y, w, h, colors) { // flat horizontal sky bands, top -> bottom, equal-ish
  const n = colors.length; colors.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x, y + Math.round((h * i) / n), w, Math.ceil(h / n) + 1); });
}
export function cloud(ctx, x, y, s, face = PAL.cream, shade = PAL.lav) { // lobed flat cloud, flat cut base, shadow lobes
  ctx.save(); ctx.beginPath(); ctx.rect(x - 3 * s, y - 3 * s, 6 * s, 3.35 * s); ctx.clip();
  const lobes = [[-1.0, 0, 0.55], [-0.45, -0.35, 0.7], [0.25, -0.5, 0.85], [0.95, -0.2, 0.62], [1.45, 0.05, 0.45]];
  ctx.fillStyle = shade; ctx.beginPath(); lobes.forEach(([a, b, r]) => { ctx.moveTo(x + a * s + r * s, y + b * s + s * 0.12); ctx.arc(x + a * s, y + b * s + s * 0.12, r * s, 0, Math.PI * 2); }); ctx.fill();
  ctx.fillStyle = face; ctx.beginPath(); lobes.forEach(([a, b, r]) => { ctx.moveTo(x + a * s + r * s, y + b * s); ctx.arc(x + a * s, y + b * s, r * s * 0.94, 0, Math.PI * 2); }); ctx.fill();
  ctx.fillStyle = shade; ctx.fillRect(x - 1.6 * s, y + 0.2 * s, 3.3 * s, 0.15 * s); ctx.restore();
}
/** A faceted range: peaks [[x, y], ...] in absolute coords down to `base`; lit left faces, shaded right faces. */
export function range(ctx, peaks, base, face, shade, snow) {
  ctx.fillStyle = face; ctx.beginPath(); ctx.moveTo(peaks[0][0], base); peaks.forEach(([px, py]) => ctx.lineTo(px, py)); ctx.lineTo(peaks.at(-1)[0], base); ctx.closePath(); ctx.fill();
  for (let i = 1; i < peaks.length - 1; i++) {
    const [px, py] = peaks[i]; const [nx, ny] = peaks[i + 1]; const [lx, ly] = peaks[i - 1];
    if (py < ly && py < ny) { // a summit: shade its right face as a facet
      ctx.fillStyle = shade; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.lineTo(px + (nx - px) * 0.35, base); ctx.lineTo(px - (px - lx) * 0.1, base); ctx.closePath(); ctx.fill();
      if (snow) { const k = 0.28; ctx.fillStyle = snow; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + (nx - px) * k, py + (ny - py) * k); ctx.lineTo(px + (nx - px) * 0.12, py + (base - py) * 0.2); ctx.lineTo(px - (px - lx) * 0.08, py + (base - py) * 0.26); ctx.lineTo(px - (px - lx) * k, py + (ly - py) * k); ctx.closePath(); ctx.fill(); }
    }
  }
}
export function hill(ctx, x0, x1, top, base, face) { // a flat rounded hill (half ellipse)
  ctx.fillStyle = face; ctx.beginPath(); ctx.ellipse((x0 + x1) / 2, base, (x1 - x0) / 2, base - top, 0, Math.PI, 0); ctx.fill();
}
export function roundTree(ctx, x, base, r, face = PAL.green, shade = PAL.deep) {
  ctx.fillStyle = PAL.deeper; ctx.fillRect(x - r * 0.12, base - r * 0.9, r * 0.24, r * 0.9);
  ctx.fillStyle = shade; ctx.beginPath(); ctx.arc(x + r * 0.15, base - r * 1.25, r, 0, Math.PI * 2); ctx.arc(x - r * 0.55, base - r * 0.9, r * 0.7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = face; ctx.beginPath(); ctx.arc(x - r * 0.08, base - r * 1.4, r * 0.82, 0, Math.PI * 2); ctx.arc(x - r * 0.6, base - r * 1.0, r * 0.5, 0, Math.PI * 2); ctx.fill();
}
export function pine(ctx, x, base, h, face = PAL.deep, shade = PAL.deeper) {
  const w = h * 0.36; ctx.fillStyle = face; ctx.beginPath(); ctx.moveTo(x, base - h); ctx.lineTo(x + w / 2, base); ctx.lineTo(x - w / 2, base); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade; ctx.beginPath(); ctx.moveTo(x, base - h); ctx.lineTo(x + w / 2, base); ctx.lineTo(x + w * 0.05, base); ctx.closePath(); ctx.fill();
}
/** The track, as in the game: a band with lane lines (wider toward the bottom). */
export function track(ctx, x, top, w, h, { face = PAL.brick, line = 'rgba(245,234,208,0.85)', lanes = 6, curb = PAL.cream } = {}) {
  ctx.fillStyle = face; ctx.fillRect(x, top, w, h);
  ctx.fillStyle = curb; ctx.fillRect(x, top, w, 3);
  let yy = top; const r = 1.18; let lh = (h * (r - 1)) / (r ** lanes - 1);
  ctx.fillStyle = line;
  for (let i = 0; i < lanes - 1; i++) { yy += lh; lh *= r; ctx.fillRect(x, Math.round(yy), w, 2); }
}
// ---------- the three venues (each draws into a rect, for backdrops and cards) ----------
export function pinebrook(ctx, x, y, w, h, { trackH = 0, clouds = [[0.2, 0.2, 0.09], [0.74, 0.15, 0.11]] } = {}) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const gy = y + h - trackH; // ground line
  bands(ctx, x, y, w, gy - y, [PAL.sky, '#B5C3EE', '#C3CDF1']);
  clouds.forEach(([cx, cy, cs]) => cloud(ctx, x + w * cx, y + h * cy, h * cs));
  const m = (fx, fy) => [x + fx * w, y + fy * (gy - y)];
  range(ctx, [m(-0.05, 0.75), m(0.08, 0.5), m(0.18, 0.6), m(0.33, 0.33), m(0.47, 0.55), m(0.6, 0.38), m(0.72, 0.58), m(0.86, 0.42), m(1.05, 0.7)], gy, PAL.lav, '#ADA2D8', PAL.snow);
  range(ctx, [m(-0.05, 0.85), m(0.14, 0.66), m(0.3, 0.78), m(0.52, 0.64), m(0.7, 0.8), m(0.9, 0.68), m(1.05, 0.8)], gy, PAL.mtn, PAL.mtnShade, null);
  hill(ctx, x - w * 0.1, x + w * 0.55, gy - (gy - y) * 0.2, gy + 4, '#6F9A4A');
  hill(ctx, x + w * 0.4, x + w * 1.1, gy - (gy - y) * 0.16, gy + 4, '#5E8C43');
  for (let i = 0; i < 7; i++) roundTree(ctx, x + w * (0.03 + i * 0.07), gy, (gy - y) * (0.07 + (i % 3) * 0.015));
  for (let i = 0; i < 6; i++) pine(ctx, x + w * (0.66 + i * 0.06), gy, (gy - y) * (0.2 + (i % 2) * 0.06));
  ctx.fillStyle = PAL.chart; ctx.fillRect(x, gy - 6, w, 8);
  // chain-link fence: posts + rail
  ctx.fillStyle = 'rgba(38,34,79,0.45)'; for (let fx = x + 10; fx < x + w; fx += 46) ctx.fillRect(fx, gy - 26, 3, 22);
  ctx.fillRect(x, gy - 26, w, 3);
  if (trackH) track(ctx, x, gy, w, trackH, { face: '#B5553A' });
  ctx.restore();
}
export function westfield(ctx, x, y, w, h, { trackH = 0, crowd = true } = {}) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const gy = y + h - trackH; const H = gy - y;
  bands(ctx, x, y, w, H, [PAL.sky, '#B5C3EE', '#C9D0EF']);
  cloud(ctx, x + w * 0.16, y + H * 0.2, H * 0.1); cloud(ctx, x + w * 0.8, y + H * 0.16, H * 0.085);
  // foothills, low
  ctx.fillStyle = PAL.lav; ctx.beginPath(); ctx.moveTo(x, y + H * 0.6); for (let i = 0; i <= 8; i++) ctx.lineTo(x + (w * i) / 8, y + H * (0.5 + 0.06 * Math.sin(i * 1.7))); ctx.lineTo(x + w, gy); ctx.lineTo(x, gy); ctx.fill();
  // town blocks
  const blocks = [[0.06, 0.62, 0.1], [0.16, 0.56, 0.07], [0.62, 0.6, 0.12], [0.75, 0.55, 0.06], [0.84, 0.63, 0.1]];
  blocks.forEach(([fx, fy, fw]) => { ctx.fillStyle = PAL.mtn; ctx.fillRect(x + fx * w, y + fy * H, fw * w, H); ctx.fillStyle = PAL.mtnShade; ctx.fillRect(x + (fx + fw * 0.7) * w, y + fy * H, fw * w * 0.3, H); });
  // water tower + steeple
  const wt = x + w * 0.27; ctx.fillStyle = PAL.mtnShade; ctx.fillRect(wt - 2, y + H * 0.42, 4, H); ctx.fillRect(wt - 14, y + H * 0.42, 3, H); ctx.fillRect(wt + 11, y + H * 0.42, 3, H);
  ctx.fillStyle = PAL.mtn; ctx.fillRect(wt - 18, y + H * 0.3, 36, H * 0.12); ctx.beginPath(); ctx.moveTo(wt - 18, y + H * 0.3); ctx.lineTo(wt, y + H * 0.24); ctx.lineTo(wt + 18, y + H * 0.3); ctx.fill();
  const st = x + w * 0.56; ctx.fillStyle = PAL.snow; ctx.fillRect(st - 8, y + H * 0.42, 16, H); ctx.beginPath(); ctx.moveTo(st - 8, y + H * 0.42); ctx.lineTo(st, y + H * 0.22); ctx.lineTo(st + 8, y + H * 0.42); ctx.fill();
  ctx.fillStyle = '#B9AED9'; ctx.beginPath(); ctx.moveTo(st, y + H * 0.22); ctx.lineTo(st + 8, y + H * 0.42); ctx.lineTo(st, y + H * 0.42); ctx.fill();
  for (let i = 0; i < 9; i++) roundTree(ctx, x + w * (0.02 + i * 0.12), gy - H * 0.26, H * 0.06, '#8DB352', '#4E7F3E');
  // bleachers: aluminium tiers, centred
  const bx = x + w * 0.2, bw = w * 0.6, btop = gy - H * 0.36;
  const tiers = 6, th = (gy - H * 0.1 - btop) / tiers;
  for (let i = 0; i < tiers; i++) { const ty = btop + i * th; const inset = (tiers - i) * w * 0.006; ctx.fillStyle = i % 2 ? '#C9CCD6' : '#DADDE6'; ctx.fillRect(bx + inset, ty, bw - inset * 2, th); ctx.fillStyle = '#9EA2B4'; ctx.fillRect(bx + inset, ty + th - 2, bw - inset * 2, 2); }
  if (crowd) { const cols = [PAL.orange, PAL.blue, PAL.gold, PAL.brick, PAL.deep, PAL.magenta]; let k = 0; for (let i = 0; i < tiers - 1; i++) for (let j = 0; j < 22; j++) { if ((j * 7 + i * 3) % 5 > 1) continue; const px = bx + 14 + j * (bw - 28) / 22, py = btop + i * th + th * 0.1; ctx.fillStyle = cols[k++ % cols.length]; ctx.fillRect(px, py + th * 0.25, th * 0.7, th * 0.6); ctx.beginPath(); ctx.arc(px + th * 0.35, py + th * 0.12, th * 0.24, 0, 7); ctx.fill(); } }
  // hand-painted plywood boards
  const boards = [[PAL.cream, PAL.brick], [PAL.gold, PAL.ink], [PAL.cream, PAL.deep], [PAL.brick, PAL.cream], [PAL.cream, PAL.blue], [PAL.gold, PAL.brick]];
  const bwid = w / boards.length, bh = H * 0.1;
  boards.forEach(([bg, fg], i) => { const xx = x + i * bwid; ctx.fillStyle = bg; ctx.fillRect(xx + 2, gy - bh, bwid - 4, bh); ctx.fillStyle = fg; if (i % 3 === 0) { ctx.beginPath(); ctx.arc(xx + bwid * 0.3, gy - bh / 2, bh * 0.28, 0, 7); ctx.fill(); ctx.fillRect(xx + bwid * 0.48, gy - bh * 0.62, bwid * 0.36, bh * 0.24); } else if (i % 3 === 1) { for (let s = 0; s < 3; s++) { ctx.beginPath(); ctx.moveTo(xx + bwid * (0.2 + s * 0.22), gy - bh * 0.2); ctx.lineTo(xx + bwid * (0.3 + s * 0.22), gy - bh * 0.8); ctx.lineTo(xx + bwid * (0.36 + s * 0.22), gy - bh * 0.8); ctx.lineTo(xx + bwid * (0.26 + s * 0.22), gy - bh * 0.2); ctx.fill(); } } else { ctx.beginPath(); ctx.moveTo(xx + bwid * 0.2, gy - bh * 0.2); ctx.lineTo(xx + bwid * 0.5, gy - bh * 0.82); ctx.lineTo(xx + bwid * 0.8, gy - bh * 0.2); ctx.fill(); } });
  if (trackH) track(ctx, x, gy, w, trackH, { face: '#D2442E' });
  ctx.restore();
}
export function olympic(ctx, x, y, w, h, { trackH = 0, night = false } = {}) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const gy = y + h - trackH; const H = gy - y;
  bands(ctx, x, y, w, H * 0.7, night ? ['#2C2862', '#3D3680', '#5B4D99', '#8A5E9E'] : ['#8C9EDD', '#B7A9E0', '#E9B7A8', '#F4CF8F']);
  ctx.fillStyle = night ? '#8A5E9E' : '#F4CF8F'; ctx.fillRect(x, y + H * 0.69, w, H * 0.31);
  if (!night) { cloud(ctx, x + w * 0.2, y + H * 0.17, H * 0.07, '#F8DDB0', '#E9B7A8'); cloud(ctx, x + w * 0.83, y + H * 0.12, H * 0.06, '#F8DDB0', '#E9B7A8'); }
  // floodlight beams (flat wedges) + masts
  const beam = night ? 'rgba(255,236,170,0.32)' : 'rgba(255,246,214,0.42)';
  [[0.06, 1], [0.94, -1]].forEach(([fx, dir]) => { const mx = x + fx * w, my = y + H * 0.12; ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(mx, my + 8); ctx.lineTo(mx + dir * w * 0.42, gy); ctx.lineTo(mx + dir * w * 0.18, gy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = PAL.ink2; ctx.fillRect(mx - 2.5, my, 5, gy - my); ctx.fillStyle = PAL.ink; ctx.fillRect(mx - 18, my - 12, 36, 22); ctx.fillStyle = '#FFF1C2'; for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) ctx.fillRect(mx - 15 + i * 8, my - 9 + j * 9, 6, 7); });
  // the stand: roof + two crowd tiers as flat stripes broken by aisles
  const sx = x + w * 0.1, sw = w * 0.8, roofY = y + H * 0.3;
  ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.moveTo(sx - w * 0.02, roofY); ctx.lineTo(sx + sw + w * 0.02, roofY); ctx.lineTo(sx + sw, roofY + H * 0.08); ctx.lineTo(sx, roofY + H * 0.08); ctx.fill();
  ctx.fillStyle = PAL.ink3; ctx.fillRect(sx - w * 0.02, roofY, sw + w * 0.04, H * 0.025);
  const tierTop = roofY + H * 0.08, tierH = (gy - H * 0.1 - tierTop) / 2;
  for (let t = 0; t < 2; t++) {
    const ty = tierTop + t * tierH;
    const stripes = night ? ['#E8743B', '#C2452F', '#8F2C5C'] : ['#F2A65A', '#E8743B', '#C2452F'];
    stripes.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(sx, ty + (i * (tierH - 6)) / 3, sw, (tierH - 6) / 3 + 1); });
    ctx.fillStyle = PAL.cream; for (let a = 0; a <= 8; a++) ctx.fillRect(sx + (a * sw) / 8 - 3, ty, 6, tierH - 6);
    ctx.fillStyle = PAL.ink2; ctx.fillRect(sx, ty + tierH - 6, sw, 6);
  }
  // side stands, lower and cooler
  ctx.fillStyle = PAL.mtn; ctx.fillRect(x, tierTop + tierH * 0.6, sx - x, gy - tierTop); ctx.fillRect(sx + sw, tierTop + tierH * 0.6, x + w - sx - sw, gy - tierTop);
  ctx.fillStyle = PAL.mtnShade; for (let i = 0; i < 3; i++) { ctx.fillRect(x, tierTop + tierH * (0.75 + i * 0.35), sx - x, 3); ctx.fillRect(sx + sw, tierTop + tierH * (0.75 + i * 0.35), x + w - sx - sw, 3); }
  // LED boards: flat panels, abstract chevrons
  const led = [PAL.blue, PAL.magenta, PAL.gold, '#2FA7B8', PAL.blue, PAL.magenta, PAL.gold, '#2FA7B8'];
  const lw = w / led.length, lh = H * 0.1;
  led.forEach((c, i) => { const xx = x + i * lw; ctx.fillStyle = c; ctx.fillRect(xx, gy - lh, lw, lh); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(xx + lw * 0.3, gy - lh * 0.8); ctx.lineTo(xx + lw * 0.45, gy - lh / 2); ctx.lineTo(xx + lw * 0.3, gy - lh * 0.2); ctx.lineTo(xx + lw * 0.38, gy - lh * 0.2); ctx.lineTo(xx + lw * 0.53, gy - lh / 2); ctx.lineTo(xx + lw * 0.38, gy - lh * 0.8); ctx.fill(); });
  if (trackH) track(ctx, x, gy, w, trackH, { face: PAL.blue });
  ctx.restore();
}
