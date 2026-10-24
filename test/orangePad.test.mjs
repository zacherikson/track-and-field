// The orange pads take holds as reliably as taps, and blink 0.60 s / 0.30 s.
// The real scenes (long jump, pole vault, javelin, 100m, hurdles) driven
// through the real Input by synthetic touches and keys (test/helpers/rig.mjs).
// Numbered as the test cases in /workspace/specs/orange-pad-fix-v1.md §5;
// times are seconds from the orange pads appearing.
// Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEP, LX, RX, down, up, cancel, key, keyup, both, countingCtx } from './helpers/rig.mjs';
import * as S from './helpers/scenes.mjs';
import { run100, runUpLJ } from './helpers/strideRuns.mjs';
import { CONFIG } from '../src/config.js';
import { blinkLit } from '../src/render/pads.js';
import { releaseTarget, releaseQuality, pressQuality } from '../src/events/poleVaultRules.js';
import { BrawlControls } from '../src/brawl/controls.js';
import { seededRandom } from '../src/core/random.js';
import { replayMark } from '../src/online/ghost.js';

const near = (a, b, tol = 1e-6, msg) => assert.ok(a != null && Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);
/** Within the step that handles time b (gates are checked once per step). */
const inStep = (a, b, msg) => assert.ok(a != null && a >= b - STEP - 1e-9 && a <= b + STEP + 1e-9, `${msg ?? ''} ${a} vs ${b}`);
/** With `patch` applied to CONFIG section `obj` for the duration of fn. */
function withConfig(obj, patch, fn) {
  const old = Object.fromEntries(Object.keys(patch).map((k) => [k, obj[k]]));
  Object.assign(obj, patch);
  try {
    fn();
  } finally {
    Object.assign(obj, old);
  }
}
const HOLDS = [['snap tap', 0.08], ['0.5 s hold', 0.5], ['2 s hold', 2]];

// ---------------------------------------------------------------- long jump takeoff

/** Takeoff time from the pads appearing, or null. */
function ljTakeoff(schedule, o) {
  const { sc, rig, z } = S.longJump(o);
  schedule(rig, z);
  rig.runTo(z + 3);
  return { t: sc.jump ? sc.jump.t0 - z : null, sc };
}

test('#1 #2 long jump: a snap tap and a 0.5 s or 2 s hold take off at the second thumb', () => {
  for (const [name, hold] of HOLDS) near(ljTakeoff((rig, z) => both(rig, z + 0.5, hold)).t, 0.51, 1e-6, name);
});

test('#3 long jump: held, thumbs 0.12 s and 0.40 s apart: takeoff at the later press', () => {
  for (const gap of [0.12, 0.4]) near(ljTakeoff((rig, z) => both(rig, z + 0.5, 2, { gap })).t, 0.5 + gap, 1e-6, `gap ${gap}`);
});

test('#4 long jump: left thumb still down from the last stride, right pressed at 0.6: takeoff at 0.6', () => {
  const r = ljTakeoff((rig, z) => rig.at(z + 0.6, down(2, RX)).at(z + 2.6, up(1, LX), up(2, RX)), { before: (rig) => rig.at(rig.time + 0.005, down(1, LX)) });
  near(r.t, 0.6);
});

test('#5 long jump: both thumbs down before the pads lit, never pressed again: no takeoff, overrun foul', () => {
  const r = ljTakeoff(() => {}, { before: (rig) => rig.at(rig.time + 0.005, down(1, LX)).at(rig.time + 0.01, down(2, RX)) });
  assert.equal(r.t, null);
  assert.deepEqual(r.sc.mark, { foul: true });
});

// ---------------------------------------------------------------- long jump stretch

/** Take off with a snap tap at 0.5 (L id 1, R id 2, both still down), then `after(rig, apexT)`; returns the jump. */
function ljStretch(after) {
  const { sc, rig, z } = S.longJump();
  both(rig, z + 0.5, null);
  rig.runUntil(() => sc.jump != null, 2);
  after(rig, sc.jump.apexT);
  rig.runUntil(() => sc.state === 'landed', 5);
  return sc.jump;
}

test('#6 long jump stretch: released after takeoff, pressed again after the top: stretch at the press', () => {
  const j = ljStretch((rig, apex) => {
    rig.at(apex - 0.3, up(1, LX), up(2, RX));
    both(rig, apex + 0.05, 0.08, { id: 3 });
  });
  near(j.stretchT, j.apexT + 0.06);
  assert.ok(!j.path.collapse);
});

test('#7 long jump stretch: one thumb held since takeoff, the other pressed near or after the top', () => {
  const press = (dt) =>
    ljStretch((rig, apex) => {
      rig.at(apex - 0.3, up(2, RX)); // right lifts; left stays down from the takeoff
      rig.at(apex + dt, down(3, RX)).at(apex + dt + 0.5, up(3, RX), up(1, LX));
    });
  let j = press(-0.1); // within stretch.grace (0.12) before the top: stretch right at the top
  near(j.stretchT, j.apexT);
  j = press(0.1); // after the top: at the press
  near(j.stretchT, j.apexT + 0.1);
  j = press(-0.25); // too early, held through the top: no stretch (crumple)
  assert.equal(j.stretchT, null);
  assert.ok(j.path.collapse);
});

test('#8 long jump stretch: both thumbs held all the way from takeoff: no stretch (stretch.holdThrough false)', () => {
  assert.equal(CONFIG.longJump.stretch.holdThrough, false);
  let j = ljStretch(() => {});
  assert.equal(j.stretchT, null);
  assert.ok(j.path.collapse);
  // Flipped: stretch at the top, at holdThroughK of the kick.
  withConfig(CONFIG.longJump.stretch, { holdThrough: true }, () => {
    j = ljStretch(() => {});
  });
  near(j.stretchT, j.apexT);
  near(j.stretchK, CONFIG.longJump.stretch.holdThroughK);
});

// ---------------------------------------------------------------- finish lean

const RACES = [['100m', S.sprint100], ['hurdles', S.hurdles110]];
/** Lean time from the lean pads appearing (the step it happened in), or null. */
function leanAt(race, schedule, o) {
  const { rig, z, lean } = race(o);
  schedule(rig, z);
  rig.runTo(z + 1.2);
  return lean.t == null ? null : lean.t - z;
}

test('#9 lean: a snap tap at 0.5 leans at 0.51', () => {
  for (const [name, race] of RACES) inStep(leanAt(race, (rig, z) => both(rig, z + 0.5, 0.08)), 0.51, name);
});

test('#10 lean: both pressed at 0.1 (as the pads light) and held 2 s: lean at 0.30 (armDelay)', () => {
  for (const [name, race] of RACES) {
    const t = leanAt(race, (rig, z) => both(rig, z + 0.1, 2));
    assert.ok(t >= CONFIG.dip.armDelay - 1e-9 && t <= CONFIG.dip.armDelay + STEP + 1e-9, `${name} ${t}`);
  }
});

test('#11 lean: held, thumbs 0.08 s and 0.3 s apart: lean at the later press (no earlier than 0.30)', () => {
  for (const [name, race] of RACES) {
    for (const gap of [0.08, 0.3]) inStep(leanAt(race, (rig, z) => both(rig, z + 0.5, 2, { gap })), 0.5 + gap, `${name} gap ${gap}`);
    inStep(leanAt(race, (rig, z) => both(rig, z + 0.1, 2, { gap: 0.1 })), CONFIG.dip.armDelay, `${name} both before armDelay`);
  }
});

test('#12 lean: stray stride taps as the zone begins (L -0.05..0.03, R 0.08..0.15) never lean', () => {
  for (const [name, race] of RACES) {
    const t = leanAt(race, (rig, z) => rig.at(z + 0.03, up(1, LX)).at(z + 0.08, down(2, RX)).at(z + 0.15, up(2, RX)), {
      lead: 0.55, // the zone starts ~0.05 s after the left tap
      before: (rig) => rig.at(rig.time + 0.001, down(1, LX)),
    });
    assert.equal(t, null, name);
  }
});

// ---------------------------------------------------------------- pole vault

const P = S.plantOffset(); // s from the pads lighting to the plant, at the scenes' speed
/** Held too long: the release is forced this long after the spark starts climbing, planted at v m/s. */
const forcedAfter = (v) => releaseTarget(CONFIG.poleVault, v) + CONFIG.poleVault.release.window;

function vault(schedule, o) {
  const { sc, rig, z } = S.poleVaultAt(o);
  schedule(rig, z);
  rig.runUntil(() => sc.state === 'fly' || sc.state === 'balk' || sc.state === 'landed', 5);
  return { sc, z, hold: sc.holdT == null ? null : sc.holdT - z, release: sc.releaseT == null ? null : sc.releaseT - z };
}

test('#13 pole vault: a tap, 0.5 s or 2 s hold at the plant plants; release at the lift; held too long, a foul (or with heldFoul off, forced with quality 0)', () => {
  let v = vault((rig, z) => both(rig, z + P, 0.08));
  near(v.hold, P + 0.01);
  near(v.release, P + 0.08);
  v = vault((rig, z) => both(rig, z + P, 0.5));
  near(v.hold, P + 0.01);
  near(v.release, P + 0.5);
  assert.ok(CONFIG.poleVault.release.heldFoul);
  v = vault((rig, z) => both(rig, z + P, 2));
  near(v.hold, P + 0.01);
  inStep(v.release, P + 0.01 + forcedAfter(v.sc.vault.v), 'stalled on the pole');
  assert.equal(v.sc.state, 'balk');
  assert.deepEqual(v.sc.mark, { fail: true });
  withConfig(CONFIG.poleVault.release, { heldFoul: 0 }, () => {
    v = vault((rig, z) => both(rig, z + P, 2));
    inStep(v.release, P + 0.01 + forcedAfter(v.sc.vault.v), 'forced release');
    assert.equal(v.sc.vault.rq, 0);
    assert.notEqual(v.sc.state, 'balk');
  });
});

test('#14 pole vault: a hold started before the plant window plants as it opens (no balk); scored as pressed then, or on time with earlyHoldOnTime', () => {
  // The 2 s hold is just "held"; holding too long is #13's business.
  withConfig(CONFIG.poleVault.release, { heldFoul: 0 }, test14);
});
function test14() {
  assert.equal(CONFIG.poleVault.press.earlyHoldOnTime, false);
  const early = CONFIG.poleVault.press.miss + 0.12; // held from before the window opens
  let v = vault((rig, z) => both(rig, z + P - early, 2));
  assert.notEqual(v.sc.state, 'balk');
  assert.ok(Math.abs(v.hold - (P - CONFIG.poleVault.press.miss)) < 0.03, `hold ${v.hold} vs window open ${P - CONFIG.poleVault.press.miss}`);
  near(v.sc.vault.pq, pressQuality(-CONFIG.poleVault.press.miss, CONFIG.poleVault.press), 0.05, 'scored as pressed as the window opens');
  assert.ok(!v.sc.mark?.fail);
  withConfig(CONFIG.poleVault.press, { earlyHoldOnTime: true }, () => {
    v = vault((rig, z) => both(rig, z + P - early, 2));
  });
  assert.notEqual(v.sc.state, 'balk');
  near(v.hold, v.sc.plantT - v.z);
  assert.equal(v.sc.vault.pq, 1);
}

test('#15 pole vault: left thumb from the run-up, right pressed in the window: plant', () => {
  const before = (rig) => rig.at(rig.time + 0.005, down(1, LX)); // a stride (it changes your speed, so the plant: dry run first)
  const real = Math.random;
  let P1, v;
  try {
    Math.random = seededRandom('pv15'); // the same targets both times, so the same stride
    P1 = S.plantOffset({ before });
    Math.random = seededRandom('pv15');
    v = vault((rig, z) => rig.at(z + P1 - 0.1, down(2, RX)).at(z + P1 + 0.6, up(2, RX), up(1, LX)), { before });
  } finally {
    Math.random = real;
  }
  near(v.hold, P1 - 0.1);
  near(v.release, P1 + 0.6);
});

test('#15b pole vault: letting go as the spark reaches your hands is a full release, on time or pressed early', () => {
  // The swing (and the spark's climb) is quicker the faster you plant.
  assert.ok(releaseTarget(CONFIG.poleVault, 12) < releaseTarget(CONFIG.poleVault, 9));
  const dry = S.poleVaultAt();
  dry.rig.runUntil(() => dry.sc.plantT != null, 5);
  const climb = releaseTarget(CONFIG.poleVault, dry.sc.vault.v); // the swing at the scenes' plant speed
  const tol = 0.02; // quality lost to the step the plant falls in
  // On time: the spark climbs from the plant.
  let v = vault((rig, z) => both(rig, z + P, climb));
  assert.ok(v.sc.vault.rq >= 1 - tol, `on time rq ${v.sc.vault.rq}`);
  // Pressed 0.15 s early: the spark still runs down to the box first, then climbs from the plant.
  v = vault((rig, z) => both(rig, z + P - 0.15, 0.15 + climb));
  assert.ok(v.sc.vault.rq >= 1 - tol, `early rq ${v.sc.vault.rq}`);
  // Let go when the spark is only halfway up: a weak release.
  v = vault((rig, z) => both(rig, z + P, climb / 2));
  assert.ok(v.sc.vault.rq < 0.75, `halfway rq ${v.sc.vault.rq}`);
  // The release falls off either side, to nothing at release.late late and release.early early.
  const vt = dry.sc.vault.v;
  const R = CONFIG.poleVault.release;
  const q = (e) => releaseQuality(climb + e, CONFIG.poleVault, vt);
  assert.ok(q(0.1) > q(0.2) && q(0.2) > q(R.late * 0.9) && q(R.late) < 1e-9, `late ${q(0.1)} ${q(0.2)} ${q(R.late)}`);
  assert.ok(q(-0.1) > q(-0.3) && q(-0.3) > q(-R.early * 0.9) && q(-R.early) < 1e-9, `early ${q(-0.1)} ${q(-0.3)} ${q(-R.early)}`);
});

// ---------------------------------------------------------------- javelin

function javelin(schedule, o) {
  const { sc, rig, z } = S.javelin(o);
  schedule(rig, z);
  rig.runUntil(() => sc.state !== 'run', 5);
  return { sc, hold: sc.holdT == null ? null : sc.holdT - z, letGo: sc.shot ? sc.shot.t0 - z : null };
}

test('#16 javelin: a tap, 0.5 s or 2 s hold: holding from the press, thrown at the lift', () => {
  for (const [name, hold] of HOLDS) {
    const j = javelin((rig, z) => both(rig, z + 0.5, hold), { v: 6 }); // 6 m/s: still short of the line after 2.5 s
    near(j.hold, 0.51, 1e-6, name);
    near(j.letGo, 0.5 + hold, 1e-6, name);
  }
});

test('#17 javelin: left thumb from the run-up, right pressed at 0.6: holding from 0.6, thrown at the lift', () => {
  const j = javelin((rig, z) => rig.at(z + 0.6, down(2, RX)).at(z + 1.4, up(2, RX)).at(z + 1.5, up(1, LX)), { before: (rig) => rig.at(rig.time + 0.005, down(1, LX)) });
  near(j.hold, 0.6);
  near(j.letGo, 1.4);
});

// ---------------------------------------------------------------- keyboard, cancels

test('#18 keyboard: Space held 2 s works as a 2 s two-thumb hold in every event', () => {
  const space = (t) => (rig, z) => rig.at(z + t, key('Space')).at(z + t + 2, keyup('Space'));
  near(ljTakeoff(space(0.5)).t, 0.5, 1e-6, 'long jump takeoff');
  const { sc, rig, z } = S.longJump();
  space(0.5)(rig, z);
  rig.runUntil(() => sc.state === 'landed', 5);
  assert.equal(sc.jump.stretchT, null, 'held through the top: no stretch, as with thumbs');
  for (const [name, race] of RACES) {
    const t = leanAt(race, space(0.1));
    assert.ok(t >= CONFIG.dip.armDelay - 1e-9 && t <= CONFIG.dip.armDelay + STEP + 1e-9, `${name} lean ${t}`);
  }
  const v = vault(space(P));
  near(v.hold, P);
  inStep(v.release, P + forcedAfter(v.sc.vault.v), 'pole vault forced release');
  const j = javelin(space(0.5), { v: 6 });
  near(j.hold, 0.5);
  near(j.letGo, 2.5);
});

test('#19 touchcancel mid-hold (pole vault, javelin) is a release, counted in stats.cancels', () => {
  {
    const { sc, rig, z } = S.poleVaultAt();
    both(rig, z + P, null).at(z + P + 0.4, cancel(2, RX)).at(z + P + 0.6, up(1, LX));
    rig.runUntil(() => sc.state === 'fly' || sc.state === 'balk', 5);
    near(sc.releaseT - z, P + 0.4);
    assert.equal(rig.input.stats.cancels, 1);
  }
  {
    const { sc, rig, z } = S.javelin();
    both(rig, z + 0.5, null).at(z + 0.9, cancel(1, LX)).at(z + 1.2, up(2, RX));
    rig.runUntil(() => sc.state !== 'run', 5);
    near(sc.shot.t0 - z, 0.9);
    assert.equal(rig.input.stats.cancels, 1);
  }
});

// ---------------------------------------------------------------- blink

test('#20 a press while the pads are blinked off still counts', () => {
  const off = (t, blink) => assert.ok(!blinkLit(t, blink), `${t} is in the off phase`);
  off(0.4, CONFIG.longJump.blink);
  near(ljTakeoff((rig, z) => both(rig, z + 0.4, 0.08)).t, 0.41, 1e-6, 'long jump');
  off(0.4, CONFIG.javelin.blink);
  near(javelin((rig, z) => both(rig, z + 0.4, 0.1)).hold, 0.41, 1e-6, 'javelin');
  // Pole vault: the latest off-phase moment before the plant.
  let tp = P - 0.02;
  while (blinkLit(tp, CONFIG.poleVault.blink)) tp -= 0.01;
  assert.ok(P - tp < CONFIG.poleVault.press.miss - 0.02, `${tp} is inside the plant window`);
  near(vault((rig, z) => both(rig, z + tp, 0.1)).hold, tp + 0.01, 1e-6, 'pole vault');
  off(0.4, CONFIG.dip.blink);
  for (const [name, race] of RACES) inStep(leanAt(race, (rig, z) => both(rig, z + 0.4, 0.08)), 0.41, name);
});

test('#21 the orange pads are drawn exactly while (now - shown) % 0.6 < 0.3, in all five events', () => {
  const ages = [0.02, 0.17, 0.29, 0.33, 0.47, 0.58, 0.63, 0.81, 0.92, 1.05];
  const scenes = [
    ['long jump', S.longJump, CONFIG.longJump.blink],
    ['pole vault', S.poleVaultAt, CONFIG.poleVault.blink],
    ['javelin', S.javelin, CONFIG.javelin.blink],
    ['100m', S.sprint100, CONFIG.dip.blink],
    ['hurdles', S.hurdles110, CONFIG.dip.blink],
  ];
  for (const [name, make, blink] of scenes) {
    const { sc, rig, z } = make();
    for (const age of ages) {
      rig.runTo(z + age);
      const ctx = countingCtx();
      sc.drawControls(ctx, rig.game.view);
      const lit = blinkLit(rig.time - z, blink);
      assert.equal(ctx.arcs > 0, lit, `${name} at ${(rig.time - z).toFixed(3)} s: drawn ${ctx.arcs > 0}, lit ${lit}`);
    }
  }
});

// ---------------------------------------------------------------- strides untouched

test('#22 strides: the same taps give the same hits, misses and race time as master (100m, long jump run-up)', async () => {
  // Golden values: the same scripted runs (test/helpers/strideRuns.mjs) on master a66b9e0.
  const H = 'hit';
  const M = 'miss';
  const seq100 = [...Array(8).fill(H), M, ...Array(8).fill(H), M, ...Array(8).fill(H), M, ...Array(4).fill(H)];
  const golden100 = { 'ghost-100': 9.522639571058974, c: 9.515231542404221 };
  for (const [seed, mark] of Object.entries(golden100)) {
    const r = await run100(seed);
    assert.deepEqual(r.results, seq100, seed);
    assert.equal(r.hits, 28);
    assert.equal(r.misses, 3);
    near(r.mark, mark, 1e-9, `${seed} race time`);
  }
  const lj = await runUpLJ('ghost-lj');
  assert.deepEqual(lj.results, [...Array(8).fill(H), M, ...Array(4).fill(H)]);
  near(lj.v, 11.391891948276308, 1e-9, 'long jump speed into the zone');
});

test('a held lean is recorded in the ghost and replays to the same time', async () => {
  for (const leanHold of [0.1, 0.9]) {
    const r = await run100('ghost-100', { leanHold });
    assert.ok(r.leanUsed, `leaned (${leanHold})`);
    near(replayMark(r.ghost), r.mark, 1e-9, `replay vs race (${leanHold})`);
  }
});

test('#22 strides: a key release is never a stride (100m, hurdles), and never starts the countdown', async () => {
  const { Sprint100 } = await import('../src/events/sprint100.js');
  const { Hurdles110 } = await import('../src/events/hurdles110.js');
  const { makeRig } = await import('./helpers/rig.mjs');
  for (const Scene of [Sprint100, Hurdles110]) {
    const sc = new Scene({ id: Scene === Sprint100 ? 'sprint100' : 'hurdles110', name: 'x' });
    const rig = makeRig(sc);
    sc.enter();
    assert.ok(rig.input.wantReleases);
    rig.at(rig.time + 0.02, keyup('Enter'), keyup('ArrowLeft')); // e.g. the key that opened the event
    rig.runTo(rig.time + 0.2);
    assert.equal(sc.state, 'waiting', `${Scene.name}: a keyup doesn't start the race`);
    rig.at(rig.time + 0.02, key('Enter'));
    rig.runUntil(() => sc.state === 'race', 10);
    let actions = 0;
    const real = sc.onPlayerAction.bind(sc);
    sc.onPlayerAction = (...a) => {
      actions++;
      return real(...a);
    };
    rig.at(rig.time + 0.1, key('ArrowLeft')).at(rig.time + 0.2, keyup('ArrowLeft'));
    rig.at(rig.time + 0.3, down(5, LX)).at(rig.time + 0.35, up(5, LX));
    rig.runTo(rig.time + 0.5);
    assert.equal(actions, 2, `${Scene.name}: one key press and one tap, two strides`);
  }
});

// ---------------------------------------------------------------- the late hits take lifts

test('late hits controls (brawl/aftermath.js -> controls.js) use the lifts: the stick and walking keys let go', () => {
  const c = new BrawlControls(null);
  c.layout({ w: 960, h: 540, safe: { l: 0, r: 0, t: 0, b: 0 } }, 60);
  assert.ok(c.handle({ type: 'down', id: 't1', x: 100, y: 300 }));
  assert.ok(c.stick);
  assert.ok(c.handle({ type: 'up', id: 't1', x: 100, y: 300 }));
  assert.equal(c.stick, null);
  c.handle({ type: 'key', code: 'ArrowLeft' });
  assert.ok(c.keys.has('ArrowLeft'));
  c.handle({ type: 'keyup', code: 'ArrowLeft' });
  assert.ok(!c.keys.has('ArrowLeft'));
});
