import { getProgress, setProgress, onProgressChange, TOP_N } from '../core/storage.js';
import { BOARDS, SPECIAL_EVENTS } from '../events/registry.js';
import { connectSDK, isSignedIn } from './firebase.js';

/**
 * YOUR PROGRESS FOLLOWS YOUR ACCOUNT: campaign progress (what you've beaten in
 * Amateur and Pro), your top five marks on every board, and your lineup and
 * solo athlete. Signed in with Google only, like the leaderboards: a guest's
 * progress stays on the phone, and goes up the first time they sign in.
 *
 * Firestore: progress/{uid} = { beaten, top, lineup, character, lineupAt, v, updatedAt },
 * private to you (firestore.rules). The phone keeps its own copy
 * (core/storage.js), so the game never waits on this.
 *
 * A sync merges the two copies, so a phone that's been offline, or two phones
 * played on in turn, never lose anything:
 * - beaten: everything either copy has beaten (nothing is ever un-beaten);
 * - top: both copies' marks, best TOP_N kept;
 * - lineup and solo athlete: whichever was changed last (`lineupAt`).
 * syncProgress() runs as you come back to the menu, and a few seconds after
 * any of it changes here.
 */

const DOC_VERSION = 1;
const PUSH_DELAY = 3000; // ms after a change before it goes up (a race's results change several things at once)

let running = null;
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
  const { fs, db, uid } = await connectSDK();
  const ref = fs.doc(db, 'progress', uid);
  let merged = null;
  await fs.runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const remote = snap.exists() ? clean(snap.data()) : null;
    merged = merge(getProgress(), remote);
    if (!remote || !same(merged, remote)) tx.set(ref, { ...clean(merged), v: DOC_VERSION, updatedAt: fs.serverTimestamp() });
  });
  // Anything that changed here while that was on its way gets merged in too.
  const local = getProgress();
  const next = merge(local, merged);
  if (same(next, local)) return false;
  setProgress(next);
  return true;
}

/** `a` and `b` merged (see the top of this file); `b` may be null (nothing saved yet). */
export function merge(a, b) {
  if (!b) return a;
  const beaten = {};
  for (const level of keys(a.beaten, b.beaten)) {
    beaten[level] = {};
    for (const id of keys(a.beaten[level], b.beaten[level])) if (a.beaten[level]?.[id] || b.beaten[level]?.[id]) beaten[level][id] = true;
  }
  const top = {};
  for (const id of keys(a.top, b.top)) top[id] = mergeTop(a.top[id], b.top[id], lowerIsBetter(id));
  // The lineup changed last wins; a tie goes to the account (a new phone's untouched lineup mustn't replace it).
  const lineup = (b.lineupAt ?? 0) >= (a.lineupAt ?? 0) ? b : a;
  return { beaten, top, lineup: lineup.lineup, character: lineup.character, lineupAt: lineup.lineupAt };
}

/** Two top lists as one: every mark either has (once), best first, TOP_N kept. */
function mergeTop(x = [], y = [], lower = true) {
  const seen = new Set();
  const all = [];
  for (const e of [...x, ...y]) {
    const k = `${e.mark}|${e.at}`;
    if (seen.has(k)) continue;
    seen.add(k);
    all.push(e);
  }
  // A best with no details (from before the list was kept) goes once the same mark turns up with them.
  const detailed = new Set(all.filter((e) => e.at != null).map((e) => e.mark));
  return all
    .filter((e) => e.at != null || !detailed.has(e.mark))
    .sort((p, q) => (lower ? p.mark - q.mark : q.mark - p.mark))
    .slice(0, TOP_N);
}

// Looked up when needed: the registry may not be loaded yet when this module is (they import each other in a loop).
const lowerIsBetter = (id) => [...BOARDS, ...SPECIAL_EVENTS].find((b) => b.id === id)?.lowerIsBetter ?? true;

const keys = (...objs) => [...new Set(objs.flatMap((o) => Object.keys(o ?? {})))];
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

/** Your account's copy, as the phone keeps it (anything malformed dropped). */
function clean(d) {
  const beaten = {};
  for (const [level, ids] of Object.entries(isObj(d.beaten) ? d.beaten : {})) {
    if (!isObj(ids)) continue;
    beaten[level] = Object.fromEntries(Object.keys(ids).filter((id) => ids[id] === true).map((id) => [id, true]));
  }
  const top = {};
  for (const [id, list] of Object.entries(isObj(d.top) ? d.top : {})) {
    if (!Array.isArray(list)) continue;
    top[id] = list
      .filter((e) => isObj(e) && Number.isFinite(e.mark))
      .map((e) => ({ mark: e.mark, at: Number.isFinite(e.at) ? e.at : null, who: typeof e.who === 'string' ? e.who : null, where: typeof e.where === 'string' ? e.where : null }))
      .slice(0, TOP_N);
  }
  const lineup = {};
  for (const [ev, id] of Object.entries(isObj(d.lineup) ? d.lineup : {})) if (id === null || typeof id === 'string') lineup[ev] = id;
  return { beaten, top, lineup, character: typeof d.character === 'string' ? d.character : null, lineupAt: Number.isFinite(d.lineupAt) ? d.lineupAt : 0 };
}

/** Same progress (key order aside). */
function same(a, b) {
  return canon(a) === canon(b);
}

function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${k}:${canon(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
