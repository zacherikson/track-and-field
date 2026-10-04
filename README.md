# Track Royale

A touch-first, mobile-browser track & field game: five events, two thumbs.
Starring **Juno**, an original sprinter. Everyone's a stick figure for now; Juno's
drawn art is ready to switch back on (see [src/athletes/sprites/](src/athletes/sprites/README.md)).
Plain HTML5 Canvas + vanilla ES modules. No framework, no build step.

**Status:** all five events playable (100m Dash, 110m Hurdles, Long Jump, Pole
Vault, Javelin), against Amateur or Pro rivals, plus a 4×100m relay and a
cycling time trial under Special Events.

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

## Late hits

Once an event is over, everyone who took part hangs around where it finished
(past the finish line, round the pit) until the next one, and you can go and
beat them up, NFL Blitz style. There's no cut: once you've crossed the line and
pulled up (or got to your feet after your last attempt), the fight controls
appear right where you are, and each rival joins in as they come to a stop, so
finishing first means getting the first hits in. After a field event the
rivals walk over to you. The results (or tournament standings) come up at the
top of the screen over the stands, with Race again (or Next) and Menu (or Quit)
along the bottom on the ad boards, leaving the track clear. Everyone walks about normally until a fight starts; then the
fists come up.
Left thumb: drag to walk. Right thumb: PUNCH, KICK, SLAM (grab, hoist overhead,
slam down), and hold 😀 then drag to an emote on the wheel. Three punches in a
row knock someone down. Hits leave bruises, black eyes and a bit of blood,
which stay on everyone until you go back to the menu. Nothing counts: it's for
fun. The computer rivals leave you alone until you hit one or emote in their
face; then they come after you, and gloat once they've put you down. In live play it's the
other players, and each phone decides its own player's hits. Keyboard: arrows
or WASD, J / K / L, 1-6 for emotes.

## Where you play

Each mode has a venue of its own ([`src/render/venues.js`](src/render/venues.js)):

- **Training** — a rundown community track. Overcast, faded surface worn to
  dirt, chalk lines, dry unmown grass, rusty blocks, pine woods behind a
  chainlink fence. No stand, because nobody came.
- **Amateur** — the high-school stadium: brick-red track, mowed stripes, a low
  stand that's a good way from full, painted sponsor boards.
- **Pro** — the big final: blue track, crisp paint, a deep stand packed solid
  under floodlights with camera flashes, lit hoardings, evening sky. Live play
  uses this one.

A venue is **paint and props only**. All three share the geometry in `LAYOUT`
([`src/render/track.js`](src/render/track.js)) — the horizon and the near and
far edges of the track — because the perspective solve, every event camera, the
late-hit venues and the pole vault's upward pan are all tuned against those
numbers. A venue may recolor anything and swap what fills the band behind the
track (a stand, or hills and trees), but it never moves the ground.

`node tools/venuecheck.mjs` draws every venue through all four renderers and
fails if one is missing a color a renderer reads.

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
the repo and open it) so poses can be checked side by side. `tools/rig.html` turns drawn
body parts into an athlete's sprite sheet (see [src/athletes/sprites/](src/athletes/sprites/README.md)).

## The home screen

Like Clash Royale: three tabs along the bottom, **Athlete | Play | Squad**. Tap
one or swipe sideways to slide between them. The game opens on **Play**: three
big buttons, **🤖 vs Computer**, **🌐 Live** and **⭐ Special Events**, over your
athlete warming up on the track (tap them to change who it is). vs Computer and
Live open the tournament and the five events (vs Computer with its Training
Ghost toggle). Special
Events opens the events that aren't part of the five (the 4×100m relay and the
time trial), with a RIVALS toggle, Amateur or Pro. The Squad tab has ⚔ Practice:
live events with just your squad (see Squads). ‹ Back (or Esc) returns to the
buttons, and Menu after a race comes back to the list you raced from.
Keyboard: 1 / 2 / 3 or Q / E change tab, Esc goes back to Play.

## 4×100m relay

Under **Special Events**. Six teams of four on one long straight, in their
captain's kit; yours is captained by your athlete, who anchors. You run every leg with
the 100m's green targets.

The baton changes hands in a blue 20 m zone around each 100 m line (10 m
either side). Your teammate takes off on their own as you come in and settles
just under your speed, so you reel them in. In the zone the targets give way to
one blue button in the middle: **PASS** reaches the baton out (it slows you a
little, so not too early), then **TAKE** as they come into reach. A ring round
the button closes in as you catch them; tap when it meets the button.

- **PERFECT**: at arm's length. **GOOD**: a bit close. **LATE**: up their back,
  and they check their stride. Tap TAKE while they're out of reach and they
  grab air (**TOO SOON**) and lose speed.
- **MISSED**: the baton reaches the end of the zone unpassed. Your teammate
  pulls up just past it, you stop behind them, and the baton changes hands
  there: the next leg starts from a standstill (about 1.5 s lost).
- The anchor leans at the line with the orange pads, as in the 100m.

The results show each of your exchanges and the baton's time through the zone.
Rivals race in the venue for their level: the high school for Amateur, the big
stadium for Pro. The relay isn't on the online leaderboards yet. It plays
live as a squad Practice (Squad tab): each other player's team runs in the
lane next to yours, drawn from what their phone sends (every runner and the
baton, 20 times a second). Tuning:
`CONFIG.relay` in [`src/config.js`](src/config.js); `node tools/simulate.mjs`
shows what a change does to team times and exchange grades.

## Time trial

Under **Special Events**: 620 m of hilly road on a bike, against the clock,
with your five rivals riding it alongside you as see-through ghosts. A flat
start, an 8% climb, an 11% descent, a flat and a short kick to the line,
drawn side on with the hills exaggerated so you can see them coming (the
profile along the top shows the whole course).

- **Pedal** with the two big pads, left and right in turn: the green one is
  next (the same foot twice is a missed stroke).
- **Shift** with the small blue buttons above them: − easier, + harder (↑ ↓
  on a keyboard). The PEDALS meter shows how fast the pedals go round (the
  needle) against your rhythm (the yellow tick): keep the needle in the green.
  Your legs push hardest slowly and give out fast, so power peaks in the
  middle: too big a gear on the climb and you grind, too small on the flat and
  you're spinning as fast as your thumbs go. SHIFT UP / SHIFT DOWN prompts help.
- **Tuck**: hold both pads (or Space). No pedalling, much less drag: once the
  descent spins you out in top gear, it's quicker than pedalling.
- **Bike throw**: in the last 20 m both pads turn orange; press both to shove
  the front wheel at the line.

Time checks at the top of the climb and the bottom of the descent say how you
stand against the fastest rival through there so far. There are no late hits
after this one. Tuning: `CONFIG.cycling` in [`src/config.js`](src/config.js);
`node tools/simulate.mjs` shows what each gear choice, the tuck and the rivals
come to.

## Squads

The **Squad** tab is for you and your friends: start a squad (pick a name), or
find one by name (or in the list of the biggest) and join it. Up to 30 players
per squad, one squad at a time. The player who started it leads it (👑) and can
kick members out (tap one, then confirm; they can join again later); when the
leader leaves, whoever has been in it longest takes over, and the last one out
closes it. You need a username first (Profile), since the member list shows it.
Guests can join too. For now a squad is just its name and members.

📨 **Invite** (on your squad's page) sends a friend a link through the phone's
share sheet (or copies it, where there isn't one): the game's address with
`?squad=<name>&from=<your name>` on the end. Opening it shows the invite
screen: who invited them, the squad and who's in it, a box for their username
(already filled in if they have one) and **Join**, which saves the name and
joins in one go. Then "You're in" and **Let's go** to the squad. **Not now**
leaves the invite at the top of the Squad tab (its Join opens the same screen)
until they join a squad or dismiss it (✕).

⚔ **Practice** (on your squad's page) is a friendly battle with your squad,
like Clash Royale's: tap it, pick an event (the five, the **4×100m relay**, or
the tournament), and you're in a live
waiting room that only your squad sees. While it's open it shows next to the
Practice button on every member's Squad tab, with **Join**; it plays like any
live event (below), up to 4 players, and Race again or Menu bring you back to
the squad. Squad rooms are `squadlobby/{squad}/{kind}` in the Realtime
Database, next to the public `lobby/{kind}` (`src/online/live.js`); the
database can't see squads (they're in Firestore), so its rules don't check
who joins: only members are shown the room.

Squads live in Firestore (`squads/` and `squadmembers/`, see
[src/online/squads.js](src/online/squads.js)); `firestore.rules` checks every
join, leave and new squad.

### Squad meets

🏟 **Meet** (on your squad's page) is squads against squads, live: up to six
squads of four through the five events in order and then the 4×100m relay,
in about five minutes ([docs/meets.md](docs/meets.md)).

- **Sign-up.** Tapping Meet signs you up; the first four of the squad make its
  team (the button shows who's in). With four, the squad is put in a meet
  lobby with other squads.
- **Lobby.** Each squad gets a meet captain, picked at random (👑), who presses
  **Ready**. Six squads ready start at once; with two to five all ready,
  captains get **Start early**, and when every captain presses it the meet
  starts with the squads there. A squad that dawdles while the rest are ready,
  or is a member short too long, is sent back.
- **Events.** Each squad has a lane. Every event runs as four heats (field
  events: flights) at the same moment, one athlete from each squad in each,
  seeded by personal best; you only see your heat. Places across all the
  heats score 10-8-6-5-4-3-2-1 for the squad (ties share the points). The
  server keeps the clock: every race and round has a cutoff, so nobody is
  waited on for long (a field attempt not done by then is a foul).
- **Relay.** One race, every squad. Each of the four runs one leg on their own
  phone, legs drawn at random (someone runs again for anyone gone). The phone
  of the runner taking the baton decides the handover; a runner whose phone
  drops is finished by a computer runner on a teammate's phone.
- **Between events** the late hits, with this event's places across every
  heat and the squads' totals over them; then the next title card comes up by
  itself. After the relay, the final standings.

Meets run on the meet server, a Cloudflare Worker in [server/](server/README.md),
not the Realtime Database: it runs each meet's clock, heats and scoring. It
has to be deployed (server/README.md) and its address put in
`src/online/net.js` (`MEET_SERVER`) before the Meet button opens.

## Your athlete

**Athlete** (the home screen's left tab): your athlete warming up along the
top, with their tagline and height, and everyone below. Tap one and they're
yours. Your athlete does every event and the whole tournament (all five, like a
pentathlon); in each event the other five are your rivals. The athletes only
look different for now; they all run on the same physics.

(There used to be a lineup, a different athlete per event, and a Team
tournament for it. Both are gone for now; the Team Tournament's board,
`teamtournament`, stays in the database but isn't shown.)

## Online leaderboards and ghosts

🌐 **Leaderboard** (on the menu, the results screen and the tournament's final
standings) has a leaderboard for every event plus one for tournament points.
Finishing an event, on its own or in a tournament, posts your mark to that
event's board if it beats your mark there; finishing a tournament posts your
total. Marks made with changed tuning aren't posted, and don't count as a
personal best either. Set your username with the 👤 button at the top right of
the menu; names are unique.

**Your progress follows your account.** Signed in with Google, your
campaign progress (what you've beaten in Amateur and Pro), your top five marks
on every board (the Leaderboard's **Mine**) and your athlete
are saved to your account as well as the phone
([`src/online/progress.js`](src/online/progress.js), Firestore
`progress/{uid}`, private to you). A new phone, or one whose data was cleared,
gets them back when you sign in. Syncing merges rather than overwrites: you
keep everything either copy has beaten and the best five marks from both, and
the athlete chosen most recently wins. A guest's progress stays on the phone
until they sign in.

**Live play**: **🌐 Live** on the Play tab lists every event and the
tournament, live against other people (**🤖 vs Computer** is against the
computer). You wait in a waiting room for that event until someone else joins;
then a countdown starts, more can join (up to 4), and everyone starts at the
same moment (each phone reads the server's clock). There are no computer rivals
in live play, so every phone shows the same results.
- Races: everyone's gun fires together, in the lanes next to yours.
- Field events: every round starts together, so you all run up at once; the
  others are drawn on your runway, see-through and named in gold. Once
  everyone's attempt is over, the next round counts down and starts by itself.
- Tournament: the five events in a row with the same people. Once everyone has
  finished an event, the standings count down to the next one, which starts by
  itself. Nobody taps to go on; anyone still playing after 20 s is left to
  catch up.

Live play runs on Firebase's Realtime Database, which is quick with small
frequent messages and marks a player as gone when their phone drops off; its
rules are in [`database.rules.json`](database.rules.json) (paste them into
Firebase console > Realtime Database > Rules after changing them). In the 100m
each phone sends its taps as they happen, the same data as a 100m ghost, and
replays everyone else's through the same physics, so every phone gets every
time exactly; the others' runners are drawn carried on at their current speed
until the next update (`src/online/liveRun.js`). Every other event sends the
athlete frame by frame instead, drawn about a quarter of a second behind
(`src/online/liveTrace.js`), with marks taken from each player's own phone.
`src/online/live.js` has the waiting room, the shared start times and the
messages.

Your **personal bests** are your entries on the online boards
(`src/online/bests.js`). The phone keeps a copy so offline play works; each
time you're back at the menu it's brought in line with the boards in one
request (your ghosts and best tournament too), so clearing a board in the
Firebase console resets everyone's bests on it. Marks are kept to the
hundredth, as they're shown (`roundMark` in `registry.js`), and tournament
scores in whole points.

Every attempt is also recorded. Turn **GHOST** on in the vs Computer list (it starts off)
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
anonymous sign-in so each phone gets an ID without a login screen. Signing in
with Google on the Profile screen links that same ID to a Google account
(`linkWithCredential`), so the username, bests and board entries stay and follow the
player to any phone they sign in on; if that Google account already has a
player, the phone switches to it and reloads. Only signed-in players go on the
leaderboards (`firestore.rules` checks the sign-in provider): a guest's bests
stay on the phone and are posted when they sign in (`postBests` in
`src/online/bests.js`). It needs Google turned on in
Firebase console > Authentication > Sign-in method, and the site's domain
(`zacherikson.github.io`, plus `localhost` for testing) in Authentication >
Settings > Authorized domains. Sign-in goes to Google's page and back (no
popup: a popup can't report back to the game when it runs from an iPhone's
home screen), using the OAuth client Firebase made for Google sign-in
(`GOOGLE_CLIENT_ID` in `src/online/firebase.js`). Its Authorized redirect URIs,
in Google Cloud console > APIs & Services > Credentials > "Web client (auto
created by Google Service)", must list `https://zacherikson.github.io/track-and-field/`
(and `http://localhost:8123/` to test locally). Profiles are
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
src/main.js           boots the Game with the home screen
src/config.js         ALL tuning numbers
src/flow.js           scene transitions: home → intro → event → result
src/core/
  game.js             game loop (fixed timestep), view scaling, scene switching
  input.js            raw multi-touch + mouse + keyboard queue with precise timestamps
  camera.js           side-scroll camera with smoothing + look-ahead
  ui.js, math.js, storage.js
src/athletes/
  runner.js           shared runner physics (player and AI)
  ai.js               AI "thumbs": taps at a personal cadence
  stickFigure.js      the skeleton: blendable poses (blocks, set, run, stand, hurdle), joints, stick-figure drawing
  sprites.js          drawn body-part sprites hung on that skeleton, with faces (focus, strain, joy, shock)
  sprites/            sprite sheets (none yet) and how to make one
  roster.js           the six athletes (kit, skin, hairstyle); who you play each event as, and your rivals
src/events/
  registry.js         event list for the menu
  strideTargets.js    100m random targets (max 2 in a row) + hit/miss judging
  laneRace.js         base for lane races: countdown FSM, finish lean, AI, HUD, results
  sprint100.js        100m: random-side target pads, wrong-tap ✕, lean prompt
  hurdleRules.js      hurdles: shuffled 1-2-3 button sets, clear/clip rules, rival thumbs (pure, shared with the simulator)
  hurdles110.js       110m hurdles: button sets along the top, hurdles in every lane, hurdling pose
  relayRules.js       4x100m relay: the exchange zone, the outgoing runner, PASS / TAKE judging, rival timing (pure)
  relay4x100.js       4x100m relay: teams of four, every runner on the track, the blue button, the baton
  cyclingRules.js     time trial: the course, bike physics (gears, legs, hills, drag, tuck, throw), rival riders (pure)
  timeTrial.js        time trial: pedal pads, shifters, tuck, time checks, the pedal meter and course profile
  longJumpRules.js    long jump: flight physics, marks from the foul line, stretch, rival jumps (pure)
  longJump.js         long jump: 3 rounds, run-up, blinking takeoff pads, flight, stretch, sand, marks
  poleVaultRules.js   pole vault: plant and release quality, height, rival vaults (pure)
  javelinRules.js     javelin: angle while held, distance from speed/angle/gap, rival throws (pure)
  javelin.js          javelin: run-up, hold to draw back, let go to throw, flight shot to the landing and the mark line
  poleVault.js        pole vault: run-up with the pole, spark, hold-and-release, swing, bar, mat, rising camera
src/tournament/       tournament mode: event order and running totals, standings/champion screen
src/brawl/            late hits after each event: the fight (brawl.js, fighter.js, poses.js), wounds,
                      controls with the emote wheel, the rivals' brains (bots.js), live sync
                      (liveBrawl.js), the event's venue (venue.js), the late hits run inside the event
                      (aftermath.js, fieldLateHits.js) and the results panel over them (aftermath.js)
src/events/scoring.js decathlon points (official World Athletics tables)
src/render/track.js   stadium with one-point perspective (camera 1m ahead of the player), parallax crowd
src/render/pads.js    glossy tap targets, numbered buttons and the red ✕
src/render/targetPads.js  falling target + hit ring animations (100m, long jump run-up)
src/render/runway.js  long jump runway, board and sand pit (on the stadium renderer)
src/render/javelinField.js  javelin runway, foul line and sector; the flight shot (sky, hills, sea) down to where it sticks in the grass
src/render/vaultArena.js  pole vault runway, plant box, landing mat, uprights with height marks, tall sky
src/render/road.js    time trial road side on (real hills, exaggerated), scenery, arches; the rider on a TT bike
src/online/
  ghost.js            records a run's inputs and replays them as a ghost (pure)
  firebase.js         online leaderboards: lazy-loaded Firebase SDK, anonymous and Google sign-in, Firestore
  squads.js           squads: start, find, join and leave one; your squad and its members
  post.js             posts a finished mark to its board and reports how it went
  bests.js            personal bests: your board entries, synced to the phone's copy
  progress.js         campaign progress, top five marks and your athlete, synced to your account (merged)
  live.js             live play: the waiting rooms (public, and each squad's Practice), shared start times, sending and receiving players
  liveRun.js          another player's runner in a live 100m, replayed as their taps arrive
  liveTrace.js        sends your athlete frame by frame in live play, and draws the others' (all but the 100m)
  liveField.js        a field event played live: rounds together, the others on your runway
  trace.js            records an attempt frame by frame and plays it back (every event but the 100m)
  fieldGhost.js       records and draws ghosts in the long jump, pole vault and javelin
  ghosts.js           picks which ghost races: best tournament, a leaderboard pick, or your best
src/scenes/inviteScreen.js      the invite screen a squad invite link opens: pick a username, join
src/scenes/homeScene.js         the home screen: Athlete | Play | Squad tabs, swipes, the tab bar
src/scenes/home/                its panels: athletePanel.js (pick your athlete),
                                playPanel.js (the events, tournament and settings), squadPanel.js (your squad, Practice)
src/scenes/leaderboardScene.js  online leaderboards, a tab per event, with Race buttons
src/scenes/profileScene.js      your username (unique, saved in Firebase) and Google sign-in
src/scenes/lobbyScene.js        the live waiting room (any event, or the tournament)
src/meet/             squad meets (docs/meets.md): the rules shared with the meet server (rules, scoring,
                      heats, relayLegs, protocol), the meet you're in (meet.js), sign-up and lobby
                      (meetScene.js), standings between events (meetStandingsScene.js)
src/events/meetRelay.js  a meet's 4x100m relay: one leg per phone, exchanges decided by the taker's phone
src/online/net.js     the meet server connection; meetSession.js: a meet as the events see a live room
server/               the meet server: Cloudflare Worker + Durable Objects (server/README.md)
test/                 the meet rules' tests (node --test test/*.test.mjs)
src/tuning/           in-game tuning panel (params list, saved overrides, live estimates)
tools/simulate.mjs    headless tuning simulator
tools/ghostcheck.mjs  checks that recorded runs replay to the exact same time
firestore.rules       Firestore security rules for the leaderboards and usernames
database.rules.json   Realtime Database security rules for live play
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
