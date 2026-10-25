import { verifyToken } from './auth.js';
import { changeWallet, readWallet, readProgress, hasAdmin } from './firestoreAdmin.js';
import { xpForRace, xpDay, levelOf } from '../../src/economy/levels.js';
import { WalletError } from '../../src/economy/wallet.js';
import { advance, collect, contractView, localDay, offers, setZone, sign } from '../../src/economy/contracts.js';
import { shopDay, shopFor, cantBuy, priceChanges } from '../../src/economy/shop.js';
import { itemById } from '../../src/economy/items.js';

/**
 * THE GAME'S HTTP CALLS to the server (besides the live sockets), under /api/:
 *
 *   POST /api/xp   { claims: [{ ref, mode, place, field }] }  with  Authorization: Bearer <Firebase ID token>
 *                  The races you finished (src/online/xp.js), queued on the phone while offline.
 *                  The server works out each one's XP (src/economy/levels.js) and adds it to
 *                  your wallet, up to the day's cap; `ref` makes each race count once.
 *                  → { done: [ref], gained, xp, level, levelUp }
 *                  Each race also counts toward your contract's clause (src/economy/contracts.js).
 *
 *   POST /api/contract  { action: 'open' | 'sign', tz, tier? }  (same sign-in)
 *                  Your contract (src/online/contracts.js). 'open' (the game at its menu): today's
 *                  pay if it isn't collected yet, after catching up on the weeks gone by. 'sign':
 *                  signs your offer for `tier` (worked out here, from your progress and medals),
 *                  with its signing bonus, then the same. `tz` = your time zone (minutes behind UTC).
 *                  → { contract, offers, paid, bonus, news, wallet }
 *
 *   POST /api/shop  { action: 'open' | 'buy', id? }  (same sign-in)
 *                  The shop (src/economy/shop.js: today's, the same for everyone) and the gear you
 *                  own. 'buy': item `id`, if it's on sale today, you're at its level, don't have it
 *                  yet and can pay; its price comes out of your wallet as it goes in your inventory.
 *                  → { shop, inventory, wallet, bought }   (a refused buy: 409 { error: 'funds' | ... })
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
  if (path !== 'xp' && path !== 'contract' && path !== 'shop') return json({ error: 'not-found' }, 404);
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
  if (path === 'contract') return contract(env, who.uid, body, deps);
  if (path === 'shop') return shop(env, who.uid, body, deps);
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
        const place = Number.isInteger(c.place) ? c.place : 0; // for your contract's clause
        const r = await change(env, who.uid, { kind: 'grant', currency: 'xp', amount, reason: 'race', ref: c.ref, day, place });
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

const ACTIONS = ['open', 'sign'];

/** POST /api/contract: your contract opened (today's pay) or an offer signed. */
async function contract(env, uid, body, deps) {
  const action = body?.action;
  if (!ACTIONS.includes(action)) return json({ error: 'bad-action' }, 400);
  const change = deps.change ?? changeWallet;
  let out;
  try {
    const progress = await (deps.progress ?? readProgress)(env, uid);
    const r = await change(env, uid, ({ wallet, contract: stored, now }) => {
      let c = Number.isInteger(body.tz) ? setZone(stored, body.tz, localDay(now, stored.tz)) : stored;
      const day = localDay(now, c.tz);
      const caught = advance(c, day);
      c = caught.contract;
      const changes = [];
      let bonus = 0;
      if (action === 'sign') {
        const offer = offers({ contract: c, progress, wallet }).find((o) => o.tier === body.tier);
        if (!offer) throw new WalletError('no-offer');
        ({ contract: c, bonus } = sign(c, offer, day));
        if (bonus) changes.push({ kind: 'grant', currency: 'earned', amount: bonus, reason: 'signing', ref: `${offer.tier}-${offer.grade}-${day}` });
      }
      const pay = collect(c, day);
      if (pay.amount) changes.push({ kind: 'grant', currency: 'earned', amount: pay.amount, reason: 'contract', ref: `day-${day}` });
      out = { day, paid: pay.amount, bonus, news: [...caught.news, ...pay.news] };
      return { changes, contract: pay.contract };
    });
    const { gold, silver, bronze, earned, premium, xp } = r.wallet;
    return json({
      contract: contractView(r.contract, out.day),
      offers: offers({ contract: r.contract, progress, wallet: r.wallet }),
      paid: out.paid,
      bonus: out.bonus,
      news: out.news,
      wallet: { earned, premium, xp, gold, silver, bronze },
    });
  } catch (e) {
    if (e instanceof WalletError) return json({ error: e.code }, 409);
    console.warn('api contract', e?.message);
    return json({ error: 'server' }, 502);
  }
}

/** POST /api/shop: today's shop and your gear, or an item bought. */
async function shop(env, uid, body, deps) {
  const action = body?.action;
  if (action !== 'open' && action !== 'buy') return json({ error: 'bad-action' }, 400);
  const change = deps.change ?? changeWallet;
  try {
    let day;
    const r = await change(env, uid, ({ wallet, inventory, now }) => {
      day = shopDay(now);
      if (action === 'open') return { changes: [] };
      const item = itemById(body.id);
      const why = cantBuy(item, day, { level: levelOf(wallet.xp), inventory, wallet });
      if (why) throw new WalletError(why);
      return { changes: priceChanges(item), inventory: [...inventory, item.id] };
    });
    const { earned, premium, xp, gold, silver, bronze } = r.wallet;
    return json({ shop: shopFor(day), inventory: r.inventory, wallet: { earned, premium, xp, gold, silver, bronze }, bought: action === 'buy' ? body.id : null });
  } catch (e) {
    if (e instanceof WalletError) return json({ error: e.code }, 409);
    console.warn('api shop', e?.message);
    return json({ error: 'server' }, 502);
  }
}
