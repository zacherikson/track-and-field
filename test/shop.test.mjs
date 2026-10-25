// The shop (src/economy/shop.js). Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { ITEMS, itemById, owns } from '../src/economy/items.js';
import { shopDay, shopWeek, shopFor, onSale, cantBuy, priceChanges, cleanInventory } from '../src/economy/shop.js';
import { applyChange, cleanWallet } from '../src/economy/wallet.js';

const day = shopDay(Date.UTC(2026, 9, 26, 12)); // a Monday

test('the same shop for everyone on a day: the basics, the week\'s picks, the day\'s picks', () => {
  const s = shopFor(day);
  assert.deepEqual(s, shopFor(day));
  assert.equal(s.weekly.length, CONFIG.economy.shop.weekly);
  assert.equal(s.daily.length, CONFIG.economy.shop.daily);
  assert.ok(s.weekly.every((id) => ['epic', 'legendary'].includes(itemById(id).rarity)));
  assert.ok(s.daily.every((id) => !s.weekly.includes(id)), 'no item twice');
  assert.deepEqual(s.always, ITEMS.filter((i) => i.avail === 'always').map((i) => i.id));
  assert.ok([...s.weekly, ...s.daily, ...s.always].every((id) => itemById(id).price), 'only priced items are sold');
});

test('the week turns on Monday at 00:00 UTC, the day at midnight UTC', () => {
  assert.equal(new Date(day * 864e5).getUTCDay(), 1);
  assert.equal(shopWeek(day), shopWeek(day + 6));
  assert.notEqual(shopWeek(day), shopWeek(day - 1));
  assert.deepEqual(shopFor(day).weekly, shopFor(day + 6).weekly);
  assert.equal(shopFor(day).nextWeek, (day + 7) * 864e5);
  assert.equal(shopFor(day).nextDay, (day + 1) * 864e5);
  // Over a few weeks the days differ (it rotates).
  const days = new Set(Array.from({ length: 14 }, (_, i) => shopFor(day + i).daily.join()));
  assert.ok(days.size > 7);
});

test('buying: for sale, your level, not yours yet, and enough of each currency', () => {
  const s = shopFor(day);
  const basic = itemById(s.always[0]);
  const rich = { earned: 1e6, premium: 1e6 };
  assert.equal(cantBuy(basic, day, { level: basic.level, wallet: rich }), null);
  assert.equal(cantBuy(basic, day, { level: basic.level - 1, wallet: rich }), 'level');
  assert.equal(cantBuy(basic, day, { level: 99, wallet: {} }), 'funds');
  assert.equal(cantBuy(basic, day, { level: 99, wallet: rich, inventory: [basic.id] }), 'owned');
  const notToday = ITEMS.find((i) => i.avail === 'rotation' && !onSale(i.id, day));
  assert.equal(cantBuy(notToday, day, { level: 99, wallet: rich }), 'not-for-sale');
  assert.equal(cantBuy(ITEMS.find((i) => i.avail === 'level'), day, { level: 99, wallet: rich }), 'not-for-sale');
  assert.ok(owns(basic, { level: 1, inventory: [basic.id] }));
});

test('the price comes out of the wallet once per item (its ledger id)', () => {
  const both = ITEMS.find((i) => i.price?.earned && i.price?.premium);
  const changes = priceChanges(both);
  assert.deepEqual(changes.map((c) => [c.currency, c.amount]), [['earned', both.price.earned], ['premium', both.price.premium]]);
  let w = cleanWallet({ earned: 10000, premium: 100 });
  for (const c of changes) w = applyChange(w, c).wallet;
  assert.deepEqual([w.earned, w.premium], [10000 - both.price.earned, 100 - both.price.premium]);
  assert.deepEqual(cleanInventory(['spikes-chrome-01', 'spikes-chrome-01', 'nope', 'spikes-plain-01', 3]), ['spikes-chrome-01']);
});
