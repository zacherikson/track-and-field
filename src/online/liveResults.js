import { resultFrom, settle } from '../survival/liveSurvival.js';
import { points } from '../events/scoring.js';

/**
 * A LIVE ROOM'S STANDINGS from its players' docs (online/live.js: each player's
 * `res/{stage}` results), worked out the same way wherever it's done. The meet
 * server works them out to pay the room (server/src/roomCore.js,
 * src/economy/payouts.js), so no phone's word decides who won.
 *
 * Pure: shared by the game and the server.
 */
export const TOURNAMENT_ORDER = ['sprint100', 'longjump', 'hurdles110', 'polevault', 'javelin']; // tournament.js ORDER
const EVENT_KINDS = new Set(TOURNAMENT_ORDER);

/** The events a room plays, in order (a tournament: all five), or null for a kind it doesn't settle (live survival). */
export function eventsOf(kind) {
  if (kind === 'tournament') return TOURNAMENT_ORDER;
  return EVENT_KINDS.has(kind) ? [kind] : null;
}

/**
 * A room's standings so far. `players` = [{ uid }], `docs` = uid -> doc,
 * `gone` = uids that won't send any more (left, or given up on).
 * Returns null for a kind it doesn't settle, else {
 *   done:    every player has every result, or is gone;
 *   events:  [{ evId, step, ranked: [{ uid, result, place }] }]  each event, best first (no mark last);
 *   overall: [{ uid, place, status: 'ok', mark?, total? }]  the room's finishers, best first: an event's
 *            players with a mark, or a tournament's players with all five events done (by points)
 * }. Tied players share a place.
 */
export function roomStandings(kind, players, docs, gone = new Set()) {
  const evs = eventsOf(kind);
  if (!evs) return null;
  const doc = (uid) => (docs instanceof Map ? docs.get(uid) : docs?.[uid]) ?? {};
  const events = evs.map((evId, step) => {
    const field = players.map((p) => ({ uid: p.uid, result: resultFrom(doc(p.uid).res, step, evId) }));
    return { evId, step, field, ranked: settle(evId, field).ranked };
  });
  const complete = (uid) => events.every((e) => e.field.find((f) => f.uid === uid).result);
  const done = players.every((p) => gone.has(p.uid) || complete(p.uid));
  let overall;
  if (kind === 'tournament') {
    const totals = players
      .filter((p) => complete(p.uid))
      .map((p) => ({ uid: p.uid, status: 'ok', total: events.reduce((s, e) => { const r = e.field.find((f) => f.uid === p.uid).result; return s + points(e.evId, r.mark, r.status); }, 0) }))
      .sort((a, b) => b.total - a.total);
    totals.forEach((t, i) => (t.place = i && t.total === totals[i - 1].total ? totals[i - 1].place : i + 1));
    overall = totals;
  } else {
    overall = events[0].ranked.filter((f) => f.result.status === 'ok').map((f) => ({ uid: f.uid, place: f.place, status: 'ok', mark: f.result.mark }));
  }
  return { done, events: events.map(({ evId, step, ranked }) => ({ evId, step, ranked })), overall };
}
