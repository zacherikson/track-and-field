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
| Async play / ghosts | No. Meets are live only. |
| Server | Cloudflare Workers + Durable Objects. |

Still open (defaults used below until decided):

1. **The baton carrier drops mid-leg.** Default: a computer runner finishes that
   leg at Amateur pace. That costs time but isn't a DNF for the team.
2. **Late hits in a meet.** Default: kept, but only during the results
   window between events (about 8 s), not as a separate pause.

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

**On screen.** While you wait, the camera follows the baton coming toward
you. As your takeoff comes it cuts to you. After your leg, it follows the
baton to the finish. Running two legs, you're back on the waiting mark after
your first.

**The exchange across two phones.** This is the one moment two players
interact, so it's designed so lag can't wreck it:

- Once the incoming runner is in the zone they stop striding and carry their
  speed, and PASS slows them by a fixed `reachDecel` (`relayRules.js`).
  Their position in the zone is fixed by three numbers: when they entered it,
  how fast they were going, and when they pressed PASS.
- The outgoing runner's takeoff (`checkTime`) and how fast they close the gap
  (`closeRate`) are already worked out from the incoming runner's motion.
- So the whole exchange is decided by `{ zone entry time, entry speed, PASS
  time, TAKE time }`. Both phones predict it as it happens, and the server
  works it out from the same numbers with the same `Exchange` code. When a
  phone's prediction differs (an input arrived ~100 ms late), the server's
  ruling wins and the phone eases to it. The difference is centimetres.
- The baton carrier's phone sends PASS. The outgoing runner's phone sends TAKE.

**Baton carrier drops mid-leg** (open decision 1): by default the server
finishes that leg with a computer runner at Amateur pace and the exchange
plays out automatically (a GOOD exchange).

## Protocol

JSON over the WebSocket, every message `{ t: type, ... }`, protocol version `v`
set when you connect. Frames keep the trace chunk strings.

| Direction | Message | Carries |
|---|---|---|
| → | `hello` | Firebase ID token, client build, protocol version |
| ← | `welcome` / `reload` | your uid, server time / please update |
| ↔ | `ping` / `pong` | clock sync |
| → | `meet.join` / `meet.leave` | sign up for your squad's meet slots |
| → | `lobby.ready` / `lobby.unready` / `lobby.startEarly` | captain only |
| ← | `lobby` | squads, entrants, captains, ready, votes, lock countdown |
| ← | `schedule` | the next stages: `{ stage, kind, startAt, cutoff, heat, lanes }` |
| → | `frames` | your trace chunk for the stage (or 100m inputs + step count) |
| ← | `heat` | batched frames from your heat-mates |
| → | `result` | your mark for the stage |
| ← | `results` | the stage's results: heat, overall, points, squad totals |
| → | `relay.pass` / `relay.take` | exchange inputs, in server time |
| ← | `relay.exchange` | the server's ruling |
| → / ← | `hit` | late hits (as `brawl/liveBrawl.js` today) |
| ← | `snapshot` | everything needed to rejoin after a reconnect |

**Sign-in check in the Worker:** the Firebase ID token is a JWT signed with
Google's published keys, so the Worker verifies it itself (issuer and audience
are the Firebase project) and caches the keys. **Squad check:** the SquadHub
reads `squads/{key}` over Firestore REST (public read, as `squads.js` does) and
admits only members.

## Code layout

### Server: `server/` (new; deployed with Wrangler, Cloudflare's CLI, which bundles it)

```
server/
  wrangler.toml       Worker + 3 Durable Object classes, SQLite storage
  src/index.js        router: /ws → auth, version → the right DO
  src/auth.js         Firebase ID token check
  src/squadHub.js     sign-up slots, captain, practice rooms
  src/matchmaker.js   open lobbies, placing squads
  src/meet.js         the meet state machine, schedule, heats, relay, scoring calls
  src/clock.js        alarms → stage transitions
```

It imports `src/meet/*.js`, `src/events/relayRules.js` and `src/config.js` from
the game. Those must stay pure (no DOM, no browser globals), as relayRules
already is.

### Shared (new, pure)

- `src/meet/scoring.js`: ranking, ties, points, squad totals.
- `src/meet/heats.js`: seeding heats from personal bests, lane draw.
- `src/meet/relayLegs.js`: leg shuffle and substitutes.
- `src/meet/schedule.js`: the stage list and cutoffs from `CONFIG.meet`.

### Client

- `src/online/net.js` (new): the WebSocket, sign-in hello, clock sync,
  reconnect with backoff, version check.
- `src/online/meetSession.js` (new): a session with the same surface the
  events already use from `LiveSession` (`stage`, `eventStage`, `startOf`,
  `ready`, `begin`, `result`, `send`, `listen`, `left`, `others`), but
  `startOf` comes from the server's schedule and `others` is your heat. The
  events barely change.
- `src/scenes/meetLobbyScene.js`, `meetResultsScene.js`, `meetPodiumScene.js`
  (new).
- `src/scenes/home/squadPanel.js`: the Meet button and its slots.
- `src/events/laneRace.js`, `src/online/liveField.js`: lanes by squad, cutoffs
  from the schedule instead of `LIVE_WAIT` / `FINISH_WAIT`.
- `src/events/relay4x100.js`: one-leg control, the waiting camera, the
  two-phone exchange.
- `src/config.js`: `CONFIG.meet` (timings, cutoffs, points).

Practice and public live rooms move onto the same server later (Phase 6), so
there's one live stack, and the Realtime Database's live paths are retired.

## Build phases

| Phase | Delivers | Done when |
|---|---|---|
| **0. Spec** | This doc; `src/meet/scoring.js`, `heats.js`, `relayLegs.js` with tests (`node --test`, no dependencies) | Every case in the scoring table passes |
| **1. Server foundation** | Cloudflare setup, Worker + DOs, sign-in check, clock sync, reconnect, version check; Squad Practice moved onto it behind a switch | A practice 100m on the new server plays like today's |
| **2. Meet core** | Sign-up slots, captain, Matchmaker, lobby (Ready, Start early, the idle-squad rule), schedule, heats, cross-heat scoring, DNF; 100m and hurdles | A 3-squad meet with bots runs both events end to end |
| **3. Field flights** | Long jump, pole vault, javelin on the server schedule with round cutoffs | All five events in a bot meet, under 4 minutes |
| **4. Four-phone relay** | One leg per phone, server-ruled exchanges, substitutes, the waiting camera | 6 squads of bots plus a few people run clean relays under 150 ms of added lag |
| **5. Meet screens** | Lobby, heat + overall results, running squad score, podium, late hits limited to the results window | A full meet under 6 minutes with real phones |
| **6. Hardening** | Bot load tests, network-chaos tests, 100m replay check, `meets/{id}` history and squad records, Practice and public rooms moved over, RTDB live retired | Hundreds of meets at once with steady latency; no stuck meets |

The relay (Phase 4) is the biggest single risk; everything before it is
needed by it anyway.

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
