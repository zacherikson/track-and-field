// The demos (src/demo/): every event's bot plays it through to the end the way How to Play says,
// with a fair mark, and nothing counts. The real event scenes, stepped with no browser
// (test/helpers/rig.mjs sets up the globals). Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEP, W, H, countingCtx } from './helpers/rig.mjs';

globalThis.Path2D ??= class {}; // the menus' icons (core/icons.js), drawn on a ctx that draws nothing

// After the rig (it sets up the browser globals and loads the scenes in the app's order).
const { DemoScene } = await import('../src/demo/demoScene.js');
const { DEMO_IDS } = await import('../src/demo/demoBots.js');
const { EVENTS, SPECIAL_EVENTS } = await import('../src/events/registry.js');
const { getCampaign, setCampaign, getSpecialLevel, setSpecialLevel } = await import('../src/core/storage.js');

const ALL = [...EVENTS, ...SPECIAL_EVENTS];

/** A game around a DemoScene: no screen taps, its own clock, and where it went when it left. */
function play(ev, maxS = 120) {
  const went = [];
  const game = {
    time: 10,
    view: { w: W, h: H, scale: 1, dpr: 1, safe: { l: 0, r: 0, t: 0, b: 0 } },
    input: { consume: () => [], clear() {}, resetStats() {}, stats: { delays: [] }, pointers: new Map() },
    setScene(s) {
      game.scene?.exit?.();
      game.scene = s;
    },
  };
  const scene = new DemoScene(ev, { back: () => went.push('back'), tryIt: () => went.push('try') });
  game.scene = scene;
  scene.game = game;
  scene.enter();
  const inner = scene.inner;
  const ctx = countingCtx();
  let finished = null; // the event's own finish (the results) must never run: the demo takes it
  const original = Object.getPrototypeOf(inner).finish;
  Object.getPrototypeOf(inner).finish = function () {
    finished = this;
    return original.call(this);
  };
  try {
    for (let n = 0; !scene.ended && game.time < 10 + maxS; n++) {
      scene.update(STEP, game.time);
      game.time += STEP;
      if (n % 30 === 0) scene.render(ctx, game.view);
    }
    scene.render(ctx, game.view); // the end card
  } finally {
    Object.getPrototypeOf(inner).finish = original;
  }
  return { scene, inner, game, went, finished, demoTime: scene.clock - 10 };
}

test('every event on How to Play has a demo', () => {
  assert.deepEqual([...DEMO_IDS].sort(), ALL.map((e) => e.id).sort());
});

for (const ev of ALL) {
  test(`${ev.id}: the demo plays itself to the end, with a fair mark`, () => {
    setCampaign('highschool');
    setSpecialLevel('collegiate');
    const { scene, inner, finished, demoTime } = play(ev);
    assert.ok(scene.ended, `${ev.id}: still going after 120 s`);
    assert.equal(finished, null, 'the results never come up');
    assert.ok(demoTime > 5, `${ev.id}: over after ${demoTime.toFixed(1)} s`);
    if (ev.id === 'relay4x100') {
      assert.equal(inner.popup?.ex.grade, 'perfect', 'the first handover');
    } else if (inner.player.jumps) {
      const m = inner.mark;
      assert.ok(m && !m.foul && !m.fail && m.mark > 0, `${ev.id}: first attempt ${JSON.stringify(m)}`);
    } else {
      assert.ok(inner.player.mark > 0, `${ev.id}: crossed the line (${inner.player.mark})`);
    }
    assert.ok(scene.caption?.text, 'a caption showed');
    // Pro rivals at the big stadium while it played; your campaign and RIVALS level back after.
    assert.equal(getCampaign(), 'pro');
    scene.leave(() => {});
    assert.equal(getCampaign(), 'highschool');
    assert.equal(getSpecialLevel(), 'collegiate');
    setCampaign(null);
  });
}

test('the end card: Watch again plays it again, Try it and Back go where they were told', () => {
  const ev = EVENTS.find((e) => e.id === 'longjump');
  const { scene, went } = play(ev);
  const [again, tryIt, back] = scene.buttons;
  again.tap(again.x + 1, again.y + 1);
  assert.equal(scene.ended, false, 'playing again');
  assert.equal(scene.inner.round, 1);
  tryIt.tap(tryIt.x + 1, tryIt.y + 1);
  assert.deepEqual(went, ['try']);
  assert.equal(scene.inner, null, 'the event is closed');
  const second = play(ev);
  second.scene.buttons[2].tap(back.x + 1, back.y + 1);
  assert.deepEqual(second.went, ['back']);
});
