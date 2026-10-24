// Survival mode (src/survival/survival.js). Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { survival, skillFor, blend, aiLevel, survives, EVENT_IDS, RIVAL_NAMES } from '../src/survival/survival.js';
import { seededRandom } from '../src/core/random.js';

const SECTIONS = ['longJump', 'javelin', 'poleVault', 'hurdles110'];

test('the rival: Amateur in round 1, a weak Pro in 2, a strong Pro in 3, then better every round by less each time', () => {
  assert.equal(skillFor(1), 0);
  assert.ok(skillFor(2) > 0.5 && skillFor(2) < 1, 'round 2: a weak Pro');
  assert.ok(skillFor(3) > 1, 'round 3: a strong Pro');
  for (let r = 1; r < 40; r++) assert.ok(skillFor(r + 1) > skillFor(r), `round ${r + 1} harder than ${r}`);
  for (let r = 3; r < 40; r++) assert.ok(skillFor(r + 2) - skillFor(r + 1) < skillFor(r + 1) - skillFor(r), `round ${r + 2} a smaller step than ${r + 1}`);
  assert.ok(skillFor(60) < CONFIG.survival.ceiling);
});

test('blending: skill 0 is Amateur and 1 is Pro, exactly, for every rival table', () => {
  for (const t of [CONFIG.ai, ...SECTIONS.map((k) => CONFIG[k].ai)]) {
    assert.deepEqual(blend(t.amateur, t.pro, 0), t.amateur);
    assert.deepEqual(blend(t.amateur, t.pro, 1), t.pro);
  }
});

test('blending past either end stays sane: ranges in order, nothing crosses zero', () => {
  const check = (a, p, v, path) => {
    if (typeof a === 'number') {
      if (a >= 0 && p >= 0) assert.ok(v >= 0, `${path} went negative: ${v}`);
      if (a <= 0 && p <= 0) assert.ok(v <= 0, `${path} went positive: ${v}`);
    } else if (Array.isArray(a)) {
      if (v.length === 2) assert.ok(v[0] <= v[1], `${path} out of order: ${v}`);
      a.forEach((x, i) => check(x, p[i], v[i], `${path}[${i}]`));
    } else if (a && typeof a === 'object') for (const k of Object.keys(a)) if (k in p) check(a[k], p[k], v[k], `${path}.${k}`);
  };
  for (const s of [skillFor(1), skillFor(6), skillFor(30)]) {
    for (const [name, t] of [['ai', CONFIG.ai], ...SECTIONS.map((k) => [k, CONFIG[k].ai])]) check(t.amateur, t.pro, blend(t.amateur, t.pro, s), `${name}@${s.toFixed(2)}`);
  }
  // Rivals still stride: cadence stays well above zero even easier than Amateur.
  assert.ok(blend(CONFIG.ai.amateur, CONFIG.ai.pro, skillFor(1)).cadence[0] > 1);
});

test('aiLevel: the named level outside a run, blended in one', () => {
  survival.end();
  assert.equal(aiLevel(CONFIG.ai, 'pro'), CONFIG.ai.pro);
  survival.start(seededRandom('x'));
  survival.round = 1;
  assert.deepEqual(aiLevel(CONFIG.ai, 'pro'), CONFIG.ai.amateur); // round 1: Amateur, whatever the name says
  survival.end();
});

test('who survives: a better mark, or a tie; no mark loses unless he has none either', () => {
  const run = { lowerIsBetter: true };
  const jump = { lowerIsBetter: false };
  const ok = (mark) => ({ mark, status: 'ok' });
  assert.ok(survives(run, ok(10.5), ok(10.6)));
  assert.ok(!survives(run, ok(10.7), ok(10.6)));
  assert.ok(survives(run, ok(10.6), ok(10.6)), 'a tie keeps you in');
  assert.ok(survives(jump, ok(7.2), ok(7.1)));
  assert.ok(!survives(jump, ok(7.0), ok(7.1)));
  assert.ok(!survives(run, { mark: null, status: 'dnf' }, ok(12)));
  assert.ok(survives(jump, ok(5), { mark: null, status: 'nm' }));
  assert.ok(survives(jump, { mark: null, status: 'nm' }, { mark: null, status: 'nm' }));
});

test('a run: the five in a random order each round, a new name each round, points adding up, out on a loss', () => {
  survival.start(seededRandom('run'));
  const names = new Set();
  const ev = (id) => ({ id, lowerIsBetter: id === 'sprint100' || id === 'hurdles110' });
  const win = (id) => (ev(id).lowerIsBetter ? [{ isPlayer: true, mark: 11, status: 'ok' }, { name: 'r', mark: 12, status: 'ok' }] : [{ isPlayer: true, mark: 6, status: 'ok' }, { name: 'r', mark: 5, status: 'ok' }]);
  for (let round = 1; round <= 3; round++) {
    assert.equal(survival.round, round);
    assert.deepEqual([...survival.order].sort(), [...EVENT_IDS].sort());
    names.add(survival.rival.name);
    assert.ok(RIVAL_NAMES.includes(survival.rival.name));
    for (let i = 0; i < 5; i++) {
      const before = survival.total;
      const e = survival.record(ev(survival.eventId), win(survival.eventId));
      assert.ok(e.survived);
      assert.equal(survival.total, before + e.pts);
      assert.equal(survival.lastOfRound, i === 4);
      survival.advance();
    }
  }
  assert.equal(names.size, 3, 'a new name each round');
  assert.equal(survival.won, 15);
  assert.equal(survival.roundsSurvived, 3);
  // Then a loss.
  const id = survival.eventId;
  const lose = win(id).map((r) => (r.isPlayer ? { ...r, status: 'dnf', mark: null } : r));
  assert.ok(!survival.record(ev(id), lose).survived);
  assert.ok(survival.over);
  assert.equal(survival.won, 15);
  survival.end();
});

test('in a run, your rivals are just him', async () => {
  const { rivals } = await import('../src/athletes/roster.js');
  survival.start(seededRandom('rivals'));
  const r = rivals('longjump');
  assert.equal(r.length, 1);
  assert.equal(r[0].name, survival.rival.name);
  survival.end();
  assert.equal(rivals('longjump').length, 5);
});
