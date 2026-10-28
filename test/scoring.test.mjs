// Tournament points (events/scoring.js). Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { points } from '../src/events/scoring.js';

const EVENTS = ['sprint100', 'hurdles110', 'longjump', 'polevault', 'javelin'];
// tools/simulate.mjs's players: the same skill in every event.
const TIERS = {
  casual: { sprint100: 9.7, hurdles110: 14.4, longjump: 6.85, polevault: 3.65, javelin: 77 },
  good: { sprint100: 8.75, hurdles110: 12.3, longjump: 8.1, polevault: 4.5, javelin: 85 },
  perfect: { sprint100: 8.15, hurdles110: 11.25, longjump: 10.35, polevault: 6.5, javelin: 100.5 },
};

test('the same skill scores the same in every event', () => {
  for (const [tier, want] of [['casual', 650], ['good', 900], ['perfect', 1200]]) {
    for (const ev of EVENTS) assert.equal(points(ev, TIERS[tier][ev]), want, `${tier} ${ev}`);
  }
});

test('a perfect tournament is about 6000', () => {
  assert.equal(EVENTS.reduce((s, ev) => s + points(ev, TIERS.perfect[ev]), 0), 6000);
});

test('better marks never score less, and a record past perfect still scores more', () => {
  const step = (ev, m) => (ev === 'sprint100' || ev === 'hurdles110' ? -m : m);
  for (const ev of EVENTS) {
    const p = TIERS.perfect[ev];
    let prev = -1;
    for (let k = 0; k <= 400; k++) {
      const mark = p - step(ev, p * (1 - k / 330)); // from hopeless to past perfect
      const pts = points(ev, mark);
      assert.ok(pts >= prev, `${ev} ${mark}`);
      prev = pts;
    }
    assert.ok(points(ev, p + step(ev, p * 0.02)) > 1200, `${ev} past perfect`);
  }
});

test('no mark, a DNF, a foul or a hopeless mark scores 0', () => {
  assert.equal(points('sprint100', null), 0);
  assert.equal(points('sprint100', 9, 'dnf'), 0);
  assert.equal(points('longjump', 8, 'foul'), 0);
  assert.equal(points('sprint100', 25), 0);
  assert.equal(points('javelin', 3), 0);
  assert.equal(points('nope', 10), 0);
});
