// Looks at or changes the shop (shop/current in the database: src/economy/shop.js)
// from your computer, through the same admin access the server uses
// (src/firestoreAdmin.js). The server shows a change within a minute.
//
//   FIREBASE_SERVICE_ACCOUNT_FILE=~/keys/track-royale.json node tools/shop.mjs show
//   ... node tools/shop.mjs add <offer.json>     add an offer (or offers: a list), replacing any with the same id
//   ... node tools/shop.mjs remove <offer id>    take an offer out
//   ... node tools/shop.mjs replan               plan the server's own offers again from today (shopPlan.js)
//
// An offer file, e.g. a weekend sale:
//   { "id": "sale-lava", "section": "weekly", "title": "Lava spikes, half price",
//     "grants": [{ "item": "spikes-lava-01" }], "price": { "earned": 750 },
//     "level": 1, "limit": 1, "from": 0, "until": 1795000000000, "sort": -1 }
// (`from`/`until` in ms, 0 for none; src/economy/shop.js lists every field.)
// The server's own offers are `auto` and get replaced when it plans again; yours
// aren't, and stay until they're over or you remove them. Keep the key file out
// of the repo.
import { readFileSync } from 'node:fs';
import { readShop, writeShop } from '../src/firestoreAdmin.js';
import { topUp } from '../src/shopPlan.js';
import { cleanOffer, cleanOffers, isLive } from '../../src/economy/shop.js';

const [cmd, arg] = process.argv.slice(2);
const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
if (!file || !['show', 'add', 'remove', 'replan'].includes(cmd) || ((cmd === 'add' || cmd === 'remove') && !arg)) {
  console.log('usage: FIREBASE_SERVICE_ACCOUNT_FILE=<key.json> node tools/shop.mjs show | add <offer.json> | remove <offer id> | replan');
  process.exit(1);
}
const key = readFileSync(file, 'utf8');
const env = { FIREBASE_SERVICE_ACCOUNT: key, FIREBASE_PROJECT: JSON.parse(key).project_id };
const when = (ms) => (ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : '-');
const line = (o, now) =>
  `${isLive(o, now) ? '*' : ' '} ${o.id.padEnd(34)} ${o.section.padEnd(8)} ${o.auto ? 'auto' : 'hand'}  ${JSON.stringify(o.price).padEnd(30)} ${when(o.from)} → ${when(o.until)}  ${o.grants.map((g) => g.item ?? `${g.amount} ${g.currency}`).join(' + ')}`;

const shop = await readShop(env);
const now = Date.now();
if (cmd === 'show') {
  console.log(`${shop.offers.length} offers (* on sale now), planned to day ${shop.plannedTo}:`);
  for (const o of shop.offers) console.log(line(o, now));
} else if (cmd === 'add') {
  const read = JSON.parse(readFileSync(arg, 'utf8'));
  const list = Array.isArray(read) ? read : [read];
  const added = list.map((raw) => {
    const o = cleanOffer({ ...raw, auto: false });
    if (!o) throw new Error(`not an offer the shop can sell: ${JSON.stringify(raw)}`);
    return o;
  });
  const ids = new Set(added.map((o) => o.id));
  await writeShop(env, { offers: cleanOffers([...shop.offers.filter((o) => !ids.has(o.id)), ...added]), plannedTo: shop.plannedTo });
  for (const o of added) console.log(`added ${line(o, now)}`);
} else if (cmd === 'remove') {
  if (!shop.offers.some((o) => o.id === arg)) {
    console.log(`no offer ${arg}`);
    process.exit(1);
  }
  await writeShop(env, { offers: shop.offers.filter((o) => o.id !== arg), plannedTo: shop.plannedTo });
  console.log(`removed ${arg}`);
} else {
  const next = topUp({ offers: shop.offers, plannedTo: 0 }, now);
  await writeShop(env, next);
  console.log(`planned to day ${next.plannedTo}: ${next.offers.length} offers`);
}
