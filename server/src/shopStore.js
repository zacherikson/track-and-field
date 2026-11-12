import { readShop, writeShop } from './firestoreAdmin.js';
import { liveOffers } from '../../src/economy/shop.js';
import { topUp } from './shopPlan.js';

/**
 * THE SHOP AS THE SERVER READS IT: shop/current in the database
 * (firestoreAdmin.js), kept in memory for a short while so a busy shop is one
 * read a minute, and planned on whenever its plan is running out (shopPlan.js
 * topUp: no scheduled jobs).
 *
 * A change made by hand (tools/shop.mjs, the Firebase console) shows within
 * KEEP ms. Two servers topping up at once write the same plan.
 */
const KEEP = 60000;
let kept = null; // { shop, at, project }

/** Forgets the copy in memory (tests; after writing the shop). */
export function forgetShop() {
  kept = null;
}

/**
 * Every offer in the shop, planned up to `now`.
 * `deps` (tests): { read, write } in place of the database.
 */
export async function allOffers(env, now, deps = {}) {
  if (kept && kept.project === env.FIREBASE_PROJECT && now - kept.at < KEEP && now >= kept.at) return kept.shop.offers;
  const stored = await (deps.read ?? readShop)(env);
  const shop = topUp(stored, now);
  if (shop.changed) await (deps.write ?? writeShop)(env, shop);
  kept = { shop, at: now, project: env.FIREBASE_PROJECT };
  return shop.offers;
}

/** What's on sale at `now`. */
export async function shopNow(env, now, deps = {}) {
  return liveOffers(await allOffers(env, now, deps), now);
}
