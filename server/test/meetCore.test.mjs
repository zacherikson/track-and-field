// The meet's rules, run on a fake clock. Run: npm test (from server/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeetCore } from '../src/meetCore.js';
import { MatchmakerCore } from '../src/matchmakerCore.js';
import { SquadHubCore } from '../src/squadHubCore.js';
import { CONFIG } from '../../src/config.js';

const M = CONFIG.meet;

function world() {
  const w = { t: 1_000_000, released: [], updates: [] };
  w.io = { now: () => w.t, released: (k, why) => w.released.push([k, why]), update: (info) => w.updates.push(info) };
  w.meet = new MeetCore('m1', w.io, mulberry(1));
  w.peers = new Map();
  w.peer = (uid) => {
    const p = { uid, inbox: [], closed: false, send: (m) => p.inbox.push(m), close: () => (p.closed = true) };
    w.peers.set(uid, p);
    return p;
  };
  w.last = (uid, t) => [...w.peers.get(uid).inbox].reverse().find((m) => m.t === t);
  w.advance = (ms) => {
    const end = w.t + ms;
    while (w.t < end) {
      w.t = Math.min(end, w.t + 100);
      w.meet.tick();
    }
  };
  return w;
}

/** Squad `k` with four members, all connected. */
function addSquad(w, k) {
  const roster = [1, 2, 3, 4].map((i) => ({ uid: `${k}${i}`, name: `${k}${i}`, athlete: 'juno', pbs: { sprint100: 10 + i } }));
  assert.equal(w.meet.addSquad({ key: k, name: `Squad ${k}`, roster }).ok, true);
  for (const m of roster) assert.equal(w.meet.connect(w.peer(m.uid)), true);
  return roster.map((m) => m.uid);
}

const captain = (w, k) => w.meet.squads.get(k).captain;
const readyAll = (w) => {
  for (const k of w.meet.squads.keys()) w.meet.message(captain(w, k), { t: 'ready' });
};

test('lobby: a captain per squad; only the captain can press Ready, and only with four', () => {
  const w = world();
  addSquad(w, 'A');
  addSquad(w, 'B');
  const cap = captain(w, 'A');
  assert.ok(['A1', 'A2', 'A3', 'A4'].includes(cap));
  const other = ['A1', 'A2', 'A3', 'A4'].find((u) => u !== cap);
  w.meet.message(other, { t: 'ready' });
  assert.equal(w.meet.squads.get('A').ready, false);
  w.meet.message(cap, { t: 'ready' });
  assert.equal(w.meet.squads.get('A').ready, true);
  // Someone leaves: short of four, not ready.
  w.meet.message(other, { t: 'leave' });
  assert.equal(w.meet.squads.get('A').ready, false);
  w.meet.message(captain(w, 'A'), { t: 'ready' });
  assert.equal(w.meet.squads.get('A').ready, false);
});

test('lobby: start early needs every captain, and locks the meet with the squads there', () => {
  const w = world();
  ['A', 'B', 'C'].forEach((k) => addSquad(w, k));
  w.meet.message(captain(w, 'A'), { t: 'startEarly' }); // not everyone's ready yet: ignored
  assert.equal(w.meet.squads.get('A').vote, false);
  readyAll(w);
  assert.equal(w.last('A1', 'lobby').canStartEarly, true);
  w.meet.message(captain(w, 'A'), { t: 'startEarly' });
  w.meet.message(captain(w, 'B'), { t: 'startEarly' });
  assert.equal(w.meet.phase, 'lobby');
  assert.equal(w.meet.info().open, false, 'closed to new squads while voting');
  assert.equal(w.meet.addSquad({ key: 'D', name: 'D', roster: [] }).ok, false);
  w.meet.message(captain(w, 'C'), { t: 'startEarly' });
  assert.equal(w.meet.phase, 'running');
  assert.deepEqual([...w.meet.squads.values()].map((s) => s.lane).sort(), [1, 2, 3]);
});

test('lobby: six squads all ready lock at once', () => {
  const w = world();
  ['A', 'B', 'C', 'D', 'E', 'F'].forEach((k) => addSquad(w, k));
  assert.equal(w.meet.addSquad({ key: 'G', name: 'G', roster: [] }).ok, false);
  readyAll(w);
  assert.equal(w.meet.phase, 'running');
});

test('lobby: an unanimous-less vote clears after voteWait, and a squad joining clears votes', () => {
  const w = world();
  ['A', 'B'].forEach((k) => addSquad(w, k));
  readyAll(w);
  w.meet.message(captain(w, 'A'), { t: 'startEarly' });
  w.advance((M.lobby.voteWait + 1) * 1000);
  assert.equal(w.meet.squads.get('A').vote, false);
  assert.equal(w.meet.info().open, true);
  w.meet.message(captain(w, 'A'), { t: 'startEarly' });
  w.meet.message(captain(w, 'A'), { t: 'unready' });
  assert.equal(w.meet.voteSince, null);
});

test('lobby: an idle squad is sent back once the others are ready', () => {
  const w = world();
  ['A', 'B', 'C'].forEach((k) => addSquad(w, k));
  w.meet.message(captain(w, 'A'), { t: 'ready' });
  w.meet.message(captain(w, 'B'), { t: 'ready' });
  w.advance((M.lobby.readyWait + 1) * 1000);
  assert.equal(w.meet.squads.has('C'), false);
  assert.deepEqual(w.released, [['C', 'idle']]);
  assert.equal(w.last('C1', 'withdrawn').why, 'idle');
});

test('lobby: a squad short of four too long is sent back; a phone that never connects is dropped', () => {
  const w = world();
  addSquad(w, 'A');
  w.meet.addSquad({ key: 'B', name: 'B', roster: [1, 2, 3, 4].map((i) => ({ uid: `B${i}`, name: `B${i}` })) });
  ['B1', 'B2', 'B3'].forEach((u) => w.meet.connect(w.peer(u))); // B4 never turns up
  w.advance((M.reconnect + 1) * 1000);
  assert.deepEqual(w.meet.squads.get('B').roster, ['B1', 'B2', 'B3']);
  w.advance(M.lobby.shortWait * 1000);
  assert.equal(w.meet.squads.has('B'), false);
});

test('meet: heats, results across heats, the schedule moving on when everyone is in', () => {
  const w = world();
  ['A', 'B', 'C'].forEach((k) => addSquad(w, k));
  readyAll(w);
  ['A', 'B', 'C'].forEach((k) => w.meet.message(captain(w, k), { t: 'startEarly' }));
  const ev = w.last('A1', 'event');
  assert.equal(ev.event, 'sprint100');
  assert.equal(ev.heats.length, 4);
  assert.deepEqual(ev.heats[3].sort(), ['A1', 'B1', 'C1']); // best PBs in the fast heat
  const first = w.meet.stages[0];
  assert.equal(first.start, w.t + (M.countdown + M.titleCard) * 1000);
  // A patch reaches the heat, and only the heat.
  w.advance(first.start - w.t - 2000);
  w.meet.message('A1', { t: 'patch', p: { s: '0-sprint100', 'f/0': 'x' } });
  assert.equal(w.last('B1', 'doc').u, 'A1');
  assert.equal(w.last('B2', 'doc'), undefined);
  w.advance(3000);
  // Everyone's time in: 12 athletes, A's fastest.
  let i = 0;
  for (const k of ['A', 'B', 'C']) for (const n of [1, 2, 3, 4]) w.meet.message(`${k}${n}`, { t: 'patch', p: { 'res/0-sprint100': { mark: 10 + i++ * 0.1 } } });
  w.advance(200);
  const res = w.last('A1', 'results');
  assert.equal(res.event, 'sprint100');
  assert.equal(res.ranked[0].id, 'A1');
  assert.equal(res.ranked[0].pts, 10);
  assert.equal(res.standings[0].squad, 'A');
  assert.equal(res.standings[0].total, 10 + 8 + 6 + 5);
  // The long jump starts eventGap after the last result.
  const lj = w.meet.stages.find((s) => s.key === '1-longjump-1');
  assert.equal(lj.start, res.at + M.eventGap * 1000);
});

test('meet: a cutoff ends a stage without the stragglers (DNF), and a dropped phone is not waited on', () => {
  const w = world();
  ['A', 'B'].forEach((k) => addSquad(w, k));
  readyAll(w);
  ['A', 'B'].forEach((k) => w.meet.message(captain(w, k), { t: 'startEarly' }));
  const st = w.meet.stages[0];
  w.advance(st.start - w.t + 100);
  w.meet.message('A1', { t: 'patch', p: { 'res/0-sprint100': { mark: 11 } } });
  w.meet.disconnect(w.peers.get('B4'));
  assert.equal(w.last('B3', 'doc')?.u === 'B4' || w.last('A4', 'doc')?.p?.left === true, true);
  w.advance(st.cutoff - w.t + 200);
  const res = w.last('A1', 'results');
  assert.equal(res.ranked.filter((r) => r.place != null).length, 1);
  assert.equal(res.ranked.find((r) => r.id === 'B4').pts, 0);
});

test('meet: field rounds, each its own stage; a full meet runs to the final standings', () => {
  const w = world();
  ['A', 'B'].forEach((k) => addSquad(w, k));
  readyAll(w);
  ['A', 'B'].forEach((k) => w.meet.message(captain(w, k), { t: 'startEarly' }));
  const uids = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'];
  let guard = 0;
  while (w.meet.phase === 'running' && guard++ < 50) {
    const st = w.meet.stage;
    w.advance(Math.max(0, st.start - w.t) + 500);
    const ev = w.meet.events[st.index];
    if (ev.event === 'relay4x100') {
      for (const [k, legs] of Object.entries(ev.legs)) w.meet.message(legs[3], { t: 'patch', p: { [`res/${st.key}`]: { mark: k === 'A' ? 40 : 42 } } });
    } else {
      for (const u of uids) w.meet.message(u, { t: 'patch', p: { [`res/${st.key}`]: st.round === 2 && u === 'B1' ? { foul: true } : { mark: (u.startsWith('A') ? 1 : 0.5) + st.round + Number(u[1]) / 10 + (st.event === 'sprint100' || st.event === 'hurdles110' ? 9 : 0) } } });
    }
    w.advance(200);
  }
  assert.equal(w.meet.phase, 'done');
  const fin = w.last('A1', 'final');
  assert.equal(fin.standings.length, 2);
  // The relay: A won it (10), B second (8).
  const relay = w.meet.events[5].ranked;
  assert.deepEqual(relay.map((r) => [r.id, r.pts]), [
    ['A', 10],
    ['B', 8],
  ]);
  assert.deepEqual(w.released.map((r) => r[1]), ['done', 'done']);
  w.advance((M.podium + 1) * 1000);
  assert.equal(w.meet.phase, 'closed');
});

test('relay: legs from who is there, a dropped runner run by a teammate', () => {
  const w = world();
  ['A', 'B'].forEach((k) => addSquad(w, k));
  readyAll(w);
  ['A', 'B'].forEach((k) => w.meet.message(captain(w, k), { t: 'startEarly' }));
  // Skip to the relay: B3 has gone by then.
  w.meet.disconnect(w.peers.get('B3'));
  let guard = 0;
  while (w.meet.current < 5 && guard++ < 50) {
    const st = w.meet.stage;
    w.advance(Math.max(0, st.cutoff - w.t) + 200);
  }
  const ev = w.meet.events[5];
  assert.equal(new Set(ev.legs.A).size, 4);
  assert.equal(new Set(ev.legs.B).size, 3);
  assert.ok(!ev.legs.B.includes('B3'));
  const runner = ev.legs.A[1];
  w.meet.disconnect(w.peers.get(runner));
  const proxy = ev.proxies[runner];
  assert.ok(proxy && proxy !== runner && ev.legs.A.includes(proxy));
  assert.equal(w.last('A1' === runner ? 'A2' : 'A1', 'proxies').proxies[runner], proxy);
  // Only the anchor's phone (or whoever runs it now) gives the team's time.
  const st = w.meet.stage;
  w.advance(Math.max(0, st.start - w.t) + 100);
  const notAnchor = ev.legs.A.find((u) => u !== ev.legs.A[3] && u !== runner);
  w.meet.message(notAnchor, { t: 'patch', p: { [`res/${st.key}`]: { mark: 30 } } });
  assert.equal(st.results.has('A'), notAnchor === ev.legs.A[3]);
});

test('matchmaker: oldest lobby with room first, then a new one', () => {
  let n = 0;
  let t = 0;
  const mm = new MatchmakerCore({ now: () => t, newId: () => `L${++n}` });
  assert.equal(mm.place('a'), 'L1');
  t = 10;
  assert.equal(mm.place('b'), 'L1');
  mm.update({ id: 'L1', phase: 'lobby', open: false, squads: [{ key: 'a' }, { key: 'b' }] });
  assert.equal(mm.place('c'), 'L2');
  assert.equal(mm.place('d', ['L2']), 'L3');
  mm.update({ id: 'L2', phase: 'running', squads: [{ key: 'c' }] });
  assert.equal(mm.lobbies.has('L2'), false);
});

test('squad hub: the first four sign up and go to a meet; a later one fills an open place', async () => {
  let t = 0;
  const placed = [];
  const fills = [];
  const hub = new SquadHubCore('wolves', {
    now: () => t,
    loadSquad: async () => ({ name: 'Wolves', members: Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((u) => [u, u.toUpperCase()])) }),
    place: async (squad) => (placed.push(squad), 'meet1'),
    fill: async (id, m) => (fills.push([id, m.uid]), { ok: true }),
    save: () => {},
  });
  const peers = {};
  for (const u of ['a', 'b', 'c', 'd', 'e', 'x']) {
    const p = { uid: u, inbox: [], send: (m) => p.inbox.push(m), close: () => {} };
    peers[u] = p;
    const ok = await hub.connect(p, {});
    assert.equal(ok, u !== 'x', `${u} in the squad`);
  }
  for (const u of ['a', 'b', 'c']) await hub.message(peers[u], { t: 'signup', athlete: 'juno' });
  assert.equal(hub.forming.length, 3);
  await hub.message(peers.d, { t: 'signup' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(placed.length, 1);
  assert.deepEqual(placed[0].roster.map((m) => m.uid), ['a', 'b', 'c', 'd']);
  assert.equal(peers.a.inbox.find((m) => m.t === 'goto').meet, 'meet1');
  // Full: e is told so. Then someone leaves the lobby and e fills the place.
  await hub.message(peers.e, { t: 'signup' });
  assert.equal(peers.e.inbox.at(-1).t, 'busy');
  hub.meetUpdate({ id: 'meet1', phase: 'lobby', squads: [{ key: 'wolves', uids: ['a', 'b', 'c'], names: ['A', 'B', 'C'], open: 1 }] });
  await hub.message(peers.e, { t: 'signup' });
  assert.deepEqual(fills, [['meet1', 'e']]);
  assert.equal(peers.e.inbox.at(-1).t, 'goto');
  // The meet's over: the squad can sign up again.
  hub.released('meet1');
  assert.equal(hub.meet, null);
});

/** A small seeded random, so the tests always draw the same. */
function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
