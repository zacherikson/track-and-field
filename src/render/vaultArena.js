import { text } from '../core/ui.js';
import { LAYOUT } from './track.js';
import { RunwayRenderer } from './runway.js';
import { venueFor } from './venues.js';

/**
 * Pole vault: the long jump's runway (with the colored edge stripes) ending
 * at the plant box (world x = 0), a big landing mat past it and the uprights,
 * as in the original. Heights are drawn at the same scale as the athletes, so
 * the scene can be tall: the vault scene pans the camera up and this renderer
 * draws sky above the stadium.
 */
export class VaultRenderer extends RunwayRenderer {
  constructor(cfg, venue = venueFor()) {
    super(cfg.runway, { from: 0, to: 0 }, cfg.runwayZones, venue);
    this.cfg = cfg;
    this.bar = null; // crossbar height (m): your best so far, or null
    this.lastHeight = null; // marker on the upright for the last vault (m)
    this.record = 6.95;
  }

  drawSky(ctx, view) {
    // Tall enough for the camera to rise into.
    const top = -900;
    const g = ctx.createLinearGradient(0, top, 0, LAYOUT.standsTop + 40);
    g.addColorStop(0, this.venue.sky.high);
    g.addColorStop(1, this.venue.sky.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, top, view.w, LAYOUT.standsTop + 40 - top);
  }

  drawTrack(ctx, view, camera) {
    const z = (f) => this.zNear + f;
    this.drawRunway(ctx, view, camera, this.cfg.mat.to + 4);
    // The box the pole plants in: a sunken steel trough ending at x = 0 (the
    // same metal as the starting blocks: shiny at the big meets, rusty at home).
    ctx.fillStyle = this.venue.blocks.railTop;
    this.quad(ctx, camera, view, -0.8, 0, z(0.4), z(0.6));
    ctx.fillStyle = this.venue.blocks.rail;
    this.quad(ctx, camera, view, -0.35, 0, z(0.43), z(0.57));
  }

  /** Pixels per meter of height at depth z (the athletes' own scale in their lane). */
  hPx(camera, z) {
    return camera.ppm * Math.pow(this.scaleAt(z), 0.2);
  }

  /** Screen point at world x, depth z, height h (m). */
  point(camera, view, x, z, h) {
    const p = this.project(camera, view, x, z);
    return { x: p.x, y: p.y - h * this.hPx(camera, z) };
  }

  poly(ctx, pts, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
  }

  /** The landing mat: blue sides, yellow top. Drawn before the athlete. */
  drawMat(ctx, view, camera) {
    const m = this.cfg.mat;
    const M = this.venue.mat;
    const z0 = this.zNear + 0.12;
    const z1 = this.zNear + 0.88;
    const P = (x, z, h) => this.point(camera, view, x, z, h);
    this.poly(ctx, [P(m.from, z0, 0), P(m.from, z1, 0), P(m.from, z1, m.height), P(m.from, z0, m.height)], M.side);
    this.poly(ctx, [P(m.from, z0, m.height), P(m.to, z0, m.height), P(m.to, z1, m.height), P(m.from, z1, m.height)], M.top);
    this.poly(ctx, [P(m.from, z0, 0), P(m.to, z0, 0), P(m.to, z0, m.height), P(m.from, z0, m.height)], M.front);
    // A lighter band along the top edge, and handles on the side.
    this.poly(ctx, [P(m.from, z0, m.height - 0.08), P(m.to, z0, m.height - 0.08), P(m.to, z0, m.height), P(m.from, z0, m.height)], M.topBand);
    ctx.fillStyle = M.handle;
    for (let x = m.from + 0.8; x < m.to - 0.4; x += 1.4) {
      const p = P(x, z0, m.height * 0.45);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** One upright (yellow post) at depth z, from the ground to 7.4 m. */
  drawPost(ctx, view, camera, z, labels) {
    const x = this.cfg.uprightX;
    const base = this.point(camera, view, x, z, 0);
    const top = this.point(camera, view, x, z, 7.4);
    const w = Math.max(3, 0.07 * this.hPx(camera, z));
    ctx.fillStyle = this.venue.upright.post;
    ctx.fillRect(base.x - w / 2, top.y, w, base.y - top.y);
    ctx.fillStyle = this.venue.upright.shade;
    ctx.fillRect(base.x + w / 2 - 1, top.y, 1, base.y - top.y);
    if (!labels) return;
    // Height marks every meter, and the world record, on the far post.
    for (let h = 1; h <= 7; h++) {
      const p = this.point(camera, view, x, z, h);
      ctx.fillStyle = '#fff';
      ctx.fillRect(p.x - w / 2 - 6, p.y - 1, 6, 2);
      text(ctx, `${h}`, p.x - w / 2 - 14, p.y, { size: 12, color: '#fff', shadow: true });
    }
    const wr = this.point(camera, view, x, z, this.record);
    ctx.fillStyle = '#e8281e';
    ctx.fillRect(wr.x + w / 2, wr.y - 7, 24, 14);
    text(ctx, 'WR', wr.x + w / 2 + 12, wr.y, { size: 10, color: '#fff' });
    if (this.lastHeight != null) {
      const p = this.point(camera, view, x, z, this.lastHeight);
      ctx.fillStyle = '#ff4b3e';
      ctx.beginPath();
      ctx.moveTo(p.x - w / 2 - 2, p.y);
      ctx.lineTo(p.x - w / 2 - 14, p.y - 7);
      ctx.lineTo(p.x - w / 2 - 14, p.y + 7);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** Far post and the crossbar: before the athlete. */
  drawUprightsBack(ctx, view, camera) {
    const zF = this.zNear + 0.95;
    const zN = this.zNear + 0.05;
    this.drawPost(ctx, view, camera, zF, true);
    if (this.bar != null) {
      const a = this.point(camera, view, this.cfg.uprightX, zF, this.bar);
      const b = this.point(camera, view, this.cfg.uprightX, zN, this.bar);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  /** Near post: after the athlete. */
  drawUprightsFront(ctx, view, camera) {
    this.drawPost(ctx, view, camera, this.zNear + 0.05, false);
  }
}
