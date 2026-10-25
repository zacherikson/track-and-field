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
