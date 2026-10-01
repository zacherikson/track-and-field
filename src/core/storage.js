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

export function getBest(eventId) {
  return load().best?.[eventId] ?? null;
}

/** Sets (or with null, clears) a personal best outright: the online board's copy wins (online/bests.js). */
export function setBest(eventId, value) {
  const data = load();
  data.best ??= {};
  if (value == null) delete data.best[eventId];
  else data.best[eventId] = value;
  save(data);
}

/** Records a result; returns true if it is a new personal best. `lowerIsBetter` for timed events. */
export function submitBest(eventId, value, lowerIsBetter = true) {
  const data = load();
  data.best ??= {};
  const prev = data.best[eventId];
  const better = prev == null || (lowerIsBetter ? value < prev : value > prev);
  if (better) {
    data.best[eventId] = value;
    save(data);
  }
  return better;
}

/** Your solo athlete (a character id from roster.js), or null for the default: the one who does a solo tournament. */
export function getCharacter() {
  return load().character ?? null;
}

export function setCharacter(id) {
  const data = load();
  data.character = id;
  save(data);
}

/**
 * Your lineup: who does each event, { [eventId]: character id }. An event
 * missing from it (never set) or null (emptied with Remove) is done by your
 * solo athlete (getCharacter).
 */
export function getLineup() {
  const l = load().lineup;
  return l && typeof l === 'object' ? l : {};
}

export function setLineupSlot(eventId, id) {
  const data = load();
  data.lineup = { ...getLineup(), [eventId]: id };
  save(data);
}

/** Which tournament the menu plays: 'solo' (one athlete, all five events) or 'team' (your lineup). */
export function getTourMode() {
  return load().tourMode === 'team' ? 'team' : 'solo';
}

export function setTourMode(mode) {
  const data = load();
  data.tourMode = mode;
  save(data);
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

// Your best tournament of each kind ('solo' or 'team'), for its ghosts:
// { total, events: { [eventId]: { mark, pts, ghost } } }.
const BEST_TOURNAMENT = { solo: 'trackroyale.besttournament.v1', team: 'trackroyale.bestteamtournament.v1' };

export function getBestTournament(mode) {
  try {
    return JSON.parse(localStorage.getItem(BEST_TOURNAMENT[mode]));
  } catch {
    return null;
  }
}

export function saveBestTournament(mode, best) {
  try {
    if (best) localStorage.setItem(BEST_TOURNAMENT[mode], JSON.stringify(best));
    else localStorage.removeItem(BEST_TOURNAMENT[mode]);
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
