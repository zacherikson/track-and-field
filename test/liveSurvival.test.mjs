// Live survival (src/survival/liveSurvival.js). Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveSurvival, orderFor, eventAt, resultFrom, settle, GIVE_UP } from '../src/survival/liveSurvival.js';
import { EVENT_IDS } from '../src/survival/survival.js';

/** A stand-in LiveSession: `uid` is you, the rest are the others. */
function room(uids, me = uids[0]) {
  const listeners = new Set();
  const s = {
    room: 'r1',
    uid: me,
    players: uids.map((uid) => ({ uid, name: uid.toUpperCase(), athlete: 'juno' })),
    mine: {},
    docs: new Map(),
    listen(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    set(uid, patch) {
      if (uid === me) return Object.assign(s.mine, patch.res ?? {});
      const doc = { ...(s.docs.get(uid) ?? {}), ...patch, res: { ...(s.docs.get(uid)?.res ?? {}), ...(patch.res ?? {}) } };
      s.docs.set(uid, doc);
      for (const fn of listeners) fn(uid, doc);
    },
  };
  s.others = s.players.filter((p) => p.uid !== me);
  return s;
}

/** Everyone's result for the current step: `marks` = { uid: mark | null } (null = no mark). */
function play(s, marks) {
  const step = liveSurvival.step;
  const ev = liveSurvival.eventId;
  for (const [uid, m] of Object.entries(marks)) {
    const one = (v) => (v == null ? (ev === 'sprint100' || ev === 'hurdles110' ? { status: 'dnf' } : { foul: true }) : { mark: v });
    if (ev === 'longjump' || ev === 'polevault' || ev === 'javelin') s.set(uid, { res: { [`${step}-${ev}-1`]: one(m), [`${step}-${ev}-2`]: { foul: true }, [`${step}-${ev}-3`]: { foul: true } } });
    else s.set(uid, { res: { [`${step}-${ev}`]: one(m) } });
  }
  return ev;
}

/** Marks where `worst` come last in `ev` (and the rest ahead, in order). */
const marksFor = (ev, uids, worst = []) => {
  const lower = ev === 'sprint100' || ev === 'hurdles110';
  return Object.fromEntries(uids.map((u, i) => [u, worst.includes(u) ? (lower ? 99 : 1) : lower ? 10 + i * 0.1 : 8 - i * 0.1]));
};

test('the order: the five every round, seeded by the room, a new shuffle each round', () => {
  assert.deepEqual([...orderFor('r1', 1)].sort(), [...EVENT_IDS].sort());
  assert.deepEqual(orderFor('r1', 1), orderFor('r1', 1));
  const rounds = new Set(Array.from({ length: 6 }, (_, r) => orderFor('r1', r + 1).join()));
  assert.ok(rounds.size > 1, 'not the same order every round');
  assert.notDeepEqual(Array.from({ length: 5 }, (_, i) => orderFor('rA', i + 1).join()), Array.from({ length: 5 }, (_, i) => orderFor('rB', i + 1).join()));
  assert.equal(eventAt('r1', 7), orderFor('r1', 2)[2]);
});

test('a result: a race once its res is in; a field event once all three rounds are, its best', () => {
  assert.equal(resultFrom({}, 0, 'sprint100'), null);
  assert.deepEqual(resultFrom({ '0-sprint100': { mark: 10.4567 } }, 0, 'sprint100'), { mark: 10.46, status: 'ok' });
  assert.deepEqual(resultFrom({ '0-sprint100': { status: 'dnf' } }, 0, 'sprint100'), { mark: null, status: 'dnf' });
  const two = { '3-javelin-1': { mark: 60 }, '3-javelin-2': { mark: 71.234 } };
  assert.equal(resultFrom(two, 3, 'javelin'), null, 'round 3 still to come');
  assert.deepEqual(resultFrom({ ...two, '3-javelin-3': { foul: true } }, 3, 'javelin'), { mark: 71.23, status: 'ok' });
  assert.deepEqual(resultFrom({ '1-polevault-1': { fail: true }, '1-polevault-2': { fail: true }, '1-polevault-3': { fail: true } }, 1, 'polevault'), { mark: null, status: 'nm' });
});

test('settling: last place out, ties for last all out, unless that is everyone; no mark is last', () => {
  const r = (mark) => ({ mark, status: mark == null ? 'dnf' : 'ok' });
  let s = settle('sprint100', [{ uid: 'a', result: r(10.1) }, { uid: 'b', result: r(10.5) }, { uid: 'c', result: r(10.3) }]);
  assert.deepEqual(s.knocked.map((f) => f.uid), ['b']);
  assert.deepEqual(s.ranked.map((f) => f.uid), ['a', 'c', 'b']);
  s = settle('longjump', [{ uid: 'a', result: r(7) }, { uid: 'b', result: r(6.5) }, { uid: 'c', result: r(6.5) }]);
  assert.deepEqual(s.knocked.map((f) => f.uid).sort(), ['b', 'c'], 'tied for last: both out');
  assert.deepEqual(s.ranked.map((f) => f.place), [1, 2, 2]);
  s = settle('longjump', [{ uid: 'a', result: r(6.5) }, { uid: 'b', result: r(6.5) }]);
  assert.deepEqual(s.knocked, [], 'everyone tied: nobody out');
  assert.ok(s.void);
  s = settle('sprint100', [{ uid: 'a', result: r(null) }, { uid: 'b', result: r(12) }]);
  assert.deepEqual(s.knocked.map((f) => f.uid), ['a'], 'a DNF is last');
  s = settle('sprint100', [{ uid: 'a', result: r(null) }, { uid: 'b', result: r(null) }, { uid: 'c', result: null }]);
  assert.deepEqual(s.knocked, [], 'both DNF: nobody out for it');
  assert.deepEqual(s.gone.map((f) => f.uid), ['c'], 'but the one who left is');
  assert.ok(!s.void);
});

test('a game: one out an event until one is left, the same on every phone', () => {
  const uids = ['a', 'b', 'c', 'd'];
  const phones = uids.map((u) => room(uids, u));
  const run = (fn) => phones.map((s) => {
    liveSurvival.start(s);
    return fn(s);
  });
  // Play the same game on each phone in turn.
  const outcomes = run((s) => {
    const seen = [];
    while (!liveSurvival.over) {
      const alive = [...liveSurvival.alive];
      const worst = [alive[alive.length - 1]];
      const ev = liveSurvival.eventId;
      assert.equal(liveSurvival.decide(0), null, 'nothing in yet: waiting');
      play(s, marksFor(ev, alive, worst));
      const e = liveSurvival.decide(0);
      assert.ok(e);
      seen.push(e.out.join());
      assert.equal(s.others.every((p) => liveSurvival.alive.has(p.uid)), true, 'the others are the ones still in');
    }
    liveSurvival.end();
    return { seen, winner: liveSurvival.winner };
  });
  for (const o of outcomes) assert.deepEqual(o, outcomes[0]);
  assert.deepEqual(outcomes[0].seen, ['d', 'c', 'b']);
  assert.equal(outcomes[0].winner, 'a');
});

test('ties for last: all out; everyone tied: nobody, and the event does not count', () => {
  const s = room(['a', 'b', 'c', 'd']);
  liveSurvival.start(s);
  let ev = liveSurvival.eventId;
  const lower = ev === 'sprint100' || ev === 'hurdles110';
  play(s, { a: lower ? 10 : 8, b: lower ? 10.2 : 7.5, c: lower ? 11 : 6, d: lower ? 11 : 6 });
  let e = liveSurvival.decide(0);
  assert.deepEqual(e.out.sort(), ['c', 'd']);
  assert.equal(liveSurvival.placeOf('c'), 3);
  ev = liveSurvival.eventId;
  play(s, { a: 7, b: 7 });
  e = liveSurvival.decide(0);
  assert.ok(e.void);
  assert.equal(liveSurvival.alive.size, 2);
  assert.equal(liveSurvival.step, 2, 'on to the next event');
  liveSurvival.end();
});

test('leaving: out at once and for good (last place still goes too); a result that never comes, out after GIVE_UP', () => {
  const s = room(['a', 'b', 'c', 'd']);
  liveSurvival.start(s);
  const ev = liveSurvival.eventId;
  s.set('d', { left: true });
  s.set('d', { left: false }); // back: still out
  assert.deepEqual(liveSurvival.pending().map((p) => p.uid), ['a', 'b', 'c'], 'not waiting for the one who left');
  play(s, marksFor(ev, ['a', 'b', 'c'], ['c']));
  const e = liveSurvival.decide(0);
  assert.deepEqual(e.out.sort(), ['c', 'd']);
  assert.ok(e.rows.find((r) => r.uid === 'd').left);
  assert.equal(liveSurvival.placeOf('c'), 3);
  assert.equal(liveSurvival.placeOf('d'), 4);
  // Next: b never sends a result.
  play(s, { a: 7 });
  assert.equal(liveSurvival.decide(1000), null);
  assert.equal(liveSurvival.pending()[0].uid, 'b');
  const end = liveSurvival.decide(1000 + GIVE_UP);
  assert.deepEqual(end.out, ['b']);
  assert.ok(liveSurvival.over);
  assert.equal(liveSurvival.winner, 'a');
  assert.equal(liveSurvival.placeOf('a'), 1);
  assert.equal(liveSurvival.placeOf('b'), 2);
  liveSurvival.end();
});

test('points add up for everyone, hidden; catchUp settles every event that is all in', () => {
  const s = room(['a', 'b', 'c'], 'c');
  liveSurvival.start(s);
  // c is out in the first event, then watches.
  let ev = liveSurvival.eventId;
  play(s, marksFor(ev, ['a', 'b', 'c'], ['c']));
  liveSurvival.decide(0);
  assert.ok(!liveSurvival.meIn);
  ev = liveSurvival.eventId;
  play(s, marksFor(ev, ['a', 'b'], ['b']));
  assert.equal(liveSurvival.catchUp(0).length, 1);
  assert.equal(liveSurvival.winner, 'a');
  assert.ok(liveSurvival.totals.get('a') > 0);
  assert.ok(liveSurvival.totals.get('a') > liveSurvival.totals.get('b'));
  liveSurvival.end();
});

