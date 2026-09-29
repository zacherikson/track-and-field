import { formatMark } from '../events/registry.js';
import { counts, posted } from './bests.js';
import { submitMark, isSignedIn } from './firebase.js';

/**
 * Posts a mark to a board's online leaderboard (registry.js BOARDS), with the
 * recorded run for the 100m. Only if you're signed in: a guest's bests wait on
 * the phone (online/bests.js postBests). `onStatus` gets a one-line status to show, now
 * and again when the server answers.
 */
export function postMark(board, mark, ghost, onStatus) {
  if (!board.online || mark == null || (board.ghosts && !ghost)) return;
  if (!isSignedIn()) {
    onStatus('Sign in on your Profile to go on the online leaderboard');
    return;
  }
  if (!counts()) {
    // Only marks made with the shipped physics count online.
    onStatus('Not posted online: tuning is changed on this phone');
    return;
  }
  onStatus('Posting to the online leaderboard…');
  posted();
  submitMark(board, mark, ghost)
    .then((r) => {
      if (!r.improved) onStatus(`Online: your best ${formatMark(board, r.best)} is #${r.rank}`);
      else if (r.lost) onStatus(`Online leaderboard: #${r.rank} (ghost not uploaded: ${r.lost})`);
      else onStatus(`Online leaderboard: #${r.rank}`);
    })
    .catch((err) => {
      console.warn('mark not posted', err);
      onStatus(`Online leaderboard unavailable${err?.code ? ` (${err.code})` : ''}`);
    });
}
