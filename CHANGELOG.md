# Changelog

Gameplay and tuning changes, newest first. When you change a number in
`src/config.js`, log the old → new value and why it felt better.
`node tools/simulate.mjs` shows what a change does to race times.
From 1.0.0 every push to master bumps `src/version.js` and heads its section
here with the version.

## 1.9.4 — The 100m record is worth 1250
- 1.9.3 set the 100m's 1200 at 8.15 s, the simulator's 5.7-taps-a-second
  player, faster than any event's perfect player and than anyone has run.
  The 100m's players bunch up at the top (its expert runs 8.27), so the
  board's best, rawnald's 8.28 s, only came to 1088.
- `scoring.js` 100m rows: expert 8.25 → 8.50 s (1100), and the top row
  8.15 s (1200) → 8.28 s (1250), the best anyone runs. Casual and good stay
  (650 at 9.70, 900 at 8.75), so rivals score as in 1.9.3.
- rawnald's bests now come to 6008 (was 5846). The simulator's expert totals
  5664, good 4502.

## 1.9.3 — Even tournament scoring: about 6000 for a perfect tournament
The tournament scored the official decathlon tables, made for real marks, and
the game's marks run past them unevenly: rawnald's best long jump (10.53 m)
was worth 1761 points, his best javelin (99.26 m) 1343. His Collegiate
tournament came to 6884.
- `scoring.js` is now one table per event, set from `tools/simulate.mjs`'s
  players so the same skill scores the same everywhere:

  | | zero | casual 650 | good 900 | expert 1100 | perfect 1200 |
  |---|---|---|---|---|---|
  | 100m | 18 s | 9.70 | 8.75 | 8.25 | 8.15 |
  | 110m hurdles | 28.5 s | 14.40 | 12.30 | 11.60 | 11.25 |
  | long jump | 2.20 m | 6.85 | 8.10 | 9.50 | 10.35 |
  | pole vault | 1.00 m | 3.65 | 4.50 | 5.80 | 6.50 |
  | javelin | 7 m | 77 | 85 | 95.5 | 100.5 |

  In between, a mark scores in proportion; past perfect it keeps climbing at
  the good-to-perfect rate. The zero marks are the official tables' own.
- Old → new for the boards' best marks: 100m 8.28 s 1559 → 1088, long jump
  10.53 m 1761 → 1224, hurdles 11.33 s 1348 → 1177, pole vault 6.38 m 1359 →
  1182, javelin 99.26 m 1343 → 1175. Together 7370 → 5846.
- Simulated totals: perfect 5976, expert 5499, good 4502, casual 3244. Rival
  winners: High School about 2840, Collegiate 3670, Pro 4840.
- Survival scores the same tables. The Tournament and Survival boards still
  hold totals from the old tables.
- Simulator: a perfect long jumper (5.2/s), as the other field events have.
- New `test/scoring.test.mjs`.

## 1.9.2 — Wasatch University: a deeper blue sky
- Collegiate's sky faded to almost white at the horizon (`#cfe4f6`), so most
  scenes showed a washed-out light blue. Only the javelin's flight shot is
  tall enough to show the deep blue at the top. The pole vault was worst: its
  tall sky (for the camera to pan up into) spent nearly all of its height on
  the pale end.
- `venues.js` COLLEGIATE `sky`: `bottom` `#cfe4f6` → `#8fc0ea`, `high`
  `#2563ad` → `#2a6cbf`. `top` stays `#3f86d4`, the javelin's blue. The
  vault's sky is now a steady mid blue, and every other Collegiate scene is
  a shade deeper down by the mountains.

## 1.9.1 — Pro 100m rivals: a narrower, slower pace range
Track Royale v1.9.0 tuning, copied from the phone:

| Setting | Old → new |
|---|---|
| `sprint100.ai.pro.cadence.0` (slowest rival pace) | 3.13 (shown as 3.1) → 3.2 taps/s |
| `sprint100.ai.pro.cadence.1` (fastest rival pace) | 3.85 (shown as 3.9) → 3.6 taps/s |

- The Pro 100m field is closer together and its fastest rivals are slower.
  Simulator (three runs): winner median 9.40 → 9.63 s, fastest 10% 9.25 →
  9.49 s, rival median 9.77 → 9.85 s.
- Survival's 100m rival is mixed from these levels, so it slows too: about
  10.0 s in round 1 (was 9.95) and 9.20 s by round 20 (was 9.03).

## 1.9.0 — Shop and Contract tabs
- The home screen has five tabs now: **Shop | Athlete | Play | Squad |
  Contract** (`homeScene.js` `TABS`). Shop and Contract were screens opened
  from chips at the top of the Play tab; they're tabs of their own
  (`home/shopPanel.js`, `home/contractPanel.js`, moved from `scenes/`), and
  the chips are gone. Keys 1 to 5 pick a tab.
- They ask the server when you come to the tab (`onShow`), not every time the
  home screen opens: the Contract tab collects today's pay as before, and the
  Play tab still opens your contract when the menu loads.
- An offer waiting puts a red dot on the Contract tab (a panel's `badge`),
  where it was on the Contract chip. The contract news card says to sign it
  on the Contract tab.
- Their sign-in hints point to the Athlete tab (where a guest's Sign in with
  Google is). Wearing a bought item keeps your username on your athlete.

## 1.8.1 — Your athlete goes by your username
- Athletes no longer have names of their own: yours shows your username
  everywhere (races, results, the Athlete tab, the Athlete Maker's stage).
  `roster.js` `myAthlete()` gives your made athlete your username as its name.
- The Athlete Maker's **Rename** is gone (Random takes its place, full width).
- The name still inside an athlete's code (older builds and other phones read
  it) is your username, cut to 12 letters, and follows a username change on
  the Profile screen.
- The Athlete tab drops its "races as …" line.

## 1.8.0 — Set up your account first
New players set themselves up before the menu, and the Athlete tab is just you.
- **First launch** (`src/scenes/onboarding.js`): three steps, any already done
  skipped. **Account**: Sign in with Google (big, blue) or Play as guest.
  **Username**: claim one (the made-up `Runner 1234` until you do; skippable
  only if the server can't be reached). **Athlete**: male (short hair, blue
  kit) or female (ponytail, coral kit) (`custom.js` `STARTERS`) and a skin
  tone. Once only: an athlete you'd already made is simply yours, gear and
  all, with no male/female picking again.
  Coming back from Google's sign-in mid-setup lands back in it; a squad
  invite waits until you're done.
- **Everyone runs it once**: players from before it came in too (storage
  `onboarded`), so everyone ends up as an athlete of their own and the six
  cast athletes are rivals only. Signed in with an athlete and a username
  already: straight through to the menu. Signing out clears it.
- **The Athlete tab** (`home/athletePanel.js`): no more cast cards. Your
  athlete warming up, your username, level (or Guest), height, the athlete's
  own name if it isn't your username, **Customize** (the Athlete Maker; tapping
  your athlete opens it too) and **Profile**. A guest gets Sign in with Google
  there: the reminder to set up the account later.
- Signing in's shared steps (post your bests, sync your progress, reload as
  the account's player) moved to `src/online/account.js`, used by the Profile
  screen, the setup and the Athlete tab.
## 1.7.0 — The shop (economy phase 6)
Buy gear with Coins and Gems. The shop is the same for everyone and changes
every day.
- **21 items for sale** (`src/economy/items.js`; prices and names are
  placeholders):
  - **Basics:** 7 commons, always there, 300 to 600 Coins.
  - **Rotation:** 14 rare, epic and legendary items. Rares cost 1,000 to
    1,500 Coins, epics 25 to 40 Gems. The legendaries are Chrome spikes
    (8,000 Coins + 50 Gems) and Gold hoops (120 Gems).
  - Each item also needs a level, 2 to 12.
- **The rotation** (`src/economy/shop.js`, `CONFIG.economy.shop`):
  - **This week:** 2 epic or legendary picks, new every Monday 00:00 UTC.
  - **Today:** 4 more picks, new at midnight UTC.
  - Worked out from the date, so every phone and the server agree with no
    database and no scheduled jobs. The starter gear (1.6.0) stays free with
    levels and isn't sold.
- **Buying is checked by the server** (`POST /api/shop`). The item must be on
  sale today, you must be at its level and not own it yet, and you must be
  able to pay. The price comes out of your wallet (one ledger entry per
  currency) in the same transaction that adds it to your inventory
  (`inventory/{uid}`). Guests can look but not buy.
- **Shop screen** (`src/scenes/shopScene.js`), from the new Shop chip on the
  home screen:
  - This week's and today's cards on top, with countdowns; the basics below.
  - Each card shows the item on your own athlete close up, with its rarity,
    name and price, or OWNED, or the level it needs.
  - Tap to buy, then wear it straight away if you've made an athlete.
- **Athlete Maker:** the Gear tab shows the starter set plus what you've
  bought. Everything else is in the Shop.
- **Home:** the top bar fits Shop and Contract next to your profile. On
  narrow screens How to play shrinks to its icon first, then Shop and
  Contract.
- **Database:** `firestore.rules` adds `inventory/{uid}` (yours to read, only
  the server writes).
- **Tests:** the rotation (the same for everyone, Monday weeks, it changes),
  what can be bought and why not, prices out of the wallet, and the server
  end to end (open, buy once, both currencies, every refusal).

## 1.6.0 — Gear (economy phase 5)
The Athlete Maker has a Gear tab: cosmetic items for the athlete you make,
unlocked as you level up. Looks only; nobody runs any differently.
- **Six slots, 23 items** (`src/economy/items.js`, data; names and colours
  are placeholders):
  - **Spikes:** the shoe and its sole.
  - **Socks:** crew or tall, one striped.
  - **Headband:** over any hairstyle.
  - **Glasses:** shades or a wraparound visor.
  - **Sleeves:** wristbands, or an arm sleeve.
  - **Kit:** a stripe, hoops or a yoke on the shirt.
  - Each item has a rarity (common to legendary) and the level that unlocks
    it. This starter set is free and spread from level 1 to 13, with
    something new at levels 2, 3, 5, 7 and 10. Priced items for the shop come
    next.
- **Worn in every pose:** drawn on the figure's own skeleton
  (`stickFigure.js`): far-side gear a shade darker, like the skin. Checked
  standing, in the blocks, at the gun, running, over a hurdle, and in the
  emotes, at every build.
- **Others see it:** gear rides in your athlete's code. A code with gear
  starts `~2` and has one digit per slot (the item's permanent number); with
  nothing on it stays the old `~1` code. Gear a phone doesn't know is left
  off. The live waiting room now keeps 32 characters (was 24) so the longest
  code fits.
- **Athlete Maker:** Look and Gear tabs. Gear tiles show your athlete close
  up wearing each item. Locked ones show a lock and their level; tapping one
  says what unlocks it.
- **Results:** a level-up names the gear it unlocks ("LEVEL UP! LV 4 · NEW:
  Blaze spikes").
- **Tests:** the catalog (unique ids and numbers, art), unlocking by level,
  gear in codes (round trip, the old code without gear, the longest code
  fits, unknown gear left off).

## 1.5.0 — Contracts (economy phase 4)
Beat a campaign's tournament for a contract that pays every day you open the
game. Keep its one clause each week or lose it.
- **Contracts** (`src/economy/contracts.js`, `CONFIG.economy.contracts`;
  placeholders):
  - **Scholarship** (beat High School): 150 Coins a day.
  - **NIL deal** (beat Collegiate): 1,500 a day.
  - **Pro contract** (beat Pro, plus a live medal: a gold or two silvers):
    7,000 a day.
  - **How good the offer is:** Rookie, Starter (×1.3 pay) or Star (×1.7),
    from your medals (gold 6, silver 3, bronze 2 points) plus 2 points for
    each of the contract's five qualifying standards your best marks meet.
    The standards are about what wins a race at that level.
  - **Offers** only show when they pay more than what you have. Signing one
    replaces it, with a signing bonus of a day's pay.
- **Pay:** collected when you open the game, once a day; a day you don't is
  lost. Days end at your own midnight (your time zone, which can change once
  a week).
- **The clause:** race 3 times a week (any race but Training), counted from
  the day you signed. Miss a week: probation, 20% less pay. Meet it again:
  full pay. Miss two in a row: the contract is gone, and offers come back
  after 3 top-3 finishes.
- **The server keeps it** (`contracts/{uid}`, changed in the same transaction
  as the wallet). `POST /api/contract` opens it (catching up on the weeks
  gone by, then paying today) or signs an offer, which the server works out
  from your account's progress and medals. Races count toward the clause as
  their XP lands, from `/api/xp` and from live payouts. No scheduled jobs.
- **Shown:**
  - **Home:** a Contract chip (a red dot when an offer is waiting) and a card
    over the track when pay comes in, an offer arrives, or you go on or off
    probation or lose the contract.
  - **Contract screen** (`src/scenes/contractScene.js`): your contract as a
    cream sheet (pay, status, the clause's races this week, days left), your
    offers with Sign. With no offer, what to do for the next one and the
    standards against your bests.
- **Database:** `firestore.rules` adds `contracts/{uid}` (yours to read,
  only the server writes).
- **Tests:** the contract rules (offers, grades, pay, the clause, probation,
  losing and requalifying, time zones), and the server end to end against a
  fake Firestore (sign, pay once a day, races counted, probation, lost,
  offers back).

## 1.4.0 — Live prize money and medals (economy phase 3)
Public live races now pay out, decided by the server, and the top three go up
on a podium.
- **What a public live room pays** (`src/economy/payouts.js`,
  `CONFIG.economy.live`; placeholders):
  - **Every finisher:** 25 Coins.
  - **1st / 2nd / 3rd** (2+ finished): +200 / +100 / +50 Coins.
  - **Medals** (3+ finished): gold, silver or bronze, kept forever, with
    6 / 3 / 2 Gems.
  - **XP** for each event, as before (20 for finishing, +30 / 20 / 10).
  - **Live tournament:** 3x the Coins and Gems, by overall standing.
  - Squad Practice, meets and live Survival don't pay yet (XP only, as before).
- **The server settles it.** The room works out the standings from every
  player's results (`src/online/liveResults.js`). It settles once everyone has
  finished or left, or 90 s after the last result. Then it pays each player
  in one wallet transaction (`server/src/roomCore.js`, `index.js`). A room pays
  once, however often it's settled. Each phone is told what it won.
  - Public live XP now comes from the server, not the phone.
  - Medal counts go on the public `players/{uid}` with your level.
- **Shown:**
  - **Results:** "GOLD MEDAL · +225 Coins · +6 Gems · +50 XP" under your place,
    and a gold **Podium** button.
  - **Podium** (`src/scenes/podiumScene.js`): the top three on their blocks
    under the lights, medals on, celebrating, confetti, and your payout.
  - **Tournament final standings:** your payout line.
  - **Profile:** your medal cabinet (gold, silver, bronze counts) in the
    wallet strip.
- **Fixed:** the live tournament's final standings showed "HIGHSCHOOL"
  instead of the level's name.
- **Tests:** payouts (prize, medal thresholds, tournament factor, XP), room
  settling (all done, someone left, give-up timer, once only), several
  wallet changes in one transaction.

## 1.3.0 — Levels and XP (economy phase 2)
Every race you finish earns XP, kept on your account by the server, and your
level shows across the game. Levels will unlock shop items (a later phase).
- **XP per race** (`src/economy/levels.js`, `CONFIG.economy.xp`;
  placeholders):
  - **Against the computer** (campaigns, Special Events, Survival): 10 for
    finishing, plus 15 / 10 / 5 for 1st / 2nd / 3rd.
  - **Live:** 20 for finishing, plus 30 / 20 / 10.
  - **Training:** none (still an open question in the design doc).
  - At most 1,000 XP a day.
- **Levels:** level 2 at 100 XP, 3 at 300, 4 at 600, 10 at 4,500 (each level
  takes 100 more than the last), up to 99.
- **The server keeps it.** Phones report each race they finish (mode,
  place, field) to `POST /api/xp` (`server/src/api.js`), with the player's
  sign-in. The server works out the XP and adds it to the wallet (XP is a
  balance there, grant-only, with the daily cap). It also writes your level
  to the public `players/{uid}`.
  - Guests earn nothing.
  - Each race has its own ref, so it never counts twice.
  - Races finished offline wait on the phone (`src/online/xp.js`) and go up
    at the menu.
- **Shown:**
  - **Results:** "+20 XP", and "LEVEL UP! LV 4" when the server says so.
  - **Home:** your level on the profile chip ("Runner · Lv 3").
  - **Profile:** your level on your bib, with the XP to the next one and a
    bar.
  - **Global leaderboard:** each player's level in a pill before their name.
- **Removed:** live Survival's old points-to-XP (kept on the phone, never
  shown) and its test. Live Survival races earn XP like any other.
- **Database:** `firestore.rules` adds `players/{uid}`: public to read,
  written only by the server.
- **Tests:** level curve and boundaries, race XP, the daily cap; the XP
  endpoint (guests refused, a race counted once, junk dropped, CORS); the
  sign-in check now says how you signed in.

## 1.2.1 — The pole vault's sky meets the bleachers
- **What happened:** the pole vault draws a tall sky (for the camera to rise
  into) that fades to pale at the stands, and at Collegiate and High School
  the bleachers' band then started its own, darker sky, so a hard line ran
  across the top of the band. Not new in 1.1.5: it's been there since the
  bleacher venues came in.
- **Fix:** the vault's sky runs down to the boards and the band leaves its
  own out (`vaultArena.js` `drawStands` → `{ sky: false }`); the range and
  the town still stand in front of it. `drawBleacherStadium`'s 1.1.5
  `backdrop` option is now two, `sky` and `range`.

## 1.2.0 — The wallet (economy phase 1)
The foundation for the economy (the Economy & Progression design doc): a
wallet only the server can pay into. Nothing earns money yet; live prize
money, medals and contracts come in the next phases.
- **Two currencies, names not final:** `earned` and `premium` internally.
  What players see comes from one table (`src/economy/currencies.js`, for now
  "Coins" and "Gems"), so a rename is one change there.
- **The wallet's rules** (`src/economy/wallet.js`), shared by the game and the
  server:
  - changes are grant, spend, fine and convert (premium to earned only);
  - a balance never goes below zero;
  - fines are built in but off (`CONFIG.economy.fines`);
  - every change has a ledger id made from what it's for, so the same payout
    can't land twice.
- **The server writes wallets** (`server/src/firestoreAdmin.js`). It signs in
  as the Firebase project's service account (its key is a Worker secret) and
  changes a wallet and its ledger entry in one transaction, retrying if two
  changes collide.
  - `/health/firebase` says whether that access works.
  - `server/tools/wallet.mjs` looks at or grants a wallet by hand.
- **Database:** `firestore.rules` lets you read your own wallet and its
  ledger; nobody can write them but the server.
- **Profile** shows your wallet, kept on the phone for offline. Guests are told
  to sign in to earn.
- **Server deploys** now also run when `src/economy/` changes.
- Tests: `test/wallet.test.mjs`, `server/test/firestoreAdmin.test.mjs`
  (against a fake Google: signing in, a payout landing once, refusing an
  overspend, retrying a collision).

## 1.1.5 — One range behind the javelin
- **What happened:** in the javelin's flight shot at Collegiate, the sky
  drew the snow-capped range and then the bleachers' band drew its own sky
  and a second, smaller range under it, so you saw mountains above mountains
  with a strip of pale sky between them. High School had the same seam: the
  sea and hills, then a second sky with the town in it.
- **Fix:** with bleachers, the flight shot's sky runs all the way down to
  them and its range sits right behind the trees and bleachers
  (`javelinField.js` `drawFlight`); the band leaves out its own sky and range
  (`drawStands`/`drawBleacherStadium` `{ backdrop: false }`). High School
  keeps the town and drops the sea and hills. Other venues are unchanged.

## 1.1.4 — Spikes under the toes
- The Athlete tab's shoe icon (`icons.js` `athlete`): its four spikes were
  spread from the heel to the middle of the sole. They're under the front
  of the foot now, as on a real sprint spike, and the heel is flat.

## 1.1.3 — Tap Play again to get back to the start
- On the Play tab, tapping **Play** in the tab bar again goes straight back
  to the vs Computer and Live buttons, out of whatever list you're in
  (`PlayPanel.top`). Coming to Play from another tab still keeps your place.

## 1.1.2 — Westfield's windows stop flickering
- **What happened:** which of the town's windows were lit came from each
  window's spot on the screen, so as the town scrolled the pattern reshuffled
  every frame and the windows flickered.
- **Now:** it comes from the building (track.js `drawTown`), so a building
  keeps the same lit windows as it goes by.

## 1.1.1 — Westfield High: a small-town track
- **High School's stadium redone** to match its menu art: no grandstand. The
  town is behind the track instead (track.js `drawTown`):
  - low hills, houses and shops with their windows;
  - a water tower with WESTFIELD on it;
  - a white church with its steeple;
  - a scattering of trees.
- **Small bleachers:** three rows, a section every 500 px or so, about one
  seat in six taken (venues.js `stands.seated`).
- Collegiate's bleachers share the code (`drawBleacherStadium`, was
  `drawMountainStadium`): its sections, crowd and press box are unchanged.
- The menu art (`westfield`): two small bleacher sections instead of one big
  stand, a few people on them.

## 1.1.0 — High School, Collegiate and Pro
- **Three campaigns:** High School → Collegiate → Pro, each locked until the
  one before is beaten. Amateur is now Collegiate: what you'd beaten there
  stays beaten (it keeps its save key, `amateur`), and if you'd started it or
  Pro already, it's open without High School.
- **High School rivals** are a step below Collegiate in every event (what
  Collegiate is to Pro, the other way; `ai.highschool` in each table).
  Winner medians (tools/simulate.mjs), High School / Collegiate / Pro:
  - 100m 11.10 / 10.29 / 9.44 s; hurdles 14.60 / 13.50 / 11.95 s.
  - Long jump 6.40 / 7.51 / 9.25 m; pole vault 2.99 / 4.00 / 5.51 m;
    javelin 71.6 / 80.9 / 93.7 m.
  - Relay team median 45.5 / 41.9 / 37.9 s (passing half a step below
    Collegiate: a full step drops batons and some teams never finish);
    time trial 65.5 / 58.3 / 51.7 s.
  - Collegiate and Pro unchanged.
- **New rivals at each level** (`roster.js` `castOf`): six high schoolers
  (Brayden, Kenzie, DeShawn, Mateo, Hailey, Gus), 82–88% of everyone's
  height, and six college athletes (Marcus, Ingrid, Kai, Ramírez, Sloane,
  Theo). Pro races the original six. Relay rival teams come from the level's
  cast too.
- **Venues:** High School is Westfield High (Amateur's). Collegiate gets a
  new one, **Wasatch University**, after the track in Provo:
  - snow-capped mountains behind, a line of trees and light poles;
  - modest aluminium bleachers with a press box;
  - a pale blue track with its lanes in two alternating blues (new
    `track.alt`);
  - the javelin's flight shot looks out over the mountains instead of the
    sea;
  - a poster version for the home card, the page and the intro (`wasatch`).
- **Special Events' RIVALS:** High School, Collegiate or Pro (starts on High
  School). Their intro shows the level's venue.
- **Labels:** results, the tournament, the Mine leaderboard ("Collegiate" for
  marks saved as Amateur) and the tuning panel ("Rivals (High School)" rows).
- **Database:** `firestore.rules` now allows `beaten.highschool`. Until the
  new rules are published, progress sync leaves High School off your account
  (it stays on the phone) instead of failing.
- New `test/levels.test.mjs`: the old save key, every level in every rival
  table, and each level's own rivals.

## 1.0.4 — Hurdles rivals back as they were
- **Reverted 1.0.3:** hurdles rivals have `CONFIG.ai`'s gun reaction again
  (Amateur 0.20–0.35 s, Pro 0.16–0.24 s) and their old reading and tapping
  speeds (Amateur setReact 0.55–0.78, tapGap 0.21–0.30; Pro setReact
  0.42–0.56, tapGap 0.16–0.22). The slower start made them feel too slow.

## 1.0.3 — Hurdles rivals react to the gun like players do
- **What happened:** hurdles rivals reacted to the gun as fast as the 100m's
  used to (`CONFIG.ai`: Pro 0.16–0.24 s), quicker than a player can see the
  GO on the phone.
- **`hurdles110.ai` reaction** (the 100m's, 1.0.2): Amateur 0.20–0.35 →
  0.30–0.45 s, Pro 0.16–0.24 → 0.26–0.36 s.
- **No warm-up:** hurdles pace comes from each button set, not a rhythm to
  find, and a rival already reads the first set like a player does.
- To keep finish times, rivals read and tap 2% quicker: Amateur setReact
  0.55–0.78 → 0.54–0.76, tapGap 0.21–0.30 → 0.206–0.294; Pro setReact
  0.42–0.56 → 0.41–0.55, tapGap 0.16–0.22 → 0.157–0.216. Medians 14.24 →
  14.29 s and 12.43 → 12.49 s (within the simulator's noise).
- **After 1 s:** Pro 4.6 → 3.7 m, Amateur 3.1 → 2.3 m. The four recorded
  player runs on the board (11.35–13.36 s) are 0.7–5.3 m out.
- Survival's later rounds (skill beyond Pro): about 0.1 s slower in the
  hurdles.
- **Field-event run-ups unchanged:** rivals' run-ups aren't on screen (only
  their speed at the end counts), so the gun reaction doesn't matter there.

## 1.0.2 — 100m rivals start like players do
- **What happened:** Pro rivals got out of the blocks faster than any player.
  The six recorded runs on the 100m board take their first stride 0.25–0.32 s
  after GO (the GO has to show on the phone first), and their first few
  strides come about 20% slower than their rhythm later. Pro rivals took
  their first stride at 0.16–0.24 s and ran their full rhythm from stride
  one. After 1 s a Pro rival was about 7.4 m out, players 6.1–6.4 m, even
  though most Pros finish slower than those players.
- **New `sprint100.ai`** (over `CONFIG.ai`, the 100m only):
  - Reaction to the gun: Amateur 0.20–0.35 → 0.30–0.45 s, Pro 0.16–0.24 →
    0.26–0.36 s.
  - New `startSlow` 0.2 / `startStrides` 3: the first stride gaps are 20%
    longer, fading out over three strides (`athletes/ai.js`).
  - Cadence raised to make up for it, so finish times stay put: Amateur
    2.3–3.1 → 2.42–3.26, Pro 3.0–3.68 → 3.13–3.85 strides/s. Amateur median
    10.77 → 10.80 s, Pro 9.76 → 9.77 s.
- **After 1 s now:** Pro 6.2 m (level with players), Amateur 5.5 m.
- The tuning panel's rival pace rows now set the 100m's rival cadence.
- Unchanged: hurdles, relays and the field events' run-ups (they still use
  `CONFIG.ai`'s reaction).

## 1.0.1 — World records come from the global leaderboards
- **What happened:** each event's world record was a fixed number (in
  `registry.js`, and the pole vault's WR flag had its own 6.95). Players had
  already beaten three of them (100m 8.52 vs 8.90, long jump 10.53 vs 9.86,
  hurdles 11.38 vs 11.58), so the game showed records that weren't records.
- **Now:** an event's world record is the best mark on its global board
  (new `src/online/worldRecords.js`). It shows on the intro screen, the
  results, the javelin's WR board and the pole vault's WR flag.
  - Read at the menu (each board's top mark, at most once a minute; guests
    too, the boards are public), and again whenever you open a board or your
    mark goes to #1.
  - Kept on the phone, so it shows at once and offline. Before the phone has
    ever read a board it shows "—" and no WR marker.
  - "NEW WORLD RECORD!" means you beat the board's top mark (with shipped
    tuning, like a personal best).
- **Special events** (4×100m relay, Time Trial) have no board, so they keep
  their worked-out targets.

## 1.0.0 — App version on the tuning screens; one arc off the pole
- **Version:** new `src/version.js`, starting at 1.0.0.
  - Shown on the tuning screens: the event list and each event's settings
    ("Tuning v1.0.0").
  - "Copy changes" starts with it too ("Track Royale v1.0.0 tuning
    changes:"), so you can tell which build a phone is running.
  - Bumped on every push to master.
- **No more double jump.** The flight used to be three pieces:
  - a speed ramp that paused you at the top;
  - a hop up;
  - a separate curve sliding you sideways to the bar.

  On a low vault that read as a second launch sideways.
- **One arc instead:** thrown from where you let go, with a steady forward
  speed and gravity. It carries on the swing's own motion, which fades into
  the arc over 0.08 s, with no pause.
  - **Faster goes higher:** the arc's height is your mark (v²). A fast vault
    arcs up and peaks over the bar. A slow one lifts a little off the top and
    comes down through the bar at its mark.
  - **Forward speed** is whatever passes the standards at your mark. If that
    would land you off the mat, the arc is aimed through the bar and down
    onto the far end of the mat instead.
  - Hips vs bar at the standards: 2.46 / 2.46, 3.58 / 3.59, 6.17 / 6.18,
    6.93 / 6.93.
  - Landings are 2.6–5.7 m out, all on the mat.
- **Removed:** `landX` (where you land now follows from the arc) and its
  "Landing spot" tuning row.
- **Video updated:** `docs/pole-vault-compare/vault-slow-vs-fast.mp4`.

## Pole vault: you let go when both thumbs are up, and an early release shows
- **What happened:** a fast, well-planted vault scored a 43% release (2.76 m).
  That's exactly the score for letting go right at the plant. The release was
  the first thumb to come up, so a thumb still lifting from the last stride,
  or slipping for a moment, ended the vault. The swing still played to the
  top, so it looked fine and the score seemed random. Reproduced in the test
  rig: 47%, 2.69 m.
- **Release = both thumbs up** (`Thumbs.anyDown`). One thumb coming up isn't
  a release. A touch cancel still counts as that thumb coming off.
- **Let go early and you come off the pole then,** so you can see it:
  - Was: the swing played to the top whatever you did.
  - Now: you leave the pole from wherever you are in the swing, as you held
    it.
  - New `flight.leaveFrom` 0.5: never before half way through the swing. Even
    letting go at once, the original rides the pole about half way.
- **Release scoring unchanged** (the curve in `release.late` / `early`).
- **Tests:** #13 and #19 now expect the release at the second thumb. New tests:
  - #15c: a slip or a stride thumb lifting isn't a release.
  - #15d: let go early and you leave the pole then (half way at the earliest).
- **Tuning** (Pole Vault: look): Earliest off the pole.

## Pole vault: Zachary's tuning from the phone
Copied from the tuning panel:

| Setting | Old → new |
|---|---|
| `release.late` (late release: gone by) | 0.235 → 0.6 s |
| `release.early` (early release: gone by) | 0.85 → 1.2 s |
| `zoneDistance` (plant zone) | 15 → 17 m: about 1.53 s from the pads to the plant at 40 km/h |
| `press.miss` (run-through) | 0.38 → 0.5 s |
| `pole.sparkDelay` (spark start) | 12% → 10% of the zone |
| `release.window` (held too long after) | 0.5 → 1.0 s |
| `pole.carryAngle` (carry angle) | 45° → 40° |
| `pole.dropShare` (pole drop) | 50% → 85% of the zone |

- **The release is much more forgiving.** At top speed: on time 6.47 m, 0.17 s
  late 6.33, 0.3 s late 5.66, 0.33 s early 5.26, letting go at once 2.81.
- Simulator: casual 3.63 m, good 4.50, expert 5.82, perfect 6.50; Amateur
  rivals 3.66, Pro 5.15 (medians).
- Tests #14 and #15b now follow the config instead of the old numbers:
  - #14 holds from just before the plant window opens.
  - #15b checks that the release fades to nothing at `late` and `early`.

## Pole vault: you go over the bar at your mark
- After the same swing to the same top of the pole, a low vault crossed the
  standards far above its bar: hips at about 6 m over a 2.5 m bar.
- In the original's slow 2.84 m vault, the athlete hops off the top, arcs
  forward and down, and goes over right at the bar, then drops onto the mat.
- Ours now does the same. The flight passes the standards at your mark (drawn
  ×1.2):
  - High vault: at the peak, as before.
  - Low vault: on the way down.
- Hips at the standards vs the bar, now:

  | Mark | Hips | Bar |
  |---|---|---|
  | 2.11 m | 2.49 | 2.53 |
  | 3.05 m | 3.65 | 3.66 |
  | 4.28 m | 5.12 | 5.13 |
  | 5.82 m | 6.99 | 6.99 |

- The face-down-over-the-bar pose comes as you cross. At least 0.4 s is left
  after it to land, so a late crossing doesn't rush the landing.
- Video updated: `docs/pole-vault-compare/vault-slow-vs-fast.mp4`.

## Pole vault: the same swing every time, as in the original
- **What was wrong:** a weak vault left the pole bent at the top so your hips
  matched your mark (`topChord`). On a slow vault the mark is low, so the pole
  curled into a hairpin, and the slow swing made it obvious.
- **The original's way:** the swing is the same animation on every vault. The
  pole always straightens fully to upright, and you reach the same handstand
  on top of it. Speed only sets the pace: a slow vault swings slower (already
  the case, `swing.speedPower`).
- **The height is in the leap off the top:**
  - A high mark leaps up to it: 1.4 m off the pole at 5.8 m.
  - A low mark barely leaves the pole: the `flight.push` 0.4 m hop, scaled
    down for low marks (0.2 m at 2.4 m).
  - The bar still stops at your mark (drawn ×1.2), below you on a low vault,
    as in the original.
- **Dropping off the pole:** now only when the release is worth less than the
  new `flight.dropBelow` (15%). That's the original's 1 m vaults. It used to
  happen whenever your mark was below your hips.
- **Removed:** `topChord` / `predictChord` and the vault's `cTop`.
- **Heights unchanged.** Video:
  `docs/pole-vault-compare/vault-slow-vs-fast.mp4` (the original's 2.84 m and
  6.62 m vaults over ours at 70% and full speed).
- **Tuning** (Pole Vault: look): Drop off the pole below.

## Pole vault: no meter marks on the standards
- The 1–7 m marks and numbers on the far upright are gone. The vault is drawn
  `flight.heightScale` (1.2×) higher than its mark, so they no longer matched,
  and they were distracting.
- The red WR flag now sits where a world-record vault is drawn (6.95 m ×
  1.2), and the posts are tall enough to hold it. The red arrow for your last
  vault was already at its drawn height.

## Pole vault: the original's speed and release curves, smoother animation
Fitted to the second batch of footage (`docs/pole-vault-original.md`).
- **Height is all speed (v²), as in the original:**
  - `height` was `base` 1.8 + `effMin` 0.32–`effMax` 0.58 weighted by
    `plantWeight` / `releaseWeight` 0.2 / 0.2.
  - Now `base` 0 + `eff` 0.8 × release quality × v² / 2g, less up to
    `plantLoss` 0.25 for a missed plant.
  - The original's slow jump (70% of the speed) made 43% of the height; ours
    makes 49% (was 61%).
  - `height.min` 2.95 → 0.5 m: the original shows 0.73 and 1.04 m vaults.
- **Release scoring fitted to the original:** late is steep, early kinder.
  - Was a straight line to 0 at 0.5 s either side.
  - Now 0 at `release.late` 0.235 s late (curve `latePower` 3) or
    `release.early` 0.85 s early (`earlyPower` 1.3).
  - Ours vs the original at top speed:

    | Release | Ours | Original |
    |---|---|---|
    | On time | 6.58 m | 6.62 m |
    | 0.06 s late | 6.47 m | 6.14 m |
    | 0.17 s late | 4.09 m | 4.24 m |
    | 0.22 s late | 1.18 m | 1.04 m |
    | 0.33 s early | 4.65 m | 4.41 m |
    | At once | 0.77 m | 0.73 m |

  - `release.window` 0.5 s now only sets when holding on becomes a foul.
- **Swing time vs speed:** new `swing.speedPower` 0.4, `swing.timeAt10` 0.9 →
  0.85 s.
  - The swing is `timeAt10 × (10 / speed) ^ speedPower` (was × 10 / speed).
  - The original's 30% slower plant swung only ~15% longer. Ours is now 0.77 s
    at full speed and 0.89 s at 70% (original 0.78 / 0.9).
- **Simulator:** casual 3.63 m, good 4.54, expert 5.86, perfect 6.60.
  Amateur rivals 3.56, Pro 5.15 (medians), still level with the players they
  face. It now counts holding on past the window as a foul.
- **Smoother animation.** Found by recording every frame headless and
  measuring how far each joint, the pole and the camera move per frame. The
  worst one-frame jump was 3.2 m; now none is bigger than a running stride.
  - **The swing no longer stops and starts.** Its keyframes (pole angle, bend,
    body angle, legs) were each eased in and out, so the hips nearly stopped
    four times on the way up (speed 12 → 2 → 14 → 1 → 20 → 2 m/s). Now one
    smooth curve runs through them (`smoothKeys` in stickFigure.js).
  - **No pop at the plant:** the run's pose and hips blend into the swing over
    0.16 s (they jumped 40 cm). The camera's plant jolt plays over 0.05 s
    instead of one frame.
  - **The top hand swings up round the shoulder:** it used to go straight
    through the shoulder on the way from the hip to overhead, flipping the
    elbow.
  - **The bottom hand lets go smoothly:** its arm follows at most 12 rad/s
    (it snapped 30 cm).
  - **Letting go:**
    - The push off the top eases in over 0.1 s instead of jumping to full
      speed.
    - A pole still bent springs straight over 0.22 s (it jumped 3 m to full
      length).
    - Forward speed carries smoothly through the peak (it changed pace at the
      bar).
    - The pole no longer re-bends while you wait at the top.
  - **Weak vaults:** you always push up off the pole (a weak vault teleported
    2 m to the bar). Let go far too late and you drop off the top onto the
    front of the mat, as the original's 1 m vaults do, instead of flying high
    over a low bar.
  - **Flight poses:** each limb turns the short way round (the arms spun the
    long way just before landing).
  - **After a held-too-long foul:** you stay facing the way you fell, and the
    camera stays on you instead of panning to the mat.
- **Tuning** (Pole Vault: height / timing):
  - New: Pole efficiency, Fixed height, Missed plant costs, Late / Early
    release (gone by, curve), Swing vs speed.
  - "Release window" is now "Held too long after".

## Pole vault: matched to the original's footage
Measured frame by frame from Zachary's recordings of the original; the
numbers are in `docs/pole-vault-original.md`, side-by-side frames in
`docs/pole-vault-compare/`.
- **Plant zone** `zoneDistance` 18 → 15 m. The original's pads light 1.37 s
  before the plant; ours took 1.65 s at 41 km/h, now 1.37 s.
- **Spark start** new `pole.sparkDelay` 0.12: the spark waits at your hands
  for the first 12% of the zone (the original's sets off ~0.17 s after the
  pads), and still reaches the tip at the plant.
- **Carry angle** `pole.carryAngle` 40° → 45°: the original's pole is at
  about 45° as the pads light.
- **Held on too long is a foul** new `release.heldFoul` 1: hold past the
  release window and you stall upside down on the pole, topple back with it
  onto the runway, get up: NO HEIGHT, "held on too long". In the original,
  holding on past the handstand is a FOUL; ours used to let you go anyway for
  a weak height. 0 = the old way.
- **Off the pole:**
  - `flight.gravity` 6 → 7.5 m/s², least `flight.push` 0.6 → 0.4 m.
  - The original's best vault pushes ~1.7 m off the top of the pole, rising
    for ~0.8 s, and its flight time grows steeply with height: 1.23 s at
    4.24 m, 1.45 at 5.06, 1.8 at 6.14, 1.95 at 6.62.
  - Ours now: 1.37 s at 4.3 m, 1.57 at 5.2, 1.94 at 6.0, rising 0.65 s on the
    big one (was 1.49 / 1.61 / 1.73, always 0.44 s up).
- **Drawn higher** new `flight.heightScale` 1.2: the vault and the bar are
  drawn 20% higher than your mark, so it looks bigger. Look only: the mark and
  scoring are unchanged. A good vault now reaches past the top of the pole, so
  the big push off it reads (Zachary's idea).
- **Landing** `landX` 3.6 → 4.0 m: the original lands ~2 m past the standards.
- **Back on your feet sooner** new `standUp` 0.9 s (was 1.9 s built in), and
  `markHold` 2.4 → 1.1 s. The original's height shows ~0.9 s after landing.
- **Camera framing**, measured against the original:
  - New `camera.lead` 3.5 m, `zoneLead` 2 m, `flyLead` 0.6 m.
    - You were at ~57% across the screen running and ~45% at the plant.
    - Now 37% running and 28% at the plant (the original: 37% and 27%), so
      the box and mat come into view.
    - Off the pole the camera drifts back toward you: 44% at the peak
      (original 45%).
  - New `camera.drop` 0.17: the runway sits lower without zooming in. Feet
    were 64% down the screen, now 82% (original 83%). The athlete's size
    already matched (25% of the screen height; original 26%).
  - New `camera.plantKick` 0.45 m: the camera jolts back as the pole bites,
    as the original's does.
- **Heights** barely move (the shorter zone keeps a little more speed):
  simulator casual 4.44 m, good 5.08, expert 6.03, perfect 6.57; Amateur
  rivals 4.43, Pro 5.54 (medians).
- **Tuning** (Pole Vault: timing / look): Spark start, Held too long fouls,
  Height (drawn), Camera ahead (running / plant zone / in the air), Runway
  low, Plant jolt, Getting up, Result delay. Push off the pole is now "Least
  push off the pole".

## Pole vault: push off the pole to a bar further out
- **Standards further from the box**, as in the original: `uprightX` 0.25 →
  2.2 m. The mat starts just past the box (`mat` 0.0–5.2 → 0.5–6.5 m) and you
  land further on (`landX` 1.3 → 3.6 m).
- **The push:** off the top of the pole you fly forward to the bar, reaching
  it at the peak of your flight, then drop onto the mat. The pole falls back
  behind you, so it's well away from you over the bar. New `flight.push` 0.6 m:
  how far you rise from your hips at the top of the pole to the peak (was a
  fixed 0.3 m), so the push takes longer and reads bigger.
- Tuning (Pole Vault: look): Standards distance, Push off the pole, Landing
  spot.

## Pole vault: your last vault gets its card too
- Offline, the third vault shows the same card as the first two (your
  height, plant %, release %, speed and the standings); **Tap to continue**
  starts the late hits, and the results follow as before. It used to go
  straight into the late hits, so you never saw how the last one went.
- Live, the late hits still start straight away (the rounds run on the room's
  clock), but the plant / release line now shows under your mark there
  (fieldLateHits.js draws a scene's optional `markDetail()`).

## Pole vault: physics instead of timers
- **Height from energy:** `1.8 + eff × v² / 2g` (v = speed at the plant, real
  g). The pole's efficiency runs from `height.effMin` 0.32 (plant and release
  both missed) to `height.effMax` 0.58 (both perfect), the two weighed by
  `plantWeight` / `releaseWeight` (0.2 / 0.2). Speed counts more and more the
  faster you go. `height.min` 2.95 m stays as a floor. Replaces `max`,
  `speedWeight`, `slowSpeed`, `fastSpeed`. Simulator: casual 4.42 m, good
  5.03, expert 5.97, perfect 6.48; Amateur rivals 4.42, Pro 5.47 (medians).
- **The swing runs on your speed:** `swing.timeAt10` 0.9 s from the plant to
  the top at 10 m/s, scaled by 10 / speed (0.79 s at 41 km/h). The spark climbs
  over it, so a faster plant means a quicker spark and a quicker release.
  Replaces `spark.climbTime` 0.8 s.
- **The flight uses gravity:** `flight.gravity` 6 m/s² (lighter than real so
  it reads). Thrown up to peak exactly at your mark, then a free fall onto the
  mat, so higher vaults hang and drop for longer. Replaces `flight.rise`,
  `hang`, `fall`. Hips at the top of the pole are 0.3 m under the mark (was
  0.15), so there's always a little rise to turn over the bar.
- Tuning: Pole efficiency (perfect / missed), Takeoff height, Swing time at
  36 km/h, Flight gravity.

## Pole vault: Rawnald's tuning as the defaults
From the in-game tuning panel:
- `height.min` 3.70 → 2.95 m; weights speed / plant / release 0.50 / 0.25 /
  0.25 → 0.60 / 0.20 / 0.20; `height.slowSpeed` 8 → 5.75 m/s.
- `zoneDistance` 17 → 18 m; `press.window` 0.20 → 0.50 s; `press.miss`
  0.35 → 0.38 s; `release.window` 0.18 → 0.50 s.
- `pole.carryAngle` 0.80 → 0.698 rad (40°); `pole.dropShare` 0.35 → 0.50;
  `camera.zoom` 1.25 → 1.00; `swing.bend` 0.30 → 0.21; `flight.hang` 0.5 →
  0.7 s; `flight.fall` 0.5 → 0.6 s.
- Test #14 now expects a hold from before the window to score as pressed when
  it opens (no longer always 0, now the plant window is wider than the
  run-through).

## Pole vault: a slower plant, the runway low on the screen
- **The plant isn't rushed any more.** Timed from the original: about 1.5 s
  from the orange pads to the plant, with the pole down to nearly level in the
  first third and the spark crawling along it after. `zoneDistance` 12 → 17 m
  (about 1.4 s at 42 km/h), new `pole.dropShare` 0.35 (the tip used to come
  down over the whole zone), `runway` 55 → 60 m (the striding part stays the
  same length), runway edge stripes moved back to match. The top hand comes up
  over the last 25% of the zone (was 30%).
- **Framed like the original:** `camera.zoom` 1.25, from the top of the screen,
  so the athletes are bigger and the runway sits near the bottom, leaving room
  above for the vault. It eases back to the usual framing for the late hits.
- Tuning: Pole drop and Camera zoom under Pole Vault: look.

## Pole vault: 50 / 25 / 25, the hand on the end, tuning per event
- **Scoring:** height = `height.min` (3.7 m) to `height.max` (6.4 m) by a
  score that's 50% speed at the plant, 25% plant, 25% release
  (`speedWeight` / `plantWeight` / `releaseWeight`). Speed counts from
  `slowSpeed` 8 m/s to `fastSpeed` 12.5 m/s. Replaces `base` 1.4 /
  `perMps` 0.4 / `vRef` 9 / `gain` 4.0 / `pressWeight` 0.5.
- **What you see is your mark.** The top of the swing used to stop at 70% of the
  pole however weak the vault, so a 2.96 m vault went up past 4 m. Now a weak
  vault leaves the pole as bent at the top as it takes, and the flight peaks
  exactly at your mark. `swing.topBend` removed.
- **The hand you see holds the end of the pole**, the whole time: the near arm
  is now the top hand (at the back hip running, overhead at the plant, on the
  end up the pole), the far arm the bottom hand. Both are drawn gripping the
  pole.
- Pole length and grip changes apply from the next attempt.
- **Tuning per event:** the Tuning button opens a list of the five events.
  Pick one to play it with a ⚙ under the ✕: it pauses the game and opens that
  event's settings, then the shared running ones. All settings is still there.
  New `src/tuning/gear.js`; groups in params.js say which events they're for.
- **Pole vault settings:** height (lowest, highest, the three weights, the
  speed range), timing (plant zone, plant window, run-through, spark climb,
  release window) and look (pole length, carry angle, hand spread, bend,
  rise / hang / drop).

## Pole vault: held like a real vaulter, a longer pole
- **Two hands on the pole**, as a right-handed vaulter holds it: the top hand
  (far arm) on the very end at the back hip, the bottom hand (near arm) about
  `pole.grip` 0.55 m up the pole in front of the chest, tip up and forward.
  Through the plant zone the tip drops to the box and the top hand drives up
  overhead. On the pole the top hand stays on the end; the bottom hand keeps
  hold while it can reach. The arms are solved to the pole every frame
  (stickFigure.js armIK), so the hands never drift off it.
- The pole is drawn over the body (it passes the near side), with the near
  hand over it.
- `pole.length` 3.6 → 4.5 m, `pole.carryAngle` 0.9 → 0.8 rad. The plant is
  4.0 m out. While you run, the camera rises if it needs to so the tip stays on
  screen.

## Pole vault: upside down on the spark, a shorter pole
- **The swing is timed to the spark.** You reach the top of the pole, upside
  down and straight with the pole upright, exactly as the spark reaches your
  hands, on every vault: a bad plant or release no longer leaves you short of
  vertical. The swing used to run on its own clock (`poleVault.swing.time`
  1.1 s → removed, with its slider), so at the best release you were only
  halfway round. Press late and the swing waits for you; let go early and it
  still finishes, then you come off. A weak vault leaves the pole a little
  bent at the top (at most `swing.topBend` 0.3 of it), so you're lower.
- `poleVault.spark.climbTime` 0.6 → 0.8 s: it's now the swing's length too,
  and 0.6 s rushed it.
- **Shorter pole**, so it stays on screen: `pole.length` 4.0 → 3.6 m,
  `pole.carryAngle` 1.05 → 0.9 rad. The plant is 3.0 m out (was 3.5).

## Pole vault: the spark means what it shows
- **Release on the spark.** The best release is now exactly when the spark
  reaches your hands. It used to be 0.15 s *after* it got there
  (`poleVault.release.lead` 0.15 → removed, along with its tuning slider), so
  letting go as the spark arrived scored only about 17%.
- **The spark climbs from the plant.** Pressed a little early, the spark
  still runs all the way down to the box and climbs back from the plant, and
  the release is timed from there. It used to jump straight to the tip at your
  press and time the release from the press. Pressed late, it waits at the tip
  and climbs from your press, as before.
- **You hold the very end of the pole**, from the run-up to the top
  (`poleVault.pole.overhang` 0.45 m → removed). The spark runs the full pole,
  end to tip.
- The hands come up for the plant over the last 30% of the plant zone instead
  of snapping up over the last 12%.

## Live survival
- **New: Live → Survival.** Up to ten people, the five events in a random
  order again and again; last place in each event is out, last one standing
  wins. Everyone tied for last goes, unless that's everyone left (then nobody
  does and the event doesn't count). Leaving or dropping off is out.
- Out: where you finished, then live standings until there's a winner.
  Points add up but aren't shown; yours go on a hidden XP total.
- **The Colosseum**, its venue: ten lanes on a track twice as deep, the
  velarium, arches, seats full of togas, a marble podium wall. Far runners
  shrink more with distance on a ten-lane track.
- Waiting rooms: survival's takes ten and stays open 60 s
  (`liveRules.js` maxPlayers / startDelay); **any full room now starts
  straight away** (it used to wait out its countdown with nobody able to join).
  The meet server needs redeploying for this.

## Survival: statues in the ruins
- The Lost Stadium's stand has ruins on its tiers: carved stone statues in
  the style of the Andean monoliths (square head with a headdress band,
  square eyes, a slit mouth, arms carved across the chest, on a plinth),
  some leaning, some headless with the head toppled at their feet, and pairs
  of broken columns, all mossy, between the trees and under the vines. On
  the Survival card and the event card too. New `src/render/ruins.js`
  (drawMonolith, drawColumn); venues.js `overgrowth.ruins` colors.

## Survival: a two-lane showdown, an empty stand, Quechua names
- **Two lanes**: the 100m and the hurdles in Survival are just you and him
  (laneRace.js). The Lost Stadium has its own `layout` (venues.js): the
  track's far edge and the horizon 100 px lower, a narrow strip of grass,
  and the stand right behind it, nearly three times as tall (26 to 300 px,
  was 26 to 128); the near edge stays put, so the athletes are the same
  size. Every event uses it, field events too. Renderers now read the
  layout from the venue (`this.L`, track.js LAYOUT by default).
- **No crowd**: the stand is bare stone tiers (the leaves and flowers where
  the crowd sat looked like a crowd), the canopy scaled to the taller stand.
- **The rival's names are Quechua** (Inti, Amaru, Yupanqui, Wayra, Kusi,
  Tupac…), one a round.

## Survival: The Lost Stadium, and a new rival
- **A venue of its own**: The Lost Stadium, an old stadium overgrown by the
  jungle (render/venues.js JUNGLE). Weathered stone stand with leaves and
  flowers where the crowd sat, the canopy rising over it, moss down it and
  vines hanging from the roof; a mossy stone wall with ferns for hoardings;
  faded clay with moss through it; an unmown infield; a humid sky; no lights.
  The javelin's flight shot looks out over jungle hills instead of the sea.
  A poster version (posterScenery.js lostStadium) on the Survival card and
  the event card. Venues get two new options: `overgrowth` (canopy, vines,
  moss) and `boards.kind: 'wall'`.
- **The rival**: a native South American runner, darker skin, shirtless,
  green shorts, long black hair under a red headband. Any hairstyle can now
  have a headband of its own color (`colors.band`, stickFigure.js drawHair).
- `tools/venuecheck.mjs` runs again (its canvas stub lacked setLineDash and
  curves) and checks the new venue.

## Survival starts at Pro, and gets better by less each round
- The rival's level by round (`CONFIG.survival.skill`): round 1 a weak Pro
  (0.8), round 2 a strong Pro (1.2); it was easier than Amateur, Amateur,
  between, Pro (-0.6, 0, 0.5, 1). Survival is meant to be hard. After that
  he closes a fifth of the gap to 1.9 each round, so each step is smaller
  than the last (1.34, 1.45, 1.54...). By the simulator a strong player
  lasts to about round 2 or 3 (was 6 to 8); his long jump passes an
  expert's in round 3.
- Every round at the Olympic Stadium (was Westfield High for rounds 1 and 2).

## Survival mode
- **New: vs Computer → Survival**, as in the original. You against one
  computer rival (a new athlete: big, in red), the five events a round in a
  random order. Beat him in all five and the next round starts, against the
  same rival under a new Russian first name, a little better. Lose any event
  and it's game over. Every event scores decathlon points, as in the
  tournament, added up over the run; the game over page shows rounds
  survived, events won, your total and your best.
- **His level**: round 1 easier than the Amateur rivals, round 2 Amateur,
  round 4 Pro, then on towards near perfect, without end
  (`CONFIG.survival` skill [-0.6, 0, 0.5, 1], then a fifth of the way to 1.9
  each round). Every rival setting is blended between its Amateur and Pro
  values, or carried on past them (`survival.js` blend). `tools/simulate.mjs`
  has a Survival table of his marks by round: a strong player should last to
  about round 6 to 8 (the long jump goes first).
- A tie keeps you in; no mark loses unless he has none either.
- **Survival leaderboard** (total points), a new tab on the Leaderboard.
  Needs the new `firestore.rules` pasted into the Firebase console (it adds
  the `survival` board, up to 1,000,000 points); until then posting and
  reading it fail quietly.
- Venues: Westfield High for rounds 1 and 2, then the Olympic Stadium. The
  vs Computer page lays its five cards out three across (two on a narrow
  screen). New `test/survival.test.mjs`.

## Results in the corner; the javelin's mark line stands straight
- **The results over the late hits move to the top right**, so the middle
  of the screen is clear for the fighting. The text stays big enough to read
  at a glance; the sheet is just as wide as its rows (no gap between the
  names and the marks) and the titles are shorter. Squad meets too: the
  event's places (every heat) and the squads' totals sit side by side in the
  top right, each sheet as wide as its rows (`meetStandingsScene.js`). Every event's results and the tournament's two
  pages; the buttons stay along the bottom. `brawl/aftermath.js` ResultsPanel.
- **Javelin: the line marking where it landed runs straight up the screen**,
  like the field's stripes and distance boards in that side-on shot. It used
  to lean as if the field were in perspective.

## Make your own athlete
- **The Athlete Maker**, Mii style: the Athlete tab's last card, CREATE.
  Skin (10 tones), hair (10 styles, three of them new: bald, mohawk, long),
  hair colour (12), shirt (14), shorts (10), height (2/3 to 1.08 of
  everyone, as Joey to a bit taller) and build (to Chonk's), a name (up to 12
  letters; starts as your username), and Random. Your athlete warms up on
  the left and reacts to every change. Save makes them yours; tap their card
  again, or Edit on the big card, to change them. Keyboard: E opens it, R
  rolls, Enter saves, Esc cancels.
- They go everywhere the cast does: every event and the tournament, your
  account (the athlete you play as syncs), live rooms and meets (the others
  see them; an older build shows Juno), ghosts, and the sideshow. Playing as
  them, the cast member in the closest shirt sits out: still five rivals.
- How: a made athlete's id is a short code of its look and name
  (`src/athletes/custom.js`, at most 21 characters), so the server, the
  database rules and the progress doc are unchanged. New
  `test/custom.test.mjs`.

## New app icon: golden hour
- The home-screen icon is the golden-hour stadium (a track in a stone bowl
  under a mountain at sunset): `icon-192.png`, `icon-512.png` (also the
  maskable one) and `apple-touch-icon.png` replaced; the browser tab uses the
  new `favicon-16.png` / `favicon-32.png`. The old `icon.svg` is gone.
- Already added to your home screen? Remove it and add it again to pick up the
  new icon (iOS keeps the one it saved).

## Tournament: each event's results, then the standings
- **Between tournament events you see the event's results again** (places,
  marks and the points each mark scored), not just the totals. Over the late
  hits it's two pages: the results first, then **Standings ›** for the overall
  totals with Next (after the last event: **Final standings ›**, then New
  tournament). Enter / Space turn the page too.
- **Live, the pages turn by themselves**: the results for half the time to
  the next event's title card, at least 2 s and at most 5 s
  (`standingsScene.js` `ROUND_MIN` / `ROUND_MAX`), then the standings. The
  button counts down to the next event on both pages, and a tap on it turns
  the page early. No change to the wait between events.

## Home screens: the sideshow
- **The other athletes act up in the background** of the Athlete, Play and
  Squad tabs, one short skit at a time, two on screen at once: the referee
  punched out for showing a red card (then he chases them off), a body slam,
  the referee stepping between two fighters and getting launched by both,
  a dance-off settled with a kick, a baton thief and a flying tackle into the
  track, a hurdler who faceplants at the second hurdle and kicks it away, a
  javelin that lands at the referee's feet, and a long jump that ends face
  first, a red flag and the referee booted. Comic POW bursts and dust; no
  emoji over anyone's head (as the emotes).
- Play: on the track either side of your athlete, in the far lanes (your own
  athlete never takes part); the vs Computer pages too. Athlete: along the
  bottom under the cards. Squad: on the hills, until you're in a squad.
- **Eight more**, sixteen in all: a false start (the gun goes off and the
  early one hits the deck; the other one wins), a cartoon fight cloud that
  spits three of them out flat (they get up, glare, and dive back in), a pole
  vaulter who clonks the referee on the way past and again on the way back,
  a winner dropkicked at the line by the runner-up (who leaves with the gold),
  the referee chasing someone who turns round and flexes (now he's the one
  running), a sleeping referee who gets hurdled, tripped over, and gives out
  a red card for it, a conga line he ends up joining, and a relay handover
  where the new runner sprints off the wrong way. Less wait between skits
  (1–3.5 s, was 1.5–5 s).
- New `src/scenes/home/sideshow.js` (the stage and the scheduling) and
  `skits.js` (the skits), built from the late hits' poses
  (`brawl/poses.js`) and the events' (`stickFigure.js`); no gameplay change.
  `tools/sideshow.html` plays every skit, scrubbable; `test/sideshow.test.mjs`
  plays each one through, both ways round, on a narrow and a wide screen.

## Live: a half-minute waiting room with I'm ready, and less standing around between events
- **The waiting room stays open 30 s** once a second player arrives (it was
  4 s: `START_DELAY` 10 s minus the 6 s `CLOSE_BEFORE` hand-over), so friends
  have time to get in. `liveRules.js`: new `OPEN_FOR` 30 s, and `START_DELAY`
  10 s → 36 s (`OPEN_FOR` + `CLOSE_BEFORE`).
- **I'm ready.** Once someone else is in, an I'm ready button (Enter / Space on
  a keyboard) sits beside Leave; tap again to take it back. Each ready player
  gets a ✓. When every player in the room is ready, the server
  (`lobbyCore.js` `ready`) brings the start forward and everyone goes at once;
  anyone not ready holds the room until the 30 s run out, and the one player
  not ready leaving starts the rest. Squad Practice rooms get it too.
- **Between events, half the wait.** `online/live.js` `EVENT_LEAD` 22 s → 11 s
  from everyone finishing a tournament event to the next one's gun (standings
  4 s, the title card 3 s, READY / GET SET 4 s: `TITLE_CARD` 8 s → 7 s), and
  `ROUND_LEAD` 6 s → 3 s between field-event rounds.
- Needs the meet server redeployed for the 30 s and I'm ready; until then the
  game still works against the old server (the button just does nothing).

## Orange pads: a hold registers like a tap, and they blink as in the original
- **Holding the orange pads works.** Only the instant a finger went down used
  to count, inside a narrow window, so a deliberate press-and-hold often did
  nothing however long you held it: in the long jump and the lean the thumbs
  had to land within 0.08 s / 0.06 s of each other (a hold usually lands them
  further apart: no takeoff, an overrun foul, no lean); a thumb still down from
  the last stride was never counted (long jump, pole vault, javelin); thumbs
  down as the lean pads lit never leaned; a pole vault hold started before the
  plant window balked; holding from the takeoff never stretched. A quick
  re-tap worked, which is why it felt like you had to tap them.
  New `src/core/thumbs.js` keeps which thumbs are down from every press and
  lift (the long jump and the lane races now get the lifts too:
  `wantsReleases`), and each orange pad is checked every step: both thumbs
  down, at least one pressed since the pads lit, with no timing window for a
  hold. A snap tap goes through exactly as before. Releases are unchanged:
  the pole vault release, the javelin throw and the javelin's angles.
  - Long jump takeoff: as soon as both are down; a thumb from the run-up
    counts once the other is pressed in the zone. Both already down when the
    pads lit and never pressed again: still no takeoff (overrun foul).
  - Long jump stretch: a press up to `stretch.grace` (new, 0.12 s) before the
    top, still held at the top, stretches right at the top; a thumb held since
    the takeoff counts once the other is pressed then. Both held all the way
    from takeoff: no stretch (new `stretch.holdThrough` false; true stretches
    at the top at `holdThroughK` 0.5 of the kick). Open with Zachary.
  - Finish lean (100m, hurdles, relay anchor): thumbs held from the start of
    the zone lean at `armDelay` (0.3 s); presses before then still don't lean
    on their own (stray stride taps).
  - Pole vault: a hold from before the plant window plants as it opens instead
    of balking. It scores as pressed then, `press.miss` early, so plant quality
    0 (new `press.earlyHoldOnTime` false; true scores it as on the plant). Open
    with Zachary.
  - Javelin: a thumb from the run-up counts once the other is pressed.
  - Key releases now reach the 100m, hurdles, relay and long jump: they only go
    to the thumbs and the late hits (whose stick and walking keys now let go
    in the race scene too), never to strides, the countdown or "next round".
    A Space keyup no longer advances the mark banner in the pole vault or javelin.
  - Hardening: `selectstart` blocked, the callout and selection turned off on
    the canvas itself, and a `touchcancel` (an iOS edge gesture) shows as
    "cancel" on the tap markers; it still ends a hold and counts in
    `stats.cancels`.
- **Blink** (physics audit items 1–4: the original's pads are on 0.30 s, off
  ~0.30 s, in every event): `longJump.blink`, `javelin.blink`,
  `poleVault.blink` `{ period 0.36, on 0.24 }` → `{ period 0.6, on 0.3 }`. The
  lean pads in the 100m and hurdles (and the relay anchor's) were steady; they
  now blink with the new `dip.blink` `{ period 0.6, on 0.3 }`. Looks only:
  a press counts in the off half too. The long jump's stretch pads at the top
  of the jump stay steady.
- `javelin.chordWindow` and `poleVault.chordWindow` (0.12) are no longer read:
  both down counts however far apart. `longJump.chordWindow` (0.08) and
  `dip.chordWindow` (0.06) still take a snap tap whose first thumb has already
  lifted.
- Tests: test/orangePad.test.mjs runs the real long jump, pole vault, javelin,
  100m and hurdles scenes through the real Input with synthetic touches and
  keys (test/helpers/), for the spec's 22 cases, plus test/thumbs.test.mjs.
  13 of them fail on the previous build. The 100m and a long jump run-up give
  the same hits, misses and times as before for the same taps, and a held
  lean replays exactly from the ghost. `node tools/simulate.mjs` is unchanged.

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
