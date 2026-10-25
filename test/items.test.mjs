// Items (src/economy/items.js) and gear in athlete codes (src/athletes/custom.js). Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, SLOTS, RARITIES, slotItems, itemAt, noGear, owns, unlockedAt, gearColors } from '../src/economy/items.js';
import { LOOK, FIELDS, encode, parse, athleteFromCode, randomLook, NAME_MAX } from '../src/athletes/custom.js';

test('the catalog: unique ids, a number per slot that fits one code digit, known slots and rarities', () => {
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length);
  for (const slot of SLOTS) {
    const ns = slotItems(slot).map((i) => i.n);
    assert.equal(new Set(ns).size, ns.length, `${slot}: numbers unique`);
    assert.ok(ns.every((n) => Number.isInteger(n) && n >= 1 && n <= 35), `${slot}: 1-35`);
  }
  for (const i of ITEMS) {
    assert.ok(SLOTS.includes(i.slot) && RARITIES.includes(i.rarity), i.id);
    assert.ok(Number.isInteger(i.level) && i.level >= 1, i.id);
    assert.ok(Object.keys(i.art).length, `${i.id} has art`);
  }
});

test('free gear is yours from its level; a guest is level 1; nothing is always yours', () => {
  const blaze = ITEMS.find((i) => i.id === 'spikes-blaze-01');
  assert.equal(owns(blaze, { level: blaze.level - 1 }), false);
  assert.equal(owns(blaze, { level: blaze.level }), true);
  assert.equal(owns(blaze, { level: null }), blaze.level <= 1);
  assert.equal(owns(null, { level: 1 }), true);
  assert.equal(owns(ITEMS.find((i) => i.level === 1)), true);
  assert.deepEqual(unlockedAt(blaze.level).map((i) => i.id).includes(blaze.id), true);
  // Something to look forward to at each early level.
  for (const level of [2, 3, 5, 7, 10]) assert.ok(unlockedAt(level).length, `level ${level} unlocks gear`);
});

test('gear goes into an athlete code and comes back; no gear keeps the old code', () => {
  const look = randomLook();
  assert.ok(encode(look, 'Kai').startsWith('~1'), 'nothing on: the code every build knows');
  assert.ok(encode(look, 'Kai', noGear()).startsWith('~1'));
  const gear = { spikes: 3, socks: 4, headband: 2, glasses: 1, sleeves: 2, kit: 3 };
  const code = encode(look, 'Kai', gear);
  assert.ok(code.startsWith('~2'));
  assert.deepEqual(parse(code), { look, gear, name: 'Kai' });
  const a = athleteFromCode(code);
  assert.equal(a.colors.shoe, itemAt('spikes', 3).art.shoe);
  assert.equal(a.colors.band, itemAt('headband', 2).art.band);
  assert.equal(a.colors.kitKind, 'yoke');
});

test('the longest code with gear fits a live room and a meet (32)', () => {
  const most = Object.fromEntries(FIELDS.map((f) => [f, LOOK[f].length - 1]));
  const gear = Object.fromEntries(SLOTS.map((s) => [s, slotItems(s).at(-1).n]));
  const code = encode(most, 'W'.repeat(40), gear);
  assert.ok(code.length <= 32, code);
  assert.equal(parse(code).name.length, NAME_MAX);
});

test('gear this build doesn\'t know is left off, the rest kept', () => {
  const look = randomLook();
  const code = encode(look, 'Kai', { spikes: 2 });
  const fromNewer = code.slice(0, 2 + FIELDS.length) + 'z' + code.slice(3 + FIELDS.length); // spikes 35: not in this catalog
  assert.deepEqual(parse(fromNewer).gear, noGear());
  assert.deepEqual(gearColors({ spikes: 35, socks: 1 }), itemAt('socks', 1).art);
});
