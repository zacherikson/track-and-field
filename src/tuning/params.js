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
      { path: 'runner.startSpeed', label: 'Block exit speed', unit: 'm/s', min: 0, max: 9, step: 0.5, kmh: true, help: 'Speed you have instantly on your first tap. Higher = more explosive start.' },
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
      { path: 'hurdles110.clear.trip.stumble', label: 'Stumble time', unit: 'ms', scale: 1000, min: 0, max: 1.5, step: 0.05, help: 'How long your speed stays knocked down after catching a hurdle.' },
      { path: 'hurdles110.clear.trip.speed', label: 'Stumble speed', unit: 'm/s', min: 0, max: 9, step: 0.25, kmh: true, help: 'Your speed is knocked down to this when you catch a hurdle.' },
      { path: 'hurdles110.clear.tripFaults', label: 'Faults to trip', unit: '', min: 1, max: 3, step: 1, help: 'Wrong or untapped buttons in a set that make you trip at the next hurdle. 1 = any mistake, as in the original.' },
      { path: 'hurdles110.clear.cleanLoss', label: 'Speed lost per clean hurdle', unit: 'm/s', min: 0, max: 2, step: 0.05, kmh: true, help: 'Every clearance costs a little.' },
      { path: 'hurdles110.missSpeedLoss', label: 'Wrong-number speed loss', unit: 'm/s', min: 0, max: 5, step: 0.1, kmh: true, help: 'Tapping a number out of order.' },
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
