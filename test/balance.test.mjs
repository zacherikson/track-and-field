// The economy's numbers (src/economy/balance.js): the server's copy laid over the game's. Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { BALANCE, BALANCE_VERSION, applyBalance } from '../src/economy/balance.js';
import { xpForRace, levelOf } from '../src/economy/levels.js';
import { payOf } from '../src/economy/contracts.js';

const snapshot = () => JSON.parse(JSON.stringify(BALANCE));

test('the economy is one object: CONFIG.economy is the balance', () => {
  assert.equal(CONFIG.economy, BALANCE);
  assert.deepEqual(Object.keys(BALANCE), ['fines', 'premiumToEarned', 'xp', 'levels', 'live', 'contracts']);
});

test('the server\'s numbers are taken, and what reads them follows', () => {
  const was = snapshot();
  try {
    const sent = snapshot();
    sent.xp.live.finish = 50;
    sent.xp.training.place = [3, 2, 1];
    sent.levels.step = 200;
    sent.live.prize = [500, 250];
    sent.contracts.pay.scholarship = 400;
    sent.contracts.grades[1].pay = 2;
    sent.contracts.standards.pro.javelin = 90;
    assert.equal(applyBalance({ v: BALANCE_VERSION, balance: sent }), true);
    assert.equal(xpForRace({ mode: 'live', place: 4, field: 4 }), 50);
    assert.equal(xpForRace({ mode: 'training', place: 1, field: 2 }), 3, 'a list of numbers can grow');
    assert.equal(levelOf(200), 2);
    assert.deepEqual(CONFIG.economy.live.prize, [500, 250]);
    assert.equal(payOf('scholarship', 1), 800);
    assert.equal(CONFIG.economy.contracts.standards.pro.javelin, 90);
  } finally {
    applyBalance({ v: BALANCE_VERSION, balance: was });
  }
  assert.deepEqual(snapshot(), was, 'and back');
});

test('a bad or old copy changes nothing it shouldn\'t', () => {
  const was = snapshot();
  const sent = snapshot();
  sent.xp.dailyCap = 'lots';
  sent.levels.step = NaN;
  sent.live.prizeMin = [1];
  sent.live.prize = [100, 'x'];
  sent.contracts.grades = [{ name: 'Only', points: 0, pay: 9 }];
  sent.contracts.pay = 5;
  sent.fines = 1;
  sent.junk = { a: 1 };
  delete sent.premiumToEarned;
  assert.equal(applyBalance({ v: BALANCE_VERSION, balance: sent }), true);
  assert.deepEqual(snapshot(), was, 'every one of those is left as it was');
  for (const bad of [null, 5, {}, { v: BALANCE_VERSION }, { v: BALANCE_VERSION + 1, balance: sent }, { v: BALANCE_VERSION, balance: [] }]) assert.equal(applyBalance(bad), false);
  assert.deepEqual(snapshot(), was);
});
