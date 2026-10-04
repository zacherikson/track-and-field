/**
 * SQUAD MEETS: the rules both the game and the meet server (server/) go by.
 * Pure data, no browser or server APIs, so both can import it.
 *
 * A meet is 2 to 6 squads of 4 through the five events in order, then the
 * 4x100m relay (docs/meets.md). Every event is run as heats (or flights), one
 * athlete from each squad in each, all at the same moment; places are ranked
 * across all of them and score for the squad.
 */
export const SQUAD_SIZE = 4; // athletes a squad brings to a meet: the first four to sign up
export const MIN_SQUADS = 2;
export const MAX_SQUADS = 6; // one a lane

/** Points for 1st to 8th, in every event and the relay; 9th and below score nothing. */
export const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];

/** The meet's events, in order. */
export const MEET_ORDER = ['sprint100', 'longjump', 'hurdles110', 'polevault', 'javelin', 'relay4x100'];

/** Events where lower marks win (times). */
export const LOWER_IS_BETTER = new Set(['sprint100', 'hurdles110', 'relay4x100']);

/** Events with rounds (three attempts, best counts): each round is a stage of its own. */
export const FIELD_EVENTS = new Set(['longjump', 'polevault', 'javelin']);
export const FIELD_ROUNDS = 3;

/** Each squad's colour in a meet, by lane (lane 1 first). */
export const SQUAD_COLORS = ['#ffb400', '#2f80ff', '#59cd90', '#ee6352', '#b388eb', '#ff8c42'];

/** Short event names, for the server's messages and logs (the game has its own in registry.js). */
export const EVENT_NAMES = {
  sprint100: '100m',
  longjump: 'Long Jump',
  hurdles110: '110m Hurdles',
  polevault: 'Pole Vault',
  javelin: 'Javelin',
  relay4x100: '4×100m Relay',
};

/** The stage keys of event `i` of a meet (online/live.js: `${step}-${event}` and a round for a field event). */
export function eventStages(i, evId = MEET_ORDER[i]) {
  if (!FIELD_EVENTS.has(evId)) return [`${i}-${evId}`];
  return Array.from({ length: FIELD_ROUNDS }, (_, r) => `${i}-${evId}-${r + 1}`);
}

/** Every stage of a meet, in order: [{ key, event, index, round }] (round 0 for a race). */
export function meetStages() {
  return MEET_ORDER.flatMap((evId, i) => eventStages(i, evId).map((key, r) => ({ key, event: evId, index: i, round: FIELD_EVENTS.has(evId) ? r + 1 : 0 })));
}
