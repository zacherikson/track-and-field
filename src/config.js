/**
 * ALL TUNING NUMBERS LIVE HERE.
 * Units: meters, seconds, meters/second, taps/second, logical pixels.
 * Log feel changes you keep in CHANGELOG.md so you can roll back what felt worse.
 */
export const CONFIG = {
  view: {
    logicalHeight: 540, // everything is laid out in a 540-tall virtual screen; width varies by phone
    maxDpr: 2, // cap retina resolution; 3x canvases cost fill-rate for little visible gain
  },

  loop: {
    fixedStep: 1 / 120, // simulation step (s). 120Hz keeps tap timing precise
    maxFrameDt: 0.1, // clamp huge frame gaps (tab switch, GC pause)
  },

  world: {
    pixelsPerMeter: 38, // zoom level: ~30m of track visible on a typical phone
  },

  camera: {
    screenAnchorX: 0.3, // where the followed runner sits horizontally (0 = left edge)
    followSharpness: 5, // how tightly the camera chases (higher = snappier, lower = floatier)
    lookAheadPerMps: 0.35, // meters of look-ahead per m/s of speed
    maxLookAhead: 4, // meters
  },

  figure: {
    height: 1.8, // athlete height in meters (drawn size follows pixelsPerMeter)
  },
};
