import { Sprint100 } from './sprint100.js';
import { Hurdles110 } from './hurdles110.js';
import { LongJump } from './longJump.js';
import { PoleVault } from './poleVault.js';
import { Javelin } from './javelin.js';
import { Relay4x100 } from './relay4x100.js';
import { PracticeRelay } from './practiceRelay.js';
import { MeetRelay } from './meetRelay.js';
import { meet } from '../meet/meet.js';
import { TimeTrial } from './timeTrial.js';

// The list of events shown on the menu, in tournament order. Each available
// event provides `create()` returning its play scene.
export const EVENTS = [
  {
    id: 'sprint100',
    name: '100m Dash',
    record: 8.9,
    unit: 's',
    lowerIsBetter: true,
    available: true,
    online: true, // posts marks to the online leaderboard
    ghosts: true, // each entry carries its recorded run, which others can race as a ghost (online/ghost.js)
    create() {
      return new Sprint100(this);
    },
  },
  {
    id: 'longjump',
    name: 'Long Jump',
    record: 9.86,
    unit: 'm',
    lowerIsBetter: false,
    available: true,
    online: true, // posts marks to the online leaderboard
    traceProps: 0, // its ghost is recorded frame by frame (online/trace.js), keeping the body only
    againLabel: 'Jump again',
    create() {
      return new LongJump(this);
    },
  },
  {
    id: 'hurdles110',
    name: '110m Hurdles',
    record: 11.58,
    unit: 's',
    lowerIsBetter: true,
    available: true,
    online: true, // posts marks to the online leaderboard
    traceProps: 1, // its ghost is recorded frame by frame (online/trace.js), keeping the hurdles knocked down
    create() {
      return new Hurdles110(this);
    },
  },
  {
    id: 'polevault',
    name: 'Pole Vault',
    record: 6.95,
    unit: 'm',
    lowerIsBetter: false,
    available: true,
    online: true, // posts marks to the online leaderboard
    traceProps: 9, // its ghost is recorded frame by frame (online/trace.js), keeping the pole
    againLabel: 'Vault again',
    create() {
      return new PoleVault(this);
    },
  },
  {
    id: 'javelin',
    name: 'Javelin',
    record: 104.8,
    unit: 'm',
    lowerIsBetter: false,
    available: true,
    online: true, // posts marks to the online leaderboard
    traceProps: 3, // its ghost is recorded frame by frame (online/trace.js), keeping the javelin
    againLabel: 'Throw again',
    create() {
      return new Javelin(this);
    },
  },
];

// Special events: on their own list (home screen, Special Events), never in a
// tournament, and not on the online leaderboards (yet). Always against rivals,
// at Special Events' RIVALS level (`special`: results say that level, not Training).
export const SPECIAL_EVENTS = [
  {
    id: 'relay4x100',
    name: '4×100m Relay',
    special: true,
    record: 33.8, // what the 100m record's pace runs with three perfect exchanges (tools/simulate.mjs)
    unit: 's',
    lowerIsBetter: true,
    available: true,
    // `live` (online/live.js): a squad's practice is the squad as one team, against a computer one.
    create(live = null) {
      return meet.active ? new MeetRelay(this) : live?.squad ? new PracticeRelay(this) : new Relay4x100(this); // a squad meet's: a leg each
    },
  },
  {
    id: 'timetrial',
    name: 'Time Trial',
    special: true,
    record: 49.9, // the 100m record's pace (4.15 taps/s) with every shift, the tuck and the throw right (tools/simulate.mjs)
    unit: 's',
    lowerIsBetter: true,
    available: true,
    againLabel: 'Ride again',
    create() {
      return new TimeTrial(this);
    },
  },
];

// The tournament's online leaderboard (total decathlon points). Not playable
// on its own, so it isn't in EVENTS. (The Team Tournament's board,
// 'teamtournament', is retired: still in the database, no longer shown.)
export const TOURNAMENT_BOARD = { id: 'tournament', name: 'Tournament', unit: 'pts', lowerIsBetter: false, online: true, tournament: true };

/** Any playable event (the five, or a special one) by id. */
export function eventById(id) {
  return EVENTS.find((e) => e.id === id) ?? SPECIAL_EVENTS.find((e) => e.id === id);
}

/** Every online leaderboard, in menu order. */
export const BOARDS = [...EVENTS, TOURNAMENT_BOARD];

/**
 * A mark as it's kept and compared everywhere (results, personal bests, the
 * online boards): to the hundredth of a second or centimetre, as it's shown,
 * or whole points. Two marks that look the same are the same.
 */
export function roundMark(ev, value) {
  if (value == null || !Number.isFinite(value)) return value;
  return ev.unit === 'pts' ? Math.round(value) : Math.round(value * 100) / 100;
}

export function formatMark(ev, value) {
  if (value == null) return '—';
  if (ev.unit === 'pts') return `${Math.round(value)} pts`;
  return ev.unit === 's' ? `${value.toFixed(2)}s` : `${value.toFixed(2)}m`;
}
