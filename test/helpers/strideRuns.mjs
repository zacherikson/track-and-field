// Scripted runs through the green stride targets (the 100m, a long jump
// run-up), for checking that the orange-pad changes leave strides alone:
// a fixed tapping script against seeded targets gives the same 'hit'/'miss'
// sequence and the same race time as on master. Touch taps and keyboard taps
// (which now also deliver their keyups) are both used.
import { makeRig, down, up, key, keyup, LX, RX } from './rig.mjs';
import { seededRandom } from '../../src/core/random.js';

const KEYS = { L: 'ArrowLeft', R: 'ArrowRight' };

/** Every `gap` s tap the side shown then (every `wrongEvery`th tap the other side); taps alternate touch and keys. */
function tapper(rig, getTarget, { gap = 0.24, hold = 0.07, wrongEvery = 9 } = {}) {
  let next = rig.time + gap;
  let n = 0;
  return () => {
    if (rig.time < next) return;
    next += gap;
    const target = getTarget();
    if (!target) return;
    n++;
    const side = n % wrongEvery === 0 ? (target === 'L' ? 'R' : 'L') : target;
    const t = rig.time + 0.001;
    if (n % 2) rig.at(t, down(100 + n, side === 'L' ? LX : RX)).at(t + hold, up(100 + n, side === 'L' ? LX : RX));
    else rig.at(t, key(KEYS[side])).at(t + hold, keyup(KEYS[side]));
  };
}

/**
 * A whole 100m: { results: ['hit', 'miss', ...] as the judge gave them, hits,
 * misses, mark, ghost (the recorded run) }. `leanHold`: press both thumbs that
 * long into the lean zone and hold them (null: no lean).
 */
export async function run100(seed = 'ghost-100', { leanHold = null } = {}) {
  const real = Math.random;
  Math.random = seededRandom(seed);
  try {
    const { Sprint100 } = await import('../../src/events/sprint100.js');
    const sc = new Sprint100({ id: 'sprint100', name: '100m Dash' });
    const rig = makeRig(sc);
    sc.enter();
    const results = [];
    const hook = (judge) => {
      const p = judge.press.bind(judge);
      judge.press = (side, t) => {
        const r = p(side, t);
        results.push(r);
        return r;
      };
    };
    hook(sc.judge);
    rig.at(rig.time + 0.05, down(1, LX)).at(rig.time + 0.1, up(1, LX)); // start the countdown
    rig.runUntil(() => sc.state === 'race', 10);
    const tap = tapper(rig, () => (sc.player.runner.mode === 'run' ? sc.target : null));
    let leaning = false;
    rig.runUntil(() => {
      tap();
      if (leanHold != null && !leaning && sc.player.runner.mode === 'carry') {
        leaning = true;
        const t = sc.carryT + leanHold;
        rig.at(t, down(1, LX)).at(t + 0.1, down(2, RX)).at(t + 2, up(1, LX), up(2, RX));
      }
      return sc.player.mark != null;
    }, 30);
    return { results, hits: sc.judge.hits, misses: sc.judge.misses, mark: sc.player.mark, leanUsed: sc.player.runner.dipUsed, ghost: sc.recorder.data(sc.player.mark) };
  } finally {
    Math.random = real;
  }
}

/** A long jump run-up to the zone: { results, hits, misses, v } (v = speed as the pads light). */
export async function runUpLJ(seed = 'ghost-lj') {
  const real = Math.random;
  Math.random = seededRandom(seed);
  try {
    const { LongJump } = await import('../../src/events/longJump.js');
    const sc = new LongJump({ id: 'longjump', name: 'Long Jump' });
    const rig = makeRig(sc);
    sc.enter();
    const results = [];
    const p = sc.runUp.stride.bind(sc.runUp);
    sc.runUp.stride = (side, t) => {
      const r = p(side, t);
      results.push(r);
      return r;
    };
    const tap = tapper(rig, () => (sc.runUp.striding ? sc.runUp.judge.target : null));
    rig.runUntil(() => {
      tap();
      return !sc.runUp.striding;
    }, 30);
    return { results, hits: sc.stats.hits, misses: sc.stats.misses, v: sc.runner.v };
  } finally {
    Math.random = real;
  }
}
