import { text } from '../core/ui.js';

/**
 * Side-on stadium renderer with fake perspective, framed like the original:
 * a low, close camera, big runners, and the track in the bottom third with
 * thin lanes. The player runs in the front lane.
 *
 * Lanes are horizontal bands. Internally lane 1 is nearest the camera (bottom);
 * the numbers painted on the track count the other way, 1 (far) to 6 (near).
 * Anything that crosses the track (start/finish lines, 10m marks) is drawn
 * slanted: it shifts by SKEW px for every px it goes "into" the screen (negative
 * = far lanes further left, as in the original). Runners get the same shift for
 * their lane, so they line up with the lines. The infield grass behind the
 * track continues the same slant, so it reads as one ground plane.
 *
 * PARALLAX: layers further away scroll slower than the track (crowd at 0.5x,
 * ad boards at 0.92x). This sells depth and speed for free.
 */
export const LAYOUT = {
  standsTop: 26,
  boardsTop: 150,
  grassTop: 176,
  trackTop: 360,
  laneH: 28,
  skew: -0.62,
};

export class TrackRenderer {
  constructor(lanes, distance) {
    this.lanes = lanes;
    this.distance = distance;
    this.trackBottom = LAYOUT.trackTop + lanes * LAYOUT.laneH;
  }

  /** Number painted on the track for internal lane `lane` (1 = nearest). */
  laneNumber(lane) {
    return this.lanes + 1 - lane;
  }

  laneY(lane) {
    return this.trackBottom - (lane - 0.5) * LAYOUT.laneH;
  }

  skewX(y) {
    return (this.trackBottom - y) * LAYOUT.skew;
  }

  /** Screen position of the ground point at world x (m) in `lane`. */
  toScreen(camera, view, x, lane) {
    const y = this.laneY(lane);
    return { x: camera.toScreenX(x, view.w) + this.skewX(y), y };
  }

  /** World x range (m) whose slanted lines can touch the screen between rows yTop..yBottom. */
  slantRange(camera, view, yTop) {
    const [left, right] = camera.visibleRange(view.w);
    const shift = this.skewX(yTop) / camera.ppm; // negative: far rows shift left
    return [left + Math.min(0, shift) - 1, right - Math.min(0, shift) + 1];
  }

  draw(ctx, view, camera) {
    this.drawSky(ctx, view);
    this.drawStands(ctx, view, camera);
    this.drawBoards(ctx, view, camera);
    this.drawGrass(ctx, view, camera);
    this.drawTrack(ctx, view, camera);
    this.drawNearEdge(ctx, view, camera);
  }

  /** Brighten one lane (used to flash the player's lane before the start). */
  highlightLane(ctx, view, lane, alpha) {
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect(0, this.laneY(lane) - LAYOUT.laneH / 2, view.w, LAYOUT.laneH);
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
    // Roof edge.
    ctx.fillStyle = '#2a3346';
    ctx.fillRect(0, top, view.w, 8);

    // Crowd: a grid of "heads" colored by a hash of their seat, scrolling at 0.5x.
    const par = 0.5;
    const seatW = 14;
    const offset = camera.x * camera.ppm * par;
    const first = Math.floor(offset / seatW) - 1;
    const count = Math.ceil(view.w / seatW) + 2;
    const palette = ['#f4d35e', '#ee964b', '#f95738', '#faf0ca', '#0d3b66', '#8ecae6', '#e9edc9', '#b5838d'];
    for (let row = 0; row < 8; row++) {
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

  drawBoards(ctx, view, camera) {
    const top = LAYOUT.boardsTop;
    const h = LAYOUT.grassTop - top;
    const par = 0.92;
    const boardW = 180;
    const offset = camera.x * camera.ppm * par;
    const first = Math.floor(offset / boardW) - 1;
    const words = ['THUMBATHLON', 'TAP TAP GO', 'FAST THUMBS', 'RUN JUNO RUN', 'NO FALSE STARTS'];
    const colors = ['#1b998b', '#e4572e', '#2e294e', '#f1c40f', '#3f88c5'];
    for (let i = first; i < first + Math.ceil(view.w / boardW) + 2; i++) {
      const x = i * boardW - offset;
      const k = ((i % words.length) + words.length) % words.length;
      ctx.fillStyle = colors[k];
      ctx.fillRect(x, top, boardW - 2, h);
      text(ctx, words[k], x + boardW / 2, top + h / 2 + 1, { size: 13, color: k === 3 ? '#222' : '#fff' });
    }
  }

  /** Infield grass between the ad boards and the track, mowed in slanted stripes. */
  drawGrass(ctx, view, camera) {
    const top = LAYOUT.grassTop;
    const bottom = LAYOUT.trackTop;
    ctx.fillStyle = '#4c9a3f';
    ctx.fillRect(0, top, view.w, bottom - top);
    ctx.fillStyle = '#56a847';
    const stripeM = 4;
    const [from, to] = this.slantRange(camera, view, top);
    for (let m = Math.floor(from / (stripeM * 2)) * stripeM * 2; m < to; m += stripeM * 2) {
      const x0 = camera.toScreenX(m, view.w);
      const x1 = x0 + stripeM * camera.ppm;
      ctx.beginPath();
      ctx.moveTo(x0 + this.skewX(bottom), bottom);
      ctx.lineTo(x1 + this.skewX(bottom), bottom);
      ctx.lineTo(x1 + this.skewX(top), top);
      ctx.lineTo(x0 + this.skewX(top), top);
      ctx.closePath();
      ctx.fill();
    }
    // Distance labels on the grass along the far edge of the track.
    const [left, right] = camera.visibleRange(view.w);
    for (let m = Math.ceil((left - 6) / 10) * 10; m <= right + 6; m += 10) {
      if (m <= 0 || m >= this.distance) continue;
      const y = bottom - 12;
      text(ctx, `${m}m`, camera.toScreenX(m, view.w) + this.skewX(y), y, { size: 14, color: 'rgba(255,255,255,0.85)' });
    }
  }

  drawTrack(ctx, view, camera) {
    const top = LAYOUT.trackTop;
    const bottom = this.trackBottom;
    ctx.fillStyle = '#c1502e';
    ctx.fillRect(0, top, view.w, bottom - top);

    // Lane lines.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let k = 0; k <= this.lanes; k++) {
      ctx.fillRect(0, bottom - k * LAYOUT.laneH - 1, view.w, 2);
    }

    // Everything that crosses the track, drawn slanted.
    const [from, to] = this.slantRange(camera, view, top);
    const line = (xm, width, color) => {
      const sx = camera.toScreenX(xm, view.w);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(sx, bottom);
      ctx.lineTo(sx + this.skewX(top), top);
      ctx.stroke();
    };
    for (let m = Math.ceil(from / 10) * 10; m <= to; m += 10) {
      if (m > 0 && m < this.distance) line(m, 2, 'rgba(255,255,255,0.35)');
    }
    line(0, 5, '#fff');
    // Finish: white line with a checkered strip behind it.
    line(this.distance, 5, '#fff');
    this.drawFinishChecker(ctx, view, camera);

    // Lane numbers painted behind the start and past the finish.
    for (let k = 1; k <= this.lanes; k++) {
      for (const xm of [-0.9, this.distance + 0.9]) {
        const p = this.toScreen(camera, view, xm, k);
        if (p.x < -40 || p.x > view.w + 40) continue;
        text(ctx, String(this.laneNumber(k)), p.x, p.y + 1, { size: 20, color: 'rgba(255,255,255,0.9)' });
      }
    }
    this.drawFinishPosts(ctx, view, camera);
  }

  drawFinishChecker(ctx, view, camera) {
    const sq = LAYOUT.laneH / 4;
    for (let row = 0; row < this.lanes * 4; row++) {
      const y = this.trackBottom - (row + 1) * sq;
      const sx = camera.toScreenX(this.distance, view.w) + this.skewX(y + sq / 2);
      if (sx < -20 || sx > view.w + 20) continue;
      for (let c = 0; c < 2; c++) {
        ctx.fillStyle = (row + c) % 2 ? '#111' : '#fff';
        ctx.fillRect(sx + 3 + c * sq * 0.6, y, sq * 0.6, sq);
      }
    }
  }

  drawFinishPosts(ctx, view, camera) {
    const sx = camera.toScreenX(this.distance, view.w);
    if (sx < -300 || sx > view.w + 300) return;
    const farX = sx + this.skewX(LAYOUT.trackTop);
    ctx.fillStyle = '#ddd';
    ctx.fillRect(farX - 4, LAYOUT.trackTop - 120, 8, 120);
    ctx.fillStyle = '#12203a';
    ctx.fillRect(farX - 60, LAYOUT.trackTop - 150, 120, 34);
    text(ctx, 'FINISH', farX, LAYOUT.trackTop - 133, { size: 18, color: '#ffb400' });
  }

  /** Thin strip in front of the near lane: a curb with 1m ticks (a strong speed cue). */
  drawNearEdge(ctx, view, camera) {
    const top = this.trackBottom;
    ctx.fillStyle = '#4c9a3f';
    ctx.fillRect(0, top, view.w, view.h - top);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, top, view.w, 5);
    ctx.fillStyle = '#9a9a9a';
    const [left, right] = camera.visibleRange(view.w);
    for (let m = Math.floor(left); m < right + 1; m++) {
      ctx.fillRect(camera.toScreenX(m, view.w), top, 3, 5);
    }
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
