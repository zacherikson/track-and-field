// Tiny localStorage wrapper. Storage can throw (private mode, quota, disabled),
// so every access is guarded and the game still works without persistence.
const KEY = 'trackroyale.v1';

/** Moves data saved under the game's old name (Thumbathlon) to its new key, once. */
export function migrateKey(oldKey, newKey) {
  try {
    const old = localStorage.getItem(oldKey);
    if (old != null && localStorage.getItem(newKey) == null) localStorage.setItem(newKey, old);
    localStorage.removeItem(oldKey);
  } catch {
    /* ignore */
  }
}
migrateKey('thumbathlon.v1', KEY);

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

// What follows your account (online/progress.js): campaign progress, your top
// marks, your lineup and solo athlete. Changing any of it tells the listener,
// which saves it to the account a moment later.
let progressListener = null;

/** `fn` is called whenever the progress that follows your account changes here. */
export function onProgressChange(fn) {
  progressListener = fn;
}

const progressChanged = () => progressListener?.();

/**
 * The progress that follows your account: { beaten, top, lineup, character,
 * lineupAt }. `lineupAt` is when you last changed your athlete (ms; 0 if never
 * since this was kept), so the newer choice wins a sync. `lineup` is from when
 * each event had its own athlete: no longer used, but kept as it was (the
 * progress doc needs it, firestore.rules).
 */
export function getProgress() {
  const d = load();
  return { beaten: d.beaten ?? {}, top: d.top ?? {}, lineup: getLineup(), character: d.character ?? null, lineupAt: d.lineupAt ?? 0 };
}

/** Replaces the progress that follows your account (a sync's result). Doesn't count as a change here. */
export function setProgress(p) {
  const data = load();
  Object.assign(data, { beaten: p.beaten, top: p.top, lineup: p.lineup, character: p.character, lineupAt: p.lineupAt });
  save(data);
}

/** Forgets it all: it belonged to the player you were (you signed out). */
export function forgetProgress() {
  const data = load();
  for (const k of ['beaten', 'top', 'lineup', 'character', 'lineupAt']) delete data[k];
  save(data);
}

export function getBest(eventId) {
  return load().best?.[eventId] ?? null;
}

/** Sets (or with null, clears) a personal best outright: the online board's copy wins (online/bests.js). */
export function setBest(eventId, value, lowerIsBetter = true) {
  const data = load();
  data.best ??= {};
  if (value == null) delete data.best[eventId];
  else {
    data.best[eventId] = value;
    keepInTop(data, eventId, value, lowerIsBetter);
  }
  save(data);
  progressChanged();
}

/** Records a result; returns true if it is a new personal best. `lowerIsBetter` for timed events. */
export function submitBest(eventId, value, lowerIsBetter = true) {
  const data = load();
  data.best ??= {};
  const prev = data.best[eventId];
  const better = prev == null || (lowerIsBetter ? value < prev : value > prev);
  if (better) {
    if (prev != null) keepInTop(data, eventId, prev, lowerIsBetter); // the best it replaces stays on your top list
    data.best[eventId] = value;
    save(data);
    progressChanged();
  }
  return better;
}

// Your top marks per board, best first (the personal leaderboard).
export const TOP_N = 5;

/**
 * Your best `TOP_N` marks on a board (an event or a tournament kind's id),
 * best first: [{ mark, at, who, where }], where `at` is when (ms), `who` the
 * athlete (or 'Team'), `where` 'amateur' | 'pro' | 'training' | 'live'.
 * Only kept since this list was added: your personal best from before (or
 * one synced from the online board) shows as an entry with no details.
 */
export function getTopMarks(boardId, lowerIsBetter = true) {
  const list = Array.isArray(load().top?.[boardId]) ? load().top[boardId] : [];
  const best = getBest(boardId);
  const better = (a, b) => (lowerIsBetter ? a < b : a > b);
  if (best != null && !list.some((e) => e.mark === best) && (!list.length || better(best, list[0].mark))) {
    return [{ mark: best, at: null, who: null, where: null }, ...list].slice(0, TOP_N);
  }
  return list;
}

/** Puts a best with no details (from before the list, or synced) on `data`'s top list, if it isn't there and makes it. */
function keepInTop(data, boardId, mark, lowerIsBetter) {
  const list = Array.isArray(data.top?.[boardId]) ? data.top[boardId] : [];
  if (list.some((e) => e.mark === mark)) return;
  data.top ??= {};
  data.top[boardId] = [...list, { mark, at: null, who: null, where: null }].sort((a, b) => (lowerIsBetter ? a.mark - b.mark : b.mark - a.mark)).slice(0, TOP_N);
}

/** Adds a mark to a board's top list if it makes it. Returns its place (1..TOP_N), or 0. */
export function addTopMark(boardId, entry, lowerIsBetter = true) {
  // (The personal best was saved just before: it's this mark, not an earlier one without details.)
  const kept = getTopMarks(boardId, lowerIsBetter).filter((e) => !(e.at == null && e.mark === entry.mark));
  const list = [...kept, entry].sort((a, b) => (lowerIsBetter ? a.mark - b.mark : b.mark - a.mark)).slice(0, TOP_N);
  const place = list.indexOf(entry) + 1;
  if (!place) return 0;
  const data = load();
  data.top ??= {};
  data.top[boardId] = list;
  save(data);
  progressChanged();
  return place;
}

/** Forgets every top list (they belonged to the player you were: signed out, or someone else signed in). */
export function forgetTopMarks() {
  const data = load();
  delete data.top;
  save(data);
}

/** Whether the Leaderboard opens on your own marks ('mine') or the online boards ('global'). */
export function getBoardView() {
  return load().boardView === 'global' ? 'global' : 'mine';
}

export function setBoardView(view) {
  const data = load();
  data.boardView = view;
  save(data);
}

/** Your athlete (a character id from roster.js), or null for the default. */
export function getCharacter() {
  return load().character ?? null;
}

export function setCharacter(id) {
  const data = load();
  data.character = id;
  data.lineupAt = Date.now();
  save(data);
  progressChanged();
}

/** The old per-event lineup, { [eventId]: character id } (see getProgress). */
function getLineup() {
  const l = load().lineup;
  return l && typeof l === 'object' ? l : {};
}

// The campaign you're playing ('amateur' or 'pro'), or null for Training. Set
// by the menu for this session; it decides the rivals and what a win counts for.
// Training (and a race from the leaderboard) has no computer rivals, just you
// and your ghost; a campaign has rivals and no ghost.
let campaign = null;

export function setCampaign(level) {
  campaign = level === 'amateur' || level === 'pro' ? level : null;
}

export function getCampaign() {
  return campaign;
}

// The rival level for the special events (the relay): Special Events' RIVALS toggle, for this session.
let specialLevel = 'amateur';

export function setSpecialLevel(level) {
  specialLevel = level === 'pro' ? 'pro' : 'amateur';
}

export function getSpecialLevel() {
  return specialLevel;
}

/** Whether computer rivals race: only in a campaign. */
export function hasRivals() {
  return campaign != null;
}

/** Rival difficulty, 'amateur' or 'pro': the campaign's. */
export function getDifficulty() {
  return campaign ?? 'amateur';
}

/**
 * What you've beaten in a campaign ('amateur' or 'pro'): { [eventId | 'tournament']: true }.
 * Win an event (first place) to tick it off, in any order; the tournament opens once all five are.
 */
export function getBeaten(level) {
  const b = load().beaten?.[level];
  return b && typeof b === 'object' ? b : {};
}

// The tick most recently earned, { level, id }, for the menu to stamp in.
let fresh = null;

/** Ticks `id` off in campaign `level`. Returns true if it's new. */
export function markBeaten(level, id) {
  const data = load();
  data.beaten ??= {};
  data.beaten[level] ??= {};
  if (data.beaten[level][id]) return false;
  data.beaten[level][id] = true;
  save(data);
  fresh = { level, id };
  progressChanged();
  return true;
}

/** The tick earned since the menu last asked, once: { level, id } or null. */
export function takeFreshBeaten() {
  const f = fresh;
  fresh = null;
  return f;
}

/** Whether your own best run races as a ghost in Training (menu toggle; off unless turned on). */
export function getGhostOn() {
  return load().ghost === true;
}

export function setGhostOn(on) {
  const data = load();
  data.ghost = on;
  save(data);
}

// Your best recorded attempt per event, raced as a ghost (see online/ghost.js and
// online/trace.js). Kept under its own key: a recording is a few KB and the main
// save stays small.
const GHOSTS = 'trackroyale.ghosts.v1';

export function getGhost(eventId) {
  try {
    return JSON.parse(localStorage.getItem(GHOSTS))?.[eventId] ?? null;
  } catch {
    return null;
  }
}

/** Keeps `run` as this event's ghost if it beats the one saved (`ev` from registry.js). Returns true if kept. */
export function saveGhostIfBetter(ev, run) {
  const prev = getGhost(ev.id);
  if (prev && Number.isFinite(prev.mark) && (ev.lowerIsBetter ? prev.mark <= run.mark : prev.mark >= run.mark)) return false;
  try {
    const all = JSON.parse(localStorage.getItem(GHOSTS)) || {};
    all[ev.id] = run;
    localStorage.setItem(GHOSTS, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/** Replaces (or with null, forgets) this event's ghost. */
export function setGhost(eventId, run) {
  try {
    const all = JSON.parse(localStorage.getItem(GHOSTS)) || {};
    if (run) all[eventId] = run;
    else delete all[eventId];
    localStorage.setItem(GHOSTS, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

// Your best tournament, for its ghosts:
// { total, events: { [eventId]: { mark, pts, ghost } } }.
const BEST_TOURNAMENT = 'trackroyale.besttournament.v1';

export function getBestTournament() {
  try {
    return JSON.parse(localStorage.getItem(BEST_TOURNAMENT));
  } catch {
    return null;
  }
}

export function saveBestTournament(best) {
  try {
    if (best) localStorage.setItem(BEST_TOURNAMENT, JSON.stringify(best));
    else localStorage.removeItem(BEST_TOURNAMENT);
    return true;
  } catch {
    return false;
  }
}

/** The name shown on the online leaderboard. Made up once, then kept. */
export function getPlayerName() {
  const data = load();
  if (!data.name) {
    data.name = `Runner ${1000 + Math.floor(Math.random() * 9000)}`;
    save(data);
  }
  return data.name;
}

// The username that gets the tuning panel (the game's owner). Usernames are
// claimed on the server (firebase.js setUsername), so no one else can take it.
const TUNER = 'rawnald';

/** Whether this player gets the tuning panel (and their saved tuning): only the owner. */
export function canTune() {
  return getPlayerName().toLowerCase() === TUNER;
}

/**
 * Tidies a typed username: single spaces, 16 characters at most, letters,
 * digits, spaces and _ . ' - only, starting with a letter or digit. Returns ''
 * if nothing usable is left. (firestore.rules checks the same shape.)
 */
export function cleanName(typed) {
  const name = String(typed ?? '').replace(/\s+/g, ' ').trim().slice(0, 16).trim();
  return /^[\p{L}\p{N}][\p{L}\p{N} _.'-]*$/u.test(name) ? name : '';
}

/** Sets your username; null goes back to a new made-up one. */
export function setPlayerName(name) {
  const data = load();
  if (name) data.name = name;
  else delete data.name;
  save(data);
}
