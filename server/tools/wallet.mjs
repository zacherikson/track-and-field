// Looks at or changes a player's wallet from your computer, through the same
// admin access the server uses (src/firestoreAdmin.js): for testing, and for
// putting things right by hand. Every change it makes is in the ledger, as 'admin'.
//
//   FIREBASE_SERVICE_ACCOUNT_FILE=~/keys/track-royale.json node tools/wallet.mjs show <uid>
//   FIREBASE_SERVICE_ACCOUNT_FILE=... node tools/wallet.mjs grant <uid> <earned|premium> <amount> [ref]
//
// <uid> is the player's id: Firebase console > Authentication > Users. Keep the
// key file out of the repo.
import { readFileSync } from 'node:fs';
import { readWallet, changeWallet } from '../src/firestoreAdmin.js';
import { formatAmount, CURRENCIES } from '../../src/economy/currencies.js';

const [cmd, uid, currency, amount, ref] = process.argv.slice(2);
const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
if (!file || !cmd || !uid) {
  console.log('usage: FIREBASE_SERVICE_ACCOUNT_FILE=<key.json> node tools/wallet.mjs show <uid>');
  console.log('       FIREBASE_SERVICE_ACCOUNT_FILE=<key.json> node tools/wallet.mjs grant <uid> <earned|premium> <amount> [ref]');
  process.exit(1);
}
const key = readFileSync(file, 'utf8');
const env = { FIREBASE_SERVICE_ACCOUNT: key, FIREBASE_PROJECT: JSON.parse(key).project_id };
const show = (w) => CURRENCIES.map((c) => formatAmount(c, w[c])).join(' · ');

if (cmd === 'show') {
  console.log(show(await readWallet(env, uid)));
} else if (cmd === 'grant') {
  const r = await changeWallet(env, uid, { kind: 'grant', currency, amount: Number(amount), reason: 'admin', ref: ref ?? `cli-${Date.now()}` });
  console.log(r.duplicate ? `Already granted (same ref): ${show(r.wallet)}` : `Granted. Now: ${show(r.wallet)}`);
} else {
  console.log(`unknown command ${cmd}`);
  process.exit(1);
}
