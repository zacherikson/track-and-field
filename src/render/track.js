import { text } from '../core/ui.js';

/**
 * Side-on stadium renderer with fake perspective.
 *
 * Lanes are horizontal bands (lane 1 nearest the camera, at the bottom).
 * Anything that crosses the track (start/finish lines, 10m marks) is drawn
 * slanted: it shifts right by SKEW px for every px it goes "into" the screen.
 * Runners get the same shift for their lane, so they line up with the lines.
 *
 * PARALLAX: layers further away scroll slower than the track (crowd at 0.5x),
 * nearer layers faster (grass at 1.15x). This sells depth and speed for free.
 */
export const LAYOUT = {
  standsTop: 44,
  boardsTop: 186,
  trackTop: 212,
  laneH: 36,
  skew: 0.42,
};

export class TrackRenderer {
  constructor(lanes, distance) {
    this.lanes = lanes;
    this.distance = distance;
    this.trackBottom = LAYOUT.trackTop + lanes * LAYOUT.laneH;
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

  draw(ctx, view, camera) {
    this.drawSky(ctx, view);
    this.drawStands(ctx, view, camera);
    this.drawBoards(ctx, view, camera);
    this.drawTrack(ctx, view, camera);
    this.drawInfield(ctx, view, camera);
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
    const seatW = 11;
    const offset = camera.x * camera.ppm * par;
    const first = Math.floor(offset / seatW) - 1;
    const count = Math.ceil(view.w / seatW) + 2;
    const palette = ['#f4d35e', '#ee964b', '#f95738', '#faf0ca', '#0d3b66', '#8ecae6', '#e9edc9', '#b5838d'];
    for (let row = 0; row < 11; row++) {
      const y = top + 16 + row * 12;
      const rowShift = (row % 2) * (seatW / 2);
      for (let i = first; i < first + count; i++) {
        const h = hash(i * 31 + row * 7919);
        if (h % 7 === 0) continue; // empty seat
        const x = i * seatW - offset + rowShift;
        ctx.fillStyle = palette[h % palette.length];
        ctx.fillRect(x, y, 7, 7);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, y + 8, view.w, 2);
    }
  }

  drawBoards(ctx, view, camera) {
    const top = LAYOUT.boardsTop;
    const h = LAYOUT.trackTop - top;
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
    const [left, right] = camera.visibleRange(view.w);
    const slantMargin = (this.skewX(top) / camera.ppm) | 0;
    const line = (xm, width, color) => {
      const sx = camera.toScreenX(xm, view.w);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(sx, bottom);
      ctx.lineTo(sx + this.skewX(top), top);
      ctx.stroke();
    };

    for (let m = Math.ceil((left - slantMargin) / 10) * 10; m <= right; m += 10) {
      if (m > 0 && m < this.distance) line(m, 1.5, 'rgba(255,255,255,0.35)');
    }
    line(0, 4, '#fff');
    // Finish: white line with a checkered strip behind it.
    line(this.distance, 4, '#fff');
    this.drawFinishChecker(ctx, view, camera);

    // Lane numbers painted behind the start and past the finish.
    for (let k = 1; k <= this.lanes; k++) {
      for (const xm of [-1.6, this.distance + 1.6]) {
        const p = this.toScreen(camera, view, xm, k);
        if (p.x < -40 || p.x > view.w + 40) continue;
        text(ctx, String(k), p.x, p.y, { size: 20, color: 'rgba(255,255,255,0.9)' });
      }
    }
    this.drawFinishPosts(ctx, view, camera);
  }

  drawFinishChecker(ctx, view, camera) {
    const sq = LAYOUT.laneH / 4;
    for (let row = 0; row < this.lanes * 4; row++) {
      const y = this.trackBottom - (row + 1) * sq;
      const sx = camera.toScreenX(this.distance, view.w) + this.skewX(y + sq / 2);
      if (sx < -20 || sx > view.w + 20) return;
      for (let c = 0; c < 2; c++) {
        ctx.fillStyle = (row + c) % 2 ? '#111' : '#fff';
        ctx.fillRect(sx + 2 + c * sq * 0.6, y, sq * 0.6, sq);
      }
    }
  }

  drawFinishPosts(ctx, view, camera) {
    const sx = camera.toScreenX(this.distance, view.w);
    if (sx < -200 || sx > view.w + 200) return;
    const farX = sx + this.skewX(LAYOUT.trackTop);
    ctx.fillStyle = '#ddd';
    ctx.fillRect(farX - 3, LAYOUT.trackTop - 70, 6, 70);
    ctx.fillStyle = '#12203a';
    ctx.fillRect(farX - 50, LAYOUT.trackTop - 96, 100, 30);
    text(ctx, 'FINISH', farX, LAYOUT.trackTop - 81, { size: 16, color: '#ffb400' });
  }

  drawInfield(ctx, view, camera) {
    const top = this.trackBottom;
    // Mowed grass stripes, scrolling slightly faster than the track (it's nearer).
    const par = 1.15;
    const stripeM = 4;
    ctx.fillStyle = '#3f8f3a';
    ctx.fillRect(0, top, view.w, view.h - top);
    ctx.fillStyle = '#48a043';
    const [left, right] = camera.visibleRange(view.w);
    const skewAll = (view.h - top) * LAYOUT.skew;
    const first = Math.floor((left - 2) / (stripeM * 2)) * stripeM * 2;
    const last = right + skewAll / camera.ppm + 2;
    for (let m = first; m < last; m += stripeM * 2) {
      const x0 = camera.toScreenX(m, view.w, par);
      const x1 = x0 + stripeM * camera.ppm * par;
      ctx.beginPath();
      ctx.moveTo(x0, top);
      ctx.lineTo(x1, top);
      ctx.lineTo(x1 - skewAll, view.h);
      ctx.lineTo(x0 - skewAll, view.h);
      ctx.closePath();
      ctx.fill();
    }
    // Curb along the near edge with 1m ticks: the strongest "speed" cue.
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, top, view.w, 5);
    ctx.fillStyle = '#9a9a9a';
    for (let m = Math.floor(left); m < right + 1; m++) {
      ctx.fillRect(camera.toScreenX(m, view.w), top, 3, 5);
    }
    // Distance labels.
    for (let m = Math.ceil(left / 10) * 10; m <= right; m += 10) {
      if (m <= 0 || m >= this.distance) continue;
      text(ctx, `${m}m`, camera.toScreenX(m, view.w), top + 20, { size: 13, color: 'rgba(255,255,255,0.8)' });
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
