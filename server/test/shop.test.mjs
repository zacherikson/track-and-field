// The shop on the server: its plan (src/shopPlan.js), the shop kept in the database
// (src/shopStore.js, src/firestoreAdmin.js) and /api/shop (src/api.js). Against a fake
// Firestore. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../src/api.js';
import { changeWallet, readShop, writeShop, readInventory, resetToken } from '../src/firestoreAdmin.js';
import { allOffers, forgetShop } from '../src/shopStore.js';
import { planOffers, topUp, shopDay, shopWeek, weeklyPicks, dailyPicks, PRICES, HORIZON, AHEAD } from '../src/shopPlan.js';
import { ITEMS, itemById } from '../../src/economy/items.js';
import { liveOffers } from '../../src/economy/shop.js';
import { PROJECT, env, fakeGoogle } from './fakeGoogle.mjs';

const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 26, 15); // a Monday
const day = shopDay(NOW);
const base = `projects/${PROJECT}/databases/(default)/documents`;

function server() {
  resetToken();
  forgetShop();
  const g = fakeGoogle();
  let now = NOW;
  const o = () => ({ fetcher: g.fetcher, now });
  const deps = {
    verify: async (t) => (t === 'good' ? { uid: 'u1', provider: 'google.com' } : t === 'guest' ? { uid: 'g1', provider: 'anonymous' } : null),
    change: (e, uid, ch) => changeWallet(e, uid, ch, o()),
    offers: (e, t) => allOffers(e, t, { read: (x) => readShop(x, o()), write: (x, s) => writeShop(x, s, o()) }),
    now: () => now,
  };
  const call = async (body, token = 'good') => {
    const res = await handleApi(new Request('https://x/api/shop', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }), env, 'shop', deps);
    return { status: res.status, ...(await res.json()) };
  };
  let n = 0;
  const give = (changes) => changeWallet(env, 'u1', changes, o());
  const coins = (currency, amount) => give({ kind: 'grant', currency, amount, reason: 'admin', ref: `t${++n}` });
  const levelUp = (days) => give(Array.from({ length: days }, (_, i) => ({ kind: 'grant', currency: 'xp', amount: 1000, reason: 'admin', ref: `xp${++n}`, day: 100 + n + i })));
  const shop = () => readShop(env, o());
  const put = (s) => writeShop(env, s, o()).then(forgetShop);
  return { g, call, give, coins, levelUp, shop, put, o, later: (ms) => ((now += ms), forgetShop()) };
}

test('the plan: basics, the week\'s picks Monday to Monday, the day\'s picks and gift, the exchange', () => {
  const offers = planOffers(day);
  assert.deepEqual(offers, planOffers(day), 'the same plan every time');
  const live = liveOffers(offers, NOW);
  const by = (s) => live.filter((o) => o.section === s);
  assert.deepEqual(by('weekly').map((o) => o.grants[0].item), weeklyPicks(shopWeek(day)).map((i) => i.id));
  assert.ok(by('weekly').every((o) => ['epic', 'legendary'].includes(itemById(o.grants[0].item).rarity) && o.from === day * DAY && o.until === (day + 7) * DAY));
  const daily = by('daily');
  assert.deepEqual(daily[0], { id: `gift-${day}`, section: 'daily', title: 'Daily gift', grants: [{ currency: 'earned', amount: 50 }], price: {}, level: 1, limit: 1, from: day * DAY, until: (day + 1) * DAY, sort: -1, auto: true });
  assert.deepEqual(daily.slice(1).map((o) => o.grants[0].item), dailyPicks(day).map((i) => i.id));
  assert.ok(daily.slice(1).every((o) => !by('weekly').some((w) => w.grants[0].item === o.grants[0].item)), 'nothing on sale twice');
  const basics = by('basics');
  assert.deepEqual(basics.slice(0, -1).map((o) => o.grants[0].item), ITEMS.filter((i) => PRICES[i.id]?.pool === 'basics').map((i) => i.id));
  assert.deepEqual([basics.at(-1).id, basics.at(-1).price, basics.at(-1).limit], ['exchange-coins', { premium: 10 }, 0]);
  for (const o of offers.filter((x) => x.grants[0].item)) {
    const item = itemById(o.grants[0].item);
    assert.deepEqual([o.price, o.level, o.limit, o.auto], [PRICES[item.id].price, item.level, 1, true], o.id);
  }
  // Every shop item has a price, and it rotates.
  assert.deepEqual(ITEMS.filter((i) => i.avail === 'shop').map((i) => i.id).sort(), Object.keys(PRICES).sort());
  assert.ok(new Set(Array.from({ length: 14 }, (_, i) => dailyPicks(day + i).map((x) => x.id).join())).size > 7);
  // Each day of the plan has its own picks; the last planned day is covered, the one after isn't.
  assert.equal(liveOffers(offers, NOW + (HORIZON - 1) * DAY).filter((x) => x.section === 'daily').length, 5);
  assert.equal(liveOffers(offers, NOW + HORIZON * DAY).filter((x) => x.section === 'daily').length, 0);
});

test('topping up: planned on when it runs low; offers made by hand are kept, the server\'s replaced', () => {
  const first = topUp(null, NOW);
  assert.deepEqual([first.changed, first.plannedTo], [true, day + HORIZON]);
  assert.equal(topUp(first, NOW + (HORIZON - AHEAD) * DAY).changed, false, 'still enough ahead');
  const sale = { id: 'sale-lava', section: 'weekly', grants: [{ item: 'spikes-lava-01' }], price: { earned: 99 }, until: NOW + 30 * DAY };
  const old = { id: 'sale-over', grants: [{ item: 'spikes-lava-01' }], price: { earned: 1 }, until: NOW + DAY };
  const later = NOW + (HORIZON - AHEAD + 1) * DAY;
  const next = topUp({ offers: [...first.offers, sale, old], plannedTo: first.plannedTo }, later);
  assert.equal(next.changed, true);
  assert.equal(next.plannedTo, shopDay(later) + HORIZON);
  assert.deepEqual(next.offers.filter((o) => !o.auto).map((o) => o.id), ['sale-lava'], 'the hand-made one that\'s over is dropped');
  assert.equal(next.offers.some((o) => o.id === `gift-${day}`), false, 'the server\'s old days are dropped');
  assert.deepEqual(next.offers.filter((o) => o.auto), planOffers(shopDay(later)));
});

test('open: an empty database gets its plan; what is on sale now comes back', async () => {
  const s = server();
  const r = await s.call({ action: 'open' });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.deepEqual(r.offers, liveOffers(planOffers(day), NOW));
  assert.deepEqual([r.inventory, r.counts, r.now, r.bought], [[], {}, NOW, null]);
  const kept = await s.shop();
  assert.equal(kept.plannedTo, day + HORIZON);
  assert.deepEqual(kept.offers, planOffers(day), 'kept in the database, read back whole');
  // A guest can look, with nothing of their own.
  const g = await s.call({ action: 'open' }, 'guest');
  assert.deepEqual([g.status, g.wallet, g.offers.length], [200, null, r.offers.length]);
  assert.equal((await s.call({ action: 'buy', id: `gift-${day}` }, 'guest')).status, 403);
  assert.equal((await s.call({ action: 'open' }, 'nope')).status, 401);
  assert.equal((await s.call({ action: 'sell' })).error, 'bad-action');
});

test('buy gear: the price out, the item in, once; refused without the level or the money', async () => {
  const s = server();
  const basic = (await s.call({ action: 'open' })).offers.find((o) => o.section === 'basics' && o.price.earned);
  const item = basic.grants[0].item;
  assert.equal((await s.call({ action: 'buy', id: basic.id })).error, 'level', 'level 1');
  await s.levelUp(1); // 1,000 XP: level 4
  assert.equal((await s.call({ action: 'buy', id: basic.id })).error, 'funds');
  await s.coins('earned', 5000);
  const r = await s.call({ action: 'buy', id: basic.id });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.deepEqual([r.inventory, r.counts, r.wallet.earned, r.bought], [[item], { [basic.id]: 1 }, 5000 - basic.price.earned, basic.id]);
  assert.ok(s.g.docs.has(`${base}/wallets/u1/ledger/spend-shop-${basic.id}-1-earned`));
  const again = await s.call({ action: 'buy', id: basic.id });
  assert.deepEqual([again.status, again.error], [409, 'owned']);
  assert.deepEqual(await readInventory(env, 'u1', s.o()), { inventory: [item], counts: { [basic.id]: 1 } }, 'kept on the account');
  assert.equal((await s.call({ action: 'open' })).wallet.earned, 5000 - basic.price.earned, 'charged once');
  for (const id of ['nope', 'spikes-plain-01', item, 12, null]) assert.equal((await s.call({ action: 'buy', id })).error, 'not-for-sale', `${id}: offers are bought by their own ids`);
});

test('the daily gift: free, once a day', async () => {
  const s = server();
  const r = await s.call({ action: 'buy', id: `gift-${day}` });
  assert.deepEqual([r.status, r.wallet.earned], [200, 50]);
  assert.equal((await s.call({ action: 'buy', id: `gift-${day}` })).error, 'bought');
  s.later(DAY);
  assert.equal((await s.call({ action: 'buy', id: `gift-${day}` })).error, 'not-for-sale', 'yesterday\'s is gone');
  assert.equal((await s.call({ action: 'buy', id: `gift-${day + 1}` })).wallet.earned, 100);
});

test('the exchange: Gems into Coins, as often as you can pay', async () => {
  const s = server();
  await s.coins('premium', 25);
  const a = await s.call({ action: 'buy', id: 'exchange-coins' });
  const b = await s.call({ action: 'buy', id: 'exchange-coins' });
  assert.deepEqual([a.wallet.premium, a.wallet.earned, b.wallet.premium, b.wallet.earned, b.counts['exchange-coins']], [15, 1000, 5, 2000, 2]);
  assert.equal((await s.call({ action: 'buy', id: 'exchange-coins' })).error, 'funds');
});

test('an offer made by hand is on sale within a minute, at its own price, and a bundle grants all of it', async () => {
  const s = server();
  await s.call({ action: 'open' });
  const shop = await s.shop();
  await s.put({ ...shop, offers: [...shop.offers, { id: 'launch-bundle', section: 'weekly', title: 'Launch bundle', grants: [{ item: 'spikes-chrome-01' }, { item: 'kit-goldhoops-01' }, { currency: 'premium', amount: 5 }], price: { earned: 200 }, level: 1, sort: -5, until: NOW + DAY }] });
  const open = await s.call({ action: 'open' });
  assert.equal(open.offers[0].id, 'launch-bundle', 'first in its section');
  await s.coins('earned', 200);
  const r = await s.call({ action: 'buy', id: 'launch-bundle' });
  assert.deepEqual([r.inventory, r.wallet.earned, r.wallet.premium], [['spikes-chrome-01', 'kit-goldhoops-01'], 0, 5]);
  // What it granted can't be bought again through the plan's own offers.
  s.later(0);
  const all = await s.shop();
  const chrome = all.offers.find((o) => o.auto && o.grants[0].item === 'spikes-chrome-01');
  if (chrome) {
    s.later(Math.max(0, chrome.from - NOW));
    assert.equal((await s.call({ action: 'buy', id: chrome.id })).error, 'owned');
  }
});

test('the shop is read once a minute, however many ask', async () => {
  const s = server();
  await s.call({ action: 'open' });
  const reads = () => s.g.log.filter((u) => u.endsWith(':batchGet')).length;
  const before = reads();
  await s.call({ action: 'open' }, 'guest');
  await s.call({ action: 'open' }, 'guest');
  assert.equal(reads(), before, 'guests: no reads at all');
});
