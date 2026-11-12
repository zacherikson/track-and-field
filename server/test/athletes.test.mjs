// Your athlete, kept by the server (src/athletes.js, /api/athlete): saved less any gear
// you don't have, and used by live rooms in place of what a phone sends.
// Against a fake Firestore. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../src/api.js';
import { saveAthlete, playersAthlete, inOrder, withAthlete } from '../src/athletes.js';
import { changeWallet, readHave, readAthlete, writeAthlete, resetToken } from '../src/firestoreAdmin.js';
import { LobbyCore } from '../src/lobbyCore.js';
import { itemById } from '../../src/economy/items.js';
import { encode, parse, hasGear, randomLook } from '../../src/athletes/custom.js';
import { PROJECT, env, fakeGoogle } from './fakeGoogle.mjs';

const lava = itemById('spikes-lava-01'); // the shop's
const blaze = itemById('spikes-blaze-01'); // a starter item, free at level 4
const base = `projects/${PROJECT}/databases/(default)/documents`;

function setup() {
  resetToken();
  const g = fakeGoogle();
  const o = { fetcher: g.fetcher, now: Date.UTC(2026, 10, 11) };
  const deps = { have: (e, uid) => readHave(e, uid, o), write: (e, uid, code) => writeAthlete(e, uid, code, o), read: (e, uid) => readAthlete(e, uid, o) };
  const own = (uid, id) => changeWallet(env, uid, ({ inventory }) => ({ changes: [], inventory: [...inventory, id] }), o);
  const xp = (uid, amount) => changeWallet(env, uid, { kind: 'grant', currency: 'xp', amount, reason: 'admin', ref: 'xp', day: 1 }, o);
  const api = async (body, token = 'good') => {
    const res = await handleApi(new Request('https://x/api/athlete', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }), env, 'athlete', {
      verify: async (t) => (t === 'good' ? { uid: 'u1', provider: 'google.com' } : t === 'guest' ? { uid: 'g1', provider: 'anonymous' } : null),
      change: () => {},
      athlete: deps,
    });
    return { status: res.status, ...(await res.json()) };
  };
  return { g, deps, own, xp, api };
}

test('saving: kept as sent when it\'s all yours; gear you don\'t have comes off', async () => {
  const s = setup();
  const look = randomLook();
  const worn = encode(look, 'Kai', { spikes: lava.n, socks: 1 });
  const first = await s.api({ code: worn });
  assert.equal(first.status, 200, JSON.stringify(first));
  assert.deepEqual(parse(first.athlete), { look, name: 'Kai', gear: { ...parse(worn).gear, spikes: 0 } }, 'not bought: off; the level 1 socks stay');
  assert.equal(await s.deps.read(env, 'u1'), first.athlete, 'kept in the database');
  assert.ok(s.g.docs.has(`${base}/athletes/u1`));
  await s.own('u1', lava.id);
  assert.equal((await s.api({ code: worn })).athlete, worn, 'bought: all of it');
  // Starter gear by level.
  const starter = encode(look, 'Kai', { spikes: blaze.n });
  assert.equal(hasGear((await s.api({ code: starter })).athlete), false, 'level 1: not yet');
  await s.xp('u1', 1000); // level 4
  assert.equal((await s.api({ code: starter })).athlete, starter);
});

test('saving: guests keep a look and level 1 gear; junk is refused', async () => {
  const s = setup();
  const look = randomLook();
  const g = await s.api({ code: encode(look, 'Guest', { spikes: lava.n, socks: 1 }) }, 'guest');
  assert.deepEqual([g.status, parse(g.athlete).gear.spikes, parse(g.athlete).gear.socks], [200, 0, 1]);
  assert.equal(s.g.log.filter((u) => u.endsWith(':batchGet')).length, 0, 'a guest has nothing to read');
  for (const code of ['juno', '', null, 12, '~1', `~1${'z'.repeat(40)}`]) assert.deepEqual([(await s.api({ code })).status, (await s.api({ code })).error], [400, 'bad-athlete'], String(code));
  assert.equal((await s.api({ code: encode(look, 'Kai') }, 'nope')).status, 401);
  assert.equal(await saveAthlete(env, 'u1', 'juno', {}, s.deps), null);
});

test('the athlete a player plays as: the one kept, whatever the phone sends', async () => {
  const s = setup();
  const look = randomLook();
  const forged = encode(randomLook(), 'Kai', { spikes: lava.n });
  // Nothing kept yet: what was sent, gear off.
  const bare = await playersAthlete(env, 'u1', forged, s.deps);
  assert.equal(hasGear(bare), false);
  assert.deepEqual(parse(bare).look, parse(forged).look);
  assert.equal(await playersAthlete(env, 'u1', 'juno', s.deps), 'juno', 'one of the cast: as it is');
  assert.equal(await playersAthlete(env, 'u1', undefined, s.deps), '');
  // Kept: that one, not the forgery.
  const kept = await saveAthlete(env, 'u1', encode(look, 'Kai', { socks: 1 }), {}, s.deps);
  assert.equal(await playersAthlete(env, 'u1', forged, s.deps), kept);
  // The database out of reach: what was sent, gear off. No admin access (local dev): as sent.
  assert.equal(hasGear(await playersAthlete(env, 'u1', forged, { read: async () => { throw new Error('down'); } })), false);
  assert.equal(await playersAthlete({}, 'u1', forged), forged);
});

test('a live waiting room shows the kept athlete; a peer\'s messages stay in order while one waits', async () => {
  const s = setup();
  const kept = await saveAthlete(env, 'u1', encode(randomLook(), 'Kai', { socks: 1 }), {}, s.deps);
  const forged = encode(randomLook(), 'Kai', { spikes: lava.n });
  const core = new LobbyCore({ now: () => 0, newId: () => 'room1', openRoom: () => {}, changed: () => {} }, new Set(['sprint100']));
  const sent = [];
  const peer = { uid: 'u1', name: 'Kai', send: (m) => sent.push(m) };
  // Join (waits on the database), then leave at once: the leave must come after the join.
  const slow = { read: async (e, uid) => (await new Promise((r) => setTimeout(r, 20)), s.deps.read(e, uid)) };
  inOrder(peer, async () => core.join(peer, await withAthlete(env, peer, { t: 'join', kind: 'sprint100', name: 'Kai', athlete: forged }, slow)));
  inOrder(peer, () => sent.push('seen'));
  await inOrder(peer, () => {});
  assert.equal(sent[0].players[0].athlete, kept, 'the room never sees the forgery');
  assert.equal(sent[1], 'seen', 'after the join');
  await inOrder(peer, () => core.leave(peer));
  assert.equal(core.rooms().length, 0);
  // A message with no athlete isn't touched; one that throws doesn't stop the next.
  assert.deepEqual(await withAthlete(env, peer, { t: 'ready' }, s.deps), { t: 'ready' });
  const err = console.error;
  console.error = () => {};
  inOrder(peer, () => {
    throw new Error('boom');
  });
  let ran = false;
  await inOrder(peer, () => (ran = true));
  console.error = err;
  assert.equal(ran, true);
});
