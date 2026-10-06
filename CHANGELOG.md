# Changelog

Gameplay and tuning changes, newest first. When you change a number in
`src/config.js`, log the old → new value and why it felt better.
`node tools/simulate.mjs` shows what a change does to race times.

## How to play, shorter event cards, arms, javelin stop, rising vault bar
- **How to play**: a new screen (❓ on the Play tab) with a page per event,
  each step an icon of the control as it looks in the race plus one line
  (src/scenes/howTo.js, tutorialScene.js), and Practice to try it.
- **Event cards** lose their five or six lines of rules. They show the
  controls in order instead (Run › Lean, Run › Plant › Push off…) and a ❓
  How to play button that opens the event's steps over the card. The steps
  are on top of the card rather than a screen of their own, so a live or
  meet countdown carries on underneath. `howTo` / `meetHowTo` are gone from
  registry.js.
- **Arm swing at top speed** (stickFigure.js runPose): the front arm came up
  only to about 47° from vertical (hand at the chest) while the back arm went
  74° behind. Now about 64° in front (hand at the chin) and still about 73°
  behind, and the elbow opens more at the back of the swing so the hand passes
  behind the hip. Swing `e * (0.2 + 1.1 sin)` → `e * (0.05 + 1.25 sin)`;
  elbow opening at the back 0.35 → 0.55 rad. Jogging barely changes.
- **Javelin follow-through**: you stop dead where you let go, as in the
  original, instead of braking at `finishDecel` (about 8 m past the release
  before the flight shot) and lunging onto your hands. The pose goes brace →
  release → follow (held 0.45 s) → stand, on the spot. The `lunge` pose is
  gone. Distances are unchanged: the mark was always from the release point.
- **Pole vault bar**: it rises with you, as in the original. Each attempt it
  waits at `poleVault.bar.rest` (2.0 m), then rides up with your hips once
  you're on the pole and stops at the height you clear (`bar.follow` 14:
  how tightly it follows). It used to sit at your best so far (none on the
  first vault). It's also drawn striped red and white with a dark edge: seen
  nearly end-on it's short, and the plain white line was lost against the sky.

## Other players drawn where they are now: relay and hurdles
- Live hurdles: the other runners were drawn from their frames a moment
  behind (1.2 m on two phones with almost no network delay, ~3 m on a real
  one). They're now carried on at their speed to where they are, stride by
  stride, and their hops worked out here from where they are, over the same
  hurdles (a hop is a place on the track: HurdleRun). Measured: 1.18 → 0.20 m
  behind. A trip is decided at takeoff, 2 m before the bar, so it reaches
  your phone (~150 ms) while they're still going up: their stumble starts
  from when their frame says they tripped and their hop ends at the bar, as
  yours would. Tested with a forced trip on two phones: the catch at +0.05 m
  from the bar (was +1.39 m), the stumble 13 ms behind theirs (was 142 ms),
  and drawn within 0.25 m of where they really were all through it. Their
  lean at the line comes from how far their frames lean.
- In a squad meet's or a practice's relay, the legs run on other phones were
  drawn a moment behind (from their frames, `delay` ≈ 0.1–0.3 s: up to 3 m at
  full speed), unless an exchange of yours was placing them. They now carry on
  at their speed to where they are now, legs and all, as the 100m's runners
  do (src/events/meetRelay.js `follow`, src/online/liveTrace.js `ahead`).
  Measured on two phones: 0.17 → 0.02 m behind on average, worst tenth
  0.81 → 0.08 m (with almost no network delay; more on a real one).
- The relay's old live mode (each player a whole team) is gone: nothing could
  reach it since practice became the squad as one team.

## Smooth legs on the other runners, live
- In a live 100m (and a squad meet's) the other runners were drawn a little
  ahead of their replay, so they'd be where they really are, but their legs
  stayed with the replay: still between updates (84% of frames), then a jump
  of up to a quarter stride when one landed. Their legs now carry on with
  them (src/online/liveRun.js `dphase`), moving every frame.

## Tuning: harder to mash, a closer Pro field
- `runner.coastDecel` 4.0 → 4.5 m/s² and `sprint100.targets.missSpeedLoss`
  1.7 → 2.1 m/s: falling behind the pace and wrong-side taps both cost more.
  Mashing costs far more: an alternating masher at 10/s goes 10.35 → 12.42 s,
  while a good reader only loses 0.05 s (8.73 → 8.78 s; tools/simulate.mjs).
- Rivals pay the same for a wrong-side tap as you: `ai.<level>.missSpeedLoss`
  (1.7) and `missLockout` are gone, and the computer reads
  `sprint100.targets` (now 2.1 m/s), so the two can't drift apart again (the
  hurdles keep their own rule for both). Rivals rarely miss, so it barely moves
  their times: Amateur 100m median about +0.05 s.
- `dip.carryDecel` 0.5 → 0.4 m/s²: carrying speed through the lean zone
  costs less.
- `ai.pro.cadence` low end 2.88 → 3.0 taps/s: no slow Pros. Pro 100m median
  9.88 → 9.75 s; the slowest Pro 10.90 → 10.73 s.
- `longJump.stretch.kickY` 1.3 → 1.4 m/s: a bigger stretch hop (good jumper's
  best 7.96 → 8.12 m).
- `poleVault.press.window` 0.18 → 0.2 s: a little more room on the plant.

## The squad's relay, against a practice squad
- A squad's Practice 4×100m relay (2 to 4 squadmates) is now the squad as ONE
  team, each runner on their own phone as in a meet: two take turns (A B A B),
  three have one runner on two legs that aren't next to each other, four run a
  leg each. It used to be every player running a whole team of their own.
- They race the Practice Squad: a computer team in grey that runs like a Pro
  team (about 38 s; `tools/simulate.mjs`). Every phone runs it itself from the
  room's seed on a fixed clock (src/events/relaySim.js), so it runs the same
  race and time everywhere with nothing sent. The results wait up to 10 s
  after your team's finish for it.
- Someone whose phone drops mid-race is run by the computer on the first
  squadmate's phone still there, until they're back.
- Squad meets too: a computer runner standing in for someone now tells the
  taker's phone when it passes. Before, a stand-in handing to a runner on
  another phone always MISSED.

## Same buttons for everyone, live
- In live play (public rooms, Practice and squad meets) everyone in a room
  gets the same 100m targets, hurdle button sets and field-event run-up
  targets, so nobody draws an easier run. Each phone makes them from a seed
  every phone already has (the room or meet, plus the stage:
  src/core/random.js), so nothing extra is sent. A target only changes on a
  hit and a set only at a hurdle, so target 12 is the same for everyone
  whatever their timing. Each relay leg and field round has its own seed, so
  leg 3 is the same for every team. Off line it's random, as before.

## Live play on the meet server
- Live races and squad Practice moved off Firebase's Realtime Database onto the
  meet server (Cloudflare), the same place as squad meets: a Lobby object
  holds the public waiting rooms, each squad's SquadHub its Practice rooms (members
  only, checked on the server now), and a Room object per room passes each
  player's updates on. Same rules as before: 4 a room, the start 10 s after
  the second player, closed 6 s before it. A phone that drops and reconnects
  mid-room is back in instead of gone for good.
- `database.rules.json` is no longer used by the game. Phones still on the old
  build (Pages caches for ~10 minutes) keep using it among themselves.

## One athlete, one tournament
- The lineup is gone: the left tab is now **Athlete**, where you pick one
  athlete who does every event (tap a card and they're yours). The Play tab
  shows them warming up on the track; the intro card shows them but no longer
  swaps them per event.
- No more Team tournament or Solo/Team toggle: just the Tournament, on its
  board (`tournament`, as before). The Team board is hidden; its entries stay
  in the database. Squad meets and Practice use your one athlete in every event.
- Your old lineup stays saved in your progress (unused), in case it comes back.
- The home tabs lost their how-to lines (show, don't tell); messages that answer
  a tap stay.

## Squad meets
- The Squad tab has a 🏟 **Meet** button: squads against squads, live, up to six
  squads of four through the five events and the 4×100m relay
  ([docs/meets.md](docs/meets.md)). The first four to sign up make the squad's
  team; each squad's meet captain (picked at random) presses Ready, and with
  everyone ready captains can Start early with fewer than six squads.
- Every event is four heats (or flights) at once, one athlete from each squad,
  seeded by personal best; you see your heat. Places across every heat score
  10-8-6-5-4-3-2-1; ties share points. The relay is one race, a leg per phone.
- Meets run on a new meet server (Cloudflare Workers + Durable Objects,
  `server/`), which runs the clock: `CONFIG.meet` (new) has its timings.
  `countdown` 8 s from the lock to the first title card, `titleCard` 8 s,
  `eventGap` 15 s from an event's last result to the next start (the live
  tournament's `EVENT_LEAD` is 22 s from everyone being ready), `roundGap` 4 s
  between field rounds (live: `ROUND_LEAD` 6 s), a race's cutoff its
  `maxRaceTime` + `raceGrace` 3 s, field rounds `fieldCutoff` 18 / 22 / 18 s
  (long jump / pole vault / javelin; an attempt not done by then is a foul).
  Bot meets on the local server: 4.6 to 4.7 minutes from the lock to the final
  standings.
- relayRules.js: an exchange can have a computer runner on one side only
  (`aiPass`, `aiTake`) and its taker on another phone (`remoteOut`,
  `remoteHandoff`). A computer team's exchanges are unchanged
  (tools/simulate.mjs gives the same relay times).
- Not live yet: deploy the server (server/README.md) and set `MEET_SERVER` in
  `src/online/net.js`.

## Squad practice, and the 4×100m relay live
- The Squad tab has a big ⚔ **Practice** button, like a Clash Royale friendly
  battle: it opens the events (the five, the 4×100m relay, the tournament),
  and picking one opens a live waiting room only your squad sees. While it's
  open it sits next to the button on every member's Squad tab with **Join**.
  Results say PRACTICE; Race again and Menu go back to the squad.
- Squad rooms are `squadlobby/{squad}/{kind}` in the Realtime Database, the
  same waiting room as `lobby/{kind}` (paste the new `database.rules.json`
  into the console).
- The 4×100m relay plays live for the first time. Each phone sends its team
  frame by frame (all four runners, the baton, held-out batons) at 20 a
  second, and the other teams are drawn from that with the relay's own poses.
  `relay.liveWait` 25 s (the other live races wait 12 s) for slower teams to
  finish, since a missed exchange or two spreads them out. The rules allow
  1000 frame chunks a player (was 400) for a relay that runs past a minute.

## Time trial (Special Events)
- A cycling time trial: 620 m of road (flat, 8% climb, 11% descent, flat, a
  5.5% kick), you against the clock with the rivals as ghosts. Each tap is a
  pedal stroke, left and right in turn; 8 gears (1.9 to 4.0 m a stroke).
- The legs push hardest slowly and give out at `cMax` 8 strokes/s, so power
  (`power` 9 W/kg) peaks at 4 strokes/s whatever the gear: the gear decides
  what road speed that is. Your taps cap how fast the pedals can turn. Hold
  both to tuck (`tuckAero` 0.001 against 0.002 sitting up); both in the last
  20 m throws the bike.
- From the simulator: tapping 4/s with every shift and the tuck right, 50.3 s;
  never tucking 51.4 s; stuck in gear 5 54.7 s, in gear 3 58.2 s. Rivals:
  Amateur median 58.5 s, Pro 51.8 s. Record 49.9 s (the 100m record's pace).
- Special events now say their rival level (AMATEUR / PRO) on the results and
  in your top marks, not TRAINING.

## Progress follows your account
- Signed in with Google, your campaign progress (BEATEN! stamps, Pro
  unlocked), your top five marks on every board and your lineup and solo
  athlete now save to your account (Firestore `progress/{uid}`, private), not
  just the phone. A new phone or cleared data gets them back on sign-in.
- Syncs as you come back to the menu and a few seconds after any of it
  changes. The two copies merge: everything either has beaten, the best five
  marks from both, and the most recently changed lineup.
- Signing out clears them from the phone like your bests (they're your
  account's now). Signing in as a guest puts the guest's progress up.
- The Special Events RIVALS toggle moved into core/storage.js
  (`getSpecialLevel`), so the menu no longer imports the relay scene.
- Needs the new `progress` rule in firestore.rules published in the Firebase
  console.

## 4×100m relay (Special Events)
- A third big button on the home screen, **⭐ Special Events**, opens a list
  of events outside the five: for now the 4×100m relay, against Amateur or
  Pro rival teams (the RIVALS toggle; raced in that level's venue).
- Six teams of four in their captain's kit; you run all four legs of yours
  with the 100m's targets. Each exchange is a blue 20 m zone around the 100 m
  line. Your teammate sets off when you're `checkTime` 1.2 s away and settles
  `closeRate` 1.4 m/s under your speed, so the catch comes around the middle
  of the zone at any pace. One blue button in the middle: PASS (reaching costs
  `reachDecel` 0.9 m/s²), then TAKE, judged on the gap: PERFECT within 0.55 m
  of full reach (1.9 m), GOOD, LATE (inside 0.9 m), or a whiff if they're out
  of reach. No pass by the end of the zone and it's MISSED: you both stop and
  swap there, and the next leg starts from a standstill.
- From the simulator at the 100m record's pace (4.15 taps/s): 33.84 s with
  perfect exchanges, +0.1 s each for good, +0.2 s for late, +1.5 s for missed.
  Rival teams: Amateur median 41.8 s, Pro 38.1 s. Record set to 33.8 s.

## A different place for every mode
- Each mode is played somewhere of its own (`src/render/venues.js`). **Training**
  is a rundown community track: overcast sky, a sun-faded surface worn through
  to dirt in patches, chalk instead of paint, dry unmown grass, rusted blocks,
  and pine woods behind a chainlink fence where the stand would be — nobody
  came. **Amateur** is the school stadium as before: brick-red track, mowed
  stripes, a low stand with gaps all through it. **Pro** is the big one: blue
  track, crisp white paint, a deep stand packed solid under floodlights with
  camera flashes going off, lit LED hoardings, and an evening sky. Live play
  uses Pro.
- A venue is paint and props only. Every one shares `LAYOUT` in
  `src/render/track.js`, so the perspective solve, all five event cameras, the
  late-hit venues and the vault's upward pan are untouched.
- Amateur looks the same as before bar three things: the stand is emptier (1
  seat in 4 rather than 1 in 7 — a school meet), the long jump's infield green
  now matches the track's infield instead of being three points off it, and the
  javelin flight shot's sky matches the venue's so dusk doesn't clash.
- Every venue carries a color for the relay's exchange zones, pale on the Pro
  track because that one is itself blue.
- `node tools/venuecheck.mjs` draws every venue through every renderer and
  fails if one is missing a color a renderer reads.

## Fight the referee
- Long jump and javelin: after your last attempt the referee joins the late
  hits from their spot at the foul line (white uniform, red cap). Leave them be
  and they stay at their post; hit them, or emote in their face, and they come
  after you like a rival, then walk back to their post once they've put you
  down. Works in Training too, where they're the only one to fight.
- Live, they stay painted at the line (every phone would have its own).
- The red cap is a hair style now (`refcap`), so the referee draws the same
  in the event and in a fight.

## Screen fits after launching or rotating
- Opening the home-screen app (or rotating, or coming back to it) could leave
  the game drawn short with a band of background under it, and the top bar
  pushed down for a notch that was now at the side: iOS settles the screen
  size and the notch insets a beat late, and the game measured once.
- The game now measures again a few times after each of those (and when only
  the insets change), puts back any scroll the page picked up, and sizes the
  canvas from the fixed page instead of 100vh / 100dvh.

## Field-event ghosts set off with you
- Long jump, pole vault and javelin: the ghost used to start its run the
  moment the attempt began, and its recording kept however long its player
  stood before their first stride, so it usually ran off before you. Now it
  waits on its mark until you first move, then plays from the moment it first
  moved. Works for ghosts already saved; the 100m and hurdles ghosts were
  already timed from the gun.

## Leaderboard: your own top five
- The Leaderboard opens on **Mine**: your five best marks on every board, the
  five events across and the solo and team tournament scores under them. Each
  mark says who set it, where (Amateur, Pro, Training, Live) and when.
  **Global** is the online boards as before; the toggle is remembered.
- Kept on this phone (`top` in the save), so guests have it too. It starts
  now: your personal best from before shows as "From before". Marks count
  like bests do (shipped tuning only); signing out forgets them with your bests.
- Tap a board on Mine to see it on Global. The Leaderboard buttons are 📊 now.

## Tuning is the owner's only
- The ⚙ Tuning buttons (menu and results) only show for the username
  **rawnald** (`canTune` in storage.js). Usernames are claimed on the server,
  so no one else can take it.
- Everyone else plays the shipped numbers: tuning a tester saved before is
  ignored (and left alone in their storage).

## Event card: Back, and your athlete
- The card before an event (name, records, how to play) has **‹ Back** top
  left, to the menu (**‹ Quit** in a tournament; none in a live one).
- Top right, the athlete doing this event for you, warming up. Tap them to
  pick someone else from all six: it changes this event's lineup slot, the
  same as the Lineup tab. In a solo tournament it shows your solo athlete
  ("Does all five") and can't be swapped; in a live tournament it can't either.

## Pro unlocks after Amateur
- Pro is locked until all of Amateur is beaten, the tournament included. Its
  cards are dimmed with a 🔒, and the row says "🔒 Beat Amateur".
- Tap a locked card and a pop-up says what's left, e.g. "🔒 Pro is locked ·
  Beat the rest of Amateur first: Long jump, Pole vault and the tournament."
  A locked tournament names the events still to beat in the same way.

## Training is just you
- Training has no computer rivals: every event (and its tournament) is you on
  your own, plus your ghost if **Training ghost** is on.
- Campaigns (Amateur, Pro) never have a ghost, not even your best tournament's.
- The Amateur/Pro rivals toggle is gone: a campaign plays its own rivals.
- A race picked from the leaderboard is training too: you and that ghost.
- Training results show no placing (there's no one to place against, unless
  your ghost raced).

## vs Computer: Amateur and Pro campaigns, plus Training
- vs Computer is now three rows of cards, each the five events then the
  tournament (🏆): **Amateur**, **Pro** and **Training**.
- Amateur and Pro are mini campaigns: win an event (first place) and its card
  is stamped **BEATEN!**, in any order. The tournament stays locked (🔒) until
  all five are beaten; win it too and the row reads ★ Complete. A new stamp
  thumps down when you come back to the menu, and the results say BEATEN!.
- A campaign always plays its own rivals; the Amateur/Pro toggle is now
  **Training rivals**, for Training only. Training ticks nothing off.
- Progress is saved on this device (`beaten` in the save). Live races and
  races from the leaderboard never count.

## Easier Amateur rivals
- Amateur rivals were about as good as a good player in the field events
  (Amateur winner 8.25m long jump vs a good player's 7.97m). Now a good player
  beats them everywhere and a casual player is in with a shout. Pro unchanged.
- 100m: `ai.amateur.cadence` [2.6, 3.4] → [2.3, 3.1]: winner median 9.91 → 10.33s
  (casual player 9.72s, novice 10.67s).
- 110m hurdles: `hurdles110.ai.amateur.setReact` [0.45, 0.62] → [0.55, 0.78],
  `tapGap` [0.18, 0.25] → [0.21, 0.3]: winner median 12.65 → 13.54s (casual
  14.41s, good 12.34s).
- Long jump: `longJump.ai.amateur.cadence` [3.0, 3.8] → [2.7, 3.4], `takeoffGap`
  [−0.1, 0.45] → [−0.12, 0.65], `stretchDelay` [0.06, 0.3] → [0.1, 0.4]: winner
  median 8.25 → 7.46m (casual 6.69m, good 7.97m).
- Pole vault: `poleVault.ai.amateur.cadence` [3.0, 3.8] → [2.7, 3.4], `pressErr`
  0.14 → 0.18, `releaseErr` 0.16 → 0.2: winner median 5.30 → 4.98m (casual
  4.52m, good 5.35m).
- Javelin: `javelin.ai.amateur.cadence` [3.0, 3.8] → [2.7, 3.4], `gap`
  [−0.25, 2.2] → [−0.3, 3.0], `angleErr` 14 → 18: winner median 84.2 → 79.6m
  (casual 75.3m, good 83.6m).

## Lineup slots: Info and Remove
- Tap a slot: it lifts with **Info** and **Remove** under it, like a Clash
  Royale deck card. Remove empties it (a dashed slot with a +). The Solo slot
  has Info only.
- Like Clash Royale's "You need to have 8 cards in your Battle Deck!": with an
  empty slot, the Team tournament (vs Computer and Live) is greyed out ("Team ·
  Lineup not full"), and tapping it says "You need a full lineup for a Team
  tournament!" with a **Fill your lineup ›** button. Single events still play
  (your solo athlete does an empty event), and so does a Solo tournament.
- Athlete cards get **Info** next to Use: the athlete running, their tagline,
  height and which slots they're in.
- An emptied slot is saved as empty (null in the lineup), so it isn't filled
  back in the next time you open the tab.

## Lineup like a Clash Royale deck
- Tap an athlete card (it lifts, with **Use** under it), tap Use, then pick the
  slot to put them in: the slots wiggle while you pick, the athlete you're
  placing shows big below, and Cancel (or Esc, or a tap elsewhere) calls it
  off. Tapping a slot picks whoever's in it.
- The "<name> in every slot" button is gone.
- Esc steps back within a tab first (out of picking a slot, or a Play list),
  then goes to Play.

## Leaderboards need Google sign-in
- A guest who opens 🌐 Leaderboard (from the menu, results or tournament
  standings) sees "Connect your account to Google to see the global
  leaderboard" and a **Sign in with Google** button instead of the boards.
  Signing in comes back to the Profile screen, as it does from there.

## Play tab: vs Computer and Live
- The Play tab is two big buttons, **🤖 vs Computer** and **🌐 Live**, over
  your lineup warming up on the track (tap it to go to the Lineup tab), instead
  of two rows of twelve event buttons.
- Each opens its list: the tournament and the five events, three to a row, with
  that mode's settings. Rivals and Ghost are only in vs Computer (live races
  have neither); the Solo/Team tournament toggle is in both.
- ‹ Back or Esc returns to the buttons; Menu after a race comes back to the
  list you raced from.

## Joining from an invite in two steps
- An invite link now opens an invite screen: "Zach invited you to join
  Speedsters", who's in it, a box for your username and one **Join** button,
  which saves the name and joins. Then "You're in Speedsters!" and **Let's go**.
  No more going to Profile first.
- Already have a username: it's filled in. In another squad: it says you'll
  leave it, and Join does both. A taken name or a full or closed squad is
  explained right there.
- Invite links say who sent them (`&from=`). The Squad tab's invite card opens
  the same screen.

## Squad leaders can kick members out
- The leader taps a member on the squad's page (each shows a ✕), confirms, and
  they're out. They can join again later. The kicked player's Squad tab says
  "You're no longer in <squad>."
- New rules in `firestore.rules` (publish them in the Firebase console): only
  the leader, one member at a time, and the leader clears the kicked player's
  squadmembers link in the same transaction.

## Squad invites
- 📨 **Invite** on your squad's page: the phone's share sheet with a link to the
  game (`?squad=<name>`), or the link copied where there's no share sheet.
- Opening an invite link starts on the Squad tab with that squad at the top
  (YOU'RE INVITED), with Join and ✕. It's remembered until you join a squad or
  dismiss it. No rules change: joining works as before.

## Home screen tabs and squads
- The menu is now a Clash Royale style home screen with three tabs along the
  bottom: **Lineup | Play | Squad**. Tap a tab or swipe sideways; the panels
  slide. Play is the old menu (minus the Lineup button); Lineup is the old
  lineup screen, now one swipe to the left.
- **Squads** (the right tab): start one, find one by name or in the list of the
  biggest, join it, leave it. Up to 30 players, one squad at a time; needs a
  username. Firestore `squads/` and `squadmembers/`, with new rules in
  `firestore.rules` (publish them in the Firebase console).
- Profile's Menu button is now Back, and returns to the tab you came from.

## Juno a stick figure again, for now
- Juno is a stick figure like everyone else, so the athletes all match. Her
  drawn art stays (src/athletes/sprites/juno.png + .json, art/juno/, rig.html):
  add `sprite: 'juno'` back to her colors in roster.js to bring it back.

## Juno, drawn
- Juno is a drawn cartoon sprinter in the 100m and hurdles (parts drawn by an AI
  image generator from tools/art-prompts.md, originals in art/juno/, rigged with
  tools/rig.html). Rivals, the other events and the menus are still stick figures.
- rig.html takes several sheets at once (matching their scales), guesses each
  part's joints, and can cut off what shouldn't show past a joint (the cut-off
  ends of limbs, a second wristband).

## Sprite rigger for drawn athletes
- tools/rig.html: drop in drawn body parts (one sheet or a file per part), click
  each part's two joints, watch it run on the real skeleton, download the
  sprite sheet. Clears a white, green or fake-checkerboard background.
- Drawn parts are fitted between their two joints, so AI-drawn limbs that come
  out a little long, short or tilted still line up.
- tools/art-prompts.md: prompts for having an AI image generator draw Juno's parts.

## Ready for drawn athletes
- Juno is a stick figure again (the Blender version is in commit c3d3986).
- Lane races (100m, hurdles) can draw an athlete from a sheet of drawn body
  parts instead of the stick figure: give the athlete `sprite: '<name>'` in
  roster.js and add src/athletes/sprites/<name>.png + .json. See
  src/athletes/sprites/README.md. Faces change with the race: focused at the
  line, straining while running, a grin for the winner and shock for the rest
  (and on a clipped hurdle).

## Late hits: the track left clear
- Race again (or Next) and Menu (or Quit) moved from under the results down to
  the ad boards along the bottom, so they no longer sit over the fighting. The
  results stay up top over the stands; Menu / Quit is solid so it reads over
  the boards, and the how-to line is hidden while they're up.
- No more POW! / WHAM! / KO! / GOTCHA! / SLAM! over hits.
- Emotes no longer show an emoji over the head; HA HA! and BAWK! stay.

## Late hits: straight from the finish
- No jump into the late hits any more: they start inside the event, the moment
  you've pulled up after the line (or got to your feet after your last
  attempt), with you and the camera exactly where you are. Each rival joins as
  they come to a stop, so the first one home gets the first hits in. After a
  field event the rivals walk over from off screen.
- The fight controls only appear once you've stopped.
- The results (or tournament standings) come up big in the middle, over the
  event, on a light see-through panel with Race again (or Next) and Menu (or
  Quit) under it. The event carries on under them: stragglers still pulling up.
- A field event's last mark no longer waits for a tap: it shows for about 2 s,
  then the results come up (the javelin goes back to you at the line first).
- Everyone stands and walks normally, hands down, until a fight starts: a move
  or a hit puts the fists up for 5 s after the last one, and an angry rival
  keeps them up.
- Live: another player turns up when their phone starts its late hits, and
  walks over from where they were in the race.

## Late hits: rivals wait for you to start it
- The computer rivals no longer brawl from the start, with you or each other:
  they stand about and stroll. Hit one, or emote within about 2 m of one, and
  that rival comes after you until they put you down; then they gloat with an
  emote and calm down. Rivals never fight each other.
- The screen after an event is just the venue now: no dark overlay, no big
  results page to tap away. The results (or the tournament standings) sit
  small in the top left on a light see-through panel, Race again (or Next, or
  the live countdown) and Menu (or Quit) sit in the top right, and you can
  walk and fight straight away. Your mark, best and stats, Leaderboard and
  Tuning are gone from that screen; Leaderboard and Tuning are on the menu.

## Late hits
- After every event (on its own or in a tournament) you stay where it finished,
  past the finish line or round the pit, with everyone who took part, and you
  can punch, kick and body slam them, or emote, until the next one. Nothing
  counts. Idea borrowed from NFL Blitz.
- The results come up first over the venue; tap off their buttons (or wait 6 s)
  and they fold into a bar at the top: Results, the main button (Next, Race
  again, the live countdown) and Menu or Quit.
- Controls: drag on the left to walk; PUNCH, KICK, SLAM on the right; hold the
  😀 button and drag to an emote on the wheel (Flex, Dance, Come on, Laugh,
  Dab, Chicken). Three punches in a row knock someone down; a kick or a slam
  always does.
- Hits leave black eyes, bruises, a bloody nose, a cut or blood on the shirt,
  kept until you go back to the menu.
- Offline, the computer rivals fight back (no more than two on you at once) and
  brawl among themselves (changed since: see above). Live, it's the other players.
- Live tournament: 22 s (was 14) from everyone finishing an event to the next
  one's start, so there's time for it. Publish the new `database.rules.json`
  (Realtime Database > Rules): live play sends where you are and who you hit.

## Lineup, solo and team tournaments
- The menu's Athlete button is now **Lineup**: a slot per event, each filled
  with any athlete (the same one or different ones), plus a Solo slot for the
  athlete who does a whole solo tournament. Everyone starts with the athlete
  they had picked in every slot. Looks only for now: same physics for all.
- A **TOURNAMENT** toggle on the menu: **Solo** (one athlete, all five) or
  **Team** (your lineup). It applies to the offline and live tournament buttons.
- Separate leaderboards: the old tournament board is now the Solo board (its
  entries carry over) and there's a new Team board. Best tournaments and their
  ghosts are kept per kind.
- Live play sends your lineup, so the others see who you picked for each event.
- Publish both `firestore.rules` (new `teamtournament` board) and
  `database.rules.json` (new `teamtournament` waiting room, `lineup` field) in
  the Firebase console.

## Leaderboard without the name button
- The leaderboard screen no longer has a button with your name: your name is
  changed on the Profile screen only (a change still renames your entries on
  every board).

## Sign in with Google from the home screen
- Sign in with Google now goes to Google's page and comes back, instead of a
  popup, which hung on "Signing in…" when the game ran from an iPhone's home
  screen.
- Add `https://zacherikson.github.io/track-and-field/` to the Authorized
  redirect URIs of the "Web client (auto created by Google Service)" in Google
  Cloud console > APIs & Services > Credentials.

## Sign in with Google
- Profile has an Account panel. Everyone starts as a guest (an online ID for
  this phone only); Sign in with Google keeps that same ID, so your username,
  bests and leaderboard entries stay, and signing in on another phone plays as
  you there.
- If that Google account already has a player (you signed in on another phone
  first), this phone switches to it and reloads; what it did as a guest stays
  with the old guest ID.
- Only signed-in players go on the online leaderboards. Guests still play
  everything (live play too) and keep their bests on the phone; signing in
  posts them.
  Entries posted by guests before this stay until you delete them in the
  console (or their players sign in, which makes them theirs).
- Sign out turns the phone back into a new guest (new made-up name, bests
  cleared) until you sign in again.
- Turn on Google in Firebase console > Authentication > Sign-in method, and
  check `zacherikson.github.io` is in Authentication > Settings > Authorized
  domains. Then publish the new `firestore.rules` (Firestore Database > Rules).

## Live for every event and the tournament
- The menu has two rows of events: OFFLINE (against the computer) and ONLINE
  (live against people). The ⚡ Race live button is gone; the Online row's
  100m Dash is the same thing.
- Every event and the tournament has its own waiting room.
- Hurdles: everyone's gun fires together, as in the 100m.
- Long jump, pole vault, javelin: each round starts on every phone at once, so
  you run up together with the others drawn on your runway. Once everyone's
  attempt is over the next round counts down (6 s) and starts by itself.
- Live tournament: the same people through all five events. Once everyone has
  finished an event, the standings count down to the next (14 s, the last few
  on its title card) and it starts by itself. Standings show the other players
  in gold.
- Nobody taps to go on in live play; anyone still playing 20 s after the first
  player finished is left to catch up.
- No computer rivals in live play (the 100m had them), so every phone shows
  the same results and the same champion. In live play you're shown by your
  username, as the others see you.
- Publish the new `database.rules.json` in Firebase console > Realtime
  Database > Rules: the old rules only allow the 100m.

## Race live
- ⚡ Race live on the menu: a waiting room for a 100m against other people. When
  a second runner joins, a 10 s countdown starts (up to 4 runners); everyone's
  gun fires at the same moment, with computer rivals in the spare lanes.
- The others' runners are replayed from their taps as they arrive, so every
  phone gets the same times; they're drawn a step ahead of the last update so
  they look right beside you. Someone who quits shows as "(left)" and DNF.
- Live marks count for your personal best and the leaderboard like any 100m.
- Live races use the Realtime Database: publish `database.rules.json` in
  Firebase console > Realtime Database > Rules.

## "Online" is now "Leaderboard"
- The 🌐 Online buttons (menu, results, tournament standings) are now 🌐 Leaderboard.

## Personal bests come from the online boards
- Your best at each event is your entry on its online board. The phone keeps a
  copy for offline play and catches up with the boards whenever you're back at
  the menu (one request for all six). Clearing a board resets the bests, ghosts
  and best tournaments that came from it.
- Marks are kept to the hundredth of a second or metre, exactly as shown, so
  two marks that look the same are the same (8.89 no longer "beats" 8.89).
- Runs with changed tuning don't count as a personal best (they already
  weren't posted).

## Online marks post again; tidier loading screen
- A new best in the long jump, hurdles, pole vault or javelin now reaches the
  online board even if its recording can't be uploaded with it. The results
  screen says when the ghost didn't go up, and why.
- Recordings are uploaded as one compact string of numbers instead of a long
  list (about 37 KB for a pole vault), which Firestore handles far better.
- The online screen puts its tabs and buttons in place straight away and shows
  placeholder rows while a board loads (they used to pile up in the corner).
- `firestore.rules` changed: publish it again in the Firebase console.

## Faster online leaderboards
- Boards are read straight from Firestore's REST API instead of through the
  Firebase SDK, so opening one no longer waits for the SDK download, sign-in
  and connection setup first. Your own entry is fetched at the same time as
  the top 10.
- Boards you've already opened show instantly when you switch back, then
  refresh.
- Race buttons download a recording the same way.

## Ghosts in every event, and your best tournament
- GHOST on the menu now works in every event, not just the 100m. Hurdles: your
  best race runs in the lane next to you. Long jump, pole vault, javelin: your
  best attempt runs on your runway (with its pole or javelin), starting when
  each of your attempts starts.
- These ghosts are recorded frame by frame (the 100m keeps its exact replay).
- Tournament: with GHOST on, each event races your best tournament's attempt
  at it, in your own lane so the five rivals stay. The standings say how many
  points you're ahead of or behind your best tournament. Your first finished
  tournament is kept as the best one until you beat it.
- Online: every event's board has Race buttons on marks posted from now on
  (their recordings are stored separately and downloaded when you tap Race).
- `firestore.rules` changed: publish it again in the Firebase console.

## Online leaderboards for every event
- 🌐 Online now has a tab for each event (100m, Long jump, Hurdles, Pole vault,
  Javelin) and one for Tournament points. ← → switch tabs on a keyboard.
- Finishing any event posts your mark to its board if it beats your mark
  there, in a tournament too. Finishing a tournament posts your total to the
  Tournament board; its final standings have a 🌐 Online button.
- Your fastest 100m from a tournament now counts as your ghost too.
- The menu lists the events in tournament order: 100m, Long Jump, 110m
  Hurdles, Pole Vault, Javelin.
- `firestore.rules` changed: publish it again in the Firebase console.

## Profile and unique usernames
- 👤 button at the top right of the menu (showing your name) opens your
  Profile, where you change your username. The name button on the online
  leaderboard opens it too.
- Usernames live in a users database in Firebase (`users/{uid}`), and each
  name is claimed in `usernames/` so no two players share one (ignoring case).
  A name that's taken is refused; changing name frees your old one and renames
  your leaderboard entries.
- Names: up to 16 characters, letters and numbers plus spaces and _ . ' -
  inside. You keep the "Runner" name until you pick one.
- `firestore.rules` changed: publish it again in the Firebase console.

## Ghost toggle
- New GHOST On/Off toggle on the menu, next to RIVALS, remembered on this
  device. It starts Off: your best 100m run only races as a ghost when you turn
  it on. A ghost picked with Race on the online leaderboard still races either
  way.

## Ghosts and an online leaderboard (100m)
- Every 100m run is recorded (its strides, stumbles and lean, plus the physics
  numbers). Your fastest run on the phone races in the lane next to you as a
  see-through ghost called "Your best", replacing one rival.
- 🌐 Online (menu and results screen): the fastest runs from every player,
  via Firebase. Finishing a 100m posts your run if it beats your time there,
  and the results screen shows your rank. Tap Race on a row to race that run
  as a ghost; going back to the menu returns to racing your own best.
- Tap your name on the leaderboard screen to change it (up to 16 letters). It
  starts as "Runner" and four random digits.
- Runs made with changed tuning are kept as your local ghost but not posted.
- `tools/ghostcheck.mjs` checks that recorded runs replay to the same time.

## Step 8: Tournament mode
- New 🏆 Tournament button on the menu: all five events back to back in the
  order 100m, Long Jump, 110m Hurdles, Pole Vault, Javelin, against the same
  five rivals.
- Scored like a real decathlon, with the official World Athletics tables
  (`src/events/scoring.js`): 100m and hurdles `A·(B − time)^C`, jumps
  `A·(cm − B)^C`, javelin `A·(m − B)^C`. No mark / DNF scores 0. Our marks land
  in the same range as real decathletes: about 1000–1400 per event.
- After each event: this event's marks and points, and the overall standings
  with running totals. The intro card shows the event number and your points.
  After the javelin: the champion, your points per event, final standings.
  Your best tournament score is saved and shown on the menu button.
- Personal bests still count in a tournament. Leaving to the menu (✕ or Quit)
  ends the tournament.

## Step 7.3: Joey two-thirds height
- Joey's `colors.height` 0.5 → 2/3. His tagline now ends ", bald." (his
  brown hair is unchanged). His hurdle hop scales down with the smaller gap.

## Step 7.2: Joey (half height)
- Brix is replaced by **Joey**: blue shirt, brown hair, fair skin, and half
  everyone's height (new `colors.height` 0.5; `heightOf()` in roster.js).
  Looks only: same physics.
- The height is applied everywhere he's drawn: lane races (with his start
  position adjusted so his hands still sit at the line), long jump (his hips
  start lower), javelin (the javelin stays in his hand), pole vault (he grips
  the pole lower, so the plant, swing and bar clearance scale with him), the
  menu runner and the picker.
- Hurdles: he'd have run straight through a bar taller than his hips, so a
  short athlete now bounces up over each hurdle (`liftFor` in hurdles110.js),
  shadow on the track.
- If your saved athlete was Brix you start as Juno; pick again.

## Pages deploy: no more stale code on phones
- GitHub Pages lets browsers reuse files for 10 minutes, so after a deploy a
  phone could load the new page with old cached game code (or a mix). The
  deploy now also copies `src/` to `v/<commit>/src` and points index.html at
  it, so every deploy has fresh file addresses and nothing old is reused.

## Step 7.1: Chan and Chonk, Juno's hair
- Tanabe is now **Chan** (straight black fringe, new `fringe` hairstyle).
- Moreau is now **Chonk**: a big, round build (new `colors.girth` 2.3 in
  drawFigure: thicker limbs, wide torso, round belly and cheeks). Looks only.
- Juno's hair was reading as yellow (the headband arc covered the crown). Now:
  dark hair with a topknot and a thin yellow headband across the forehead.
- If your saved athlete was Tanabe or Moreau you start as Juno; pick again.

## Step 7: character selection
- Six athletes: Juno, Brix, Okoro, Lindqvist, Tanabe, Moreau (now Chan and Chonk, 7.1). Pick yours from
  the ATHLETE button on the menu (next to RIVALS); the other five are your
  rivals in every event. Remembered on this device (`character` in the save).
- Each has a kit, skin tone and hairstyle so they read apart at a glance:
  headband (Juno), spiky, afro, ponytail, bun, short (`colors.hair`,
  `colors.style`, drawn by drawFigure). Looks only: same physics for everyone.
- The picker: a card per athlete (yours runs in place), a one-line tagline,
  Ready to go back. Arrow keys work on desktop.

## Step 6.3: pole vault release lines up with the spark reaching your hands
The best release felt like the spark about 2/3 up the pole, for two reasons:
~0.15-0.2 s between seeing the spark arrive and your finger actually leaving
the screen (reaction plus the phone's display delay) is a third of the 0.6 s
climb, and the spark sped up near the ends of the bent pole.
- New `poleVault.release.lead` 0.15 s: the sweet spot is now 0.15 s after the
  spark reaches your hands (0.75 s after the press), so letting go as you see
  it arrive is right. On the tuning panel as "Release delay allowance".
  Rivals and the simulator use the same target: heights unchanged (good
  5.36m, expert 6.22m; Amateur winner 5.31m, Pro 5.95m).
- The spark now travels at an even speed along the pole (by length, not by
  the curve's parameter).

## Step 6.2: bigger hurdle buttons
- `hurdles110.buttons.radius` 54 → 64 (about 20% bigger), `y` 0.24 → 0.25 so
  they still clear the top of the screen.

## Renamed to Track Royale
- The game is now called Track Royale: menu title, page title, home-screen
  name (manifest), the "plays in landscape" notice, the trackside board and the
  tuning export header.
- localStorage keys renamed to `trackroyale.v1` and `trackroyale.tuning.v1`.
  On first load, anything saved under the old `thumbathlon.*` keys is moved
  over, so personal bests and tuning survive the rename.

## Step 6.1: javelin landing is the end of the flight shot
- No separate landing shot. The flight shot follows the javelin all the way
  down until its tip goes into the grass (it sticks at the angle it came down,
  quivering, with a little spray of turf). Then a line draws across the field
  at the spot, with the distance on it (red and FOUL for a foul).
- The ▶▶ button (during the flight) skips straight to that: the javelin stuck
  where it landed and the line.
- README: the javelin's landing shot is gone from the renderer notes.

## Step 6: Javelin
From footage of the original, frame by frame.
- **Three throws**, best counts, against five rivals. World record 104.80m,
  as on the original's intro screen.
- **Run-up** (50m): the 100m's green targets, javelin carried level over the
  shoulder at head height, throwing hand by the ear.
- **Throw zone** (`javelin.zoneDistance` 20m): the runway's edge stripes turn
  yellow then red, the pads turn orange and blink, strides stop.
- **Press and HOLD both:** the pads turn to rings (as in the original), the
  throwing arm is drawn straight back and the javelin's tip rises
  (`angle.start` 8° at `angle.rate` 22°/s) while you keep running; sparks
  stream from its tail.
- **Let go** to throw: brace, arm over the top, fold forward and drop onto the
  hands. Best angle `angle.best` 36°. Measured from the foul line: let go past
  it, or reach it still holding, and it's a FOUL (red flag).
- **Flight shot:** the camera follows the javelin; the stands sink (hills,
  sea, sails and clouds behind), distance boards slide past, live distance at
  the top, fast-forward button to skip.
- **Landing shot:** looking down the field: sector lines, arcs every 10m,
  distance boards and the red WR board, the javelin stuck in the grass.
- Distance = (`distance.base` 89 + `perMps` 8 × (speed − 11)) × angle
  efficiency − the gap. Simulator: casual 75m, good 83m, expert 94m,
  near-perfect 99m; Amateur winner 85m, Pro winner 92m.
- Sprites: javelin keyframes in `JAVELIN_POSES`, drawn in `tools/sprites.html`.
- Tuning panel: a Javelin group.

## Step 5.4: pole vault layout and swing from real vaulting references
Checked against a phase diagram and a sequence photo of a real vault, with a
new flat side-view tool (`tools/vault.html`).
- **Pole drop:** the tip no longer dips to the track early. Through the plant
  zone the pole turns to aim at the box and the tip stays on the line from the
  hands to the box, sliding in at the plant.
- **Layout:** takeoff was 4.7m from the bar; now about 3.7m, as in real
  vaulting. `pole.length` 4.6 → 4.0m (plant 3.46m before the box),
  `uprightX` 0.6 → 0.25m past the box, the mat starts right at the box
  (`mat.from` 0.4 → 0), `landX` 1.8 → 1.3m.
- **Swing:** keyed on the real phases (takeoff, swing, rock back, L,
  extension, inversion): pole angle, bend and body angle each follow their
  own track, so the hips rise steadily toward the box instead of jumping
  forward and then going straight up. `swing.bend` 0.22 → 0.3.
- Heights unchanged within noise: good 5.32m, expert 6.22m; Amateur winner
  5.25m, Pro winner 6.00m.

## Step 5.3: pole tip up on the run-up
- `poleVault.pole.carryAngle` −0.2 → 1.05 rad: the pole is carried tip high
  (about 60°), hands at the hip and chest, like a real vaulter. It drops
  through the plant zone until the tip reaches the box at the plant.

## Step 5.2: pole vault poses traced from the original, longer run-up
Traced frame by frame (20 fps, zoomed on the athlete) from footage of the
original and checked the same way in our game.
- **Run-up** 40 → 55m (`poleVault.runway`). The pole is carried at the face,
  tip down toward the track (`pole.carryAngle` 0.8 → −0.2), and sticks out
  behind the hands (`pole.overhang` 0.45m). Plant speeds: casual 9.7, good
  10.7, expert 12.1 m/s.
- **Plant:** arms stretched overhead to the pole, leaning in behind it.
- **On the pole:** lying back under the top of the pole, head toward the
  runway, knees drawn up while it bends (it bends slowly at first now),
  then the legs swing up to upside down.
- **Off the top:** the vaulter turns to face the bar (the figure is mirrored
  from here, new `flip` in drawFigure): upside down, tipping over, then face
  down over the bar with the legs dangling, **hanging there** a moment as in
  the original. Timed like the original rather than by gravity:
  `poleVault.flight` { rise 0.4, hang 0.5, fall 0.5 } s.
- **Down:** drops upright with the arms up, lands on the back with the legs
  up, legs come down, sits up, rocks onto the feet, stands.
- Heights: casual 4.43m, good 5.37m, expert 6.21m, near-perfect 6.78m;
  Amateur winner 5.26m, Pro winner 5.99m (both sides moved together).

## Step 5.1: pole vault animation fixes (from frame-by-frame captures)
- The body now hangs from the top of the pole by its hands, so the hands stay
  on the pole through the whole swing (before, the hips were placed on their
  own and the hands floated off the pole).
- One continuous swing, no pause: hang, swing under, rock back with the knees
  to the chest, extend up the pole upside down. The hips move forward the whole
  way (before, they slid 0.6m back toward the runway, then lurched forward).
- The pole rises only as far as the vault is good (upright for a good vault,
  low for a weak one), aimed for a perfect release until you let go. A weak
  vault only gets partway upside down.
- Off the top: push, face down over the bar with the legs already over, then
  roll onto your back and land on the mat legs up, lie there, sit up, stand.
  (Before, the body spun a full turn the wrong way.)
- Hands come up for the plant over the last two strides only.
- The live height in the air never shows more than your mark.

## Step 5: Pole Vault
From footage of the original.
- **Three vaults**, best height counts, against five rivals. World record
  6.95m, as in the original.
- **Run-up** (40m): the 100m's green targets, carrying the pole up in front.
- **Plant zone** (`poleVault.zoneDistance` 12m before the plant): the pads turn
  orange and blink, strides stop, the pole comes down and a **spark** runs from
  your hands to its tip. It reaches the tip as the tip plants in the box.
- **Press and HOLD both** at the plant: plant quality falls to 0 at
  `press.window` 0.18s either side. No press within `press.miss` 0.35s: you
  come off the pole, **NO HEIGHT**.
- While you hold, the spark **climbs back up** the pole (`spark.climbTime`
  0.6s). **Let go** as it reaches your hands: release quality falls to 0 at
  `release.window` 0.18s either side.
- **Height** = `height.base` 1.4 + `perMps` 0.4 × (plant speed − 9) + `gain` 4.0
  × (half plant + half release quality).
- The vault: the pole bends as you swing up it, you go upside down, push off
  the top, arch over the bar and drop onto the mat. The camera rises with you.
  The uprights show heights, the world record and your last vault, with the
  bar at your best.
- Simulator (best of 3): casual 4.71m, good 5.49m, expert 6.20m, near-perfect
  6.72m. Amateur winner 5.41m, Pro winner 6.04m.
- Tuning panel: a Pole Vault group (plant zone, windows, spark climb, height
  rewards, swing look).
- Input: scenes can now ask for finger lifts and key releases (holds);
  the other events are unchanged.

## Step 4.13: lower arc, bigger hop, longer stretch window (tuning panel)
Tuned on the phone:
- `longJump.flight.heightScale` 1.8 → 1.5 (look only).
- `longJump.stretch.kickY` 1.2 → 1.3 m/s: a bigger double-jump hop.
- `longJump.stretch.window` 0.75 → 0.95s: more time to press, and a given
  reaction time loses less.
- Everyone goes about 0.15–0.2m further, rivals included, so the balance
  between you and them is unchanged: good player 7.97m, expert 9.37m, never
  stretching 5.69m; Amateur winner 8.15m, Pro winner 9.14m.

## Step 4.12: faster flight (tuning panel)
- `longJump.flight.slowMo.rate` 0.7 → 0.9 (tuned on the phone): a flight
  now takes about 1.05–1.2s, top of the jump at about 0.47s.
- Faster flight means the arc collapses sooner in real time, so a late press
  cost more (marks down about 0.1m). `stretch.window` 0.65 → 0.75s puts
  them back: good player 7.79m, expert 9.19m, never stretching 5.71m;
  Amateur winner 8.02m, Pro winner 9.02m.

## Step 4.11: long jump sprite sheet traced from the original
Juno's long jump is now a set of keyframes traced frame by frame from footage
of the original (our own stick figure, not its art), in `JUMP_POSES`, and
`tools/sprites.html` draws them as a sprite sheet.
- Up to the top: **plant** (knee drive, arm punching up), **arch** (body
  arched back, both arms overhead, feet trailing), **hang** (arms straight up,
  legs dangling).
- Stretch: **snap** (knees to chest), **dive** (jackknife, reaching for the
  toes), **glide** (legs thrust out, arms stretched forward), **contact**
  (heels in). Timing in `longJump.anim`.
- Landing: **sitSand** in a white burst of sand, momentum **rolls you back**
  (legs up, arms flung back), **sit up**, **squat**, stand.
- No stretch: tuck, crouch, face down (as before).
- `flight.airStrides` 1.5 → 0: the original hangs arched back rather than
  running in the air. `flight.heightScale` 1.5 → 1.8: up among the crowd at
  the top, as in the original, as high as fits on screen. Sand splash is
  white and bigger.

## Step 4.10: long jump settings in the tuning panel, livelier flight
- Tuning panel: two new groups.
  - **Long Jump: flight:** air speed (slow motion), arc height, running in the
    air, takeoff lift, forward speed kept.
  - **Long Jump: stretch:** stretch hop, glide speed, window, no-stretch
    collapse, landing slide, sand splash, takeoff zone.
- New `longJump.flight.airStrides` 1.5: the legs keep cycling (hitch kick) on
  the way up instead of freezing in one pose.
- New `longJump.landing` { slide 0.6 m, slideTime 0.3 s, splash 24 }: after
  a stretched landing you slide on through the sand trailing sand, with a
  bigger splash (was 16 puffs). Look only: the mark is where the heels went in.

## Step 4.9: arcs like the original (collapse vs. mini double jump)
Arcs sketched from the original: all the same up to the top of the jump, then
- **no stretch:** the arc collapses. Past the top your forward speed dies
  (`jump.collapse.keepX` 0.5 of it is left) and you drop steeply, landing
  about half as far past the top as the rise took. That's about 2/3 of a good
  jump overall.
- **stretch at the top:** a mini double jump. A little hop up
  (`stretch.kickY` 0.5 → 1.2 m/s) and a long flat glide at
  `stretch.carryX` 0.8 of your takeoff speed (replaces `kickX`), landing
  about 1.4x as far past the top as the rise. The later you press, the more
  you've already crumpled.
- Higher, as in the original: `jump.liftBase` 2.4 → 3.6 m/s (hips rise about
  0.9 m instead of 0.5 m), `jump.keepX` 0.9 → 0.8. `flight.heightScale`
  2.2 → 1.5 so the top of the jump still stays on screen (at the ad boards).
- Timing: the higher jump takes longer, so `flight.slowMo.rate` 0.55 → 0.7
  keeps a flight at about 1.3–1.5s, top at about 0.6s. `stretch.window`
  0.35 → 0.65 real s: pressing late costs you twice (weaker stretch, more
  crumpled), so the window is longer.
- Marks: good player 7.82m, expert 9.22m, casual 6.54m; never stretching
  5.70m (was 6.87). Amateur winner 8.04m, Pro winner 9.04m.

## Step 4.8: slow-motion flight, higher arc
The jump felt over too fast. In the original you go higher and the game seems
to slow down as you leave the board, which exaggerates the flight and gives
you time to see the top coming.
- New `longJump.flight.slowMo` { rate 0.55, ramp 0.15 }: just after takeoff
  the clock eases down to 0.55x, so a flight takes about 1.3–1.4s instead of
  0.75s and the top of the jump comes at 0.5s instead of 0.3s.
- New `longJump.flight.heightScale` 2.2: the arc is drawn 2.2x higher (the
  hips rise about 1 m instead of 0.5 m).
- Looks only: the physics is unchanged. `stretch.window` stays 0.35 real s,
  so reacting is no easier; you just see the top coming. `stretch.kickX`
  0.8 → 0.75 m/s. Marks within about 5 cm of before: good player 7.90m,
  expert 9.22m, Amateur winner 8.08m, Pro winner 9.01m.

## Step 4.7: the stretch throws you forward; no stretch, you crumple
From a replay of the original: the jumper who stretches at the top of the jump
throws himself forward and lands far out; the one who doesn't crumples into a
ball, lands short and flops face-first into the sand.
- **Stretch** (press both at the top): a mid-air kick from that moment,
  `stretch.kickX` 0.8 m/s forward and `kickY` 0.5 m/s up (times the stretch
  quality: the later you press, the weaker), then legs thrust out in front
  (`jump.reach` 0.45 → 0.6 m ahead of the hips). The body really flies further;
  before, only the number changed (`stretch.bonus` 0.5 m, removed).
- **No stretch:** past the top you tuck up, hit the sand in a crouch sooner
  (`jump.collapse.landDrop` 0.4 m) with your feet under you (`collapse.reach`
  0), then flop forward onto your face in a puff of sand, and get up.
- The pads stay up for `stretch.window` (0.35s) and a press after that is
  ignored (was `stretch.show` 0.45s, where the last 0.1s did nothing).
- Marks: a good player still gets about 7.85m, an expert 9.15m (was 8.96).
  A good player who never stretches: 6.86m. Pro rivals stretch a little later
  (`stretchDelay` [0.03, 0.16] → [0.06, 0.2]) so their winner stays about
  8.95m; Amateur winner about 8.04m, unchanged.

## Step 4.6: slower 100m rivals
- `ai.amateur.cadence` [2.8, 3.6] → [2.6, 3.4]: median rival 10.13 → 10.39s
  (target 10.4).
- `ai.pro.cadence` [3.15, 3.95] → [2.88, 3.68]: median rival 9.56 → 9.85s
  (target 9.85).
- 100m only: hurdles and long jump rivals have their own settings.

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
