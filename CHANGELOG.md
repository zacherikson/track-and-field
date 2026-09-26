# Changelog

Gameplay and tuning changes, newest first. When you change a number in
`src/config.js`, log the old → new value and why it felt better.
`node tools/simulate.mjs` shows what a change does to race times.

## Step 2.1: 100m changes from the reference gameplay video
Frame-by-frame study of a 100m run in the 2009 original. Only the mechanics are
reimplemented here; the art and presentation are our own.
- **One target at a time.** Instead of two fixed pads, a single green target
  alternates sides. The first target after GO is always on the left.
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
  mash-based. Not changed yet.

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
