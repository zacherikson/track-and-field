import { CONFIG } from '../config.js';

/**
 * LEVELS AND XP (the design doc's "Levels and XP"): you earn XP by racing, more
 * for a better place, and your level comes from your XP. Levels unlock shop
 * items; they never decide contracts (only medals and marks do).
 *
 * XP lives on the server with your wallet (src/economy/wallet.js `xp`): the
 * phone reports a race (mode, place, field) and the server works out its XP
 * here, so the amounts are the server's, with a daily cap (CONFIG.economy.xp).
 * Pure: shared by the game and the meet server.
 */
export const MODES = ['training', 'computer', 'live'];

/** XP in all to reach level `L` (level 1 = 0). */
export function xpForLevel(L) {
  const { step } = CONFIG.economy.levels;
  return (step * L * (L - 1)) / 2;
}

/** The level `xp` in all reaches. */
export function levelOf(xp) {
  const { step, max } = CONFIG.economy.levels;
  const v = Math.max(0, Number(xp) || 0);
  let L = Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * v) / step)) / 2));
  while (L > 1 && xpForLevel(L) > v) L--; // floating point at a boundary
  while (L < max && xpForLevel(L + 1) <= v) L++;
  return Math.min(max, L);
}

/** Where `xp` stands: { level, xp, from, to } (`from`/`to` = XP at this level and the next; `to` null at the top). */
export function levelProgress(xp) {
  const v = Math.max(0, Math.floor(Number(xp) || 0));
  const level = levelOf(v);
  return { level, xp: v, from: xpForLevel(level), to: level >= CONFIG.economy.levels.max ? null : xpForLevel(level + 1) };
}

/** A reported race, or null if it doesn't make sense: { mode, place, field } (place 1 = first, field = how many raced). */
export function cleanRace(r) {
  const mode = r?.mode;
  const field = Number(r?.field);
  const place = Number(r?.place);
  if (!MODES.includes(mode) || !Number.isInteger(field) || field < 1 || field > 12) return null;
  if (!Number.isInteger(place) || place < 1 || place > field) return null;
  return { mode, place, field };
}

/** XP for a race: finishing, plus a bonus for 1st to 3rd when you raced anyone. 0 for a race that doesn't make sense. */
export function xpForRace(race) {
  const r = cleanRace(race);
  if (!r) return 0;
  const t = CONFIG.economy.xp[r.mode];
  const bonus = r.field > 1 ? (t.place[r.place - 1] ?? 0) : 0;
  return t.finish + bonus;
}

/** The day number XP is capped by (UTC days since 1970). */
export function xpDay(now = Date.now()) {
  return Math.floor(now / 864e5);
}
