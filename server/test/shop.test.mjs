// The shop on the server (src/api.js /api/shop; the inventory kept with the wallet in
// src/firestoreAdmin.js). Against a fake Firestore. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../src/api.js';
import { changeWallet, resetToken } from '../src/firestoreAdmin.js';
import { itemById, ITEMS } from '../../src/economy/items.js';
import { shopDay, shopFor, onSale } from '../../src/economy/shop.js';
import { xpForLevel } from '../../src/economy/levels.js';
import { env, fakeGoogle } from './fakeGoogle.mjs';

const NOW = Date.UTC(2026, 9, 26, 15);
const day = shopDay(NOW);

function server() {
  resetToken();
  const g = fakeGoogle();
  const deps = {
    verify: async (t) => (t === 'good' ? { uid: 'u1', provider: 'google.com' } : null),
    change: (e, uid, ch) => changeWallet(e, uid, ch, { fetcher: g.fetcher, now: NOW }),
  };
  const call = async (body) => {
    const res = await handleApi(new Request('https://x/api/shop', { method: 'POST', headers: { Authorization: 'Bearer good' }, body: JSON.stringify(body) }), env, 'shop', deps);
    return { status: res.status, ...(await res.json()) };
  };
  const give = (changes) => changeWallet(env, 'u1', changes, { fetcher: g.fetcher, now: NOW });
  return { g, call, give };
}

const rich = (level = 20) => [
  { kind: 'grant', currency: 'earned', amount: 50000, reason: 'admin', ref: 'test-earned' },
  { kind: 'grant', currency: 'premium', amount: 500, reason: 'admin', ref: 'test-premium' },
  { kind: 'grant', currency: 'xp', amount: Math.min(1000, xpForLevel(level)), reason: 'admin', ref: 'test-xp', day: 1 },
];

test('open: today\'s shop and nothing owned yet', async () => {
  const s = server();
  const r = await s.call({ action: 'open' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.shop, shopFor(day));
  assert.deepEqual(r.inventory, []);
});

test('buy: the price comes out, the item goes in, once', async () => {
  const s = server();
  await s.give(rich(5)); // 1,000 XP: level 4
  const id = shopFor(day).always.find((x) => itemById(x).level <= 4);
  const item = itemById(id);
  const r = await s.call({ action: 'buy', id });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.deepEqual(r.inventory, [id]);
  assert.equal(r.wallet.earned, 50000 - (item.price.earned ?? 0));
  assert.equal(r.wallet.premium, 500 - (item.price.premium ?? 0));
  const again = await s.call({ action: 'buy', id });
  assert.deepEqual([again.status, again.error], [409, 'owned']);
  assert.deepEqual((await s.call({ action: 'open' })).inventory, [id], 'kept on the account');
});

test('an item priced in both currencies takes both', async () => {
  const s = server();
  await s.give(rich());
  // Up to level 12 (XP comes at most 1,000 a day).
  await s.give(Array.from({ length: 7 }, (_, i) => ({ kind: 'grant', currency: 'xp', amount: 1000, reason: 'admin', ref: `xp-${i}`, day: 10 + i })));
  const both = ITEMS.find((i) => i.price?.earned && i.price?.premium);
  const sellDay = Array.from({ length: 60 }, (_, i) => day + i).find((d) => onSale(both.id, d));
  const when = sellDay * 864e5 + 3600e3;
  const r = await handleApi(new Request('https://x/api/shop', { method: 'POST', headers: { Authorization: 'Bearer good' }, body: JSON.stringify({ action: 'buy', id: both.id }) }), env, 'shop', {
    verify: async () => ({ uid: 'u1', provider: 'google.com' }),
    change: (e, uid, ch) => changeWallet(e, uid, ch, { fetcher: s.g.fetcher, now: when }),
  });
  const out = await r.json();
  assert.equal(r.status, 200, JSON.stringify(out));
  assert.deepEqual([out.wallet.earned, out.wallet.premium], [50000 - both.price.earned, 500 - both.price.premium]);
});

test('refused: not enough money, too low a level, not on sale today, a starter item', async () => {
  const s = server();
  const basic = itemById(shopFor(day).always[0]);
  assert.equal((await s.call({ action: 'buy', id: basic.id })).error, 'level', 'level 1, and broke');
  await s.give([{ kind: 'grant', currency: 'xp', amount: 1000, reason: 'admin', ref: 'lv', day: 1 }]);
  assert.equal((await s.call({ action: 'buy', id: basic.id })).error, 'funds');
  await s.give(rich());
  const notToday = ITEMS.find((i) => i.avail === 'rotation' && !onSale(i.id, day));
  assert.equal((await s.call({ action: 'buy', id: notToday.id })).error, 'not-for-sale');
  assert.equal((await s.call({ action: 'buy', id: 'spikes-plain-01' })).error, 'not-for-sale');
  assert.equal((await s.call({ action: 'buy', id: 'nope' })).error, 'not-for-sale');
  assert.deepEqual((await s.call({ action: 'open' })).inventory, []);
});
