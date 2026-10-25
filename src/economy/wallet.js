import { CONFIG } from '../config.js';
import { CURRENCIES } from './currencies.js';

/**
 * A WALLET's rules: pure, shared by the meet server (which alone writes
 * wallets: server/src/firestoreAdmin.js) and the game (which only shows them:
 * online/wallet.js).
 *
 * A wallet is { earned, premium, xp }: whole amounts, never below zero (`xp`
 * isn't money: it's your XP, src/economy/levels.js, kept here so it has the
 * same protection; with `xpDay`/`xpToday` for its daily cap). It only
 * ever changes through applyChange, and every change is written with a
 * ledger entry whose id (ledgerId) comes from what the change was for, so the
 * same payout can never land twice.
 *
 * A change is { kind, currency, amount, reason, ref }:
 *   grant    add `amount` (prize money, contract pay, a medal's payout)
 *   spend    take `amount`; refused if there isn't that much (the shop)
 *   fine     take `amount`, stopping at zero; refused while fines are off
 *            (CONFIG.economy.fines)
 *   convert  turn `amount` premium into earned, at CONFIG.economy.premiumToEarned each
 * `reason` says what kind of thing it was for ('live-prize', 'contract',
 * 'admin', ...) and `ref` which one (a race, a day, ...).
 * XP only takes grants, each carrying `day` (levels.js xpDay): a grant past
 * that day's cap (CONFIG.economy.xp.dailyCap) is cut down to what's left.
 */
export const WALLET_VERSION = 1;
export const BALANCES = [...CURRENCIES, 'xp']; // what a wallet holds: the currencies, and your XP
const FIELDS = [...BALANCES, 'xpDay', 'xpToday']; // all of it as stored
export const KINDS = ['grant', 'spend', 'fine', 'convert'];

const REASON = /^[a-z0-9-]{1,32}$/;
const REF = /^[A-Za-z0-9_:-]{1,120}$/;
const MAX = 1e12; // no wallet gets near this; it keeps the sums exact

/** A refused change: `code` says why ('invalid', 'insufficient', 'fines-off'). */
export class WalletError extends Error {
  constructor(code, detail = code) {
    super(detail);
    this.code = code;
  }
}

export function emptyWallet() {
  return Object.fromEntries(FIELDS.map((c) => [c, 0]));
}

/** A wallet as stored, whatever was read: every field a whole number from 0 up. */
export function cleanWallet(w) {
  const out = emptyWallet();
  for (const c of FIELDS) {
    const v = Number(w?.[c]);
    out[c] = Number.isFinite(v) && v > 0 ? Math.min(MAX, Math.floor(v)) : 0;
  }
  return out;
}

/** Throws WalletError('invalid') unless `change` is well formed. */
export function checkChange(change) {
  const { kind, currency, amount, reason, ref } = change ?? {};
  if (!KINDS.includes(kind)) throw new WalletError('invalid', `kind ${kind}`);
  if (!BALANCES.includes(currency)) throw new WalletError('invalid', `currency ${currency}`);
  if (kind === 'convert' && currency !== 'premium') throw new WalletError('invalid', 'only premium converts');
  if (currency === 'xp' && (kind !== 'grant' || !Number.isInteger(change.day) || change.day < 0)) throw new WalletError('invalid', 'xp: a grant with its day');
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX) throw new WalletError('invalid', `amount ${amount}`);
  if (typeof reason !== 'string' || !REASON.test(reason)) throw new WalletError('invalid', `reason ${reason}`);
  if (typeof ref !== 'string' || !REF.test(ref)) throw new WalletError('invalid', `ref ${ref}`);
}

/** The ledger entry's id for a change: the same payout always gets the same id. */
export function ledgerId(change) {
  checkChange(change);
  return `${change.kind}-${change.reason}-${change.ref}`;
}

/**
 * Applies `change` to `wallet`: { wallet, entry }, the wallet after it and its
 * ledger entry { kind, currency, amount, reason, ref, after } (`amount` = what
 * actually moved, minus for money taken; a convert's entry also has `gained`).
 * Throws WalletError if it can't be done. Doesn't touch `wallet`.
 */
export function applyChange(wallet, change) {
  checkChange(change);
  const w = cleanWallet(wallet);
  const { kind, currency, amount, reason, ref } = change;
  const E = CONFIG.economy;
  let moved = amount;
  let gained;
  if (kind === 'grant' && currency === 'xp') {
    // Up to the day's cap: a new day starts the count again.
    const today = w.xpDay === change.day ? w.xpToday : 0;
    moved = Math.max(0, Math.min(amount, E.xp.dailyCap - today));
    w.xp = Math.min(MAX, w.xp + moved);
    w.xpDay = change.day;
    w.xpToday = today + moved;
  } else if (kind === 'grant') {
    w[currency] = Math.min(MAX, w[currency] + amount);
  } else if (kind === 'spend') {
    if (w[currency] < amount) throw new WalletError('insufficient', `${currency} ${w[currency]} < ${amount}`);
    w[currency] -= amount;
    moved = -amount;
  } else if (kind === 'fine') {
    if (!E.fines) throw new WalletError('fines-off');
    moved = -Math.min(amount, w[currency]); // a fine stops at zero
    w[currency] += moved;
  } else {
    if (w.premium < amount) throw new WalletError('insufficient', `premium ${w.premium} < ${amount}`);
    w.premium -= amount;
    gained = amount * E.premiumToEarned;
    w.earned = Math.min(MAX, w.earned + gained);
    moved = -amount;
  }
  const entry = { kind, currency, amount: moved, reason, ref, after: { ...w } };
  if (gained != null) entry.gained = gained;
  return { wallet: w, entry };
}
