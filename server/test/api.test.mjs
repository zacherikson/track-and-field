// The game's HTTP calls (src/api.js): reporting finished races for XP. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../src/api.js';
import { applyChange, cleanWallet, ledgerId } from '../../src/economy/wallet.js';
import { CONFIG } from '../../src/config.js';

/** A fake server side: tokens 'good' (Google) and 'guest'; wallets in memory, each ledger id once. */
function fake() {
  const wallets = new Map();
  const seen = new Set();
  return {
    wallets,
    verify: async (t) => (t === 'good' ? { uid: 'u1', provider: 'google.com' } : t === 'guest' ? { uid: 'g1', provider: 'anonymous' } : null),
    read: async (env, uid) => cleanWallet(wallets.get(uid)),
    change: async (env, uid, ch) => {
      const id = ledgerId(ch);
      if (seen.has(`${uid}/${id}`)) return { wallet: cleanWallet(wallets.get(uid)), entry: null, duplicate: true };
      const r = applyChange(wallets.get(uid), ch);
      seen.add(`${uid}/${id}`);
      wallets.set(uid, r.wallet);
      return { ...r, duplicate: false };
    },
    now: () => Date.UTC(2026, 9, 25, 12),
  };
}
const post = (body, token = 'good') => new Request('https://x/api/xp', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const win = (ref) => ({ ref, mode: 'computer', place: 1, field: 6 });

test('finished races add XP once each, and say when you level up', async () => {
  const f = fake();
  const r = await (await handleApi(post({ claims: [win('race0001'), win('race0002'), { ref: 'race0003', mode: 'training', place: 1, field: 1 }] }), {}, 'xp', f)).json();
  const each = CONFIG.economy.xp.computer.finish + CONFIG.economy.xp.computer.place[0];
  assert.deepEqual(r.done, ['race0001', 'race0002', 'race0003'], 'Training is done too: worth nothing');
  assert.equal(r.gained, 2 * each);
  assert.equal(r.xp, 2 * each);
  const again = await (await handleApi(post({ claims: [win('race0001')] }), {}, 'xp', f)).json();
  assert.equal(again.gained, 0, 'the same race never counts twice');
  assert.equal(again.xp, 2 * each);
  const many = await (await handleApi(post({ claims: Array.from({ length: 4 }, (_, i) => win(`more000${i}`)) }), {}, 'xp', f)).json();
  assert.equal(many.levelUp, true, `${many.xp} XP is past level 2`);
});

test('guests, bad tokens and junk get nothing', async () => {
  const f = fake();
  assert.equal((await handleApi(post({ claims: [win('race0001')] }, 'guest'), {}, 'xp', f)).status, 403);
  assert.equal((await handleApi(post({ claims: [win('race0001')] }, 'nope'), {}, 'xp', f)).status, 401);
  assert.equal((await handleApi(post('not json'), {}, 'xp', f)).status, 400);
  const r = await (await handleApi(post({ claims: [{ ref: 'x', mode: 'live', place: 1, field: 2 }, { ref: 'race0009', mode: 'live', place: 9, field: 2 }] }), {}, 'xp', f)).json();
  assert.deepEqual(r.done, ['race0009'], 'a bad ref is dropped; a nonsense race is done, worth nothing');
  assert.equal(r.gained, 0);
  assert.equal(f.wallets.size, 0);
});

test('answers the browser preflight, and only /api/xp', async () => {
  const pre = await handleApi(new Request('https://x/api/xp', { method: 'OPTIONS' }), {}, 'xp', fake());
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal((await handleApi(post({}), {}, 'other', fake())).status, 404);
});
