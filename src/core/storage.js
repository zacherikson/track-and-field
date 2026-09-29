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

/** The athlete you play as (a character id from roster.js), or null for the default. */
export function getCharacter() {
  return load().character ?? null;
}

export function setCharacter(id) {
  const data = load();
  data.character = id;
  save(data);
}

/** Rival difficulty chosen on the menu: 'amateur' or 'pro'. */
export function getDifficulty() {
  const d = load().difficulty;
  return d === 'pro' ? 'pro' : 'amateur';
}

export function setDifficulty(level) {
  const data = load();
  data.difficulty = level;
  save(data);
}

/** Whether your own best run races as a ghost (menu toggle; off unless turned on). */
export function getGhostOn() {
  return load().ghost === true;
}

export function setGhostOn(on) {
  const data = load();
  data.ghost = on;
  save(data);
}

// Your best recorded run per event, raced as a ghost (see online/ghost.js). Kept
// under its own key: a run is a few KB and the main save stays small.
const GHOSTS = 'trackroyale.ghosts.v1';

export function getGhost(eventId) {
  try {
    return JSON.parse(localStorage.getItem(GHOSTS))?.[eventId] ?? null;
  } catch {
    return null;
  }
}

/** Keeps `run` as this event's ghost if it is faster than the one saved. Returns true if kept. */
export function saveGhostIfFaster(eventId, run) {
  const prev = getGhost(eventId);
  if (prev && Number.isFinite(prev.mark) && prev.mark <= run.mark) return false;
  try {
    const all = JSON.parse(localStorage.getItem(GHOSTS)) || {};
    all[eventId] = run;
    localStorage.setItem(GHOSTS, JSON.stringify(all));
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

/**
 * Tidies a typed username: single spaces, 16 characters at most, letters,
 * digits, spaces and _ . ' - only, starting with a letter or digit. Returns ''
 * if nothing usable is left. (firestore.rules checks the same shape.)
 */
export function cleanName(typed) {
  const name = String(typed ?? '').replace(/\s+/g, ' ').trim().slice(0, 16).trim();
  return /^[\p{L}\p{N}][\p{L}\p{N} _.'-]*$/u.test(name) ? name : '';
}

export function setPlayerName(name) {
  const data = load();
  data.name = name;
  save(data);
}
