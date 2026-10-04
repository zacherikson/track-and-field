/**
 * Who's on a socket: the Firebase ID token the game sends in its `hello`
 * (online/net.js), checked here without any Firebase library. The token is a
 * JWT signed (RS256) with one of Google's published keys; it must name this
 * Firebase project as its audience and issuer, be in date, and name a user.
 *
 * With DEV_AUTH set (local testing only, `npm run dev`), "dev:<uid>:<name>"
 * stands in for a token, so bot players need no Google account.
 */
const KEYS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const SKEW = 300; // s of clock difference allowed either way

let cache = { keys: null, until: 0 };

/** Google's current signing keys, cached for as long as Google says ({ kid: CryptoKey }). */
async function signingKeys(fetchKeys) {
  if (cache.keys && Date.now() < cache.until) return cache.keys;
  const res = await fetchKeys();
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers?.get?.('cache-control') ?? '')?.[1] ?? 3600);
  const { keys } = await res.json();
  const out = {};
  for (const jwk of keys ?? []) {
    out[jwk.kid] = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  }
  cache = { keys: out, until: Date.now() + maxAge * 1000 };
  return out;
}

/** Forgets the cached keys (tests). */
export function resetKeys() {
  cache = { keys: null, until: 0 };
}

const b64urlBytes = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + ((4 - (s.length % 4)) % 4), '='));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

/**
 * The player a token belongs to: { uid, name?, dev? }, or null if it doesn't check out.
 * @param token    the hello's token
 * @param env      the Worker's env (FIREBASE_PROJECT, DEV_AUTH)
 * @param opts     { now: s, fetchKeys } (tests)
 */
export async function verifyToken(token, env, { now = Date.now() / 1000, fetchKeys = () => fetch(KEYS_URL) } = {}) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  if (env.DEV_AUTH === '1' && token.startsWith('dev:')) {
    const [, uid, name] = token.split(':');
    return uid ? { uid: uid.slice(0, 64), name: (name ?? uid).slice(0, 16), dev: true } : null;
  }
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const head = b64urlJson(parts[0]);
    const claims = b64urlJson(parts[1]);
    if (head.alg !== 'RS256' || !head.kid) return null;
    const project = env.FIREBASE_PROJECT;
    if (claims.aud !== project || claims.iss !== `https://securetoken.google.com/${project}`) return null;
    if (!(claims.exp > now - SKEW) || !(claims.iat < now + SKEW) || !(claims.auth_time < now + SKEW)) return null;
    if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) return null;
    const key = (await signingKeys(fetchKeys))[head.kid];
    if (!key) return null;
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    return ok ? { uid: claims.sub } : null;
  } catch {
    return null;
  }
}
