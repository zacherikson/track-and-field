/**
 * Live waiting rooms' rules, shared by the game (online/live.js) and the meet
 * server (server/src/lobbyCore.js), which runs them.
 */
export const MAX_PLAYERS = 4;
export const START_DELAY = 10000; // ms from the second player arriving to the start
export const CLOSE_BEFORE = 6000; // ms before the start the room stops taking players (and everyone goes to the event)

/** What a public waiting room can be for: the five events (registry.js EVENTS) and the tournament. */
export const LIVE_KINDS = new Set(['sprint100', 'longjump', 'hurdles110', 'polevault', 'javelin', 'tournament']);

/** A squad's Practice adds the 4×100m relay. */
export const PRACTICE_KINDS = new Set([...LIVE_KINDS, 'relay4x100']);
