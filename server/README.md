# The meet server

Squad meets (see [docs/meets.md](../docs/meets.md)) and all live play run on
this Cloudflare Worker: one **SquadHub** Durable Object per squad (the meet
sign-up and its Practice waiting rooms), one **Matchmaker**, one **Meet** per
meet (its lobby, its clock, heats, scoring and the relay), one **Lobby** (the
public live waiting rooms) and one **Room** per live room (its play). The game
connects with a WebSocket; the rest of the game (accounts, squads,
leaderboards) stays on Firebase.

```
src/index.js          the Worker and the three Durable Objects (sockets, timers, RPC between them)
src/meetCore.js       a meet's rules: lobby, schedule and cutoffs, heats, results, relay legs
src/squadHubCore.js   a squad's sign-up: the first four, then off to a lobby
src/matchmakerCore.js which lobby a squad goes in
src/socket.js         the WebSocket handshake (hello with a Firebase ID token), pings for the clock
src/auth.js           checks the Firebase ID token against Google's keys
src/firestore.js      reads a squad's members from Firestore (public), to let only them in
src/lobbyCore.js      live waiting rooms (public ones in the Lobby, Practice in each SquadHub)
src/roomCore.js       one live room's play: passes each player's updates on to the others
```

The `*Core.js` files don't touch Cloudflare's APIs, so the tests run them on a
fake clock. They import the rules the game uses too (`../src/meet/*.js`,
`../src/config.js`, `CONFIG.meet` for every timing).

## Run it locally

```sh
cd server
npm install
npm test                 # the rules, on a fake clock
npm run dev              # the Worker on http://localhost:8787, with test sign-ins allowed
```

`npm run dev` sets `DEV_AUTH`, which lets a socket sign in as `dev:<uid>:<name>`
instead of with a Firebase token, for bots and local tests. **Never set it on
the deployed Worker.** With it you can also add `--var DEV_FIRST_EVENT:5` to start
every meet at its 5th event (the relay), to test one event without the rest.

Bot squads (`tools/bots.mjs`) sign up, ready up and post plausible marks, so a
whole meet runs without 24 people:

```sh
node tools/bots.mjs --squads 6 --meets 2 --drop 0.1   # two six-squad meets, a few bots dropping out
```

To play with them in the game, serve the game (`python3 -m http.server 8000`
in the repo root) and open
`http://localhost:8000/?meetserver=ws://localhost:8787&devuid=me1:Pat`, then run
the bots with `--join <your squad key>:3` so three of them sign up with you.
`?meetlag=150` holds every message 150 ms each way, to try a slow connection.

## Deploy

1. A Cloudflare account (the free plan runs it; the $5/month Workers Paid plan
   lifts the limits for real traffic). Check current pricing before launch.
2. From `server/`: `npx wrangler login`, then `npx wrangler deploy`. It prints the
   address, like `https://track-royale-live.<your-subdomain>.workers.dev`.
3. Put that address, as `wss://…`, in `MEET_SERVER` in
   [src/online/net.js](../src/online/net.js) and push: the Meet button opens.

After that, pushes to `master` that change the server or the rules it shares
with the game deploy it by themselves
([.github/workflows/meet-server.yml](../.github/workflows/meet-server.yml)), once
the repo has two secrets: `CLOUDFLARE_API_TOKEN` (a token with the "Edit
Cloudflare Workers" template) and `CLOUDFLARE_ACCOUNT_ID`. Without them the
workflow only runs the tests.

The game and the server have to agree on the protocol (`PROTOCOL` in
`src/meet/protocol.js`). GitHub Pages lets phones keep the old game for about
10 minutes, so the server accepts anything from `MIN_PROTOCOL` up; a phone
older than that is told to reload.

Deploying restarts the Durable Objects, which ends any meet being played.
