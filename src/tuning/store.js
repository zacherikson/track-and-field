import { CONFIG } from '../config.js';
import { PARAMS } from './params.js';
import { migrateKey } from '../core/storage.js';

/**
 * Reads and writes tunable values directly on CONFIG. Everything in the game
 * holds references to the CONFIG objects, so a change applies from the next
 * physics step. Overrides are saved on this device (localStorage) and
 * re-applied at startup; defaults are whatever config.js says.
 */
const KEY = 'trackroyale.tuning.v1';
migrateKey('thumbathlon.tuning.v1', KEY);

const getPath = (path) => path.split('.').reduce((o, k) => o[k], CONFIG);
function setPath(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], CONFIG)[last] = value;
}

// Snapshot of config.js values, taken before any saved overrides are applied.
export const DEFAULTS = Object.fromEntries(PARAMS.map((p) => [p.path, getPath(p.path)]));

export const getParam = getPath;

export function setParam(path, value) {
  setPath(path, value);
  save();
}

export function resetParam(path) {
  setParam(path, DEFAULTS[path]);
}

export function resetAll() {
  for (const p of PARAMS) setPath(p.path, DEFAULTS[p.path]);
  save();
}

/** Apply saved overrides. Call once at startup, before the first race. */
export function loadOverrides() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) || {};
    for (const [path, v] of Object.entries(saved)) {
      if (path in DEFAULTS && Number.isFinite(v)) setPath(path, v);
    }
  } catch {
    /* no storage: run on defaults */
  }
}

function save() {
  const diff = {};
  for (const p of PARAMS) {
    const v = getPath(p.path);
    if (v !== DEFAULTS[p.path]) diff[p.path] = v;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(diff));
  } catch {
    /* ignore */
  }
}

/** Settings that differ from config.js: [{ param, from, to }]. */
export function changes() {
  return PARAMS.filter((p) => getPath(p.path) !== DEFAULTS[p.path]).map((p) => ({ param: p, from: DEFAULTS[p.path], to: getPath(p.path) }));
}
