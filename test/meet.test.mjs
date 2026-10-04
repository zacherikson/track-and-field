// Squad meet rules (src/meet/). Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankEvent, squadStandings, sharedPoints, formatPoints } from '../src/meet/scoring.js';
import { seedHeats } from '../src/meet/heats.js';
import { assignLegs, legsValid } from '../src/meet/relayLegs.js';
import { meetStages, eventStages } from '../src/meet/rules.js';

const seq = (...xs) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

test('24 distinct sprint times: top 8 score 10 to 1, the rest 0', () => {
  const entries = Array.from({ length: 24 }, (_, i) => ({ id: `a${i}`, squad: `s${i % 6}`, mark: 10 + i * 0.05 }));
  const r = rankEvent('sprint100', entries);
  assert.deepEqual(r.slice(0, 9).map((x) => x.pts), [10, 8, 6, 5, 4, 3, 2, 1, 0]);
  assert.equal(r[0].id, 'a0');
  assert.equal(r[23].place, 24);
});

test('times are ranked to the thousandth', () => {
  const r = rankEvent('sprint100', [
    { id: 'b', squad: 'x', mark: 9.874 },
    { id: 'a', squad: 'y', mark: 9.871 },
  ]);
  assert.equal(r[0].id, 'a');
  assert.equal(r[0].pts, 10);
  assert.equal(r[1].pts, 8);
});

test('two tied for 2nd share 7 each, the next is 4th', () => {
  const r = rankEvent('sprint100', [
    { id: 'a', squad: 'x', mark: 10 },
    { id: 'b', squad: 'x', mark: 10.5 },
    { id: 'c', squad: 'y', mark: 10.5 },
    { id: 'd', squad: 'y', mark: 11 },
  ]);
  assert.deepEqual(r.map((x) => [x.id, x.place, x.pts]), [
    ['a', 1, 10],
    ['b', 2, 7],
    ['c', 2, 7],
    ['d', 4, 5],
  ]);
});

test('three tied for 8th share a third of a point', () => {
  const entries = Array.from({ length: 7 }, (_, i) => ({ id: `a${i}`, squad: 'x', mark: 10 + i }));
  for (const id of ['t1', 't2', 't3']) entries.push({ id, squad: 'y', mark: 20 });
  const r = rankEvent('sprint100', entries);
  const tied = r.filter((x) => x.id.startsWith('t'));
  assert.ok(tied.every((x) => x.place === 8 && Math.abs(x.pts - 1 / 3) < 0.001));
  assert.equal(formatPoints(tied[0].pts), '0.3');
  assert.equal(sharedPoints(2, 2), 7);
});

test('field: the same best is decided by the second best', () => {
  const r = rankEvent('longjump', [
    { id: 'a', squad: 'x', marks: [7.5, 6.9] },
    { id: 'b', squad: 'y', marks: [7.0, 7.5] },
    { id: 'c', squad: 'y', marks: [7.5] },
  ]);
  assert.deepEqual(r.map((x) => x.id), ['b', 'a', 'c']);
  assert.equal(r[0].mark, 7.5);
});

test('field: exactly level on every mark is a tie', () => {
  const r = rankEvent('javelin', [
    { id: 'a', squad: 'x', marks: [60.001, 50] },
    { id: 'b', squad: 'y', marks: [50, 60.004] },
  ]);
  assert.equal(r[0].place, 1);
  assert.equal(r[1].place, 1);
  assert.equal(r[0].pts, 9);
});

test('3 squads (12 athletes): the top 8 still score', () => {
  const entries = Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, squad: `s${i % 3}`, mark: 50 - i }));
  const r = rankEvent('javelin', entries);
  assert.equal(r.filter((x) => x.pts > 0).length, 8);
});

test('DNF and all fouls: unranked, 0 points', () => {
  const r = rankEvent('polevault', [
    { id: 'a', squad: 'x', marks: [] },
    { id: 'b', squad: 'y', marks: [4.2] },
    { id: 'c', squad: 'y', mark: null },
  ]);
  assert.deepEqual(r.map((x) => [x.id, x.place, x.pts]), [
    ['b', 1, 10],
    ['a', null, 0],
    ['c', null, 0],
  ]);
});

test('relay with 4 teams, one DNF: 10, 8, 6, 0', () => {
  const r = rankEvent('relay4x100', [
    { id: 'w', squad: 'w', mark: 40 },
    { id: 'x', squad: 'x', mark: 39 },
    { id: 'y', squad: 'y', mark: null },
    { id: 'z', squad: 'z', mark: 41 },
  ]);
  assert.deepEqual(r.map((x) => x.pts), [10, 8, 6, 0]);
});

test('squad totals: level on points, most 1sts goes ahead', () => {
  const ev1 = rankEvent('sprint100', [
    { id: 'a', squad: 'A', mark: 10 }, // 10
    { id: 'b', squad: 'B', mark: 11 }, // 8
    { id: 'c', squad: 'B', mark: 12 }, // 6 -> B 14
    { id: 'd', squad: 'A', mark: 13 }, // 5 -> A 15
  ]);
  const ev2 = rankEvent('sprint100', [
    { id: 'b', squad: 'B', mark: 10 }, // 10 -> B 24
    { id: 'a', squad: 'A', mark: 11 }, // 8 -> A 23
    { id: 'd', squad: 'A', mark: 14 }, // 4 ... (place 4)
    { id: 'c', squad: 'B', mark: 12 }, // 6 -> B 30
  ]);
  // A: 15 + 8 + 5 = 28; B: 14 + 10 + 6 = 30.
  let s = squadStandings(['A', 'B'], [ev1, ev2]);
  assert.deepEqual(s.map((r) => [r.squad, r.total, r.rank]), [
    ['B', 30, 1],
    ['A', 28, 2],
  ]);
  // Points add up event by event.
  const evA = rankEvent('sprint100', [
    { id: 'a', squad: 'A', mark: 10 }, // A 10
    { id: 'b', squad: 'B', mark: 11 }, // B 8
    { id: 'c', squad: 'B', mark: 12 }, // B 6 -> 14
    { id: 'd', squad: 'A', mark: 13 }, // A 5 -> 15
  ]);
  const evB = rankEvent('sprint100', [
    { id: 'b', squad: 'B', mark: 10 }, // B 10 -> 24
    { id: 'a', squad: 'A', mark: 11 }, // A 8 -> 23
    { id: 'c', squad: 'B', mark: 12 }, // B 6 -> 30
    { id: 'd', squad: 'A', mark: 13 }, // A 5 -> 28
  ]);
  const evC = rankEvent('sprint100', [{ id: 'a', squad: 'A', mark: 10 }]); // A 10 -> 38
  s = squadStandings(['A', 'B'], [evA, evB, evC]);
  assert.deepEqual(s.map((r) => [r.squad, r.total]), [
    ['A', 38],
    ['B', 30],
  ]);
  const t1 = rankEvent('sprint100', [{ id: 'a', squad: 'A', mark: 10 }, { id: 'b', squad: 'B', mark: 11 }, { id: 'c', squad: 'B', mark: 12 }]);
  // A 10 (one 1st); B 8 + 6 = 14. Add an event where A gets 4 more without a 1st: 5th place.
  const t2 = rankEvent('sprint100', [1, 2, 3, 4].map((i) => ({ id: `x${i}`, squad: 'C', mark: 9 + i * 0.1 })).concat({ id: 'a', squad: 'A', mark: 11 }));
  s = squadStandings(['A', 'B', 'C'], [t1, t2]);
  const A = s.find((r) => r.squad === 'A');
  const B = s.find((r) => r.squad === 'B');
  assert.equal(A.total, 14);
  assert.equal(B.total, 14);
  assert.ok(A.rank < B.rank, 'A has a 1st, B has none');
});

test('squad totals: truly level share the rank', () => {
  const ev = rankEvent('sprint100', [
    { id: 'a', squad: 'A', mark: 10 },
    { id: 'b', squad: 'B', mark: 10 },
  ]);
  const s = squadStandings(['A', 'B'], [ev]);
  assert.equal(s[0].rank, 1);
  assert.equal(s[1].rank, 1);
});

test('heats: one from each squad, the best of each in the last heat', () => {
  const squads = ['A', 'B', 'C'].map((k) => ({ key: k, members: [1, 2, 3, 4].map((i) => ({ uid: `${k}${i}`, pb: 10 + i })) }));
  const heats = seedHeats('sprint100', squads);
  assert.equal(heats.length, 4);
  assert.deepEqual(heats[3], ['A1', 'B1', 'C1']); // the fastest (pb 11)
  assert.deepEqual(heats[0], ['A4', 'B4', 'C4']);
  for (const h of heats) assert.equal(new Set(h.map((u) => u[0])).size, h.length);
});

test('heats: field events seed the longest last; no best seeds slowest; short squads leave slow heats', () => {
  const squads = [
    { key: 'A', members: [{ uid: 'a1', pb: 7 }, { uid: 'a2', pb: 8 }, { uid: 'a3', pb: null }, { uid: 'a4', pb: 6 }] },
    { key: 'B', members: [{ uid: 'b1', pb: 5 }, { uid: 'b2', pb: 6 }, { uid: 'b3', pb: 7 }] },
  ];
  const heats = seedHeats('longjump', squads);
  assert.deepEqual(heats, [['a3'], ['a4', 'b1'], ['a1', 'b2'], ['a2', 'b3']]);
});

test('relay legs: nobody runs two in a row', () => {
  for (let n = 0; n <= 4; n++) {
    for (let trial = 0; trial < 200; trial++) {
      const uids = ['p', 'q', 'r', 's'].slice(0, n);
      const legs = assignLegs(uids);
      if (n === 0) {
        assert.equal(legs, null);
        continue;
      }
      assert.ok(legsValid(legs), `${n}: ${legs}`);
      assert.deepEqual(new Set(legs), new Set(uids));
    }
  }
  assert.deepEqual(assignLegs(['p', 'q'], seq(0)), assignLegs(['p', 'q'], seq(0)));
  assert.ok(!legsValid(['p', 'p', 'q', 'r']));
});

test('stages: one per race, three per field event, in order', () => {
  assert.deepEqual(eventStages(1), ['1-longjump-1', '1-longjump-2', '1-longjump-3']);
  const all = meetStages();
  assert.equal(all.length, 1 + 3 + 1 + 3 + 3 + 1);
  assert.equal(all[0].key, '0-sprint100');
  assert.equal(all[all.length - 1].key, '5-relay4x100');
});
