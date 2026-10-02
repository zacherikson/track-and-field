import { text } from '../core/ui.js';
import { TrackRenderer, LAYOUT } from './track.js';
import { venueFor } from './venues.js';

/**
 * Long jump runway: the stadium from TrackRenderer (stands, boards, grass,
 * perspective), with the track replaced by infield grass, a runway strip, the
 * white takeoff board ending at the foul line (world x = 0), and a sand pit
 * with distance signs every meter from the line, as in the original.
 * One "lane" deep; the athlete runs down its middle.
 */
export class RunwayRenderer extends TrackRenderer {
  constructor(runway, pit, zones = [], venue = venueFor()) {
    super(1, 0, null, venue);
    this.runway = runway;
    this.pit = pit; // { from, to } in m from the foul line
    this.zones = zones; // colored runway sections: { from, to, color } in m before the line
    this.marks = []; // landing marks in the sand: { x }
    this.footmarks = []; // takeoff footprints on the runway/board: { x, foul }
  }

  /**
   * Infield grass and the runway strip up to world x `end`, with the colored
   * edge stripes (`zones`) before x = 0.
   */
  drawRunway(ctx, view, camera, end) {
    const zN = this.zNear;
    const z = (f) => zN + f;
    const G = this.venue.grass;
    const T = this.venue.track;
    ctx.fillStyle = G.base;
    ctx.fillRect(0, LAYOUT.farY, view.w, LAYOUT.nearY - LAYOUT.farY);
    // Mowed stripes on the infield, if anyone mows it.
    const [l, r] = this.rangeAt(camera, view, zN);
    if (G.stripe) {
      ctx.fillStyle = G.stripe;
      for (let m = Math.floor(l / 8) * 8; m < r; m += 8) this.quad(ctx, camera, view, m, m + 4, z(0), z(1));
    }

    // Runway: a strip down the middle of the lane, with white edge lines.
    const r0 = z(0.28), r1 = z(0.72);
    ctx.fillStyle = T.surface;
    this.quad(ctx, camera, view, -this.runway - 20, end, r0, r1);
    if (T.worn) this.drawWear(ctx, view, camera, T.worn, r0, r1);
    ctx.fillStyle = T.paint;
    this.quad(ctx, camera, view, -this.runway - 20, end, r0, r0 + 0.02);
    this.quad(ctx, camera, view, -this.runway - 20, end, r1 - 0.02, r1);

    // Colored sections before x = 0, as in the original: the runway's edge
    // stripes turn yellow, then orange, then red as you near the line.
    const edge = 0.045;
    for (const zn of this.zones) {
      ctx.fillStyle = zn.color;
      this.quad(ctx, camera, view, -zn.from, -zn.to, r0, r0 + edge);
      this.quad(ctx, camera, view, -zn.from, -zn.to, r1 - edge, r1);
    }
  }

  drawTrack(ctx, view, camera) {
    const z = (f) => this.zNear + f; // depth across the single lane, 0 = near edge, 1 = far edge
    this.drawRunway(ctx, view, camera, this.pit.from);
    const r0 = z(0.28), r1 = z(0.72);

    // Sand pit, wider than the runway, with a concrete rim.
    const p0 = z(0.16), p1 = z(0.84);
    ctx.fillStyle = this.venue.sand.rim;
    this.quad(ctx, camera, view, this.pit.from - 0.15, this.pit.to + 0.15, p0 - 0.03, p1 + 0.03);
    ctx.fillStyle = this.venue.sand.sand;
    this.quad(ctx, camera, view, this.pit.from, this.pit.to, p0, p1);

    // Takeoff board (white) and the red foul line at its front edge.
    ctx.fillStyle = this.venue.board.face;
    this.quad(ctx, camera, view, -0.2, 0, r0, r1);
    ctx.fillStyle = this.venue.board.foul;
    this.quad(ctx, camera, view, 0, 0.07, r0, r1);

    // Footmark where you took off, so you can see how close to the line you were.
    for (const f of this.footmarks) {
      // A shoe print (toe pointing down the runway) with a light rim so it reads on the red track.
      const a = this.project(camera, view, f.x - 0.2, z(0.47));
      const b = this.project(camera, view, f.x + 0.12, z(0.47));
      const len = Math.max(10, b.x - a.x);
      const cx = (a.x + b.x) / 2;
      const cy = a.y;
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.fillStyle = f.foul ? '#b0101a' : '#2a1f1c';
      for (const [ox, rx, ry] of [[0.18, 0.32, 4.5], [-0.3, 0.2, 3.6]]) {
        ctx.beginPath();
        ctx.ellipse(cx + ox * len, cy, rx * len, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fill();
      }
      ctx.restore();
    }

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
      const S = this.venue.signs;
      ctx.fillStyle = S.post;
      ctx.fillRect(p.x - 1, p.y - 14 * s, 2, 14 * s);
      ctx.fillStyle = S.plate;
      ctx.fillRect(p.x - 11 * s, p.y - 34 * s, 22 * s, 20 * s);
      text(ctx, String(m), p.x, p.y - 24 * s, { size: Math.round(14 * s), color: S.text });
    }
  }
}
