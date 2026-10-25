// Rival levels: High School, Collegiate (was Amateur), Pro. Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

// A phone that beat some of Amateur before it was renamed Collegiate.
const store = new Map([['trackroyale.v1', JSON.stringify({ beaten: { amateur: { sprint100: true } } })]]);
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { LEVELS, getBeaten, markBeaten } = await import('../src/core/storage.js');
const { CONFIG } = await import('../src/config.js');
const { castOf, rivals, heightOf, CHARACTERS } = await import('../src/athletes/roster.js');

test('Collegiate keeps what was beaten as Amateur, and saves under the same key', () => {
  assert.equal(getBeaten('collegiate').sprint100, true);
  markBeaten('collegiate', 'javelin');
  markBeaten('highschool', 'longjump');
  const saved = JSON.parse(store.get('trackroyale.v1')).beaten;
  assert.deepEqual(saved.amateur, { sprint100: true, javelin: true });
  assert.deepEqual(saved.highschool, { longjump: true });
  assert.equal(saved.collegiate, undefined);
});

test('every rival table has every level, each one easier than the next', () => {
  const tables = [CONFIG.ai, CONFIG.sprint100.ai, CONFIG.hurdles110.ai, CONFIG.relay.ai, CONFIG.cycling.ai, CONFIG.longJump.ai, CONFIG.javelin.ai, CONFIG.poleVault.ai];
  for (const t of tables) for (const level of LEVELS) assert.ok(t[level], `missing ${level}`);
  for (const t of [CONFIG.ai, CONFIG.sprint100.ai, CONFIG.cycling.ai, CONFIG.longJump.ai, CONFIG.javelin.ai, CONFIG.poleVault.ai]) {
    assert.ok(t.highschool.cadence[1] < t.collegiate.cadence[1] && t.collegiate.cadence[1] < t.pro.cadence[1]);
  }
  assert.ok(CONFIG.hurdles110.ai.highschool.tapGap[0] > CONFIG.hurdles110.ai.collegiate.tapGap[0]);
});

test('each level races its own five rivals; high schoolers are shorter', () => {
  const seen = new Set();
  for (const level of LEVELS) {
    const field = rivals('sprint100', level);
    assert.equal(field.length, 5, level);
    for (const r of field) assert.ok(!seen.has(r.id), `${r.id} races at two levels`);
    field.forEach((r) => seen.add(r.id));
  }
  assert.equal(castOf('pro'), CHARACTERS);
  for (const a of castOf('highschool')) assert.ok(heightOf(a.colors) < 0.9 && heightOf(a.colors) > 0.75, a.name);
  for (const a of castOf('collegiate')) assert.equal(heightOf(a.colors), 1, a.name);
});
