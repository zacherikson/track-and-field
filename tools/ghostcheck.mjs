// Checks that a recorded 100m run replays to exactly the same time as a ghost.
// Races simulated players the way the live game does (laneRace.js order: gun,
// inputs, lean-zone check, physics), records them, replays them, compares.
//
//   node tools/ghostcheck.mjs
//
// Run it after changing runner.js or laneRace.js. If it fails, ghosts saved by
// older builds won't replay faithfully either: bump GHOST_VERSION in ghost.js.
import { CONFIG } from '../src/config.js';
import { Runner } from '../src/athletes/runner.js';
import { StrideTargets } from '../src/events/strideTargets.js';
import { GhostRecorder, replayMark } from '../src/online/ghost.js';

const STEP = CONFIG.loop.fixedStep;
const cfg = CONFIG.sprint100;
const D = cfg.distance;
const prompt = cfg.dipPromptDistance ?? CONFIG.dip.promptDistance;

function liveRace() {
  const r = new Runner(undefined, undefined, cfg.startX);
  const judge = new StrideTargets(r, cfg.targets);
  const rec = new GhostRecorder(r, { step: STEP, distance: D, startX: cfg.startX, prompt });
  let t = 3 + Math.random() * 5; // the sim clock, as if the menu ran for a while
  t = Math.round(t / STEP) * STEP;
  const goT = t + Math.random() * 2; // the gun lands anywhere inside a step
  while (t + STEP < goT) t += STEP;
  const gap = 0.14 + Math.random() * 0.12;
  const leanAt = 1 + Math.random() * 4; // m before the line
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
    // Inputs delivered this step (a phone delivers them a little late, so some
    // are timestamped in an earlier step).
    while (nextPress < t + STEP) {
      if (r.mode === 'run') {
        const side = Math.random() < 0.05 ? (judge.target === 'L' ? 'R' : 'L') : judge.target;
        judge.press(side, nextPress - Math.random() * 0.01);
      } else if (r.mode === 'carry' && !leaned && D - r.x <= leanAt) {
        leaned = r.lean();
      }
      nextPress += gap * (0.8 + Math.random() * 0.4);
    }
    if (D - r.x <= prompt && r.mode === 'run' && !r.dipUsed) r.carry();
    r.update(STEP, t);
    const cross = r.crossing(D, t, STEP);
    if (cross != null) mark = cross - goT;
  }
  return rec.data(mark);
}

let worst = 0;
const N = 200;
for (let i = 0; i < N; i++) {
  const run = liveRace();
  const replay = JSON.parse(JSON.stringify(run)); // as saved and loaded
  const diff = Math.abs(replayMark(replay) - run.mark);
  worst = Math.max(worst, diff);
}
console.log(`${N} runs replayed; worst time difference ${worst.toExponential(2)} s`);
if (!(worst < 1e-6)) {
  console.error('FAIL: ghosts no longer replay their recorded time');
  process.exit(1);
}
console.log('OK');
