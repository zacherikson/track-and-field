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
    // The start: your first tap launches you out of the blocks at minSpeed, with
    // your pace assumed to be startPace. Your real taps then pull the pace toward
    // your actual rhythm, so a good tapper keeps accelerating and a slow one eases
    // back, but never below minSpeed. Start fast, slow down if you can't keep up.
    minSpeed: 7.0, // m/s: your speed on the first tap, and the slowest you run after it (stumbles can dip below it briefly)
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

  /**
   * 110m HURDLES, from footage of the original. Shares the 100m's start,
   * countdown and lean; only the differences live here (the event merges this
   * over sprint100). At GO and at every hurdle a new set of three numbered
   * buttons appears in shuffled slots: tap 1-2-3. How fast you clear a set sets
   * your pace until the next hurdle (see hurdleRules.js).
   */
  hurdles110: {
    distance: 110,
    dipPromptDistance: 17, // m: the lean zone starts just after the last hurdle's landing
    bannerY: 215, // READY / GET SET / GO! sit below the button row
    maxRaceTime: 30,
    runner: {
      // Pace = your taps within a set (reaction to the new set, then the two
      // taps after it), smoothed across sets.
      cadenceForTopSpeed: 4.6, // taps/s for full speed
      speedCurve: 0.5,
      topSpeed: 10.2, // m/s
      cadenceSmoothing: 0.35, // each set counts: a quick set speeds you up right away
    },
    hurdles: {
      count: 7, // the original has 7 (one every ~1.4 s), not the real 10
      first: 13.72, // m from the start line
      spacing: 12.9, // m
      height: 1.067, // m (drawing only)
    },
    clear: {
      takeoff: 2.1, // m before the hurdle where the hop starts (and the next set appears)
      landing: 1.4, // m after it where the hop ends
      cleanLoss: 0.3, // m/s lost clearing a hurdle cleanly
      minSpeed: 4.0, // m/s: slower than this at takeoff and you trip
      tripFaults: 1, // any fault (a wrong number, or a button not tapped in time) trips you at the hurdle
      trip: {
        hit: 0.2, // s from takeoff to catching the hurdle
        stumble: 0.4, // s staggering forward, arms flailing, braking
        recover: 0.25, // s to get back into your running form
        decel: 15, // m/s^2 you lose while stumbling (no sudden speed drop: you brake, then build up again)
      },
    },
    missSpeedLoss: 0, // m/s lost on the spot for a wrong number: none, the trip at the next hurdle is the penalty (and you lose that stride)
    buttons: {
      slotsX: [0.16, 0.5, 0.84], // slot centres as a fraction of screen width (hit zones are the thirds)
      y: 0.24, // fraction of screen height
      radius: 54, // bigger, like the original's
      fadeIn: 0.08, // s for a new set to fade in
    },
    // Rivals read a new set in `setReact` s, then tap `tapGap` s apart (their
    // reaction to the gun, miss chance, jitter and lean timing come from CONFIG.ai).
    ai: {
      amateur: { setReact: [0.45, 0.62], tapGap: [0.18, 0.25] }, // typical rival about 13.2s
      pro: { setReact: [0.42, 0.56], tapGap: [0.16, 0.22] }, // typical rival about 12.5s
    },
  },

  /**
   * LONG JUMP, from footage of the original plus real rules (see
   * longJumpRules.js). The run-up uses the 100m's targets and runner physics.
   */
  longJump: {
    rounds: 3, // attempts; your best counts
    runway: 45, // m from the start to the foul line (front edge of the board)
    // The runway's edge stripes are colored before the board, as in the
    // original, so the line doesn't sneak up on you (m before the foul line).
    runwayZones: [
      { from: 12, to: 8, color: '#ffd21f' }, // yellow: the takeoff pads start blinking at 12 m
      { from: 8, to: 4, color: '#ff8a1c' }, // orange
      { from: 4, to: 0.2, color: '#e8281e' }, // red: jump now
    ],
    zoneDistance: 12, // m before the line where the pads turn orange: strides stop, press both to take off
    blink: { period: 0.36, on: 0.24 }, // s: the orange takeoff pads blink, as in the original
    chordWindow: 0.08, // s: left + right presses this close together count as both
    overrun: 0.4, // m past the line without jumping and it's a foul
    jump: {
      keepX: 0.8, // share of run-up speed kept forward at takeoff
      liftBase: 3.6, // m/s upward at takeoff (higher than real, as in the original)...
      liftPerMps: 0.06, // ...plus this per m/s of run-up speed
      gravity: 9.81,
      landDrop: 0.5, // m the hips drop below takeoff height by landing (feet reach out in front)
      reach: 0.6, // m the heels land ahead of the hips (legs thrust out: full stretch)
      // No stretch: past the top the arc collapses. You crumple, legs tucked
      // under, drop steeply and flop forward onto your face.
      collapse: {
        keepX: 0.5, // share of your forward speed left past the top
        landDrop: 0.4, // m the hips drop below takeoff height when the feet hit the sand
        reach: 0, // m the heels land ahead of the hips (feet right under you)
      },
    },
    // In the air, as in the original: slow motion and a higher arc, so the
    // flight looks big and you have time to see the top coming. Looks only:
    // distances are the same.
    flight: {
      slowMo: { rate: 0.9, ramp: 0.15 }, // the clock eases down to 0.9x over the first 0.15 s after takeoff
      heightScale: 1.5, // the arc is drawn this much higher
      airStrides: 0, // leg cycles "running in the air" on the way up (0 = the original's arch-back hang)
    },
    // Stretch animation (s after pressing): knees snap up, jackknife, legs out;
    // then the heels reach for the sand over the last `contact` s.
    anim: { snap: 0.08, dive: 0.2, glide: 0.42, contact: 0.14 },
    // After the heels hit: you slide on through the sand (looks only; the mark
    // is where the heels went in).
    landing: {
      slide: 0.6, // m the body slides forward after a stretched landing
      slideTime: 0.3, // s the slide takes
      splash: 24, // sand puffs kicked up
    },
    stretch: {
      // Press both at the top of the jump and you throw yourself forward: a kick
      // (times the stretch quality) from that moment, landing far out on your heels.
      // A mini double jump: a little hop up, then a long flat glide.
      carryX: 0.8, // forward speed after a perfect stretch, as a share of your takeoff speed
      kickY: 1.3, // m/s hop upward
      window: 0.95, // real s the pads stay up after the top of the jump; the later you press, the weaker the kick
    },
    // Rivals: run-up pace from CONFIG.ai, plus where they take off relative to
    // the line (negative = over it: foul) and how late they stretch.
    ai: {
      amateur: { cadence: [3.0, 3.8], takeoffGap: [-0.1, 0.45], stretchDelay: [0.06, 0.3] },
      pro: { cadence: [3.7, 4.5], takeoffGap: [-0.03, 0.22], stretchDelay: [0.06, 0.2] },
    },
    markHold: 2.2, // s after landing before the mark banner
    markPan: { delay: 0.45 }, // s after landing before the camera pulls back to show the takeoff footprint and the landing mark
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
  /**
   * POLE VAULT, from footage of the original (see poleVaultRules.js). The box
   * (where the pole plants) is at world x = 0; the run-up uses the 100m's
   * targets and runner physics.
   */
  poleVault: {
    rounds: 3, // attempts; your best counts
    runway: 55, // m from the start to the box (a long run-up, as in the original)
    // The pole plants when your hips reach plantX: hands overhead at gripY,
    // pole tip in the box (plantX = -sqrt(length² - gripY²)).
    pole: { length: 4.6, gripY: 2.0, carryAngle: 1.05, overhang: 0.45 }, // m (box to hands), m, rad above level while running (tip high, like a real vaulter; it drops through the plant zone), m sticking out behind the hands
    zoneDistance: 12, // m before the plant: orange pads, strides stop, the pole tip drops to the box and the spark runs down it
    // Runway edge stripes, in m before the box (the plant is about 4.1 m out).
    runwayZones: [
      { from: 16, to: 12, color: '#ffd21f' },
      { from: 12, to: 8, color: '#ff8a1c' },
      { from: 8, to: 4.2, color: '#e8281e' },
    ],
    blink: { period: 0.36, on: 0.24 }, // s: the orange pads blink while the spark runs down
    chordWindow: 0.12, // s: left + right presses this close together count as both
    press: { window: 0.18, miss: 0.35 }, // s either side of the plant: plant quality falls to 0 at `window`; no press within `miss` and you run through (no height)
    spark: { climbTime: 0.6 }, // s for the spark to climb back up the pole while you hold
    release: { window: 0.18 }, // s either side of the spark reaching your hands
    // Height cleared = base + perMps * (speed - vRef) + gain * quality, where
    // quality = pressWeight * plant + (1 - pressWeight) * release (each 0..1).
    height: { base: 1.4, perMps: 0.4, vRef: 9, gain: 4.0, pressWeight: 0.5 },
    swing: { time: 1.1, bend: 0.22 }, // s from plant to the top of the pole; how much the pole bends (share of its length)
    // Off the pole (from the original, not gravity): rise while turning to face
    // the bar, hang face down over it, drop onto the mat (s).
    flight: { rise: 0.4, hang: 0.5, fall: 0.5 },
    mat: { from: 0.4, to: 5.6, height: 0.8 }, // m past the box
    uprightX: 0.6, // m past the box
    landX: 1.8, // m past the box where you come down on the mat
    markHold: 2.4, // s after landing before the result banner
    camera: { topFrac: 0.3 }, // the camera rises to keep the vaulter at least this far down the screen
    ai: {
      amateur: { cadence: [3.0, 3.8], pressErr: 0.14, releaseErr: 0.16, missChance: 0.07 },
      pro: { cadence: [3.7, 4.5], pressErr: 0.08, releaseErr: 0.1, missChance: 0.03 },
    },
  },

  ai: {
    amateur: {
      cadence: [2.6, 3.4], // strides/s range across the field (median time about 10.4s)
      reaction: [0.2, 0.35], // s from GO to first stride
      jitter: 0.3, // +/- fraction of randomness on each stride interval (reaction variance)
      fatigue: 0.05, // cadence lost by the finish (fades in over the last 40%)
      missChance: 0.03, // chance a stride is a wrong-side tap instead
      missSpeedLoss: 1.7, // same price the player pays
      missLockout: 0,
      dipError: [-1.2, 2.5], // m; AI leans at the ideal spot plus this (negative = late)
    },
    pro: {
      cadence: [2.88, 3.68], // median time about 9.85s
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
