import { isSignedIn, knownUid } from './firebase.js';
import { serverHttp, token } from './net.js';
import { xpForRace, levelProgress } from '../economy/levels.js';

/**
 * YOUR XP AND LEVEL (src/economy/levels.js). XP lives on the server with your
 * wallet: the phone only reports the races you finish, and the server works out
 * what each is worth and adds it (server/src/api.js, up to a daily cap).
 *
 * Reports wait in a queue on the phone, so a race run offline counts once
 * you're back online; each carries its own ref, so none counts twice. Signed in
 * with Google only: a guest's races aren't reported (they earn nothing).
 *
 * The phone keeps the level it was last told, to show at once and offline.
 */
const QUEUE = 'trackroyale.xpqueue';
const LEVEL = 'trackroyale.level';
const MAX_QUEUE = 200; // races waiting at most (oldest dropped): a long time offline

const load = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const store = (key, v) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
};
const newRef = () => (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 24).padEnd(12, '0');

/** Your level as last told by the server: { level, xp, from, to } (levels.js levelProgress), or null. */
export function myLevel() {
  const saved = load(LEVEL, null);
  return saved && saved.uid === knownUid() ? levelProgress(saved.xp) : null;
}

/** Keeps `xp` as your XP (read with your wallet: online/wallet.js), and says so to onXp's listeners. */
export function rememberXp(xp) {
  store(LEVEL, { uid: knownUid(), xp });
  for (const fn of listeners) fn({ xp, level: levelProgress(xp).level, gained: 0, levelUp: false });
}

/** Forgets the saved level and anything waiting to be reported (you signed out). */
export function forgetXp() {
  try {
    localStorage.removeItem(LEVEL);
    localStorage.removeItem(QUEUE);
  } catch {}
}

const listeners = new Set();
/** `fn(result)` after each report the server answers ({ gained, xp, level, levelUp }). Returns a way to stop. */
export function onXp(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * A race you finished: { mode: 'training' | 'computer' | 'live', place, field }.
 * Queues it for the server and sends what's waiting. Returns the XP it should
 * be worth (0 for a guest, or a race worth nothing); the server's answer
 * (the daily cap, a level up) comes to onXp.
 */
export function reportRace(race) {
  if (!isSignedIn()) return 0;
  const xp = xpForRace(race);
  if (!xp) return 0;
  const queue = load(QUEUE, []);
  queue.push({ ref: newRef(), uid: knownUid(), mode: race.mode, place: race.place, field: race.field });
  store(QUEUE, queue.slice(-MAX_QUEUE));
  flushXp().catch(() => {}); // offline: it waits
  return xp;
}

let sending = null;
/** Sends the races waiting (yours: one signed in as someone else stays put). Resolves to the server's answer, or null. */
export function flushXp() {
  sending ??= send().finally(() => {
    sending = null;
  });
  return sending;
}

async function send() {
  if (!isSignedIn()) return null;
  const uid = knownUid();
  const mine = load(QUEUE, []).filter((c) => c.uid === uid).slice(0, 20);
  if (!mine.length) return null;
  const res = await fetch(`${serverHttp()}/api/xp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ claims: mine.map(({ ref, mode, place, field }) => ({ ref, mode, place, field })) }),
  });
  const body = await res.json().catch(() => ({}));
  // Whatever the server counted (or found worth nothing) is done with, even if it then failed.
  const done = new Set(body.done ?? []);
  if (done.size) store(QUEUE, load(QUEUE, []).filter((c) => !done.has(c.ref)));
  if (!res.ok) throw new Error(`xp ${res.status} ${body.error ?? ''}`);
  store(LEVEL, { uid, xp: body.xp });
  for (const fn of listeners) fn(body);
  // More than one request's worth was waiting: the next lot goes next.
  if (done.size && load(QUEUE, []).some((c) => c.uid === uid)) setTimeout(() => flushXp().catch(() => {}), 0);
  return body;
}
