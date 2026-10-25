import { isSignedIn, knownUid } from './firebase.js';
import { serverHttp, token } from './net.js';
import { rememberWallet } from './wallet.js';
import { onProgressSynced } from './progress.js';
import { STANDARD_EVENTS } from '../economy/contracts.js';

/**
 * YOUR CONTRACT, as the game sees it (the rules: src/economy/contracts.js; the
 * server keeps it: server/src/api.js /api/contract). Signed in with Google only.
 *
 * openContract() runs at the menu: the server collects today's pay if it isn't
 * collected yet (opening the game is what collects it), and answers with your
 * contract, your offers and your wallet. The phone keeps the last answer, so
 * the contract screen shows at once and offline.
 */
const KEY = 'trackroyale.contract';
const OPEN_EVERY = 60000; // ms: the menu asks at most this often (pay is daily)

const load = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return saved && saved.uid === knownUid() ? saved : null;
  } catch {
    return null;
  }
};

/** The last answer for the player you are now: { contract, offers, wallet, at }, or null. */
export function cachedContract() {
  return load();
}

/** Forgets it (you signed out). */
export function forgetContract() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

const listeners = new Set();
/** `fn(answer)` each time the server answers ({ contract, offers, paid, bonus, news, wallet }). Returns a way to stop. */
export function onContract(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let lastOpen = -Infinity;
let opening = null;

// Your offers come from your progress on your account (campaign tournaments
// beaten, best marks): once a change to those has gone up, ask again.
let lastSeen = null;
onProgressSynced((p) => {
  const seen = JSON.stringify([Object.values(p?.beaten ?? {}).map((b) => !!b?.tournament), STANDARD_EVENTS.map((id) => p?.top?.[id]?.[0]?.mark ?? null)]);
  if (lastSeen !== null && seen !== lastSeen) openContract({ force: true }).catch(() => {});
  lastSeen = seen;
});

/**
 * Opens your contract (collecting today's pay). Resolves to the server's answer,
 * or null as a guest or if it was asked less than a minute ago (`force`: ask anyway).
 */
export function openContract({ force = false } = {}) {
  if (!isSignedIn()) return Promise.resolve(null);
  if (opening) return opening;
  if (!force && performance.now() - lastOpen < OPEN_EVERY) return Promise.resolve(null);
  lastOpen = performance.now();
  opening = call({ action: 'open' }).finally(() => {
    opening = null;
  });
  return opening;
}

/** Signs your offer for `tier`. Resolves to the server's answer; rejects with Error('no-offer') and the like. */
export function signContract(tier) {
  return call({ action: 'sign', tier });
}

async function call(body) {
  const uid = knownUid();
  const res = await fetch(`${serverHttp()}/api/contract`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, tz: new Date().getTimezoneOffset() }),
  });
  const answer = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(answer.error ?? `contract ${res.status}`);
  if (uid !== knownUid()) return null; // signed in as someone else meanwhile
  try {
    localStorage.setItem(KEY, JSON.stringify({ uid, contract: answer.contract, offers: answer.offers, at: Date.now() }));
  } catch {}
  rememberWallet(answer.wallet ?? {});
  for (const fn of listeners) fn(answer);
  return answer;
}
