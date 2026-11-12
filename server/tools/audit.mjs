// Lists what the server has turned down lately (the audit trail: src/audit.js), newest
// first, from your computer, through the same admin access the server uses.
//
//   FIREBASE_SERVICE_ACCOUNT_FILE=~/keys/track-royale.json node tools/audit.mjs [how many, default 50]
//
// Each line: when, the player's id (Firebase console > Authentication > Users), what
// it was ('mark': a mark for the online boards; 'live-result': a result in a public
// live room), why it was refused, and the details. Keep the key file out of the repo.
import { readFileSync } from 'node:fs';
import { recentDocs } from '../src/firestoreAdmin.js';

const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
if (!file) {
  console.log('usage: FIREBASE_SERVICE_ACCOUNT_FILE=<key.json> node tools/audit.mjs [how many]');
  process.exit(1);
}
const key = readFileSync(file, 'utf8');
const env = { FIREBASE_SERVICE_ACCOUNT: key, FIREBASE_PROJECT: JSON.parse(key).project_id };
const notes = await recentDocs(env, 'audit', Math.min(300, Number(process.argv[2]) || 50));
if (!notes.length) console.log('Nothing turned down yet.');
for (const n of notes) console.log(`${String(n.at ?? '').slice(0, 19).replace('T', ' ')}  ${String(n.uid).padEnd(28)}  ${String(n.kind).padEnd(11)}  ${String(n.why).padEnd(11)}  ${n.detail ?? ''}`);
