# Pole vault in the original: measured

What the original mobile game's pole vault does, measured frame by frame from
Zachary's screen recordings (iPhone 5s, `~/Desktop/code/pole-vault-clips` and
`~/Desktop/code/2nd-pole-vault-clips`).
Side-by-side frames of the original and ours are in
[`pole-vault-compare/`](pole-vault-compare/) (`all.jpg` has every moment on
one sheet).

## Sources

`pole_vault.mov` is the raw recording: 163 s, 60 fps, 1136×640. The game
itself is drawn 960×640 (3:2) with black bars at the sides. It holds three
three-vault sessions. Each short clip is a cut from it (located by matching
frames), so every clip has a known height:

| Clip | In the .mov | What happened | Result |
|---|---|---|---|
| `start.mp4` | 0.0 s | Waiting to start | |
| `pole vault run.mp4` | 3.6 s | Run-up | |
| `normal jump.mp4` | 9.0 s | Session 1, vault 1 | **6.14 m** AWESOME! |
| `post jump replay.mp4` | 13.9 s | Result, replay, standings | |
| `planting way too early.mp4` | 30.0 s | Session 1, vault 2: pressed ~0.4 s early | **FOUL**, OUCH |
| (no clip) | 44 s | Session 1, vault 3: held on far too long | **FOUL** |
| (no clip) | 63 s | Session 2, vault 1: released very late | **1.04 m**, OUCH |
| `runway pole movement.mp4` | 79.2 s | Session 2, vault 2: plant zone | |
| `normal jump2.mp4` | 80.6 s | Session 2, vault 2 | **5.06 m** |
| (no clip) | 93 s | Session 2, vault 3: held on too long | **FOUL** |
| `decent jump.mp4` | 112.9 s | Session 3, vault 1: released late | **4.24 m**, NOT GOOD ENOUGH |
| `great jump.mp4` | 129.6 s | Session 3, vault 2 | **6.18 m**, AWESOME! |
| `fantastic jump.mp4` | 150.2 s | Session 3, vault 3: best release | **6.62 m**, AWESOME! |

The second batch is `2nd clips.mov` (73 s, two sessions), cut the same way:

| Clip | In `2nd clips.mov` | What happened | Result |
|---|---|---|---|
| `slow jump.mp4` | 7.6 s | No run-up taps at all, then plant and release | **2.84 m**, OUCH |
| `holding immediately.mp4` | 22.5 s | Pressed and held as the pads lit | **FOUL** (crash) |
| `releasing early.mp4` | 36.8 s | Let go well before the handstand | **4.41 m** |
| `releasing immediately.mp4` | 49.4 s | Let go straight after the plant | **0.73 m** |
| `not planting at all.mp4` | 65.6 s | No press at the plant (run-through) | **FOUL**, OUCH |

Every vault in the first batch reached the same top speed (see Run-up), so
those heights come from timing alone. The slow jump is the one vault at a
lower speed.

## Scale

- The athlete is drawn about **167 px tall** in the 640 px-high game, which is
  **26% of the screen height**.
- The scale comes from the bar marker (below) against the ground on the 4.24,
  6.18 and 6.62 m vaults. The far upright measures **95 px/m**, and the top of
  the mat is **0.70 m** up. That makes the athlete about 1.76 m: the original
  is drawn true to scale, so "athlete heights" = height ÷ 1.8 m.
- A 6.62 m vault is about **3.7 athlete heights** at the hips.

## Run-up and camera

- **Start:** the athlete stands holding the pole nearly upright, and a big
  orange button pulses at the top centre until you tap.
- **Targets:** green circles top-left and top-right (pad centres about
  (98, 227) and (862, 227) in the 960×640 game, radius ~60 px). The lit one
  stays lit for ~0.25–0.3 s per tap, so taps come about 3/s. A wrong-side tap
  shows a red ✕ on that circle.
- **Length:** **4.0–4.6 s** from the first target to the pads lighting, in
  every vault, then 1.4 s to the plant.
- **Top speed:** the same in every first-batch vault. The standards scroll
  28 px per 1/30 s (840 px/s), about **8.5–8.8 m/s (31 km/h)**. Height
  differences between those vaults come from timing alone.
- **No taps at all:** the athlete still runs, at about **70% of top speed**
  (the standards scroll 18–19 px per 1/30 s instead of 28).
  - The first (left) target just blinks 0.3 s on / 0.3 s off, waiting.
  - The run-up takes 5.6 s instead of 4.0–4.6 s, and the zone 2.0 s instead
    of 1.37 s. So the zone is a fixed distance, not a fixed time.
- **Tap rate vs speed:** taps at 1.9–2.9 switches a second all reached about
  the same speed. The fastest-tapped run (2.9/s, with one wrong-side tap) was
  a little slower at the plant (22 px per frame), so the rhythm seems to
  matter more than the raw rate.
- **Wrong-side tap:** a red ✕ shows on the circle you hit for ~0.1 s. No
  speed loss is visible in the scroll (it's within the noise).
- **Pole while running:** steep (~60°) early in the run, about **45°** when the
  pads light.
- **Camera, horizontally:** the athlete sits at **~36–37%** across while
  running. Through the plant zone the camera pulls ahead, and the athlete
  drifts left to **~27% at the plant**, so the box, mat and standards come in
  from the right.
- **Camera, vertically:** the feet are **83% of the way down** the screen, so
  the runway is low and there's a lot of stand and sky above.
- **Start zoom:** the camera zooms in slightly as the run starts, and the HUD
  bar ("ROUND n") slides away.

## Plant zone (the orange pads)

- **Pads:** both circles turn **orange** together and **blink: 0.3 s on,
  0.3 s off** (0.6 s period). The first lit moment can lag the zone start by
  up to one off-phase.
- **Pads → plant:** **1.37 s** (1.33–1.37 s on the vaults with a full first
  blink; 1.1–1.26 s when the first blink was late).
  - That is about 12 m at 8.6 m/s.
  - The pole tip slides into the box on its own when it gets there. Your press
    doesn't trigger it.
- **Pole drop:** 45° at the pads → 32° (+0.13 s) → 24° (+0.27) → 15° (+0.40)
  → 8° (+0.53) → level by **+0.75–0.8 s** (eased: fast at first). Then it
  tilts slightly down toward the box (tip ~10° below the hands) to the plant.
  The drop takes the first **~55%** of the zone.
- **Spark down the pole:** a white-yellow sparkle.
  - It sets off from the hands **~0.17 s after the pads** (12% of the zone).
  - It runs to the tip in **~1.2 s**, about linearly: 30% of the way at
    +0.42 s, 60% at +0.77 s, 90% at +1.12 s.
  - It reaches the tip as the pole plants.
- **Pressing early is a foul:**
  - ~0.4 s early: the pads go out at the press and the athlete runs on with
    the pole low. At the box they plant badly, dive into the ground short of
    the mat and roll back: **FOUL, OUCH**.
  - Held from the moment the pads lit (~1.2 s early): the same. The pads go
    out, the spark still runs down, and at the box the athlete crashes into
    the front of the mat, rolls back onto the runway and gets up: **FOUL**.
  - There is no early window that still plants.
- **No press at all (run-through):** the pole plants itself and the athlete
  runs into the front of the mat with it, falls back onto the runway, rolls
  and gets up: **FOUL, OUCH**. About 2.2 s from the plant to the result.
- **Plant camera jolt:** at the plant the camera snaps back about **50 px
  (~0.5 m)** over two frames, then eases on.

## Swing

| Height | Plant → upside down and release |
|---|---|
| 6.62 m | **0.78 s** |
| 6.14 m | 0.84 s |
| 5.06 m | 0.88 s |
| 6.18 m | 0.90 s |
| 4.24 m | 0.95 s |
| 1.04 m | 1.00 s |

The speed was the same each time, so the spread is release timing.

At 70% speed (the slow jump) the swing took **~0.9 s**: only ~15% longer for
a ~30% slower plant. The swing time grows much less than 1 / speed.

- **Spark back up:** the spark climbs back from the box to the hands in only
  **~0.3 s** after the plant, then sits at the hands. The release cue is the
  pose, not the spark: let go when you're **upside down, straight, on an
  upright pole**.
- **Shape:** hang under the bending pole (most bend ~0.3–0.45 s after the
  plant), legs swing up, body horizontal upside down at ~0.5 s, vertical
  handstand on a straight pole at ~0.75–0.85 s.
- **Hold rings:** while you hold, the pads show as **white rings** that pulse.
- **Camera rise:** the camera starts rising ~0.35 s after the plant, at up to
  about 400 px/s (~4 m/s).

## Off the pole

| Height | Release → peak (bar stops) | Peak → mat | Release → mat |
|---|---|---|---|
| 6.62 m | ~0.8 s | ~1.1 s | **1.95 s** |
| 6.18 m | | | 1.8 s |
| 6.14 m | ~0.75 s | ~1.05 s | 1.8 s |
| 5.06 m | | | 1.45 s |
| 4.24 m | | | 1.23 s |
| 1.04 m | | | 0.9 s |

- **Push off the pole:** upside down on the upright pole, the hips are about
  4.9 m up on every vault. The 6.62 m vault rose **~1.7 m** more off the top of
  the pole: a big, exaggerated push.
- **A simple fit to the flight times:**
  - The pole top sits at a fixed ~4.6 m.
  - The push is the rest of the height, at least 0.3 m.
  - Gravity is 8 m/s².
  - That gives 1.9 / 1.75 / 1.35 / 1.17 s against the measured
    1.95 / 1.8 / 1.45 / 1.23 s.
- **Forward:** you release about over the box. The hips cross the standards at
  the peak, arching face-down over the bar, legs dangling, with a long floaty
  hang near the top (~0.5 s on the 6.62). You land on your back on the mat
  about **2 m past the standards (~4 m past the box)**, bounce, roll, and are
  on your feet **~0.65 s** after landing.
- **The bar marker:** the grey sleeve on each upright is the bar. It rides up
  with your hips and stops at the height you clear. A red **"WR"** flag on the
  near upright marks ~6.14–6.2 m (the 6.14 and 6.18 m vaults stop at it).
- **Camera at the peak:** the bar sits **34% down** the screen, with nothing
  but sky, hills and the uprights in view. The camera then follows you down
  to the mat.
- **The pole after release:** left behind, it falls back toward the runway.

## Layout (from the plant frame, ~95–104 px/m)

| Thing | Where |
|---|---|
| Hips at the plant | ~4.2 m before the box (2.3 athlete heights), hands overhead |
| Box | x = 0 (white/black marker at the end of a dark slot) |
| Mat front edge | ~0.4 m past the box |
| Mat back edge | ~6.7 m past the box |
| Mat top | ~0.7 m up (front face drawn ~1 m tall) |
| Standards | ~2.1 m past the box (near upright; the far one is drawn ~0.8 m left by perspective) |
| Landing | ~4 m past the box |

## Held on too long

- Hold past the top and you stall in a **handstand on the vertical pole**.
- Hold on a while and the pole sways back and forth (the 44 s vault went
  over, back and over again).
- Then it **topples back** toward the runway with you. You land on the runway
  short of the mat, roll, stand up: **FOUL**.
- Releasing late but not that late still scores, just much lower (see below).

## What each mistake costs (same top speed every time)

| Mistake | Height |
|---|---|
| Released right at the handstand (0.78 s after the plant) | 6.62 m |
| ~0.06 s late | 6.14 m (−0.5 m) |
| ~0.10–0.12 s late | 5.06–6.18 m (−0.4 to −1.5 m) |
| ~0.17 s late | 4.24 m (−2.4 m), "NOT GOOD ENOUGH" |
| ~0.22 s late | 1.04 m, "OUCH" (barely leaves the pole) |
| Held ≥ ~0.4 s past the top | FOUL (toppled back) |
| Pressed ~0.4 s before the plant | FOUL (crashed short of the mat) |
| Held from the pads lighting (~1.2 s early) | FOUL (crashed into the mat front) |
| No press at the plant | FOUL, OUCH (ran into the mat front) |
| Released ~0.33 s early (off the pole ~0.45 s after the plant) | 4.41 m (about −2.2 m) |
| Released straight after the plant (and ~10% slower) | 0.73 m: flops onto the front of the mat, bounces back onto the runway |
| No run-up taps (~70% speed), plant and release fine | 2.84 m, "OUCH" |

So in the original:
- **Late releases are steep:** ~1 m per 0.1 s late at first, then a cliff.
- **Early releases are kinder:** 0.33 s early cost about what 0.17 s late did.
  Letting go at once still leaves you on the pole ~0.4 s, then dumps you on
  the front of the mat.
- **Speed works like v²** with little or no fixed part: 70% speed gave 43% of
  the height (0.7² = 0.49).
- **The plant's own cost is unknown:** every on-time press in these clips was
  within a frame or two of the plant, and anything early was a foul.

## Result screens

**Between vaults:**

1. **~0.9 s after landing** (athlete on their feet on the mat), a top bar
   drops in: flag, "PLAYER 1", "ROUND n" at the top right.
2. The height appears in a red tag ("6.62 m"), or "FOUL" in the same tag,
   with a red **OK** button at the bottom centre.
3. ~0.5 s later a word appears under the height:
   - "AWESOME!" for 6.14, 6.18 and 6.62 m
   - "NOT GOOD ENOUGH" for 4.24 m
   - "OUCH" for 1.04 m, 2.84 m and the crashes
   - "FOUL" (with "OUCH" on a crash) for no height
4. OK → **REPLAY**:
   - The vault plays again from the last few metres of the run-up, with
     "REPLAY" on screen.
   - The height tag shows when the bar marker stops.
   - A ⏩ button skips it. The replay runs ~6 s.
5. Then **STANDINGS**: a red bar "1. PLAYER 1 … 6.14" and OK.
6. Then the next round starts at the run-up.

**After the third vault:** the same result → replay, then a **RESULTS** bar
(best height). OK brings a menu: **RETRY / INSTRUCTIONS / QUIT EVENT**.

## Where ours still differs (October 2026)

These are design calls, not measurement gaps:

| | Original | Ours |
|---|---|---|
| No run-up taps | Runs on its own at ~70% speed | Stands at the start until you tap |
| Pressing early | FOUL, however early | An early hold plants as the window opens, with plant quality 0 (`press.earlyHoldOnTime`) |
| Run-through | Crash into the mat front, FOUL | Drop off the pole, NO HEIGHT |
| Speed | Height ∝ v², little fixed part (70% speed → 43% height) | `height.base` 1.8 m + v² part (70% speed → ~61% height) |
| Swing at a slower speed | ~15% longer at 70% speed | 1 / speed: ~43% longer at 70% speed |
| Release, late | ~−2.4 m at 0.17 s late | −0.4 m (kept gentle on purpose) |
| Release, early | −2.2 m at 0.33 s early; at once = 0.73 m | −0.7 m at 0.33 s early; at once = −1.1 m |
