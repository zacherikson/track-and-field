// The game fills the screen even when iOS lays a home-screen app out a status bar short (src/core/game.js screenFit). Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenFit } from '../src/core/game.js';

// A window: its inner size, the screen (portrait numbers, as iOS reports them), and whether it's the home-screen app.
const win = ({ w, h, sw = 430, sh = 932, app = true, vv = null }) => ({
  innerWidth: w,
  innerHeight: h,
  visualViewport: vv,
  screen: { width: sw, height: sh },
  navigator: { standalone: app },
  matchMedia: () => ({ matches: false }),
});

test('the home-screen app in landscape, laid out a status bar short: the screen height', () => {
  assert.deepEqual(screenFit(win({ w: 932, h: 371 })), { w: 932, h: 430 });
});

test('already the full screen: unchanged', () => {
  assert.deepEqual(screenFit(win({ w: 932, h: 430 })), { w: 932, h: 430 });
  assert.deepEqual(screenFit(win({ w: 430, h: 932 })), { w: 430, h: 932 }); // portrait
});

test('a browser tab (not the app): its window, whatever the screen', () => {
  assert.deepEqual(screenFit(win({ w: 932, h: 340, app: false })), { w: 932, h: 340 });
});

test('a smaller window (an iPad in split view): its window, not the screen', () => {
  assert.deepEqual(screenFit(win({ w: 700, h: 980, sw: 1024, sh: 1366 })), { w: 700, h: 980 });
  assert.deepEqual(screenFit(win({ w: 1366, h: 700, sw: 1024, sh: 1366 })), { w: 1366, h: 700 }); // full width, but far more than a status bar short
});

test('the visual viewport, when it knows better than innerHeight', () => {
  assert.deepEqual(screenFit(win({ w: 932, h: 371, app: false, vv: { width: 932, height: 430 } })), { w: 932, h: 430 });
});
