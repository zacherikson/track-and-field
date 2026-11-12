import { verifyToken } from './auth.js';
import { changeWallet, readWallet, hasAdmin, getDocs, setDocs } from './firestoreAdmin.js';
import { allOffers } from './shopStore.js';
import { saveAthlete, playersAthlete } from './athletes.js';
import { BOARDS, MarkError, beats, checkMark } from './marks.js';
import { clean as cleanProgress, merge as mergeProgress, same as sameProgress } from '../../src/online/progressRules.js';
import { STANDARD_EVENTS } from '../../src/economy/contracts.js';
import { BALANCE, BALANCE_VERSION } from '../../src/economy/balance.js';
import { audit } from './audit.js';
import { xpForRace, xpDay, levelOf } from '../../src/economy/levels.js';
import { WalletError } from '../../src/economy/wallet.js';
import { advance, collect, contractView, localDay, offers, setZone, sign } from '../../src/economy/contracts.js';
import { liveOffers, cantBuy, purchase } from '../../src/economy/shop.js';

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
 *                  signs your offer for `tier` (worked out here: the campaigns your progress says
 *                  you've beaten, your medals, and your marks on the boards the server keeps),
 *                  with its signing bonus, then the same. `tz` = your time zone (minutes behind UTC).
 *                  → { contract, offers, paid, bonus, news, wallet }
 *
 *   POST /api/shop  { action: 'open' | 'buy', id? }  (same sign-in)
 *                  The shop (src/economy/shop.js): the offers on sale now, read from the database
 *                  (shopStore.js), with the gear you own and how many of each offer you've bought.
 *                  'buy': offer `id`, if it's on sale, you're at its level, haven't had all you're
 *                  allowed and can pay: its price comes out of your wallet, and what it grants goes
 *                  into your wallet and inventory, in one transaction.
 *                  → { offers, inventory, counts, wallet, now, bought }
 *                  (a refused buy: 409 { error: 'funds' | 'level' | 'owned' | 'bought' | 'not-for-sale' })
 *
 *   POST /api/athlete  { code }  (same sign-in)
 *                  Saves the athlete you play as (src/athletes/custom.js: its code). The server takes
 *                  off any gear you don't have and keeps the rest (athletes.js): live rooms and meets
 *                  show the athlete kept here, not one a phone sends.
 *                  → { athlete }   (the code kept; 400 { error: 'bad-athlete' } if it isn't one)
 *
 *   GET /api/balance  (no sign-in: nothing here is anyone's)
 *                  The economy's numbers as this server has them (src/economy/balance.js): what a race
 *                  pays, the level curve, what contracts are worth. The game shows these, not the
 *                  ones in its own build (src/online/balance.js).
 *                  → { v, balance }
 *
 *   POST /api/progress  { progress }  (Google sign-in)
 *                  Your campaign progress, top marks and athlete (src/online/progress.js), kept on
 *                  your account: only the server writes it. What the phone sends is tidied (only
 *                  the campaigns and events there are; marks that aren't possible dropped) and
 *                  merged into what's kept (src/online/progressRules.js): nothing is ever lost.
 *                  → { progress }   (the account's copy after it)
 *
 *   POST /api/mark  { action?: 'post', board, mark, ghost? } | { action: 'rename' }  (Google sign-in)
 *                  The online leaderboards (marks.js): only the server writes them. 'post': a mark
 *                  you made, with its recording. It's checked (possible at all; the 100m is run
 *                  again from its inputs) and goes on the board if it beats yours there, under
 *                  your username, its recording with it. 'rename': your username, as it is now, on
 *                  all your entries.
 *                  → { improved, best } | { renamed }
 *                  (refused: 409 { error: 'implausible' | 'bad-ghost' | 'replay' | 'bad-mark' | 'no-name' })
 *
 * Each player may only call each of these so often (limiterCore.js: 429 { error: 'slow-down' } past
 * it), and a mark the server turns down is noted in the audit trail (audit.js).
 *
 * Any sign-in will do, a guest's too (Firebase's anonymous sign-in: an id for that phone): guests
 * have a wallet, earn XP and money and buy gear like anyone. Linking the guest to a Google account
 * keeps the same id, so it all carries over. Contracts and the leaderboards need a Google sign-in
 * (`guest`): contract offers come from the progress kept on an account. Any website may
 * call it (CORS *): it does nothing without a player's own token.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};
const PATHS = ['xp', 'contract', 'shop', 'athlete', 'mark', 'progress'];
const REF = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_CLAIMS = 20; // a request at most; the phone sends the rest next time
const MAX_BODY = 8000; // characters
const MAX_PROGRESS_BODY = 40000;
const MAX_MARK_BODY = 260000; // a mark comes with its recording (up to 200,000 characters of frames)

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/**
 * Whether `uid` may call `path` now: their Limiter says (index.js, limiterCore.js).
 * A server without one (tests, local dev), or one that can't be reached, lets it through.
 */
async function allowed(env, uid, path, deps) {
  if (deps.limit) return deps.limit(uid, path);
  if (!env.LIMITS) return true;
  try {
    return await env.LIMITS.get(env.LIMITS.idFromName(uid)).hit(path);
  } catch (e) {
    console.warn('limiter', e?.message);
    return true;
  }
}

/**
 * `path` = what follows /api/. `deps` (tests): { verify, change, read, now }.
 */
export async function handleApi(request, env, path, deps = {}) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (path === 'balance') return new Response(JSON.stringify({ v: BALANCE_VERSION, balance: BALANCE }), { headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } });
  if (!PATHS.includes(path)) return json({ error: 'not-found' }, 404);
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  if (!hasAdmin(env) && !deps.change) return json({ error: 'not-set-up' }, 503);
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const who = await (deps.verify ?? verifyToken)(token, env);
  if (!who) return json({ error: 'auth' }, 401);
  const guest = who.provider === 'anonymous';
  if (!(await allowed(env, who.uid, path, deps))) return json({ error: 'slow-down' }, 429);
  let body;
  try {
    const text = await request.text();
    if (text.length > (path === 'mark' ? MAX_MARK_BODY : path === 'progress' ? MAX_PROGRESS_BODY : MAX_BODY)) return json({ error: 'too-big' }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: 'bad-json' }, 400);
  }
  if (path === 'athlete') return athlete(env, who.uid, body, deps);
  if (guest && (path === 'contract' || path === 'mark' || path === 'progress')) return json({ error: 'guest' }, 403);
  if (path === 'progress') return progress(env, who.uid, body, deps);
  if (path === 'mark') return mark(env, who.uid, body, deps);
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

/**
 * What contract offers are worked out from: the campaigns your saved progress
 * says you've beaten (the phone's word), and, for the standards, your marks on
 * the boards, which the server keeps and checks (marks.js), not the ones in
 * your progress.
 */
async function accountProgress(env, uid, deps) {
  const get = deps.getDocs ?? getDocs;
  const [saved, ...entries] = await get(env, [`progress/${uid}`, ...STANDARD_EVENTS.map((id) => `leaderboards/${id}/runs/${uid}`)]);
  const top = Object.fromEntries(STANDARD_EVENTS.map((id, i) => [id, typeof entries[i]?.mark === 'number' ? [{ mark: entries[i].mark }] : []]));
  return { beaten: cleanProgress(saved).beaten, top };
}

/** POST /api/progress: the phone's progress merged into your account's; the result comes back. */
async function progress(env, uid, body, deps) {
  const get = deps.getDocs ?? getDocs;
  const set = deps.setDocs ?? setDocs;
  try {
    const sent = cleanProgress(body?.progress, true);
    // Marks on a board the server knows have to be possible there (marks.js); the rest go.
    for (const [id, list] of Object.entries(sent.top)) {
      const board = Object.hasOwn(BOARDS, id) ? BOARDS[id] : null;
      if (board) sent.top[id] = list.filter((e) => e.mark >= board.min && e.mark <= board.max);
    }
    const [doc] = await get(env, [`progress/${uid}`]);
    const kept = doc ? cleanProgress(doc) : null;
    const merged = cleanProgress(mergeProgress(sent, kept));
    if (!kept || !sameProgress(merged, kept)) await set(env, [{ path: `progress/${uid}`, data: { ...merged, v: 1 }, stamp: 'updatedAt' }]);
    return json({ progress: merged });
  } catch (e) {
    console.warn('api progress', e?.message);
    return json({ error: 'server' }, 502);
  }
}

/** POST /api/mark: a mark for a board, checked and kept if it beats yours; or your username put on your entries. */
async function mark(env, uid, body, deps) {
  const get = deps.getDocs ?? getDocs;
  const set = deps.setDocs ?? setDocs;
  try {
    const name = (await get(env, [`users/${uid}`]))[0]?.name;
    if (typeof name !== 'string' || !name) return json({ error: 'no-name' }, 409);
    if (body?.action === 'rename') {
      const ids = Object.keys(BOARDS);
      const mine = await get(env, ids.map((id) => `leaderboards/${id}/runs/${uid}`));
      const stale = ids.filter((id, i) => mine[i] && mine[i].name !== name);
      await set(env, stale.map((id) => ({ path: `leaderboards/${id}/runs/${uid}`, data: { name }, only: ['name'] })));
      return json({ renamed: stale.length });
    }
    const checked = checkMark(body?.board, body?.mark, body?.ghost ?? null);
    const id = body.board;
    const entry = `leaderboards/${id}/runs/${uid}`;
    const prev = (await get(env, [entry]))[0]?.mark;
    if (typeof prev === 'number' && !beats(checked.board, checked.mark, prev)) return json({ improved: false, best: prev });
    const doc = { name, mark: checked.mark, v: 1 };
    const docs = [{ path: entry, data: doc, stamp: 'createdAt' }];
    if (checked.ghost) {
      // Its runner looks like the athlete the server keeps for you (athletes.js), not one the phone names.
      checked.ghost.athlete = (await playersAthlete(env, uid, '', deps.athlete ?? {})) || null;
      if (checked.traced) {
        doc.traced = true;
        docs.push({ path: `ghosts/${id}/runs/${uid}`, data: { mark: checked.mark, ghost: checked.ghost, v: 1 }, stamp: 'createdAt' });
      } else doc.ghost = checked.ghost;
    }
    await set(env, docs);
    return json({ improved: true, best: checked.mark });
  } catch (e) {
    if (e instanceof MarkError) {
      // Worth a note: a mark that couldn't be, or a run that doesn't come to its time (not a mistyped board).
      if (e.code !== 'bad-board') await audit(env, { uid, kind: 'mark', why: e.code, detail: `${String(body?.board).slice(0, 24)} ${String(body?.mark).slice(0, 24)}: ${e.message}` }, deps.audit ?? {});
      return json({ error: e.code }, e.code === 'bad-board' ? 400 : 409);
    }
    console.warn('api mark', e?.message);
    return json({ error: 'server' }, 502);
  }
}

/** POST /api/athlete: the athlete you play as, kept by the server less any gear you don't have. */
async function athlete(env, uid, body, deps) {
  try {
    const kept = await saveAthlete(env, uid, body?.code, deps.athlete ?? {});
    return kept ? json({ athlete: kept }) : json({ error: 'bad-athlete' }, 400);
  } catch (e) {
    console.warn('api athlete', e?.message);
    return json({ error: 'server' }, 502);
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
    const progress = await accountProgress(env, uid, deps);
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

/** POST /api/shop: what's on sale now and what you have, or an offer bought. */
async function shop(env, uid, body, deps) {
  const action = body?.action;
  if (action !== 'open' && action !== 'buy') return json({ error: 'bad-action' }, 400);
  const change = deps.change ?? changeWallet;
  const offers = deps.offers ?? allOffers;
  try {
    const time = deps.now?.() ?? Date.now();
    const all = await offers(env, time);
    let at = time;
    const r = await change(env, uid, ({ wallet, inventory, counts, now }) => {
      at = now;
      if (action === 'open') return { changes: [] };
      const offer = typeof body.id === 'string' ? all.find((o) => o.id === body.id) : null;
      const why = cantBuy(offer, now, { level: levelOf(wallet.xp), inventory, counts, wallet });
      if (why) throw new WalletError(why);
      return purchase(offer, { inventory, counts });
    });
    const { earned, premium, xp, gold, silver, bronze } = r.wallet;
    return json({ offers: liveOffers(all, at), inventory: r.inventory, counts: r.counts, wallet: { earned, premium, xp, gold, silver, bronze }, now: at, bought: action === 'buy' ? body.id : null });
  } catch (e) {
    if (e instanceof WalletError) return json({ error: e.code }, 409);
    console.warn('api shop', e?.message);
    return json({ error: 'server' }, 502);
  }
}
