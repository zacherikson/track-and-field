# Thumbathlon

A touch-first, mobile-browser track & field game: five events, two thumbs.
Starring **Juno**, an original stick-figure athlete (placeholder art until step 6).
Plain HTML5 Canvas + vanilla ES modules. No framework, no build step.

**Status:** 100m Dash playable. Hurdles, long jump, javelin and pole vault are coming.

## Play on your phone

**Now:** the latest build is hosted as a private claude.ai page. Open
https://claude.ai/artifact/QP9s6wP21VMToD9LcBC7dJ in your phone's browser, signed
in to claude.ai, and turn the phone sideways. The link stays the same when a new
build is published; reload to get it.

**GitHub Pages (optional, permanent public URL):** this repo is private, and on a
free GitHub plan Pages only publishes public repos. Either make the repo public or
use GitHub Pro. Then go to **Settings → Pages → Build and deployment → Source:
Deploy from a branch**, pick the branch and `/ (root)`, and save. The site appears
at `https://<user>.github.io/track-and-field/` a minute later. `.nojekyll` makes
Pages serve the files as-is, and Pages caches files for about 10 minutes.

## Run locally

ES modules don't load from `file://`, so serve the folder over HTTP:

```sh
python3 -m http.server 8000        # or: npx serve .
```

Open http://localhost:8000. To test on a phone on the same Wi-Fi, open `http://<computer-ip>:8000`.

- `?debug` in the URL shows fps, cadence, target speed and speed.
- Keyboard: ← / → (or Z / X) are the left and right thumbs, Space leans at the finish. Esc quits a race.

## Tuning

**On the phone:** tap **⚙ Tuning** on the menu or results screen. Every speed
setting has a slider, and live estimates show the resulting race times. Changes
are saved on that device. **Copy changes** gives a summary to paste into chat so
the good ones can be made the defaults.

**In code:** every feel number lives in [`src/config.js`](src/config.js). To see what a change does
without playing, run the headless simulator:

```sh
node tools/simulate.mjs
```

It prints 100m times for each tapping speed, and the AI field's times per difficulty.
Log changes you keep in [CHANGELOG.md](CHANGELOG.md).

## Architecture

```
index.html            canvas + mobile gesture blocking
src/main.js           boots the Game with the menu scene
src/config.js         ALL tuning numbers
src/flow.js           scene transitions: menu → intro → event → result
src/core/
  game.js             game loop (fixed timestep), view scaling, scene switching
  input.js            raw multi-touch + mouse + keyboard queue with precise timestamps
  camera.js           side-scroll camera with smoothing + look-ahead
  ui.js, math.js, storage.js
src/athletes/
  runner.js           shared runner physics (player and AI)
  ai.js               AI "thumbs": taps at a personal cadence
  stickFigure.js      placeholder figure: blendable poses (blocks, set, run, stand)
  roster.js           Juno + rivals
src/events/
  registry.js         event list for the menu
  strideTargets.js    100m random targets (max 2 in a row) + hit/miss judging
  laneRace.js         base for lane races: countdown FSM, finish lean, AI, HUD, results
  sprint100.js        100m: random-side target pads, wrong-tap ✕, lean prompt
src/render/track.js   stadium with one-point perspective (camera 1m ahead of the player), parallax crowd
src/render/pads.js    glossy tap targets and the red ✕
src/tuning/           in-game tuning panel (params list, saved overrides, live estimates)
tools/simulate.mjs    headless tuning simulator
```

### Game-dev concepts used here

- **Game loop.** `requestAnimationFrame` calls us once per display refresh. Each frame
  *updates* the simulation, then *renders* it. Rendering is just a picture of state;
  all logic lives in `update`.
- **Delta time and fixed timestep.** Phones refresh at 60, 90 or 120Hz, and frames
  arrive unevenly. We add the real elapsed time (delta time) to an accumulator and
  advance physics in fixed 1/120s steps. The race plays out identically on every
  phone, and a lag spike can't break the physics. Delta time is clamped to 0.1s, so
  switching tabs doesn't teleport the runner.
- **State machines.** Two levels. The top level is *scenes* (menu, intro, event,
  result), and only one is active. Inside a race: `waiting → ready → set → race → finished`.
  Each state decides what a tap means. The same tap is ignored in `set` and is a
  stride in `race`. This avoids tangled boolean flags.
- **Input handling.** Browser events arrive between frames, so we queue them with
  their exact `event.timeStamp`, converted to simulation time. Tap speed depends on
  the gaps between taps, and rounding them to frame boundaries (16.7ms) would add
  about 20% noise at race pace. Touches are read from raw `touchstart` events (every
  new finger in `changedTouches`, captured on the window before anything else sees
  them); mouse and pen use Pointer Events. The tap zones are whole screen halves,
  so a thumb never "misses". The results screen shows how many touches the phone
  delivered, how many the game judged, and any the phone cancelled.
- **Skill over mashing.** In the 100m the lit side is random, but never three in a
  row on one side. Wrong taps cost speed and briefly lock you out, so reading (and
  pre-empting a forced switch) beats hammering. `tools/simulate.mjs` proves it by
  racing readers, mashers and drummers through the real rules.
- **Tuning "feel".** Speed doesn't jump on each tap. Correct taps become a smoothed
  *cadence*, cadence sets a *target speed*, and actual speed chases the target with
  limited acceleration and deceleration. That separation gives each part of the
  feel its own knob:
  - responsiveness: `cadenceSmoothing`
  - reward curve: `speedCurve`
  - the start: `startSpeed` and `startPace` (you leave the blocks fast with a
    strong assumed pace; your real taps pull it toward your actual rhythm, so
    you start fast and only slow down if you can't keep it up)
  - explosiveness: `accelMax`
  - punishment for stopping: `coastDecel`
- **Juice.** Small feedback makes input feel good: a ring burst on each hit, a red ✕
  on a wrong-side tap, a target that pops in where your thumb already is, a
  pair of orange lean pads, a parallax crowd and grass, and a speed bar.
- **Frame-rate independent smoothing.** The camera uses `damp()`
  (`lerp` with `1 - e^(-k·dt)`), so it glides the same at any refresh rate.
