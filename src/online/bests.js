import { BOARDS, TOURNAMENT_BOARDS } from '../events/registry.js';
import { getBest, setBest, getGhost, setGhost, getBestTournament, saveBestTournament } from '../core/storage.js';
import { changes } from '../tuning/store.js';
import { myEntries, fetchGhost, isSignedIn, submitMark } from './firebase.js';
import { isReplayable } from './ghost.js';
import { isTrace } from './trace.js';
import { CONFIG } from '../config.js';

/**
 * PERSONAL BESTS come from the online boards: your entry on an event's board is
 * your best at it. The phone keeps a copy (core/storage.js) so the game works
 * offline and shows it at once; syncBests() brings that copy in line with the
 * boards whenever you're back at the menu. A board that's been reset (your
 * entry gone) clears your best, your ghost and, for the tournaments, your best
 * tournament.
 *
 * Only marks made with the shipped physics can go on a board, so only those
 * count as a best at all (see counts()).
 *
 * Only signed-in players go on the boards. A guest's bests stay on the phone
 * alone (syncBests leaves them be) until they sign in, when postBests() puts
 * them up.
 */

/** True if a run made now can be a personal best: tuning is as shipped. */
export function counts() {
  return changes().length === 0;
}

// Bumped by every post, so a sync that started before it doesn't undo it.
let posts = 0;
export function posted() {
  posts++;
}

const same = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-9;
const beats = (board, a, b) => (board.lowerIsBetter ? a < b : a > b);

/**
 * Makes your saved bests match your board entries. Resolves true if anything
 * changed. Does nothing (resolves false) offline, before you've an online id,
 * or as a guest (your bests aren't on the boards).
 */
export async function syncBests() {
  if (!isSignedIn()) return false;
  const started = posts;
  const entries = await myEntries(BOARDS.map((b) => b.id)).catch(() => null);
  if (!entries || posts !== started) return false;
  let changed = false;
  for (const board of BOARDS) {
    const entry = entries.get(board.id);
    const mark = entry?.mark ?? null;
    const saved = getBest(board.id);
    if ((saved != null || mark != null) && !same(saved, mark)) {
      setBest(board.id, mark);
      changed = true;
    }
    if (board.tournament) {
      // Your best tournament (kept for its ghosts) can't be better than your board entry.
      const best = getBestTournament(board.tournament);
      if (best && (mark == null || beats(board, best.total, mark))) saveBestTournament(board.tournament, null);
      continue;
    }
    await syncGhost(board, entry);
  }
  return changed;
}

/** Your ghost for an event: the recording on your board entry, else a local one no better than it. */
async function syncGhost(board, entry) {
  const mine = getGhost(board.id);
  if (!entry) {
    if (mine) setGhost(board.id, null);
    return;
  }
  if (mine && same(mine.mark, entry.mark)) return; // already the one
  let online = null;
  if (board.ghosts) online = isReplayable(entry.ghost, { runner: CONFIG.runner, dip: CONFIG.dip }) ? entry.ghost : null;
  else if (entry.traced) online = await fetchGhost(board, entry).catch(() => null);
  if (online && (board.ghosts || isTrace(online, board.id, board.traceProps))) setGhost(board.id, online);
  else if (mine && beats(board, mine.mark, entry.mark)) setGhost(board.id, null); // better than your best: not a real one
}

/**
 * Forgets your saved bests, ghosts and best tournament: they belonged to the
 * player you were (you signed out, or signed in as someone else). The next
 * syncBests() fills them in again for the player you are now.
 */
export function forgetBests() {
  for (const board of BOARDS) {
    setBest(board.id, null);
    setGhost(board.id, null);
  }
  for (const mode of Object.keys(TOURNAMENT_BOARDS)) saveBestTournament(mode, null);
}

/**
 * Puts your saved bests on the boards (with their ghosts, where the saved
 * ghost is of that mark): what you did as a guest, now that you've signed in.
 * A board only takes a mark that beats your entry there. Resolves to how many
 * boards took one.
 */
export async function postBests() {
  if (!counts()) return 0;
  posted();
  let n = 0;
  for (const board of BOARDS) {
    const mark = getBest(board.id);
    if (!board.online || mark == null) continue;
    const saved = board.tournament ? null : getGhost(board.id);
    let ghost = saved && same(saved.mark, mark) ? saved : null;
    if (board.ghosts) {
      if (!ghost || !isReplayable(ghost, { runner: CONFIG.runner, dip: CONFIG.dip })) continue; // the 100m goes up with its run or not at all
    } else if (ghost && !isTrace(ghost, board.id, board.traceProps)) ghost = null;
    const r = await submitMark(board, mark, ghost).catch((e) => (console.warn('best not posted', board.id, e), null));
    if (r?.improved) n++;
  }
  return n;
}
