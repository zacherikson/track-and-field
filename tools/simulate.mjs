// Headless tuning tool: races simulated players through the real Runner physics
// and the real random-target rules, so you can see what a config change does
// before touching a phone.
//
//   node tools/simulate.mjs
//
import { CONFIG } from '../src/config.js';
import { Runner } from '../src/athletes/runner.js';
import { AIController } from '../src/athletes/ai.js';
import { StrideTargets } from '../src/events/strideTargets.js';
import { ButtonSet, HurdleRun, HurdleAI, hurdlePositions } from '../src/events/hurdleRules.js';
import { jumpMark, rivalJump } from '../src/events/longJumpRules.js';
import { pressQuality, releaseQuality, releaseTarget, vaultHeight, rivalVault } from '../src/events/poleVaultRules.js';
import { throwMark, rivalThrow } from '../src/events/javelinRules.js';
import { Exchange, exchangeSpot, LEG } from '../src/events/relayRules.js';
import { Bike, BikeAI, buildCourse, gearFor, idealThrow } from '../src/events/cyclingRules.js';

const STEP = CONFIG.loop.fixedStep;
const D = CONFIG.sprint100.distance;
const DIP = CONFIG.dip;
const TGT = CONFIG.sprint100.targets;
const N = 40; // races per row

const gauss = (mu, sd) => mu + sd * Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
const other = (s) => (s === 'L' ? 'R' : 'L');

/**
 * Player strategies: given what the player can see, return the next press(es).
 * `targetWasForced` = the current target's side was guaranteed by the
 * max-2-in-a-row rule, so a player who knows the rule can pre-empt it.
 */
const strategies = {
  // Waits for each target and reacts; occasionally hits the wrong side.
  reader: ({ rt, rtForced, sd = 0.04, err = 0.03 }) => (j) => {
    const base = j.targetWasForced ? rtForced : rt;
    const side = Math.random() < err ? other(j.target) : j.target;
    return [{ t: j.readyT + Math.max(0.07, gauss(base, sd)), side }];
  },
  // Guesses the 50/50 targets instantly instead of reading them.
  guesser: ({ rt, rtForced }) => (j) => {
    if (j.targetWasForced) return [{ t: j.readyT + rtForced, side: j.target }];
    return [{ t: j.readyT + rt, side: Math.random() < 0.5 ? 'L' : 'R' }];
  },
  // Blindly alternates L, R, L, R at a fixed rate.
  alternator: ({ rate }) => {
    let side = 'L';
    return (j) => {
      side = other(side);
      return [{ t: j.lastPressT + (1 / rate) * (0.8 + 0.4 * Math.random()), side }];
    };
  },
  // Drums both thumbs together at a fixed rate.
  drummer: ({ rate }) => (j) => {
    const t = j.lastPressT + (1 / rate) * (0.8 + 0.4 * Math.random());
    const first = Math.random() < 0.5 ? 'L' : 'R';
    return [{ t, side: first }, { t: t + 0.015, side: other(first) }];
  },
};

function playerRace(strategy) {
  const r = new Runner(undefined, undefined, CONFIG.sprint100.startX);
  const j = new StrideTargets(r, TGT);
  r.go(0);
  j.start(0);
  const reaction = 0.2; // to the gun, on top of reading the first target
  const state = { target: j.target, readyT: reaction, lastPressT: reaction, targetWasForced: false };
  let queue = strategy(state);
  let t = 0;
  while (t < 40) {
    if (D - r.x <= DIP.promptDistance) r.carry();
    if (r.mode === 'carry' && D - r.x <= r.idealDipDistance()) r.lean();
    while (queue.length && queue[0].t < t + STEP && r.mode === 'run') {
      const p = queue.shift();
      const wasForced = j.seq.forced;
      const res = j.press(p.side, p.t);
      state.lastPressT = p.t;
      if (res === 'hit') {
        Object.assign(state, { target: j.target, readyT: p.t, targetWasForced: wasForced });
        queue = strategy(state);
      } else if (!queue.length) {
        // Miss / locked / ignored: realize it, then go again once unlocked.
        state.readyT = Math.max(p.t, j.lockedUntil);
        queue = strategy(state);
      }
    }
    r.update(STEP, t);
    const cross = r.crossing(D, t, STEP);
    if (cross != null) return { time: cross, hits: j.hits, misses: j.misses };
    t += STEP;
  }
  return { time: Infinity, hits: j.hits, misses: j.misses };
}

function aiRace(level) {
  const r = new Runner(undefined, undefined, CONFIG.sprint100.startX);
  const ai = new AIController(r, level);
  ai.go(0);
  let t = 0;
  while (t < 40) {
    if (D - r.x <= DIP.promptDistance) r.carry();
    ai.update(t, STEP, r.x / D, D - r.x);
    r.update(STEP, t);
    const cross = r.crossing(D, t, STEP);
    if (cross != null) return cross;
    t += STEP;
  }
  return Infinity;
}

const avg = (arr, f) => arr.reduce((s, x) => s + f(x), 0) / arr.length;
function row(label, make) {
  const all = Array.from({ length: N }, () => playerRace(make()));
  const runs = all.filter((x) => x.time < 40);
  const stuck = all.length - runs.length;
  if (!runs.length) return console.log(`${label.padEnd(44)}  never finishes (stuck missing into the lockout)`);
  const time = avg(runs, (x) => x.time);
  const rate = avg(runs, (x) => x.hits / x.time);
  const note = stuck ? `   (${stuck}/${N} runs never finished)` : '';
  console.log(`${label.padEnd(44)} ${time.toFixed(2).padStart(6)}s   ${rate.toFixed(1)} hits/s   ${avg(runs, (x) => x.misses).toFixed(1)} misses${note}`);
}

console.log('PLAYER STRATEGIES (100m, with an ideal dip)');
console.log('reader: rt = reaction to a 50/50 target, fwd = to a forced one (after 2 in a row)');
row('reader novice   rt 0.36 fwd 0.24', () => strategies.reader({ rt: 0.36, rtForced: 0.24, err: 0.05 }));
row('reader casual   rt 0.30 fwd 0.18', () => strategies.reader({ rt: 0.3, rtForced: 0.18, err: 0.04 }));
row('reader casual, ignores the rule (fwd 0.30)', () => strategies.reader({ rt: 0.3, rtForced: 0.3, err: 0.04 }));
row('reader good     rt 0.25 fwd 0.12', () => strategies.reader({ rt: 0.25, rtForced: 0.12, err: 0.03 }));
row('reader expert   rt 0.20 fwd 0.09', () => strategies.reader({ rt: 0.2, rtForced: 0.09, err: 0.02 }));
row('reader superhuman rt 0.16 fwd 0.07', () => strategies.reader({ rt: 0.16, rtForced: 0.07, err: 0.01 }));
row('guesser (instant 50/50 guesses, 0.12s)', () => strategies.guesser({ rt: 0.12, rtForced: 0.09 }));
for (const rate of [6, 8, 10, 12, 14]) row(`alternating masher ${rate}/s`, () => strategies.alternator({ rate }));
for (const rate of [4, 7, 10]) row(`both-thumb drummer ${rate}/s`, () => strategies.drummer({ rate }));

console.log('\nAI FIELDS');
for (const name of Object.keys(CONFIG.ai)) {
  const winners = [];
  const all = [];
  for (let i = 0; i < 200; i++) {
    const times = Array.from({ length: CONFIG.sprint100.lanes - 1 }, () => aiRace(CONFIG.ai[name]));
    winners.push(Math.min(...times));
    all.push(...times);
  }
  winners.sort((a, b) => a - b);
  all.sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.floor(p * (arr.length - 1))].toFixed(2);
  console.log(`${name.padEnd(8)} individual ${q(all, 0)}–${q(all, 1)} (median ${q(all, 0.5)}); winner median ${q(winners, 0.5)}, fastest 10% ${q(winners, 0.1)}`);
}

console.log(`\nFINISH LEAN from 10.5 m/s (meters early vs. ideal, ideal ≈ ${(10.5 * DIP.riseTime + DIP.reach).toFixed(1)}m out)`);
function dipRace(errM) {
  const r = new Runner();
  r.started = true;
  r.v = 10.5;
  r.x = D - DIP.promptDistance;
  r.mode = 'carry';
  let t = 0;
  while (t < 10) {
    if (errM != null && r.mode === 'carry' && D - r.x <= r.idealDipDistance() + errM) r.lean();
    if (r.mode === 'run') r.stride(t); // got up after a crash: keep running
    r.update(STEP, t);
    const c = r.crossing(D, t, STEP);
    if (c != null) return c;
    t += STEP;
  }
}
const base = dipRace(null);
for (const e of [-2, -1, 0, 1, 2, 3, 4, 6, 8, 11]) {
  const d = dipRace(e) - base;
  console.log(`  ${(e >= 0 ? '+' : '') + e}m`.padEnd(8) + ` ${(d >= 0 ? '+' : '') + d.toFixed(3)}s vs no lean`);
}

// ------------------------------------------------------------------ 110m hurdles
const HC = { ...CONFIG.sprint100, ...CONFIG.hurdles110 };
const HD = HC.distance;
const HPOS = hurdlePositions(HC.hurdles);
const hurdleParams = () => ({ ...CONFIG.runner, ...HC.runner });

/**
 * A player clearing button sets: reads each new set in `react` s (±15%), then
 * taps the next two `gap` s apart. Each tap has an `err` chance of hitting a
 * wrong number, which costs `recover` s to put right.
 */
function hurdleRace({ react, gap, err = 0.02, recover = 0.15 }) {
  const r = new Runner(hurdleParams(), undefined, HC.startX);
  const set = new ButtonSet(r, HC);
  const run = new HurdleRun(HPOS, HC.clear);
  r.go(0);
  set.start(0);
  const j = () => 0.85 + 0.3 * Math.random();
  const plan = (t0) => [t0 + react * j(), gap * j(), gap * j()];
  let queue = plan(0.1); // gun reaction overlaps reading the first set
  let nextT = queue.shift();
  let t = 0;
  while (t < 60) {
    if (HD - r.x <= HC.dipPromptDistance) r.carry();
    if (r.mode === 'carry' && HD - r.x <= r.idealDipDistance()) r.lean();
    while (nextT != null && nextT < t + STEP && r.mode === 'run' && !set.done) {
      const slot = set.slots.indexOf(set.next);
      const wrongSlot = set.slots.findIndex((n, i) => set.state[i] === 'live' && n !== set.next);
      const res = set.press(Math.random() < err && wrongSlot >= 0 ? wrongSlot : slot, nextT);
      nextT = set.done ? null : res === 'miss' ? nextT + recover : queue.length ? nextT + queue.shift() : nextT + gap;
    }
    r.update(STEP, t);
    const hop = run.update(r, t + STEP, set.faults);
    if (hop) {
      if (hop.last) set.stop();
      else {
        set.start(t + STEP);
        queue = plan(t + STEP);
        nextT = queue.shift();
      }
    }
    const cross = r.crossing(HD, t, STEP);
    if (cross != null) return { time: cross, trips: run.trips, misses: set.misses };
    t += STEP;
  }
  return { time: Infinity, trips: run.trips, misses: set.misses };
}

function hurdleAiRace(level) {
  const r = new Runner(hurdleParams(), undefined, HC.startX);
  const lv = { ...CONFIG.ai[level], ...HC.ai[level], missSpeedLoss: HC.missSpeedLoss };
  const ai = new HurdleAI(r, lv);
  const run = new HurdleRun(HPOS, HC.clear);
  ai.go(0);
  let t = 0;
  while (t < 60) {
    if (HD - r.x <= HC.dipPromptDistance) r.carry();
    ai.update(t, STEP, r.x / HD, HD - r.x);
    r.update(STEP, t);
    const hop = run.update(r, t + STEP, ai.faults);
    if (hop) hop.last ? ai.stop() : ai.start(t + STEP);
    const cross = r.crossing(HD, t, STEP);
    if (cross != null) return cross;
    t += STEP;
  }
  return Infinity;
}

console.log('\n110m HURDLES (react = time to find 1 in a new set, gap = between taps)');
const hrow = (label, opts) => {
  const res = Array.from({ length: N }, () => hurdleRace(opts));
  const avg = (k) => res.reduce((a, b) => a + b[k], 0) / res.length;
  console.log(`${label.padEnd(44)} ${avg('time').toFixed(2)}s   ${avg('trips').toFixed(1)} trips   ${avg('misses').toFixed(1)} misses`);
};
hrow('slow     react 0.80 gap 0.35 (set ~1.5s)', { react: 0.8, gap: 0.35, err: 0.04 });
hrow('casual   react 0.60 gap 0.26 (set ~1.1s)', { react: 0.6, gap: 0.26, err: 0.03 });
hrow('good     react 0.45 gap 0.18 (set ~0.8s)', { react: 0.45, gap: 0.18, err: 0.02 });
hrow('expert   react 0.35 gap 0.13 (set ~0.6s)', { react: 0.35, gap: 0.13, err: 0.015 });
hrow('machine  react 0.25 gap 0.10 (set ~0.45s)', { react: 0.25, gap: 0.1, err: 0 });
hrow('good but sloppy (8% wrong)', { react: 0.45, gap: 0.18, err: 0.08 });
hrow('good but very sloppy (20% wrong)', { react: 0.45, gap: 0.18, err: 0.2 });
hrow('fast guesser (react 0.2, 40% wrong)', { react: 0.2, gap: 0.1, err: 0.4 });
for (const level of ['amateur', 'pro']) {
  const winners = [];
  const all = [];
  for (let i = 0; i < 150; i++) {
    const times = Array.from({ length: HC.lanes - 1 }, () => hurdleAiRace(level));
    winners.push(Math.min(...times));
    all.push(...times);
  }
  winners.sort((a, b) => a - b);
  all.sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.floor(p * (arr.length - 1))].toFixed(2);
  console.log(`${level.padEnd(8)} individual ${q(all, 0)}–${q(all, 1)} (median ${q(all, 0.5)}); winner median ${q(winners, 0.5)}, fastest 10% ${q(winners, 0.1)}`);
}

// ------------------------------------------------------------------ long jump
const LJ = CONFIG.longJump;
/** Speed at takeoff after a run-up hitting targets at `rate` per s, carrying through the zone. */
function ljRunUp(rate) {
  const r = new Runner(undefined, undefined, -LJ.runway);
  r.go(0);
  let t = 0;
  let next = 0.25;
  while (r.x < -1) {
    if (-r.x <= LJ.zoneDistance) r.carry();
    else if (t >= next) {
      r.stride(t);
      next += 1 / rate;
    }
    r.update(STEP, t);
    t += STEP;
  }
  return r.v;
}
/**
 * A player aiming to take off `aim` s before reaching the line, with timing
 * error of `sd` s (humans: ~0.02 practiced, ~0.05 casual), stretching `delay` s
 * after the pads appear. Best of the rounds, and the foul rate.
 */
function ljPlayer(rate, aim, sd, delay) {
  const v = ljRunUp(rate);
  const jumps = Array.from({ length: LJ.rounds }, () => {
    const takeoffX = -v * gauss(aim, sd);
    if (takeoffX > 0) return null;
    return jumpMark({ takeoffX, v, stretchDelay: delay }, LJ);
  });
  const ok = jumps.filter((j) => j != null);
  return { best: ok.length ? Math.max(...ok) : 0, fouls: jumps.length - ok.length };
}
console.log('\nLONG JUMP (best of 3; aim = how early you press, sd = your timing error)');
for (const [label, rate, aim, sd, delay] of [
  ['casual   3.0/s, aim 0.06s ±0.05, stretch 0.2s', 3.0, 0.06, 0.05, 0.2],
  ['good     3.7/s, aim 0.04s ±0.03, stretch 0.12s', 3.7, 0.04, 0.03, 0.12],
  ['expert   4.7/s, aim 0.03s ±0.02, stretch 0.08s', 4.7, 0.03, 0.02, 0.08],
  ['expert, risky  aim 0.015s ±0.02', 4.7, 0.015, 0.02, 0.08],
  ['good, never stretches', 3.7, 0.04, 0.03, null],
]) {
  const res = Array.from({ length: 200 }, () => ljPlayer(rate, aim, sd, delay));
  const bests = res.filter((r) => r.best > 0).map((r) => r.best);
  const avg = bests.reduce((a, b) => a + b, 0) / bests.length;
  const fouls = res.reduce((a, r) => a + r.fouls, 0) / (res.length * LJ.rounds);
  const nm = res.filter((r) => r.best === 0).length / res.length;
  console.log(`${label.padEnd(48)} best ${avg.toFixed(2)}m   fouls ${(fouls * 100).toFixed(0)}%   no mark ${(nm * 100).toFixed(0)}%`);
}
for (const level of ['amateur', 'pro']) {
  const lv = { ...CONFIG.ai[level], ...LJ.ai[level] };
  const runUp = () => {
    const r = new Runner(undefined, undefined, -LJ.runway);
    const ai = new AIController(r, lv);
    ai.go(0);
    let t = 0;
    while (r.x < -1 && t < 20) {
      if (-r.x <= LJ.zoneDistance) r.carry();
      ai.update(t, STEP, 0, Infinity);
      r.update(STEP, t);
      t += STEP;
    }
    return r.v;
  };
  const bests = [];
  const winners = [];
  for (let i = 0; i < 100; i++) {
    const field = Array.from({ length: 5 }, () => {
      const ok = Array.from({ length: LJ.rounds }, () => rivalJump(lv, LJ, runUp)).filter((j) => !j.foul).map((j) => j.mark);
      return ok.length ? Math.max(...ok) : 0;
    });
    bests.push(...field);
    winners.push(Math.max(...field));
  }
  bests.sort((a, b) => a - b);
  winners.sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.floor(p * (arr.length - 1))].toFixed(2);
  console.log(`${level.padEnd(8)} rival best-of-3 median ${q(bests, 0.5)}; winner median ${q(winners, 0.5)}, top 10% ${q(winners, 0.9)}`);
}

// ---------------------------------------------------------------- pole vault

const PV = CONFIG.poleVault;
const pvPlantX = -Math.sqrt(PV.pole.length ** 2 - PV.pole.gripY ** 2);
/** Speed at the plant after a run-up tapping at `rate` (or driven by `ai`). */
function pvRunUp(rate, level = null) {
  const r = new Runner(undefined, undefined, -PV.runway);
  const ai = level && new AIController(r, level);
  if (ai) ai.go(0);
  else r.go(0);
  let t = 0;
  let next = 0.25;
  while (r.x < pvPlantX && t < 20) {
    if (pvPlantX - r.x <= PV.zoneDistance) r.carry();
    else if (ai) ai.update(t, STEP, 0, Infinity);
    else if (t >= next) {
      r.stride(t);
      next += 1 / rate;
    }
    r.update(STEP, t);
    t += STEP;
  }
  return r.v;
}
/** A player pressing with timing error sd `psd` and releasing with sd `rsd` (s). */
function pvPlayer(rate, psd, rsd) {
  const v = pvRunUp(rate);
  const vaults = Array.from({ length: PV.rounds }, () => {
    const pe = gauss(0, psd);
    if (Math.abs(pe) > PV.press.miss) return null; // missed the plant: no height
    return vaultHeight({ v, pq: pressQuality(pe, PV.press), rq: releaseQuality(releaseTarget(PV) + gauss(0, rsd), PV) }, PV);
  });
  const ok = vaults.filter((h) => h != null);
  return { v, best: ok.length ? Math.max(...ok) : 0, fails: vaults.length - ok.length };
}
console.log(`\nPOLE VAULT (best of 3; plant ±sd = press timing error, release ±sd = let-go error; world record 6.95)`);
for (const [label, rate, psd, rsd] of [
  ['casual   3.0/s, plant ±0.12s, release ±0.12s', 3.0, 0.12, 0.12],
  ['good     3.7/s, plant ±0.07s, release ±0.07s', 3.7, 0.07, 0.07],
  ['expert   4.7/s, plant ±0.04s, release ±0.04s', 4.7, 0.04, 0.04],
  ['perfect  5.2/s, plant ±0.01s, release ±0.01s', 5.2, 0.01, 0.01],
]) {
  const res = Array.from({ length: 200 }, () => pvPlayer(rate, psd, rsd));
  const bests = res.filter((r) => r.best > 0).map((r) => r.best);
  const avg = bests.reduce((a, b) => a + b, 0) / bests.length;
  const v = res.reduce((a, r) => a + r.v, 0) / res.length;
  const fails = res.reduce((a, r) => a + r.fails, 0) / (res.length * PV.rounds);
  console.log(`${label.padEnd(48)} plant speed ${v.toFixed(1)} m/s   best ${avg.toFixed(2)}m   no height ${(fails * 100).toFixed(0)}%`);
}
for (const level of ['amateur', 'pro']) {
  const lv = { ...CONFIG.ai[level], ...PV.ai[level] };
  const runUp = () => pvRunUp(0, lv);
  const bests = [];
  const winners = [];
  for (let i = 0; i < 100; i++) {
    const field = Array.from({ length: 5 }, () => {
      const ok = Array.from({ length: PV.rounds }, () => rivalVault(lv, PV, runUp)).filter((j) => !j.fail).map((j) => j.mark);
      return ok.length ? Math.max(...ok) : 0;
    });
    bests.push(...field);
    winners.push(Math.max(...field));
  }
  bests.sort((a, b) => a - b);
  winners.sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.floor(p * (arr.length - 1))].toFixed(2);
  console.log(`${level.padEnd(8)} rival best-of-3 median ${q(bests, 0.5)}; winner median ${q(winners, 0.5)}, top 10% ${q(winners, 0.9)}`);
}

// ---------------------------------------------------------------- javelin

const JV = CONFIG.javelin;
/** Speed arriving at the line after a run-up tapping at `rate` (or driven by `level`'s AI). */
function jvRunUp(rate, level = null) {
  const r = new Runner(undefined, undefined, -JV.runway);
  const ai = level && new AIController(r, level);
  if (ai) ai.go(0);
  else r.go(0);
  let t = 0;
  let next = 0.25;
  while (r.x < -1 && t < 20) {
    if (-r.x <= JV.zoneDistance) r.carry();
    else if (ai) ai.update(t, STEP, 0, Infinity);
    else if (t >= next) {
      r.stride(t);
      next += 1 / rate;
    }
    r.update(STEP, t);
    t += STEP;
  }
  return r.v;
}
/** A player letting go `aim` s before the line (timing error sd `sd`), angle off by sd `asd` deg. */
function jvPlayer(rate, aim, sd, asd) {
  const v = jvRunUp(rate);
  const throws = Array.from({ length: JV.rounds }, () => {
    const gap = v * gauss(aim, sd);
    if (gap < 0) return null;
    return throwMark({ releaseX: -gap, v, deg: JV.angle.best + gauss(0, asd) }, JV);
  });
  const ok = throws.filter((j) => j != null);
  return { v, best: ok.length ? Math.max(...ok) : 0, fouls: throws.length - ok.length };
}
console.log('\nJAVELIN (best of 3; aim = how early you let go, ±sd timing; angle ±deg; world record 104.80)');
for (const [label, rate, aim, sd, asd] of [
  ['casual   3.0/s, aim 0.12s ±0.08, angle ±12°', 3.0, 0.12, 0.08, 12],
  ['good     3.7/s, aim 0.07s ±0.05, angle ±7°', 3.7, 0.07, 0.05, 7],
  ['expert   4.7/s, aim 0.04s ±0.03, angle ±4°', 4.7, 0.04, 0.03, 4],
  ['perfect  5.2/s, aim 0.02s ±0.01, angle ±1°', 5.2, 0.02, 0.01, 1],
]) {
  const res = Array.from({ length: 200 }, () => jvPlayer(rate, aim, sd, asd));
  const bests = res.filter((r) => r.best > 0).map((r) => r.best);
  const avg = bests.reduce((a, b) => a + b, 0) / bests.length;
  const v = res.reduce((a, r) => a + r.v, 0) / res.length;
  const fouls = res.reduce((a, r) => a + r.fouls, 0) / (res.length * JV.rounds);
  console.log(`${label.padEnd(48)} speed ${v.toFixed(1)} m/s   best ${avg.toFixed(2)}m   fouls ${(fouls * 100).toFixed(0)}%`);
}
for (const level of ['amateur', 'pro']) {
  const lv = { ...CONFIG.ai[level], ...JV.ai[level] };
  const runUp = () => jvRunUp(0, lv);
  const bests = [];
  const winners = [];
  for (let i = 0; i < 100; i++) {
    const field = Array.from({ length: 5 }, () => {
      const ok = Array.from({ length: JV.rounds }, () => rivalThrow(lv, JV, runUp)).filter((j) => !j.foul).map((j) => j.mark);
      return ok.length ? Math.max(...ok) : 0;
    });
    bests.push(...field);
    winners.push(Math.max(...field));
  }
  bests.sort((a, b) => a - b);
  winners.sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.floor(p * (arr.length - 1))].toFixed(2);
  console.log(`${level.padEnd(8)} rival best-of-3 median ${q(bests, 0.5)}; winner median ${q(winners, 0.5)}, top 10% ${q(winners, 0.9)}`);
}

// ---------------------------------------------------------------- 4x100m relay
const RC = CONFIG.relay;

/**
 * One team, every leg on the same thumbs: `level` drives the strides (a CONFIG.ai
 * level, or a steady player). `exchange` is how they pass: { passAt, takeAt } gaps
 * in m (a player), CONFIG.relay.ai.<level> (a rival), or 'none' (never: all missed).
 */
function relayRace(level, exchange) {
  const legs = [0, 1, 2, 3].map((k) => new Runner(undefined, undefined, k === 0 ? CONFIG.sprint100.startX : exchangeSpot(RC, k - 1).wait));
  const ais = legs.map((r) => new AIController(r, level));
  const exs = [0, 1, 2].map((k) => {
    const ex = new Exchange(RC, k, legs[k], legs[k + 1], exchange.passGap ? exchange : null);
    if (!exchange.passGap) Object.assign(ex, { ai: {}, ...(exchange === 'none' ? { passAt: -1, takeAt: -1 } : exchange) });
    return ex;
  });
  ais[0].go(0);
  let leg = 0;
  for (let t = 0; t < RC.maxRaceTime; t += STEP) {
    const r = legs[leg];
    if (leg === 3 || exs[leg].stage === 'approach') {
      if (leg === 3 && RC.distance - r.x <= DIP.promptDistance && r.mode === 'run' && !r.dipUsed) r.carry();
      ais[leg].update(t, STEP, (r.x - leg * LEG) / LEG, RC.distance - r.x);
      r.update(STEP, t);
    }
    for (const ex of exs) {
      if (ex.step(t, STEP) !== 'handoff') continue;
      leg = ex.k + 1;
      ais[leg].nextTapT = t + STEP + 1 / ais[leg].cadence;
    }
    for (const l of legs) if (l.finished && l !== legs[leg]) l.update(STEP, t);
    const cross = leg === 3 ? legs[3].crossing(RC.distance, t, STEP) : null;
    if (cross != null) return { time: cross, exs };
  }
  return { time: null, exs };
}

console.log('\n4x100m RELAY (steady player, every exchange the same; the 100m’s 8.9s record is about 4.15 taps/s)');
const steady = (rate) => ({ ...CONFIG.ai.pro, cadence: [rate, rate], jitter: 0, missChance: 0, reaction: [0.2, 0.2], dipError: [0, 0], fatigue: 0 });
for (const [label, pass, take] of [
  ['PASS at 2.4m, TAKE at full reach (perfect)', 2.4, RC.reach - 0.05],
  ['PASS at 2.4m, TAKE at 1.1m (good)', 2.4, 1.1],
  ['PASS at 2.4m, TAKE at 0.7m (late)', 2.4, 0.7],
  ['never pass (all missed)', null, null],
]) {
  const times = [3.6, 4.15].map((rate) => relayRace(steady(rate), pass == null ? 'none' : { passAt: pass, takeAt: take }));
  const zone = times[1].exs.map((ex) => (ex.tOut - ex.tIn).toFixed(2)).join(' ');
  console.log(`${label.padEnd(46)} 3.6/s ${times[0].time.toFixed(2)}s   4.15/s ${times[1].time.toFixed(2)}s   zone ${zone}`);
}
for (const level of ['amateur', 'pro']) {
  const runs = Array.from({ length: 200 }, () => relayRace(CONFIG.ai[level], RC.ai[level]));
  const grades = {};
  for (const r of runs) for (const ex of r.exs) grades[ex.grade] = (grades[ex.grade] ?? 0) + 1;
  const times = runs.map((r) => r.time).sort((a, b) => a - b);
  const share = Object.entries(grades).map(([g, n]) => `${g} ${Math.round((100 * n) / (runs.length * 3))}%`).join(', ');
  console.log(`${level.padEnd(8)} team median ${times[100].toFixed(2)}s, best ${times[0].toFixed(2)}s; exchanges: ${share}`);
}

// ---------------------------------------------------------------- time trial
const CC = CONFIG.cycling;
const ttRoad = buildCourse(CC.course);

/**
 * A steady rider tapping at `rate`: `shift` 'ideal' keeps the pedals near
 * their best (or as fast as `rate` allows), a number stays in that gear;
 * `tuck` tucks once a descent spins them out in top gear.
 */
function ttRide(rate, shift, tuck) {
  const b = new Bike(CC, ttRoad);
  b.start(0);
  let next = 0.2;
  let side = 'L';
  for (let t = 0; t < CC.maxTime; t += STEP) {
    b.tuck = tuck && b.grade < -0.03 && b.gear === CC.gears.length - 1 && b.v / CC.gears.at(-1) > rate * 0.97;
    for (; next < t + STEP; next += 1 / rate) {
      if (b.tuck) continue;
      b.stroke(side, next);
      side = side === 'L' ? 'R' : 'L';
    }
    const want = shift === 'ideal' ? gearFor(CC.gears, b.v, Math.min(CC.cMax / 2, rate * 0.9)) : shift;
    if (want !== b.gear && !b.tuck) b.shift(Math.sign(want - b.gear));
    if (ttRoad.length - b.front <= idealThrow(b)) b.throwBike();
    b.update(STEP, t);
    const cross = b.crossing(ttRoad.length, t, STEP);
    if (cross != null) return cross;
  }
  return null;
}

console.log(`\nTIME TRIAL (${CC.course.length}m; steady tapping; ideal = shifting to keep the pedals at their best)`);
for (const rate of [3.4, 4.0, 4.6]) {
  const r = (shift, tuck) => ttRide(rate, shift, tuck).toFixed(2);
  console.log(`${rate}/s: ideal + tuck ${r('ideal', true)}s   no tuck ${r('ideal', false)}s   stuck in gear 3 ${r(2, true)}s, gear 5 ${r(4, true)}s, gear 8 ${r(7, true)}s`);
}
for (const level of ['amateur', 'pro']) {
  const times = Array.from({ length: 200 }, () => {
    const b = new Bike(CC, ttRoad);
    const ai = new BikeAI(b, CC.ai[level]);
    ai.go(0);
    for (let t = 0; t < CC.maxTime; t += STEP) {
      ai.update(t, STEP);
      b.update(STEP, t);
      const cross = b.crossing(ttRoad.length, t, STEP);
      if (cross != null) return cross;
    }
    return CC.maxTime;
  }).sort((a, b) => a - b);
  console.log(`${level.padEnd(8)} rival median ${times[100].toFixed(2)}s, best ${times[0].toFixed(2)}s`);
}
