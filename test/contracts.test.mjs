// Contracts (src/economy/contracts.js). Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { emptyContract, cleanContract, localDay, setZone, advance, collect, countRaces, offers, sign, medalPoints, standardsMet, payOf, contractView } from '../src/economy/contracts.js';

const K = CONFIG.economy.contracts;
const beatenHS = { beaten: { highschool: { tournament: true } }, top: {} };
const signed = (tier = 'scholarship', day = 100) => sign(emptyContract(), { tier, grade: 0, pay: payOf(tier, 0) }, day).contract;

test('your day ends at your midnight', () => {
  const t = Date.UTC(2026, 9, 25, 3, 0); // 3am UTC = 8pm the day before in Utah (UTC-7, offset +420)
  assert.equal(localDay(t, 0), localDay(Date.UTC(2026, 9, 25, 12), 0));
  assert.equal(localDay(t, 420), localDay(t, 0) - 1);
  assert.equal(localDay(Date.UTC(2026, 9, 25, 23, 30), -120), localDay(t, 0) + 1); // already tomorrow in Europe
});

test('the time zone takes a new value at most once every few days', () => {
  let c = setZone(emptyContract(), 420, 100);
  assert.equal(c.tz, 420);
  assert.equal(setZone(c, 300, 102).tz, 420);
  assert.equal(setZone(c, 300, 100 + K.zoneEvery).tz, 300);
  assert.equal(setZone(c, 5000, 200).tz, 420); // nonsense refused
});

test('no offers until a campaign tournament is beaten; then its contract', () => {
  assert.deepEqual(offers({ contract: null, progress: { beaten: { highschool: { sprint100: true } } }, wallet: {} }), []);
  const [o] = offers({ contract: null, progress: beatenHS, wallet: {} });
  assert.equal(o.tier, 'scholarship');
  assert.equal(o.grade, 0);
  assert.equal(o.pay, K.pay.scholarship);
});

test('Pro needs live medals as well as the Pro campaign', () => {
  const progress = { beaten: { highschool: { tournament: true }, amateur: { tournament: true }, pro: { tournament: true } }, top: {} };
  assert.deepEqual(offers({ contract: null, progress, wallet: { silver: 1 } }).map((o) => o.tier), ['scholarship', 'nil']);
  assert.deepEqual(offers({ contract: null, progress, wallet: { gold: 1 } }).map((o) => o.tier), ['scholarship', 'nil', 'pro']);
});

test('medals and standards met make a better grade, with better pay', () => {
  assert.equal(medalPoints({ gold: 1, silver: 2, bronze: 3 }), 18);
  const top = { sprint100: [{ mark: 11.0 }], hurdles110: [{ mark: 15.2 }], longjump: [{ mark: 6.5 }, { mark: 6.0 }], polevault: [{ mark: 3.1 }], javelin: [{ mark: 72 }] };
  assert.deepEqual(standardsMet('scholarship', top), ['sprint100', 'longjump', 'polevault', 'javelin']); // hurdles 15.2 misses 14.7
  const [starter] = offers({ contract: null, progress: { ...beatenHS, top }, wallet: {} }); // 4 standards = 8 points
  assert.equal(K.grades[starter.grade].name, 'Starter');
  assert.ok(starter.pay > K.pay.scholarship);
  const [star] = offers({ contract: null, progress: { ...beatenHS, top }, wallet: { gold: 2 } }); // 8 + 12
  assert.equal(K.grades[star.grade].name, 'Star');
});

test('only offers that pay more than what you have; signing replaces it with a bonus', () => {
  const c = signed();
  assert.deepEqual(offers({ contract: c, progress: beatenHS, wallet: {} }), []);
  const progress = { beaten: { highschool: { tournament: true }, amateur: { tournament: true } }, top: {} };
  const [nil] = offers({ contract: c, progress, wallet: {} });
  assert.equal(nil.tier, 'nil');
  const r = sign(c, nil, 120);
  assert.equal(r.contract.tier, 'nil');
  assert.equal(r.contract.start, 120);
  assert.equal(r.bonus, nil.pay * K.signingBonus);
});

test('pay: once a day, a day missed is lost', () => {
  let c = signed('scholarship', 100);
  let r = collect(c, 100);
  assert.equal(r.amount, K.pay.scholarship);
  r = collect(r.contract, 100);
  assert.equal(r.amount, 0); // already collected today
  c = countRaces(r.contract, 101, [1, 2, 3]).contract; // keeps the clause
  r = collect(c, 104); // days 101-103 missed: just today's
  assert.equal(r.amount, K.pay.scholarship);
  assert.equal(r.contract.paid, 104);
});

test('the clause: probation, back to full pay, then lost', () => {
  let c = signed('scholarship', 100);
  // Week 1 (days 100-106): no races. Day 107: probation, at a cut.
  let r = collect(c, 107);
  assert.deepEqual(r.news, ['probation']);
  assert.equal(r.amount, Math.round(K.pay.scholarship * (1 - K.probationCut)));
  // Week 2: the clause met. Day 114: full pay again.
  c = countRaces(r.contract, 110, Array(K.clauseRaces).fill(0)).contract;
  r = collect(c, 114);
  assert.deepEqual(r.news, ['restored']);
  assert.equal(r.amount, K.pay.scholarship);
  // Weeks 3 and 4 missed: probation, then lost.
  r = collect(r.contract, 128);
  assert.deepEqual(r.news, ['probation', 'lost']);
  assert.equal(r.amount, 0);
  assert.equal(r.contract.tier, '');
  assert.equal(r.contract.lost, 'scholarship');
});

test('a long time away: lost, and nothing paid', () => {
  const r = collect(signed('nil', 100), 400);
  assert.equal(r.contract.lost, 'nil');
  assert.equal(r.amount, 0);
});

test('lost: offers come back after top-3 finishes', () => {
  const lost = advance(signed('scholarship', 100), 130).contract;
  assert.equal(lost.lost, 'scholarship');
  assert.deepEqual(offers({ contract: lost, progress: beatenHS, wallet: {} }), []);
  let c = countRaces(lost, 131, [5, 1, 0, 2]).contract; // two count
  assert.equal(c.requal, 2);
  assert.deepEqual(offers({ contract: c, progress: beatenHS, wallet: {} }), []);
  c = countRaces(c, 132, [3]).contract;
  assert.equal(offers({ contract: c, progress: beatenHS, wallet: {} })[0].tier, 'scholarship');
  const back = sign(c, offers({ contract: c, progress: beatenHS, wallet: {} })[0], 133).contract;
  assert.equal(back.lost, '');
  assert.equal(back.status, 'active');
});

test('what the game is shown, and a contract read back from anything', () => {
  const c = countRaces(signed('scholarship', 100), 102, [1]).contract;
  const v = contractView(collect(c, 102).contract, 102);
  assert.deepEqual([v.tier, v.status, v.races, v.need, v.daysLeft, v.paidToday], ['scholarship', 'active', 1, K.clauseRaces, 5, true]);
  assert.deepEqual(cleanContract({ tier: 'nope', lost: 'pro', requal: '2' }), { ...emptyContract(), lost: 'pro', requal: 2 });
  assert.deepEqual(cleanContract(null), emptyContract());
});
