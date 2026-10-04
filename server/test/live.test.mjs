// Live waiting rooms and rooms (public and Practice), on a fake clock. Run: npm test (from server/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LobbyCore } from '../src/lobbyCore.js';
import { RoomCore } from '../src/roomCore.js';
import { SquadHubCore } from '../src/squadHubCore.js';
import { LIVE_KINDS, MAX_PLAYERS, START_DELAY, CLOSE_BEFORE } from '../../src/online/liveRules.js';

function peer(uid) {
  const p = { uid, name: uid, inbox: [], closed: false, send: (m) => p.inbox.push(m), close: () => (p.closed = true) };
  p.last = (t) => [...p.inbox].reverse().find((m) => m.t === t);
  return p;
}

function lobby() {
  const w = { t: 1_000_000, opened: [], n: 0, changes: 0 };
  w.core = new LobbyCore({ now: () => w.t, newId: () => `room${++w.n}`, openRoom: (id, info) => w.opened.push({ id, info }), changed: () => w.changes++ }, LIVE_KINDS);
  return w;
}

test('lobby: a second player sets the start; back to one calls it off', () => {
  const w = lobby();
  const a = peer('a');
  const b = peer('b');
  w.core.join(a, { kind: 'sprint100', athlete: 'juno' });
  assert.equal(a.last('waiting').startAt, null);
  w.core.join(b, { kind: 'sprint100', athlete: 'chan' });
  const v = b.last('waiting');
  assert.equal(v.startAt, w.t + START_DELAY);
  assert.deepEqual(v.players.map((p) => p.uid), ['a', 'b']);
  assert.equal(a.last('waiting').startAt, v.startAt);
  w.core.leave(b);
  assert.equal(a.last('waiting').startAt, null);
});

test('lobby: closes CLOSE_BEFORE the start and hands its players to a Room; the next player starts a new one', () => {
  const w = lobby();
  const [a, b, c] = ['a', 'b', 'c'].map(peer);
  w.core.join(a, { kind: 'javelin' });
  w.core.join(b, { kind: 'javelin' });
  const { room, startAt } = a.last('waiting');
  w.t = startAt - CLOSE_BEFORE - 1;
  w.core.tick();
  assert.equal(w.opened.length, 0);
  w.t += 1;
  w.core.tick();
  assert.equal(w.opened.length, 1);
  assert.equal(w.opened[0].id, room);
  assert.deepEqual(w.opened[0].info.players.map((p) => p.uid), ['a', 'b']);
  assert.equal(a.last('waiting').closed, true);
  // Leaving now (going to the event) doesn't change anything.
  w.core.leave(a);
  w.core.join(c, { kind: 'javelin' });
  assert.notEqual(c.last('waiting').room, room);
  assert.deepEqual(c.last('waiting').players.map((p) => p.uid), ['c']);
});

test('lobby: a full room keeps its start; the next player gets a new room', () => {
  const w = lobby();
  const ps = Array.from({ length: MAX_PLAYERS + 1 }, (_, i) => peer(`p${i}`));
  ps.slice(0, MAX_PLAYERS).forEach((p) => w.core.join(p, { kind: 'tournament' }));
  const full = ps[0].last('waiting');
  w.core.join(ps[MAX_PLAYERS], { kind: 'tournament' });
  assert.equal(w.opened.length, 1, 'the full room was handed over');
  assert.equal(w.opened[0].info.startAt, full.startAt);
  assert.notEqual(ps[MAX_PLAYERS].last('waiting').room, full.room);
});

test('lobby: one waiting room per socket, the same account once, only known kinds', () => {
  const w = lobby();
  const a = peer('a');
  const a2 = peer('a');
  w.core.join(a, { kind: 'sprint100' });
  w.core.join(a, { kind: 'longjump' });
  assert.equal(w.core.nodes.has('sprint100'), false);
  w.core.join(a2, { kind: 'longjump' });
  assert.equal(w.core.nodes.get('longjump').players.size, 1);
  w.core.join(peer('b'), { kind: 'relay4x100' });
  assert.equal(w.core.nodes.has('relay4x100'), false);
});

function room(players = ['a', 'b']) {
  const w = { t: 1_000_000, ended: 0 };
  w.core = new RoomCore({ now: () => w.t, ended: () => w.ended++ });
  w.core.init({ kind: 'sprint100', startAt: w.t + CLOSE_BEFORE, setLen: 1.5, players: players.map((uid) => ({ uid, name: uid, athlete: 'juno' })) });
  return w;
}

test('room: players only; patches go to the others; a dropped socket is left, and back on reconnect', () => {
  const w = room();
  const [a, b] = ['a', 'b'].map(peer);
  assert.equal(w.core.connect(peer('x')), false);
  assert.equal(w.core.connect(a), true);
  w.core.message(a, { t: 'patch', p: { s: '0-sprint100', 'ready/0-sprint100': 5 } });
  assert.equal(w.core.connect(b), true);
  assert.deepEqual(b.last('docs').docs.a, { s: '0-sprint100', ready: { '0-sprint100': 5 } });
  w.core.message(b, { t: 'patch', p: { n: 3 } });
  assert.deepEqual(a.last('doc'), { t: 'doc', u: 'b', p: { n: 3 } });
  assert.equal(b.inbox.filter((m) => m.t === 'doc').length, 0, 'not echoed back');
  w.core.disconnect(a);
  assert.deepEqual(b.last('doc'), { t: 'doc', u: 'a', p: { left: true } });
  const a2 = peer('a');
  w.core.connect(a2);
  assert.deepEqual(b.last('doc'), { t: 'doc', u: 'a', p: { left: null } });
});

test('room: finished players are not left; no-shows are; an empty room ends', () => {
  const w = room(['a', 'b', 'c']);
  const [a, b] = ['a', 'b'].map(peer);
  w.core.connect(a);
  w.core.connect(b);
  w.core.message(a, { t: 'finished' });
  w.core.disconnect(a);
  assert.equal(b.inbox.some((m) => m.t === 'doc' && m.u === 'a'), false);
  w.t = w.core.info.startAt + 5000;
  w.core.tick();
  assert.deepEqual(b.last('doc'), { t: 'doc', u: 'c', p: { left: true } });
  w.core.disconnect(b);
  w.t += 120000;
  w.core.tick();
  assert.equal(w.ended, 1);
  assert.equal(w.core.connect(peer('a')), false);
});

test('practice: a squad hub runs its waiting rooms and lists them to every Squad tab', async () => {
  const opened = [];
  let t = 1_000_000;
  const hub = new SquadHubCore('sq', {
    now: () => t,
    loadSquad: async () => ({ name: 'Sq', members: { a: 'Ann', b: 'Bo' } }),
    place: async () => null,
    fill: async () => ({ ok: false }),
    save: () => {},
    newId: () => 'practice1',
    openRoom: (id, info) => opened.push({ id, info }),
  });
  const [a, b] = ['a', 'b'].map(peer);
  assert.equal(await hub.connect(a, {}), true);
  assert.equal(await hub.connect(b, {}), true);
  assert.deepEqual(b.last('rooms').rooms, []);
  await hub.message(a, { t: 'join', kind: 'relay4x100', athlete: 'juno', name: 'spoofed' });
  const r = b.last('rooms').rooms;
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, 'relay4x100');
  assert.equal(r[0].host, 'Ann', 'the name comes from the squad, not the phone');
  await hub.message(b, { t: 'join', kind: 'relay4x100' });
  t = a.last('waiting').startAt - CLOSE_BEFORE;
  hub.tick();
  assert.equal(opened.length, 1);
  assert.deepEqual(b.last('rooms').rooms, []);
  assert.equal(await hub.connect(peer('x'), {}), false);
});
