// Contracts on the server (src/api.js /api/contract, the contract kept with the
// wallet in src/firestoreAdmin.js): signing, daily pay, the clause counted from
// races. Against a fake Google. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../src/api.js';
import { changeWallet, readWallet, readProgress, resetToken } from '../src/firestoreAdmin.js';
import { CONFIG } from '../../src/config.js';
import { PROJECT, env, fakeGoogle } from './fakeGoogle.mjs';

const K = CONFIG.economy.contracts;
const DAY = 864e5;
const base = `projects/${PROJECT}/databases/(default)/documents`;

/** A JS value as a Firestore REST value (for a progress doc). */
const rest = (v) =>
  Array.isArray(v) ? { arrayValue: { values: v.map(rest) } }
  : v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rest(x)])) } }
  : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? { doubleValue: v }
  : { stringValue: String(v) };

function server() {
  resetToken();
  const g = fakeGoogle();
  let now = Date.UTC(2026, 9, 26, 18); // noon in Utah
  const deps = {
    verify: async (t) => (t === 'good' ? { uid: 'u1', provider: 'google.com' } : null),
    change: (e, uid, ch) => changeWallet(e, uid, ch, { fetcher: g.fetcher, now }),
    read: (e, uid) => readWallet(e, uid, { fetcher: g.fetcher }),
    progress: (e, uid) => readProgress(e, uid, { fetcher: g.fetcher }), // through the real decoder
    now: () => now,
  };
  const progress = (p) => g.docs.set(`${base}/progress/u1`, Object.fromEntries(Object.entries(p).map(([k, v]) => [k, rest(v)])));
  const call = async (path, body) => (await handleApi(new Request(`https://x/api/${path}`, { method: 'POST', headers: { Authorization: 'Bearer good' }, body: JSON.stringify(body) }), env, path, deps)).json();
  return { g, progress, call, days: (n) => (now += n * DAY) };
}

const UTAH = 360; // minutes behind UTC (MDT)
const races = (n, place = 1) => ({ claims: Array.from({ length: n }, (_, i) => ({ ref: `race-${Math.random().toString(36).slice(2, 10)}${i}`, mode: 'computer', place, field: 6 })) });

test('no campaign beaten: no offers, nothing paid', async () => {
  const s = server();
  const r = await s.call('contract', { action: 'open', tz: UTAH });
  assert.deepEqual(r.offers, []);
  assert.equal(r.contract.tier, '');
  assert.equal(r.paid, 0);
  assert.equal((await s.call('contract', { action: 'sign', tier: 'scholarship', tz: UTAH })).error, 'no-offer');
});

test('beat High School: sign the Scholarship, a bonus and the day\'s pay, then once a day', async () => {
  const s = server();
  s.progress({ beaten: { highschool: { tournament: true } }, top: { sprint100: [{ mark: 10.9 }] }, v: 1 });
  const open = await s.call('contract', { action: 'open', tz: UTAH });
  assert.deepEqual(open.offers.map((o) => [o.tier, o.met]), [['scholarship', ['sprint100']]]);
  const signed = await s.call('contract', { action: 'sign', tier: 'scholarship', tz: UTAH });
  assert.equal(signed.contract.tier, 'scholarship');
  assert.equal(signed.bonus, K.pay.scholarship * K.signingBonus);
  assert.equal(signed.paid, K.pay.scholarship);
  assert.equal(signed.wallet.earned, signed.bonus + signed.paid);
  assert.deepEqual(signed.offers, []);
  assert.equal((await s.call('contract', { action: 'open', tz: UTAH })).paid, 0, 'today is collected');
  s.days(1);
  const next = await s.call('contract', { action: 'open', tz: UTAH });
  assert.equal(next.paid, K.pay.scholarship);
  assert.equal(next.wallet.earned, signed.wallet.earned + K.pay.scholarship);
});

test('races count toward the clause; a week without enough is probation', async () => {
  const s = server();
  s.progress({ beaten: { highschool: { tournament: true } }, top: {}, v: 1 });
  await s.call('contract', { action: 'sign', tier: 'scholarship', tz: UTAH });
  await s.call('xp', races(2));
  assert.equal((await s.call('contract', { action: 'open', tz: UTAH })).contract.races, 2);
  s.days(7);
  const r = await s.call('contract', { action: 'open', tz: UTAH });
  assert.deepEqual(r.news, ['probation']);
  assert.equal(r.paid, Math.round(K.pay.scholarship * (1 - K.probationCut)));
  await s.call('xp', races(K.clauseRaces));
  s.days(7);
  const back = await s.call('contract', { action: 'open', tz: UTAH });
  assert.deepEqual(back.news, ['restored']);
  assert.equal(back.paid, K.pay.scholarship);
});

test('lost after two missed weeks; top-3 finishes bring offers back', async () => {
  const s = server();
  s.progress({ beaten: { highschool: { tournament: true } }, top: {}, v: 1 });
  await s.call('contract', { action: 'sign', tier: 'scholarship', tz: UTAH });
  s.days(15);
  const lost = await s.call('contract', { action: 'open', tz: UTAH });
  assert.deepEqual(lost.news, ['probation', 'lost']);
  assert.equal(lost.contract.lost, 'scholarship');
  assert.deepEqual(lost.offers, []);
  await s.call('xp', races(K.requalify - 1, 2));
  await s.call('xp', races(2, 5)); // 5th: doesn't count
  assert.deepEqual((await s.call('contract', { action: 'open', tz: UTAH })).offers, []);
  await s.call('xp', races(1, 1));
  const back = await s.call('contract', { action: 'open', tz: UTAH });
  assert.equal(back.contract.requal, K.requalify);
  assert.deepEqual(back.offers.map((o) => o.tier), ['scholarship']);
});
