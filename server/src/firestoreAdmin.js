import { applyChange, cleanWallet, ledgerId, WALLET_VERSION, WalletError } from '../../src/economy/wallet.js';

/**
 * THE SERVER'S ADMIN ACCESS TO FIRESTORE: what lets it, and only it, write
 * wallets (src/economy/wallet.js). Phones can read their own wallet but never
 * write one (firestore.rules); the server signs in as the Firebase project's
 * service account, which the rules don't apply to.
 *
 * The service account's key is a Worker secret, FIREBASE_SERVICE_ACCOUNT (the
 * JSON file Firebase gives you: server/README.md). With it, the server signs
 * a short JWT (RS256, WebCrypto: no Google library), swaps it for an access
 * token, and talks to Firestore's REST API.
 *
 * Firestore layout:
 *   wallets/{uid}               = { earned, premium, v, updatedAt }
 *   wallets/{uid}/ledger/{id}   = { kind, currency, amount, reason, ref, earned, premium, gained?, at }
 *                                 one per change; `id` = ledgerId(change), so a payout lands once
 */
const SCOPE = 'https://www.googleapis.com/auth/datastore';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const RETRIES = 4; // a transaction that lost a race with another one is tried again

/** True if the Worker has the service account's key (the secret is set). */
export function hasAdmin(env) {
  return typeof env.FIREBASE_SERVICE_ACCOUNT === 'string' && env.FIREBASE_SERVICE_ACCOUNT.length > 0;
}

function serviceAccount(env) {
  if (!hasAdmin(env)) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  if (!sa.client_email || !sa.private_key) throw new Error('FIREBASE_SERVICE_ACCOUNT is not a service account key');
  if (sa.project_id && env.FIREBASE_PROJECT && sa.project_id !== env.FIREBASE_PROJECT) throw new Error(`service account is for ${sa.project_id}, not ${env.FIREBASE_PROJECT}`);
  return sa;
}

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = (s) => b64url(new TextEncoder().encode(s));

/** The private key from the service account's PEM, for signing. */
async function signingKey(pem) {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

let cached = { token: null, until: 0, email: null };

/** Forgets the cached access token (tests). */
export function resetToken() {
  cached = { token: null, until: 0, email: null };
}

/**
 * An access token for Firestore, as the service account: cached until a
 * minute before it runs out.
 * @param opts { fetcher, now: ms } (tests)
 */
export async function accessToken(env, { fetcher = fetch, now = Date.now() } = {}) {
  const sa = serviceAccount(env);
  if (cached.token && cached.email === sa.client_email && now < cached.until) return cached.token;
  const iat = Math.floor(now / 1000);
  const head = { alg: 'RS256', typ: 'JWT', ...(sa.private_key_id ? { kid: sa.private_key_id } : {}) };
  const claims = { iss: sa.client_email, sub: sa.client_email, aud: TOKEN_URL, scope: SCOPE, iat, exp: iat + 3600 };
  const unsigned = `${b64urlText(JSON.stringify(head))}.${b64urlText(JSON.stringify(claims))}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await signingKey(sa.private_key), new TextEncoder().encode(unsigned));
  const res = await fetcher(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${unsigned}.${b64url(sig)}`,
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const { access_token: token, expires_in: expires = 3600 } = await res.json();
  cached = { token, until: now + (expires - 60) * 1000, email: sa.client_email };
  return token;
}

// ---------------------------------------------------------------- Firestore REST

const root = (env) => `projects/${env.FIREBASE_PROJECT}/databases/(default)/documents`;
const walletName = (env, uid) => `${root(env)}/wallets/${uid}`;
const entryName = (env, uid, id) => `${root(env)}/wallets/${uid}/ledger/${id}`;

/** A REST call on the database as the service account: POST `body` to `${root}${path}`. */
async function call(env, path, body, opts) {
  const fetcher = opts.fetcher ?? fetch;
  const token = await accessToken(env, opts);
  const res = await fetcher(`https://firestore.googleapis.com/v1/${root(env)}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw Object.assign(new Error(`firestore ${path} ${res.status}`), { status: res.status });
  return res.json();
}

const int = (n) => ({ integerValue: String(n) });
const str = (s) => ({ stringValue: String(s) });

/** A REST doc's number fields as plain numbers (wallets only hold numbers). */
function numbers(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, Number(v.integerValue ?? v.doubleValue ?? NaN)]));
}

function checkUid(uid) {
  if (typeof uid !== 'string' || !UID.test(uid)) throw new WalletError('invalid', `uid ${uid}`);
}

/** `uid`'s wallet ({ earned, premium }; all zero if they have none yet). */
export async function readWallet(env, uid, opts = {}) {
  checkUid(uid);
  const res = await call(env, ':batchGet', { documents: [walletName(env, uid)] }, opts);
  return cleanWallet(numbers(res.find((r) => r.found)?.found.fields));
}

/**
 * Changes `uid`'s wallet (a change as src/economy/wallet.js describes it), in
 * one transaction with its ledger entry. Resolves to { wallet, entry,
 * duplicate }: `duplicate` = this payout already landed, and nothing changed.
 * Throws WalletError if the change can't be made (not enough money, fines off).
 */
export async function changeWallet(env, uid, change, opts = {}) {
  checkUid(uid);
  const id = ledgerId(change); // checks the change too
  for (let attempt = 1; ; attempt++) {
    const { transaction } = await call(env, ':beginTransaction', { options: { readWrite: {} } }, opts);
    const reads = await call(env, ':batchGet', { documents: [walletName(env, uid), entryName(env, uid, id)], transaction }, opts);
    const found = (name) => reads.find((r) => r.found?.name === name)?.found;
    const before = cleanWallet(numbers(found(walletName(env, uid))?.fields));
    const rollback = () => call(env, ':rollback', { transaction }, opts).catch(() => {});
    if (found(entryName(env, uid, id))) {
      await rollback();
      return { wallet: before, entry: null, duplicate: true };
    }
    let result;
    try {
      result = applyChange(before, change);
    } catch (e) {
      await rollback();
      throw e;
    }
    const { wallet, entry } = result;
    const now = [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }];
    const entryFields = {
      kind: str(entry.kind),
      currency: str(entry.currency),
      amount: int(entry.amount),
      reason: str(entry.reason),
      ref: str(entry.ref),
      ...Object.fromEntries(Object.entries(entry.after).map(([c, v]) => [c, int(v)])),
      ...(entry.gained != null ? { gained: int(entry.gained) } : {}),
    };
    const writes = [
      { update: { name: walletName(env, uid), fields: { ...Object.fromEntries(Object.entries(wallet).map(([c, v]) => [c, int(v)])), v: int(WALLET_VERSION) } }, updateTransforms: now },
      { update: { name: entryName(env, uid, id), fields: entryFields }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'at', setToServerValue: 'REQUEST_TIME' }] },
    ];
    try {
      await call(env, ':commit', { writes, transaction }, opts);
      return { wallet, entry, duplicate: false };
    } catch (e) {
      // 409: another change to this wallet got there first; read it again and retry.
      if (e.status !== 409 || attempt >= RETRIES) throw e;
    }
  }
}
