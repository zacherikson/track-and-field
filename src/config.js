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

  /**
   * FINISH DIP (shared by lane races). Near the line the stride targets turn
   * into a two-thumb "DIP!" prompt. Strides stop counting there: you carry your
   * speed. Press both thumbs together to lunge. Best timing puts your chest at
   * full stretch right on the line (about 5m out at top speed). Too early and
   * you slide to a stop short of it.
   */
  dip: {
    promptDistance: 15, // m before the line where strides stop and the DIP prompt shows
    chordWindow: 0.06, // s; left + right presses this close together count as both thumbs
    // (must stay below a fast tapper's alternating interval, ~0.07s at 15 taps/s)
    armDelay: 0.3, // s after entering the zone before a dip can trigger (stray stride taps)
    reach: 1.0, // m the chest lunges ahead of the hips at full stretch
    riseTime: 0.25, // s to reach full stretch
    airTime: 0.08, // s of flight at full stretch before hitting the track
    airDecel: 1.5, // m/s^2 lost while flying
    slideDecel: 18, // m/s^2 lost sliding on the track (dived too early)
    carryDecel: 0.6, // m/s^2 lost while carrying speed through the dip zone
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
    pads: {
      radius: 56, // tap target size (visual only; the hit zone is the whole screen half)
      homeY: 0.66, // starting height of the targets, as a fraction of screen height
      edgeInset: 26, // px from the screen edge (plus safe area) for the starting spots
      followThumb: true, // each target reappears where that thumb last tapped
    },
    finishHold: 2.4, // s after you cross before the results screen
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
      dipError: [-1.2, 2.5], // m; AI dips at the ideal spot plus this (negative = late)
    },
    pro: {
      cadence: [11.6, 13.8],
      reaction: [0.13, 0.2],
      jitter: 0.08,
      fatigue: 0.04,
      dipError: [-0.6, 1.2],
    },
  },
};
