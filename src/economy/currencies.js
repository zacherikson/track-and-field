/**
 * THE CURRENCIES, by internal id (docs: the Economy & Progression design doc).
 *
 * - `earned`: what you earn by playing (contract pay, live prize money).
 * - `premium`: what live medals pay, and one day what real money buys. It
 *   converts into `earned`, never the other way.
 *
 * Their names aren't final. What players see comes only from CURRENCY_NAMES
 * below: saved data, the database and the server only ever hold the ids, so a
 * rename is a change here and nowhere else.
 */
export const CURRENCIES = ['earned', 'premium'];

export const CURRENCY_NAMES = {
  earned: { one: 'Coin', many: 'Coins' }, // placeholder name
  premium: { one: 'Gem', many: 'Gems' }, // placeholder name
};

/** A currency's name for `n` of it: "Coin" for 1, "Coins" otherwise. */
export function currencyName(id, n = 2) {
  const c = CURRENCY_NAMES[id];
  if (!c) return id;
  return n === 1 ? c.one : c.many;
}

/** "1,500 Coins". */
export function formatAmount(id, n) {
  const v = Math.round(n ?? 0);
  return `${v.toLocaleString('en-US')} ${currencyName(id, v)}`;
}
