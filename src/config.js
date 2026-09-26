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

  /**
   * RUNNER PHYSICS (shared by every running event, player and AI alike).
   *
   *   taps -> cadence (taps/s, smoothed) -> target speed -> actual speed
   *
   * - Cadence is 1 / (smoothed interval between valid alternating taps). If you
   *   stop tapping, the time since your last tap counts as the interval, so the
   *   target speed falls away smoothly instead of instantly.
   * - Target speed = topSpeed * (cadence / cadenceForTopSpeed) ^ speedCurve
   *   (curve < 1 is forgiving: casual tapping still gets a decent speed).
   * - Actual speed chases the target: up at a limited acceleration that fades
   *   as you get faster (a real sprinter's drive phase), down at coastDecel.
   */
  runner: {
    cadenceForTopSpeed: 15, // taps/s needed for top speed (two thumbs alternating)
    speedCurve: 0.75, // <1 = forgiving, 1 = linear, >1 = rewards only elite tapping
    topSpeed: 13.4, // m/s at full cadence
    accelMax: 9.0, // m/s^2 from standstill
    accelFalloff: 0.72, // accel shrinks by this fraction as speed approaches topSpeed
    coastDecel: 4.0, // m/s^2 lost when tapping slower than your current speed needs
    finishDecel: 3.5, // m/s^2 braking after crossing the line
    cadenceSmoothing: 0.3, // 0..1 weight of the newest tap interval (higher = twitchier)
    maxIntervalForAvg: 0.5, // s; long pauses count as this, so you recover quickly
    minTapInterval: 0.04, // s; alternating taps closer than this are ignored (anti-mash)
    strideLength: 2.2, // m per full leg cycle (animation only)
  },

  sprint100: {
    distance: 100,
    lanes: 6,
    playerLane: 4, // 1 = nearest the camera
    countdown: {
      readyTime: 1.4, // s showing "READY" (athletes settle in blocks)
      setMin: 1.1, // "GET SET" lasts a random time in [setMin, setMax]
      setMax: 2.3, // so the GO can't be anticipated
      goBanner: 0.7, // s the "GO!" text stays up
    },
    falseStartsAllowed: 1, // warnings before disqualification
    falseStartPause: 1.6, // s on the FALSE START message before restarting
    finishHold: 2.2, // s after you cross before the results screen
    maxRaceTime: 25, // s; give up and DNF after this
  },

  /**
   * AI opponents tap like the player does, through the same runner physics,
   * with per-athlete cadence drawn from a range. Tune difficulty here.
   */
  ai: {
    amateur: {
      cadence: [8.6, 11.0], // taps/s range across the field
      reaction: [0.15, 0.3], // s from GO to first tap
      jitter: 0.12, // +/- fraction of randomness on each tap interval
      fatigue: 0.06, // cadence lost by the finish (fades in over the last 40%)
    },
    pro: {
      cadence: [11.6, 13.8],
      reaction: [0.13, 0.2],
      jitter: 0.08,
      fatigue: 0.04,
    },
  },
};
