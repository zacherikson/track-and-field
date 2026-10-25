// A fake Google for the server's tests: the token endpoint (checks the JWT's
// signature) and a Firestore with transactions. Not a test file itself.
import assert from 'node:assert/strict';

export const PROJECT = 'track-royale-test';
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey)).toString('base64');
const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
export const env = { FIREBASE_PROJECT: PROJECT, FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: PROJECT, client_email: 'server@test.iam.gserviceaccount.com', private_key: pem, private_key_id: 'k1' }) };
const b64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function fakeGoogle({ conflicts = 0 } = {}) {
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

