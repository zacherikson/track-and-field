import { CONFIG } from '../config.js';
import { ITEMS, itemById, owns } from './items.js';
import { seededRandom } from '../core/random.js';

/**
 * THE SHOP (the design doc's "Shop and items"): pure rules, shared by the
 * meet server (which alone sells: server/src/api.js /api/shop) and the game
 * (which shows it: online/shop.js, scenes/home/shopPanel.js (the Shop tab)).
 *
 * The same shop for everyone, worked out from the date (no database, no
 * scheduled jobs):
 * - the BASICS (items with avail 'always'), every day;
 * - the WEEKLY: CONFIG.economy.shop.weekly picks of the epic and legendary
 *   rotation items, new each Monday 00:00 UTC;
 * - the DAILY: CONFIG.economy.shop.daily picks of the rest of the rotation,
 *   new at 00:00 UTC.
 * Starter items (avail 'level') aren't sold: they come free with levels.
 * Buying takes the price in each currency (wallet 'spend' changes, whose
 * ledger ids, one per currency, make the same item impossible to pay for twice).
 */
const DAY = 864e5;

/** The shop's day: whole days since 1970 (UTC). */
export function shopDay(now) {
  return Math.floor(now / DAY);
}

/** The shop's week: Mondays start them (1970-01-01 was a Thursday). */
export function shopWeek(day) {
  return Math.floor((day + 3) / 7);
}

/** `n` of `list`, picked at random from `seed`: the same picks on every phone and the server. */
function pick(list, n, seed) {
  const rng = seededRandom(seed);
  const pool = [...list];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/**
 * The shop on `day`: { day, weekly, daily, always } (item ids), and when they
 * change: { nextDay, nextWeek } (ms).
 */
export function shopFor(day) {
  const S = CONFIG.economy.shop;
  const rotation = ITEMS.filter((i) => i.avail === 'rotation');
  const week = shopWeek(day);
  const weekly = pick(rotation.filter((i) => i.rarity === 'epic' || i.rarity === 'legendary'), S.weekly, `shop-week-${week}`);
  const daily = pick(rotation.filter((i) => !weekly.includes(i)), S.daily, `shop-day-${day}`);
  return {
    day,
    weekly: weekly.map((i) => i.id),
    daily: daily.map((i) => i.id),
    always: ITEMS.filter((i) => i.avail === 'always').map((i) => i.id),
    nextDay: (day + 1) * DAY,
    nextWeek: ((week + 1) * 7 - 3) * DAY,
  };
}

/** Is item `id` for sale on `day`? */
export function onSale(id, day) {
  const s = shopFor(day);
  return s.weekly.includes(id) || s.daily.includes(id) || s.always.includes(id);
}

/**
 * Why you can't buy `item` on `day`, or null if you can:
 * 'not-for-sale' | 'level' (below its level) | 'owned' | 'funds' (not enough of a currency).
 * `you` = { level, inventory: [id], wallet }.
 */
export function cantBuy(item, day, { level = 1, inventory = [], wallet = {} } = {}) {
  if (!item || item.price == null || !onSale(item.id, day)) return 'not-for-sale';
  if (owns(item, { level, inventory })) return 'owned';
  if ((level ?? 1) < item.level) return 'level';
  for (const [currency, amount] of Object.entries(item.price)) if ((wallet[currency] ?? 0) < amount) return 'funds';
  return null;
}

/** The wallet changes that pay for `item` (economy/wallet.js): a spend in each currency of its price. */
export function priceChanges(item) {
  return Object.entries(item.price)
    .filter(([, amount]) => amount > 0)
    .map(([currency, amount]) => ({ kind: 'spend', currency, amount, reason: 'shop', ref: `${item.id}-${currency}` })); // a ledger id each
}

/** Item ids as an inventory: known ones, once each (anything else dropped). */
export function cleanInventory(list) {
  return [...new Set((Array.isArray(list) ? list : []).filter((id) => typeof id === 'string' && itemById(id)?.price))];
}
