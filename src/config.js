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
    pixelsPerMeter: 75, // zoom in the player's lane: runners ~1/4 screen tall, like the original
  },

  camera: {
    screenAnchorX: 0.5, // where the camera sits on screen (0 = left edge): the centre of the perspective
    lead: 1.0, // m the camera sits ahead of the player, so you see a bit more ahead than behind
    followSharpness: 5, // how tightly the camera chases (higher = snappier, lower = floatier)
    lookAheadPerMps: 0, // extra meters of look-ahead per m/s of speed
    maxLookAhead: 0, // meters
  },

  figure: {
    height: 1.8, // athlete height in meters (drawn size follows pixelsPerMeter)
  },

  /**
   * RUNNER PHYSICS (shared by every running event, player and AI alike).
   *
   *   correct inputs ("strides") -> cadence (strides/s, smoothed) -> target speed -> speed
   *
   * - Cadence is 1 / (smoothed interval between strides). If you stop, the time
   *   since your last stride (divided by idleGrace) counts as the interval, so
   *   the target speed falls away smoothly instead of instantly.
   * - Target speed = topSpeed * (cadence / cadenceForTopSpeed) ^ speedCurve.
   * - Actual speed chases the target: up at a limited acceleration that fades as
   *   you get faster (a real sprinter's drive phase), down at coastDecel.
   * In the 100m a stride is a tap on the lit target. Reading random targets caps
   * humans at roughly 3-6 strides/s, so the numbers below are tuned for that.
   */
  runner: {
    cadenceForTopSpeed: 5.2, // strides/s needed for top speed
    speedCurve: 0.6, // <1 = forgiving, 1 = linear, >1 = rewards only elite play
    topSpeed: 13.4, // m/s at full cadence
    // The start: you explode out of the blocks at startSpeed, with your pace
    // assumed to be startPace. Your real taps then pull the pace toward your
    // actual rhythm, so a good tapper keeps accelerating and a slow one eases
    // back. Start fast, slow down if you can't keep up.
    startSpeed: 6.0, // m/s on the first stride out of the blocks
    startPace: 4.5, // strides/s your pace is assumed to be on the first stride
    accelMax: 10.0, // m/s^2 from standstill
    accelFalloff: 0.72, // accel shrinks by this fraction as speed approaches topSpeed
    coastDecel: 4.0, // m/s^2 lost when your cadence is below what your speed needs
    finishDecel: 3.5, // m/s^2 braking after crossing the line
    cadenceSmoothing: 0.1, // 0..1 weight of the newest stride interval (higher = twitchier)
    idleGrace: 1.2, // a gap must exceed this x your usual interval before it slows you
    maxIntervalForAvg: 0.6, // s; long pauses count as this, so you recover quickly
    minStrideInterval: 0, // s; inputs closer than this to the last stride are ignored (two-thumb chords)
    // Animation only: meters per full leg cycle (two steps) grows with speed, like
    // real sprinters (about 2 m jogging, about 5.2 m at full speed). So legs turn
    // over faster AND reach further as you speed up.
    strideBase: 0.8, // m per cycle at a standstill (short, quick first steps out of the blocks)
    stridePerMps: 0.37, // extra m per cycle for each m/s
  },

  /**
   * FINISH LEAN (shared by lane races). Near the line the stride targets turn
   * into two orange lean pads (press both). Strides stop counting there: you carry your
   * speed. Press both thumbs together to lean: the torso pitches forward while
   * the legs keep running. Best timing puts your chest at full stretch right on
   * the line. Too early and you're upright again and slowing when you get there.
   */
  dip: {
    promptDistance: 20, // m before the line where strides stop and the orange lean pads show
    chordWindow: 0.06, // s; left + right presses this close together count as both thumbs
    armDelay: 0.3, // s after entering the zone before a lean can trigger (stray stride taps)
    reach: 1.0, // m the chest gets ahead of the hips at full lean
    torsoLead: 0.15, // m the chest is ahead of the hips running upright (timing uses the torso, like real track)
    riseTime: 0.32, // s to reach full lean (smooth, committed dip)
    holdTime: 0.16, // s held at full lean
    recoverTime: 0.22, // s to straighten back up
    leanDecel: 1.0, // m/s^2 lost while leaning
    postLeanDecel: 4.5, // m/s^2 lost once you straighten up before the line (leaned too early)
    minLeanSpeed: 4, // m/s; an early lean slows you to no less than this
    carryDecel: 0.5, // m/s^2 lost while carrying speed through the lean zone
    minCarrySpeed: 5, // m/s; slower than this and you just keep running (no coasting to a halt)
  },

  sprint100: {
    distance: 100,
    lanes: 6,
    // Real start rules: no part of the body may touch the ground on or in front
    // of the line before the gun, so athletes line up with their hands just
    // behind it. The clock still runs from the gun to the line at 100m.
    handGap: 0.05, // m: crouched hands are drawn this far behind the line in every lane
    startX: -0.55, // m: where each athlete's body starts relative to the line (hands clear it in every lane)
    playerLane: 1, // 1 = nearest the camera: the player always runs in the front lane
    startBlink: { period: 0.5, on: 0.3 }, // s: start button + player's lane flash on/off before READY
    countdown: {
      readyTime: 2.5, // s of READY: athletes wait a beat, crouch into the blocks, settle
      crouchDelay: [0.25, 0.55], // s after READY before each athlete starts to crouch (staggered)
      crouchTime: 1.2, // s from standing to settled: bend, hands down, kick rear leg back, then front
      setDelay: [0, 0.18], // s after GET SET before each athlete's hips start to rise
      riseTime: 0.4, // s to rise from the blocks into the set position
      setMin: 1.1, // "GET SET" lasts a random time in [setMin, setMax]
      setMax: 2.3, // so the GO can't be anticipated
      goBanner: 0.7, // s the "GO!" text stays up
    },
    // Random targets: never more than maxSameSide in a row on one side, so after
    // two on the left the next is guaranteed right: learn it and pre-empt it.
    targets: {
      maxSameSide: 2,
      switchChance: 0.5, // chance of switching sides when not forced
      missLockout: 0, // s; a wrong-side tap freezes your input this long (0 = none, like the original)
      missSpeedLoss: 1.7, // m/s lost on a wrong-side tap
    },
    pads: {
      radius: 56, // target size (visual only; the hit zone is the whole screen half)
      homeY: 0.4, // height of each side's target spot (and the start button), as a fraction of screen height
      edgeInset: 26, // px from the screen edge (plus safe area) to each side's target spot
      // Measured frame by frame from gameplay footage of the original:
      drop: {
        duration: 0.1, // s to fall onto its spot (about 3 frames at 30fps)
        height: 1.65, // starts this many radii above its spot
        startAlpha: 0.7, // slightly see-through at the top, solid when it lands
        trail: 2, // faint rim echoes trailing above it while it falls
      },
      missX: 0.25, // s the red ✕ stays up after a wrong tap (visual only)
      hitRing: {
        duration: 0.18, // s the outline lasts after a hit
        grow: 1.35, // it expands from the pad's rim to this many radii
      },
    },
    driveDistance: 12, // m out of the blocks over which runners rise from a low, forward drive to upright
    finishHold: 2.4, // s after you cross before the results screen
    maxRaceTime: 25, // s; give up and DNF after this
  },

  debug: {
    // 1 = draw a marker wherever the game receives each tap during a race, with
    // what it did: green hit, red miss, grey ignored (and why). A press with no
    // marker never reached the game (the phone or browser swallowed it).
    tapMarkers: 0,
  },

  /**
   * AI opponents tap like the player does, through the same runner physics,
   * with per-athlete cadence drawn from a range. Tune difficulty here.
   */
  ai: {
    amateur: {
      cadence: [2.9, 3.8], // strides/s range across the field
      reaction: [0.2, 0.35], // s from GO to first stride
      jitter: 0.3, // +/- fraction of randomness on each stride interval (reaction variance)
      fatigue: 0.05, // cadence lost by the finish (fades in over the last 40%)
      missChance: 0.03, // chance a stride is a wrong-side tap instead
      missSpeedLoss: 1.7, // same price the player pays
      missLockout: 0,
      dipError: [-1.2, 2.5], // m; AI leans at the ideal spot plus this (negative = late)
    },
    pro: {
      cadence: [3.9, 4.9],
      reaction: [0.16, 0.24],
      jitter: 0.22,
      fatigue: 0.03,
      missChance: 0.015,
      missSpeedLoss: 1.7, // same price the player pays
      missLockout: 0,
      dipError: [-0.6, 1.2],
    },
  },
};
