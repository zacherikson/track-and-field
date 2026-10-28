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

test("a rival's run-up: the same random numbers, the same speed; Pros faster than Collegiates", () => {
  const rival = (level, seed) => {
    Math.random = seededRandom(seed);
    return lj({ level: { ...CONFIG.ai[level], ...LJ.ai[level] } });
  };
  const real = Math.random;
  try {
    assert.equal(rival('pro', 'a'), rival('pro', 'a'));
    const avg = (level) => Array.from({ length: 40 }, (_, i) => rival(level, `${level}${i}`)).reduce((s, v) => s + v, 0) / 40;
    assert.ok(avg('pro') > avg('collegiate'));
  } finally {
    Math.random = real;
  }
});

test('the glide: before the zone the targets go, taps do nothing and your speed holds (long jump)', async () => {
  const { runUpLJ } = await import('./helpers/strideRuns.mjs');
  assert.equal(LJ.glide, 5);
  let start = null; // { x, v, hits, misses } as the glide starts
  let zone = null; // the same as the zone starts
  let tried = false;
  const run = await runUpLJ('ghost-lj', (sc) => {
    const ru = sc.runUp;
    const r = sc.runner;
    if (ru.gliding && !start) start = { x: r.x, v: r.v, hits: sc.stats.hits, misses: sc.stats.misses };
    if (ru.gliding && !tried && r.x > start.x + 1) {
      tried = true;
      assert.equal(ru.stride('L', sc.now), null, 'a tap while gliding');
      assert.equal(ru.stride('R', sc.now), null, 'a tap while gliding');
      assert.equal(ru.judge.target, null, 'no target while gliding');
    }
    if (ru.gliding) assert.equal(r.v, start.v, 'speed holds');
    if (!ru.striding && !zone) zone = { x: r.x, v: r.v, hits: sc.stats.hits, misses: sc.stats.misses };
  });
  assert.ok(start && tried && zone, 'glided, then reached the zone');
  assert.ok(-start.x <= LJ.zoneDistance + LJ.glide && -start.x > LJ.zoneDistance + LJ.glide - 0.5, `glide from ${-start.x} m`);
  assert.ok(-zone.x <= LJ.zoneDistance && -zone.x > LJ.zoneDistance - 0.5, `zone from ${-zone.x} m`);
  assert.equal(zone.hits, start.hits);
  assert.equal(zone.misses, start.misses);
  assert.ok(Math.abs(run.v - start.v) < 0.05, `into the zone at ${run.v} m/s, glided in at ${start.v}`);
});

test("a rival's glide: no strides, the same speed in as at its start", () => {
  // From a short run-up, not up to speed yet: without the glide they'd keep gaining up to the zone.
  const from = -(LJ.zoneDistance + 12);
  const at = (glide) => lj({ rate: 4.2, from, end: -LJ.zoneDistance, glide });
  const glideStart = lj({ rate: 4.2, from, end: -(LJ.zoneDistance + 5), glide: 0 });
  assert.ok(Math.abs(at(5) - glideStart) < 0.02, `${at(5)} vs ${glideStart}`);
  assert.ok(at(0) > at(5));
});
