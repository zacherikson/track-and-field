// Thumbs (src/core/thumbs.js): which thumbs are down, from presses and lifts,
// so the orange pads can take holds. And the pads' blink (render/pads.js).
// Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Thumbs } from '../src/core/thumbs.js';
import { blinkLit } from '../src/render/pads.js';
import { CONFIG } from '../src/config.js';

const half = (e) => (e.type === 'down' ? (e.x < 480 ? 'L' : 'R') : e.code === 'Space' ? 'BOTH' : e.code === 'ArrowLeft' ? 'L' : e.code === 'ArrowRight' ? 'R' : null);
const dn = (id, side, t) => ({ type: 'down', id, x: side === 'L' ? 100 : 860, t });
const lift = (id, t) => ({ type: 'up', id, t });

test('both thumbs down: the time the pair completed, however far apart they landed', () => {
  const th = new Thumbs();
  th.track(dn('a', 'L', 1.0), half);
  assert.equal(th.both(), null);
  th.track(dn('b', 'R', 1.4), half);
  assert.equal(th.both(), 1.4);
  assert.ok(th.bothDown);
  th.track(lift('a', 2.0), half);
  assert.equal(th.both(), null);
  assert.ok(!th.bothDown);
});

test('armT: at least one thumb pressed since the pads lit', () => {
  const th = new Thumbs();
  th.track(dn('a', 'L', 0.9), half); // still down from the last stride
  th.track(dn('b', 'R', 0.95), half);
  assert.equal(th.both(1.0), null, 'both already down when the pads lit: not a press on them');
  th.track(lift('b', 1.1), half);
  th.track(dn('c', 'R', 1.2), half);
  assert.equal(th.both(1.0), 1.2, 'the left thumb from the run-up counts once the right is pressed in the zone');
});

test('a lift only clears its own finger; the earliest held press stands for its side', () => {
  const th = new Thumbs();
  th.track(dn('a', 'L', 1.0), half);
  th.track(dn('b', 'L', 1.3), half);
  th.track(dn('c', 'R', 1.5), half);
  assert.equal(th.side('L').t, 1.0);
  th.track(lift('a', 1.6), half);
  assert.equal(th.side('L').t, 1.3);
  assert.equal(th.both(), 1.5);
  th.track(lift('zzz', 1.7), half); // a finger we never saw go down (down before the scene began)
  assert.equal(th.both(), 1.5);
});

test('keys: a both-thumbs key is two thumbs until its keyup; side keys one each', () => {
  const th = new Thumbs();
  th.track({ type: 'key', code: 'Space', t: 2 }, half);
  assert.equal(th.both(), 2);
  th.track({ type: 'keyup', code: 'Space', t: 3 }, half);
  assert.equal(th.both(), null);
  th.track({ type: 'key', code: 'ArrowLeft', t: 4 }, half);
  th.track({ type: 'key', code: 'ArrowRight', t: 4.2 }, half);
  assert.equal(th.both(), 4.2);
  th.track({ type: 'keyup', code: 'ArrowLeft', t: 4.5 }, half);
  assert.equal(th.both(), null);
});

test('unmapped presses are ignored; reset forgets everything', () => {
  const th = new Thumbs();
  th.track({ type: 'key', code: 'KeyQ', t: 1 }, half);
  assert.equal(th.down.size, 0);
  th.track(dn('a', 'L', 1), half);
  th.track(dn('b', 'R', 1), half);
  th.reset();
  assert.equal(th.both(), null);
});

test('blink: 0.60 s period, lit 0.30 s, for every orange pad (spec #21)', () => {
  for (const blink of [CONFIG.longJump.blink, CONFIG.poleVault.blink, CONFIG.javelin.blink, CONFIG.dip.blink]) {
    assert.deepEqual(blink, { period: 0.6, on: 0.3 });
    for (const [age, lit] of [[0, true], [0.15, true], [0.29, true], [0.31, false], [0.59, false], [0.61, true], [0.95, false], [1.25, true]]) {
      assert.equal(blinkLit(age, blink), lit, `age ${age}`);
    }
  }
  assert.equal(blinkLit(-0.1, CONFIG.dip.blink), false, 'not up yet');
});
