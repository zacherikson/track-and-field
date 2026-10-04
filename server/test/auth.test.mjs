// The Firebase ID token check, with a key pair made up here standing in for Google's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyToken, resetKeys } from '../src/auth.js';

const env = { FIREBASE_PROJECT: 'proj' };
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

async function setup() {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const fetchKeys = async () => ({ headers: new Headers({ 'cache-control': 'max-age=600' }), json: async () => ({ keys: [jwk] }) });
  const sign = async (claims, head = { alg: 'RS256', kid: 'k1' }) => {
    const body = `${b64url(JSON.stringify(head))}.${b64url(JSON.stringify(claims))}`;
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(body));
    return `${body}.${b64url(new Uint8Array(sig))}`;
  };
  return { fetchKeys, sign };
}

test('a good token names its user; anything off is refused', async () => {
  resetKeys();
  const { fetchKeys, sign } = await setup();
  const now = 1_700_000_000;
  const good = { aud: 'proj', iss: 'https://securetoken.google.com/proj', sub: 'user1', iat: now - 10, auth_time: now - 100, exp: now + 3000 };
  const opts = { now, fetchKeys };
  assert.deepEqual(await verifyToken(await sign(good), env, opts), { uid: 'user1' });
  assert.equal(await verifyToken(await sign({ ...good, aud: 'other' }), env, opts), null);
  assert.equal(await verifyToken(await sign({ ...good, exp: now - 1000 }), env, opts), null);
  assert.equal(await verifyToken(await sign({ ...good, sub: '' }), env, opts), null);
  assert.equal(await verifyToken(await sign(good, { alg: 'HS256', kid: 'k1' }), env, opts), null);
  assert.equal(await verifyToken(await sign(good, { alg: 'RS256', kid: 'nope' }), env, opts), null);
  const t = await sign(good);
  const forged = t.slice(0, t.lastIndexOf('.') + 1) + b64url(new Uint8Array(256));
  assert.equal(await verifyToken(forged, env, opts), null);
  assert.equal(await verifyToken('dev:bot1:Bot', env, opts), null, 'dev tokens only with DEV_AUTH');
  assert.deepEqual(await verifyToken('dev:bot1:Bot', { ...env, DEV_AUTH: '1' }, opts), { uid: 'bot1', name: 'Bot', dev: true });
});
