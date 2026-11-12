// A live room settling its standings (src/roomCore.js), for the payouts. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomCore } from '../src/roomCore.js';
import { CONFIG } from '../../src/config.js';

function room(kind = 'sprint100', uids = ['a', 'b', 'c']) {
  let now = 1000;
  const settled = [];
  const core = new RoomCore({ now: () => now, ended: () => {}, settle: (s) => settled.push(s) });
  core.init({ kind, startAt: now, setLen: 1.5, players: uids.map((uid) => ({ uid, name: uid, athlete: 'juno' })), public: true, id: 'room1' });
  const peers = Object.fromEntries(uids.map((uid) => [uid, { uid, sent: [], send(m) { this.sent.push(m); }, close() {} }]));
  for (const p of Object.values(peers)) core.connect(p);
  now += 12000; // the race is run: results come once it could have been (see the last tests)
  return { core, peers, settled, advance: (ms) => (now += ms), result: (uid, mark) => core.message(peers[uid], { t: 'patch', p: { [`res/0-${kind}`]: mark == null ? { status: 'dnf' } : { mark } } }) };
}

test('settles once everyone’s result is in, once, with the order the marks say', () => {
  const r = room();
  r.result('a', 10.4);
  r.result('b', 10.1);
  assert.equal(r.settled.length, 0, 'c is still racing');
  r.result('c', 10.9);
  assert.equal(r.settled.length, 1);
  assert.deepEqual(r.settled[0].overall.map((o) => o.uid), ['b', 'a', 'c']);
  r.result('c', 9.0); // a late change of story changes nothing
  r.core.tick();
  assert.equal(r.settled.length, 1);
});

test('a player who leaves without a result doesn’t hold it up', () => {
  const r = room();
  r.result('a', 10.4);
  r.result('b', 10.1);
  r.core.disconnect(r.peers.c);
  assert.equal(r.settled.length, 1);
  assert.deepEqual(r.settled[0].overall.map((o) => o.uid), ['b', 'a']);
});

test('a result that never comes: settled without it a while after the last one', () => {
  const r = room();
  r.result('a', 10.4);
  r.advance(CONFIG.economy.live.giveUp - 1);
  r.core.tick();
  assert.equal(r.settled.length, 0);
  r.advance(2);
  r.core.tick();
  assert.equal(r.settled.length, 1);
  assert.deepEqual(r.settled[0].overall.map((o) => o.uid), ['a']);
});

test('live survival isn’t settled here; a payout goes to that player only', () => {
  const r = room('survival');
  r.core.message(r.peers.a, { t: 'patch', p: { 'res/0-sprint100': { mark: 10 } } });
  r.core.tick();
  assert.equal(r.settled.length, 0);
  r.core.sendTo('b', { t: 'payout', medal: 'gold' });
  assert.deepEqual(r.peers.b.sent.at(-1), { t: 'payout', medal: 'gold' });
  assert.ok(!r.peers.a.sent.some((m) => m.t === 'payout'));
});

test('a result that isn’t possible, or is in before the race could be run, doesn’t count', () => {
  const r = room('sprint100', ['a', 'b', 'c', 'd']);
  r.advance(-12000); // back to the start
  r.advance(3000);
  r.result('a', 9.5); // 3 s after the start: nobody ran 100 m
  r.advance(7000);
  r.result('b', 10.4); // 10 s after the start: fine (the gun is a moment after the start, so a hair early is let go)
  r.result('c', 6.5); // not possible on any day
  r.advance(1000);
  r.result('d', 10.9);
  assert.equal(r.settled.length, 1);
  assert.deepEqual(r.settled[0].overall.map((o) => [o.uid, o.place]), [['b', 1], ['d', 2]], 'a and c have no mark');
  assert.deepEqual(r.settled[0].events[0].ranked.slice(2).map((x) => x.result.status), ['dnf', 'dnf']);
  // The phones still see what was sent: only the payout is the server's.
  assert.ok(r.peers.b.sent.some((m) => m.t === 'doc' && m.u === 'a' && m.p['res/0-sprint100']?.mark === 9.5));
});

test('the first result for a stage stands; a field mark past the limit is a foul', () => {
  const r = room('longjump', ['a', 'b']);
  const jump = (uid, k, mark) => r.core.message(r.peers[uid], { t: 'patch', p: { [`res/0-longjump-${k}`]: mark == null ? { foul: true } : { mark } } });
  jump('a', 1, 7.2);
  jump('a', 1, 9.9); // a second go at round 1: dropped, and not passed on
  assert.ok(!r.peers.b.sent.some((m) => m.t === 'doc' && m.p['res/0-longjump-1']?.mark === 9.9));
  r.core.message(r.peers.a, { t: 'patch', p: { res: { '0-longjump-2': { mark: 9.9 } } } }); // nor the whole lot at once
  jump('a', 2, 30); // not possible
  jump('a', 3, null);
  for (const k of [1, 2, 3]) jump('b', k, 7.0);
  assert.equal(r.settled.length, 1);
  assert.deepEqual(r.settled[0].overall.map((o) => [o.uid, o.mark]), [['a', 7.2], ['b', 7]]);
});

test('a tournament: each race no sooner after your last result than it takes to run', () => {
  const r = room('tournament', ['a', 'b']);
  const send = (uid, key, v) => r.core.message(r.peers[uid], { t: 'patch', p: { [`res/${key}`]: v } });
  const field = (uid, step, ev, mark) => [1, 2, 3].forEach((k) => send(uid, `${step}-${ev}-${k}`, { mark }));
  for (const uid of ['a', 'b']) send(uid, '0-sprint100', { mark: 10.2 });
  r.advance(30000);
  for (const uid of ['a', 'b']) field(uid, 1, 'longjump', 7.5);
  r.advance(4000);
  send('a', '2-hurdles110', { mark: 13.5 }); // 4 s after the long jump: not a 13.5 s race
  r.advance(11000);
  send('b', '2-hurdles110', { mark: 14.1 }); // 15 s after: fine
  r.advance(30000);
  for (const uid of ['a', 'b']) field(uid, 3, 'polevault', 4.2);
  for (const uid of ['a', 'b']) field(uid, 4, 'javelin', 80);
  assert.equal(r.settled.length, 1);
  const hurdles = r.settled[0].events[2].ranked;
  assert.deepEqual(hurdles.map((x) => [x.uid, x.result.status]), [['b', 'ok'], ['a', 'dnf']]);
  assert.deepEqual(r.settled[0].overall.map((o) => o.uid), ['b', 'a'], 'a scores nothing for the hurdles');
  assert.ok(r.settled[0].overall[0].total > r.settled[0].overall[1].total);
});
