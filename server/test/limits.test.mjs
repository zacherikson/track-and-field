// Request limits (src/limiterCore.js), the audit trail (src/audit.js), and both as /api/ uses
// them. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../src/api.js';
import { LimiterCore, LIMITS } from '../src/limiterCore.js';
import { audit } from '../src/audit.js';
import { RoomCore } from '../src/roomCore.js';
import { getDocs, setDocs, resetToken } from '../src/firestoreAdmin.js';
import { PROJECT, env, fakeGoogle } from './fakeGoogle.mjs';

const base = `projects/${PROJECT}/databases/(default)/documents`;

test('so many a minute and so many an hour, each endpoint on its own', () => {
  const l = new LimiterCore({ mark: { perMinute: 3, perHour: 5 }, shop: { perMinute: 2, perHour: 99 } });
  const t = 10 * 3600000;
  assert.deepEqual([1, 2, 3, 4].map(() => l.hit('mark', t)), [true, true, true, false], 'the fourth in a minute');
  assert.equal(l.hit('shop', t), true, 'another endpoint has its own count');
  assert.equal(l.hit('mark', t + 60000), true, 'a new minute');
  assert.equal(l.hit('mark', t + 60000), true);
  assert.equal(l.hit('mark', t + 120000), false, 'the sixth in the hour, whatever the minute');
  assert.equal(l.hit('mark', t + 3600000), true, 'a new hour');
  assert.equal(l.hit('nothing-limited', t), true);
  assert.equal(l.hit('__proto__', t), true);
  // The real limits: nobody playing gets near them.
  for (const [what, { perMinute, perHour }] of Object.entries(LIMITS)) assert.ok(perMinute >= 12 && perHour >= perMinute, what);
});

function server() {
  resetToken();
  const g = fakeGoogle();
  const o = { fetcher: g.fetcher };
  const limiters = new Map();
  let now = Date.UTC(2026, 10, 12, 12);
  const deps = {
    verify: async (t) => (t.startsWith('u') ? { uid: t, provider: 'google.com' } : null),
    change: () => {},
    getDocs: (e, paths) => getDocs(e, paths, o),
    setDocs: (e, docs) => setDocs(e, docs, o),
    limit: (uid, path) => (limiters.get(uid) ?? limiters.set(uid, new LimiterCore()).get(uid)).hit(path, now),
    audit: { set: (e, docs) => setDocs(e, docs, o), now: () => now },
  };
  const call = async (path, body, token = 'u1') => {
    const res = await handleApi(new Request(`https://x/api/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }), env, path, deps);
    return { status: res.status, ...(await res.json()) };
  };
  const notes = () => [...g.docs].filter(([name]) => name.startsWith(`${base}/audit/`)).map(([, f]) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.stringValue])));
  return { g, call, notes, later: (ms) => (now += ms), o };
}

test('past the limit: 429, for that player and that endpoint only, until the minute turns', async () => {
  const s = server();
  await setDocs(env, [{ path: 'users/u1', data: { name: 'Kai' } }, { path: 'users/u2', data: { name: 'Zed' } }], s.o);
  const post = (token) => s.call('mark', { board: 'tournament', mark: 5000 }, token);
  for (let i = 0; i < LIMITS.mark.perMinute; i++) assert.equal((await post('u1')).status, 200, `call ${i + 1}`);
  const over = await post('u1');
  assert.deepEqual([over.status, over.error], [429, 'slow-down']);
  assert.equal((await post('u2')).status, 200, 'someone else is fine');
  assert.equal((await s.call('progress', {})).status, 200, 'and so is another endpoint');
  s.later(60000);
  assert.equal((await post('u1')).status, 200);
  // The numbers endpoint is never limited (no player to count), and may be kept a while.
  const res = await handleApi(new Request('https://x/api/balance'), env, 'balance', { limit: () => false });
  assert.deepEqual([res.status, res.headers.get('Cache-Control')], [200, 'public, max-age=300']);
});

test('a mark the server turns down is noted: who, what, why', async () => {
  const s = server();
  await setDocs(env, [{ path: 'users/u1', data: { name: 'Kai' } }], s.o);
  await s.call('mark', { board: 'longjump', mark: 14 });
  await s.call('mark', { board: 'sprint100', mark: 9.5 });
  await s.call('mark', { board: 'nope', mark: 1 }); // a wrong board id isn't worth a note
  await s.call('mark', { board: 'longjump', mark: 8.1 }); // nor is a mark that's fine
  assert.deepEqual(s.notes().map((n) => [n.uid, n.kind, n.why]).sort(), [['u1', 'mark', 'bad-ghost'], ['u1', 'mark', 'implausible']]);
  assert.match(s.notes().find((n) => n.why === 'implausible').detail, /^longjump 14: /);
  // A note that can't be written never fails the call it's for.
  const out = await audit(env, { uid: 'u1', kind: 'mark', why: 'x' }, { set: async () => { throw new Error('down'); } });
  assert.equal(out, undefined);
  assert.equal(await audit({}, { uid: 'u1', kind: 'mark', why: 'x' }), undefined, 'no admin access: nothing to write to');
});

test('a live result that doesn\'t count is noted once, however often the room looks', () => {
  let now = 1000;
  const notes = [];
  const core = new RoomCore({ now: () => now, ended: () => {}, settle: () => {}, audit: (n) => notes.push(n) });
  core.init({ kind: 'sprint100', startAt: now, setLen: 1.5, players: [{ uid: 'a' }, { uid: 'b' }], public: true, id: 'room1' });
  const peers = { a: { uid: 'a', send() {}, close() {} }, b: { uid: 'b', send() {}, close() {} } };
  for (const p of Object.values(peers)) core.connect(p);
  now += 2000;
  core.message(peers.a, { t: 'patch', p: { 'res/0-sprint100': { mark: 9.4 } } });
  core.tick();
  core.tick();
  now += 10000;
  core.message(peers.b, { t: 'patch', p: { 'res/0-sprint100': { mark: 10.8 } } });
  assert.deepEqual(notes, [{ uid: 'a', kind: 'live-result', why: 'too soon', detail: 'room1 0-sprint100 9.4' }]);
});
