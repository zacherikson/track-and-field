import { text } from '../core/ui.js';
import { CONFIG } from '../config.js';
import { BLOCK_FEET } from '../athletes/stickFigure.js';
import { venueFor } from './venues.js';
import { drawMonolith, drawColumn } from './ruins.js';

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
 * the paint, the equipment. It doesn't move the ground: LAYOUT below is the same
 * in every venue, so the perspective solve and every camera stay put. The one
 * exception is a venue with a `layout` of its own (Survival's, for a two-lane
 * track with the stand closer and bigger): renderers read `this.L`.
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
    // The venue's own layout if it has one (Survival's two-lane showdown), else everyone's.
    const L = (this.L = venue.layout ?? LAYOUT);
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
    return this.L.horizonY + this.K / z;
  }

  zAtY(y) {
    return this.K / (y - this.L.horizonY);
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

  /**
   * Runner size multiplier for a lane: nearly constant, like the original's
   * sprites. Ten lanes deep (live survival) they shrink more with distance, so
   * the far ones don't pile up on each other.
   */
  figureScale(lane) {
    return Math.pow(this.scaleAt(this.laneZ(lane)), this.lanes > 6 ? 0.6 : 0.2);
  }

  /** World x range (m) visible at depth z, with a margin. */
  rangeAt(camera, view, z, margin = 2) {
    const [l, r] = camera.visibleRange(view.w, this.scaleAt(z));
    return [l - margin, r + margin];
  }

  draw(ctx, view, camera) {
    this.drawSky(ctx, view);
    this.drawStands(ctx, view, camera);
    this.drawBoards(ctx, view, camera, this.L.boardsTop, this.L.grassTop - this.L.boardsTop, 0.24, 13);
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
    const g = ctx.createLinearGradient(0, 0, 0, this.L.standsTop + 40);
    g.addColorStop(0, this.venue.sky.top);
    g.addColorStop(1, this.venue.sky.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, this.L.standsTop + 40);
  }

  /** `opts.backdrop` false: a bleacher stadium leaves out its sky (and range), drawn behind it already (the javelin's flight shot). */
  drawStands(ctx, view, camera, opts) {
    const s = this.venue.stands;
    if (!s) return this.drawBackdrop(ctx, view, camera);
    const top = this.L.standsTop;
    const bottom = this.L.boardsTop;
    if (this.venue.colosseum) return this.drawColosseum(ctx, view, camera, top, bottom);
    if (this.venue.mountains || this.venue.town) return this.drawBleacherStadium(ctx, view, camera, top, bottom, opts);
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
    if (this.venue.overgrowth) this.drawOvergrowth(ctx, view, camera, top, bottom);
  }

  /**
   * The Colosseum seen from the arena (venues.js `colosseum`): the awning
   * (the velarium) strung over the top, the attic wall with its little
   * windows, a tier of arches with faces in them, then the stepped seats
   * packed with togas down to the podium wall (drawPodium). All on the
   * stand's slow parallax.
   */
  drawColosseum(ctx, view, camera, top, bottom) {
    const C = this.venue.colosseum;
    const S = this.venue.stands;
    const H = bottom - top;
    const offset = camera.x * camera.ppm * 0.2;
    const span = (w) => {
      const first = Math.floor(offset / w) - 1;
      return { first, last: first + Math.ceil(view.w / w) + 2 };
    };
    const yAttic = top + H * 0.1;
    const yArch = top + H * 0.27;
    const ySeats = top + H * 0.6;
    // Sky shows through the gaps in the awning; the stone behind everything.
    ctx.fillStyle = C.stone;
    ctx.fillRect(0, yAttic, view.w, bottom - yAttic);
    // Attic: a plain wall, pilasters, a small window between each pair.
    const bay = Math.max(46, H * 0.36);
    let r = span(bay);
    for (let i = r.first; i < r.last; i++) {
      const x = i * bay - offset;
      ctx.fillStyle = C.shade;
      ctx.fillRect(x, yAttic, bay * 0.1, yArch - yAttic);
      ctx.fillStyle = C.dark;
      const ww = bay * 0.16;
      ctx.fillRect(x + bay * 0.55 - ww / 2, yAttic + (yArch - yAttic) * 0.35, ww, (yArch - yAttic) * 0.34);
    }
    // Cornices: a light ledge with a shadow under it.
    const ledge = (y) => {
      ctx.fillStyle = C.cornice;
      ctx.fillRect(0, y - 3, view.w, 4);
      ctx.fillStyle = C.shade;
      ctx.fillRect(0, y + 1, view.w, 2);
    };
    ledge(yArch);
    // The arcade: arches on piers, half columns between, people looking out.
    const archH = (ySeats - yArch) * 0.78;
    const aw = bay * 0.62;
    for (let i = r.first; i < r.last; i++) {
      const x = i * bay - offset;
      const ax = x + bay * 0.55;
      const base = ySeats - 4;
      ctx.fillStyle = C.dark;
      ctx.beginPath();
      ctx.moveTo(ax - aw / 2, base);
      ctx.lineTo(ax - aw / 2, base - archH + aw / 2);
      ctx.arc(ax, base - archH + aw / 2, aw / 2, Math.PI, 0);
      ctx.lineTo(ax + aw / 2, base);
      ctx.closePath();
      ctx.fill();
      // Two or three faces at the rail of each arch.
      const h = hash(i * 6151);
      const head = Math.max(4, aw * 0.16);
      for (let k = 0; k < 3; k++) {
        if ((h >>> k) % 4 === 0) continue;
        ctx.fillStyle = S.crowd[(h >>> (k * 3)) % S.crowd.length];
        ctx.fillRect(ax - aw * 0.36 + k * aw * 0.27, base - head * 1.6, head, head * 1.6);
        ctx.fillStyle = C.skin[(h >>> (k + 5)) % C.skin.length];
        ctx.fillRect(ax - aw * 0.36 + k * aw * 0.27, base - head * 2.5, head, head);
      }
      // The half column on the pier, with its capital.
      ctx.fillStyle = C.cornice;
      ctx.fillRect(x + bay * 0.03, yArch + 4, bay * 0.1, ySeats - yArch - 8);
      ctx.fillRect(x, yArch + 4, bay * 0.16, 4);
      ctx.fillStyle = C.shade;
      ctx.fillRect(x + bay * 0.1, yArch + 8, bay * 0.03, ySeats - yArch - 12);
    }
    ledge(ySeats);
    // The seats: steps of marble, packed solid down to the podium.
    const seatW = S.seatW;
    const headS = Math.max(5, seatW - 4);
    const rows = Math.max(2, Math.floor((bottom - ySeats - 4) / S.rowH));
    r = span(seatW);
    for (let row = 0; row < rows; row++) {
      const y = ySeats + 4 + row * S.rowH;
      ctx.fillStyle = row % 2 ? C.step : C.cornice;
      ctx.fillRect(0, y + S.rowH - 3, view.w, 3);
      const shift = (row % 2) * (seatW / 2);
      for (let i = r.first; i < r.last + 1; i++) {
        const h = hash(i * 31 + row * 7919 + 17);
        if (S.emptyEvery && h % S.emptyEvery === 0) continue;
        const x = i * seatW - offset + shift;
        ctx.fillStyle = S.crowd[h % S.crowd.length];
        ctx.fillRect(x, y + headS * 0.55, headS, S.rowH - 3 - headS * 0.55); // a toga
        ctx.fillStyle = C.skin[(h >>> 7) % C.skin.length];
        ctx.fillRect(x + headS * 0.2, y + 1, headS * 0.6, headS * 0.55); // a head
      }
    }
    // The velarium over the top: sailcloth in strips, scalloped along its edge, the ropes holding it.
    const strip = Math.max(30, H * 0.22);
    r = span(strip);
    for (let i = r.first; i < r.last; i++) {
      const x = i * strip - offset;
      ctx.fillStyle = C.velarium[((i % 2) + 2) % 2];
      ctx.beginPath();
      ctx.moveTo(x, top - 4);
      ctx.lineTo(x + strip, top - 4);
      ctx.lineTo(x + strip, yAttic - 2);
      ctx.quadraticCurveTo(x + strip / 2, yAttic + H * 0.07, x, yAttic - 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = C.rope;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yAttic - 2);
      ctx.lineTo(x + strip * 0.3, yArch);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, yAttic, view.w, H * 0.05); // the awning's shade on the wall
  }

  /**
   * The jungle taking a ruined stand back (venues.js `overgrowth`): moss
   * running down the stone, trees growing up through it with their canopy
   * over the top, and vines hanging from the roof with a flower here and
   * there. On the stand's slow parallax (the canopy a touch slower).
   */
  drawOvergrowth(ctx, view, camera, top, bottom) {
    const O = this.venue.overgrowth;
    const offset = camera.x * camera.ppm * 0.2;
    const span = (w, par) => {
      const off = offset * par;
      const first = Math.floor(off / w) - 1;
      return { off, first, last: first + Math.ceil(view.w / w) + 2 };
    };
    // Moss streaks down the stone.
    let s = span(23, 1);
    ctx.fillStyle = O.moss;
    for (let i = s.first; i < s.last; i++) {
      const h = hash(i * 4271);
      if (h % 3) continue;
      const x = i * 23 - s.off + (h % 11);
      ctx.fillRect(x, top + 6, 5 + (h % 6), (bottom - top) * (0.3 + ((h >>> 8) % 60) / 100));
    }
    // Ruins on the tiers: carved stone statues (one leaning, one with its head
    // fallen at its feet) and broken columns, between the trees (ruins.js).
    if (O.ruins) {
      const tall = bottom - top;
      const gap = Math.max(180, tall * 1.1);
      s = span(gap, 1);
      for (let i = s.first; i < s.last; i++) {
        const h = hash(i * 7349);
        const x = i * gap - s.off + (h % Math.round(gap * 0.3));
        const base = bottom - tall * 0.05;
        const kind = h % 5;
        if (kind === 4) {
          drawColumn(ctx, x - tall * 0.06, base, tall * 0.42, tall * 0.07, O.ruins, 0.3);
          drawColumn(ctx, x + tall * 0.08, base, tall * 0.24, tall * 0.07, O.ruins, 0.8);
        } else {
          drawMonolith(ctx, x, base, tall * (0.5 + ((h >>> 5) % 10) / 100), O.ruins, { lean: kind === 1 ? 0.12 : 0, headless: kind === 2 });
        }
      }
    }
    // Trees grown up through the stand, their crowns over the top of it (bigger in a taller stand).
    const big = (bottom - top) / 102;
    s = span(95 * big, 0.8);
    for (let i = s.first; i < s.last; i++) {
      const h = hash(i * 9133);
      const x = i * 95 * big - s.off + (h % 40);
      const r = (26 + (h % 20)) * big;
      const cy = top - 2 + ((h >>> 5) % 12);
      ctx.fillStyle = O.canopyDark;
      ctx.fillRect(x - 3, cy, 6, bottom - cy);
      for (const [dx, dy, k, c] of [[-0.7, 0.25, 0.75, 0], [0.75, 0.2, 0.7, 1], [0, -0.1, 1, 2], [-0.25, -0.45, 0.6, 3]]) {
        ctx.fillStyle = k === 1 ? O.canopy[(h >>> 3) % O.canopy.length] : O.canopy[(c + h) % O.canopy.length];
        ctx.beginPath();
        ctx.arc(x + dx * r, cy + dy * r, r * k, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Vines hanging from the roof, leaves along them, sometimes a flower at the end.
    s = span(17, 1);
    ctx.lineWidth = 1.5;
    for (let i = s.first; i < s.last; i++) {
      const h = hash(i * 6007);
      if (h % 2) continue;
      const x = i * 17 - s.off + (h % 9);
      const len = (bottom - top) * (0.25 + ((h >>> 6) % 55) / 100);
      ctx.strokeStyle = O.vine;
      ctx.beginPath();
      ctx.moveTo(x, top + 4);
      ctx.quadraticCurveTo(x + ((h >>> 3) % 9) - 4, top + len / 2, x + ((h >>> 9) % 7) - 3, top + len);
      ctx.stroke();
      ctx.fillStyle = O.leaf;
      for (let y = top + 10; y < top + len; y += 7) ctx.fillRect(x + ((y + h) % 2 ? 1 : -4), y, 3, 3);
      if (h % 5 === 0) {
        ctx.fillStyle = O.flower[h % O.flower.length];
        ctx.beginPath();
        ctx.arc(x, top + len + 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * A small stadium's backdrop (venues.js `mountains` or `town`): the sky all
   * the way down the band, Collegiate's snow-capped range or High School's
   * town behind, a line of trees (and light poles), and low aluminium
   * bleachers in sections along the bottom with people dotted along them, a
   * press box on every third where there is one. The trees, poles and
   * bleachers are on the stand's parallax; what's behind moves slower.
   * `backdrop: false` leaves out the sky and the range, for a shot that has
   * drawn its own behind the band (the javelin's flight); the town stays.
   */
  drawBleacherStadium(ctx, view, camera, top, bottom, { backdrop = true } = {}) {
    const M = this.venue.mountains;
    const T = this.venue.town;
    const B = M ?? T; // trees and poles
    const S = this.venue.stands;
    const offset = camera.x * camera.ppm * 0.2;
    const H = bottom - top;
    if (backdrop) {
      const g = ctx.createLinearGradient(0, 0, 0, bottom);
      g.addColorStop(0, this.venue.sky.top);
      g.addColorStop(1, this.venue.sky.bottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, top, view.w, bottom - top);
    }
    if (M && backdrop) {
      drawMountains(ctx, view.w, offset * 0.15, top + 2, bottom - H * 0.12, { face: M.far, shade: M.farShade, snow: M.snow, snowShade: M.snowShade, spacing: 170, seed: 7919, snowDepth: H * 0.22 });
      drawMountains(ctx, view.w, offset * 0.3, top + H * 0.3, bottom - H * 0.12, { face: M.near, shade: M.nearShade, snow: M.snow, snowShade: M.snowShade, spacing: 120, seed: 104729, snowDepth: H * 0.1 });
    }
    if (T) drawTown(ctx, view.w, offset * 0.5, top, bottom - 8, T);

    // Trees along the bottom of the band, light poles standing over them.
    const treeW = B.treeGap ?? 30;
    const tFirst = Math.floor(offset / treeW) - 1;
    for (let i = tFirst; i < tFirst + Math.ceil(view.w / treeW) + 2; i++) {
      const h = hash(i * 3571);
      if (B.treeEvery && h % B.treeEvery) continue; // a gap: the town shows through
      const x = i * treeW - offset + (h % 12);
      const r = 9 + (h % 7);
      const base = bottom - 2;
      ctx.fillStyle = B.trunk;
      ctx.fillRect(x - 1.5, base - r, 3, r);
      ctx.fillStyle = h % 3 ? B.tree : B.treeLit;
      ctx.beginPath();
      ctx.arc(x, base - r - r * 0.7, r, 0, Math.PI * 2);
      ctx.arc(x + r * 0.7, base - r - r * 0.2, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    if (B.pole) {
      const poleW = 420;
      for (let i = Math.floor(offset / poleW) - 1; i < Math.floor(offset / poleW) + Math.ceil(view.w / poleW) + 2; i++) {
        const x = i * poleW - offset + 150;
        const y0 = top + H * 0.08;
        ctx.fillStyle = B.pole;
        ctx.fillRect(x - 1.5, y0, 3, bottom - y0);
        ctx.fillRect(x - 11, y0 - 6, 22, 7);
        ctx.fillStyle = '#f4f1e2';
        for (let k = 0; k < 3; k++) ctx.fillRect(x - 9 + k * 7, y0 - 4.5, 5, 4);
      }
    }

    // The bleachers: sections with gaps between them.
    const secW = S.sectionW;
    const period = secW + S.sectionGap;
    const rows = S.rows;
    const bTop = bottom - rows * S.rowH - 4;
    const head = Math.max(4, S.seatW - 6);
    for (let i = Math.floor(offset / period) - 1; i < Math.floor(offset / period) + Math.ceil(view.w / period) + 2; i++) {
      const x0 = i * period - offset;
      if (x0 > view.w || x0 + secW < 0) continue;
      ctx.fillStyle = S.frame;
      ctx.fillRect(x0, bTop, secW, bottom - bTop);
      for (let r = 0; r < rows; r++) {
        const y = bTop + r * S.rowH;
        const inset = (rows - 1 - r) * 3; // each row up steps back a little
        ctx.fillStyle = S.body;
        ctx.fillRect(x0 + inset, y + 3, secW - inset * 2, S.rowH - 3);
        ctx.fillStyle = S.plank;
        ctx.fillRect(x0 + inset, y, secW - inset * 2, 3);
        // People sitting on this row (their heads over the plank, shirts below it): 1 seat in `seated`.
        const n = Math.floor((secW - inset * 2 - 8) / S.seatW);
        for (let k = 0; k < n; k++) {
          const hh = hash(i * 7307 + r * 131 + k * 17);
          if (hh % S.seated !== 0) continue;
          const px = x0 + inset + 4 + k * S.seatW + (hh % 3);
          ctx.fillStyle = S.crowd[(hh >>> 4) % S.crowd.length];
          ctx.fillRect(px, y - 2, head, 6);
          ctx.fillStyle = '#e8c4a0';
          ctx.fillRect(px + 1, y - 2 - head + 1, head - 2, head - 2);
        }
      }
      ctx.fillStyle = S.rail;
      ctx.fillRect(x0, bTop - 4, 2, 4);
      ctx.fillRect(x0 + secW - 2, bTop - 4, 2, 4);
      ctx.fillRect(x0, bTop - 4, secW, 1.5);
      if (S.box && ((i % 3) + 3) % 3 === 1) {
        // A press box on its posts over the top row.
        const bw = secW * 0.34;
        const bx = x0 + (secW - bw) / 2;
        const by = bTop - 24;
        ctx.fillStyle = S.frame;
        ctx.fillRect(bx + 6, by + 18, 3, 8);
        ctx.fillRect(bx + bw - 9, by + 18, 3, 8);
        ctx.fillStyle = S.box;
        ctx.fillRect(bx, by, bw, 18);
        ctx.fillRect(bx - 3, by - 3, bw + 6, 4);
        ctx.fillStyle = S.boxWindow;
        ctx.fillRect(bx + 5, by + 5, bw - 10, 7);
      }
    }
  }

  /**
   * No stand: low hills and a pine treeline behind the track instead, on the
   * same slow parallax a crowd would have. The near fence (drawFence) covers
   * the trunks, so the woods read as being on the other side of it.
   */
  drawBackdrop(ctx, view, camera) {
    const b = this.venue.backdrop;
    const top = this.L.standsTop;
    const bottom = this.L.boardsTop;
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
    if (b.kind === 'wall') return this.drawWall(ctx, view, camera, top, h, par);
    if (b.kind === 'podium') return this.drawPodium(ctx, view, camera, top, h, par, size);
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

  /**
   * The Colosseum's podium wall where the hoardings would be: marble panels
   * between pilasters, a red band along the top, gilt lettering.
   */
  drawPodium(ctx, view, camera, top, h, par, size) {
    const b = this.venue.boards;
    ctx.fillStyle = b.back;
    ctx.fillRect(0, top, view.w, h);
    ctx.fillStyle = b.band;
    ctx.fillRect(0, top, view.w, Math.max(2, h * 0.18));
    ctx.fillStyle = b.vein;
    ctx.fillRect(0, top + h - Math.max(2, h * 0.12), view.w, Math.max(2, h * 0.12));
    const panelW = 180 * Math.max(1, par);
    const offset = camera.x * camera.ppm * par;
    const first = Math.floor(offset / panelW) - 1;
    for (let i = first; i < first + Math.ceil(view.w / panelW) + 2; i++) {
      const x = i * panelW - offset;
      ctx.fillStyle = b.pilaster;
      ctx.fillRect(x, top, Math.max(3, h * 0.2), h);
      const k = ((i % b.words.length) + b.words.length) % b.words.length;
      text(ctx, b.words[k], x + panelW / 2, top + h * 0.58, { size: Math.round(size * 0.9), color: b.letters, font: 'display' });
    }
  }

  /** An old stone wall where the hoardings would be, gone mossy along the top, ferns growing out of it. */
  drawWall(ctx, view, camera, top, h, par) {
    const b = this.venue.boards;
    ctx.fillStyle = b.back;
    ctx.fillRect(0, top, view.w, h);
    const offset = camera.x * camera.ppm * par;
    const blockW = 46 * Math.max(1, par);
    const course = h / 2;
    ctx.fillStyle = b.block;
    ctx.fillRect(0, top + course - 1, view.w, 2);
    const first = Math.floor(offset / blockW) - 1;
    for (let i = first; i < first + Math.ceil(view.w / blockW) + 2; i++) {
      const x = i * blockW - offset;
      ctx.fillRect(x, top, 2, course);
      ctx.fillRect(x + blockW / 2, top + course, 2, course);
      const k = hash(i * 3301);
      // Moss along the top, and a fern now and then.
      ctx.fillStyle = b.moss;
      ctx.beginPath();
      ctx.ellipse(x + blockW / 2, top + 1, blockW * (0.3 + (k % 30) / 100), Math.max(2, h * 0.22), 0, 0, Math.PI * 2);
      ctx.fill();
      if (k % 3 === 0) {
        ctx.strokeStyle = b.fern;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) {
          ctx.moveTo(x + 10, top + 2);
          ctx.lineTo(x + 10 + Math.sin(a) * h * 0.9, top + 2 - Math.cos(a) * h * 0.8);
        }
        ctx.stroke();
      }
      ctx.fillStyle = b.block;
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
    ctx.fillRect(0, this.L.grassTop, view.w, this.L.farY - this.L.grassTop);
    if (!g.stripe) return; // nobody has mowed it
    ctx.fillStyle = g.stripe;
    const stripeM = g.stripeM;
    const [from, to] = this.rangeAt(camera, view, this.zGrassTop);
    for (let m = Math.floor(from / (stripeM * 2)) * stripeM * 2; m < to; m += stripeM * 2) {
      this.quad(ctx, camera, view, m, m + stripeM, this.zFar, this.zGrassTop);
    }
  }

  drawTrack(ctx, view, camera) {
    const top = this.L.farY;
    const bottom = this.L.nearY;
    const T = this.venue.track;
    ctx.fillStyle = T.surface;
    ctx.fillRect(0, top, view.w, bottom - top);
    if (T.alt) {
      // Two-tone lanes: every other one a shade deeper.
      ctx.fillStyle = T.alt;
      for (let k = 1; k < this.lanes; k += 2) {
        const y0 = this.yAt(this.zNear + k + 1);
        ctx.fillRect(0, y0, view.w, this.yAt(this.zNear + k) - y0);
      }
    }
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
    const top = this.L.nearY;
    const T = this.venue.track;
    ctx.fillStyle = T.apron;
    ctx.fillRect(0, top, view.w, this.L.nearBoardsTop - top);
    ctx.fillStyle = T.curb;
    ctx.fillRect(0, top, view.w, 5);
    ctx.fillStyle = T.tick;
    const [l, r] = this.rangeAt(camera, view, this.zNear);
    for (let m = Math.floor(l); m < r; m++) {
      ctx.fillRect(this.project(camera, view, m, this.zNear).x, top, 3, 5);
    }
    this.drawBoards(ctx, view, camera, this.L.nearBoardsTop, view.h - this.L.nearBoardsTop, 1.3, 20);
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

/**
 * A snow-capped range across a `w`-wide band: peaks no higher than `crest`,
 * its foot at `base` (screen y), scrolled by `off` px. Peaks every `spacing`
 * px or so (`seed` picks their heights), each with its right face shaded and
 * snow down `snowDepth` px from the top. Collegiate's backdrop, and what the
 * javelin's flight shot looks out over there.
 */
export function drawMountains(ctx, w, off, crest, base, { face, shade, snow, snowShade, spacing, seed, snowDepth }) {
  const span = base - crest;
  const first = Math.floor(off / spacing) - 2;
  const peaks = [];
  for (let i = first; i < first + Math.ceil(w / spacing) + 5; i++) {
    const h = hash(i * seed);
    peaks.push({ x: i * spacing - off + (h % Math.round(spacing * 0.3)), y: crest + span * (((h >>> 6) % 45) / 100) });
  }
  // A valley between each pair of peaks, lower than both.
  const pts = [];
  peaks.forEach((p, k) => {
    pts.push({ ...p, peak: true });
    const q = peaks[k + 1];
    if (!q) return;
    const h = hash((first + k) * seed + 17);
    pts.push({ x: p.x + (q.x - p.x) * (0.4 + ((h % 20) / 100)), y: Math.min(base - 2, Math.max(p.y, q.y) + span * (0.2 + ((h >>> 5) % 25) / 100)) });
  });
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, base);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.lineTo(pts.at(-1).x, base);
  ctx.closePath();
  ctx.fill();
  for (let k = 1; k < pts.length - 1; k++) {
    const p = pts[k];
    if (!p.peak) continue;
    const L = pts[k - 1];
    const R = pts[k + 1];
    // The face away from the sun.
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(R.x, R.y);
    ctx.lineTo(R.x, base);
    ctx.lineTo(p.x + (R.x - p.x) * 0.3, base);
    ctx.closePath();
    ctx.fill();
    // Snow down from the top: a ragged edge, lit on the left, in shade on the right.
    const kl = Math.min(0.7, snowDepth / Math.max(1, L.y - p.y));
    const kr = Math.min(0.7, snowDepth / Math.max(1, R.y - p.y));
    const a = { x: p.x + (L.x - p.x) * kl, y: p.y + (L.y - p.y) * kl };
    const b = { x: p.x + (R.x - p.x) * kr, y: p.y + (R.y - p.y) * kr };
    const dip = (b.y - p.y) * 0.35;
    ctx.fillStyle = snow;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(p.x + (b.x - p.x) * 0.55, b.y - dip);
    ctx.lineTo(p.x + (b.x - p.x) * 0.25, b.y + dip * 0.4);
    ctx.lineTo(p.x - (p.x - a.x) * 0.3, a.y - dip * 0.2);
    ctx.lineTo(p.x - (p.x - a.x) * 0.6, a.y + dip * 0.5);
    ctx.lineTo(a.x, a.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = snowShade;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(p.x + (b.x - p.x) * 0.55, b.y - dip);
    ctx.lineTo(p.x + (b.x - p.x) * 0.25, b.y + dip * 0.4);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * High School's town behind the bleachers, scrolled by `off` px: low hills,
 * then blocks of houses and shops with their windows, and over them a water
 * tower with the town's name on it and a white church with its steeple
 * (`T`: venues.js `town`). Everything stands on `base`.
 */
export function drawTown(ctx, w, off, top, base, T) {
  const H = base - top;
  // Low hills behind the town.
  ctx.fillStyle = T.hill;
  ctx.beginPath();
  ctx.moveTo(0, base);
  for (let sx = 0; sx <= w + 16; sx += 16) {
    const wx = sx + off * 0.4;
    ctx.lineTo(sx, top + H * 0.5 - 7 * Math.sin(wx / 170) - 4 * Math.sin(wx / 61));
  }
  ctx.lineTo(w, base);
  ctx.closePath();
  ctx.fill();

  const P = 560; // one stretch of town: its landmark, then houses and shops
  const first = Math.floor(off / P) - 1;
  for (let i = first; i < first + Math.ceil(w / P) + 2; i++) {
    const x0 = i * P - off;
    const kind = ((i % 3) + 3) % 3; // 0: the water tower, 1: the church, 2: just more town
    // Houses and shops along the stretch.
    let x = x0 + 8;
    for (let k = 0; x < x0 + P - 20; k++) {
      const h = hash(i * 92821 + k * 613);
      const bw = 34 + (h % 46);
      const bh = H * (0.16 + ((h >>> 7) % 22) / 100);
      const landmarkAt = kind === 0 ? x0 + P * 0.35 : kind === 1 ? x0 + P * 0.62 : null;
      if (landmarkAt != null && x + bw > landmarkAt - 30 && x < landmarkAt + 30) {
        x += bw + 6; // leave room for the landmark
        continue;
      }
      ctx.fillStyle = T.buildings[h % T.buildings.length];
      ctx.fillRect(x, base - bh, bw, bh);
      ctx.fillStyle = T.roofs[(h >>> 3) % T.roofs.length];
      if ((h >>> 11) % 2) {
        // A pitched roof (a house).
        ctx.beginPath();
        ctx.moveTo(x - 3, base - bh);
        ctx.lineTo(x + bw / 2, base - bh - bw * 0.32);
        ctx.lineTo(x + bw + 3, base - bh);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(x - 2, base - bh - 3, bw + 4, 3); // a flat one with a ledge (a shop)
      }
      ctx.fillStyle = T.window;
      // Which windows are lit belongs to the building (not where it is on screen), so they don't flicker as it scrolls.
      let n = 0;
      for (let wy = base - bh + 5; wy < base - 8; wy += 9) for (let wx = x + 5; wx < x + bw - 7; wx += 10) if (hash(h + n++ * 7919) % 4) ctx.fillRect(wx, wy, 4, 5);
      x += bw + 6 + ((h >>> 17) % 14);
    }
    if (kind === 0) drawWaterTower(ctx, x0 + P * 0.35, base, H, T);
    if (kind === 1) drawChurch(ctx, x0 + P * 0.62, base, H, T);
  }
}

/** The water tower: four legs, the tank with its cap, the town's name around it. */
function drawWaterTower(ctx, cx, base, H, T) {
  const W = T.tower;
  const tankW = 46;
  const tankH = H * 0.2;
  const tankY = base - H * 0.86;
  ctx.fillStyle = W.leg;
  for (const dx of [-17, -6, 6, 17]) ctx.fillRect(cx + dx - 1.2 + (dx < 0 ? -2 : 2), tankY + tankH, 2.4, base - tankY - tankH);
  ctx.fillRect(cx - 20, tankY + tankH + (base - tankY - tankH) * 0.45, 40, 1.6);
  ctx.fillStyle = W.tank;
  ctx.beginPath();
  ctx.ellipse(cx, tankY + tankH, tankW / 2, 5, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillRect(cx - tankW / 2, tankY, tankW, tankH);
  ctx.fillStyle = W.shade;
  ctx.fillRect(cx + tankW * 0.22, tankY, tankW * 0.28, tankH);
  ctx.fillStyle = W.tank;
  ctx.beginPath();
  ctx.moveTo(cx - tankW / 2 - 2, tankY);
  ctx.lineTo(cx, tankY - tankH * 0.55);
  ctx.lineTo(cx + tankW / 2 + 2, tankY);
  ctx.closePath();
  ctx.fill();
  text(ctx, W.name, cx - 2, tankY + tankH * 0.52, { size: 8, weight: 800, color: W.text });
}

/** A white church: its hall with a pitched roof, the tower beside it, the steeple on top. */
function drawChurch(ctx, cx, base, H, T) {
  const C = T.church;
  const hallW = 56;
  const hallH = H * 0.24;
  const hx = cx - 4;
  ctx.fillStyle = C.wall;
  ctx.fillRect(hx, base - hallH, hallW, hallH);
  ctx.fillStyle = C.roof;
  ctx.beginPath();
  ctx.moveTo(hx - 3, base - hallH);
  ctx.lineTo(hx + hallW / 2, base - hallH - 16);
  ctx.lineTo(hx + hallW + 3, base - hallH);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = C.window;
  for (let k = 0; k < 3; k++) ctx.fillRect(hx + 10 + k * 16, base - hallH * 0.7, 5, 9);
  // The tower and its steeple, the shaded side to the right.
  const tw = 16;
  const ty = base - H * 0.52;
  ctx.fillStyle = C.wall;
  ctx.fillRect(cx - tw, ty, tw, base - ty);
  ctx.fillStyle = C.shade;
  ctx.fillRect(cx - tw * 0.35, ty, tw * 0.35, base - ty);
  ctx.fillStyle = C.window;
  ctx.beginPath();
  ctx.arc(cx - tw / 2, ty + 10, 3, Math.PI, 0);
  ctx.fillRect(cx - tw / 2 - 3, ty + 10, 6, 6);
  ctx.fill();
  ctx.fillStyle = C.wall;
  ctx.beginPath();
  ctx.moveTo(cx - tw - 1, ty);
  ctx.lineTo(cx - tw / 2, ty - H * 0.36);
  ctx.lineTo(cx + 1, ty);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = C.shade;
  ctx.beginPath();
  ctx.moveTo(cx - tw / 2, ty - H * 0.36);
  ctx.lineTo(cx + 1, ty);
  ctx.lineTo(cx - tw / 2, ty);
  ctx.closePath();
  ctx.fill();
}
