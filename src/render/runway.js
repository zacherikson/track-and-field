import { text } from '../core/ui.js';
import { TrackRenderer, LAYOUT } from './track.js';

/**
 * Long jump runway: the stadium from TrackRenderer (stands, boards, grass,
 * perspective), with the track replaced by infield grass, a runway strip, the
 * white takeoff board ending at the foul line (world x = 0), and a sand pit
 * with distance signs every meter from the line, as in the original.
 * One "lane" deep; the athlete runs down its middle.
 */
export class RunwayRenderer extends TrackRenderer {
  constructor(runway, pit) {
    super(1, 0, null);
    this.runway = runway;
    this.pit = pit; // { from, to } in m from the foul line
    this.marks = []; // landing marks in the sand: { x, foul }
  }

  drawTrack(ctx, view, camera) {
    const zN = this.zNear;
    const z = (f) => zN + f; // depth across the single lane, 0 = near edge, 1 = far edge
    ctx.fillStyle = '#4f9c41';
    ctx.fillRect(0, LAYOUT.farY, view.w, LAYOUT.nearY - LAYOUT.farY);
    // Mowed stripes on the infield.
    ctx.fillStyle = '#58a849';
    const [l, r] = this.rangeAt(camera, view, zN);
    for (let m = Math.floor(l / 8) * 8; m < r; m += 8) this.quad(ctx, camera, view, m, m + 4, z(0), z(1));

    // Runway: a strip down the middle of the lane, with white edge lines.
    const r0 = z(0.28), r1 = z(0.72);
    ctx.fillStyle = '#c1502e';
    this.quad(ctx, camera, view, -this.runway - 20, this.pit.from, r0, r1);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    this.quad(ctx, camera, view, -this.runway - 20, this.pit.from, r0, r0 + 0.02);
    this.quad(ctx, camera, view, -this.runway - 20, this.pit.from, r1 - 0.02, r1);

    // Sand pit, wider than the runway, with a concrete rim.
    const p0 = z(0.16), p1 = z(0.84);
    ctx.fillStyle = '#d9d2c3';
    this.quad(ctx, camera, view, this.pit.from - 0.15, this.pit.to + 0.15, p0 - 0.03, p1 + 0.03);
    ctx.fillStyle = '#e6cf95';
    this.quad(ctx, camera, view, this.pit.from, this.pit.to, p0, p1);

    // Takeoff board (white), ending at the foul line, and the plasticine strip past it.
    ctx.fillStyle = '#f7f7f2';
    this.quad(ctx, camera, view, -0.2, 0, r0, r1);
    ctx.fillStyle = '#7a8a55';
    this.quad(ctx, camera, view, 0, 0.1, r0, r1);

    // Landing marks from this round.
    for (const m of this.marks) {
      const a = this.project(camera, view, m.x - 0.15, z(0.5));
      const b = this.project(camera, view, m.x + 0.15, z(0.5));
      ctx.fillStyle = 'rgba(120,90,40,0.55)';
      ctx.beginPath();
      ctx.ellipse((a.x + b.x) / 2, a.y + 4, Math.max(4, (b.x - a.x) / 2), 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Distance signs along the far edge of the pit: a meter every meter from the line.
    for (let m = Math.ceil(this.pit.from); m <= Math.floor(this.pit.to); m++) {
      const p = this.project(camera, view, m, p1 + 0.04);
      if (p.x < -30 || p.x > view.w + 30) continue;
      const s = this.scaleAt(p1);
      ctx.fillStyle = '#fff';
      ctx.fillRect(p.x - 1, p.y - 14 * s, 2, 14 * s);
      ctx.fillStyle = '#c62828';
      ctx.fillRect(p.x - 11 * s, p.y - 34 * s, 22 * s, 20 * s);
      text(ctx, String(m), p.x, p.y - 24 * s, { size: Math.round(14 * s), color: '#fff' });
    }
  }
}
