import { CONFIG } from '../config.js';
import { damp } from './math.js';

/**
 * 1D side-scrolling camera. World units are meters; the camera converts to
 * logical screen pixels. It chases a target point with frame-rate independent
 * smoothing and "looks ahead" in the direction of travel so the player sees
 * what is coming instead of being glued to the screen edge.
 */
export class Camera {
  constructor() {
    this.x = 0; // world x (m) that maps to the anchor point on screen
    this.ppm = CONFIG.world.pixelsPerMeter;
  }

  snapTo(x) {
    this.x = x;
  }

  follow(targetX, speed, dt) {
    const c = CONFIG.camera;
    const goal = targetX + Math.min(speed * c.lookAheadPerMps, c.maxLookAhead);
    this.x = damp(this.x, goal, c.followSharpness, dt);
  }

  /** World meters -> logical screen x. `parallax` < 1 scrolls slower (far away things). */
  toScreenX(worldX, viewW, parallax = 1) {
    return (worldX - this.x) * this.ppm * parallax + viewW * CONFIG.camera.screenAnchorX;
  }

  /** Visible world range [left, right] in meters. */
  visibleRange(viewW) {
    const left = this.x - (viewW * CONFIG.camera.screenAnchorX) / this.ppm;
    return [left, left + viewW / this.ppm];
  }
}
