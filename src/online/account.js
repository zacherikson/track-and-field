import { postBests, forgetBests } from './bests.js';
import { syncProgress } from './progress.js';
import { startGoogleSignIn } from './firebase.js';

/**
 * Signing in with Google, the parts every screen that offers it shares (the
 * Profile screen, the first-launch setup, the Athlete tab's nudge).
 */

/**
 * Goes off to Google's sign-in page. `onBack()` runs if the player comes back
 * from it without signing in (the browser kept this page as it was). Throws
 * if the page couldn't be opened.
 */
export function goSignIn(onBack) {
  addEventListener('pageshow', (e) => e.persisted && onBack?.(), { once: true });
  startGoogleSignIn();
}

/**
 * Finishes a sign-in that's just come back from Google (finishGoogleSignIn's
 * promise): what you did as a guest goes on the leaderboards, and your
 * progress and athlete go up to your account. `say(text)` reports how it's
 * going. Resolves to { reloading: true } when that Google account already had
 * a player: this phone becomes them, and the page reloads as them. Otherwise
 * { posted }: true if any of your bests went on the boards.
 */
export async function completeSignIn(signingIn, say = () => {}) {
  const { switched } = await signingIn;
  say('Signed in. Putting your bests on the leaderboard…');
  const posted = await postBests();
  if (switched) {
    // That Google account already had a player: this phone is them now.
    // (This phone's campaign progress and athlete are merged into theirs as the menu loads.)
    forgetBests();
    say('Loading your player…');
    location.reload();
    return { reloading: true };
  }
  await syncProgress().catch((e) => console.warn('progress not synced', e));
  return { posted };
}

/** What to say when signing in didn't work. */
export function signInError(e) {
  switch (e?.code ?? e?.message) {
    case 'auth/user-cancelled':
      return 'Sign-in cancelled.';
    case 'auth/state-mismatch':
      return 'Sign-in didn’t finish. Try again.';
    case 'auth/operation-not-allowed':
      return 'Google sign-in isn’t switched on for this game yet.';
    case 'auth/network-request-failed':
      return 'Couldn’t reach the server. Check your connection and try again.';
    default:
      return `Couldn’t sign in${e?.code ? ` (${e.code})` : ''}.`;
  }
}

/** What to say when a username wasn't claimed (setUsername failed). */
export function usernameError(e, name) {
  if (e?.message === 'taken') return `“${name}” is taken. Try another name.`;
  if (e?.code === 'permission-denied') return 'The server didn’t accept that name. Try another.';
  return 'Couldn’t reach the server. Your name wasn’t changed.';
}
