import { getProgress, setProgress, onProgressChange } from '../core/storage.js';
import { isSignedIn, knownUid } from './firebase.js';
import { serverHttp, token } from './net.js';
import { clean, merge, same } from './progressRules.js';

/**
 * YOUR PROGRESS FOLLOWS YOUR ACCOUNT: campaign progress (what you've beaten in
 * High School, Collegiate and Pro), your top five marks on every board, and your athlete.
 * Signed in with Google only, like the leaderboards: a guest's progress stays
 * on the phone, and goes up the first time they sign in.
 *
 * Firestore: progress/{uid} = { beaten, top, lineup, character, lineupAt, v, updatedAt },
 * private to you to read; only the meet server writes it (firestore.rules,
 * server/src/api.js POST /api/progress). The phone keeps its own copy
 * (core/storage.js), so the game never waits on this.
 *
 * A sync sends the phone's copy; the server merges it into your account's
 * (online/progressRules.js) and sends back the result, so a phone that's been
 * offline, or two phones played on in turn, never lose anything:
 * - beaten: everything either copy has beaten (nothing is ever un-beaten);
 * - top: both copies' marks, best TOP_N kept;
 * - your athlete (and the old lineup): whichever was changed last (`lineupAt`).
 * syncProgress() runs as you come back to the menu, and a few seconds after
 * any of it changes here.
 */

const PUSH_DELAY = 3000; // ms after a change before it goes up (a race's results change several things at once)

let running = null;
const synced = new Set();

/** `fn(progress)` each time your progress has gone up to your account (contracts' offers come from it). Returns a way to stop. */
export function onProgressSynced(fn) {
  synced.add(fn);
  return () => synced.delete(fn);
}
let again = false;
let timer = null;

// A change here goes up to your account shortly.
onProgressChange(() => {
  if (!isSignedIn()) return;
  clearTimeout(timer);
  timer = setTimeout(() => syncProgress().catch((e) => console.warn('progress not synced', e)), PUSH_DELAY);
});

/**
 * Brings this phone's progress and your account's into line. Resolves true if
 * the phone's copy changed (the menu should redraw), false otherwise, or as a
 * guest. One sync at a time: a call during one runs another after it.
 */
export function syncProgress() {
  if (!isSignedIn()) return Promise.resolve(false);
  if (running) {
    again = true;
    return running;
  }
  running = sync().finally(() => {
    running = null;
    if (again) {
      again = false;
      syncProgress().catch(() => {});
    }
  });
  return running;
}

async function sync() {
  const uid = knownUid();
  const res = await fetch(`${serverHttp()}/api/progress`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ progress: getProgress() }),
  });
  const answer = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(answer.error ?? `progress ${res.status}`);
  if (uid !== knownUid()) return false; // signed in as someone else meanwhile
  const merged = clean(answer.progress);
  for (const fn of synced) fn(merged);
  // Anything that changed here while that was on its way gets merged in too.
  const local = getProgress();
  const next = merge(local, merged);
  if (same(next, local)) return false;
  setProgress(next);
  return true;
}

export { merge };
