import { knownUid, rest } from './firebase.js';
import { serverHttp, token } from './net.js';
import { getCustom, setCustom, getCharacter, setCharacter } from '../core/storage.js';
import { isCode, parse, wearable } from '../athletes/custom.js';

/**
 * YOUR ATHLETE ON THE SERVER (server/src/athletes.js: athletes/{uid}). The
 * phone makes your athlete (the Athlete Maker, the Shop's Wear) and keeps it
 * to show at once and offline, but what everyone else sees in a live room or a
 * meet is the copy the server keeps, which the phone asks it to save here
 * (POST /api/athlete). The server takes off any gear you don't have; if it
 * did, the phone takes its answer as your athlete.
 *
 * Saved whenever yours differs from the last one the server confirmed: at the
 * menu, after you change it, and before you join anything live. Guests too.
 */
const KEY = 'trackroyale.athlete'; // { uid, code }: the athlete the server last confirmed

const confirmed = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return saved && saved.uid === knownUid() ? saved.code : null;
  } catch {
    return null;
  }
};

let saving = null; // the save under way

/**
 * Brings the server's copy of your athlete up to date. Resolves once it is
 * (at once if it already was, or you haven't made one); a failure (offline)
 * resolves too: it's tried again next time.
 */
export function syncAthlete() {
  if (saving) return saving;
  const code = getCharacter();
  if (!isCode(code) || !knownUid() || code === confirmed()) return Promise.resolve();
  saving = save(code)
    .catch((e) => console.warn('athlete not saved', e?.message))
    .finally(() => {
      saving = null;
    });
  return saving;
}

/** syncAthlete, but never longer than `ms`: for a join that shouldn't wait on a slow connection. */
export function athleteSynced(ms = 2500) {
  return Promise.race([syncAthlete(), new Promise((r) => setTimeout(r, ms))]);
}

async function save(code) {
  const uid = knownUid();
  const res = await fetch(`${serverHttp()}/api/athlete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const answer = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(answer.error ?? `athlete ${res.status}`);
  if (uid !== knownUid() || !isCode(answer.athlete)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ uid, code: answer.athlete }));
  } catch {}
  // The server took something off (gear this account doesn't have): that's your athlete.
  if (answer.athlete !== code && getCharacter() === code) {
    if (getCustom() === code) setCustom(answer.athlete);
    setCharacter(answer.athlete);
  }
}

/** Forgets what the server confirmed (you signed out). */
export function forgetAthlete() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

/**
 * The athlete the server keeps for player `uid` (its code), or null. For a
 * ghost from the leaderboard: its runner looks like its player does now.
 */
export async function athleteOf(uid) {
  const doc = await rest(`athletes/${uid}`).catch(() => null);
  const code = doc?.fields?.code?.stringValue;
  return isCode(code) && parse(code) ? code : null;
}

/** An athlete as a phone wrote it, with any gear off (nobody vouches for it). */
export const withoutGear = (code) => wearable(code, { level: 0, inventory: [] });
