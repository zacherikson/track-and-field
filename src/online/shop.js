import { knownUid } from './firebase.js';
import { serverHttp, token } from './net.js';
import { rememberWallet } from './wallet.js';
import { cleanOffers, liveOffers, cleanCounts, cleanInventory } from '../economy/shop.js';

/**
 * THE SHOP, as the game sees it (the rules: src/economy/shop.js). The meet
 * server says what's on sale (server/src/api.js /api/shop: offers it reads
 * from the database) and does the selling; the game draws what it's sent and
 * knows nothing else about prices or dates. Guests buy too: what they own is
 * kept under this phone's id, and stays theirs when they sign in with Google.
 *
 * The phone keeps the last offers it was sent (so the Shop tab shows at once,
 * and offline what was on sale then and still is), and what you own and have
 * bought as last told, for the Athlete Maker.
 */
const SHOP = 'trackroyale.shop'; // { offers, skew }: the same for everyone
const MINE = 'trackroyale.inventory'; // { uid, items, counts }

const load = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? null;
  } catch {
    return null;
  }
};
const store = (key, v) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
};

/** The time by the server's clock (as of the last answer): what offers' dates are read against. */
export function shopTime() {
  return Date.now() + (Number(load(SHOP)?.skew) || 0);
}

/** The offers on sale now, from the last the server sent ([] if it never has). */
export function shopOffers() {
  return liveOffers(cleanOffers(load(SHOP)?.offers), shopTime());
}

const mine = () => {
  const saved = load(MINE);
  return saved && saved.uid === knownUid() ? saved : null;
};

/** The gear you own as last told by the server ([item id]); [] before it's been asked. */
export function myInventory() {
  return cleanInventory(mine()?.items);
}

/** How many times you've bought each offer, as last told ({ [offer id]: n }). */
export function myCounts() {
  return cleanCounts(mine()?.counts);
}

/** Forgets what you own (you signed out). */
export function forgetInventory() {
  try {
    localStorage.removeItem(MINE);
  } catch {}
}

/** Asks the server for the shop (and, signed in, your gear and wallet). Resolves to { offers, inventory, counts, wallet }; rejects offline. */
export function openShop() {
  return call({ action: 'open' });
}

/** Buys offer `id`. Resolves to the server's answer; rejects with Error('funds' | 'level' | 'owned' | 'bought' | 'not-for-sale' | ...). */
export function buyOffer(id) {
  return call({ action: 'buy', id });
}

async function call(body) {
  const uid = knownUid();
  const res = await fetch(`${serverHttp()}/api/shop`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const answer = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(answer.error ?? `shop ${res.status}`);
  store(SHOP, { offers: answer.offers ?? [], skew: Number.isFinite(answer.now) ? answer.now - Date.now() : 0 });
  if (uid !== knownUid()) return null; // signed in as someone else meanwhile
  if (answer.wallet) {
    store(MINE, { uid, items: answer.inventory ?? [], counts: answer.counts ?? {} });
    rememberWallet(answer.wallet);
  }
  return answer;
}
