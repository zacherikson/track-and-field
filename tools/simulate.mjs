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
  const r = new Runner();
  const j = new StrideTargets(r, TGT);
  r.go(0);
  j.start(0);
  const reaction = 0.2; // to the gun, on top of reading the first target
  const state = { target: j.target, readyT: reaction, lastPressT: reaction, targetWasForced: false };
  let queue = strategy(state);
  let t = 0;
  while (t < 40) {
    if (D - r.x <= DIP.promptDistance) r.carry();
    if (r.mode === 'carry' && D - r.x <= r.idealDipDistance()) r.dive();
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
  const r = new Runner();
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

console.log(`\nFINISH DIP from 10.5 m/s (meters early vs. ideal, ideal ≈ ${(10.5 * DIP.riseTime + DIP.reach).toFixed(1)}m out)`);
function dipRace(errM) {
  const r = new Runner();
  r.started = true;
  r.v = 10.5;
  r.x = D - DIP.promptDistance;
  r.mode = 'carry';
  let t = 0;
  while (t < 10) {
    if (errM != null && r.mode === 'carry' && D - r.x <= r.idealDipDistance() + errM) r.dive();
    if (r.mode === 'run') r.stride(t); // got up after a crash: keep running
    r.update(STEP, t);
    const c = r.crossing(D, t, STEP);
    if (c != null) return c;
    t += STEP;
  }
}
const base = dipRace(null);
for (const e of [-2, -1, 0, 1, 2, 3, 4, 6]) {
  const d = dipRace(e) - base;
  console.log(`  ${(e >= 0 ? '+' : '') + e}m`.padEnd(8) + ` ${(d >= 0 ? '+' : '') + d.toFixed(3)}s vs no dip`);
}
