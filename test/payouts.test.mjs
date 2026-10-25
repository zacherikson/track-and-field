// Live standings (src/online/liveResults.js) and what a public live room pays (src/economy/payouts.js). Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { CONFIG } = await import('../src/config.js');
const { roomStandings, TOURNAMENT_ORDER, eventsOf } = await import('../src/online/liveResults.js');
const { livePayouts } = await import('../src/economy/payouts.js');
const { ledgerId } = await import('../src/economy/wallet.js');
import { readFileSync } from 'node:fs';

const players = (...uids) => uids.map((uid) => ({ uid }));
const race = (ev, marks) => Object.fromEntries(Object.entries(marks).map(([uid, m]) => [uid, { res: { [`0-${ev}`]: m == null ? { status: 'dnf' } : { mark: m } } }]));

test('the tournament order is the game’s', () => {
  // tournament.js ORDER (read as text: importing it pulls in the screens)
  const src = readFileSync(new URL('../src/tournament/tournament.js', import.meta.url), 'utf8');
  assert.deepEqual(TOURNAMENT_ORDER, JSON.parse(/export const ORDER = (\[[^\]]*\])/.exec(src)[1].replace(/'/g, '"')));
  assert.equal(eventsOf('survival'), null, 'live survival is settled some other way');
});

test('a race: best time first, a tie shares its place, a DNF finishes nowhere', () => {
  const docs = race('sprint100', { a: 10.5, b: 10.1, c: 10.5, d: null });
  const s = roomStandings('sprint100', players('a', 'b', 'c', 'd'), docs);
  assert.equal(s.done, true);
  assert.deepEqual(s.overall.map((o) => [o.uid, o.place]), [['b', 1], ['a', 2], ['c', 2]]);
});

test('not done while someone still racing has no result, unless they’re gone', () => {
  const docs = race('sprint100', { a: 10.5, b: 10.1 });
  assert.equal(roomStandings('sprint100', players('a', 'b', 'c'), docs).done, false);
  assert.equal(roomStandings('sprint100', players('a', 'b', 'c'), docs, new Set(['c'])).done, true);
});

test('a field event: the best of all its rounds, once they are all in', () => {
  const rounds = CONFIG.longJump.rounds;
  const res = (marks) => ({ res: Object.fromEntries(marks.map((m, i) => [`0-longjump-${i + 1}`, m == null ? { foul: true } : { mark: m }])) });
  const docs = { a: res([6.1, null, 6.9].slice(0, rounds)), b: res([7.2, 7.0, null].slice(0, rounds)) };
  const s = roomStandings('longjump', players('a', 'b'), docs);
  assert.deepEqual(s.overall.map((o) => [o.uid, o.place, o.mark]), [['b', 1, 7.2], ['a', 2, 6.9]]);
  const partial = { a: { res: { '0-longjump-1': { mark: 6 } } }, b: docs.b };
  assert.equal(roomStandings('longjump', players('a', 'b'), partial).done, false);
});

test('a tournament: ranked by points over all five, only those who finished it', () => {
  const docs = { a: { res: {} }, b: { res: {} }, c: { res: {} } };
  TOURNAMENT_ORDER.forEach((ev, step) => {
    const field = ev === 'longjump' || ev === 'polevault' || ev === 'javelin';
    const put = (uid, mark) => {
      if (!field) docs[uid].res[`${step}-${ev}`] = { mark };
      else for (let r = 1; r <= CONFIG[ev === 'longjump' ? 'longJump' : ev === 'polevault' ? 'poleVault' : 'javelin'].rounds; r++) docs[uid].res[`${step}-${ev}-${r}`] = { mark };
    };
    const good = { sprint100: 10, longjump: 7.5, hurdles110: 13.5, polevault: 5, javelin: 80 }[ev];
    const ok = { sprint100: 11, longjump: 6.5, hurdles110: 15, polevault: 4, javelin: 65 }[ev];
    put('a', good);
    put('b', ok);
    if (step < 3) put('c', good); // c left after three events
  });
  const s = roomStandings('tournament', players('a', 'b', 'c'), docs, new Set(['c']));
  assert.equal(s.done, true);
  assert.deepEqual(s.overall.map((o) => o.uid), ['a', 'b']);
  assert.ok(s.overall[0].total > s.overall[1].total);
  assert.equal(s.events.length, 5);
});

test('payouts: prizes for the top three, medals once three finish, XP for each', () => {
  const L = CONFIG.economy.live;
  const docs = race('sprint100', { a: 10.0, b: 10.2, c: 10.4, d: 10.6 });
  const pay = livePayouts({ kind: 'sprint100', room: 'room1', standings: roomStandings('sprint100', players('a', 'b', 'c', 'd'), docs), day: 9 });
  const a = pay.get('a').summary;
  assert.deepEqual([a.place, a.medal, a.earned, a.premium], [1, 'gold', L.finish + L.prize[0], L.medalPremium[0]]);
  assert.equal(pay.get('c').summary.medal, 'bronze');
  const d = pay.get('d').summary;
  assert.deepEqual([d.medal, d.earned, d.premium], [null, L.finish, 0]);
  assert.ok(d.xp > 0);
  for (const [, p] of pay) assert.equal(new Set(p.changes.map(ledgerId)).size, p.changes.length, 'each change its own ledger entry');
});

test('two finishers: prizes but no medals; one: just finishing; a tournament pays more', () => {
  const L = CONFIG.economy.live;
  const two = livePayouts({ kind: 'sprint100', room: 'r2', standings: roomStandings('sprint100', players('a', 'b'), race('sprint100', { a: 10, b: 11 })), day: 1 });
  assert.equal(two.get('a').summary.medal, null);
  assert.equal(two.get('a').summary.earned, L.finish + L.prize[0]);
  const one = livePayouts({ kind: 'sprint100', room: 'r3', standings: roomStandings('sprint100', players('a'), race('sprint100', { a: 10 })), day: 1 });
  assert.equal(one.get('a').summary.earned, L.finish);
  const fake = { overall: [{ uid: 'a', place: 1, status: 'ok', total: 5000 }, { uid: 'b', place: 2, status: 'ok' }, { uid: 'c', place: 3, status: 'ok' }], events: [] };
  const t = livePayouts({ kind: 'tournament', room: 'r4', standings: fake, day: 1 });
  assert.equal(t.get('a').summary.earned, (L.finish + L.prize[0]) * L.tournament);
  assert.equal(t.get('a').summary.premium, L.medalPremium[0] * L.tournament);
});
