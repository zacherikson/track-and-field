# Squad Meets: design

A **meet** is squads against squads, live. Up to six squads, four athletes
each, through the five events in order and then the 4×100m relay. Every lane
is a squad. Each event runs as four heats (or flights) at the same moment,
one athlete from every squad in each, and you only see your own heat. Places
are ranked across all the heats and score for the squad. The relay is one
race with every squad in it: the finale.

Target: a meet in about 5 minutes, never more than 6 to 7.

This is the plan to build it. It also moves live play off the Firebase
Realtime Database onto a game server (Cloudflare), because the meet needs
things the current live setup can't give it (see "Why the live layer moves").

## Decisions

| Question | Decision |
|---|---|
| Who competes | Exactly 4 members per squad. The first 4 to sign up, like a Clash Royale friendly battle. A squad needs all 4 to compete. |
| How many squads | 2 to 6. |
| Starting | Each squad gets a randomly picked **meet captain**. Captains press **Ready**. Six squads all ready: the meet starts. Two or more, all ready: captains get **Start early**, and if every captain presses it the meet starts with the squads that are there. |
| Heats | Heat k has one athlete from every squad. All heats start together. You see only your heat. |
| Scoring | Places across all heats: 10, 8, 6, 5, 4, 3, 2, 1 for 1st to 8th. The relay scores the same way (6 teams at most, so 10 to 3). |
| Order | 100m, long jump, 110m hurdles, pole vault, javelin, then the 4×100m relay. |
| Dropping out | DNF for that individual event, no points. You can rejoin for the next event. |
| Relay with someone missing | A randomly picked teammate runs again. |
| A relay runner's phone drops mid-race | A computer runner with Amateur settings finishes their legs, on a teammate's phone. |
| Late hits | Kept, during the results between events (none after the relay: the final standings come up). |
| Async play / ghosts | No. Meets are live only. |
| Server | Cloudflare Workers + Durable Objects. |

## Status

Built: the server ([server/](../server/README.md)), the Meet button and screens,
all five events and the four-phone relay. Tested with the rules' unit tests,
bot squads against the server running locally (`server/tools/bots.mjs`), and
real browsers playing with bots (including two browsers sharing a relay,
with 150 ms of added lag, and a phone dropping mid-relay). Not deployed yet:
see server/README.md, then set `MEET_SERVER` in `src/online/net.js`.

Practice and public live rooms are on the same server. Not built yet (later
phases below): the server replaying the 100m to check times, meet history and
squad records in Firestore, load tests at scale.

## Why the live layer moves

Live play today (`src/online/live.js`) is phones coordinating through the
Realtime Database. That proved live play works. It doesn't hold up for meets,
or at scale:

- **Write ceiling.** Each phone writes about 10 times a second (`SEND_EVERY`).
  A 24-player meet is about 240 writes a second, and Firebase documents
  roughly 1,000 a second per database. About four meets at once would hit the limit.
- **The phones schedule the meet.** Every phone works out stage starts from
  everyone's ready times (`startOf`), so a slow phone holds everyone up for
  as long as `READY_WAIT` (20 s). This is most of today's waiting.
- **Matchmaking contention.** A waiting room is one node that every arriving
  phone rewrites in a transaction. Thousands of players would all be fighting
  over that one node.
- **No authority.** Every phone reports its own marks, and the rules can't
  check who belongs in a squad's room (squads live in Firestore).
- **No reconnecting.** A reload or a dropped connection leaves you out for good.
- **Mixed versions.** GitHub Pages caches for about 10 minutes, so one room can
  have phones on different builds, and nothing checks that they agree.

## Architecture

```
 phone (static site on GitHub Pages, unchanged hosting)
   │  HTTPS: Firebase Auth, Firestore (accounts, squads, boards, progress)
   │  WSS:   live play  ─────────────────────────────┐
   ▼                                                  ▼
 Firebase (unchanged)                    Cloudflare Worker (router, auth check)
                                           ├─ SquadHub DO   one per squad: meet sign-up, practice rooms
                                           ├─ Matchmaker DO one (later: one per region): squads waiting for a meet
                                           └─ Meet DO       one per meet: lobby → events → podium
```

A Durable Object (DO) is a single-threaded JavaScript object that Cloudflare
creates on demand. Its id names it, so there's only ever one copy. It holds
WebSockets, keeps its own storage and sets its own alarms (timers). One per
meet means a meet's 24 players all talk to one place that owns the meet's
state and clock. Different meets never share anything, so more meets just
means more objects.

The server is JavaScript, so it imports the game's own pure modules: the
relay rules (`src/events/relayRules.js`, already shared with
`tools/simulate.mjs`), scoring, and the new meet modules below. The server and
the phones use the same code, not two copies that drift.

### What owns what

| Piece | Owns |
|---|---|
| Firebase | Sign-in, usernames, squads and members, leaderboards, progress. Later: meet history and squad records. |
| Worker | Routes WebSocket upgrades to the right DO. Checks the Firebase ID token and the client version first. |
| SquadHub DO (`squad:{key}`) | The squad's meet sign-up (4 slots), picking the captain, handing the squad to the Matchmaker. Also hosts squad Practice rooms, replacing `squadlobby/`. |
| Matchmaker DO | Open meet lobbies; puts each squad into the oldest one with room. |
| Meet DO (`meet:{id}`) | Lobby, Ready and Start early, the server clock, the schedule, heats and lanes, sending each heat only its own data, deadlines, results, scoring, relay legs and exchanges, reconnects. Writes the final result to Firestore. |
| Phone | Plays its own athlete, draws its heat-mates from what the server relays, predicts and then accepts the server's ruling. |

### Rules that keep it standing

1. **The server runs the clock; deadlines, not waiting.** Each stage has a
   start and a cutoff in server time. All done early: the meet moves on early.
   Not done by the cutoff: DNF. No phone can stall a meet.
2. **One clock.** Each phone syncs to the server's clock over the socket (a few
   pings when it connects, keeping the lowest-delay sample, re-checked every
   10 s). Inputs and results carry server time.
3. **Heat filtering on the server.** A frame from heat 2 goes only to heat 2.
4. **Reconnect.** A dropped socket has a grace period. Back within it, you get a
   snapshot of the meet (phase, schedule, standings, your heat) and carry on.
   Miss an event's cutoff and it's a DNF for that event; you're back for the next.
5. **Version check.** The phone sends its build version as it connects. The
   server accepts the current and previous protocol versions and tells older
   builds to reload.
6. **Results are checked.** At first: sanity bounds (as `firestore.rules`
   `validMark` does), and a result must come from the athlete's own socket for
   the current stage. Later: the 100m is replayed on the server from your
   inputs (its physics are deterministic, see `src/online/liveRun.js`) and the
   server's time is the one that counts.
7. **Light traffic.** About 10 sends a second from each phone (as now), and
   the server sends each heat one batched update about 10 times a second.
   Frames stay in today's compact trace format (`src/online/trace.js`).

### Load

| | per meet (24 players) |
|---|---|
| Messages in | about 240 a second |
| Messages out | about 24 batched updates, 10 a second each |
| Sockets | 24 |

That's light for one DO. Load tests (Phase 6) confirm it before launch.

## Meet lifecycle

### 1. Sign-up (SquadHub)

- The Squad tab gets a **Meet** button next to Practice. Tapping it puts you in
  one of the squad's 4 meet slots. A fifth member sees that the meet is full.
- With 4 slots filled, the server picks one of the 4 at random as **meet
  captain** and hands the squad to the Matchmaker, which places it in a meet
  lobby. All 4 phones connect to that Meet DO.
- A squad is in at most one meet. The SquadHub is the only place a squad
  enters from, so this holds by construction.
- Before the meet starts, anyone can leave their slot. The squad drops to 3/4
  and is **not ready**, and the next squadmate to tap Meet takes the slot. If
  the captain leaves, a new one is picked at random. A squad still short after
  60 s is withdrawn from the lobby, keeping its 3 sign-ups.

### 2. Lobby (Meet DO)

Everyone in the lobby sees every squad, its 4 athletes, its captain and
whether it's ready.

- A captain can press **Ready** (only with all 4 there) and press it again to
  un-ready.
- **6 squads, all ready:** the meet locks and counts down (5 s).
- **2 to 5 squads, all ready:** captains see **Start early**. Every captain
  pressing it locks the meet with those squads.
- The first Start early vote closes the lobby to new squads, so a squad
  arriving mid-vote can't keep resetting it. If the vote isn't unanimous
  within 20 s, the votes clear and the lobby reopens.
- Any squad joining, leaving or un-readying clears the Start early votes.
- **An idle captain can't block the lobby:** once every other squad is ready, a
  squad that stays unready for 60 s is withdrawn back to its SquadHub.
- One squad alone waits ("Waiting for squads"); a meet needs at least 2.
- A dropped captain is replaced at random, and that squad's vote clears.

### 3. Meet (Meet DO)

```
LOBBY → COUNTDOWN → INTRO → 100m → LJ r1 r2 r3 → 110mH → PV r1 r2 r3 → JT r1 r2 r3 → RELAY → PODIUM → DONE
```

Each event: title card, the stage(s), results. The server sends each stage
as `{ stage, startAt, cutoff }` ahead of time, so the next event's scene loads
during the current results.

**Lanes and heats.** Each squad gets a lane for the meet (random). Your own
phone still draws you in the front lane (`playerLane`), with the other lanes
in squad order. For every individual event, each squad's 4 are sorted by
personal best in that event (self-reported, since this is only seeding) and
heat k takes each squad's k-th: similar athletes race each other. Heats are
re-seeded for every event.

**DONE.** The result goes to Firestore (`meets/{id}`, written by the server),
and the DO keeps the final standings for 10 minutes for anyone reconnecting,
then clears itself.

## Timing

Estimates from the current code, to be measured with `tools/simulate.mjs` and
bot meets. Results include the late hits.

| Segment | Typical | Cutoffs hit |
|---|---|---|
| Lobby countdown + intro (squads, lanes) | 8 s | 8 s |
| 100m: title 3, READY/SET ~4, race ~12 (cutoff 20), results 8 | 27 s | 35 s |
| Long jump: title 3, 3 rounds ~11 s each, results 8 | 44 s | 50 s |
| 110m hurdles: title 3, start ~4, race ~15 (cutoff 22), results 8 | 30 s | 37 s |
| Pole vault: title 3, 3 rounds ~13 s, results 8 | 50 s | 58 s |
| Javelin: title 3, 3 rounds ~11 s, results 8 | 44 s | 50 s |
| 4×100m: title 3, start ~4, race ~40 (cutoff 55), results 10 | 57 s | 72 s |
| Final standings + podium | 15 s | 15 s |
| **Meet** | **~4.6 min** | **~5.4 min** |

What changes from today to get there (all moving into a `CONFIG.meet`
block, logged in CHANGELOG.md as usual):

| Now | Meet |
|---|---|
| `READY_WAIT` 20 s: wait for the slowest phone to be ready | Gone: the server schedules |
| `EVENT_LEAD` 22 s between tournament events | ~11 s (results 8, title 3), late hits during the results |
| `ROUND_LEAD` 6 s between field rounds | 3 s |
| `LIVE_WAIT` 12 s / relay `liveWait` 25 s after you finish | Race cutoff from the gun |
| `FINISH_WAIT` 30 s after your last field attempt | Round cutoff |
| `START_DELAY` 10 s waiting-room countdown | 5 s after the lock |

**Field round cutoff.** Each round, everyone in the flight attempts at
the same moment (as live field events already do). The round ends when every
attempt has landed, or at a cutoff that is the longest sensible attempt plus a
margin. No attempt by the cutoff counts as a foul.

## Scoring

Pure code in `src/meet/scoring.js`, imported by the server (which decides)
and the phone (which shows the running score as results arrive).

- **Rank across all heats.** Sprints and hurdles are ranked on the raw time
  (thousandths), shown to the hundredth (`roundMark`). Field events are ranked
  on the best mark, and ties are broken by the second-best mark, then the
  third, as in real meets.
- **Points:** `[10, 8, 6, 5, 4, 3, 2, 1]` for places 1 to 8.
- **True ties share points.** The tied athletes split the points for the places
  they cover. Two tied for 2nd: (8 + 6) / 2 = 7 each, and the next athlete is
  4th (5). Three tied for 8th: (1 + 0 + 0) / 3 ≈ 0.33 each. Shown to one decimal.
- **No mark** (DNF, all fouls or failures, missed the cutoff) scores 0 and
  isn't ranked.
- **Relay:** the same table across up to 6 teams (10 down to 3). A DNF team scores 0.
- **Squad total** is the sum. A tie on totals is broken by most 1st places,
  then 2nd places, and so on; still tied, they share the place.

Test cases to write first (Phase 0):

| Case | Expect |
|---|---|
| 24 distinct sprint times | top 8 get 10 to 1, the rest 0 |
| 9.871 vs 9.874 (both show 9.87) | ranked apart |
| 2 tied for 2nd | 7 and 7, next is 4th with 5 |
| 3 tied for 8th | 0.33 each |
| Field: same best, different second-best | second-best decides |
| 3 squads only (12 athletes) | still top 8 score |
| DNF / all fouls | 0, unranked |
| Relay with 4 teams, one DNF | 10, 8, 6, 0 |
| Squad totals tied | most 1sts decides |

## The 4×100m relay with four phones

One race, every squad, one team a lane. **Each phone controls one leg.**

**Legs.** At the start of the relay the server shuffles each squad's 4 into
legs 1 to 4 (`src/meet/relayLegs.js`, pure, shared).

**Substitutes**, if someone's gone when the relay starts or drops while waiting:
a teammate still connected is picked at random to run that leg again, with
one constraint: nobody runs two legs in a row, because that would mean handing
off to yourself across two phones' worth of timing. So:

| Connected | Legs |
|---|---|
| 4 | one each |
| 3 | one person runs two legs that aren't next to each other (1 and 3, 2 and 4, or 1 and 4) |
| 2 | they alternate: A B A B |
| 1 | they run all four on one phone, as the relay plays today |
| 0 | the team doesn't start, 0 points |

**On screen.** The camera follows the baton all race: coming toward you
while you wait on your mark, with you as you run, and on to the finish after.
Your thumbs only work on your own leg (the targets, PASS coming in, TAKE as
it comes to you); the line at the bottom says which leg is yours.

**The exchange across two phones.** This is the one moment two players
interact, so it's designed so lag can't wreck it:

- Once the incoming runner is in the zone they stop striding and carry their
  speed, and PASS slows them by a fixed `reachDecel` (`relayRules.js`).
  Their position in the zone is fixed by three numbers: when they entered it,
  how fast they were going, and when they pressed PASS.
- The outgoing runner's takeoff (`checkTime`) and how fast they close the gap
  (`closeRate`) are already worked out from the incoming runner's motion.
- The TAKING runner's phone decides it: it runs both runners through the zone
  with the same `Exchange` code, the incoming runner from their frames until
  the zone (carried on to "now" at their speed) and by the zone's rules after
  it, with their PASS (`xp/<k>`, race time) from their phone. It sends how
  the handover went (`xt/<k>` = { t, g }) and every phone, the incoming
  runner's included, goes by it.
- Tested with 150 ms of added lag each way: perfect exchanges stay perfect,
  about 0.04 s slower over the whole race than with none.
- The server takes the team's time only from whoever ran the anchor leg.
  Having the server rerun each exchange from the same numbers is a later
  hardening step (Phase 6).

**A runner's phone drops mid-race:** the server picks a teammate still there
(the one running the next leg, else the one before, else anyone) and that
phone runs the dropped runner's legs with a computer runner on Amateur
settings, PASS and TAKE included (`proxies`; src/events/meetRelay.js).

## Protocol

JSON over the WebSocket, every message `{ t: type, ... }`
(src/meet/protocol.js). During play every player has a DOC on the server, the
same shape as a live room's in the Realtime Database (online/live.js), so the
events play a meet the way they play any live room.

| Direction | Message | Carries |
|---|---|---|
| → | `hello` | Firebase ID token, protocol version, build |
| ← | `welcome` / `reload` / `denied` | your uid and the server's time / update the game / not allowed |
| ↔ | `ping` / `pong` | the clock |
| → SquadHub | `signup` / `unsignup` | on or off your squad's sign-up, with your athletes and personal bests |
| ← SquadHub | `squad` / `goto` / `busy` | the sign-up / go to meet `id` / your squad's meet is full or on |
| → Meet | `ready` / `unready` / `startEarly` / `leave` | captain's buttons (leave: anyone) |
| ← Meet | `lobby` / `withdrawn` | squads, rosters, captains, ready, votes, the lock / your squad was sent back |
| ← Meet | `event` | an event's heats (or relay legs) and start |
| ← Meet | `stage` / `stageDone` | a stage's start, cutoff and GET SET length / it's over |
| → Meet | `patch` | updates to your doc: frames, results (`res/<stage>`), late hits, relay `xp`/`xt` |
| ← Meet | `doc` | a heat-mate's patch |
| ← Meet | `results` / `final` | an event's places across every heat and the squads' totals / the final standings |
| ← Meet | `presence` / `proxies` | someone dropped or came back / whose phone runs a dropped relay runner's legs |
| ← Meet | `snapshot` | everything, on (re)connecting |

**Sign-in check in the Worker:** the Firebase ID token is a JWT signed with
Google's published keys, so the Worker verifies it itself (issuer and audience
are the Firebase project) and caches the keys. **Squad check:** the SquadHub
reads `squads/{key}` over Firestore REST (public read, as `squads.js` does) and
admits only members; the Meet only admits the rosters its squads' SquadHubs
sent.

## Code layout

### Server: `server/` (see server/README.md)

```
server/
  wrangler.toml          Worker + 3 Durable Object classes
  src/index.js           the Worker and the Durable Objects: sockets, timers, RPC between them
  src/socket.js          the hello handshake, pings
  src/auth.js            Firebase ID token check
  src/firestore.js       a squad's members, from Firestore
  src/squadHubCore.js    sign-up: the first four, then a lobby
  src/matchmakerCore.js  open lobbies, placing squads
  src/meetCore.js        lobby rules, schedule and cutoffs, heats, results, relay legs and stand-ins
  test/                  the cores on a fake clock, the token check
  tools/bots.mjs         bot squads
```

It imports `src/meet/{rules,scoring,heats,relayLegs,protocol}.js` and
`src/config.js` from the game, which must stay pure (no DOM, no browser
globals).

### Shared (pure)

- `src/meet/rules.js`: squad size, points, the events in order, stages.
- `src/meet/scoring.js`: ranking across heats, ties, points, squad totals.
- `src/meet/heats.js`: seeding heats from personal bests.
- `src/meet/relayLegs.js`: leg shuffle and who runs again.
- `src/meet/protocol.js`: the protocol version, applying a doc patch.
- Tests: `test/meet.test.mjs` (`node --test test/*.test.mjs`).

### Client

- `src/online/net.js`: the WebSocket, sign-in hello, clock, reconnect,
  `MEET_SERVER`, and test switches (`?meetserver=`, `?devuid=`, `?meetlag=`).
- `src/meet/meet.js`: the meet you're in, as the server has said.
- `src/online/meetSession.js`: the face the events already use from
  `LiveSession`, but `others` is your heat and `startOf` / `cutoffOf` /
  `stageDone` come from the server's schedule.
- `src/meet/meetScene.js`: sign-up, lobby, countdown.
- `src/meet/meetStandingsScene.js`: between events, and the final standings.
- `src/events/meetRelay.js`: the relay, a leg per phone.
- `src/scenes/home/squadPanel.js`: the Meet button, following the sign-up.
- `src/events/laneRace.js`, `src/online/liveField.js`: waiting on the
  server's results and cutoffs (a field attempt not done by the cutoff is a
  foul).
- `src/config.js`: `CONFIG.meet` (timings, cutoffs, lobby waits).

Practice and public live rooms run on the same server too (`/lobby/public`,
a squad's `/squad/<key>`, and a `/room/<id>` per room: server/src/lobbyCore.js,
roomCore.js), so there's one live stack. The Realtime Database's live paths
are no longer used.

## Build phases

| Phase | Delivers | Status |
|---|---|---|
| **0. Spec** | This doc; the scoring, heats and relay-leg rules with tests | Done |
| **1. Server foundation** | Worker + Durable Objects, sign-in check, clock, reconnect, version check | Done (not deployed). Practice not moved yet |
| **2. Meet core** | Sign-up, captain, Matchmaker, lobby, schedule, heats, scoring, DNF; 100m and hurdles | Done |
| **3. Field flights** | Long jump, pole vault, javelin with round cutoffs | Done |
| **4. Four-phone relay** | A leg per phone, the taker's phone decides exchanges, stand-ins | Done (exchanges decided on the phone, not yet rechecked on the server) |
| **5. Meet screens** | Lobby, heat + overall results, squad totals, final standings, late hits between events | Done |
| **6. Hardening** | Load tests at scale, network-chaos tests, 100m replay check, server-checked exchanges, `meets/{id}` history and squad records | To do (Practice and public rooms moved over: done) |

## Testing

- **Unit:** the pure meet modules, with `node --test`.
- **Server locally:** `wrangler dev` runs the Worker and DOs on your machine.
- **Bot players:** a Node script that connects as N players and plays with the
  game's own computer runners (`src/athletes/ai.js`), so a full 6-squad meet
  runs without 24 people. The same script, scaled up, is the load test.
- **Chaos:** bots that drop, reconnect, lag (100 to 400 ms), and send late or
  bogus results. The meet must always finish on schedule.
- **End to end:** Playwright with the preinstalled Chromium, several browsers
  in one meet.

## Observability

Per meet: squads, duration, players dropped and reconnected, and each stage's
start vs cutoff (are cutoffs being hit?). Per socket: round-trip time p50/p95.
Relay: how often the server's ruling differed from a phone's prediction. These
go to Workers logs first, with alerts on stuck meets (a phase past its cutoff +
30 s) and on error rates.

## Cost

Workers and Durable Objects bill by requests and active time, and WebSocket
hibernation keeps idle sockets cheap. Firebase cost stays where it is (no live
traffic). Check current Cloudflare pricing before launch; the paid Workers
plan is needed for production limits.

## Deployment

- `server/` deploys with `wrangler deploy` from a GitHub Action on pushes to
  `master` that touch `server/` or the shared modules, using a
  `CLOUDFLARE_API_TOKEN` secret.
- The client keeps publishing to GitHub Pages. Since Pages caches for about 10
  minutes, the server keeps supporting the previous protocol version until
  every client has had time to update.
