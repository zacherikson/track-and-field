import { text } from '../core/ui.js';

/**
 * Side-on stadium with real one-point perspective, framed like the original:
 * the camera sits just ahead of the player (see CONFIG.camera.lead), low and
 * close, so runners are big and you see a little more of what's coming than of
 * what's behind.
 *
 * Ground plane: a point at world x (m, along the track) and depth z (in lane
 * widths from the camera) projects to
 *
 *   screenY = horizonY + K / z
 *   screenX = centerX + (x - camera.x) * ppm * (zRef / z)
 *
 * so lanes get taller toward the viewer and lines crossing the track fan out
 * from the camera's position: nearly vertical right in front of it, leaning
 * more the further away they are. zRef is the player's lane, which is drawn at
 * exactly `ppm` pixels per meter. K and the near depth are solved from three
 * screen heights: the horizon and the track's near and far edges.
 *
 * Lanes: internally lane 1 is nearest the camera (the player's lane); the
 * numbers painted on the track count the other way, 1 (far) to 6 (near).
 * Runners are drawn at (almost) the same size in every lane, as in the original.
 */
export const LAYOUT = {
  standsTop: 26,
  boardsTop: 128,
  grassTop: 152,
  horizonY: 57, // vanishing line of the ground plane (above the stands, off the ground)
  farY: 280, // far edge of the track
  nearY: 470, // near edge of the track
  nearBoardsTop: 478, // ad boards along the near side, below the track
};

export class TrackRenderer {
  /** @param blocksX world x (m) of the athletes' start position, for drawing starting blocks */
  constructor(lanes, distance, blocksX = null) {
    this.lanes = lanes;
    this.distance = distance;
    this.blocksX = blocksX;
    const L = LAYOUT;
    const ratio = (L.nearY - L.horizonY) / (L.farY - L.horizonY);
    this.zNear = lanes / (ratio - 1);
    this.zFar = this.zNear + lanes;
    this.K = (L.nearY - L.horizonY) * this.zNear;
    this.zRef = this.laneZ(1);
    this.zGrassTop = this.zAtY(L.grassTop);
    this.trackBottom = L.nearY;
  }

  /** Number painted on the track for internal lane `lane` (1 = nearest). */
  laneNumber(lane) {
    return this.lanes + 1 - lane;
  }

  laneZ(lane) {
    return this.zNear + lane - 0.5;
  }

  yAt(z) {
    return LAYOUT.horizonY + this.K / z;
  }

  zAtY(y) {
    return this.K / (y - LAYOUT.horizonY);
  }

  /** Horizontal scale at depth z relative to the player's lane. */
  scaleAt(z) {
    return this.zRef / z;
  }

  project(camera, view, x, z) {
    return { x: camera.toScreenX(x, view.w, this.scaleAt(z)), y: this.yAt(z) };
  }

  /** Screen position of the ground point at world x (m) in `lane`. */
  toScreen(camera, view, x, lane) {
    return this.project(camera, view, x, this.laneZ(lane));
  }

  /** Runner size multiplier for a lane: nearly constant, like the original's sprites. */
  figureScale(lane) {
    return Math.pow(this.scaleAt(this.laneZ(lane)), 0.2);
  }

  /** World x range (m) visible at depth z, with a margin. */
  rangeAt(camera, view, z, margin = 2) {
    const [l, r] = camera.visibleRange(view.w, this.scaleAt(z));
    return [l - margin, r + margin];
  }

  draw(ctx, view, camera) {
    this.drawSky(ctx, view);
    this.drawStands(ctx, view, camera);
    this.drawBoards(ctx, view, camera, LAYOUT.boardsTop, LAYOUT.grassTop - LAYOUT.boardsTop, 0.24, 13);
    this.drawGrass(ctx, view, camera);
    this.drawTrack(ctx, view, camera);
    this.drawNearSide(ctx, view, camera);
  }

  /** Brighten one lane (used to flash the player's lane before the start). */
  highlightLane(ctx, view, lane, alpha) {
    const y0 = this.yAt(this.zNear + lane);
    const y1 = this.yAt(this.zNear + lane - 1);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect(0, y0, view.w, y1 - y0);
  }

  drawSky(ctx, view) {
    const g = ctx.createLinearGradient(0, 0, 0, LAYOUT.standsTop + 40);
    g.addColorStop(0, '#5aa9e6');
    g.addColorStop(1, '#a9d6f5');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, LAYOUT.standsTop + 40);
  }

  drawStands(ctx, view, camera) {
    const top = LAYOUT.standsTop;
    const bottom = LAYOUT.boardsTop;
    ctx.fillStyle = '#39465e';
    ctx.fillRect(0, top, view.w, bottom - top);
    ctx.fillStyle = '#2a3346';
    ctx.fillRect(0, top, view.w, 8);

    // Crowd: a grid of "heads" colored by a hash of their seat. Far away, so it
    // scrolls much slower than the track (parallax).
    const par = 0.2;
    const seatW = 14;
    const offset = camera.x * camera.ppm * par;
    const first = Math.floor(offset / seatW) - 1;
    const count = Math.ceil(view.w / seatW) + 2;
    const palette = ['#f4d35e', '#ee964b', '#f95738', '#faf0ca', '#0d3b66', '#8ecae6', '#e9edc9', '#b5838d'];
    for (let row = 0; row < 6; row++) {
      const y = top + 14 + row * 14;
      const rowShift = (row % 2) * (seatW / 2);
      for (let i = first; i < first + count; i++) {
        const h = hash(i * 31 + row * 7919);
        if (h % 7 === 0) continue; // empty seat
        const x = i * seatW - offset + rowShift;
        ctx.fillStyle = palette[h % palette.length];
        ctx.fillRect(x, y, 9, 9);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, y + 10, view.w, 2);
    }
  }

  drawBoards(ctx, view, camera, top, h, par, size) {
    const boardW = 180 * Math.max(1, par);
    const offset = camera.x * camera.ppm * par;
    const first = Math.floor(offset / boardW) - 1;
    const words = ['THUMBATHLON', 'TAP TAP GO', 'FAST THUMBS', 'RUN JUNO RUN', 'NO FALSE STARTS'];
    const colors = ['#1b998b', '#e4572e', '#2e294e', '#f1c40f', '#3f88c5'];
    for (let i = first; i < first + Math.ceil(view.w / boardW) + 2; i++) {
      const x = i * boardW - offset;
      const k = ((i % words.length) + words.length) % words.length;
      ctx.fillStyle = colors[k];
      ctx.fillRect(x, top, boardW - 2, h);
      text(ctx, words[k], x + boardW / 2, top + h / 2 + 1, { size, color: k === 3 ? '#222' : '#fff' });
    }
  }

  /** A ground-plane quad between world x0..x1 and depths z0..z1. */
  quad(ctx, camera, view, x0, x1, z0, z1) {
    const a = this.project(camera, view, x0, z0);
    const b = this.project(camera, view, x1, z0);
    const c = this.project(camera, view, x1, z1);
    const d = this.project(camera, view, x0, z1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }

  /** Infield grass beyond the track, mowed in stripes that follow the perspective. */
  drawGrass(ctx, view, camera) {
    ctx.fillStyle = '#4c9a3f';
    ctx.fillRect(0, LAYOUT.grassTop, view.w, LAYOUT.farY - LAYOUT.grassTop);
    ctx.fillStyle = '#56a847';
    const stripeM = 4;
    const [from, to] = this.rangeAt(camera, view, this.zGrassTop);
    for (let m = Math.floor(from / (stripeM * 2)) * stripeM * 2; m < to; m += stripeM * 2) {
      this.quad(ctx, camera, view, m, m + stripeM, this.zFar, this.zGrassTop);
    }
    // Distance labels on the grass along the far edge of the track.
    const zl = this.zFar + 0.8;
    const [l, r] = this.rangeAt(camera, view, zl);
    for (let m = Math.ceil(l / 10) * 10; m <= r; m += 10) {
      if (m <= 0 || m >= this.distance) continue;
      const p = this.project(camera, view, m, zl);
      text(ctx, `${m}m`, p.x, p.y, { size: 14, color: 'rgba(255,255,255,0.85)' });
    }
  }

  drawTrack(ctx, view, camera) {
    const top = LAYOUT.farY;
    const bottom = LAYOUT.nearY;
    ctx.fillStyle = '#c1502e';
    ctx.fillRect(0, top, view.w, bottom - top);

    // Lane lines: horizontal, closer together further away.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let k = 0; k <= this.lanes; k++) {
      const y = this.yAt(this.zNear + k);
      const w = 1.5 + 1.5 * this.scaleAt(this.zNear + k);
      ctx.fillRect(0, y - w / 2, view.w, w);
    }

    // Lines across the track: straight lines between the near and far edges.
    const line = (xm, width, color) => {
      const a = this.project(camera, view, xm, this.zNear);
      const b = this.project(camera, view, xm, this.zFar);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };
    const [from, to] = this.rangeAt(camera, view, this.zFar);
    for (let m = Math.ceil(from / 10) * 10; m <= to; m += 10) {
      if (m > 0 && m < this.distance) line(m, 2, 'rgba(255,255,255,0.35)');
    }
    line(0, 5, '#fff');
    // Finish (as in the original): a single white line, no checkerboard.
    const D = this.distance;
    line(D, 5, '#fff');
    this.drawFinishTicks(ctx, view, camera);
    if (this.blocksX != null) this.drawStartBlocks(ctx, view, camera);

    // Lane numbers: small and upright just past the start line; big and painted
    // flat on the track, turned sideways, just before the finish line.
    for (let k = 1; k <= this.lanes; k++) {
      const z = this.laneZ(k);
      const size = Math.round(12 + 14 * this.scaleAt(z));
      const p = this.project(camera, view, 0.9, z);
      if (p.x > -40 && p.x < view.w + 40) text(ctx, String(this.laneNumber(k)), p.x, p.y + 1, { size, color: 'rgba(255,255,255,0.9)' });
      this.drawPaintedNumber(ctx, view, camera, this.laneNumber(k), D - 1.1, z);
    }
    this.drawFinishPost(ctx, view, camera);
  }

  /**
   * Starting blocks in every lane (as in the original): a grey rail with a red
   * pedal under each foot of the READY pose (front foot about 0.1 m ahead of the
   * athlete's start position, back foot about 0.5 m behind it).
   */
  drawStartBlocks(ctx, view, camera) {
    if (this.project(camera, view, this.blocksX, this.zNear).x < -80 && this.project(camera, view, this.blocksX, this.zFar).x < -80) return;
    for (let k = this.lanes; k >= 1; k--) {
      const z = this.laneZ(k);
      const s = this.scaleAt(z);
      // Match where the (nearly constant-size) athlete's feet are drawn in this lane.
      const x0 = this.blocksX + (this.blocksNudge?.(k) ?? 0);
      const f = this.figureScale(k) / s; // figure meters -> track meters in this lane
      const a = this.project(camera, view, x0 - 0.62 * f, z);
      const b = this.project(camera, view, x0 + 0.15 * f, z);
      ctx.strokeStyle = '#8a8f98';
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      for (const [dx, dz] of [[0.08, -0.12], [-0.5, 0.12]]) {
        const p = this.project(camera, view, x0 + dx * f, z + dz);
        const w = 0.09 * camera.ppm * s;
        const h = 11 * s;
        ctx.fillStyle = '#d7263d';
        ctx.beginPath();
        ctx.moveTo(p.x - w, p.y);
        ctx.lineTo(p.x, p.y);
        ctx.lineTo(p.x - w * 0.35, p.y - h);
        ctx.lineTo(p.x - w * 1.2, p.y - h);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  /** A short dash across the middle of each lane at 5, 4 and 3 m before the line. */
  drawFinishTicks(ctx, view, camera) {
    const D = this.distance;
    if (this.project(camera, view, D - 6, this.zNear).x > view.w + 60) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    for (const back of [5, 4, 3]) {
      for (let k = 1; k <= this.lanes; k++) {
        const zc = this.laneZ(k);
        ctx.lineWidth = 1 + 1.5 * this.scaleAt(zc);
        const a = this.project(camera, view, D - back, zc - 0.28);
        const b = this.project(camera, view, D - back, zc + 0.28);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  /**
   * A big lane number painted on the track, turned sideways (its top points in
   * the running direction) and squashed to the lane's height, like the original.
   */
  drawPaintedNumber(ctx, view, camera, n, xm, z) {
    const p = this.project(camera, view, xm, z);
    if (p.x < -80 || p.x > view.w + 80) return;
    const pxPerM = camera.ppm * this.scaleAt(z);
    const laneH = this.yAt(z - 0.5) - this.yAt(z + 0.5);
    const size = (0.95 * pxPerM) / 0.72; // digit height covers ~0.95 m of track
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1, (0.8 * laneH) / (0.62 * size)); // digit width fills ~80% of the lane
    ctx.rotate(Math.PI / 2);
    text(ctx, String(n), 0, 0, { size, color: 'rgba(255,255,255,0.92)', weight: 800 });
    ctx.restore();
  }

  drawFinishPost(ctx, view, camera) {
    const base = this.project(camera, view, this.distance, this.zFar);
    if (base.x < -200 || base.x > view.w + 200) return;
    const s = this.scaleAt(this.zFar);
    const h = 190 * s;
    ctx.fillStyle = '#ddd';
    ctx.fillRect(base.x - 3, base.y - h, 6, h);
    ctx.fillStyle = '#12203a';
    ctx.fillRect(base.x - 55, base.y - h - 30, 110, 32);
    text(ctx, 'FINISH', base.x, base.y - h - 14, { size: 17, color: '#ffb400' });
  }

  /** In front of the near lane: a curb with 1m ticks, then ad boards (nearer = faster). */
  drawNearSide(ctx, view, camera) {
    const top = LAYOUT.nearY;
    ctx.fillStyle = '#3f8f3a';
    ctx.fillRect(0, top, view.w, LAYOUT.nearBoardsTop - top);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, top, view.w, 5);
    ctx.fillStyle = '#9a9a9a';
    const [l, r] = this.rangeAt(camera, view, this.zNear);
    for (let m = Math.floor(l); m < r; m++) {
      ctx.fillRect(this.project(camera, view, m, this.zNear).x, top, 3, 5);
    }
    this.drawBoards(ctx, view, camera, LAYOUT.nearBoardsTop, view.h - LAYOUT.nearBoardsTop, 1.3, 20);
  }
}

function hash(n) {
  n = (n ^ 61) ^ (n >>> 16);
  n = Math.imul(n, 9);
  n ^= n >>> 4;
  n = Math.imul(n, 0x27d4eb2d);
  n ^= n >>> 15;
  return n >>> 0;
}
