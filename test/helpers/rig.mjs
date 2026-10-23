// Test rig: the real Input (src/core/input.js) fed synthetic touch and key
// events, driving a real event scene step by step on the game's fixed step,
// with no browser. Times are sim seconds (wall ms = sim s * 1000).
import { CONFIG } from '../../src/config.js';

let listeners = {};
let NOW = 0; // wall ms
globalThis.performance = { now: () => NOW };
globalThis.window = { innerWidth: 960, addEventListener: (type, f) => (listeners[type] ??= []).push(f) };
globalThis.document = { addEventListener: () => {} };
globalThis.navigator = {};
globalThis.location = { search: '', hostname: 'localhost' };
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { Input } = await import('../../src/core/input.js');
// Load the event scenes through one entry that the app's import cycle
// (flow.js -> registry.js -> the scenes) resolves from, as main.js does.
await import('../../src/events/longJump.js');

export const W = 960;
export const H = 540;
export const STEP = CONFIG.loop.fixedStep;
export const LX = 100; // a left-thumb x
export const RX = W - 100; // a right-thumb x

/** A ctx that draws nothing and counts arc() calls (pads are circles). */
export function countingCtx() {
  const ctx = { arcs: 0 };
  return new Proxy(ctx, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'arc') return () => o.arcs++;
      if (k === 'measureText') return () => ({ width: 10 });
      if (/^create/.test(k)) return () => ({ addColorStop() {} });
      return () => {};
    },
    set(o, k, v) {
      o[k] = v;
      return true;
    },
  });
}

/**
 * A game around `scene` (already constructed): scene.game, a real Input, the
 * view, the clock. rig.at(t, ...events) queues touches/keys at sim time t;
 * rig.runTo(t) steps the scene until then.
 */
export function makeRig(scene, { t0 = 10 } = {}) {
  listeners = {};
  NOW = t0 * 1000;
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  const view = { w: W, h: H, scale: 1, dpr: 1, safe: { l: 0, r: 0, t: 0, b: 0 } };
  const input = new Input(canvas, view);
  const game = { time: t0, view, input, worstFrameMs: 0 };
  const queue = []; // { t, fire() }
  const fire = (type, ev) => {
    for (const f of listeners[type] ?? []) f(ev);
  };
  const touch = (type, id, x) =>
    fire(type, { type, target: canvas, timeStamp: NOW, changedTouches: [{ identifier: id, clientX: x, clientY: 300 }], touches: [], preventDefault() {} });
  const rig = {
    game,
    input,
    scene,
    get time() {
      return game.time;
    },
    /** Queue events at sim time t: down(id, x), up(id, x), cancel(id, x), key(code), keyup(code). */
    at(t, ...evs) {
      for (const e of evs) queue.push({ t, e });
      queue.sort((a, b) => a.t - b.t);
      return rig;
    },
    step() {
      const end = game.time + STEP;
      while (queue.length && queue[0].t <= end) {
        const { t, e } = queue.shift();
        NOW = t * 1000;
        if (e.kind === 'down') touch('touchstart', e.id, e.x);
        else if (e.kind === 'up') touch('touchend', e.id, e.x);
        else if (e.kind === 'cancel') touch('touchcancel', e.id, e.x);
        else if (e.kind === 'key') fire('keydown', { code: e.code, repeat: false, timeStamp: NOW, preventDefault() {} });
        else if (e.kind === 'keyup') fire('keyup', { code: e.code, timeStamp: NOW });
      }
      NOW = end * 1000;
      input.syncClock(NOW, end);
      scene.update(STEP, game.time);
      game.time = end;
    },
    runTo(t) {
      while (game.time + STEP / 2 < t) rig.step();
      return rig;
    },
    /** Step until pred() (or `max` s pass); returns the time it became true, or null. */
    runUntil(pred, max = 10) {
      const stop = game.time + max;
      while (game.time < stop) {
        if (pred()) return game.time;
        rig.step();
      }
      return pred() ? game.time : null;
    },
  };
  scene.game = game;
  input.wantReleases = !!scene.wantsReleases; // as Game.setScene does
  return rig;
}

export const down = (id, x) => ({ kind: 'down', id, x });
export const up = (id, x) => ({ kind: 'up', id, x });
export const cancel = (id, x) => ({ kind: 'cancel', id, x });
export const key = (code) => ({ kind: 'key', code });
export const keyup = (code) => ({ kind: 'keyup', code });

/** Both thumbs down at t (R `gap` s after L), each held `hold` s. Ids from `id`. */
export function both(rig, t, hold, { gap = 0.01, id = 1 } = {}) {
  rig.at(t, down(id, LX)).at(t + gap, down(id + 1, RX));
  if (hold != null) rig.at(t + hold, up(id, LX)).at(t + gap + hold, up(id + 1, RX));
  return rig;
}
