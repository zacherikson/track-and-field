// The menus' flat poster scenery (Art/Home screen redesign v1, kit/poster-ui.js):
// banded skies, lobed clouds, faceted ranges, round trees and pines, the
// track, and the three venues drawn into any rectangle (backdrops and card
// vignettes): pinebrook (Training), westfield (High School), wasatch
// (Collegiate), olympic (Pro, and Live at night). Plus the TRACK ROYALE
// wordmark. Flat fills only.
//
// The race venues (render/venues.js) are drawn separately and don't share
// these colours yet.
import { PAL } from '../core/ui.js';
import { WORDMARK } from './wordmark.js';
import { drawMonolith, drawColumn } from './ruins.js';

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
export function track(ctx, x, top, w, h, { face = PAL.brick, alt = null, line = 'rgba(245,234,208,0.85)', lanes = 6, curb = PAL.cream } = {}) {
  ctx.fillStyle = face; ctx.fillRect(x, top, w, h);
  const r = 1.18; let lh = (h * (r - 1)) / (r ** lanes - 1);
  if (alt) { ctx.fillStyle = alt; let ly = top, l = lh; for (let i = 0; i < lanes; i++) { if (i % 2) ctx.fillRect(x, ly, w, l + 1); ly += l; l *= r; } } // two-tone lanes
  ctx.fillStyle = curb; ctx.fillRect(x, top, w, 3);
  let yy = top;
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
  // bleachers: two small aluminium sections, a few people dotted along them
  const tiers = 3;
  const cols = [PAL.orange, PAL.blue, PAL.gold, PAL.brick, PAL.deep, PAL.magenta];
  let k = 0;
  [[0.14, 0.24], [0.62, 0.2]].forEach(([fx, fw], s) => {
    const bx = x + w * fx, bw = w * fw, btop = gy - H * 0.27, th = (gy - H * 0.1 - btop) / tiers;
    for (let i = 0; i < tiers; i++) { const ty = btop + i * th; const inset = (tiers - i) * w * 0.005; ctx.fillStyle = i % 2 ? '#C9CCD6' : '#DADDE6'; ctx.fillRect(bx + inset, ty, bw - inset * 2, th); ctx.fillStyle = '#9EA2B4'; ctx.fillRect(bx + inset, ty + th - 2, bw - inset * 2, 2); }
    if (crowd) for (let i = 0; i < tiers - 1; i++) for (let j = 0; j < 10; j++) { if ((j * 7 + i * 3 + s * 2) % 5) continue; const px = bx + 8 + (j * (bw - 16)) / 10, py = btop + i * th + th * 0.1; ctx.fillStyle = cols[k++ % cols.length]; ctx.fillRect(px, py + th * 0.25, th * 0.7, th * 0.6); ctx.beginPath(); ctx.arc(px + th * 0.35, py + th * 0.12, th * 0.24, 0, 7); ctx.fill(); }
  });
  // hand-painted plywood boards
  const boards = [[PAL.cream, PAL.brick], [PAL.gold, PAL.ink], [PAL.cream, PAL.deep], [PAL.brick, PAL.cream], [PAL.cream, PAL.blue], [PAL.gold, PAL.brick]];
  const bwid = w / boards.length, bh = H * 0.1;
  boards.forEach(([bg, fg], i) => { const xx = x + i * bwid; ctx.fillStyle = bg; ctx.fillRect(xx + 2, gy - bh, bwid - 4, bh); ctx.fillStyle = fg; if (i % 3 === 0) { ctx.beginPath(); ctx.arc(xx + bwid * 0.3, gy - bh / 2, bh * 0.28, 0, 7); ctx.fill(); ctx.fillRect(xx + bwid * 0.48, gy - bh * 0.62, bwid * 0.36, bh * 0.24); } else if (i % 3 === 1) { for (let s = 0; s < 3; s++) { ctx.beginPath(); ctx.moveTo(xx + bwid * (0.2 + s * 0.22), gy - bh * 0.2); ctx.lineTo(xx + bwid * (0.3 + s * 0.22), gy - bh * 0.8); ctx.lineTo(xx + bwid * (0.36 + s * 0.22), gy - bh * 0.8); ctx.lineTo(xx + bwid * (0.26 + s * 0.22), gy - bh * 0.2); ctx.fill(); } } else { ctx.beginPath(); ctx.moveTo(xx + bwid * 0.2, gy - bh * 0.2); ctx.lineTo(xx + bwid * 0.5, gy - bh * 0.82); ctx.lineTo(xx + bwid * 0.8, gy - bh * 0.2); ctx.fill(); } });
  if (trackH) track(ctx, x, gy, w, trackH, { face: '#D2442E' });
  ctx.restore();
}
/**
 * Wasatch University (Collegiate), after the track in Provo: snow-capped
 * peaks over the campus trees, light poles, modest aluminium bleachers with a
 * navy press box, and a pale blue track with its lanes in two blues.
 */
export function wasatch(ctx, x, y, w, h, { trackH = 0 } = {}) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const gy = y + h - trackH; const H = gy - y;
  bands(ctx, x, y, w, H, ['#7FA8E6', '#9DBDEB', '#BDD3F0', '#D6E4F5']);
  cloud(ctx, x + w * 0.84, y + H * 0.12, H * 0.07, '#F7F9FD', '#C9D6EC');
  const m = (fx, fy) => [x + fx * w, y + fy * H];
  range(ctx, [m(-0.05, 0.55), m(0.06, 0.3), m(0.17, 0.42), m(0.31, 0.1), m(0.43, 0.3), m(0.53, 0.2), m(0.65, 0.4), m(0.77, 0.16), m(0.9, 0.36), m(1.05, 0.28)], gy, '#8E9CC4', '#7584B0', '#F6F8FC');
  range(ctx, [m(-0.05, 0.72), m(0.12, 0.52), m(0.27, 0.64), m(0.45, 0.48), m(0.61, 0.66), m(0.8, 0.5), m(1.05, 0.68)], gy, '#6E7DA8', '#5D6A95', '#E4EAF4');
  // campus trees along the foot of the range
  for (let i = 0; i < 11; i++) roundTree(ctx, x + w * (0.01 + i * 0.1), gy - H * 0.18, H * (0.06 + (i % 3) * 0.012), '#6FA94E', '#3F7A3A');
  // light poles
  [0.12, 0.88].forEach((fx) => { const px = x + fx * w, py = y + H * 0.22; ctx.fillStyle = '#5B6470'; ctx.fillRect(px - 1.5, py, 3, gy - py); ctx.fillRect(px - 10, py - 6, 20, 7); ctx.fillStyle = '#F4F1E2'; for (let k = 0; k < 3; k++) ctx.fillRect(px - 8 + k * 6, py - 4.5, 4, 4); });
  // bleachers: two low aluminium sections, a press box on the bigger one
  const tiers = 4;
  [[0.2, 0.42], [0.66, 0.24]].forEach(([fx, fw], s) => {
    const bx = x + fx * w, bw = fw * w, btop = gy - H * 0.3, th = (gy - H * 0.1 - btop) / tiers;
    for (let i = 0; i < tiers; i++) { const ty = btop + i * th; const inset = (tiers - i) * w * 0.005; ctx.fillStyle = i % 2 ? '#C9CED8' : '#DCE0E8'; ctx.fillRect(bx + inset, ty, bw - inset * 2, th); ctx.fillStyle = '#8D95A5'; ctx.fillRect(bx + inset, ty + th - 2, bw - inset * 2, 2); }
    const cols = ['#0B2D5B', '#F4F6F8', '#1F5FAE', PAL.gold, '#0B2D5B', PAL.orange];
    for (let i = 0; i < tiers - 1; i++) for (let j = 0; j < 16; j++) { if ((j * 5 + i * 3 + s) % 4) continue; const px = bx + 10 + (j * (bw - 20)) / 16, py = btop + i * th; ctx.fillStyle = cols[(i + j) % cols.length]; ctx.fillRect(px, py + th * 0.3, th * 0.7, th * 0.55); ctx.beginPath(); ctx.arc(px + th * 0.35, py + th * 0.15, th * 0.24, 0, 7); ctx.fill(); }
    if (s === 0) { const pw = bw * 0.3, px = bx + (bw - pw) / 2, py = btop - H * 0.12; ctx.fillStyle = '#0B2D5B'; ctx.fillRect(px, py, pw, H * 0.12); ctx.fillStyle = '#9CC7EC'; ctx.fillRect(px + pw * 0.08, py + H * 0.03, pw * 0.84, H * 0.045); }
  });
  // low navy and white boards
  const boards = ['#0B2D5B', '#F4F6F8', '#1F5FAE', '#0B2D5B', '#F4F6F8', '#1F5FAE'];
  const bwid = w / boards.length, bh = H * 0.1;
  boards.forEach((c, i) => { const xx = x + i * bwid; ctx.fillStyle = c; ctx.fillRect(xx + 2, gy - bh, bwid - 4, bh); ctx.fillStyle = c === '#F4F6F8' ? '#0B2D5B' : '#F4F6F8'; ctx.fillRect(xx + bwid * 0.25, gy - bh * 0.6, bwid * 0.5, bh * 0.2); });
  if (trackH) track(ctx, x, gy, w, trackH, { face: '#7DB3E0', alt: '#4F88C2', line: 'rgba(255,255,255,0.9)', curb: '#EEF2F6' });
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
/**
 * The Lost Stadium (Survival): an old stone stand the jungle has taken back,
 * under a humid sky. Tiers of weathered stone with broken arches, moss down
 * them, trees grown up through and towering over them, vines hanging, and a
 * faded clay track along the bottom.
 */
export function lostStadium(ctx, x, y, w, h, { trackH = 0 } = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const gy = y + h - trackH;
  const H = gy - y;
  bands(ctx, x, y, w, H, ['#5F9E8C', '#8FBFA0', '#C3DCB0', '#D6E4B0']);
  // Far jungle hills.
  hill(ctx, x - w * 0.2, x + w * 0.6, y + H * 0.42, gy, '#5A8F6A');
  hill(ctx, x + w * 0.35, x + w * 1.2, y + H * 0.38, gy, '#4F8560');
  // The stand: stone tiers, stepping up to the middle, broken at the edges.
  const sx = x + w * 0.08, sw = w * 0.84, stTop = y + H * 0.38;
  const tiers = 5, th = (gy - H * 0.08 - stTop) / tiers;
  for (let i = 0; i < tiers; i++) {
    const ty = stTop + i * th;
    const inset = (tiers - i) * w * 0.012;
    // Ragged ends: the top tiers have crumbled away more.
    const bite = (tiers - i) * w * 0.02;
    ctx.fillStyle = i % 2 ? '#7A7660' : '#8A866E';
    ctx.fillRect(sx + inset + bite, ty, sw - inset * 2 - bite * 1.6, th);
    ctx.fillStyle = '#5E5B48';
    ctx.fillRect(sx + inset + bite, ty + th - 2, sw - inset * 2 - bite * 1.6, 2);
  }
  // Arches along the front, dark inside.
  ctx.fillStyle = '#3C3A2C';
  const arches = 7;
  for (let i = 0; i < arches; i++) {
    const ax = sx + sw * (0.1 + (i * 0.8) / (arches - 1));
    const aw = sw * 0.05, ah = th * 1.4, ay = gy - H * 0.08 - ah;
    ctx.beginPath();
    ctx.moveTo(ax - aw / 2, ay + ah);
    ctx.lineTo(ax - aw / 2, ay + aw / 2);
    ctx.arc(ax, ay + aw / 2, aw / 2, Math.PI, 0);
    ctx.lineTo(ax + aw / 2, ay + ah);
    ctx.fill();
  }
  // Moss streaks down the stone.
  ctx.fillStyle = 'rgba(79,138,54,0.6)';
  for (let i = 0; i < 12; i++) {
    const mx = sx + sw * ((i * 0.37 + 0.05) % 1);
    ctx.fillRect(mx, stTop + th * (i % 3), w * 0.012, H * (0.12 + (i % 4) * 0.05));
  }
  // Statues and broken columns on the tiers (ruins.js).
  const R = { stone: '#9A957C', shade: '#76725E', carve: '#45432F', moss: 'rgba(79,138,54,0.75)' };
  const foot = gy - H * 0.09;
  drawMonolith(ctx, x + w * 0.2, foot, H * 0.42, R);
  drawMonolith(ctx, x + w * 0.58, foot, H * 0.38, R, { headless: true });
  drawColumn(ctx, x + w * 0.8, foot, H * 0.34, H * 0.06, R, 0.3);
  drawColumn(ctx, x + w * 0.87, foot, H * 0.2, H * 0.06, R, 0.8);
  drawMonolith(ctx, x + w * 0.4, foot, H * 0.36, R, { lean: 0.1 });
  // Trees grown up through the stand and around it, their canopy over the top.
  const crowns = [[0.06, 0.22, 0.13], [0.24, 0.18, 0.1], [0.5, 0.12, 0.12], [0.74, 0.2, 0.11], [0.93, 0.16, 0.14]];
  for (const [fx, fy, fr] of crowns) {
    const cx = x + w * fx, cy = y + H * fy, r = H * fr * 1.6;
    ctx.fillStyle = '#3B2A1A';
    ctx.fillRect(cx - r * 0.08, cy, r * 0.16, gy - cy);
    ctx.fillStyle = '#1C3F18';
    ctx.beginPath();
    ctx.arc(cx + r * 0.2, cy + r * 0.15, r, 0, Math.PI * 2);
    ctx.arc(cx - r * 0.65, cy + r * 0.3, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2F6B2A';
    ctx.beginPath();
    ctx.arc(cx - r * 0.05, cy - r * 0.05, r * 0.82, 0, Math.PI * 2);
    ctx.arc(cx - r * 0.6, cy + r * 0.15, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#45923A';
    ctx.beginPath();
    ctx.arc(cx - r * 0.2, cy - r * 0.3, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  // Vines hanging down the stand, a flower here and there.
  ctx.strokeStyle = '#2A5A22';
  ctx.lineWidth = Math.max(1.5, w * 0.004);
  for (let i = 0; i < 10; i++) {
    const vx = sx + sw * ((i * 0.61 + 0.08) % 1);
    const len = H * (0.18 + (i % 4) * 0.07);
    ctx.beginPath();
    ctx.moveTo(vx, stTop - H * 0.02);
    ctx.quadraticCurveTo(vx + ((i % 3) - 1) * w * 0.015, stTop + len / 2, vx, stTop + len);
    ctx.stroke();
    if (i % 3 === 0) {
      ctx.fillStyle = ['#E8505B', '#F2B632', '#F07A3A'][i % 3 === 0 ? (i / 3) % 3 : 0];
      ctx.beginPath();
      ctx.arc(vx, stTop + len + 2, Math.max(2, w * 0.006), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Ferns and long grass along the bottom of the stand.
  ctx.fillStyle = '#3D7A2E';
  ctx.fillRect(x, gy - H * 0.08, w, H * 0.08 + 1);
  ctx.fillStyle = '#4F8A36';
  for (let i = 0; i < 24; i++) {
    const fx = x + (w * i) / 23;
    ctx.beginPath();
    ctx.moveTo(fx - w * 0.015, gy - H * 0.06);
    ctx.lineTo(fx, gy - H * (0.12 + (i % 3) * 0.03));
    ctx.lineTo(fx + w * 0.015, gy - H * 0.06);
    ctx.fill();
  }
  if (trackH) track(ctx, x, gy, w, trackH, { face: '#A35A3A', line: 'rgba(240,236,214,0.55)', curb: '#9A9478' });
  ctx.restore();
}

/**
 * Live survival's venue for the menus (render/venues.js COLOSSEUM): the
 * Colosseum from outside on a warm afternoon, three tiers of arches and the
 * attic over them, its far end broken down in steps as it is today, cypresses
 * and umbrella pines either side, and the arena's terracotta track along the
 * bottom.
 */
export function colosseum(ctx, x, y, w, h, { trackH = 0 } = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const gy = y + h - trackH;
  const H = gy - y;
  bands(ctx, x, y, w, H, ['#3D7FC4', '#79A7D6', '#C9D6DA', '#F3D9A4']);
  cloud(ctx, x + w * 0.18, y + H * 0.16, H * 0.07, '#FBF3E2', '#E2D3B4');
  cloud(ctx, x + w * 0.8, y + H * 0.11, H * 0.06, '#FBF3E2', '#E2D3B4');
  hill(ctx, x - w * 0.2, x + w * 0.5, y + H * 0.62, gy, '#B9B07E');
  hill(ctx, x + w * 0.45, x + w * 1.25, y + H * 0.58, gy, '#A9A372');
  // The facade: tiers from the ground up (the attic last), the right end broken off lower.
  const fx = x + w * 0.1, fw = w * 0.8;
  const base = gy - H * 0.04;
  const tier = H * 0.15;
  const STONE = '#D2BB8F', SHADE = '#A48C63', LEDGE = '#ECDCB6', DARK = '#3B2A1C';
  const tops = (fxr) => (fxr < 0.62 ? 4 : fxr < 0.78 ? 3 : fxr < 0.9 ? 2 : 1); // tiers standing at that point along it
  const bays = 13;
  const bw = fw / bays;
  for (let i = 0; i < bays; i++) {
    const bx = fx + i * bw;
    const n = tops((i + 0.5) / bays);
    for (let t = 0; t < n; t++) {
      const ty = base - (t + 1) * tier;
      ctx.fillStyle = STONE;
      ctx.fillRect(bx, ty, bw + 0.5, tier);
      ctx.fillStyle = LEDGE;
      ctx.fillRect(bx, ty, bw + 0.5, Math.max(2, tier * 0.08));
      if (t < 3) {
        // An arch in each bay, a half column beside it.
        const aw = bw * 0.56, ah = tier * 0.72;
        const ax = bx + bw * 0.55;
        ctx.fillStyle = DARK;
        ctx.beginPath();
        ctx.moveTo(ax - aw / 2, ty + tier);
        ctx.lineTo(ax - aw / 2, ty + tier - ah + aw / 2);
        ctx.arc(ax, ty + tier - ah + aw / 2, aw / 2, Math.PI, 0);
        ctx.lineTo(ax + aw / 2, ty + tier);
        ctx.fill();
        ctx.fillStyle = LEDGE;
        ctx.fillRect(bx + bw * 0.05, ty + tier * 0.1, bw * 0.12, tier * 0.9);
        ctx.fillStyle = SHADE;
        ctx.fillRect(bx + bw * 0.14, ty + tier * 0.1, bw * 0.03, tier * 0.9);
      } else {
        // The attic: a small square window every other bay.
        ctx.fillStyle = SHADE;
        ctx.fillRect(bx, ty + tier * 0.1, bw * 0.1, tier * 0.9);
        if (i % 2) {
          ctx.fillStyle = DARK;
          ctx.fillRect(bx + bw * 0.4, ty + tier * 0.4, bw * 0.24, tier * 0.26);
        }
      }
    }
    // A broken top where the tiers stop: a jagged edge of stone.
    const n2 = tops((i + 1.5) / bays);
    if (i < bays - 1 && n2 < n) {
      ctx.fillStyle = STONE;
      ctx.beginPath();
      ctx.moveTo(bx + bw, base - n * tier);
      ctx.lineTo(bx + bw * 1.35, base - (n - 0.4) * tier);
      ctx.lineTo(bx + bw * 1.15, base - (n - 0.7) * tier);
      ctx.lineTo(bx + bw * 1.5, base - n2 * tier);
      ctx.lineTo(bx + bw, base - n2 * tier);
      ctx.fill();
    }
  }
  // The awning's masts along the top of the attic.
  ctx.fillStyle = SHADE;
  for (let i = 0; i < bays * 0.62; i += 1.5) ctx.fillRect(fx + i * bw + bw * 0.5, base - 4 * tier - tier * 0.25, Math.max(1.5, bw * 0.05), tier * 0.25);
  // Cypresses and umbrella pines either side.
  const cypress = (cx, ch) => {
    ctx.fillStyle = '#2F4A2A';
    ctx.beginPath();
    ctx.ellipse(cx, gy - ch / 2, ch * 0.12, ch / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const umbrella = (cx, ch) => {
    ctx.fillStyle = '#5A4632';
    ctx.fillRect(cx - ch * 0.03, gy - ch, ch * 0.06, ch);
    ctx.fillStyle = '#3E5E34';
    ctx.beginPath();
    ctx.ellipse(cx, gy - ch, ch * 0.42, ch * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  cypress(x + w * 0.04, H * 0.48);
  cypress(x + w * 0.08, H * 0.36);
  umbrella(x + w * 0.94, H * 0.42);
  cypress(x + w * 0.985, H * 0.5);
  ctx.fillStyle = '#C9AE7A';
  ctx.fillRect(x, gy - H * 0.04, w, H * 0.04 + 1);
  if (trackH) track(ctx, x, gy, w, trackH, { face: '#B4532F', line: 'rgba(255,255,255,0.8)', curb: '#ECE4D2', lanes: 10 });
  ctx.restore();
}
