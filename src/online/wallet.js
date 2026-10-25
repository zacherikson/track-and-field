import { connectSDK, isSignedIn, knownUid } from './firebase.js';
import { cleanWallet } from '../economy/wallet.js';
import { rememberXp } from './xp.js';

/**
 * YOUR WALLET, as the game sees it: read-only. Only the meet server changes a
 * wallet (server/src/firestoreAdmin.js); the database lets you read your own
 * (firestore.rules wallets/{uid}), signed in with Google. Guests have none.
 *
 * The phone keeps the last balance it read, so it shows at once and offline
 * (never as something to spend: spending goes through the server).
 */
const KEY = 'trackroyale.wallet';

/** The last balance read on this phone for the player you are now ({ earned, premium }), or null. */
export function cachedWallet() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return saved && saved.uid === knownUid() ? cleanWallet(saved.wallet) : null;
  } catch {
    return null;
  }
}

function remember(wallet) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ uid: knownUid(), wallet }));
  } catch {}
}

/** Keeps balances the server just sent (with a contract's pay: online/contracts.js) as your wallet. */
export function rememberWallet(balances) {
  const wallet = cleanWallet({ ...cachedWallet(), ...balances });
  remember(wallet);
  if (balances.xp != null) rememberXp(wallet.xp);
  return wallet;
}

/** Reads your wallet from your account: resolves to it, or null as a guest. Rejects offline. */
export async function refreshWallet() {
  if (!isSignedIn()) return null;
  const { fs, db, uid } = await connectSDK();
  const snap = await fs.getDoc(fs.doc(db, 'wallets', uid));
  const wallet = cleanWallet(snap.exists() ? snap.data() : null); // none yet: all zero
  remember(wallet);
  rememberXp(wallet.xp); // your XP is kept with your wallet
  return wallet;
}

/** Forgets the saved balance (you signed out). */
export function forgetWallet() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
