// The shop's rules (src/economy/shop.js): offers, what's on sale, buying. Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, itemById, owns, unlockedAt } from '../src/economy/items.js';
import { cleanOffer, cleanOffers, liveOffers, isLive, cleanCounts, cleanInventory, cantBuy, purchase, offerItems } from '../src/economy/shop.js';
import { applyChange, cleanWallet, ledgerId } from '../src/economy/wallet.js';

const T = Date.UTC(2026, 10, 11, 12);
const HOUR = 3600e3;
const lava = { id: 'lava', grants: [{ item: 'spikes-lava-01' }], price: { earned: 1500 }, level: 4 };
const rich = { earned: 1e6, premium: 1e6 };

test('the catalog: shop items are only ever bought; starter items come with levels', () => {
  const shop = ITEMS.filter((i) => i.avail === 'shop');
  assert.ok(shop.length);
  assert.ok(ITEMS.every((i) => i.avail === 'shop' || i.avail === 'level'));
  for (const i of shop) {
    assert.equal(owns(i, { level: 99 }), false, i.id);
    assert.equal(owns(i, { level: 1, inventory: [i.id] }), true);
    assert.equal(unlockedAt(i.level).includes(i), false);
    assert.equal('price' in i, false, 'prices are the server\'s');
  }
});

test('an offer as stored: defaults filled in, junk refused', () => {
  assert.deepEqual(cleanOffer(lava), { id: 'lava', section: 'basics', title: '', grants: [{ item: 'spikes-lava-01' }], price: { earned: 1500 }, level: 4, limit: 1, from: 0, until: 0, sort: 0, auto: false });
  const pack = cleanOffer({ id: 'pack', section: 'bank', title: 'Coin pack', grants: [{ currency: 'earned', amount: 1000 }], price: { premium: 10, earned: 0 }, limit: 0, from: T, until: T + HOUR, sort: 3, auto: true });
  assert.deepEqual([pack.section, pack.price, pack.limit, pack.auto], ['bank', { premium: 10 }, 0, true]);
  assert.deepEqual(cleanOffer({ id: 'free', grants: [{ currency: 'earned', amount: 50 }] }).price, {}, 'no price: free');
  for (const bad of [
    null,
    { grants: lava.grants },
    { id: 'Bad Id', grants: lava.grants },
    { id: 'x', grants: [] },
    { id: 'x', grants: [{ item: 'nope' }] },
    { id: 'x', grants: [{ item: 'spikes-plain-01' }] }, // a starter item isn't sold
    { id: 'x', grants: [{ item: 'spikes-lava-01' }, { item: 'nope' }] }, // all of it or nothing
    { id: 'x', grants: [{ currency: 'xp', amount: 10 }] },
    { id: 'x', grants: [{ currency: 'earned', amount: -5 }] },
    { id: 'x', grants: lava.grants, price: { earned: -1 } },
    { id: 'x', grants: lava.grants, price: { gold: 1 } },
    { id: 'x', grants: lava.grants, price: { earned: 1.5 } },
  ])
    assert.equal(cleanOffer(bad), null, JSON.stringify(bad));
  assert.deepEqual(cleanOffers([lava, { ...lava, price: { earned: 1 } }, { id: 'bad' }, 7]).map((o) => [o.id, o.price.earned]), [['lava', 1500]], 'the first of an id; junk dropped');
});

test('what is on sale: inside its dates, section by section, each by its sort', () => {
  const offers = cleanOffers([
    { ...lava, id: 'week-b', section: 'weekly', sort: 1 },
    { ...lava, id: 'day-b', section: 'daily', sort: 2 },
    { ...lava, id: 'gift', section: 'daily', sort: -1, from: T - HOUR, until: T + HOUR },
    { ...lava, id: 'week-a', section: 'weekly', sort: 0 },
    { ...lava, id: 'over', section: 'daily', until: T },
    { ...lava, id: 'soon', section: 'daily', from: T + 1 },
    { ...lava, id: 'basic' },
  ]);
  assert.deepEqual(liveOffers(offers, T).map((o) => o.id), ['week-a', 'week-b', 'gift', 'day-b', 'basic']);
  assert.equal(isLive(offers.find((o) => o.id === 'soon'), T + 1), true);
  assert.equal(isLive(offers.find((o) => o.id === 'gift'), T + HOUR), false, '`until` itself is over');
});

test('can you buy it: on sale, your level, not owned, not over the limit, and the money', () => {
  const o = cleanOffer(lava);
  assert.equal(cantBuy(o, T, { level: 4, wallet: rich }), null);
  assert.equal(cantBuy(o, T, { level: 3, wallet: rich }), 'level');
  assert.equal(cantBuy(o, T, { level: 9, wallet: { earned: 1499 } }), 'funds');
  assert.equal(cantBuy(o, T, { level: 9, wallet: rich, inventory: ['spikes-lava-01'] }), 'owned', 'even from another offer');
  assert.equal(cantBuy(o, T, { level: 9, wallet: rich, counts: { lava: 1 } }), 'bought');
  assert.equal(cantBuy(cleanOffer({ ...lava, until: T }), T, { level: 9, wallet: rich }), 'not-for-sale');
  assert.equal(cantBuy(null, T, { level: 9, wallet: rich }), 'not-for-sale');
  const both = cleanOffer({ ...lava, price: { earned: 100, premium: 5 } });
  assert.equal(cantBuy(both, T, { level: 9, wallet: { earned: 100, premium: 4 } }), 'funds', 'every currency of the price');
  const any = cleanOffer({ id: 'pack', grants: [{ currency: 'earned', amount: 10 }], price: { premium: 1 }, limit: 0 });
  assert.equal(cantBuy(any, T, { wallet: rich, counts: { pack: 999 } }), null, 'limit 0: as often as you like');
  const free = cleanOffer({ id: 'gift', grants: [{ currency: 'earned', amount: 50 }] });
  assert.equal(cantBuy(free, T, {}), null, 'free, for a broke level 1');
});

test('buying: the price out, what it grants in, and ledger ids of its own each time', () => {
  const o = cleanOffer({ ...lava, price: { earned: 100, premium: 5 } });
  const r = purchase(o, { inventory: [], counts: {} });
  assert.deepEqual(r.changes, [
    { kind: 'spend', currency: 'earned', amount: 100, reason: 'shop', ref: 'lava-1-earned' },
    { kind: 'spend', currency: 'premium', amount: 5, reason: 'shop', ref: 'lava-1-premium' },
  ]);
  assert.deepEqual([r.inventory, r.counts], [['spikes-lava-01'], { lava: 1 }]);
  assert.deepEqual(offerItems(o), ['spikes-lava-01']);
  // An exchange: Gems out, Coins in, again and again.
  const pack = cleanOffer({ id: 'pack', grants: [{ currency: 'earned', amount: 1000 }], price: { premium: 10 }, limit: 0 });
  let w = cleanWallet({ premium: 25 });
  let counts = {};
  const ids = new Set();
  for (let i = 0; i < 2; i++) {
    const p = purchase(pack, { counts });
    counts = p.counts;
    for (const c of p.changes) {
      ids.add(ledgerId(c));
      w = applyChange(w, c).wallet;
    }
  }
  assert.deepEqual([w.premium, w.earned, counts.pack], [5, 2000, 2]);
  assert.equal(ids.size, 4, 'a ledger entry for each change of each purchase');
  // A bundle: two items and some Coins, free.
  const bundle = cleanOffer({ id: 'bundle', grants: [{ item: 'spikes-lava-01' }, { item: 'socks-gold-01' }, { currency: 'earned', amount: 5 }, { currency: 'earned', amount: 5 }] });
  const b = purchase(bundle, { inventory: ['socks-gold-01'] });
  assert.deepEqual(b.inventory, ['socks-gold-01', 'spikes-lava-01']);
  assert.deepEqual(b.changes, [{ kind: 'grant', currency: 'earned', amount: 10, reason: 'shop', ref: 'bundle-1-earned' }]);
});

test('counts and inventories as stored', () => {
  assert.deepEqual(cleanCounts({ lava: 2, 'Bad Id': 1, zero: 0, half: 1.5, neg: -1 }), { lava: 2 });
  assert.deepEqual(cleanCounts([1, 2]), {});
  assert.deepEqual(cleanCounts(null), {});
  assert.deepEqual(cleanInventory(['spikes-chrome-01', 'spikes-chrome-01', 'nope', 'spikes-plain-01', 3]), ['spikes-chrome-01']);
  assert.ok(itemById('spikes-chrome-01'));
});
