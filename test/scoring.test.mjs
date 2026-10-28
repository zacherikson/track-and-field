// Tournament points (events/scoring.js). Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { points } from '../src/events/scoring.js';

const EVENTS = ['sprint100', 'hurdles110', 'longjump', 'polevault', 'javelin'];
// tools/simulate.mjs's players: the same skill in every event.
const TIERS = {
  casual: { sprint100: 9.7, hurdles110: 14.4, longjump: 6.85, polevault: 3.65, javelin: 77 },
  good: { sprint100: 8.75, hurdles110: 12.3, longjump: 8.1, polevault: 4.5, javelin: 85 },
  perfect: { hurdles110: 11.25, longjump: 10.35, polevault: 6.5, javelin: 100.5 },
};

test('the same skill scores the same in every event', () => {
  for (const [tier, want] of [['casual', 650], ['good', 900], ['perfect', 1200]]) {
    for (const ev of EVENTS) if (TIERS[tier][ev] != null) assert.equal(points(ev, TIERS[tier][ev]), want, `${tier} ${ev}`);
  }
});

test("the 100m's best on the board (8.28 s) is worth 1250", () => {
  assert.equal(points('sprint100', 8.28), 1250);
});

test('a perfect tournament is about 6000', () => {
  const total = points('sprint100', 8.28) + EVENTS.slice(1).reduce((s, ev) => s + points(ev, TIERS.perfect[ev]), 0);
  assert.equal(total, 6050);
});

test('better marks never score less, and a record past perfect still scores more', () => {
  const step = (ev, m) => (ev === 'sprint100' || ev === 'hurdles110' ? -m : m);
  for (const ev of EVENTS) {
    const p = TIERS.perfect[ev] ?? 8.28;
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
