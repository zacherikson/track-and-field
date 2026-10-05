// The practice squad (src/events/relaySim.js): the same race on every phone. Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { RelayTeamSim } from '../src/events/relaySim.js';
import { seededRandom } from '../src/core/random.js';

const cfg = { ...CONFIG.sprint100, ...CONFIG.relay };
const team = (seed, level = 'pro') => new RelayTeamSim({ cfg, level: CONFIG.ai[level], exchange: cfg.ai[level], rng: seededRandom(seed) });
const state = (s) => ({ mark: s.mark, leg: s.leg, legs: s.legs.map((r) => [r.x, r.v]), grades: s.exchanges.map((e) => e.grade) });

test('the same seed runs the same race, however the frames fall', () => {
  const a = team('room1/0-relay4x100/practice-squad');
  a.advanceTo(cfg.maxRaceTime); // all at once
  const b = team('room1/0-relay4x100/practice-squad');
  for (let t = 0, i = 0; t < cfg.maxRaceTime; i++) b.advanceTo((t += [1 / 60, 1 / 144, 0.05, 1 / 30][i % 4])); // a phone's uneven frames
  assert.ok(a.mark != null);
  assert.deepEqual(state(b), state(a));
});

test('caught up partway, it is where the full race had it then', () => {
  const a = team('seed');
  const b = team('seed');
  a.advanceTo(20);
  b.advanceTo(7.3);
  b.advanceTo(20);
  assert.deepEqual(state(b), state(a));
  assert.ok(a.leg >= 1 && a.leg <= 3, `20 s in, a middle leg has the baton (leg ${a.leg + 1})`);
});

test('another seed, another race; times as a computer team runs them', () => {
  const marks = Array.from({ length: 30 }, (_, i) => {
    const s = team(`room${i}/0-relay4x100/practice-squad`);
    s.advanceTo(cfg.maxRaceTime);
    return s.mark;
  });
  assert.ok(new Set(marks).size > 25);
  const sorted = [...marks].sort((x, y) => x - y);
  const median = sorted[15];
  assert.ok(median > 35 && median < 42, `pro median ${median.toFixed(2)} s (tools/simulate.mjs says about 38)`);
});
