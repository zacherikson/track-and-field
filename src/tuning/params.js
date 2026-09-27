/**
 * Every setting the in-game tuning panel exposes, in plain language.
 * `path` points into CONFIG (dot-separated; array items by index).
 * `scale` converts the stored value for display (e.g. seconds -> ms).
 */
export const GROUPS = [
  {
    title: 'Tapping pace',
    blurb: 'The game averages your recent correct taps into a pace. Your pace sets how fast the runner wants to go.',
    params: [
      { path: 'runner.cadenceForTopSpeed', label: 'Pace for top speed', unit: 'taps/s', min: 2, max: 8, step: 0.1, help: 'How fast you must hit targets to reach full speed. Lower is easier.' },
      { path: 'runner.topSpeed', label: 'Top speed', unit: 'm/s', min: 8, max: 16, step: 0.1, kmh: true, help: 'The fastest anyone can run. Sets how low times can go.' },
      { path: 'runner.speedCurve', label: 'Forgiveness curve', unit: '', min: 0.4, max: 1.6, step: 0.05, help: 'Below 1: slow tapping still goes fairly fast. Above 1: only fast tapping pays off.' },
      { path: 'runner.cadenceSmoothing', label: 'Newest tap weight', unit: '', min: 0.1, max: 0.9, step: 0.05, help: 'How much the latest tap moves your pace. Higher = each tap matters more, but speed gets jumpier.' },
    ],
  },
  {
    title: 'Speeding up',
    blurb: 'How quickly the runner catches up to the speed your pace asks for.',
    params: [
      { path: 'runner.minSpeed', label: 'Minimum speed', unit: 'm/s', min: 0, max: 9, step: 0.5, kmh: true, help: 'Your speed on the first tap out of the blocks, and the slowest you run after that, however slowly you tap. Stumbles can still dip below it briefly.' },
      { path: 'runner.startPace', label: 'Starting pace', unit: 'taps/s', min: 2, max: 6, step: 0.1, help: 'The pace you are assumed to have on your first tap. Your real taps pull it toward your actual rhythm within a few steps.' },
      { path: 'runner.accelMax', label: 'Acceleration', unit: 'm/s²', min: 3, max: 25, step: 0.5, help: 'Punchy vs. sluggish. Higher = speed responds to your taps sooner.' },
      { path: 'runner.accelFalloff', label: 'Acceleration fade', unit: '%', scale: 100, min: 0, max: 0.95, step: 0.01, help: 'How much harder it gets to gain speed once you are already fast.' },
    ],
  },
  {
    title: 'Slowing down',
    blurb: 'What happens when your pace drops or you stop tapping.',
    params: [
      { path: 'runner.coastDecel', label: 'Slow-down rate', unit: 'm/s²', min: 0.5, max: 15, step: 0.25, help: 'How fast you lose speed when your pace drops or you stop.' },
      { path: 'runner.idleGrace', label: 'Hesitation allowance', unit: '× gap', min: 1, max: 3, step: 0.1, help: 'How much longer than your usual gap you can pause before you start slowing.' },
      { path: 'runner.maxIntervalForAvg', label: 'Longest gap counted', unit: 'ms', scale: 1000, min: 0.3, max: 1.5, step: 0.05, help: 'After a long pause, lower = you get your pace back sooner.' },
    ],
  },
  {
    title: 'Mistakes',
    blurb: 'Tapping the wrong side. A mistake also leaves a gap in your taps, which pulls your pace down too.',
    params: [
      { path: 'sprint100.targets.missSpeedLoss', label: 'Speed lost', unit: 'm/s', min: 0, max: 5, step: 0.1, kmh: true, help: 'Taken away instantly on a wrong tap.' },
      { path: 'sprint100.targets.missLockout', label: 'Penalty pause', unit: 'ms', scale: 1000, min: 0, max: 0.8, step: 0.01, help: 'How long a wrong tap blocks your next tap. 0 = no pause, like the original.' },
      { path: 'runner.minStrideInterval', label: 'Double-press guard', unit: 'ms', scale: 1000, min: 0, max: 0.15, step: 0.005, help: 'Taps this soon after a correct one are ignored, so slamming both thumbs can’t count twice.' },
    ],
  },
  {
    title: 'Targets',
    blurb: 'Where the green target appears.',
    params: [
      { path: 'sprint100.targets.maxSameSide', label: 'Max same side in a row', unit: '', min: 1, max: 4, step: 1, help: 'After this many on one side, the next is guaranteed to switch.' },
      { path: 'sprint100.targets.switchChance', label: 'Chance of switching', unit: '%', scale: 100, min: 0, max: 1, step: 0.05, help: 'When the side isn’t forced, how often it switches.' },
    ],
  },
  {
    title: 'Finish lean',
    blurb: 'Near the line, taps stop counting and you coast into your lean.',
    params: [
      { path: 'dip.promptDistance', label: 'Lean zone length', unit: 'm', min: 5, max: 30, step: 1, help: 'How far before the line the orange pads appear.' },
      { path: 'dip.carryDecel', label: 'Coasting slow-down', unit: 'm/s²', min: 0, max: 3, step: 0.1, help: 'Speed lost per second while coasting through the lean zone.' },
    ],
  },
  {
    title: 'Rivals (Amateur)',
    blurb: 'Rivals hit targets at their own pace, through the same physics as you.',
    params: [
      { path: 'ai.amateur.cadence.0', label: 'Slowest rival pace', unit: 'taps/s', min: 1.5, max: 7, step: 0.1, help: 'Each rival gets a pace between slowest and fastest.' },
      { path: 'ai.amateur.cadence.1', label: 'Fastest rival pace', unit: 'taps/s', min: 1.5, max: 7, step: 0.1, help: 'Raise to make the field harder to beat.' },
    ],
  },
  {
    title: 'Rivals (Pro)',
    blurb: 'The field you race when Pro is picked on the menu.',
    params: [
      { path: 'ai.pro.cadence.0', label: 'Slowest rival pace', unit: 'taps/s', min: 1.5, max: 7, step: 0.1, help: 'Each rival gets a pace between slowest and fastest.' },
      { path: 'ai.pro.cadence.1', label: 'Fastest rival pace', unit: 'taps/s', min: 1.5, max: 7, step: 0.1, help: 'Raise to make the Pro field harder to beat.' },
    ],
  },
  {
    title: '110m Hurdles',
    blurb: 'A new shuffled 1-2-3 set appears at GO and at every hurdle. How fast you clear it sets your pace; any mistake trips you at the next hurdle.',
    params: [
      { path: 'hurdles110.runner.cadenceForTopSpeed', label: 'Pace for top speed', unit: 'taps/s', min: 2, max: 10, step: 0.1, help: 'Taps per second within a set (counting your reaction to it) needed for full speed.' },
      { path: 'hurdles110.runner.topSpeed', label: 'Top speed', unit: 'm/s', min: 7, max: 13, step: 0.1, kmh: true, help: 'Fastest hurdling speed.' },
      { path: 'hurdles110.clear.trip.stumble', label: 'Stumble time', unit: 'ms', scale: 1000, min: 0, max: 1.5, step: 0.05, help: 'How long you brake (and can’t speed up) after catching a hurdle.' },
      { path: 'hurdles110.clear.trip.decel', label: 'Stumble braking', unit: 'm/s²', min: 0, max: 30, step: 0.5, help: 'How hard you lose speed while stumbling after catching a hurdle.' },
      { path: 'hurdles110.clear.tripFaults', label: 'Faults to trip', unit: '', min: 1, max: 3, step: 1, help: 'Wrong or untapped buttons in a set that make you trip at the next hurdle. 1 = any mistake, as in the original.' },
      { path: 'hurdles110.clear.cleanLoss', label: 'Speed lost per clean hurdle', unit: 'm/s', min: 0, max: 2, step: 0.05, kmh: true, help: 'Every clearance costs a little.' },
      { path: 'hurdles110.missSpeedLoss', label: 'Wrong-number speed loss', unit: 'm/s', min: 0, max: 5, step: 0.1, kmh: true, help: 'Tapping a number out of order.' },
    ],
  },
  {
    title: 'Long Jump: flight',
    blurb: 'How the jump looks and plays in the air. Look-only settings don’t change distances.',
    params: [
      { path: 'longJump.flight.slowMo.rate', label: 'Air speed (slow motion)', unit: '×', min: 0.3, max: 1, step: 0.05, help: 'How fast the game runs while you’re in the air. Lower = more hang time and more time to see the top coming. Look only.' },
      { path: 'longJump.flight.heightScale', label: 'Arc height (drawn)', unit: '×', min: 1, max: 3, step: 0.1, help: 'Draws the arc this much higher. Look only.' },
      { path: 'longJump.flight.airStrides', label: 'Running in the air', unit: 'strides', min: 0, max: 4, step: 0.5, help: 'Leg cycles on the way up (hitch kick). 0 = the original’s arched-back hang. Look only.' },
      { path: 'longJump.jump.liftBase', label: 'Takeoff lift', unit: 'm/s', min: 1.5, max: 5, step: 0.1, help: 'Upward speed off the board. Higher = a taller, longer jump and more distance.' },
      { path: 'longJump.jump.keepX', label: 'Forward speed kept', unit: '%', scale: 100, min: 0.5, max: 1, step: 0.01, help: 'Share of your run-up speed carried forward off the board. Scales every jump.' },
    ],
  },
  {
    title: 'Long Jump: stretch',
    blurb: 'Pressing both at the top: the mini double jump, and the collapse when you don’t.',
    params: [
      { path: 'longJump.stretch.kickY', label: 'Stretch hop', unit: 'm/s', min: 0, max: 3, step: 0.1, help: 'The little hop up when you stretch. Bigger = more of a double jump, and further.' },
      { path: 'longJump.stretch.carryX', label: 'Stretch glide speed', unit: '%', scale: 100, min: 0.4, max: 1.2, step: 0.01, help: 'Forward speed after a perfect stretch, as a share of your takeoff speed. Higher = a longer glide.' },
      { path: 'longJump.stretch.window', label: 'Stretch window', unit: 'ms', scale: 1000, min: 0.15, max: 1, step: 0.05, help: 'How long the pads stay up after the top. The later you press inside it, the weaker the stretch.' },
      { path: 'longJump.jump.collapse.keepX', label: 'No-stretch collapse', unit: '%', scale: 100, min: 0.1, max: 1, step: 0.05, help: 'Forward speed left past the top if you don’t stretch. Lower = the arc drops more steeply and you land shorter.' },
      { path: 'longJump.landing.slide', label: 'Landing slide', unit: 'm', min: 0, max: 2, step: 0.1, help: 'How far you slide on through the sand after a stretched landing. Look only (the mark is where your heels went in).' },
      { path: 'longJump.landing.splash', label: 'Sand splash', unit: 'puffs', min: 0, max: 60, step: 2, help: 'Sand kicked up on landing. Look only.' },
      { path: 'longJump.zoneDistance', label: 'Takeoff zone', unit: 'm', min: 4, max: 20, step: 1, help: 'Meters before the board where the pads turn orange and you can take off.' },
    ],
  },
  {
    title: 'Troubleshooting',
    blurb: 'Tools for finding out why a tap did or didn’t count.',
    params: [
      { path: 'debug.tapMarkers', label: 'Tap markers (1 = on)', unit: '', min: 0, max: 1, step: 1, help: 'Marks every tap the game receives: green = stride, red = wrong side, grey = ignored (with the reason). A press that leaves no marker never reached the game.' },
    ],
  },
];

export const PARAMS = GROUPS.flatMap((g) => g.params);
