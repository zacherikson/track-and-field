// The wallet's rules (src/economy/wallet.js), shared by the game and the meet server. Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { applyChange, ledgerId, cleanWallet, emptyWallet, WalletError } from '../src/economy/wallet.js';
import { CURRENCIES, CURRENCY_NAMES, currencyName, formatAmount } from '../src/economy/currencies.js';

const change = (kind, currency, amount, ref = 'r1', reason = 'admin') => ({ kind, currency, amount, reason, ref });
const refused = (fn, code) => assert.throws(fn, (e) => e instanceof WalletError && e.code === code);

test('every currency has a name, and names come only from the table', () => {
  for (const c of CURRENCIES) assert.ok(CURRENCY_NAMES[c]?.one && CURRENCY_NAMES[c]?.many, c);
  assert.equal(formatAmount('earned', 1500), `1,500 ${CURRENCY_NAMES.earned.many}`);
  assert.equal(currencyName('premium', 1), CURRENCY_NAMES.premium.one);
});

test('a grant adds, a spend takes, and a spend never goes below zero', () => {
  let { wallet, entry } = applyChange(emptyWallet(), change('grant', 'earned', 500));
  assert.deepEqual(wallet, { earned: 500, premium: 0 });
  assert.equal(entry.amount, 500);
  ({ wallet, entry } = applyChange(wallet, change('spend', 'earned', 200, 'r2')));
  assert.equal(wallet.earned, 300);
  assert.equal(entry.amount, -200);
  assert.deepEqual(entry.after, wallet);
  refused(() => applyChange(wallet, change('spend', 'earned', 301, 'r3')), 'insufficient');
});

test('fines are refused while switched off, and stop at zero when on', () => {
  refused(() => applyChange({ earned: 50 }, change('fine', 'earned', 80)), 'fines-off');
  CONFIG.economy.fines = true;
  try {
    const { wallet, entry } = applyChange({ earned: 50 }, change('fine', 'earned', 80));
    assert.equal(wallet.earned, 0);
    assert.equal(entry.amount, -50);
  } finally {
    CONFIG.economy.fines = false;
  }
});

test('premium converts into earned, never the other way', () => {
  const { wallet, entry } = applyChange({ premium: 3 }, change('convert', 'premium', 2));
  assert.equal(wallet.premium, 1);
  assert.equal(wallet.earned, 2 * CONFIG.economy.premiumToEarned);
  assert.equal(entry.gained, 2 * CONFIG.economy.premiumToEarned);
  refused(() => applyChange({ earned: 1000 }, change('convert', 'earned', 1)), 'invalid');
});

test('bad changes are refused, and the same payout always gets the same ledger id', () => {
  refused(() => applyChange({}, change('grant', 'gold', 5)), 'invalid');
  refused(() => applyChange({}, change('grant', 'earned', 0)), 'invalid');
  refused(() => applyChange({}, change('grant', 'earned', 2.5)), 'invalid');
  refused(() => applyChange({}, change('grant', 'earned', 5, 'a/b')), 'invalid');
  refused(() => applyChange({}, change('steal', 'earned', 5)), 'invalid');
  assert.equal(ledgerId(change('grant', 'earned', 5, 'meet-42:3')), ledgerId(change('grant', 'earned', 9, 'meet-42:3')));
  assert.notEqual(ledgerId(change('grant', 'earned', 5, 'a')), ledgerId(change('grant', 'earned', 5, 'b')));
});

test('whatever is read, a wallet comes out whole and not below zero', () => {
  assert.deepEqual(cleanWallet({ earned: -4, premium: '7.9', junk: 3 }), { earned: 0, premium: 7 });
  assert.deepEqual(cleanWallet(null), { earned: 0, premium: 0 });
});
