import { Camera } from '../core/camera.js';
import { clamp, damp } from '../core/math.js';
import { CONFIG } from '../config.js';

/**
 * Where the late hits happen: the event's own stadium, seen through the
 * event's own camera (past the finish line, round the pit). Each event scene
 * makes one when its late hits start.
 *
 * Ground points are (x, d) in meters: x along the track as in the event, d
 * across it from the near edge. `zPerM` turns d into the renderer's depth
 * (lanes for a race, the infield strip for a field event).
 *
 *   track      the event's renderer (a TrackRenderer: project, scaleAt, zNear)
 *   draw       (ctx, view, camera): everything behind the athletes
 *   drawFront  (ctx, view, camera): anything in front of them (a vault upright)
 *   x, depth   the ground you can walk on: x = [min, max], depth in m
 *   zPerM      renderer depth units per meter across
 *   floor      (x, d) -> height of the ground there (m), e.g. the vault's landing mat
 *   spot       (k) -> { x, d, facing } where the k-th computer rival heads when they come over (k = 1, 2...)
 *   camera     the event's own camera, so the view carries straight on from the event
 */
export class Venue {
  constructor({ track, draw, drawFront = null, x, depth, zPerM, floor = null, spot = null, camera }) {
    this.track = track;
    this.drawBack = draw;
    this.drawFrontFn = drawFront;
    [this.xMin, this.xMax] = x;
    this.dMin = 0.25;
    this.dMax = depth - 0.25;
    this.zPerM = zPerM;
    this.floorFn = floor;
    this.spot = spot;
    this.camera = camera ?? new Camera();
    this.view = null;
  }

  zOf(d) {
    return this.track.zNear + d * this.zPerM;
  }

  /** Screen point of ground (x, d), and pixels per meter of an athlete standing there. */
  screen(view, x, d) {
    const z = this.zOf(d);
    const p = this.track.project(this.camera, view, x, z);
    return { x: p.x, y: p.y + 4, px: this.camera.ppm * Math.pow(this.track.scaleAt(z), 0.2) };
  }

  floorAt(x, d) {
    return this.floorFn ? this.floorFn(x, d) : 0;
  }

  /** Keeps the camera on `x` (your athlete), where the event's camera would sit, without showing past the ends of the ground. */
  follow(x, dt) {
    const w = this.view?.w ?? 960;
    const half = (w * 0.5) / this.camera.ppm - 0.5;
    const lo = this.xMin + half;
    const hi = this.xMax - half;
    const goal = lo > hi ? (this.xMin + this.xMax) / 2 : clamp(x + CONFIG.camera.lead, lo, hi);
    this.camera.x = damp(this.camera.x, goal, 4, dt);
  }

  /** Half the width of the ground on screen, in meters (near the camera). */
  halfWidth() {
    return ((this.view?.w ?? 960) * 0.5) / this.camera.ppm;
  }

  draw(ctx, view) {
    this.view = view;
    this.drawBack(ctx, view, this.camera);
  }

  drawFront(ctx, view) {
    this.drawFrontFn?.(ctx, view, this.camera);
  }
}

// A field event's infield strip is one renderer lane deep; call it this many meters across.
export const FIELD_DEPTH = 7;

// Where the others gather round you after a field event (you're at [0, 0]).
const SLOTS = [[0, 0], [-2.3, 0.4], [2.3, -0.3], [-1.2, 1.7], [1.3, 1.5], [0.2, -1.4], [-2.8, -1.1], [2.7, 1.9]];

/** Where the k-th rival (1, 2...) comes to stand after a field event, round you at (x0, the middle of the depth). */
export function fieldSpot(x0, depth) {
  return (k) => {
    const [dx, dd] = SLOTS[k % SLOTS.length];
    return { x: x0 + dx, d: clamp(depth / 2 + dd, 0.6, depth - 0.6), facing: dx > 0 ? -1 : 1 };
  };
}
