import { hasAdmin, readAthlete, readHave, writeAthlete } from './firestoreAdmin.js';
import { parse, encode, wearable } from '../../src/athletes/custom.js';

/**
 * YOUR ATHLETE, KEPT BY THE SERVER (athletes/{uid}: its code, src/athletes/
 * custom.js). The phone asks to save it (api.js POST /api/athlete); the
 * server takes off any gear you don't have (starter gear: your level; the
 * shop's: your inventory) and keeps the rest. From then on the server answers
 * "what does this player look like" itself: a live waiting room, a Practice
 * room and a meet sign-up (index.js) use the athlete kept here, not the one a
 * phone sends, so nobody can wear what they haven't got.
 */

/**
 * Saves `code` as `uid`'s athlete, less any gear they don't have: resolves to
 * the code kept, or null if `code` isn't a made athlete. `guest`: no wallet
 * or inventory to read (level 1, nothing bought).
 * `deps` (tests): { have, write }.
 */
export async function saveAthlete(env, uid, code, { guest = false } = {}, deps = {}) {
  const p = typeof code === 'string' && code.length <= 32 ? parse(code) : null;
  if (!p) return null;
  const have = guest ? { level: 1, inventory: [] } : await (deps.have ?? readHave)(env, uid);
  const kept = wearable(encode(p.look, p.name, p.gear), have);
  await (deps.write ?? writeAthlete)(env, uid, kept);
  return kept;
}

/**
 * The athlete `uid` plays as: the one kept here. With none kept yet (or the
 * database out of reach), what their phone `sent` with all its gear off: a
 * look is free, gear isn't. A server without admin access (local dev, bots)
 * takes what's sent as it is.
 * `deps` (tests): { read }.
 */
export async function playersAthlete(env, uid, sent, deps = {}) {
  const fallback = typeof sent === 'string' ? sent.slice(0, 32) : '';
  if (!deps.read && !hasAdmin(env)) return fallback;
  try {
    const kept = await (deps.read ?? readAthlete)(env, uid);
    if (kept) return kept;
  } catch (e) {
    console.warn('athlete', e?.message);
  }
  return wearable(fallback, { level: 0, inventory: [] }); // level 0: nothing on
}

const queues = new WeakMap(); // peer -> the last thing it's waiting on

/**
 * Runs `fn` for `peer` after everything asked for it before has finished, so
 * its messages (and its leaving) are handled in the order they came even
 * when one of them has to wait for the database.
 */
export function inOrder(peer, fn) {
  const next = (queues.get(peer) ?? Promise.resolve()).then(fn).catch((e) => console.error('peer', e));
  queues.set(peer, next);
  return next;
}

/**
 * `msg` from `peer`, if it's one that says who they play as (a join, a meet
 * sign-up, or anything carrying an `athlete`), with the athlete the server
 * keeps in place of the one sent. The old per-event `lineup` goes: it named
 * athletes too.
 */
export async function withAthlete(env, peer, msg, deps = {}) {
  if (typeof msg?.athlete !== 'string' && msg?.t !== 'join' && msg?.t !== 'signup') return msg;
  return { ...msg, athlete: await playersAthlete(env, peer.uid, msg.athlete, deps), lineup: null };
}
