import { text } from '../core/ui.js';
import { CONFIG } from '../config.js';
import { BLOCK_FEET } from '../athletes/stickFigure.js';
import { venueFor } from './venues.js';

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
 *
 * Venue: `this.venue` (render/venues.js) decides how the place looks — the sky,
 * whether there's a stand or a treeline behind the track, the surface color,
 * the paint, the equipment. It never moves the ground: LAYOUT below is the same
 * in every venue, so the perspective solve and every camera stay put.
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
  constructor(lanes, distance, blocksX = null, venue = venueFor()) {
    this.lanes = lanes;
    this.distance = distance;
    this.blocksX = blocksX;
    this.venue = venue;
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
    g.addColorStop(0, this.venue.sky.top);
    g.addColorStop(1, this.venue.sky.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, LAYOUT.standsTop + 40);
  }

  drawStands(ctx, view, camera) {
    const s = this.venue.stands;
    if (!s) return this.drawBackdrop(ctx, view, camera);
    const top = LAYOUT.standsTop;
    const bottom = LAYOUT.boardsTop;
    ctx.fillStyle = s.body;
    ctx.fillRect(0, top, view.w, bottom - top);
    ctx.fillStyle = s.roof;
    ctx.fillRect(0, top, view.w, 8);

    // Crowd: a grid of "heads" colored by a hash of their seat. Far away, so it
    // scrolls much slower than the track (parallax). A big stadium packs more,
    // smaller rows into the same band and leaves no seat empty; a school meet
    // has a few rows and gaps all through them (venues.js `emptyEvery`).
    const par = 0.2;
    const seatW = s.seatW;
    const head = Math.max(5, seatW - 5);
    const offset = camera.x * camera.ppm * par;
    const first = Math.floor(offset / seatW) - 1;
    const count = Math.ceil(view.w / seatW) + 2;
    for (let row = 0; row < s.rows; row++) {
      const y = top + s.rowH + row * s.rowH;
      const rowShift = (row % 2) * (seatW / 2);
      for (let i = first; i < first + count; i++) {
        const h = hash(i * 31 + row * 7919);
        if (s.emptyEvery && h % s.emptyEvery === 0) continue; // empty seat
        const x = i * seatW - offset + rowShift;
        ctx.fillStyle = s.crowd[h % s.crowd.length];
        ctx.fillRect(x, y, head, head);
      }
      ctx.fillStyle = s.shade;
      ctx.fillRect(0, y + head + 1, view.w, 2);
    }
    if (this.venue.flashes) this.drawFlashes(ctx, view, camera, top, bottom);
    if (this.venue.lights) this.drawLights(ctx, view, camera, top);
  }

  /**
   * No stand: low hills and a pine treeline behind the track instead, on the
   * same slow parallax a crowd would have. The near fence (drawFence) covers
   * the trunks, so the woods read as being on the other side of it.
   */
  drawBackdrop(ctx, view, camera) {
    const b = this.venue.backdrop;
    const top = LAYOUT.standsTop;
    const bottom = LAYOUT.boardsTop;
    const offset = camera.x * camera.ppm * 0.2;
    const ridge = (color, lift, drift, a1, w1, a2, w2) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, bottom);
      for (let sx = 0; sx <= view.w + 16; sx += 16) {
        const wx = sx + offset * drift;
        ctx.lineTo(sx, top + lift - a1 * Math.sin(wx / w1) - a2 * Math.sin(wx / w2));
      }
      ctx.lineTo(view.w, bottom);
      ctx.closePath();
      ctx.fill();
    };
    ridge(b.hillFar, 11, 1, 7, 190, 4, 71);
    ridge(b.hill, 31, 1.4, 9, 130, 5, 47);

    // Pines along the bottom of the band, a ragged line of them.
    const treeW = 26;
    const near = offset * 1.8;
    const first = Math.floor(near / treeW) - 1;
    for (let i = first; i < first + Math.ceil(view.w / treeW) + 2; i++) {
      const h = hash(i * 5471);
      const x = i * treeW - near + (h % 10);
      const base = bottom + 3;
      const ht = 34 + (h % 22);
      const halfW = 8 + (h % 5);
      ctx.fillStyle = b.trunk;
      ctx.fillRect(x - 1.5, base - 5, 3, 6);
      ctx.fillStyle = h % 3 ? b.tree : b.treeLit;
      ctx.beginPath();
      ctx.moveTo(x, base - ht);
      ctx.lineTo(x + halfW, base - 4);
      ctx.lineTo(x - halfW, base - 4);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** Camera flashes popping in a packed stand. Cosmetic, so it runs off the wall clock. */
  drawFlashes(ctx, view, camera, top, bottom) {
    const t = performance.now() / 1000;
    const band = Math.max(1, bottom - top - 26);
    for (let i = 0; i < 16; i++) {
      const phase = (t * 1.6 + i * 0.41) % 1;
      if (phase > 0.17) continue; // a flash is a brief pop, then gone
      const a = 1 - phase / 0.17;
      const h = hash(i * 7717 + Math.floor(t * 1.6 + i * 0.41) * 9176);
      const x = ((h % 10000) / 10000) * view.w;
      const y = top + 14 + ((h >>> 13) % band);
      const r = 2.2 + 2 * a;
      for (const [rad, alpha] of [[r * 2.8, 0.22 * a], [r, 0.9 * a]]) {
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Floodlight towers behind the stand, lit for an evening final. */
  drawLights(ctx, view, camera, top) {
    const towerW = 300;
    const offset = camera.x * camera.ppm * 0.2;
    const mast = 15, bw = 44, bh = 11;
    for (let i = Math.floor(offset / towerW) - 1; i < Math.floor(offset / towerW) + Math.ceil(view.w / towerW) + 2; i++) {
      const x = i * towerW - offset + 40;
      const bankTop = top - mast - bh;
      ctx.fillStyle = '#0e1626';
      ctx.fillRect(x - 2.5, bankTop + bh, 5, mast + 8);
      ctx.fillRect(x - bw / 2, bankTop, bw, bh);
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = '#fff6d8';
        ctx.fillRect(x - bw / 2 + 3.5 + k * 7, bankTop + 2.5, 5, bh - 5);
      }
      const cy = bankTop + bh / 2;
      const g = ctx.createRadialGradient(x, cy, 2, x, cy, 52);
      g.addColorStop(0, 'rgba(255,245,210,0.34)');
      g.addColorStop(1, 'rgba(255,245,210,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, cy, 52, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawBoards(ctx, view, camera, top, h, par, size) {
    const b = this.venue.boards;
    if (b.kind === 'fence') return this.drawFence(ctx, view, camera, top, h, par);
    const led = b.kind === 'led';
    const boardW = 180 * Math.max(1, par);
    const offset = camera.x * camera.ppm * par;
    const first = Math.floor(offset / boardW) - 1;
    for (let i = first; i < first + Math.ceil(view.w / boardW) + 2; i++) {
      const x = i * boardW - offset;
      const k = ((i % b.words.length) + b.words.length) % b.words.length;
      const dark = !!b.dark?.includes(k);
      ctx.fillStyle = b.colors[k];
      ctx.fillRect(x, top, boardW - 2, h);
      if (led) {
        // A lit panel rather than paint: bright bleed along the top, dark bezel
        // under it, and lettering that glows.
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillRect(x, top, boardW - 2, Math.max(1, h * 0.14));
        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        ctx.fillRect(x, top + h - Math.max(1, h * 0.1), boardW - 2, Math.max(1, h * 0.1));
      }
      text(ctx, b.words[k], x + boardW / 2, top + h / 2 + 1, { size, color: dark ? '#222' : '#fff', shadow: led && !dark });
    }
  }

  /** A chainlink fence where the hoardings would be: nobody is selling anything here. */
  drawFence(ctx, view, camera, top, h, par) {
    const b = this.venue.boards;
    ctx.fillStyle = b.back;
    ctx.fillRect(0, top, view.w, h);
    const offset = camera.x * camera.ppm * par;
    const step = Math.max(7, h * 0.55);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, view.w, h);
    ctx.clip();
    ctx.strokeStyle = b.mesh;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let sx = -h - (offset % step); sx < view.w + h; sx += step) {
      ctx.moveTo(sx, top + h);
      ctx.lineTo(sx + h, top);
      ctx.moveTo(sx, top);
      ctx.lineTo(sx + h, top + h);
    }
    ctx.stroke();
    ctx.restore();
    // Top rail and leaning posts.
    ctx.fillStyle = b.post;
    ctx.fillRect(0, top, view.w, Math.max(1, h * 0.1));
    const postW = 110 * Math.max(1, par);
    const firstPost = Math.floor(offset / postW) - 1;
    for (let i = firstPost; i < firstPost + Math.ceil(view.w / postW) + 2; i++) {
      ctx.fillRect(i * postW - offset, top, Math.max(2, h * 0.06), h);
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
    const g = this.venue.grass;
    ctx.fillStyle = g.base;
    ctx.fillRect(0, LAYOUT.grassTop, view.w, LAYOUT.farY - LAYOUT.grassTop);
    if (!g.stripe) return; // nobody has mowed it
    ctx.fillStyle = g.stripe;
    const stripeM = g.stripeM;
    const [from, to] = this.rangeAt(camera, view, this.zGrassTop);
    for (let m = Math.floor(from / (stripeM * 2)) * stripeM * 2; m < to; m += stripeM * 2) {
      this.quad(ctx, camera, view, m, m + stripeM, this.zFar, this.zGrassTop);
    }
  }

  drawTrack(ctx, view, camera) {
    const top = LAYOUT.farY;
    const bottom = LAYOUT.nearY;
    const T = this.venue.track;
    ctx.fillStyle = T.surface;
    ctx.fillRect(0, top, view.w, bottom - top);
    if (T.worn) this.drawWear(ctx, view, camera, T.worn);

    // Lane lines: horizontal, closer together further away.
    ctx.fillStyle = T.paint;
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
    // Every 10 m: a painted band across all lanes, drawn in perspective so it
    // widens toward the viewer like the lane lines.
    ctx.fillStyle = T.band;
    const band = 0.14; // m
    for (let m = Math.ceil(from / 10) * 10; m <= to; m += 10) {
      if (m > 0 && m < this.distance) this.quad(ctx, camera, view, m - band / 2, m + band / 2, this.zNear, this.zFar);
    }
    this.drawZones(ctx, view, camera, from, to);
    line(0, 5, T.line);
    // Finish (as in the original): a single white line, no checkerboard.
    const D = this.distance;
    line(D, 5, T.line);
    this.drawFinishTicks(ctx, view, camera);
    if (this.blocksX != null) this.drawStartBlocks(ctx, view, camera);

    // Lane numbers: small and upright just past the start line; big and painted
    // flat on the track, turned sideways, just before the finish line.
    for (let k = 1; k <= this.lanes; k++) {
      const z = this.laneZ(k);
      const size = Math.round(12 + 14 * this.scaleAt(z));
      const p = this.project(camera, view, 0.9, z);
      if (p.x > -40 && p.x < view.w + 40) text(ctx, String(this.laneNumber(k)), p.x, p.y + 1, { size, color: T.paint });
      this.drawPaintedNumber(ctx, view, camera, this.laneNumber(k), D - 1.1, z);
    }
    this.drawFinishPost(ctx, view, camera);
  }

  /**
   * Patches where a neglected surface has worn through to the dirt under it,
   * scattered down the depth range given (a lane band, or a runway strip).
   */
  drawWear(ctx, view, camera, color, z0 = this.zNear, z1 = this.zFar) {
    ctx.fillStyle = color;
    const [from, to] = this.rangeAt(camera, view, z1);
    const span = Math.max(0.01, z1 - z0 - 0.4);
    for (let m = Math.floor(from / 3) * 3; m < to; m += 3) {
      const h = hash(m * 7717);
      if (h % 3) continue;
      const zc = z0 + 0.2 + (((h >>> 7) % 1000) / 1000) * span;
      const len = 1.2 + (((h >>> 17) % 100) / 100) * 2.2;
      this.quad(ctx, camera, view, m, m + len, zc - 0.2, zc + 0.2);
    }
  }

  /**
   * Starting blocks in every lane, drawn side-on at the same scale as the
   * athletes so their feet sit on the footplates: a dark rail on the track with
   * two angled red footplates (each propped by a strut), whose bases are where
   * the toes touch the track (BLOCK_FEET).
   */
  drawStartBlocks(ctx, view, camera) {
    if (this.project(camera, view, this.blocksX, this.zNear).x < -80 && this.project(camera, view, this.blocksX, this.zFar).x < -80) return;
    const B = this.venue.blocks;
    const H0 = CONFIG.figure.height * camera.ppm;
    const ang = BLOCK_FEET.plateAngle;
    for (let k = this.lanes; k >= 1; k--) {
      const o = this.project(camera, view, this.blocksX + (this.blocksNudge?.(k) ?? 0), this.laneZ(k));
      const Hk = H0 * this.figureScale(k);
      const gy = o.y + 4; // athletes' feet are drawn 4 px below the lane centre
      const px = (u) => o.x + u * Hk;
      // Rail: from behind the rear plate to just past the front one.
      const r0 = px(BLOCK_FEET.rear - 0.14);
      const r1 = px(BLOCK_FEET.front + 0.05);
      const th = Math.max(3, 0.028 * Hk);
      ctx.fillStyle = B.rail;
      ctx.fillRect(r0, gy - th, r1 - r0, th);
      ctx.fillStyle = B.railTop;
      ctx.fillRect(r0, gy - th, r1 - r0, Math.max(1, th * 0.35));
      for (const tx of [BLOCK_FEET.rear, BLOCK_FEET.front]) {
        const bx = px(tx + 0.02); // + half a limb stroke: the drawn foot's rounded toe reaches past the toe point
        const len = 0.13 * Hk; // plate length along its slope
        const topX = bx - len * Math.cos(ang);
        const topY = gy - len * Math.sin(ang);
        // Strut behind the plate.
        ctx.strokeStyle = B.rail;
        ctx.lineWidth = Math.max(2, 0.02 * Hk);
        ctx.beginPath();
        ctx.moveTo(topX + 0.2 * (bx - topX), topY + 0.2 * (gy - topY));
        ctx.lineTo(topX - 0.02 * Hk, gy - th);
        ctx.stroke();
        // Footplate: thick red slab with a lighter face where the sole goes.
        ctx.lineCap = 'round';
        ctx.strokeStyle = B.plate;
        ctx.lineWidth = Math.max(4, 0.05 * Hk);
        ctx.beginPath();
        ctx.moveTo(bx, gy - th * 0.5);
        ctx.lineTo(topX, topY);
        ctx.stroke();
        ctx.strokeStyle = B.plateFace;
        ctx.lineWidth = Math.max(1.5, 0.016 * Hk);
        ctx.beginPath();
        ctx.moveTo(bx + 0.008 * Hk, gy - th * 0.8);
        ctx.lineTo(topX + 0.012 * Hk, topY - 0.01 * Hk);
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
    }
  }

  /**
   * Relay exchange zones (`zones`: [{ from, to }] in m): tinted blue across
   * every lane, with a blue line at each end, so the blue PASS button has
   * somewhere to come from.
   */
  drawZones(ctx, view, camera, from, to) {
    for (const z of this.zones ?? []) {
      if (z.to < from || z.from > to) continue;
      ctx.fillStyle = this.venue.zone.fill;
      this.quad(ctx, camera, view, z.from, z.to, this.zNear, this.zFar);
      ctx.fillStyle = this.venue.zone.line;
      for (const m of [z.from, z.to]) this.quad(ctx, camera, view, m - 0.12, m + 0.12, this.zNear, this.zFar);
    }
  }

  /** A short dash across the middle of each lane at 5, 4 and 3 m before the line. */
  drawFinishTicks(ctx, view, camera) {
    const D = this.distance;
    if (this.project(camera, view, D - 6, this.zNear).x > view.w + 60) return;
    ctx.strokeStyle = this.venue.track.paint;
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
    text(ctx, String(n), 0, 0, { size, color: this.venue.track.paint, weight: 800 });
    ctx.restore();
  }

  drawFinishPost(ctx, view, camera) {
    const base = this.project(camera, view, this.distance, this.zFar);
    if (base.x < -200 || base.x > view.w + 200) return;
    const s = this.scaleAt(this.zFar);
    const h = 190 * s;
    const F = this.venue.finish;
    ctx.fillStyle = F.post;
    ctx.fillRect(base.x - 3, base.y - h, 6, h);
    ctx.fillStyle = F.sign;
    ctx.fillRect(base.x - 55, base.y - h - 30, 110, 32);
    text(ctx, 'FINISH', base.x, base.y - h - 14, { size: 17, color: F.text });
  }

  /** In front of the near lane: a curb with 1m ticks, then ad boards (nearer = faster). */
  drawNearSide(ctx, view, camera) {
    const top = LAYOUT.nearY;
    const T = this.venue.track;
    ctx.fillStyle = T.apron;
    ctx.fillRect(0, top, view.w, LAYOUT.nearBoardsTop - top);
    ctx.fillStyle = T.curb;
    ctx.fillRect(0, top, view.w, 5);
    ctx.fillStyle = T.tick;
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
