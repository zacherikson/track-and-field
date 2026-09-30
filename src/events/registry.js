import { Sprint100 } from './sprint100.js';
import { Hurdles110 } from './hurdles110.js';
import { LongJump } from './longJump.js';
import { PoleVault } from './poleVault.js';
import { Javelin } from './javelin.js';

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

// The tournaments' online leaderboards (total decathlon points), one per kind:
// solo (one athlete does all five) and team (your lineup). Not playable on
// their own, so they aren't in EVENTS. The solo board kept the id the one
// tournament board had, so its entries carried over.
export const TOURNAMENT_BOARDS = {
  solo: { id: 'tournament', name: 'Solo Tournament', unit: 'pts', lowerIsBetter: false, online: true, tournament: 'solo' },
  team: { id: 'teamtournament', name: 'Team Tournament', unit: 'pts', lowerIsBetter: false, online: true, tournament: 'team' },
};

/** Every online leaderboard, in menu order. */
export const BOARDS = [...EVENTS, TOURNAMENT_BOARDS.solo, TOURNAMENT_BOARDS.team];

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
