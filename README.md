# Track Royale

A touch-first, mobile-browser track & field game: five events, two thumbs.
Starring **Juno**, an original stick-figure athlete (placeholder art until step 6).
Plain HTML5 Canvas + vanilla ES modules. No framework, no build step.

**Status:** all five events playable (100m Dash, 110m Hurdles, Long Jump, Pole
Vault, Javelin), against Amateur or Pro rivals.

## Play on your phone

Open https://zacherikson.github.io/track-and-field/ in your phone's browser and
turn the phone sideways. Every push to `master` republishes it through
[`.github/workflows/pages.yml`](.github/workflows/pages.yml); Pages caches files
for about 10 minutes, so reload after that to get a new build.

**One-time setup:** in the repo's **Settings → Pages → Build and deployment**, set
**Source** to **GitHub Actions**. On a free GitHub plan Pages only publishes
public repos, so the repo must be public (or the account on GitHub Pro).

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

It prints 100m times for each tapping style (readers, mashers), 110m hurdles times
for each set-clearing speed, long jump marks and foul rates for each run-up
speed and takeoff timing, pole vault heights for each run-up and plant/release
timing, javelin distances for each run-up, release timing and angle, and the AI fields' results per difficulty.
Log changes you keep in [CHANGELOG.md](CHANGELOG.md).

`tools/vault.html` draws the pole vault's phases in a flat, true-scale side
view (plant, swing, rock back, inversion, bar, landing) for checking against
reference photos. `tools/sprites.html` draws Juno's long jump keyframes as a sprite sheet (serve
the repo and open it) so poses can be checked side by side.

## Online leaderboards and ghosts

🌐 **Leaderboard** (on the menu, the results screen and the tournament's final
standings) has a leaderboard for every event plus one for tournament points.
Finishing an event, on its own or in a tournament, posts your mark to that
event's board if it beats your mark there; finishing a tournament posts your
total. Marks made with changed tuning aren't posted, and don't count as a
personal best either. Set your username with the 👤 button at the top right of
the menu; names are unique.

⚡ **Race live** (on the menu) is a 100m against other people. You wait in a
waiting room until someone else joins; then a countdown starts, more can join
(up to 4), and everyone's gun fires at the same moment (each phone reads the
server's clock). Computer rivals fill the other lanes. Live races run on
Firebase's Realtime Database, which is quick with small frequent messages and
takes a player out of the room when their phone drops off; its rules are in
[`database.rules.json`](database.rules.json) (paste them into Firebase console
> Realtime Database > Rules after changing them). Each phone sends its
taps as they happen, the same data as a 100m ghost, and replays everyone
else's through the same physics, so every phone gets every time exactly. The
others' taps arrive a moment late, so their runners are drawn carried on at
their current speed until the next update (`src/online/live.js`,
`src/online/liveRun.js`).

Your **personal bests** are your entries on the online boards
(`src/online/bests.js`). The phone keeps a copy so offline play works; each
time you're back at the menu it's brought in line with the boards in one
request (your ghosts and best tournament too), so clearing a board in the
Firebase console resets everyone's bests on it. Marks are kept to the
hundredth, as they're shown (`roundMark` in `registry.js`), and tournament
scores in whole points.

Every attempt is also recorded. Turn **GHOST** on in the menu (it starts off)
and your best one on the phone comes back as a see-through **ghost** ("Your
best"): in the lane next to you in the 100m and hurdles, and on your runway,
starting when your attempt starts, in the long jump, pole vault and javelin. In
a tournament the ghosts are your best tournament's attempts, sharing your lane
so the same five rivals stay in, and the standings say how many points you are
ahead of or behind that tournament. On an event's online board, tap **Race**
on a row to race that player's attempt as a ghost.

The 100m ghost is the run's stride, stumble and lean inputs plus the physics
numbers used, replayed through the same `Runner` code on the same step grid, so
it reproduces the recorded time exactly. `node tools/ghostcheck.mjs` checks
that; run it after changing `runner.js` or `laneRace.js`, and if it fails bump
`GHOST_VERSION` in `src/online/ghost.js`. The other events' ghosts are recorded
frame by frame instead (`src/online/trace.js`: position, pose, and the pole or
javelin, about 30 times a second), so they play back what was drawn whatever
the physics. Each event's `traceProps` in `registry.js` says how many extra
numbers its frames keep; changing what they mean needs `TRACE_VERSION` bumped.

The leaderboard uses Firebase (project `track-royale-f18ad`): Firestore, with
anonymous sign-in so each phone gets an ID without a login screen. Profiles are
in `users/{uid}`, and `usernames/{lowercased name}` records who owns each name.
Frame-by-frame recordings sit in `ghosts/{event}/runs/{uid}`, apart from the
boards, with their frames as one comma-separated string (`toWire` in
`src/online/trace.js`), and are only downloaded to race one. A mark is posted
even if its recording can't be. Boards and recordings are read with
plain `fetch()` calls to Firestore's REST API (they're public), so viewing a
board doesn't wait for the Firebase SDK; the SDK is loaded only to post. The web
config in `src/online/firebase.js` is public by design. The security rules in
[`firestore.rules`](firestore.rules) protect the data (paste them into Firebase
console > Firestore Database > Rules after changing them). They only
sanity-check marks; nothing replays a run on the server yet, so a determined
cheater could post a fake time.

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
  stickFigure.js      placeholder figure: blendable poses (blocks, set, run, stand, hurdle)
  roster.js           the six athletes (kit, skin, hairstyle); your pick and your rivals
src/events/
  registry.js         event list for the menu
  strideTargets.js    100m random targets (max 2 in a row) + hit/miss judging
  laneRace.js         base for lane races: countdown FSM, finish lean, AI, HUD, results
  sprint100.js        100m: random-side target pads, wrong-tap ✕, lean prompt
  hurdleRules.js      hurdles: shuffled 1-2-3 button sets, clear/clip rules, rival thumbs (pure, shared with the simulator)
  hurdles110.js       110m hurdles: button sets along the top, hurdles in every lane, hurdling pose
  longJumpRules.js    long jump: flight physics, marks from the foul line, stretch, rival jumps (pure)
  longJump.js         long jump: 3 rounds, run-up, blinking takeoff pads, flight, stretch, sand, marks
  poleVaultRules.js   pole vault: plant and release quality, height, rival vaults (pure)
  javelinRules.js     javelin: angle while held, distance from speed/angle/gap, rival throws (pure)
  javelin.js          javelin: run-up, hold to draw back, let go to throw, flight shot to the landing and the mark line
  poleVault.js        pole vault: run-up with the pole, spark, hold-and-release, swing, bar, mat, rising camera
src/tournament/       tournament mode: event order and running totals, standings/champion screen
src/events/scoring.js decathlon points (official World Athletics tables)
src/scenes/characterScene.js  choose your athlete (the rest are your rivals)
src/render/track.js   stadium with one-point perspective (camera 1m ahead of the player), parallax crowd
src/render/pads.js    glossy tap targets, numbered buttons and the red ✕
src/render/targetPads.js  falling target + hit ring animations (100m, long jump run-up)
src/render/runway.js  long jump runway, board and sand pit (on the stadium renderer)
src/render/javelinField.js  javelin runway, foul line and sector; the flight shot (sky, hills, sea) down to where it sticks in the grass
src/render/vaultArena.js  pole vault runway, plant box, landing mat, uprights with height marks, tall sky
src/online/
  ghost.js            records a run's inputs and replays them as a ghost (pure)
  firebase.js         online leaderboards: lazy-loaded Firebase SDK, anonymous sign-in, Firestore
  post.js             posts a finished mark to its board and reports how it went
  bests.js            personal bests: your board entries, synced to the phone's copy
  live.js             live races: the waiting room, the shared start time, sending and receiving runners
  liveRun.js          another player's runner in a live race, replayed as their taps arrive
  trace.js            records an attempt frame by frame and plays it back (every event but the 100m)
  fieldGhost.js       records and draws ghosts in the long jump, pole vault and javelin
  ghosts.js           picks which ghost races: best tournament, a leaderboard pick, or your best
src/scenes/leaderboardScene.js  online leaderboards, a tab per event, with Race buttons
src/scenes/profileScene.js      your username (unique, saved in Firebase)
src/scenes/lobbyScene.js        the live race waiting room
src/tuning/           in-game tuning panel (params list, saved overrides, live estimates)
tools/simulate.mjs    headless tuning simulator
tools/ghostcheck.mjs  checks that recorded runs replay to the exact same time
firestore.rules       Firestore security rules for the leaderboards and usernames
database.rules.json   Realtime Database security rules for live races
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
  - the start: `minSpeed` and `startPace` (you leave the blocks at minSpeed with a
    strong assumed pace; your real taps pull it toward your actual rhythm, so
    you start fast and only slow down if you can't keep it up, never below
    minSpeed)
  - explosiveness: `accelMax`
  - punishment for stopping: `coastDecel`
- **Juice.** Small feedback makes input feel good: a ring burst on each hit, a red ✕
  on a wrong-side tap, a target that pops in where your thumb already is, a
  pair of orange lean pads, a parallax crowd and grass, and a speed bar.
- **Frame-rate independent smoothing.** The camera uses `damp()`
  (`lerp` with `1 - e^(-k·dt)`), so it glides the same at any refresh rate.
