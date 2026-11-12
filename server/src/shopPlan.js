import { ITEMS, itemById } from '../../src/economy/items.js';
import { cleanOffers } from '../../src/economy/shop.js';
import { seededRandom } from '../../src/core/random.js';

/**
 * THE SHOP'S PLAN: the offers the server puts in the shop by itself
 * (src/economy/shop.js: `auto` offers), so there's a shop with nobody running
 * it. Everything here is the server's alone: the game never sees a price it
 * wasn't sent.
 *
 * - BASICS: the common gear, always on sale.
 * - THIS WEEK: WEEKLY picks of the epic and legendary gear, Monday to Monday (UTC).
 * - TODAY: DAILY picks of the rest, midnight to midnight (UTC), and a free
 *   daily gift of Coins.
 * - The exchange: Gems into Coins, as often as you like.
 * Picks are seeded by the day and week, so planning the same day twice gives
 * the same offers (same ids): a plan can always be made again.
 *
 * There are no scheduled jobs: whenever the shop is read and its plan runs
 * out within AHEAD days, it's planned HORIZON days on (shopStore.js). Offers
 * made by hand (server/tools/shop.mjs, or the Firebase console) aren't `auto`
 * and are never touched.
 *
 * All amounts are placeholders.
 */
const DAY = 864e5;
export const HORIZON = 14; // days planned at a time
export const AHEAD = 2; // plan again when fewer than this many days are left
const WEEKLY = 2;
const DAILY = 4;
const GIFT = 50; // Coins in the free daily gift
const EXCHANGE = { premium: 10, earned: 1000 }; // Gems into Coins

/** What the shop's gear costs, and how it's sold: 'basics' (always) or 'rotation'. */
export const PRICES = {
  'spikes-bubblegum-01': { pool: 'basics', price: { earned: 400 } },
  'spikes-forest-01': { pool: 'basics', price: { earned: 400 } },
  'socks-pink-01': { pool: 'basics', price: { earned: 300 } },
  'band-black-01': { pool: 'basics', price: { earned: 300 } },
  'glasses-blackvisor-01': { pool: 'basics', price: { earned: 600 } },
  'sleeves-redwrist-01': { pool: 'basics', price: { earned: 300 } },
  'kit-blackstripe-01': { pool: 'basics', price: { earned: 500 } },
  'spikes-lava-01': { pool: 'rotation', price: { earned: 1500 } },
  'spikes-galaxy-01': { pool: 'rotation', price: { premium: 40 } },
  'spikes-chrome-01': { pool: 'rotation', price: { earned: 8000, premium: 50 } },
  'socks-gold-01': { pool: 'rotation', price: { earned: 1200 } },
  'socks-neon-01': { pool: 'rotation', price: { premium: 30 } },
  'band-volt-01': { pool: 'rotation', price: { earned: 1000 } },
  'band-magenta-01': { pool: 'rotation', price: { earned: 1000 } },
  'glasses-redshades-01': { pool: 'rotation', price: { earned: 1500 } },
  'glasses-ice-01': { pool: 'rotation', price: { premium: 35 } },
  'sleeves-white-01': { pool: 'rotation', price: { earned: 1200 } },
  'sleeves-goldwrist-01': { pool: 'rotation', price: { premium: 25 } },
  'kit-whitehoops-01': { pool: 'rotation', price: { earned: 1500 } },
  'kit-voltyoke-01': { pool: 'rotation', price: { premium: 40 } },
  'kit-goldhoops-01': { pool: 'rotation', price: { premium: 120 } },
};

/** The shop's day: whole days since 1970 (UTC). */
export const shopDay = (now) => Math.floor(now / DAY);
/** The shop's week: Mondays start them (1970-01-01 was a Thursday). */
export const shopWeek = (day) => Math.floor((day + 3) / 7);
const weekStart = (week) => (week * 7 - 3) * DAY;

/** `n` of `list`, picked at random from `seed`. */
function pick(list, n, seed) {
  const rng = seededRandom(seed);
  const pool = [...list];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

const pool = (name) => ITEMS.filter((i) => PRICES[i.id]?.pool === name);
const gear = (id, extra) => ({ id: `${extra.section === 'basics' ? 'basic' : extra.section}${extra.key}-${id}`, grants: [{ item: id }], price: PRICES[id].price, level: itemById(id).level, limit: 1, auto: true, ...extra, key: undefined });

/** The week's picks (items): the same all week. */
export function weeklyPicks(week) {
  return pick(pool('rotation').filter((i) => i.rarity === 'epic' || i.rarity === 'legendary'), WEEKLY, `shop-week-${week}`);
}

/** The day's picks (items): none of its week's. */
export function dailyPicks(day) {
  const weekly = weeklyPicks(shopWeek(day));
  return pick(pool('rotation').filter((i) => !weekly.includes(i)), DAILY, `shop-day-${day}`);
}

/** The server's own offers for `days` days from `day`: basics, the exchange, and each week's and day's picks and gift. */
export function planOffers(day, days = HORIZON) {
  const offers = [];
  const weeks = new Set();
  for (let d = day; d < day + days; d++) {
    const week = shopWeek(d);
    if (!weeks.has(week)) {
      weeks.add(week);
      weeklyPicks(week).forEach((i, k) => offers.push(gear(i.id, { section: 'weekly', key: `-${week}`, from: weekStart(week), until: weekStart(week + 1), sort: k })));
    }
    offers.push({ id: `gift-${d}`, section: 'daily', title: 'Daily gift', grants: [{ currency: 'earned', amount: GIFT }], price: {}, level: 1, limit: 1, from: d * DAY, until: (d + 1) * DAY, sort: -1, auto: true });
    dailyPicks(d).forEach((i, k) => offers.push(gear(i.id, { section: 'daily', key: `-${d}`, from: d * DAY, until: (d + 1) * DAY, sort: k })));
  }
  pool('basics').forEach((i, k) => offers.push(gear(i.id, { section: 'basics', key: '', from: 0, until: 0, sort: k })));
  offers.push({ id: 'exchange-coins', section: 'basics', title: '', grants: [{ currency: 'earned', amount: EXCHANGE.earned }], price: { premium: EXCHANGE.premium }, level: 1, limit: 0, from: 0, until: 0, sort: 100, auto: true });
  return cleanOffers(offers);
}

/**
 * The shop as kept ({ offers, plannedTo: the day its plan runs out }) brought
 * up to `now`: { offers, plannedTo, changed }. With fewer than AHEAD days of
 * plan left it's planned again from today: the server's own offers are
 * replaced (what's still on sale comes out the same; what's over is dropped),
 * anything made by hand kept.
 */
export function topUp(shop, now) {
  const day = shopDay(now);
  const offers = cleanOffers(shop?.offers);
  const plannedTo = Number.isInteger(shop?.plannedTo) ? shop.plannedTo : 0;
  if (plannedTo >= day + AHEAD) return { offers, plannedTo, changed: false };
  const byHand = offers.filter((o) => !o.auto && (!o.until || o.until > now)); // one that's over goes too
  const taken = new Set(byHand.map((o) => o.id));
  return { offers: [...planOffers(day).filter((o) => !taken.has(o.id)), ...byHand], plannedTo: day + HORIZON, changed: true };
}
