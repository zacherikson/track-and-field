import { Sprint100 } from './sprint100.js';
import { Hurdles110 } from './hurdles110.js';
import { LongJump } from './longJump.js';
import { PoleVault } from './poleVault.js';
import { Javelin } from './javelin.js';
import { Relay4x100 } from './relay4x100.js';
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
    howTo: [
      'At GO the first green target appears.',
      'Tap the side the green target is on. It jumps around at random!',
      'Tap the wrong side and you stumble.',
      'Near the line the pads turn ORANGE: press BOTH together to lean.',
      'Lean too early and you slow down before the line.',
      'Desktop: ← → to run, Space to lean.',
    ],
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
    howTo: [
      'Three jumps; your best counts. Tap the green targets to run up.',
      'Near the board the pads turn ORANGE and blink: press BOTH to jump.',
      'Measured from the end of the board: jump late, but step over and it’s a foul.',
      'At the top of the jump press BOTH again to stretch and throw yourself forward. Miss it and you crumple.',
      'Desktop: ← → to run, Space to jump and stretch.',
    ],
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
    howTo: [
      'Three numbered buttons appear in a random order: tap 1, 2, 3.',
      'Every hurdle you jump brings a new set. Clear it fast to run fast.',
      'Any mistake (a wrong number, or not finishing in time) and you trip over the next hurdle.',
      'After the last hurdle the pads turn ORANGE: press BOTH together to lean.',
      'Desktop: number keys 1 2 3 (or ← ↓ → for the slots), Space to lean.',
    ],
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
    howTo: [
      'Three vaults; your best height counts. Tap the green targets to run up.',
      'Near the box the pads turn ORANGE and a spark runs down your pole.',
      'When it reaches the tip the pole plants: press and HOLD both.',
      'The spark climbs back up the pole: let go as it reaches your hands.',
      'Desktop: ← → to run, hold Space to plant, let go to push off.',
    ],
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
    howTo: [
      'Three throws; your best counts. Tap the green targets to run up.',
      'Near the line the pads turn ORANGE: press and HOLD both.',
      'The javelin is drawn back and its tip rises. Let go to throw.',
      'Best angle is about 36°. Let go close to the line, but not past it: FOUL.',
      'Desktop: ← → to run, hold Space and let go to throw.',
    ],
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
    howTo: [
      'Four legs of 100m, and you run them all. Tap the green targets.',
      'Your teammate sets off as you get close. In the BLUE zone, tap PASS.',
      'Then tap TAKE as they come into reach: when the ring meets the button.',
      'Too soon and they grab air. Too late and you run up their back.',
      'No pass by the end of the zone and you both stop to swap. Costly!',
      'Desktop: ← → to run, Space for PASS, TAKE and the anchor’s lean.',
    ],
    // In a squad meet each of the four runs a leg on their own phone.
    meetHowTo: [
      'Your squad’s four each run one leg. Tap the green targets on yours.',
      'Waiting for the baton: TAKE it when the ring around the blue button meets it.',
      'Bringing it in: in the BLUE zone, tap PASS, then your teammate takes it.',
      'Anyone whose phone drops is run by the computer. Keep going!',
      'Desktop: ← → to run, Space for PASS, TAKE and the anchor’s lean.',
    ],
    create() {
      return meet.active ? new MeetRelay(this) : new Relay4x100(this); // a squad meet's: a leg each
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
    howTo: [
      'Pedal with the two big pads, LEFT, RIGHT, LEFT…: the green one is next.',
      'Shift with the blue buttons: − easier for the climb, + harder for the flat.',
      'Keep the PEDALS needle in the green. Too slow? Shift down. Spinning? Shift up.',
      'Downhill, HOLD both pads to tuck. In the last stretch, press both to throw the bike.',
      'Your rivals ride with you as ghosts. Time checks at the top and the bottom.',
      'Desktop: ← → to pedal, ↑ ↓ to shift, hold Space to tuck.',
    ],
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
