// The server's admin access to Firestore (src/firestoreAdmin.js): signing in as the
// service account, and wallet changes in transactions. Against a fake Google. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessToken, changeWallet, readWallet, resetToken, hasAdmin } from '../src/firestoreAdmin.js';
import { WalletError } from '../../src/economy/wallet.js';
import { PROJECT, env, fakeGoogle } from './fakeGoogle.mjs';

const grant = (amount, ref, currency = 'earned') => ({ kind: 'grant', currency, amount, reason: 'admin', ref });
const money = (w) => ({ earned: w.earned, premium: w.premium });

test('signs in as the service account with a signed JWT, and keeps the token', async () => {
  resetToken();
  const g = fakeGoogle();
  assert.ok(hasAdmin(env));
  assert.equal(await accessToken(env, { fetcher: g.fetcher }), 'tok');
  await accessToken(env, { fetcher: g.fetcher });
  assert.equal(g.log.filter((u) => u.includes('oauth2')).length, 1, 'asked for a token once');
  assert.ok(!hasAdmin({ FIREBASE_PROJECT: PROJECT }));
});

test('a grant lands once with its ledger entry; the same payout again changes nothing', async () => {
  resetToken();
  const g = fakeGoogle();
  const r = await changeWallet(env, 'uid1', grant(250, 'race-1'), { fetcher: g.fetcher });
  assert.deepEqual(money(r.wallet), { earned: 250, premium: 0 });
  assert.equal(r.duplicate, false);
  const entry = g.docs.get(`projects/${PROJECT}/databases/(default)/documents/wallets/uid1/ledger/grant-admin-race-1`);
  assert.equal(entry.amount.integerValue, '250');
  const again = await changeWallet(env, 'uid1', grant(250, 'race-1'), { fetcher: g.fetcher });
  assert.equal(again.duplicate, true);
  assert.deepEqual(money(await readWallet(env, 'uid1', { fetcher: g.fetcher })), { earned: 250, premium: 0 });
  await changeWallet(env, 'uid1', grant(3, 'race-2', 'premium'), { fetcher: g.fetcher });
  assert.deepEqual(money(await readWallet(env, 'uid1', { fetcher: g.fetcher })), { earned: 250, premium: 3 });
});

test('spending more than you have is refused and writes nothing', async () => {
  resetToken();
  const g = fakeGoogle();
  await changeWallet(env, 'uid2', grant(100, 'a'), { fetcher: g.fetcher });
  const spend = { kind: 'spend', currency: 'earned', amount: 101, reason: 'shop', ref: 'item-1' };
  await assert.rejects(changeWallet(env, 'uid2', spend, { fetcher: g.fetcher }), (e) => e instanceof WalletError && e.code === 'insufficient');
  assert.deepEqual(money(await readWallet(env, 'uid2', { fetcher: g.fetcher })), { earned: 100, premium: 0 });
  assert.ok(g.log.some((u) => u.endsWith(':rollback')));
});

test('a transaction that loses a race is tried again', async () => {
  resetToken();
  const g = fakeGoogle({ conflicts: 2 });
  const r = await changeWallet(env, 'uid3', grant(10, 'x'), { fetcher: g.fetcher });
  assert.equal(r.wallet.earned, 10);
  assert.equal(g.log.filter((u) => u.endsWith(':beginTransaction')).length, 3);
});

test('bad uids and bad changes never reach the database', async () => {
  resetToken();
  const g = fakeGoogle();
  await assert.rejects(changeWallet(env, '../users/x', grant(1, 'a'), { fetcher: g.fetcher }), WalletError);
  await assert.rejects(changeWallet(env, 'uid4', grant(-5, 'a'), { fetcher: g.fetcher }), WalletError);
  assert.equal(g.log.length, 0);
});

test('several changes land together (a payout), and a repeat lands none of them', async () => {
  resetToken();
  const g = fakeGoogle();
  const pay = [grant(225, 'room9'), { kind: 'grant', currency: 'gold', amount: 1, reason: 'medal', ref: 'room9' }, { kind: 'grant', currency: 'premium', amount: 6, reason: 'medal-pay', ref: 'room9' }];
  const r = await changeWallet(env, 'uid5', pay, { fetcher: g.fetcher });
  assert.equal(r.entries.length, 3);
  assert.deepEqual([r.wallet.earned, r.wallet.gold, r.wallet.premium], [225, 1, 6]);
  const pub = g.docs.get(`projects/${PROJECT}/databases/(default)/documents/players/uid5`);
  assert.equal(pub.gold.integerValue, '1', 'medals are public with the level');
  const again = await changeWallet(env, 'uid5', pay, { fetcher: g.fetcher });
  assert.equal(again.duplicate, true);
  assert.equal((await readWallet(env, 'uid5', { fetcher: g.fetcher })).gold, 1);
});
