import { verifyToken } from './auth.js';
import { changeWallet, readWallet, hasAdmin } from './firestoreAdmin.js';
import { xpForRace, xpDay, levelOf } from '../../src/economy/levels.js';

/**
 * THE GAME'S HTTP CALLS to the server (besides the live sockets), under /api/:
 *
 *   POST /api/xp   { claims: [{ ref, mode, place, field }] }  with  Authorization: Bearer <Firebase ID token>
 *                  The races you finished (src/online/xp.js), queued on the phone while offline.
 *                  The server works out each one's XP (src/economy/levels.js) and adds it to
 *                  your wallet, up to the day's cap; `ref` makes each race count once.
 *                  → { done: [ref], gained, xp, level, levelUp }
 *
 * Signed in with Google only: a guest earns nothing (`guest`). Any website may
 * call it (CORS *): it does nothing without a player's own token.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};
const REF = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_CLAIMS = 20; // a request at most; the phone sends the rest next time
const MAX_BODY = 8000; // characters

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/**
 * `path` = what follows /api/. `deps` (tests): { verify, change, read, now }.
 */
export async function handleApi(request, env, path, deps = {}) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (path !== 'xp') return json({ error: 'not-found' }, 404);
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  if (!hasAdmin(env) && !deps.change) return json({ error: 'not-set-up' }, 503);
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const who = await (deps.verify ?? verifyToken)(token, env);
  if (!who) return json({ error: 'auth' }, 401);
  if (who.provider === 'anonymous') return json({ error: 'guest' }, 403);
  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ error: 'too-big' }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: 'bad-json' }, 400);
  }
  const claims = Array.isArray(body?.claims) ? body.claims.slice(0, MAX_CLAIMS) : [];
  const change = deps.change ?? changeWallet;
  const read = deps.read ?? readWallet;
  const day = xpDay(deps.now?.() ?? Date.now());
  const done = [];
  let gained = 0;
  let wallet;
  try {
    wallet = await read(env, who.uid);
    const before = wallet.xp;
    for (const c of claims) {
      if (typeof c?.ref !== 'string' || !REF.test(c.ref)) continue; // no ref to answer to: dropped
      const amount = xpForRace(c);
      if (amount > 0) {
        const r = await change(env, who.uid, { kind: 'grant', currency: 'xp', amount, reason: 'race', ref: c.ref, day });
        wallet = r.wallet;
        if (!r.duplicate) gained += r.entry.amount;
      }
      done.push(c.ref); // counted (or worth nothing): the phone can forget it
    }
    return json({ done, gained, xp: wallet.xp, level: levelOf(wallet.xp), levelUp: levelOf(wallet.xp) > levelOf(before) });
  } catch (e) {
    console.warn('api xp', e?.message);
    // What landed before the failure is done; the rest the phone sends again.
    return json({ error: 'server', done }, 502);
  }
}
