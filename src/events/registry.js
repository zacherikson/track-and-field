import { Sprint100 } from './sprint100.js';

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
      'At GO a green target appears. Tapping before it is a false start.',
      'Tap the side the green target is on. It jumps around at random!',
      'Tap the wrong side and you stumble.',
      'Near the line the pads turn ORANGE: press BOTH together to dip.',
      'Desktop: ← → to run, Space to dip.',
    ],
    create() {
      return new Sprint100(this);
    },
  },
  { id: 'hurdles110', name: '110m Hurdles', record: 12.8, unit: 's', lowerIsBetter: true, available: false },
  { id: 'longjump', name: 'Long Jump', record: 8.95, unit: 'm', lowerIsBetter: false, available: false },
  { id: 'javelin', name: 'Javelin', record: 98.5, unit: 'm', lowerIsBetter: false, available: false },
  { id: 'polevault', name: 'Pole Vault', record: 6.2, unit: 'm', lowerIsBetter: false, available: false },
];

export function formatMark(ev, value) {
  if (value == null) return '—';
  return ev.unit === 's' ? `${value.toFixed(2)}s` : `${value.toFixed(2)}m`;
}
