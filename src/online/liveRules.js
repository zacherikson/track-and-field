/**
 * Live waiting rooms' rules, shared by the game (online/live.js) and the meet
 * server (server/src/lobbyCore.js), which runs them.
 */
export const MAX_PLAYERS = 4;
export const CLOSE_BEFORE = 6000; // ms before the start the room stops taking players (and everyone goes to the event)
export const OPEN_FOR = 30000; // ms the waiting room stays open after the second player arrives, unless everyone taps I'm ready
export const START_DELAY = OPEN_FOR + CLOSE_BEFORE; // ms from the second player arriving to the start

/** Live survival (survival/liveSurvival.js): up to ten, last one standing. Its room stays open a minute. */
export const SURVIVAL_KIND = 'survival';
const BIG = { [SURVIVAL_KIND]: { players: 10, openFor: 60000 } };

/** How many can play a kind together. */
export const maxPlayers = (kind) => BIG[kind]?.players ?? MAX_PLAYERS;

/** ms from a kind's second player arriving to its start (a full room, or everyone ready, starts sooner). */
export const startDelay = (kind) => (BIG[kind]?.openFor ?? OPEN_FOR) + CLOSE_BEFORE;

/** What a public waiting room can be for: the five events (registry.js EVENTS), the tournament and live survival. */
export const LIVE_KINDS = new Set(['sprint100', 'longjump', 'hurdles110', 'polevault', 'javelin', 'tournament', SURVIVAL_KIND]);

/** A squad's Practice adds the 4×100m relay. */
export const PRACTICE_KINDS = new Set([...LIVE_KINDS, 'relay4x100']);
