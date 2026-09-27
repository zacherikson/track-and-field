# Changelog

Gameplay and tuning changes, newest first. When you change a number in
`src/config.js`, log the old → new value and why it felt better.
`node tools/simulate.mjs` shows what a change does to race times.

## Step 2.33: start fast, slow down only if you can't keep up
Before, speed built up from zero, with the first "interval" taken from your
reaction time: about 4.3 m/s half a second after your first tap, 7.7 m/s after
1s. Now you start fast and your tapping decides whether you keep it:
- **New `startSpeed` 6 m/s:** speed you have instantly on your first tap (the
  push out of the blocks).
- **New `startPace` 4.5 strides/s:** your pace is assumed to be this on the
  first tap (was: your reaction time). Real taps pull it toward your actual
  rhythm within a few steps.
- **Result:** about 8.9 m/s half a second after the first tap and 11.2 m/s
  after 1s. A slow tapper (2.5/s) peaks at about 9.6 m/s, then eases back to
  their natural 8.7 m/s.
- **`missSpeedLoss` 1.6 → 2.0 m/s** (player and AI). With the fast start alone,
  a good reader beat the best masher by only about 0.45s (was 0.75s). Readers
  miss about once a race, so they barely feel the change; mashers miss 12-17
  times. Good reader 8.95s vs best masher (6/s) 9.70s.
- `accelMax` unchanged at 10: raising it made mistakes too cheap to recover from.
- **Times are about 0.5s faster across the board:** good reader 9.42 → 8.95s;
  amateur winner median 9.75s, pro 8.46s.
- **Launch animation** stretched to match the faster start: launch pose at
  0.35m (was 0.2), fully running by 1.6m (was 0.9).

## Step 2.32: elbow drives back in the drive phase
- The arm swing was measured from vertical, so when the body leaned forward out
  of the blocks the backswing ended against the torso. It's now measured from
  the torso line. At full effort: about 60° behind the torso to about 65° in
  front. Upright at top speed that's almost the same as before (upper arm about
  76° back, hand at chin height). In the drive phase the elbow now drives back
  up to about shoulder height.
- Drive-phase effort is `min(1, 1.4 · drive)` (was `0.9 · drive`), so the first
  couple of meters use a full arm swing.
- Launch pose: the back arm is flung up behind (upper -1.6 → -2.15 rad).

## Step 2.31: explosive start
From frame-by-frame footage of the original's start (24fps): on the first
frame after reacting, the athlete launches out flat and low, covers about a
body length in the next 3 frames at about 45°, and is nearly upright about 0.4s
after reacting. Ours eased out of the set pose over 0.8m with small shuffling
steps, because arm and leg action scaled with *speed*, which is low at the start.
- **Launch** (`launchPose`, over the first `LAUNCH.distance` 0.2m, fastest at
  the gun): the front leg drives straight off its block (the toes stay on it,
  so the leg straightens instead of swinging), the rear knee punches forward
  low, the body stays flat, and the arms are thrown wide. It then flows into
  the drive run by 0.9m (was: set → run over 0.8m).
- **Effort, not speed, in the drive phase:** arm swing and knee drive use
  `max(speed/11, 0.9 · drive)`. The first steps are full-effort even though the
  foot travel (from speed) is still short.
- **Quicker first steps:** `strideBase` 1.4 → 0.8m and `stridePerMps` 0.3 → 0.37
  (animation only). At 4 m/s that's about 3.4 steps/s, was about 3.0; at full
  speed it's unchanged (about 4.6 steps/s).
- The run cycle's phase origin now puts the near leg at push-off and the far
  knee coming through at phase 0, continuing straight on from the launch.
- Physics unchanged: 10 m/s² from standstill already gives a realistic block
  exit (about 3.5 m/s after 0.35s), so race times don't move.

## Step 2.30: only the rear leg kicks back into the blocks
- Getting into the blocks, the front leg no longer kicks back. After the rear
  leg kicks into the rear block, the front foot lifts just off the track and
  steps back onto the front block. The `kickFront` pose is replaced by
  `stepFront`, keyed at 0.76 of `crouchTime` (was 0.78).

## Step 2.29: sprint back-side mechanics (was a high-knees drill)
The 2.28 foot path only worked in front of the body: the foot left the track
just behind the hips, then went straight up and forward. Hip extension was
missing, so it read as a high-knees drill. The foot path now loops behind:
- **Push-off further back.** The planted foot sweeps from about 0.18m ahead of
  the hips to about 0.47m behind (at sprint) and rolls up onto the toes. The
  thigh ends up about 30° behind vertical.
- **Trailing leg.** After push-off the leg keeps trailing back, nearly straight:
  the rear leg of the airborne split. Then the heel folds up toward the
  backside and the leg swings through.
- **Lower knee drive.** The front thigh peaks at about 69° (was about 80°).
- **Swing timing.** About 60% of the swing is spent behind the hips; the foot
  drops quickly out front instead of hovering.
- **Time on the track** is now the time a planted foot needs to cover its
  sweep at running speed, so feet don't skate. That's about 15% of the cycle at
  a sprint (real sprinters: about 20%) and 25% jogging.

## Step 2.28: planted running legs, hip bob, 90° elbows at any speed
From the original's run cycle:
- **Legs** are now driven by a foot path, with the knee solved by IK. Before,
  the angles swung freely and the leg was almost straight at full forward
  reach, so the foot landed far out in front and looked floppy. Now:
  - the foot lands just ahead of the hips (about 0.12m at sprint);
  - it stays on the track while it sweeps back and rolls up onto the toes;
  - the heel folds up toward the backside;
  - the knee drives forward and high, then the foot paws down again.
- **Stance vs flight:** each foot is on the track for about 30% of the cycle at
  sprint, 40% jogging. Heel kick and knee drive grow with speed.
- **Vertical bob:** the hips are lowest mid-stance and highest in the airborne
  split. About ±0.03 body heights at sprint (±5cm), smaller jogging, halved in
  the drive phase.
- **Drive phase** (the lower hips and forward pitch out of the blocks) now goes
  into the leg IK, so feet stay on the track instead of sinking into it.
- **Elbow** held near 90° at every speed: about 100° jogging (was about 140°)
  and 94° sprinting, still opening to about 114° at the back of the swing.

## Step 2.27: bigger sprint arm swing, elbow drives back
- The arm swing is bigger at speed and biased backwards: at full sprint the upper
  arm swings from about 75° behind the body to the hand at chin height in front.
  Before, it was about ±50°, mostly in front.
- The elbow opens slightly at the back of the swing. The swing still scales with
  speed, so jogging arms stay small.

## Step 2.26: kick back into the blocks; speed-driven running animation
From the original's footage:
- **Waiting:** athletes stand *in front of* their blocks, just behind the line.
- **Getting into the blocks** (READY):
  - bend over;
  - drop onto the hands at the line (`squat`);
  - kick the rear leg straight back into the rear block (`kickRear`);
  - kick the front leg back (`kickFront`);
  - settle.
  - Keyframed over `crouchTime` 0.7 → 1.2s; `readyTime` 2.2 → 2.5s so everyone
    settles before GET SET.
- **Running animation** was about twice too fast: a fixed 2.2m per leg cycle
  meant about 11 steps/s at top speed.
  - The stride now lengthens with speed: `strideBase` 1.4m + `stridePerMps` 0.3m
    per m/s. That's about 2m per cycle jogging and 5m at 12 m/s, so legs turn over
    faster *and* reach further as you speed up.

    | Speed | Steps/s |
    |---|---|
    | 4 m/s | 3.1 |
    | 8 m/s | 4.2 |
    | 12 m/s | 4.8 (real elite sprinters: about 4.5–5) |

  - Knee lift, back-kick and arm swing scale with speed (`v/11`, minimum 0.15), so
    a jog looks like a jog and a sprint looks like a sprint.

## Step 2.25: real starting blocks, feet planted on them
- **Blocks** redrawn side-on at the athletes' scale:
  - a dark rail on the track;
  - two red footplates inclined about 49° (`BLOCK_FEET.plateAngle` 0.85 rad), each
    propped by a strut;
  - front plate about 0.45m and rear about 0.8m behind the hands, as in real blocks.
- **Feet on the blocks:** READY and SET legs are now solved with two-bone IK so
  both feet stay planted on the plates (toes on the track, soles on the plates),
  including through the READY → SET rise. The READY rear knee rests just above
  the track.
- Feet can now be tilted (`toe` angle per leg) instead of always drawn flat.
- **Waiting:** athletes stand behind their blocks, then step forward into them as
  they crouch for READY.

## Step 2.24: hands right behind the line
- Crouched hands were 17–30cm behind the line, varying by lane: runners are drawn
  at nearly the same size in every lane while the track shrinks with distance.
- Each lane's runner (and its blocks) is now drawn shifted so the hands are
  `sprint100.handGap` (5cm) behind the line in every lane.
- The shift fades out over the first 2m of running. Physics start positions are
  unchanged, so everyone still runs exactly the same distance.

## Step 2.23: higher hips in the set position
- `POSES.set` hip height −0.34 → −0.41 H and torso lean 1.45 → 1.68 rad: the hips
  are now a little above the shoulders, like a real set position.
- The legs straighten to match. Hands and feet stay on the track, and the hands
  are still 17–30cm behind the start line in every lane.

## Step 2.22: lifelike start sequence (from footage of the original)
Frame-by-frame comparison showed the original stages the start where ours snapped:
- **Starting blocks** in every lane: a grey rail with a red pedal under each foot.
  They stay on the track after the start.
- **Waiting:** athletes stand at their blocks, gently shifting their weight (each on
  their own phase).
- **READY** (`countdown.readyTime` 1.4 → 2.2s, close to the original's ~2.5s):
  - Everyone keeps standing for a beat (`crouchDelay` 0.25–0.55s, random per
    athlete).
  - Then each one bends over (new `bend` pose) and settles into the blocks over
    `crouchTime` 0.7s.
  - Previously everyone snapped into the crouch instantly and in unison.
- **GET SET:** hips rise over `riseTime` 0.4s, each athlete starting a little apart
  (`setDelay` 0–0.18s).
- **GO:** each athlete holds the set position until they react (the player until
  their first correct tap). They push out low and pitched forward, then rise to
  upright running over `driveDistance` 12m.
  - Previously they went from the set position to fully upright within about 1m.

## Step 2.21: single finish line and single dashes
- The "double" lines in the reference footage were ghosting from filming a screen.
  Now there's one finish line, and one dash per lane at 5, 4 and 3 m out.

## Step 2.20: original-style finish; longer lean zone
- Lean zone length (`dip.promptDistance`): 15 → 18 m. Tuned on the phone.
- The finish now copies the original:
  - a double white line (the checkerboard is removed);
  - short double dashes across the middle of every lane at 5, 4 and 3 m before
    the line;
  - big lane numbers painted flat on the track just before the line, turned
    sideways and squashed to each lane's height, so they follow the perspective.
  - The finish post still stands on the far side.

## Step 2.19: longer, smoother lean
The 2.13 lean (about 0.4s in total) felt too rapid to be worth it. Now about 0.7s:
- `riseTime` 0.2 → 0.32, `holdTime` 0.1 → 0.16, `recoverTime` 0.12 → 0.22.
- The timing window is more forgiving and the reward is unchanged. Simulator, from
  10.5 m/s:

  | Lean timing | Effect |
  |---|---|
  | Perfect, or up to 2m late / 2m early | −0.06 to −0.10s |
  | 3m early | +0.03s |
  | 6m early | +0.11s |
  | 8m early | +0.23s |

## Step 2.18: no "YOU" marker
- Removed the "YOU" arrow above the player. The flashing lane before the start
  (and the front-lane position) already shows which runner is yours.

## Step 2.17: start button on the centre line
- The flashing start button sits on the screen's vertical centre line (at the
  same height as the race targets), over the column of runners, as in the
  original. It may cover some runners; that's intended.

## Step 2.16: legal start position
- Real start rules: nothing may touch the ground on or in front of the line
  before the gun. Athletes previously started with their body origin on the line,
  so their hands landed in front of it in READY / GET SET.
- New `sprint100.startX` −0.55m: every athlete lines up that far behind the line.
  - Measured from the pose geometry, hands are now 16–30cm behind the line in
    every lane (far lanes are the tightest, because runners are drawn at nearly
    the same size while a meter of track shrinks with distance).
  - The standing feet in the waiting state are behind it too.
- The clock still runs from the gun to the line at 100m, so everyone covers the
  same extra 0.55m (about 0.05s), just like real sprinters starting from blocks
  behind the line.
- `Runner` takes the start position; the simulator and the tuning estimates use it.

## Step 2.15: real one-point perspective, camera 1m ahead of the player
The 2.14 "slanted bands" still looked wrong next to the original. The original
uses true perspective:
- **Projection:** a ground point (x, depth z) projects to
  `y = horizonY + K/z` and `x = centre + (x − camera.x) · ppm · zRef/z`.
  - Lanes get taller toward the viewer (19px far, 51px near, about 2.7×, matching
    the original's screenshot).
  - Crossing lines fan out from the camera: nearly vertical right in front of
    it, leaning more further away.
  - K and the near depth are solved from the horizon (y 57) and the track's far
    and near edges (y 280 / 470), fitted to the original's lane spacing.
- **Camera** sits 1m ahead of the player (`camera.lead`) at screen centre, so the
  player is just left of centre and you see more of what's coming than of what's
  behind. Look-ahead removed.
- **Runners** are nearly the same size in every lane (`figureScale` = (zRef/z)^0.2),
  as in the original.
- **Lane numbers** stack just past the start line, as in the original.
- **Scenery:** grass stripes follow the perspective, the crowd and far ad boards
  scroll slowly (parallax), and a row of near ad boards along the bottom scrolls
  fastest.

## Step 2.14: original-style camera, front lane, flashing start button
From footage and screenshots of the original:
- **Camera:** low and close.
  - `world.pixelsPerMeter` 38 → 75: runners are about ¼ of the screen tall and
    about 15m of track is visible.
  - The track sits in the bottom third with thin lanes (28px). Far-lane runners
    stand up over a wide infield grass band.
  - Crossing lines slant the original way (far lanes shifted left).
  - Camera anchor 0.3 → 0.35; look-ahead 0.35 → 0.15 m per m/s (max 1.5m).
- **The player always runs in the front lane.** Lanes are painted 1 (far) to 6
  (near), so the player is lane 6, and results show those numbers.
- **New "waiting" state** before the countdown: athletes stand at the line while an
  orange start button and the player's lane flash together (0.3s on / 0.2s off,
  `sprint100.startBlink`). Any tap starts READY → GET SET → GO.
- **Race targets** moved up to the grass band (`pads.homeY` 0.66 → 0.4), where the
  original puts them.
- Shared tap-target drawing (glossy pad, ✕) is now in `src/render/pads.js`.

## Step 2.13: quicker lean, first target appears in place
- **Lean timing** re-measured from the original at its full frame rate (about
  25fps): about 0.2s down, only about 0.1s at the bottom, then it pops back up
  in about 0.1s.
  - `riseTime` 0.25 → 0.2, `holdTime` 0.3 → 0.1, `recoverTime` 0.35 → 0.12.
  - Timing is tighter now:

    | Lean timing | Effect |
    |---|---|
    | Perfect (to 1m early) | −0.10s |
    | 1m late | −0.07s |
    | 2m early | +0.02s |
    | 6m early | +0.12s |
    | 8m early | +0.25s |

- **The first green target just appears** in place at GO (as in the original);
  every later one drops in.

## Step 2.12: finish lean instead of a dive; no false starts
From footage of the original's finish:
- **Lean, not dive.** The legs keep running while the torso pitches forward,
  almost horizontal, with the arms swept back and up.
  - Timing: builds over 0.25s, held 0.3s, straightens up over 0.35s.
  - Nobody leaves the ground: the slide and the "get up" are gone.
- **Leaning too early** means you're upright again before the line, and the runner
  then slows at 4.5 m/s² (floor 4 m/s) until the line. Simulator, from 10.5 m/s:

  | Lean timing | Effect |
  |---|---|
  | Perfect (up to about 3m early) | −0.10s |
  | 2m late | −0.04s |
  | 6m early | +0.07s |
  | 8m early | +0.15s |
  | 11m early | +0.39s |

  A mistimed lean can get you passed by a rival who timed theirs well.
- Config `dip`: `airTime`, `airDecel` and `slideDecel` are replaced by `holdTime`,
  `recoverTime`, `leanDecel`, `postLeanDecel` and `minLeanSpeed`. The prompt says
  "LEAN!".
- **No false starts.** Taps during READY / GET SET are simply ignored. The false
  start warning, disqualification, and the related config and screens are removed.

## Step 2.11: tuning, round 2 (no penalty pause, like the original)
From play-testing with the tuning panel:

| Setting | Old | New |
|---|---|---|
| Slow-down rate (`runner.coastDecel`) | 3.0 | 4.0 m/s² |
| Speed lost on a miss (`sprint100.targets.missSpeedLoss`) | 1.0 | 1.6 m/s |
| Penalty pause (`sprint100.targets.missLockout`) | 170 | 0 ms |
| Double-press guard (`runner.minStrideInterval`) | 60 | 10 ms |

- The red ✕ now has its own display time (`pads.missX`, 0.25s), because it used
  to last only as long as the penalty pause.
- AI rivals' miss penalty mirrors the player's again (1.6 m/s, no pause).
- Simulator:

  | Strategy | Time |
  |---|---|
  | Casual reader | 10.4s |
  | Good reader | 9.3s |
  | Expert | 8.9s |
  | Blind alternating, best case (8 taps/s) | 10.2s (14 taps/s: 14.0s) |
  | Drumming both thumbs | 11–23s |
  | Amateur AI winner (median) | 10.2s |

## Step 2.10: a miss doesn't re-drop the target
- Once a green target lands it stays until you hit it. A wrong tap shows the red ✕
  on the side you tapped for the lockout, while the green target stays visible
  on its side. No hiding and no second drop.

## Step 2.9: target drop-in and hit outline, measured from the original
Frame-by-frame analysis of gameplay footage (60fps capture of 30fps video; the
pad radius r is about 54px in an 880×602 frame):
- **Drop:** a new target falls straight down onto its fixed spot.
  - Measured offsets at equal steps were 89% → 59% → 4% of the start height,
    which matches `height × (1 − k²)` exactly: it accelerates like falling.
  - It starts about 1.65r up and stops dead, with no bounce.
  - It takes about 0.1s and fades from 70% to fully solid.
  - Two faint rim echoes trail above it. The "stacked rings" in the footage are
    partly video frame blending (one appears ahead of the motion), so only a
    subtle trailing echo is kept.
- **Hit:** the green body vanishes instantly and the rim remains as a thin white
  outline.
  - Measured radius: 1.05r at the tap, 1.2r at 35ms, 1.35r at about 0.14s, gone
    at 0.18s.
  - Ours eases out from the rim to 1.35r and fades over 0.18s.
- Config is in
  `sprint100.pads.drop` and `sprint100.pads.hitRing` (not in the tuning panel).

## Step 2.8: tuning from play-testing on the phone
Set with the in-game tuning panel after real play, then made the defaults:

| Setting | Old | New |
|---|---|---|
| Forgiveness curve (`runner.speedCurve`) | 0.75 | 0.60 |
| Newest tap weight (`runner.cadenceSmoothing`) | 0.30 | 0.40 |
| Acceleration (`runner.accelMax`) | 9.0 | 10.0 m/s² |
| Slow-down rate (`runner.coastDecel`) | 4.0 | 3.0 m/s² |
| Hesitation allowance (`runner.idleGrace`) | 1.4× | 1.2× gap |
| Longest gap counted (`runner.maxIntervalForAvg`) | 700 | 600 ms |
| Speed lost on a miss (`sprint100.targets.missSpeedLoss`) | 1.5 | 1.0 m/s |
| Penalty pause (`sprint100.targets.missLockout`) | 250 | 170 ms |
| Coasting slow-down (`dip.carryDecel`) | 0.6 | 0.5 m/s² |

- AI rivals' miss penalty now matches the player's (1.0 m/s, 170 ms).
- Simulator after the change:

  | Strategy | Before | After |
  |---|---|---|
  | Casual reader | 11.0s | 10.5s |
  | Good reader | 9.7s | 9.4s |
  | Expert | 9.1s | 8.9s |
  | Amateur AI winner (median) | 10.8s | 10.25s |
  | Blind alternating at 14/s | stuck | 9.7s |

- Watch: cheaper mistakes make blind alternating competitive again.

## Step 2.7: no animations on the targets
Too many effects; starting fully simple.
- The green target appears instantly on its fixed spot and disappears the moment
  it's hit. The fly-in, trail, closing ring, breathing, hit ring burst and sparks
  are all removed (the `sprint100.pads.spawn` config is gone).
- The red ✕ simply shows during the lockout (no pop or shake).
- The orange dip pads no longer pulse.
- The glossy button look is unchanged.

## Step 2.6: in-game tuning panel
- New **⚙ Tuning** button on the menu and results screens. It opens an overlay
  with every speed-related setting in plain language: tapping pace, speeding up,
  slowing down, mistakes, targets, finish dip, and rival pace.
- Each setting has a slider, − / + buttons, its default, and a reset link.
  Changed settings are outlined in green.
- Live estimates run the real physics:
  - 100m time at 3, 4 and 5 hits/s
  - what one mistake costs
  - the Amateur rivals' usual winning time
- Changes apply to the next race and are saved on the device (localStorage).
  **Copy changes** puts a readable summary on the clipboard to paste into chat.
  Adopted changes get baked into `src/config.js` and logged here.
- Results screen now shows hits · misses · hits/s · top speed.

## Step 2.5: two states only, brighter colors
- Only two states: a green target (tap now) or a red ✕ (wrong side, wait). The
  grey "locked" target is gone. After a wrong tap the target is hidden behind the
  ✕ for the whole 0.25s lockout, then flies back in.
- The ✕ is bold red with a white outline and pops in with a short shake.
- Pads are glossy candy buttons: vivid gradient body (green #39e626, orange
  #ff9d14), darker rim, thick white ring, highlight and a soft drop shadow.

## Step 2.4: fixed target spots, no countdown pads
- Each side's target always lands on the same spot (removed `pads.followThumb`).
  Following the thumb added nothing, because the hit zone was already the whole
  screen half. A fixed spot is easier to read and learn.
- Removed the red pads during READY / GET SET. The first thing to appear is the
  first green target at GO. Tapping before it is still a false start.
- Removed the faint outline ring on the unlit side. During the race the only
  circle is the green target (plus hit and miss effects).
- The fly-in entrance is unchanged; it just always lands on the fixed spot.

## Step 2.3: target entrance animation
Previously each target popped up in the same spot every time, which looked static.
Now every appearance flies in (config `sprint100.pads.spawn`):
- It flies 80px toward its resting spot in 0.13s, from above and the screen-center
  side, at a random angle (±0.55 rad), so no two entrances look the same.
- Ease-out-back motion with a slight overshoot (`overshoot` 1.7), squash and
  stretch along the flight path, 3 fading afterimages, and a ring that closes in
  on the landing spot.
- Once settled, the target gently "breathes" (±2.5% scale).
- The resting spot still follows your thumb, so you never have to reach. The pad
  is on the correct half of the screen from the first frame, so reading the side
  isn't delayed.
- A hit also throws a small burst of sparks. The red countdown pads and orange
  DIP pads use the same entrance.

## Step 2.2: random targets (never 3 in a row), because reading beats mashing
Per design feedback on the original: the target side is random, but there are never
more than 2 in a row on one side. After two lefts the next is guaranteed right, so
you can learn to pre-empt it.
- New `src/events/strideTargets.js` (`TargetSequence` + `StrideTargets`), config
  `sprint100.targets`: `maxSameSide` 2, `switchChance` 0.5 (overall switch rate 2/3).
- Tapping the lit side = a stride. Same-side repeats are now valid.
- Wrong-side tap: red ✕, −1.5 m/s, and a 0.25s lockout (the target greys out).
  First try was −0.8 m/s and 0.15s, but then blindly alternating at 14 taps/s
  (9.6s) beat a good reader (10.4s).
- Inputs within 60ms of a hit are ignored (`minStrideInterval`), so drumming both
  thumbs can't score two strides per press.
- Runner API: `stride(t)` and `stumble(loss)` replace `tap(side, t)`. Each event now
  decides what a correct input is (the hurdles' 1-2-3 will reuse this).
- Retuned for reaction-paced play (about 3–6 hits/s instead of 12–15 taps/s):
  - `cadenceForTopSpeed` 15 → 5.2 strides/s
  - `maxIntervalForAvg` 0.5 → 0.7
  - new `idleGrace` 1.4: a normal hesitation doesn't wobble your speed
- AI rivals: cadence ranges retuned (amateur 2.9–3.8, pro 3.9–4.9 strides/s), plus
  occasional misreads that cost them the same penalty (`missChance`).
- Fix: a slow runner could coast to a standstill in the dip zone and never finish.
  They now keep running normally below `dip.minCarrySpeed` (5 m/s).
- Simulator (`node tools/simulate.mjs`) now races strategies through the real rules:

  | Strategy | Time |
  |---|---|
  | Novice reader | 12.9s |
  | Casual reader | 11.0s |
  | Casual, ignoring the max-2 rule | 12.25s |
  | Good reader | 9.7s |
  | Expert | 9.1s |
  | Alternating masher (best case, 10/s) | 10.7s, and often never finishes |
  | Guessing / drumming both thumbs | 15–17s |
  | Amateur AI winner (median) | 10.8s |
  | Pro AI winner (median) | 9.2s |

## Step 2.1: 100m changes from the reference gameplay video
Frame-by-frame study of a 100m run in the 2009 original. Only the mechanics are
reimplemented here; the art and presentation are our own.
- **One target at a time.** Instead of two fixed pads, a single green target
  alternates sides. The first target after GO is always on the left.
  (Superseded in 2.2 by random sides.)
  - Each side's target reappears where that thumb last tapped (`pads.followThumb`).
  - The hit zone is still the whole screen half, so it stays forgiving.
  - A faint ring marks where the other thumb goes next.
- Hit feedback: the target bursts into an expanding ring. A wrong-side tap shows a
  red ✕ and doesn't count.
- **Finish dip** (new `dip` config).
  - 15m out, strides stop counting and you carry your speed (`carryDecel` 0.6 m/s²).
  - Both pads pulse orange. Press both thumbs within 60ms (Space on desktop) to lunge.
  - The chest leads by up to 1.0m. Finish time is when the chest crosses the line.
  - Measured with `tools/simulate.mjs` at 12 taps/s:

    | Dip | Effect |
    |---|---|
    | Perfect (about 3.5m out) | −0.10s |
    | 2m late | −0.04s |
    | No dip | 0 |
    | More than about 3m early | +0.8s (slide to a stop, get up, run it in) |

  - `armDelay` 0.3s and `chordWindow` 0.06s stop a fast tapper's last strides from
    triggering an accidental early dip.
- AI rivals dip too, with timing error per difficulty (`ai.*.dipError`).
- Open question: in the video the target switches only about 2.5 times per second,
  yet the runner is at full speed, so the original may be rhythm-based rather than
  mash-based. Not changed yet. (Answered in 2.2: it's random targets.)

## Step 2: 100m Dash playable
- Runner physics: taps → smoothed cadence → target speed → speed (limited accel / coast decel).
- Initial calibration with the simulator (0.22s reaction):

  | taps/s | time |
  |---|---|
  | 8 | 12.8s |
  | 10 | 11.0s |
  | 12 | 9.9s |
  | 13 | 9.4s |
  | 15 | 8.8s |

  The world record (8.90s) needs about 15 alternating taps per second.
  - `cadenceForTopSpeed` 14 → 15, `topSpeed` 12.6 → 13.4. At 14, times flattened
    at 9.13s, so the world record was impossible.
  - Amateur AI cadence 9.0–11.6 → 8.6–11.0: the winner is usually about 10.6s, so a
    decent tapper (about 10.5 taps/s) can win.
  - Pro AI cadence 12.0–14.2 → 11.6–13.8: the winner is usually about 9.2s. Not yet
    selectable.
- `minTapInterval` 0.04s: alternating taps closer than this are ignored, so slamming both thumbs together doesn't double-count.
- First tap after GO is never rejected. Its interval (your reaction time) is clamped to the top-speed cadence, so anticipating the gun gives no superhuman burst.
- False starts: one warning, second = disqualified.
- Countdown: "Get Set" lasts a random 1.1–2.3s so GO can't be timed.

## Step 1: scaffold
- Canvas scaffold, fixed-timestep game loop, scene manager, multi-touch input manager, camera.
- Placeholder stick-figure athlete ("Juno") with blendable poses.
- Portrait mode pauses the game and shows a "rotate your phone" hint.
