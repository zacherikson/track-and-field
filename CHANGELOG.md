# Changelog

Gameplay and tuning changes, newest first. When you change a number in
`src/config.js`, log the old → new value and why it felt better.
`node tools/simulate.mjs` shows what a change does to race times.

## Step 4.5: first tap launches you at the minimum speed
- `runner.startSpeed` (6 m/s) removed: the first tap now launches you straight
  to `runner.minSpeed` (7 m/s), so one knob sets both. Tuning panel: "Minimum
  speed" moved to Speeding up; "Block exit speed" removed.
- Everyone is about 0.07s faster over 100m: good player 8.80 → 8.72s,
  Amateur rivals median 10.21 → 10.13s, Pro 9.62 → 9.56s.

## Step 4.4: minimum speed 6 → 7 m/s
- `runner.minSpeed` 6 → 7 m/s. One tap then nothing: 17.0 → 14.7s. Tapping
  once every 2 s (13.3s) now runs about as fast as once a second (13.1s).
  Normal play is unchanged (simulator within noise).

## Step 4.3: minimum running speed
- New `runner.minSpeed` 6 m/s (tuning panel: Minimum speed). Once you're off
  the blocks your pace never asks for less, however slowly you tap. Before,
  stopping meant slowing to a halt and a DNF.
  - Tapping once every 2 s: 17.6 → 15.6s. One tap then nothing: DNF → 17.0s.
  - Stumbles, hurdle trips and the finish lean can still dip below it briefly;
    you build back up from there.
  - Normal play is unchanged (simulator within noise for all events).

## Step 4.2: runway like the original, referee, takeoff footprint
- The colored sections are now **stripes along both edges** of the runway
  (yellow 12m, orange 8m, red 4m), as in the original, instead of filling it.
  Metre ticks removed.
- **Red foul line** painted right after the white takeoff board.
- **Referee** in white with a red cap stands at the foul line. After the
  jump they raise a **white flag** (valid) or a **red flag** (foul).
- **Takeoff footprint:** your takeoff foot leaves a print on the board or
  runway (red when it's a foul), so you can see where you jumped from.
- After you land the camera pulls back (`longJump.markPan.delay` 0.45s) to
  show the footprint and the landing mark together. `markHold` 1.6 → 2.2s
  so there's time to look before the banner.

## Step 4.1: longer run-up, colored runway sections
- Run-up 40 → 45m. Marks barely change (runners are near top speed by then):
  good player 7.85m, expert 8.96m; Amateur winner 8.06m, Pro 8.92m.
- `longJump.runwayZones`: the last 12m before the board are painted in
  colored sections, so the line doesn't sneak up on you:
  - yellow from 12m (where the takeoff pads start blinking);
  - orange from 8m;
  - red from 4m up to the board.
  A white tick every meter through them, bolder lines at 10m and 5m.

## Step 4: Long Jump
From footage of the original, with real long jump rules.
- **Three rounds**, best jump counts, against five rivals. World record 9.86m,
  as in the original.
- **Run-up:** 40m, the 100m's green targets and runner physics. The first tap
  starts your run.
- **Takeoff zone:** 12m before the board the pads turn **orange and blink**
  (as in the original). Strides stop and you carry your speed. Press **both**
  to take off.
- **Marks** are measured from the **foul line** (front edge of the white board)
  to where your heels land.
  - Take off early and you lose the gap.
  - Take off past the line: **FOUL**. Run through without jumping: FOUL.
  - The round banner says by how much: "took off 10 cm before the line",
    "over the line by 10 cm".
- **Flight:** a projectile from your run-up speed (`keepX` 0.9 of it forward,
  lift 2.4 m/s + 0.06 per m/s), landing when the hips have dropped 0.5m, heels
  0.45m ahead of the hips.
- **Stretch:** at the top of the jump the orange pads come back. Press both to
  thrust your legs forward, worth up to 0.5m: full at once, nothing after
  0.35s.
- **Landing:** sand puff, your mark stays in the sand, you sit, then get up.
- **Round banner:** your mark (or FOUL), how you took off, your stretch %, and
  everyone's best so far. Tap to go on. Results show "Jump again".
- **Rivals** jump through the same physics each round: their run-up pace
  (Amateur 3.0–3.8, Pro 3.7–4.5 hits/s), where they take off (Amateur −0.10 to
  +0.45m from the line, Pro −0.03 to +0.22; negative = foul) and how late
  they stretch.
- **Look:** new `RunwayRenderer`: infield grass, the runway strip, a white
  board with a plasticine strip, a sand pit with a meter sign every meter from
  the line. New jump poses: hang, stretch, landing, sitting in the sand.
  `drawFigure` takes a ground Y so the shadow stays on the ground in the air.
- **Shared code:** the target drop and hit-ring animations moved from the 100m
  into `render/targetPads.js`. The results screen handles "NO MARK" and events
  without lanes.
- **Simulator** (best of 3; human timing error 20–50 ms):

  | Who | Best of 3 | Fouls |
  |---|---|---|
  | Casual | 7.0m | 13% |
  | Good | 7.9m | 9% |
  | Expert | 9.0m | 8% |
  | Expert, pressing riskily late | 9.0m | 23% |
  | Amateur rivals | median 7.75m, winner 8.05m | |
  | Pro rivals | median 8.7m, winner 8.9m | |

  Takeoff timing is tight: at top speed 25 cm is ~20 ms.

## Step 3.6: a stumble brakes you instead of snapping your speed
- Catching a hurdle no longer snaps your speed to a fixed 4 m/s. For the 0.4s
  stumble you brake at `trip.decel` 15 m/s² and can't accelerate, then build
  back up as normal (like real hurdlers). New `Runner.stumbleFor()` replaces
  `fall()`. Example trace: 8.5 → 7.5 → 6.5 → 5.5 → 4.9 m/s over the stumble,
  then 5.6 → 6.7 → 7.7 m/s…
- A wrong number no longer costs speed on the spot (`missSpeedLoss` 0.8 → 0):
  the trip at the next hurdle is the penalty, and you lose that stride.
- Braking strength chosen to keep guessing from paying. At 10 m/s² a trip cost
  ~0.5s and a fast 40%-wrong guesser (12.97s) nearly matched a good player
  (12.3s). At 15 a trip costs ~0.7s:

  | Who | Time | Trips per race |
  |---|---|---|
  | Good | 12.42s | |
  | Expert | 11.72s | |
  | Good, 8% wrong | 13.15s | 1.2 |
  | Fast guesser | 14.10s | |
  | Amateur rivals (typical) | 13.3s | |
  | Pro rivals (typical) | 12.5s | |

- Tuning panel: "Stumble braking" (m/s²) replaces "Stumble speed".

## Step 3.5: legible number buttons (hurdles)
- New `drawNumberButton`, styled after the original's buttons:
  - a thin dark outline and a pale ring;
  - a nearly flat blue disc (lighter top half, no glossy streak across the
    number);
  - a big, heavy white number (about 1.25 × the radius) with no drop shadow.
  - Before, the glossy candy pad put a highlight right over a smaller,
    shadowed number.
- Buttons are bigger: radius 46 → 54.

## Step 3.4: a trip is a stumble, not a fall
- When you trip you no longer go down. You go over, catch the hurdle (it falls)
  0.2s after takeoff, and stumble on for 0.4s: legs still running, body
  pitched forward, arms flailing (one flung up, one back). Then you settle
  back into your form over 0.25s.
- Your speed is knocked down to 4 m/s during the stumble (was a 1.5 m/s crawl
  for 0.65s), then you build back up. A trip now costs about 0.6s (was about
  1.3s).
- Config `trip: { hit, stumble, recover, speed }`. Tuning panel: "Stumble time"
  and "Stumble speed".
- **Simulator:**

  | Who | Time | Trips per race |
  |---|---|---|
  | Good | 12.37s | |
  | Expert | 11.64s | |
  | Good, 8% wrong | 12.96s | 0.9 |
  | Good, 20% wrong | 14.33s | |
  | Fast guesser | 15.10s | |
  | Amateur rivals (typical) | 13.4s | |
  | Pro rivals (typical) | 12.6s | |

## Step 3.3: any mistake trips you and knocks the hurdle down
Corrected rule: ANY error in a set trips you at the next hurdle, and the
hurdle goes down. The errors are a wrong (out-of-order) number, or not
finishing the set in time.
- `tripFaults` 2 → 1.
- Knocked hurdles are back: the hurdle tips forward as your body reaches it
  and stays down. You still go over low, sprawl and get up.
- **Simulator:**

  | Who | Time | Trips per race |
  |---|---|---|
  | Expert | 11.63s | 0.1 |
  | Good | 12.42s | 0.2 |
  | Casual | 14.49s | 0.3 |
  | Good, 8% wrong | 13.96s | 1.3 |
  | Good, 20% wrong | 16.23s | 2.8 |
  | Fast guesser (40% wrong) | 17.23s | 4.3 |
  | Amateur rivals (typical) | 13.45s | |
  | Pro rivals (typical) | 12.56s | |

## Step 3.2: hurdles failures like the original (trips, lost buttons)
From footage of the original going wrong:
- **Wrong number:** that button turns into a red ✕ and is then gone; you
  never get that stride. Carry on with the lowest number left. Also a small
  stumble (`missSpeedLoss` 1.2 → 0.8 m/s). Before, the button stayed and you
  had to tap it again.
- **Faults and trips:** a set's faults are its lost buttons plus any still
  untapped when you reach the hurdle. **One fault is forgiven**; with two or
  more (`tripFaults` 2) you **trip**. The footage: 2 right + 1 wrong jumped
  clean; 1 right + 2 wrong tripped; 1 wrong + 2 untapped tripped.
  - **The trip:** you go over the hurdle low for 0.3s, lie sprawled on the
    track for 0.4s, and take 0.25s to get up, crawling at 1.5 m/s the whole
    time (new `Runner.fall`). Then you build speed back up. It costs about
    1.3s; rivals go past. The next set still appears as you go over, so you
    can tap while down.
  - **The hurdle stays up** (it used to fall over). Too slow at takeoff (< 4
    m/s) also trips you.
- **Results:** "N trips" replaces "hurdles hit"; the average set time counts
  clean sets only.
- **Tuning panel:** "Time down after a trip" and "Faults to trip" replace
  "Speed lost hitting a hurdle".
- **Simulator:**

  | Who | Time | Trips per race |
  |---|---|---|
  | Good | 12.24s | |
  | Expert | 11.54s | |
  | Good, 8% wrong | 12.54s | 0.1 |
  | Good, 20% wrong | 13.30s | 0.3 |
  | Fast guesser (40% wrong) | 13.14s | 1.1 |
  | Amateur rivals (typical) | 13.2s | |
  | Pro rivals (typical) | 12.5s | |

## Step 3.1: hurdles redone like the original
Rebuilt from frame-by-frame gameplay footage. The first version (three fixed
pads tapped 1-2-3 over and over) was nothing like the original.
- **Button sets:** at GO, and every time you go over a hurdle, three blue
  numbered buttons appear along the top in a **shuffled** order (e.g. 3 1 2).
  - Tap 1, 2, 3 wherever they are. Each tapped button vanishes with a ring.
  - A wrong number stumbles you (1.2 m/s) and flashes a ✕; a cleared slot does
    nothing.
  - Hit zones are the screen thirds.
  - Keys: number keys press wherever that number is; ← ↓ → press the slots.
- **Cruise:** once a set is cleared you keep the pace you set until the next
  hurdle; no tapping in between. Pace comes from your taps within the set,
  counting your reaction to it. New `Runner.cruise` and `restartInterval()`.
- **Hurdles:** 7, as in the original (one every ~1.4s in the footage), first at
  13.72m then every 12.9m. You **hit** a hurdle if you reach takeoff with the
  set not cleared, or under 5 m/s: 2.6 m/s lost and it falls over. A clean
  clearance costs 0.3 m/s.
- **Finish:** after the last hurdle, orange lean pads in the outer slots (lean
  zone 17m). GO!/READY banners moved below the button row. World record 11.58s,
  as in the original.
- **Rivals** (`HurdleAI`) read each new set in `setReact` s and tap `tapGap` s
  apart: Amateur 0.45–0.62 / 0.18–0.25, Pro 0.42–0.56 / 0.16–0.22.
- **Physics:** `cadenceForTopSpeed` 4.6, `topSpeed` 10.2 m/s, `speedCurve` 0.5,
  `cadenceSmoothing` 0.35 (each set counts).
- **Results** show hurdles hit and your average set time.
- **Simulator:** a player clearing sets in ~0.65s runs ~11.9s, like the
  original's footage (11.96s).

  | Who | Set time | 110m time |
  |---|---|---|
  | Slow | ~1.5s | 15.8s |
  | Casual | ~1.1s | 14.2s |
  | Good | ~0.8s | 12.25s |
  | Expert | ~0.6s | 11.53s |
  | Machine | ~0.45s | 11.35s |
  | Amateur rivals | | typical 13.2s, winner 12.7s |
  | Pro rivals | | typical 12.5s, winner 12.0s |

## Step 3: 110m Hurdles
New event, built on the shared lane race (start, blocks, rivals, finish lean).
- **Controls:** three buttons, 1 (left), 2 (centre) and 3 (right), tapped in
  order: 1-2-3-1-2-3… Each correct tap is a stride.
  - The button you owe next is lit green; the other two are dimmed.
  - Hit zones are the screen's thirds.
  - A wrong or out-of-order tap stumbles you (`missSpeedLoss` 1.2 m/s), and you
    still owe the same button.
  - Keys: 1 2 3 (or ← ↓ →); Space to lean.
- **Hurdles:** real spacing (first at 13.72m, then every 9.14m, 10 in all, last
  at 96m), cleared automatically.
  - A hurdle is **hit** if you're under `minSpeed` 6 m/s at takeoff, or your
    rhythm broke: a wrong tap within `rhythmWindow` 0.3s before takeoff, or
    during the hop before the bar.
  - Hitting one costs `clipLoss` 2.6 m/s and knocks it over; it tips forward and
    stays down. A clean clearance costs `cleanLoss` 0.3 m/s.
- **Physics:** the pace scale differs from the 100m, because tapping a known
  1-2-3 pattern is quicker than reading random targets. `cadenceForTopSpeed`
  6.5 taps/s, `topSpeed` 9.3 m/s, `speedCurve` 0.4.
- **Finish:** the lean zone starts 10m out (`dipPromptDistance`), after the last
  hurdle.
- **Rivals:** hurdles pace Amateur 3.6–4.6 taps/s, Pro 4.3–5.3; the rest of
  their skill comes from `CONFIG.ai`.
- **Look:** hurdles in every lane, with posts at the lane's near and far side,
  little feet, and a striped top bar. Over the bar the athlete's lead leg shoots
  out straight, the trail leg folds behind, the torso pitches forward and the
  opposite arm reaches.
- **Tuning panel:** new "110m Hurdles" group. Results show hurdles hit.
- **Simulator** (`node tools/simulate.mjs`):

  | Who | Time | Hurdles hit |
  |---|---|---|
  | Casual (4 taps/s, 3% wrong) | 14.85s | |
  | Good (5.5/s, 2% wrong) | 13.32s | |
  | Expert (7/s) | 12.39s (world record 12.80) | |
  | Sloppy (5.5/s, 8% wrong) | 14.22s | 2.1 |
  | Random-button masher | 23–47s | |
  | Amateur rivals | typical 14.81s, winner 14.35s | |
  | Pro rivals | typical 13.81s, winner 13.44s | |

## Step 2.44: input check splits phone delay from game delay
From a race on the phone, inside the Claude app viewer: 33 touches, 33 judged,
nothing cancelled, worst frame 36ms, worst tap delay **121ms**. The game's
queue accounts for at most a frame of that; the rest was the phone holding the
touch before handing it to the page.
- **New line: `Phone delay: typical X ms, worst Y ms · N slow (>60 ms), K near
  edge, J with other thumb down`**. Measured from each touch's timestamp to
  the page receiving it. "Near edge" means within 60px of the left or right
  screen edge.
- **New line: `Game: worst frame … · worst total tap delay …`**.
- Suspect: the in-app viewer's own gestures (swipe to dismiss, edge swipes)
  make iOS hold touches back while it decides. To compare, run the same race in
  Safari.

## Step 2.43: raw touch input + input check on the results screen
"Sometimes a tap doesn't register at full speed." In the browser test harness
every tap was delivered and judged, so this hardens input and collects evidence
from the phone:
- **Touch input reads raw `touchstart` events** (every new finger in
  `changedTouches`), registered on the window in the capture phase. Before, it
  used `pointerdown` on the canvas; on iOS, pointer events are derived from
  touches. Mouse and pen still use Pointer Events, and touch-generated pointer
  events are ignored so a tap can't count twice.
- **Event timestamps are capped at "now".** A timestamp in the future would
  have held the tap in the queue until then.
- **Results screen, input check** (amber when something's off):
  - `Touches N · judged M (ignored: …) · K cancelled by phone`
  - `Worst frame X ms · worst tap delay Y ms`
  - If a tap felt lost but touches = judged and nothing was cancelled, the phone
    never delivered it. `cancelled by phone` means iOS took the touch back,
    usually for an edge swipe.
- The game's input queue adds about 12ms on average (at most one frame).
- Note: a wrong-side tap's red ✕ appears under the thumb that tapped, and iOS
  can't vibrate from a web page. At speed a miss can feel like a tap that didn't
  register. Check the misses count on the line above.

## Step 2.42: rival fields retuned to about 10.2s (Amateur) and 9.6s (Pro)
Since the fast start (2.33), rivals had been running about half a second
faster than intended.
- `ai.amateur.cadence` [2.9, 3.8] → [2.8, 3.6]: typical rival 10.22s (was
  10.04s), range 9.35–12.0s, winner median 9.77s.
- `ai.pro.cadence` [3.9, 4.9] → [3.15, 3.95]: typical rival 9.63s (was 8.80s),
  range 8.9–10.5s, winner median 9.28s.
- For reference: a good reader (about 3.7 hits/s) runs about 8.8s and a casual
  one (about 2.9 hits/s) about 9.8s.

## Step 2.41: Pro difficulty on the menu
- The menu has a **Rivals: Amateur / Pro** toggle, remembered on this device.
  It picks `CONFIG.ai.amateur` or `CONFIG.ai.pro` for the field.
- The results screen header shows the level ("100M DASH · PRO").
- The tuning panel has a **Rivals (Pro)** group with the Pro pace range.
- Simulator, Pro field: rivals 8.2–10.1s, winning median about 8.47s. Amateur:
  winning median about 9.59s.

## Step 2.40: no lean text on screen
- Removed the "Both thumbs together" tip, then the LEAN! banner too. The lean
  zone is signalled only by the two orange pads. The how-to screen still
  explains the two-thumb lean.

## Step 2.39: steadier pace, longer lean zone, bolder 10 m lines
From the tuning panel:
- `runner.cadenceSmoothing` 0.4 → 0.1: each tap moves your pace less, so speed
  is steadier and one slow or fast tap barely registers.
- `dip.promptDistance` 18 → 20m: the lean zone starts 2m earlier.
- Simulator: good reader 8.81s, best masher (6/s) 9.45s, so reading still wins
  by about 0.6s. The amateur winner's median went 9.76 → 9.59s, because their
  interval jitter averages out more.

Track:
- The 10m lines are painted bands 0.14m wide, drawn in perspective so they
  widen toward the viewer. They were 2px hairlines at 35% opacity.
- Removed the "10m", "20m"… labels on the grass.

## Step 2.38: a new target clears the ✕ on its side
- The red ✕ stays up for `missX` (0.25s) after a wrong tap. If you then hit the
  green quickly and the next target landed on the ✕'s side, both were drawn on
  the same spot. Now the new target clears the ✕ there, so each spot shows one
  thing at a time. Forced-overlap test: 255/400 overlaps before, 0 after.

## Step 2.37: no mini-map; finish timed on the torso
- Removed the race progress mini-map from the top of the screen; the field is
  visible on the track itself.
- **Finish timing now follows the real rule** (World Athletics: the torso
  counts, not the head, arms, legs, hands or feet). Before, an upright runner
  was timed at the hips. Now it's the leading edge of the torso: `torsoLead`
  0.15m ahead of the hips running upright, or out to `reach` (1m) in a full
  lean, whichever is further forward.
  - Everyone's times are about 0.01s faster.
  - A perfectly timed lean now gains about 0.085s over not leaning (was about
    0.10s), because an upright chest already counts.

## Step 2.36: wrong-tap speed loss 1.0 → 1.7 m/s (tuning panel)
- `sprint100.targets.missSpeedLoss` 1.0 → 1.7 m/s. Also the AI's, which pays
  the same price. The double-press guard stays at 0.
- Simulator: good reader 8.85s, expert 8.36s. Best masher (8/s) 9.47s (was
  8.65s), so reading beats mashing again by about 0.6s. A casual reader (about
  3 hits/s, 10.03s) still loses to a steady masher.

## Step 2.35: gentler mistakes, no double-press guard (tuning panel)
Chosen in the tuning panel:
- `sprint100.targets.missSpeedLoss` 2.0 → 1.0 m/s. Also the AI's, which pays
  the same price.
- `runner.minStrideInterval` (double-press guard) 10 → 0 ms.

Simulator (`node tools/simulate.mjs`), before → after:

| Strategy | Before | After |
|---|---|---|
| Good reader | 8.95s | 8.84s |
| Expert reader | 8.41s | 8.34s |
| Masher 6/s | 9.74s | 9.21s |
| Masher 8/s | 10.21s | **8.65s** |
| Masher 10/s | 11.90s | 8.80s |
| Both-thumb drummer 7/s | 16.37s | 9.46s |

**Mashing now beats good reading** (8.65 vs 8.84s). Only an expert reader
(8.34s) beats the best masher.

The guard alone barely matters: with it at 0 and the penalty at 2.0, the good
reader still wins by about 0.8s. The penalty is what separates reading from
mashing. At 1.4 m/s the good reader edges the best masher (8.84 vs 9.00s); at
2.0 the lead is comfortable.

## Step 2.34: tap markers (troubleshooting "my tap didn't register")
- New tuning setting **Troubleshooting → Tap markers** (`debug.tapMarkers`,
  off by default). During a race, every tap the game receives leaves a marker
  where your thumb landed:
  - green: stride;
  - red: wrong side;
  - grey with a label: ignored, and why (`early` before GO, `lean zone`,
    `double press`, `after lean`, and so on).
  - A running tally sits at the bottom of the screen.
- A press that leaves **no marker** never reached the game: the phone or
  browser swallowed it.
- Verified in Chromium: a bot tapping the lit side at 5, 8 and 12 taps/s had
  every tap delivered and scored as a stride (79/79), each handled about 12ms
  after the touch.

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
