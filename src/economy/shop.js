import { itemById } from './items.js';
import { CURRENCIES } from './currencies.js';

/**
 * THE SHOP (the design doc's "Shop and items"): pure rules, shared by the
 * meet server (which alone sells: server/src/api.js /api/shop) and the game
 * (which shows what it's sent: online/shop.js, scenes/home/shopPanel.js).
 *
 * The shop is a list of OFFERS, kept in the database (shop/current) and sent
 * by the server: the game knows how to draw an offer and nothing about what's
 * on sale, when, or for how much. A sale, a bundle or a new price is a change
 * to that list, with no new build of the game or the server.
 *
 * An offer:
 *   id       permanent, unique ('daily-20771-spikes-lava-01'): what purchases are counted by
 *   section  where it shows ('weekly', 'daily', 'basics', or any id: SECTION_NAMES)
 *   title    what it's called, when its first grant's own name won't do ('' otherwise)
 *   grants   what you get: [{ item: id } | { currency: 'earned' | 'premium', amount }]
 *   price    what it costs: { earned?, premium? } (all of them; {} is free)
 *   level    the level you need (1: anyone)
 *   limit    how many times one player can buy it (0: as often as they like)
 *   from     when it goes on sale (ms; 0: already)
 *   until    when it comes off (ms; 0: never)
 *   sort     its place in its section (lower first)
 *   auto     true on the ones the server plans itself (server/src/shopPlan.js)
 *
 * What a player has bought is counted per offer (`counts`: { [offer id]: n },
 * kept with their inventory), so a limit holds and each purchase gets ledger
 * ids of its own (wallet.js): the same purchase can't be paid for, or paid
 * out, twice.
 */
const ID = /^[a-z0-9-]{1,60}$/;
const SECTION = /^[a-z0-9-]{1,24}$/;
const MAX_OFFERS = 400;
const MAX_AMOUNT = 1e9;

/** What the sections the server plans are called; any other shows as its id in capitals. */
export const SECTION_NAMES = { weekly: 'THIS WEEK', daily: 'TODAY', basics: 'BASICS' };

const whole = (v, min, max, d) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : d;
};

function cleanGrant(g) {
  if (typeof g?.item === 'string') return itemById(g.item)?.avail === 'shop' ? { item: g.item } : null;
  const amount = whole(g?.amount, 1, MAX_AMOUNT, 0);
  return CURRENCIES.includes(g?.currency) && amount ? { currency: g.currency, amount } : null;
}

/** An offer as stored, whatever was read, or null if it can't be sold (no id, nothing this build can grant, a bad price). */
export function cleanOffer(raw) {
  if (typeof raw?.id !== 'string' || !ID.test(raw.id)) return null;
  const list = Array.isArray(raw.grants) ? raw.grants : [];
  const grants = list.map(cleanGrant);
  if (!grants.length || grants.length > 8 || grants.includes(null)) return null; // all of it, or it isn't sold
  const price = {};
  for (const [c, v] of Object.entries(raw.price && typeof raw.price === 'object' ? raw.price : {})) {
    const amount = whole(v, 0, MAX_AMOUNT, -1);
    if (!CURRENCIES.includes(c) || amount < 0) return null;
    if (amount) price[c] = amount;
  }
  return {
    id: raw.id,
    section: typeof raw.section === 'string' && SECTION.test(raw.section) ? raw.section : 'basics',
    title: typeof raw.title === 'string' ? raw.title.slice(0, 40) : '',
    grants,
    price,
    level: whole(raw.level, 1, 99, 1),
    limit: whole(raw.limit, 0, 1e6, 1),
    from: whole(raw.from, 0, Number.MAX_SAFE_INTEGER, 0),
    until: whole(raw.until, 0, Number.MAX_SAFE_INTEGER, 0),
    sort: whole(raw.sort, -1e6, 1e6, 0),
    auto: raw.auto === true,
  };
}

/** A list of offers as stored: the good ones, the first of any id. */
export function cleanOffers(list) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const o = cleanOffer(raw);
    if (!o || seen.has(o.id) || out.length >= MAX_OFFERS) continue;
    seen.add(o.id);
    out.push(o);
  }
  return out;
}

/** Is `offer` on sale at `now`? */
export const isLive = (offer, now) => now >= offer.from && (!offer.until || now < offer.until);

/** The offers on sale at `now`: section by section (in the order the sections first come in the list), each section's by `sort`. */
export function liveOffers(offers, now) {
  const live = offers.filter((o) => isLive(o, now));
  const sections = [...new Set(live.map((o) => o.section))];
  const at = new Map(live.map((o, i) => [o, i]));
  return live.sort((a, b) => sections.indexOf(a.section) - sections.indexOf(b.section) || a.sort - b.sort || at.get(a) - at.get(b));
}

/** Purchase counts as stored ({ [offer id]: n }), whatever was read. */
export function cleanCounts(raw) {
  const out = {};
  for (const [id, n] of Object.entries(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {})) {
    const v = whole(n, 1, 1e9, 0);
    if (ID.test(id) && v) out[id] = v;
  }
  return out;
}

/** Item ids as an inventory: the shop's own items, once each (anything else dropped). */
export function cleanInventory(list) {
  return [...new Set((Array.isArray(list) ? list : []).filter((id) => typeof id === 'string' && itemById(id)?.avail === 'shop'))];
}

/** The items an offer grants (ids). */
export const offerItems = (offer) => offer.grants.filter((g) => g.item).map((g) => g.item);

/**
 * Why you can't buy `offer` at `now`, or null if you can:
 * 'not-for-sale' (no such offer, or outside its dates) | 'owned' (you have an
 * item it grants) | 'bought' (you've had all you're allowed) | 'level' |
 * 'funds'. `you` = { level, inventory: [item id], counts, wallet }.
 */
export function cantBuy(offer, now, { level = 1, inventory = [], counts = {}, wallet = {} } = {}) {
  if (!offer || !isLive(offer, now)) return 'not-for-sale';
  if (offerItems(offer).some((id) => inventory.includes(id))) return 'owned';
  if (offer.limit && (counts[offer.id] ?? 0) >= offer.limit) return 'bought';
  if ((level ?? 1) < offer.level) return 'level';
  for (const [currency, amount] of Object.entries(offer.price)) if ((wallet?.[currency] ?? 0) < amount) return 'funds';
  return null;
}

/**
 * Buying `offer` (cantBuy said you can): { changes, inventory, counts }, the
 * wallet changes to make (economy/wallet.js: a spend for each currency of the
 * price, a grant for each currency it gives), and your inventory and counts
 * after it. Each change's ref carries the offer and which purchase of it this
 * is, so its ledger id is its own.
 */
export function purchase(offer, { inventory = [], counts = {} } = {}) {
  const n = (counts[offer.id] ?? 0) + 1;
  const ref = (currency) => `${offer.id}-${n}-${currency}`;
  const changes = Object.entries(offer.price).map(([currency, amount]) => ({ kind: 'spend', currency, amount, reason: 'shop', ref: ref(currency) }));
  const granted = {};
  for (const g of offer.grants) if (g.currency) granted[g.currency] = (granted[g.currency] ?? 0) + g.amount;
  for (const [currency, amount] of Object.entries(granted)) changes.push({ kind: 'grant', currency, amount, reason: 'shop', ref: ref(currency) });
  return { changes, inventory: cleanInventory([...inventory, ...offerItems(offer)]), counts: { ...counts, [offer.id]: n } };
}
