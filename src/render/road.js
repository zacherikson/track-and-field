import { text } from '../core/ui.js';
import { drawFigure, legIK, BONES } from '../athletes/stickFigure.js';
import { venueFor } from './venues.js';

/**
 * The time trial's road, side on: a strip of tarmac that really climbs and
 * drops, with hills behind it on slow parallax, distance boards, the time
 * check banners, the start and the finish. Colors from the venue's `road`
 * (venues.js); the sky is the venue's own.
 *
 * World: x (m) along the road, height h (m) from the course (cyclingRules.js
 * buildCourse). Heights are drawn `vex` times taller than they are, so an 8%
 * climb looks like one on a phone. The camera is { x, h }: the road point it
 * centres on (x lands at `anchorX` of the screen width, height h at `baseY`).
 */
export const ROAD = {
  ppm: 56, // px per m along the road (the riders' scale)
  vex: 2.2, // heights drawn this much taller
  anchorX: 0.38, // the camera's x sits this far across the screen: more road ahead than behind
  baseY: 372, // screen y of the camera's height
  roadPx: 16, // tarmac thickness on screen
};

export class RoadRenderer {
  /** @param road buildCourse(CONFIG.cycling.course) */
  constructor(road, venue = venueFor()) {
    this.road = road;
    this.venue = venue;
    this.colors = venue.road;
  }

  sx(cam, view, x) {
    return (x - cam.x) * ROAD.ppm + view.w * ROAD.anchorX;
  }

  sy(cam, h) {
    return ROAD.baseY - (h - cam.h) * ROAD.ppm * ROAD.vex;
  }

  /** Screen point of the road surface at x. */
  ground(cam, view, x) {
    return { x: this.sx(cam, view, x), y: this.sy(cam, this.road.heightAt(x)) };
  }

  /** The road's angle on screen at x (rad; negative = climbing, for ctx.rotate). */
  slope(x) {
    return -Math.atan(this.road.gradeAt(x) * ROAD.vex);
  }

  /** World x range on screen, with a margin. */
  range(cam, view, margin = 4) {
    const left = cam.x - (view.w * ROAD.anchorX) / ROAD.ppm;
    return [left - margin, left + view.w / ROAD.ppm + margin];
  }

  draw(ctx, view, cam) {
    this.drawSky(ctx, view);
    this.drawHills(ctx, view, cam);
    this.drawGround(ctx, view, cam);
    this.drawMarkers(ctx, view, cam);
  }

  drawSky(ctx, view) {
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, this.venue.sky.top);
    g.addColorStop(1, this.venue.sky.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  /** Two ridges of hills, far and near, scrolling slower than the road; trees on the near one. */
  drawHills(ctx, view, cam) {
    const c = this.colors;
    const ridge = (color, par, lift, a1, w1, a2, w2) => {
      const off = cam.x * ROAD.ppm * par;
      const base = ROAD.baseY - lift + cam.h * ROAD.ppm * ROAD.vex * par * 0.5; // a little vertical parallax too
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, view.h);
      for (let x = 0; x <= view.w + 20; x += 20) {
        const w = x + off;
        ctx.lineTo(x, base - a1 * (1 + Math.sin(w / w1)) - a2 * Math.sin(w / w2));
      }
      ctx.lineTo(view.w, view.h);
      ctx.closePath();
      ctx.fill();
      return { off, base };
    };
    ridge(c.hillFar, 0.08, 170, 40, 260, 18, 97);
    const near = ridge(c.hillNear, 0.22, 95, 26, 170, 12, 61);
    // A line of trees along the near ridge.
    const step = 34;
    const first = Math.floor(near.off / step) - 1;
    ctx.fillStyle = c.tree;
    for (let i = first; i < first + Math.ceil(view.w / step) + 2; i++) {
      const h = hash(i * 977);
      if (h % 3 === 0) continue;
      const x = i * step - near.off + (h % 13);
      const w = x + near.off;
      const y = near.base - 26 * (1 + Math.sin(w / 170)) - 12 * Math.sin(w / 61) + 4;
      const ht = 18 + (h % 16);
      ctx.beginPath();
      ctx.moveTo(x, y - ht);
      ctx.lineTo(x + 7 + (h % 4), y);
      ctx.lineTo(x - 7 - (h % 4), y);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** Earth under the road, a grass verge, the tarmac and its white edge line. */
  drawGround(ctx, view, cam) {
    const c = this.colors;
    const [from, to] = this.range(cam, view);
    const pts = [];
    for (let x = from; x <= to; x += 1.5) pts.push(this.ground(cam, view, x));
    const strip = (color, dy0, dy1) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y + dy0) : ctx.moveTo(p.x, p.y + dy0)));
      for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x, Math.min(view.h + 400, pts[i].y + dy1));
      ctx.closePath();
      ctx.fill();
    };
    strip(c.earth, 0, view.h + 400);
    strip(c.verge, ROAD.roadPx, ROAD.roadPx + 14);
    strip(c.asphalt, 0, ROAD.roadPx);
    ctx.strokeStyle = c.edge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y + 1) : ctx.moveTo(p.x, p.y + 1)));
    ctx.stroke();
    // Dashes along the middle of the road, so you can see it moving.
    ctx.strokeStyle = c.edge;
    ctx.lineWidth = 2;
    for (let x = Math.ceil(from / 4) * 4; x < to; x += 4) {
      const a = this.ground(cam, view, x);
      const b = this.ground(cam, view, x + 1.6);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + ROAD.roadPx * 0.55);
      ctx.lineTo(b.x, b.y + ROAD.roadPx * 0.55);
      ctx.stroke();
    }
  }

  /** Distance boards every 100 m, the time check banners, the start and the finish. */
  drawMarkers(ctx, view, cam) {
    const [from, to] = this.range(cam, view, 8);
    const L = this.road.length;
    for (let m = Math.ceil(Math.max(100, from) / 100) * 100; m < Math.min(L, to); m += 100) this.drawBoard(ctx, view, cam, m, `${L - m}m`);
    this.road.checks.forEach((x, i) => x > from && x < to && this.drawArch(ctx, view, cam, x, `TIME CHECK ${i + 1}`, false));
    if (0 > from && 0 < to) this.drawArch(ctx, view, cam, 0, 'START', false);
    if (L > from && L < to) this.drawArch(ctx, view, cam, L, 'FINISH', true);
  }

  /** A small roadside board on a post: how far to go. */
  drawBoard(ctx, view, cam, x, label) {
    const p = this.ground(cam, view, x);
    ctx.fillStyle = this.colors.post;
    ctx.fillRect(p.x - 1.5, p.y - 44, 3, 44);
    ctx.fillStyle = this.colors.banner;
    ctx.fillRect(p.x - 22, p.y - 58, 44, 18);
    text(ctx, label, p.x, p.y - 49, { size: 12, color: this.colors.bannerText });
  }

  /** An inflatable arch over the road with a banner: the start, a time check or the finish (with its line). */
  drawArch(ctx, view, cam, x, label, finish) {
    const p = this.ground(cam, view, x);
    const h = 128;
    const w = 12;
    ctx.fillStyle = this.colors.banner;
    ctx.fillRect(p.x - w / 2, p.y - h, w, h);
    ctx.fillRect(p.x - 70, p.y - h - 24, 140, 28);
    text(ctx, label, p.x, p.y - h - 10, { size: 15, weight: 800, color: this.colors.bannerText, maxWidth: 130 });
    if (finish) {
      // A chequered line across the road.
      const s = 4;
      for (let row = 0; row < ROAD.roadPx / s; row++) {
        for (let col = 0; col < 2; col++) {
          ctx.fillStyle = (row + col) % 2 ? '#111' : '#fff';
          ctx.fillRect(p.x - s + col * s, p.y + row * s, s, s);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- the rider on the bike

// The bike, in m from the point on the road under its middle (x forward, y down).
const BIKE = {
  wheelR: 0.34,
  axle: 0.5, // half the wheelbase
  bb: { x: -0.05, y: -0.27 }, // bottom bracket (the cranks' axle)
  crank: 0.17,
  seat: { x: -0.24, y: -0.92 }, // top of the saddle
  head: { x: 0.36, y: -0.78 }, // top of the head tube
  bars: { x: 0.5, y: -0.84 }, // the tri-bars, where the hands go
};
const FIG = 1.8; // m: a figure's height (stickFigure.js works in figure heights)

/** Two-bone IK with the joint bent downward (an elbow under the line): angles from straight down, + = forward. */
function armIK(sx, sy, hx, hy) {
  const L1 = BONES.upper;
  const L2 = BONES.fore;
  const dx = hx - sx;
  const dy = hy - sy;
  const d = Math.min(Math.hypot(dx, dy), L1 + L2 - 1e-4);
  const base = Math.atan2(dx, dy);
  const a = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const upper = base - a;
  const ex = sx + L1 * Math.sin(upper);
  const ey = sy + L1 * Math.cos(upper);
  return { upper, fore: Math.atan2(hx - ex, hy - ey) };
}

/**
 * A rider on a time trial bike, wheels on the road at (x, y), tilted `angle`
 * with it. `H` = a figure's height in px. `s` = { crank, wheel, tuck, reach }
 * (rad, rad, bool, m: the bike thrown forward at the line). Disc wheel at
 * the back, three spokes at the front, an aero helmet in the kit's color.
 */
export function drawCyclist(ctx, x, y, H, angle, s, colors) {
  const k = H / FIG; // px per m
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Shadow on the road.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, 1, 0.8 * k, 0.07 * k, 0, 0, Math.PI * 2);
  ctx.fill();

  // The bike, shoved forward in a throw (the rider stays put, arms out).
  const bx = s.reach;
  const P = (pt) => ({ x: (pt.x + bx) * k, y: pt.y * k });
  const rear = P({ x: -BIKE.axle, y: -BIKE.wheelR });
  const front = P({ x: BIKE.axle, y: -BIKE.wheelR });
  const bb = P(BIKE.bb);
  const seat = P(BIKE.seat);
  const head = P(BIKE.head);
  const bars = P(BIKE.bars);
  const r = BIKE.wheelR * k;
  const crankAt = (a) => ({ x: bb.x + Math.sin(a) * BIKE.crank * k, y: bb.y - Math.cos(a) * BIKE.crank * k });

  // Far crank and pedal.
  const far = crankAt(s.crank + Math.PI);
  line(ctx, bb, far, '#555', Math.max(2, 0.03 * k));

  // Wheels: a disc at the back, a tri-spoke at the front.
  ctx.fillStyle = '#2b2f36';
  circle(ctx, rear.x, rear.y, r);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  circle(ctx, rear.x, rear.y, r * 0.55);
  ctx.strokeStyle = '#151515';
  ctx.lineWidth = Math.max(2, 0.05 * k);
  ring(ctx, rear.x, rear.y, r);
  ring(ctx, front.x, front.y, r);
  for (let i = 0; i < 3; i++) {
    const a = s.wheel + (i * Math.PI * 2) / 3;
    line(ctx, front, { x: front.x + Math.cos(a) * r * 0.92, y: front.y + Math.sin(a) * r * 0.92 }, '#e8e8e8', Math.max(2, 0.04 * k));
  }

  // Frame in the kit's color, with dark tubes where the wheels meet it.
  const frame = colors.shirt;
  const fw = Math.max(3, 0.045 * k);
  line(ctx, rear, bb, '#333', fw * 0.8); // chain stay
  line(ctx, rear, P({ x: -0.2, y: -0.72 }), '#333', fw * 0.8); // seat stay
  line(ctx, bb, P({ x: -0.2, y: -0.72 }), frame, fw); // seat tube
  line(ctx, P({ x: -0.2, y: -0.72 }), head, frame, fw); // top tube
  line(ctx, bb, P({ x: 0.4, y: -0.62 }), frame, fw * 1.2); // down tube
  line(ctx, head, front, '#333', fw); // fork
  line(ctx, seat, P({ x: -0.2, y: -0.72 }), '#333', fw * 0.7); // seat post
  line(ctx, P({ x: -0.32, y: -0.93 }), P({ x: -0.14, y: -0.93 }), '#111', fw); // saddle
  line(ctx, head, bars, '#222', fw * 0.8); // bars

  // The rider, sat on the saddle. drawFigure works from a feet origin in
  // figure heights; ours is the road under the bike's middle.
  const hip = { x: (BIKE.seat.x + 0.02) / FIG, y: (BIKE.seat.y - 0.05) / FIG };
  const lean = s.tuck ? 1.42 : 1.24; // nearly flat on the tri-bars; flatter still tucked
  const shoulder = { x: hip.x + Math.sin(lean) * BONES.torso * 0.9, y: hip.y - Math.cos(lean) * BONES.torso * 0.9 };
  const hand = { x: (BIKE.bars.x + bx - (s.tuck ? 0.04 : 0)) / FIG, y: (BIKE.bars.y - 0.04) / FIG };
  const arm = armIK(shoulder.x, shoulder.y, hand.x, hand.y);
  const foot = (a) => {
    const c = { x: BIKE.bb.x + bx + Math.sin(a) * BIKE.crank, y: BIKE.bb.y - Math.cos(a) * BIKE.crank };
    return { ...legIK(hip.x, hip.y, (c.x - 0.05) / FIG, (c.y - 0.03) / FIG), toe: 0.15 }; // ball of the foot on the pedal
  };
  const pose = {
    hipX: hip.x,
    hipY: hip.y,
    lean,
    legs: [foot(s.crank), foot(s.crank + Math.PI)],
    arms: [arm, { upper: arm.upper - 0.05, fore: arm.fore - 0.05 }],
  };
  const top = drawFigure(ctx, 0, 0, H, pose, { ...colors, hair: colors.hair }, 9999);

  // Near crank and pedal over the leg.
  const near = crankAt(s.crank);
  line(ctx, bb, near, '#777', Math.max(2, 0.035 * k));

  // Aero helmet: a teardrop over the head, tail back.
  const HEAD = 0.085 * H;
  const hc = { x: top.headX, y: top.headY + HEAD };
  ctx.save();
  ctx.translate(hc.x, hc.y);
  ctx.rotate(lean - Math.PI / 2);
  ctx.fillStyle = colors.shorts;
  ctx.beginPath();
  ctx.ellipse(-HEAD * 0.35, -HEAD * 0.25, HEAD * 1.55, HEAD * 0.95, 0, Math.PI, Math.PI * 2);
  ctx.lineTo(HEAD * 1.2, -HEAD * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = colors.shirt;
  ctx.fillRect(-HEAD * 1.4, -HEAD * 0.55, HEAD * 2, HEAD * 0.18);
  ctx.restore();

  ctx.restore();
}

function line(ctx, a, b, color, w) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ring(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function hash(n) {
  n = (n ^ 61) ^ (n >>> 16);
  n = Math.imul(n, 9);
  n ^= n >>> 4;
  n = Math.imul(n, 0x27d4eb2d);
  n ^= n >>> 15;
  return n >>> 0;
}
