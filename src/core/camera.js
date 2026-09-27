import { CONFIG } from '../config.js';
import { damp } from './math.js';

/**
 * 1D side-scrolling camera. World units are meters; the camera converts to
 * logical screen pixels. It sits `lead` meters ahead of the runner it follows
 * (like the original, so you see a bit more of what's coming than what's
 * behind) and chases it with frame-rate independent smoothing.
 */
export class Camera {
  constructor() {
    this.x = 0; // world x (m) that maps to the anchor point on screen
    this.ppm = CONFIG.world.pixelsPerMeter;
  }

  /** Put the camera on `targetX` (plus its lead) immediately. */
  snapTo(targetX) {
    this.x = targetX + CONFIG.camera.lead;
  }

  /** Chase a point `lead` meters ahead of targetX (plus optional look-ahead). */
  follow(targetX, speed, dt) {
    const c = CONFIG.camera;
    const goal = targetX + c.lead + Math.min(speed * c.lookAheadPerMps, c.maxLookAhead);
    this.x = damp(this.x, goal, c.followSharpness, dt);
  }

  /** World meters -> logical screen x. `scale` < 1 = further away (perspective or parallax). */
  toScreenX(worldX, viewW, scale = 1) {
    return (worldX - this.x) * this.ppm * scale + viewW * CONFIG.camera.screenAnchorX;
  }

  /** Visible world range [left, right] in meters at a given scale. */
  visibleRange(viewW, scale = 1) {
    const s = this.ppm * scale;
    const left = this.x - (viewW * CONFIG.camera.screenAnchorX) / s;
    return [left, left + viewW / s];
  }
}
