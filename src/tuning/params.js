/**
 * Every setting the in-game tuning panel exposes, in plain language.
 * `events`: the events a group is for (the panel opened from an event shows
 * its own groups, then the `shared` ones: running and troubleshooting).
 * `path` points into CONFIG (dot-separated; array items by index).
 * `scale` converts the stored value for display (e.g. seconds -> ms).
 */
export const GROUPS = [
  {
    title: 'Tapping pace',
    events: ['sprint100', 'hurdles110', 'longjump', 'polevault', 'javelin'], shared: true,
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
    events: ['sprint100', 'hurdles110', 'longjump', 'polevault', 'javelin'], shared: true,
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
    events: ['sprint100', 'hurdles110', 'longjump', 'polevault', 'javelin'], shared: true,
    blurb: 'What happens when your pace drops or you stop tapping.',
    params: [
      { path: 'runner.coastDecel', label: 'Slow-down rate', unit: 'm/s²', min: 0.5, max: 15, step: 0.25, help: 'How fast you lose speed when your pace drops or you stop.' },
      { path: 'runner.idleGrace', label: 'Hesitation allowance', unit: '× gap', min: 1, max: 3, step: 0.1, help: 'How much longer than your usual gap you can pause before you start slowing.' },
      { path: 'runner.maxIntervalForAvg', label: 'Longest gap counted', unit: 'ms', scale: 1000, min: 0.3, max: 1.5, step: 0.05, help: 'After a long pause, lower = you get your pace back sooner.' },
    ],
  },
  {
    title: 'Mistakes',
    events: ['sprint100', 'hurdles110', 'longjump', 'polevault', 'javelin'], shared: true,
    blurb: 'Tapping the wrong side. A mistake also leaves a gap in your taps, which pulls your pace down too.',
    params: [
      { path: 'sprint100.targets.missSpeedLoss', label: 'Speed lost', unit: 'm/s', min: 0, max: 5, step: 0.1, kmh: true, help: 'Taken away instantly on a wrong tap.' },
      { path: 'sprint100.targets.missLockout', label: 'Penalty pause', unit: 'ms', scale: 1000, min: 0, max: 0.8, step: 0.01, help: 'How long a wrong tap blocks your next tap. 0 = no pause, like the original.' },
      { path: 'runner.minStrideInterval', label: 'Double-press guard', unit: 'ms', scale: 1000, min: 0, max: 0.15, step: 0.005, help: 'Taps this soon after a correct one are ignored, so slamming both thumbs can’t count twice.' },
    ],
  },
  {
    title: 'Targets',
    events: ['sprint100', 'hurdles110', 'longjump', 'polevault', 'javelin'], shared: true,
    blurb: 'Where the green target appears.',
    params: [
      { path: 'sprint100.targets.maxSameSide', label: 'Max same side in a row', unit: '', min: 1, max: 4, step: 1, help: 'After this many on one side, the next is guaranteed to switch.' },
      { path: 'sprint100.targets.switchChance', label: 'Chance of switching', unit: '%', scale: 100, min: 0, max: 1, step: 0.05, help: 'When the side isn’t forced, how often it switches.' },
    ],
  },
  {
    title: 'Finish lean',
    events: ['sprint100', 'hurdles110'],
    blurb: 'Near the line, taps stop counting and you coast into your lean.',
    params: [
      { path: 'dip.promptDistance', label: 'Lean zone length', unit: 'm', min: 5, max: 30, step: 1, help: 'How far before the line the orange pads appear.' },
      { path: 'dip.carryDecel', label: 'Coasting slow-down', unit: 'm/s²', min: 0, max: 3, step: 0.1, help: 'Speed lost per second while coasting through the lean zone.' },
    ],
  },
  {
    title: 'Rivals (Amateur)',
    events: ['sprint100', 'hurdles110'],
    blurb: 'Rivals hit targets at their own pace, through the same physics as you.',
    params: [
      { path: 'ai.amateur.cadence.0', label: 'Slowest rival pace', unit: 'taps/s', min: 1.5, max: 7, step: 0.1, help: 'Each rival gets a pace between slowest and fastest.' },
      { path: 'ai.amateur.cadence.1', label: 'Fastest rival pace', unit: 'taps/s', min: 1.5, max: 7, step: 0.1, help: 'Raise to make the field harder to beat.' },
    ],
  },
  {
    title: 'Rivals (Pro)',
    events: ['sprint100', 'hurdles110'],
    blurb: 'The field you race when Pro is picked on the menu.',
    params: [
      { path: 'ai.pro.cadence.0', label: 'Slowest rival pace', unit: 'taps/s', min: 1.5, max: 7, step: 0.1, help: 'Each rival gets a pace between slowest and fastest.' },
      { path: 'ai.pro.cadence.1', label: 'Fastest rival pace', unit: 'taps/s', min: 1.5, max: 7, step: 0.1, help: 'Raise to make the Pro field harder to beat.' },
    ],
  },
  {
    title: '110m Hurdles',
    events: ['hurdles110'],
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
    events: ['longjump'],
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
    events: ['longjump'],
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
    title: 'Pole Vault: height',
    events: ['polevault'],
    blurb: 'Height comes from energy: your speed at the plant turns into height (v² / 2g), and the pole gives back a share of it set by your plant and release. Late releases cost a lot, early ones less, as in the original.',
    params: [
      { path: 'poleVault.height.eff', label: 'Pole efficiency', unit: '%', scale: 100, min: 0.3, max: 1.2, step: 0.01, help: 'Share of your run-up energy (v² / 2g) turned into height with a perfect plant and release. Sets the best heights.' },
      { path: 'poleVault.height.base', label: 'Fixed height', unit: 'm', min: 0, max: 2.5, step: 0.05, help: 'Added to every vault. 0 = height is all speed (v²), as in the original: 70% of the speed gives under half the height.' },
      { path: 'poleVault.height.plantLoss', label: 'Missed plant costs', unit: '%', scale: 100, min: 0, max: 0.8, step: 0.01, help: 'Share of the height lost with a plant at 0%.' },
      { path: 'poleVault.release.late', label: 'Late release: gone by', unit: 'ms', scale: 1000, min: 0.1, max: 0.6, step: 0.005, help: 'Let go this late and the release is worth nothing. The original: about 0.23 s.' },
      { path: 'poleVault.release.latePower', label: 'Late release curve', unit: '', min: 1, max: 5, step: 0.1, help: 'Higher = a little late costs little, then a cliff. 1 = straight line. The original: about 3.' },
      { path: 'poleVault.release.early', label: 'Early release: gone by', unit: 'ms', scale: 1000, min: 0.2, max: 1.2, step: 0.01, help: 'Let go this early and the release is worth nothing. The original: about 0.85 s (letting go at once still gets you 0.7 m).' },
      { path: 'poleVault.release.earlyPower', label: 'Early release curve', unit: '', min: 1, max: 5, step: 0.1, help: 'Higher = a little early costs little. The original: about 1.3.' },
      { path: 'poleVault.height.min', label: 'Lowest height', unit: 'm', min: 0, max: 5, step: 0.05, help: 'No vault (that isn’t a run-through) goes lower than this.' },
    ],
  },
  {
    title: 'Pole Vault: timing',
    events: ['polevault'],
    blurb: 'Press and hold both as the spark reaches the tip of the pole (the plant). Let go as it climbs back to your hands (the release).',
    params: [
      { path: 'poleVault.zoneDistance', label: 'Plant zone', unit: 'm', min: 5, max: 20, step: 1, help: 'Meters before the plant where the pads turn orange and the spark starts down the pole. Shorter = the spark runs down faster.' },
      { path: 'poleVault.press.window', label: 'Plant window', unit: 'ms', scale: 1000, min: 0.08, max: 0.5, step: 0.01, help: 'How far either side of the plant your press can be and still count for something. Tighter = harder.' },
      { path: 'poleVault.press.miss', label: 'Run-through', unit: 'ms', scale: 1000, min: 0.15, max: 0.8, step: 0.01, help: 'No press within this long of the plant and you run through: no height.' },
      { path: 'poleVault.swing.timeAt10', label: 'Swing time at 36 km/h', unit: 'ms', scale: 1000, min: 0.4, max: 2, step: 0.05, help: 'From the plant to the top of the pole (the spark reaching your hands) at 10 m/s. Faster runs swing a little quicker (Swing vs speed).' },
      { path: 'poleVault.swing.speedPower', label: 'Swing vs speed', unit: '', min: 0, max: 1, step: 0.05, help: 'How much a faster plant shortens the swing. 1 = time × 10 / speed; 0 = always the same. The original: about 0.4 (30% slower swings 15% longer).' },
      { path: 'poleVault.pole.sparkDelay', label: 'Spark start', unit: '% of zone', scale: 100, min: 0, max: 0.4, step: 0.01, help: 'How far into the plant zone the spark waits at your hands before running down the pole. It still reaches the tip at the plant.' },
      { path: 'poleVault.release.heldFoul', label: 'Held too long fouls (1 = on)', unit: '', min: 0, max: 1, step: 1, help: 'On: hold on past the release window and you topple back off the pole, no height (as in the original). Off: you’re let go anyway with nothing from the release.' },
      { path: 'poleVault.release.window', label: 'Held too long after', unit: 'ms', scale: 1000, min: 0.2, max: 1, step: 0.01, help: 'Still holding this long after the spark reaches your hands: you stall on the pole (a foul with Held too long fouls on).' },
    ],
  },
  {
    title: 'Pole Vault: look',
    events: ['polevault'],
    blurb: 'How the pole and the vault look. None of these change your height. Pole changes apply from your next attempt.',
    params: [
      { path: 'poleVault.pole.length', label: 'Pole length', unit: 'm', min: 3, max: 5.5, step: 0.05, help: 'Box to your top hand. Longer = you plant further out and ride higher.' },
      { path: 'poleVault.pole.carryAngle', label: 'Carry angle', unit: '°', scale: 57.2958, min: 0.3, max: 1.4, step: 0.0174533, help: 'How high the tip points while you run.' },
      { path: 'poleVault.pole.dropShare', label: 'Pole drop', unit: '% of zone', scale: 100, min: 0.1, max: 1, step: 0.05, help: 'How much of the plant zone the tip takes to come down to level. Lower = down early, then the spark crawls along the low pole.' },
      { path: 'poleVault.camera.zoom', label: 'Camera zoom', unit: '×', min: 1, max: 1.6, step: 0.05, help: 'How close in the camera is. Higher = bigger athletes and the runway lower on the screen.' },
      { path: 'poleVault.pole.grip', label: 'Hand spread', unit: 'm', min: 0.2, max: 0.8, step: 0.05, help: 'From your top hand on the end down to your bottom hand.' },
      { path: 'poleVault.swing.bend', label: 'Pole bend', unit: '%', scale: 100, min: 0, max: 0.45, step: 0.01, help: 'How far the pole bends as you swing up it.' },
      { path: 'poleVault.uprightX', label: 'Standards distance', unit: 'm', min: 0.2, max: 4, step: 0.1, help: 'How far past the box the standards (and the bar) stand. Further = a bigger push forward off the pole to reach the bar.' },
      { path: 'poleVault.flight.push', label: 'Least push off the pole', unit: 'm', min: 0.1, max: 1.5, step: 0.05, help: 'The least you rise off the top of the pole to the peak over the bar. Big vaults push further (the pole only reaches so high).' },
      { path: 'poleVault.flight.leaveFrom', label: 'Earliest off the pole', unit: '% of swing', scale: 100, min: 0.2, max: 1, step: 0.05, help: 'Let go early and you come off the pole right then, but never before this far through the swing. 100% = always ride to the top.' },
      { path: 'poleVault.flight.dropBelow', label: 'Drop off the pole below', unit: '% release', scale: 100, min: 0, max: 0.6, step: 0.01, help: 'Let go so late your release is worth less than this and you don’t leap: you drop off the top of the pole onto the front of the mat (the original’s 1 m vaults).' },
      { path: 'poleVault.flight.heightScale', label: 'Height (drawn)', unit: '×', min: 1, max: 1.6, step: 0.05, help: 'Draws the vault (and the bar) this much higher than your mark, so it looks bigger. Look only.' },
      { path: 'poleVault.camera.lead', label: 'Camera ahead, running', unit: 'm', min: 0, max: 6, step: 0.1, help: 'How far ahead of you the camera looks on the run-up. More = you sit further left.' },
      { path: 'poleVault.camera.zoneLead', label: 'Camera ahead, plant zone', unit: 'm', min: 0, max: 4, step: 0.1, help: 'Extra look-ahead built up through the plant zone, so the box and mat come into view.' },
      { path: 'poleVault.camera.flyLead', label: 'Camera ahead, in the air', unit: 'm', min: 0, max: 4, step: 0.1, help: 'How far ahead of you the camera looks once you’re off the pole.' },
      { path: 'poleVault.camera.drop', label: 'Runway low', unit: '% of screen', scale: 100, min: 0, max: 0.3, step: 0.01, help: 'How much lower the runway sits on the screen (without zooming in). The original’s feet are 83% of the way down.' },
      { path: 'poleVault.camera.plantKick', label: 'Plant jolt', unit: 'm', min: 0, max: 1.5, step: 0.05, help: 'How far the camera jolts back as the pole plants. 0 = none.' },
      { path: 'poleVault.standUp', label: 'Getting up', unit: 's', min: 0.4, max: 2, step: 0.1, help: 'From landing on your back to on your feet on the mat.' },
      { path: 'poleVault.markHold', label: 'Result delay', unit: 's', min: 0.3, max: 3, step: 0.1, help: 'From landing to the result card.' },
      { path: 'poleVault.landX', label: 'Landing spot', unit: 'm', min: 1, max: 6, step: 0.1, help: 'Where you come down on the mat, in m past the box.' },
      { path: 'poleVault.flight.gravity', label: 'Flight gravity', unit: 'm/s²', min: 2, max: 9.8, step: 0.1, help: 'Off the pole, how hard you fall. Lower = floatier, more time over the bar (real is 9.8).' },
    ],
  },
  {
    title: 'Javelin',
    events: ['javelin'],
    blurb: 'Hold both to draw the javelin back (its angle rises), let go to throw.',
    params: [
      { path: 'javelin.zoneDistance', label: 'Throw zone', unit: 'm', min: 8, max: 30, step: 1, help: 'Meters before the foul line where the pads turn orange and you can start holding.' },
      { path: 'javelin.angle.rate', label: 'Angle climb', unit: '°/s', min: 8, max: 60, step: 1, help: 'How fast the javelin tips up while you hold. Lower = more time to find the angle.' },
      { path: 'javelin.angle.best', label: 'Best angle', unit: '°', min: 20, max: 50, step: 1, help: 'The release angle that throws furthest.' },
      { path: 'javelin.angle.spread', label: 'Angle forgiveness', unit: '°', min: 15, max: 80, step: 1, help: 'How far off the best angle you can be before the throw is worth nothing. Higher = more forgiving.' },
      { path: 'javelin.distance.base', label: 'Distance at 40 km/h', unit: 'm', min: 50, max: 110, step: 1, help: 'A perfect-angle throw at 11 m/s. Shifts every throw.' },
      { path: 'javelin.distance.perMps', label: 'Speed reward', unit: 'm per m/s', min: 0, max: 15, step: 0.5, help: 'Extra distance for each m/s of run-up speed.' },
      { path: 'javelin.flight.speed', label: 'Flight speed', unit: '×', min: 0.5, max: 3, step: 0.1, help: 'How fast the flight shot plays. Look only.' },
    ],
  },
  {
    title: 'Troubleshooting',
    events: ['sprint100', 'hurdles110', 'longjump', 'polevault', 'javelin'], shared: true,
    blurb: 'Tools for finding out why a tap did or didn’t count.',
    params: [
      { path: 'debug.tapMarkers', label: 'Tap markers (1 = on)', unit: '', min: 0, max: 1, step: 1, help: 'Marks every tap the game receives: green = stride, red = wrong side, grey = ignored (with the reason). A press that leaves no marker never reached the game.' },
    ],
  },
];

export const PARAMS = GROUPS.flatMap((g) => g.params);
