import { applyBalance } from '../economy/balance.js';
import { serverHttp } from './net.js';

/**
 * THE ECONOMY'S NUMBERS, AS THE SERVER HAS THEM (src/economy/balance.js: the
 * meet server owns them). The game only shows them: the XP a race should be
 * worth, a contract's pay and standards. So it asks the server (GET
 * /api/balance, no sign-in) and lays the answer over the copy in its build;
 * the last answer is kept on the phone and laid over as the game loads, so
 * what's shown is right at once and offline. The server never takes a number
 * from a phone: showing a stale one changes nothing that's paid.
 */
const KEY = 'trackroyale.balance';
const EVERY = 10 * 60000; // ms between asks

// As the game loads: the last copy the server sent.
try {
  applyBalance(JSON.parse(localStorage.getItem(KEY)));
} catch {}

let asked = -Infinity;
let asking = null;

/** Asks the server for its numbers (at most every ten minutes) and takes them. Resolves true if it did; never rejects. */
export function syncBalance() {
  if (asking) return asking;
  if (performance.now() - asked < EVERY) return Promise.resolve(false);
  asked = performance.now();
  asking = fetch(`${serverHttp()}/api/balance`)
    .then((res) => (res.ok ? res.json() : null))
    .then((sent) => {
      if (!applyBalance(sent)) return false;
      try {
        localStorage.setItem(KEY, JSON.stringify(sent));
      } catch {}
      return true;
    })
    .catch(() => {
      asked = -Infinity; // offline: ask again next time
      return false;
    })
    .finally(() => {
      asking = null;
    });
  return asking;
}
