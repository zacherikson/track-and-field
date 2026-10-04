// Live play's buttons: the same for everyone in a room (src/core/random.js). Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom, liveRandom } from '../src/core/random.js';
import { TargetSequence } from '../src/events/strideTargets.js';
import { ButtonSet } from '../src/events/hurdleRules.js';

const draw = (rng, n) => Array.from({ length: n }, () => rng());

test('seededRandom: the same seed gives the same numbers, in [0, 1); another seed differs', () => {
  const a = draw(seededRandom('room1/0-sprint100/targets'), 200);
  assert.deepEqual(a, draw(seededRandom('room1/0-sprint100/targets'), 200));
  assert.ok(a.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(a, draw(seededRandom('room1/1-sprint100/targets'), 200));
  const mean = a.reduce((s, x) => s + x, 0) / a.length;
  assert.ok(mean > 0.4 && mean < 0.6);
});

test('liveRandom: seeded from the room and stage when live, Math.random off line', () => {
  const live = { seedOf: (stage) => `r9/${stage}` };
  assert.deepEqual(draw(liveRandom(live, '0-javelin-2', 'targets'), 20), draw(seededRandom('r9/0-javelin-2/targets'), 20));
  assert.equal(liveRandom(null, '0-javelin-2', 'targets'), Math.random);
});

test('two phones in a room get the same 100m targets, hit for hit', () => {
  const seq = () => new TargetSequence({ maxSameSide: 2, switchChance: 0.5 }, seededRandom('roomX/0-sprint100/targets'));
  const a = seq();
  const b = seq();
  assert.deepEqual(Array.from({ length: 80 }, () => a.next()), Array.from({ length: 80 }, () => b.next()));
});

test('two phones in a room get the same hurdle button sets, hurdle for hurdle', () => {
  const runner = { cruise: false, restartInterval() {} };
  const sets = () => {
    const s = new ButtonSet(runner, {}, seededRandom('roomX/0-hurdles110/buttons'));
    return Array.from({ length: 11 }, (_, i) => (s.start(i), [...s.slots]));
  };
  assert.deepEqual(sets(), sets());
});
