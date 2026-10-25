import { isSignedIn, knownUid } from './firebase.js';
import { serverHttp, token } from './net.js';
import { rememberWallet } from './wallet.js';
import { shopDay, shopFor } from '../economy/shop.js';

/**
 * THE SHOP, as the game sees it (the rules: src/economy/shop.js; the server
 * sells: server/src/api.js /api/shop). Today's shop is the same for everyone
 * and worked out from the date, so it shows offline too; buying, and the gear
 * you own, go through the server (signed in with Google only). The phone keeps
 * what you own as it was last told, for the Athlete Maker.
 */
const KEY = 'trackroyale.inventory';

/** Today's shop (economy/shop.js shopFor). */
export function todaysShop(now = Date.now()) {
  return shopFor(shopDay(now));
}

/** The gear you own as last told by the server ([item id]); [] as a guest or before it's been asked. */
export function myInventory() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return saved && saved.uid === knownUid() && Array.isArray(saved.items) ? saved.items : [];
  } catch {
    return [];
  }
}

/** Forgets it (you signed out). */
export function forgetInventory() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

/** Asks the server for your gear (and the shop). Resolves to { shop, inventory, wallet }, or null as a guest. */
export function openShop() {
  if (!isSignedIn()) return Promise.resolve(null);
  return call({ action: 'open' });
}

/** Buys item `id`. Resolves to the server's answer; rejects with Error('funds' | 'level' | 'owned' | 'not-for-sale' | ...). */
export function buyItem(id) {
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
  if (uid !== knownUid()) return null;
  try {
    localStorage.setItem(KEY, JSON.stringify({ uid, items: answer.inventory ?? [] }));
  } catch {}
  rememberWallet(answer.wallet ?? {});
  return answer;
}
