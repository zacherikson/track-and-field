import { Sprint100 } from './sprint100.js';
import { Hurdles110 } from './hurdles110.js';
import { LongJump } from './longJump.js';

// The list of events shown on the menu. Each available event provides
// `create()` returning its play scene.
export const EVENTS = [
  {
    id: 'sprint100',
    name: '100m Dash',
    record: 8.9,
    unit: 's',
    lowerIsBetter: true,
    available: true,
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
    id: 'hurdles110',
    name: '110m Hurdles',
    record: 11.58,
    unit: 's',
    lowerIsBetter: true,
    available: true,
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
    id: 'longjump',
    name: 'Long Jump',
    record: 9.86,
    unit: 'm',
    lowerIsBetter: false,
    available: true,
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
  { id: 'javelin', name: 'Javelin', record: 98.5, unit: 'm', lowerIsBetter: false, available: false },
  { id: 'polevault', name: 'Pole Vault', record: 6.2, unit: 'm', lowerIsBetter: false, available: false },
];

export function formatMark(ev, value) {
  if (value == null) return '—';
  return ev.unit === 's' ? `${value.toFixed(2)}s` : `${value.toFixed(2)}m`;
}
