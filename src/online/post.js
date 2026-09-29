import { formatMark } from '../events/registry.js';
import { changes } from '../tuning/store.js';
import { submitMark } from './firebase.js';

/**
 * Posts a mark to a board's online leaderboard (registry.js BOARDS), with the
 * recorded run for the 100m. `onStatus` gets a one-line status to show, now
 * and again when the server answers.
 */
export function postMark(board, mark, ghost, onStatus) {
  if (!board.online || mark == null || (board.ghosts && !ghost)) return;
  if (changes().length) {
    // Only marks made with the shipped physics count online.
    onStatus('Not posted online: tuning is changed on this phone');
    return;
  }
  onStatus('Posting to the online leaderboard…');
  submitMark(board, mark, ghost)
    .then((r) => onStatus(r.improved ? `Online leaderboard: #${r.rank}` : `Online: your best ${formatMark(board, r.best)} is #${r.rank}`))
    .catch(() => onStatus('Online leaderboard unavailable'));
}
