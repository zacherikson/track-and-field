import { text } from '../core/ui.js';
import { LAYOUT } from './track.js';
import { RunwayRenderer } from './runway.js';

const hash = (n) => {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
};

/** A javelin: yellow-green shaft, dark grip in the middle, metal tip. Centered at (x, y), angle ang (rad, + = tip up). */
export function drawJavelin(ctx, x, y, len, ang, w = 4) {
  const dx = Math.cos(ang) * len / 2;
  const dy = -Math.sin(ang) * len / 2;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#2d5a12';
  ctx.lineWidth = w + 2;
  ctx.beginPath();
  ctx.moveTo(x - dx, y - dy);
  ctx.lineTo(x + dx, y + dy);
  ctx.stroke();
  ctx.strokeStyle = '#c9e84a';
  ctx.lineWidth = w;
  ctx.stroke();
  // Grip.
  ctx.strokeStyle = '#2d5a12';
  ctx.lineWidth = w + 1;
  ctx.beginPath();
  ctx.moveTo(x - dx * 0.12, y - dy * 0.12);
  ctx.lineTo(x + dx * 0.1, y + dy * 0.1);
  ctx.stroke();
  // Tip.
  ctx.strokeStyle = '#e8eef2';
  ctx.lineWidth = w * 0.7;
  ctx.beginPath();
  ctx.moveTo(x + dx * 0.88, y + dy * 0.88);
  ctx.lineTo(x + dx, y + dy);
  ctx.stroke();
  ctx.restore();
}

/**
 * Javelin: the long jump's runway (colored edge stripes) ending at the foul
 * line (world x = 0), with the grass sector beyond it, as in the original. Plus
 * the two other shots from the original: the flight (following the javelin up
 * over the stands to the hills and the sea) and the landing (looking down the
 * field at the distance boards, the javelin stuck in the grass).
 */
export class JavelinRenderer extends RunwayRenderer {
  constructor(cfg, record) {
    super(cfg.runway, { from: 0, to: 0 }, cfg.runwayZones);
    this.cfg = cfg;
    this.record = record;
  }

  drawTrack(ctx, view, camera) {
    const z = (f) => this.zNear + f;
    // Grass sector beyond the line, over the whole infield strip.
    this.drawRunway(ctx, view, camera, 0);
    ctx.fillStyle = '#7ccf55';
    this.quad(ctx, camera, view, 0, 400, z(0), z(1));
    ctx.fillStyle = '#86d65e';
    for (let m = 0; m < 400; m += 10) this.quad(ctx, camera, view, m, m + 5, z(0), z(1));
    // Sector lines opening out from the line.
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    for (const [z0, z1, x1] of [[z(0.72), z(1), 12], [z(0.28), z(0), 4]]) {
      const a = this.project(camera, view, 0.1, z0);
      const b = this.project(camera, view, x1, z1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // The foul line (white) with black-and-white blocks at both ends.
    const r0 = z(0.28), r1 = z(0.72);
    ctx.fillStyle = '#f7f7f2';
    this.quad(ctx, camera, view, -0.07, 0, r0, r1);
    for (const [za, zb] of [[r0 - 0.06, r0], [r1, r1 + 0.06]]) {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i % 2 ? '#fff' : '#151515';
        this.quad(ctx, camera, view, -0.35 + i * 0.12, -0.23 + i * 0.12, za, zb);
      }
    }
  }

  /** Sky with clouds, hills and the sea on the horizon at y `hy`, scrolling with world x `x` (m). */
  drawSkyline(ctx, view, x, hy) {
    const g = ctx.createLinearGradient(0, 0, 0, hy);
    g.addColorStop(0, '#6fb4ea');
    g.addColorStop(1, '#cfe8f7');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
    // Clouds (far: slow parallax).
    for (let i = -2; i < 8; i++) {
      const k = Math.floor(x * 1.5 / 260) + i;
      const h = hash(k * 977);
      const cx = k * 260 - x * 1.5 + (h % 90);
      const cy = hy - 150 - (h % 170);
      if (cy < -40) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      for (const [ox, oy, r] of [[0, 0, 22], [24, -8, 26], [52, 0, 20], [26, 8, 18]]) {
        ctx.beginPath();
        ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Sea, with a few sails.
    ctx.fillStyle = '#3f9fd3';
    ctx.fillRect(0, hy - 34, view.w, 34);
    for (let i = -1; i < 6; i++) {
      const k = Math.floor(x * 3 / 300) + i;
      const sx = k * 300 - x * 3 + (hash(k * 131) % 120);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(sx, hy - 30);
      ctx.lineTo(sx + 9, hy - 12);
      ctx.lineTo(sx - 5, hy - 12);
      ctx.closePath();
      ctx.fill();
    }
    // Green hills with little white houses and dark trees.
    ctx.fillStyle = '#76b85a';
    ctx.beginPath();
    ctx.moveTo(0, view.h);
    for (let sx = 0; sx <= view.w + 20; sx += 20) {
      const wx = sx + x * 5;
      ctx.lineTo(sx, hy - 14 - 10 * Math.sin(wx / 160) - 6 * Math.sin(wx / 57));
    }
    ctx.lineTo(view.w, view.h);
    ctx.closePath();
    ctx.fill();
    for (let i = -1; i < 14; i++) {
      const k = Math.floor(x * 5 / 110) + i;
      const h = hash(k * 733);
      const sx = k * 110 - x * 5 + (h % 60);
      const sy = hy + 6 + (h % 26);
      if (h % 3) {
        ctx.fillStyle = '#fbfbf4';
        ctx.fillRect(sx, sy - 12, 30, 12);
        ctx.fillStyle = '#e8a33c';
        ctx.fillRect(sx - 2, sy - 16, 34, 5);
      } else {
        ctx.fillStyle = '#2f6b3a';
        ctx.beginPath();
        ctx.moveTo(sx + 5, sy - 26);
        ctx.lineTo(sx + 11, sy);
        ctx.lineTo(sx - 1, sy);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  /** The flight shot's field edge on screen for a javelin `y` m up: the stands sink as it climbs but stay in view. */
  flightGround(view, y) {
    return view.h * 0.56 + y * 8;
  }

  /**
   * The flight shot: the javelin stays near the middle of the screen; the
   * stands sink as it climbs (hills and sea come into view behind them) and
   * the field comes back up as it falls. `x`, `y`: javelin world position (m).
   */
  drawFlight(ctx, view, camera, x, y) {
    const groundY = this.flightGround(view, y); // screen y of the field's near edge
    const dy = groundY - LAYOUT.grassTop;
    this.drawSkyline(ctx, view, x, LAYOUT.standsTop + dy - 6);
    ctx.save();
    ctx.translate(0, dy);
    this.drawStands(ctx, view, camera);
    this.drawBoards(ctx, view, camera, LAYOUT.boardsTop, LAYOUT.grassTop - LAYOUT.boardsTop, 0.24, 13);
    ctx.restore();
    // The field, seen side on, with distance boards along the far edge.
    ctx.fillStyle = '#7ccf55';
    ctx.fillRect(0, groundY, view.w, view.h - groundY);
    ctx.fillStyle = '#86d65e';
    for (let m = Math.floor(x / 10) * 10 - 40; m < x + 40; m += 10) {
      const a = view.w * 0.45 + (m - x) * camera.ppm * 0.6;
      ctx.fillRect(a, groundY, 5 * camera.ppm * 0.6, view.h - groundY);
    }
    for (let d = 10; d <= 110; d += 10) this.drawBoard(ctx, view.w * 0.45 + (d - x) * camera.ppm * 0.6, groundY + 4, String(d), false, 1);
    this.drawBoard(ctx, view.w * 0.45 + (this.record - x) * camera.ppm * 0.6, groundY + 4, 'WR', true, 1);
  }

  /** A distance board: white sign (red for the record) on a red base. */
  drawBoard(ctx, x, y, label, wr, s) {
    if (x < -60 || x > 3000) return;
    const w = 34 * s, h = 22 * s;
    ctx.fillStyle = wr ? '#d9281e' : '#fff';
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = wr ? '#fff' : '#d9281e';
    ctx.fillRect(x - w / 2, y - 4 * s, w, 4 * s);
    text(ctx, label, x, y - h / 2 - 1.5 * s, { size: Math.round(13 * s), color: wr ? '#fff' : '#1b2433' });
  }
}
