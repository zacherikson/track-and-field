// Marks for the online boards (src/marks.js, /api/mark): plausibility, the 100m replayed
// from its inputs, recordings, renames. Against a fake Firestore. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../src/api.js';
import { BOARDS, checkMark, checkRun, replayRun, roundMark } from '../src/marks.js';
import { getDocs, setDocs, writeAthlete, readAthlete, resetToken } from '../src/firestoreAdmin.js';
import { CONFIG } from '../../src/config.js';
import { Runner } from '../../src/athletes/runner.js';
import { StrideTargets } from '../../src/events/strideTargets.js';
import { GhostRecorder } from '../../src/online/ghost.js';
import { encode, randomLook } from '../../src/athletes/custom.js';
import { env, fakeGoogle } from './fakeGoogle.mjs';

const STEP = CONFIG.loop.fixedStep;
const cfg = CONFIG.sprint100;
const prompt = cfg.dipPromptDistance ?? CONFIG.dip.promptDistance;

/** A 100m as the game runs it (tools/ghostcheck.mjs), tapping every `gap` s: its recording, with its time as the mark. */
function run(gap = 0.2, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647), s / 2147483647);
  const r = new Runner(undefined, undefined, cfg.startX);
  const judge = new StrideTargets(r, cfg.targets);
  const rec = new GhostRecorder(r, { step: STEP, distance: cfg.distance, startX: cfg.startX, prompt });
  let t = Math.round((3 + rnd() * 5) / STEP) * STEP;
  const goT = t + rnd() * 2;
  while (t + STEP < goT) t += STEP;
  let nextPress = goT + 0.2;
  let n = 0;
  let mark = null;
  let leaned = false;
  for (; t - goT < 30 && mark == null; t += STEP, n++) {
    if (n === 0) {
      r.go(goT);
      judge.start(goT);
      rec.start(goT, t - goT);
    }
    rec.n = n;
    while (nextPress < t + STEP) {
      if (r.mode === 'run') judge.press(rnd() < 0.04 ? (judge.target === 'L' ? 'R' : 'L') : judge.target, nextPress - rnd() * 0.01);
      else if (r.mode === 'carry' && !leaned && cfg.distance - r.x <= 2) leaned = r.lean();
      nextPress += gap * (0.9 + rnd() * 0.2);
    }
    if (cfg.distance - r.x <= prompt && r.mode === 'run' && !r.dipUsed) r.carry();
    r.update(STEP, t);
    const cross = r.crossing(cfg.distance, t, STEP);
    if (cross != null) mark = cross - goT;
  }
  return rec.data(roundMark(BOARDS.sprint100, mark));
}
const code = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.code;
  }
  return null;
};

test('the 100m is run again from its inputs: an honest run comes to its own time', () => {
  for (const [gap, seed] of [[0.2, 1], [0.26, 7], [0.18, 42]]) {
    const g = run(gap, seed);
    assert.equal(replayRun(g).mark, g.mark, `tapping every ${gap}s`);
    const kept = checkMark('sprint100', g.mark, g);
    assert.equal(kept.mark, g.mark);
    assert.deepEqual(kept.ghost.runner, CONFIG.runner, 'kept with the server\'s physics');
  }
});

test('a 100m that lies is caught: a better time claimed, faster physics sent along, inputs no phone made', () => {
  const g = run();
  assert.equal(code(() => checkMark('sprint100', roundMark(BOARDS.sprint100, g.mark - 0.3), g)), 'replay', 'the time is what the inputs run to');
  const souped = { ...g, runner: { ...g.runner, maxSpeed: 99, accelMax: 99 }, distance: 10 };
  assert.equal(replayRun(souped).mark, g.mark, 'the phone\'s physics numbers and distance are ignored');
  const ev = (change) => {
    const e = [...g.ev];
    change(e);
    return { ...g, ev: e };
  };
  const stride = g.ev.findIndex((x, i) => i % 4 === 2 && x === 0) - 2;
  assert.equal(code(() => checkRun(ev((e) => (e[stride + 1] += 5)))), 'bad-ghost', 'a stride timed outside its step');
  assert.equal(code(() => checkRun(ev((e) => (e[e.length - 4] = 0)))), 'bad-ghost', 'steps out of order');
  assert.equal(code(() => checkRun(ev((e) => e.push(e.at(-4), e.at(-3), 1, -50)))), 'bad-ghost', 'a stumble that speeds you up');
  assert.equal(code(() => checkRun(ev((e) => e.push(e.at(-4), e.at(-3), 9, 0)))), 'bad-ghost', 'an unknown input');
  assert.equal(code(() => checkRun({ ...g, off: 0.5 })), 'bad-ghost');
  assert.equal(code(() => checkRun({ ...g, v: 99 })), 'bad-ghost');
  assert.equal(code(() => checkMark('sprint100', g.mark, null)), 'bad-ghost', 'no recording, no 100m mark');
  assert.equal(code(() => replayRun({ ...g, ev: [] })), 'bad-ghost', 'never finishes');
});

test('every board: a mark shaped right and inside what\'s possible', () => {
  assert.equal(checkMark('longjump', 8.12).mark, 8.12);
  assert.equal(checkMark('tournament', 5200).traced, false);
  assert.equal(code(() => checkMark('longjump', 8.123)), 'bad-mark', 'to the hundredth');
  assert.equal(code(() => checkMark('tournament', 5200.5)), 'bad-mark', 'whole points');
  assert.equal(code(() => checkMark('longjump', '8.12')), 'bad-mark');
  assert.equal(code(() => checkMark('longjump', NaN)), 'bad-mark');
  for (const [id, m] of [['longjump', 14], ['polevault', 8.5], ['javelin', 140], ['hurdles110', 9], ['tournament', 9000], ['longjump', 0], ['sprint100', 6.5]]) assert.equal(code(() => checkMark(id, m)), 'implausible', `${id} ${m}`);
  for (const id of ['teamtournament', 'nope', '__proto__', null]) assert.equal(code(() => checkMark(id, 1)), 'bad-board', String(id));
  // The simulator's perfect player, and the boards' best marks so far, all pass.
  for (const [id, m] of [['hurdles110', 11.25], ['longjump', 10.53], ['polevault', 6.5], ['javelin', 100.5], ['tournament', 6008]]) assert.equal(checkMark(id, m).mark, m);
});

test('a frame-by-frame recording: its event, its mark, frames as text', () => {
  const t = { v: 1, kind: 'trace', ev: 'longjump', mark: 8.12, props: 0, athlete: '~2forged', f: '0,1.5,-2e-3,4' };
  assert.deepEqual(checkMark('longjump', 8.12, t), { board: BOARDS.longjump, mark: 8.12, traced: true, ghost: { v: 1, kind: 'trace', ev: 'longjump', mark: 8.12, athlete: null, props: 0, f: t.f } });
  for (const bad of [{ ...t, ev: 'javelin' }, { ...t, mark: 9 }, { ...t, f: [0, 1] }, { ...t, f: '1,2;drop' }, { ...t, f: 'x'.repeat(200001) }, { ...t, props: -1 }, { ...t, kind: 'run' }]) assert.equal(code(() => checkMark('longjump', 8.12, bad)), 'bad-ghost');
});

function server() {
  resetToken();
  const g = fakeGoogle();
  const o = { fetcher: g.fetcher };
  const deps = {
    verify: async (t) => (t === 'good' ? { uid: 'u1', provider: 'google.com' } : t === 'guest' ? { uid: 'g1', provider: 'anonymous' } : null),
    change: () => {},
    getDocs: (e, paths) => getDocs(e, paths, o),
    setDocs: (e, docs) => setDocs(e, docs, o),
    athlete: { read: (e, uid) => readAthlete(e, uid, o) },
  };
  const call = async (body, token = 'good') => {
    const res = await handleApi(new Request('https://x/api/mark', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }), env, 'mark', deps);
    return { status: res.status, ...(await res.json()) };
  };
  const name = (n) => setDocs(env, [{ path: 'users/u1', data: { name: n, key: n.toLowerCase() } }], o);
  const read = (path) => getDocs(env, [path], o).then((d) => d[0]);
  return { g, call, name, read, o };
}

test('posting: on the board under your username if it beats yours; the 100m with its replayed run', async () => {
  const s = server();
  const g = run();
  assert.deepEqual([(await s.call({ board: 'sprint100', mark: g.mark, ghost: g })).error], ['no-name'], 'a username first');
  await s.name('Kai');
  const kept = encode(randomLook(), 'Kai');
  await writeAthlete(env, 'u1', kept, s.o);
  const r = await s.call({ board: 'sprint100', mark: g.mark, ghost: { ...g, athlete: '~2forged' } });
  assert.deepEqual([r.status, r.improved, r.best], [200, true, g.mark]);
  const doc = await s.read('leaderboards/sprint100/runs/u1');
  assert.deepEqual([doc.name, doc.mark, doc.v, doc.ghost.mark, doc.ghost.athlete, doc.ghost.ev.length], ['Kai', g.mark, 1, g.mark, kept, g.ev.length]);
  // A slower one doesn't replace it; a faster one does.
  const slow = run(0.3, 5);
  assert.ok(slow.mark > g.mark);
  assert.deepEqual(await s.call({ board: 'sprint100', mark: slow.mark, ghost: slow }).then((x) => [x.improved, x.best]), [false, g.mark]);
  const fast = run(0.17, 9);
  assert.ok(fast.mark < g.mark);
  assert.equal((await s.call({ board: 'sprint100', mark: fast.mark, ghost: fast })).improved, true);
  assert.equal((await s.read('leaderboards/sprint100/runs/u1')).mark, fast.mark);
});

test('posting: a field event with its recording, points with none; refusals leave the board alone', async () => {
  const s = server();
  await s.name('Kai');
  const trace = { v: 1, kind: 'trace', ev: 'javelin', mark: 84.7, props: 3, f: '0,1,2,3' };
  assert.equal((await s.call({ board: 'javelin', mark: 84.7, ghost: trace })).improved, true);
  assert.deepEqual(await s.read('leaderboards/javelin/runs/u1').then((d) => [d.mark, d.traced, 'ghost' in d]), [84.7, true, false]);
  assert.deepEqual(await s.read('ghosts/javelin/runs/u1').then((d) => [d.mark, d.ghost.f, d.ghost.ev]), [84.7, '0,1,2,3', 'javelin']);
  assert.equal((await s.call({ board: 'javelin', mark: 80 })).improved, false, 'higher is better');
  assert.equal((await s.call({ board: 'tournament', mark: 5100 })).improved, true);
  for (const [body, status, error] of [
    [{ board: 'javelin', mark: 140 }, 409, 'implausible'],
    [{ board: 'javelin', mark: 90.123 }, 409, 'bad-mark'],
    [{ board: 'javelin', mark: 90, ghost: { ...trace, mark: 84.7 } }, 409, 'bad-ghost'],
    [{ board: 'nope', mark: 1 }, 400, 'bad-board'],
    [{ board: 'sprint100', mark: roundMark(BOARDS.sprint100, run().mark - 0.3), ghost: run() }, 409, 'replay'],
  ]) {
    const r = await s.call(body);
    assert.deepEqual([r.status, r.error], [status, error], JSON.stringify(body).slice(0, 60));
  }
  assert.equal((await s.read('leaderboards/javelin/runs/u1')).mark, 84.7);
  assert.equal((await s.call({ board: 'tournament', mark: 5100 }, 'guest')).status, 403, 'the boards need an account');
});

test('rename: your username, as it is now, on all your entries and nothing else of them', async () => {
  const s = server();
  await s.name('Kai');
  await s.call({ board: 'tournament', mark: 5100 });
  await s.call({ board: 'longjump', mark: 8.12 });
  await s.name('Kairos');
  assert.deepEqual(await s.call({ action: 'rename' }), { status: 200, renamed: 2 });
  assert.deepEqual(await s.read('leaderboards/tournament/runs/u1').then((d) => [d.name, d.mark, d.v]), ['Kairos', 5100, 1]);
  assert.equal((await s.call({ action: 'rename' })).renamed, 0, 'already right');
});
