// Athletes you make yourself (src/athletes/custom.js, the Athlete Maker). Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOK, FIELDS, encode, parse, athleteFromCode, randomLook, cleanAthleteName, isCode, NAME_MAX } from '../src/athletes/custom.js';
import { noGear } from '../src/economy/items.js';
import { seededRandom } from '../src/core/random.js';

test('a look and name go into a code and come back out the same', () => {
  const rng = seededRandom('looks');
  for (let i = 0; i < 300; i++) {
    const look = randomLook(rng);
    const code = encode(look, 'Zippy');
    assert.ok(isCode(code));
    assert.deepEqual(parse(code), { look, gear: noGear(), name: 'Zippy' });
  }
});

test('every pick, the last of each list too, fits in a code that fits a live room and a meet (32)', () => {
  const most = Object.fromEntries(FIELDS.map((f) => [f, LOOK[f].length - 1]));
  for (const f of FIELDS) assert.ok(LOOK[f].length <= 36, `${f}: one base-36 digit each`);
  const code = encode(most, 'W'.repeat(40));
  assert.ok(code.length <= 24, code);
  assert.deepEqual(parse(code).look, most);
  assert.equal(parse(code).name.length, NAME_MAX);
});

test('names are tidied; an empty one gets the default', () => {
  assert.equal(cleanAthleteName('  Big   Al!!  '), 'Big Al');
  assert.equal(cleanAthleteName('Zoë-Ann O\'Neil'), 'Zoë-Ann O\'Ne');
  assert.equal(parse(encode(randomLook(), '!!!')).name, 'Rookie');
});

test('anything else is not a code: the cast, junk, picks this build does not have', () => {
  for (const id of ['juno', '', null, undefined, '~1', '~1abc', '~1zzzzzzzX', '~2000000000x']) assert.equal(parse(id), null, String(id));
  assert.equal(athleteFromCode('juno'), null);
});

test('a code is an athlete with its look, the same object each time', () => {
  const look = { skin: 7, style: 8, hair: 9, shirt: 4, shorts: 4, height: 0, build: 3 };
  const code = encode(look, 'Mo');
  const a = athleteFromCode(code);
  assert.equal(a, athleteFromCode(code));
  assert.equal(a.id, code);
  assert.equal(a.name, 'Mo');
  assert.ok(a.custom);
  assert.deepEqual(a.colors, { skin: LOOK.skin[7], style: 'mohawk', hair: LOOK.hair[9], shirt: LOOK.shirt[4], shorts: LOOK.shorts[4], height: 2 / 3, girth: 2.3 });
});

test('playing as the athlete you made: still five rivals, the closest shirt sits out', async () => {
  // Storage keeps to localStorage: an in-memory one (each test file runs on its own).
  const mem = new Map();
  globalThis.localStorage ??= { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const { setCharacter, setCustom } = await import('../src/core/storage.js');
  const { rivals, myAthlete, CHARACTERS, athleteById } = await import('../src/athletes/roster.js');
  const code = encode({ skin: 0, style: 0, hair: 0, shirt: 0, shorts: 0, height: 3, build: 0 }, 'Goldie'); // shirt 0: Juno's yellow
  setCustom(code);
  setCharacter(code);
  assert.equal(myAthlete().id, code);
  assert.equal(athleteById(code), myAthlete());
  const r = rivals('sprint100');
  assert.equal(r.length, 5);
  assert.ok(!r.some((c) => c.id === 'juno'), 'Juno, in the same yellow, sits out');
  setCharacter('okoro');
  assert.deepEqual(rivals('sprint100').map((c) => c.id), CHARACTERS.filter((c) => c.id !== 'okoro').map((c) => c.id));
  setCharacter(null);
});
