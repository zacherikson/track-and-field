// Headless tuning tool: runs races through the real Runner physics and prints
// finish times, so you can see what a config change does before touching a phone.
//
//   node tools/simulate.mjs
//
import { CONFIG } from '../src/config.js';
import { Runner } from '../src/athletes/runner.js';
import { AIController } from '../src/athletes/ai.js';

const STEP = CONFIG.loop.fixedStep;
const D = CONFIG.sprint100.distance;

const DIP = CONFIG.dip;

function race(level, cadence) {
  const r = new Runner();
  const ai = new AIController(r, level, cadence);
  ai.go(0);
  let t = 0;
  let splits = {};
  while (t < 40) {
    if (D - r.x <= DIP.promptDistance) r.carry();
    ai.update(t, STEP, r.x / D, D - r.x);
    r.update(STEP, t);
    for (const m of [10, 30, 60]) if (splits[m] == null && r.x >= m) splits[m] = t;
    const cross = r.crossing(D, t, STEP);
    if (cross != null) return { time: cross, splits, top: r.v };
    t += STEP;
  }
  return { time: Infinity, splits, top: r.v };
}

const human = { reaction: [0.22, 0.22], jitter: 0.1, fatigue: 0.03, dipError: [0, 0] };
console.log('Player-like tapper (0.22s reaction, 10% jitter):');
console.log('taps/s   time    10m    30m    60m   km/h at line');
for (const c of [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) {
  const runs = Array.from({ length: 20 }, () => race(human, c));
  const avg = (f) => runs.reduce((s, x) => s + f(x), 0) / runs.length;
  console.log(
    `${String(c).padStart(5)}  ${avg((x) => x.time).toFixed(2).padStart(6)} ${avg((x) => x.splits[10]).toFixed(2).padStart(6)} ` +
      `${avg((x) => x.splits[30]).toFixed(2).padStart(6)} ${avg((x) => x.splits[60]).toFixed(2).padStart(6)}   ${(avg((x) => x.top) * 3.6).toFixed(1)}`,
  );
}

console.log('\nFinish dip timing at 12 taps/s (dip = meters early vs. ideal; ideal is about ' +
  `${(10.5 * DIP.riseTime + DIP.reach).toFixed(1)}m out at top speed):`);
const at12 = (dipError) => {
  const runs = Array.from({ length: 20 }, () => race({ ...human, dipError: [dipError, dipError] }, 12));
  return runs.reduce((s, x) => s + x.time, 0) / runs.length;
};
const noDip = at12(-99);
console.log(`  no dip       ${noDip.toFixed(3)}`);
for (const e of [-2, -1, -0.5, 0, 0.5, 1, 2, 3, 4, 6]) {
  const tm = at12(e);
  console.log(`  ${(e >= 0 ? '+' : '') + e}m`.padEnd(13) + ` ${tm.toFixed(3)}  (${(tm - noDip >= 0 ? '+' : '') + (tm - noDip).toFixed(3)})`);
}

for (const name of Object.keys(CONFIG.ai)) {
  const level = CONFIG.ai[name];
  const winners = [];
  const all = [];
  for (let i = 0; i < 300; i++) {
    const times = Array.from({ length: CONFIG.sprint100.lanes - 1 }, () => race(level).time);
    winners.push(Math.min(...times));
    all.push(...times);
  }
  winners.sort((a, b) => a - b);
  all.sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.floor(p * (arr.length - 1))].toFixed(2);
  console.log(
    `\nAI ${name}: individual times ${q(all, 0)}–${q(all, 1)} (median ${q(all, 0.5)}); ` +
      `winning time median ${q(winners, 0.5)}, fastest 10% ${q(winners, 0.1)}`,
  );
}
