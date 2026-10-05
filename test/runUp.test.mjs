// The field events' run-up (src/events/runUpRules.js): one for every field event, rivals and the simulator. Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { runUpSpeed } from '../src/events/runUpRules.js';
import { seededRandom } from '../src/core/random.js';

const LJ = CONFIG.longJump;
const lj = (opts) => runUpSpeed({ from: -LJ.runway, line: 0, end: -1, zoneDistance: LJ.zoneDistance, ...opts });

test('faster tapping, a faster run-up, up to sprinting speed', () => {
  const speeds = [2.5, 3.0, 3.7, 4.2, 4.7].map((rate) => lj({ rate }));
  speeds.forEach((v, i) => i && assert.ok(v > speeds[i - 1], `${v} after ${speeds[i - 1]}`));
  assert.ok(speeds.at(-1) > 10 && speeds.at(-1) < CONFIG.runner.topSpeed + 0.5);
});

test("a rival's run-up: the same random numbers, the same speed; Pros faster than Amateurs", () => {
  const rival = (level, seed) => {
    Math.random = seededRandom(seed);
    return lj({ level: { ...CONFIG.ai[level], ...LJ.ai[level] } });
  };
  const real = Math.random;
  try {
    assert.equal(rival('pro', 'a'), rival('pro', 'a'));
    const avg = (level) => Array.from({ length: 40 }, (_, i) => rival(level, `${level}${i}`)).reduce((s, v) => s + v, 0) / 40;
    assert.ok(avg('pro') > avg('amateur'));
  } finally {
    Math.random = real;
  }
});
