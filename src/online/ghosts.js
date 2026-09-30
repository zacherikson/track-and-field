import { getGhost, getGhostOn, getBestTournament } from '../core/storage.js';
import { tournament } from '../tournament/tournament.js';
import { chosenGhost } from './ghost.js';

/**
 * Which recording races as a ghost in event `ev`, as { name, data, overlay }, or null:
 * - in a tournament, with GHOST on: your best tournament's attempt at this
 *   event. It shares your lane (`overlay`) so the same five rivals stay in;
 * - otherwise one picked with Race on the online leaderboard;
 * - otherwise, with GHOST on: your own best.
 * `valid(data)` says whether the event can play a recording (it may be null,
 * old, or from the network).
 */
export function pickGhost(ev, valid) {
  if (tournament.active) {
    const g = getGhostOn() ? getBestTournament(tournament.mode)?.events?.[ev.id]?.ghost : null;
    return valid(g) ? { name: 'Best tournament', data: g, overlay: true } : null;
  }
  const picked = chosenGhost();
  if (picked?.ev === ev.id && valid(picked.data)) return picked;
  if (!getGhostOn()) return null;
  const mine = getGhost(ev.id);
  return valid(mine) ? { name: 'Your best', data: mine } : null;
}
