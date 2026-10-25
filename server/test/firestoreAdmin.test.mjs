// The server's admin access to Firestore (src/firestoreAdmin.js): signing in as the
// service account, and wallet changes in transactions. Against a fake Google. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessToken, changeWallet, readWallet, resetToken, hasAdmin } from '../src/firestoreAdmin.js';
import { WalletError } from '../../src/economy/wallet.js';

const PROJECT = 'track-royale-test';
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey)).toString('base64');
const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
const env = { FIREBASE_PROJECT: PROJECT, FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: PROJECT, client_email: 'server@test.iam.gserviceaccount.com', private_key: pem, private_key_id: 'k1' }) };
const b64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** A fake Google: the token endpoint (checks the JWT's signature) and a Firestore with transactions. */
function fakeGoogle({ conflicts = 0 } = {}) {
  const docs = new Map(); // full name -> fields
  const log = [];
  let txn = 0;
  const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
  const fetcher = async (url, init) => {
    log.push(url);
    if (url === 'https://oauth2.googleapis.com/token') {
      const jwt = new URLSearchParams(init.body).get('assertion');
      const [h, c, s] = jwt.split('.');
      const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', keys.publicKey, b64(s), new TextEncoder().encode(`${h}.${c}`));
      const claims = JSON.parse(b64(c));
      if (!ok || claims.scope !== 'https://www.googleapis.com/auth/datastore' || claims.iss !== 'server@test.iam.gserviceaccount.com') return json({}, 401);
      return json({ access_token: 'tok', expires_in: 3600 });
    }
    assert.equal(init.headers.Authorization, 'Bearer tok');
    const body = JSON.parse(init.body);
    if (url.endsWith(':beginTransaction')) return json({ transaction: `t${++txn}` });
    if (url.endsWith(':rollback')) return json({});
    if (url.endsWith(':batchGet')) return json(body.documents.map((name) => (docs.has(name) ? { found: { name, fields: docs.get(name) } } : { missing: name })));
    if (url.endsWith(':commit')) {
      if (conflicts > 0) {
        conflicts--;
        return json({ error: 'ABORTED' }, 409);
      }
      for (const w of body.writes) if (w.currentDocument?.exists === false && docs.has(w.update.name)) return json({}, 400);
      for (const w of body.writes) docs.set(w.update.name, w.update.fields);
      return json({});
    }
    return json({}, 404);
  };
  return { fetcher, docs, log };
}

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
