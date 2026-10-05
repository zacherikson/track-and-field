import { CONFIG } from '../config.js';
import { Runner } from '../athletes/runner.js';
import { GhostRun, GHOST_VERSION, MAX_EVENTS } from './ghost.js';

/**
 * Another player's runner in a live race (live.js), replayed from their inputs
 * as they arrive.
 *
 * Their phone sends what a 100m ghost records (online/ghost.js) plus `n`, how
 * many physics steps it has run: every input up to there is included. So the
 * replay can run exactly up to step `n` and no further; `done` means nothing
 * more will come (they've crossed the line). Their time is worked out here,
 * exactly, from the same physics.
 *
 * Their inputs arrive a little after they happen, so the replay is always a
 * moment behind. To show them where they really are now, the drawing carries
 * on at their current speed from the last step it knows (`dx`), and eases
 * back when the next update lands, so they don't jump. Their legs carry on
 * with it (`dphase`: the strides that distance takes), or they'd stop between
 * updates and jump on when one lands.
 */
const MAX_AHEAD = 0.75; // s: the furthest ahead of the known replay the drawing guesses
const EASE = 8; // per s: how quickly the drawing settles onto a correction

export class LiveRun {
  constructor(startX) {
    this.runner = new Runner(undefined, undefined, startX); // stands at the line until their first update
    this.ghost = null;
    this.known = 0; // steps of theirs that can be replayed
    this.mark = null;
    this.left = false;
    this.heardAt = null; // this phone's clock (ms) at their last update
    this.shownX = null;
    this.dx = 0;
    this.dphase = 0;
  }

  get done() {
    return this.known === Infinity;
  }

  /** Their latest doc (live.js) for race `stage`. Returns false if it can't be used. */
  receive(doc, stage, nowMs = Date.now()) {
    if (doc?.left) this.left = true;
    if (doc?.s !== stage) return false; // not on this race (yet)
    const run = doc.run;
    if (!usable(run) || !Number.isFinite(doc.n)) return false;
    this.heardAt = nowMs;
    if (!this.ghost) {
      this.ghost = new GhostRun(run);
      this.ghost.go();
      this.runner = this.ghost.runner;
    } else {
      this.ghost.data = { ...this.ghost.data, ev: run.ev }; // their physics numbers were fixed at the gun
    }
    this.known = doc.done ? Infinity : Math.max(this.known, doc.n);
    return true;
  }

  /** Replays every step they've sent that starts by `raceT` s after the gun, and moves the drawing along. */
  advanceTo(raceT, dt) {
    const g = this.ghost;
    if (!g) return;
    const d = g.data;
    const cap = Math.min(this.known, 120 / d.step);
    while (g.n < cap && d.off + (g.n + 1) * d.step <= raceT + 1e-9) g.stepOnce();
    if (g.mark != null) this.mark = g.mark;
    // Where they probably are now: the last known step, carried on at its speed.
    const r = g.runner;
    const behind = this.done ? 0 : Math.min(MAX_AHEAD, Math.max(0, raceT - (d.off + g.n * d.step)));
    const guess = r.x + r.v * behind;
    this.shownX = this.shownX == null ? guess : this.shownX + r.v * dt;
    this.shownX += (guess - this.shownX) * (1 - Math.exp(-EASE * dt));
    this.dx = this.shownX - r.x;
    this.dphase = (this.dx / (r.p.strideBase + r.p.stridePerMps * r.v)) * Math.PI * 2; // as Runner.update turns distance into stride phase
  }
}

const finite = (x) => typeof x === 'number' && Number.isFinite(x);

/** A run as a live race sends it: like a ghost (ghost.js isReplayable), but unfinished, so no mark yet. */
function usable(run) {
  if (!run || typeof run !== 'object' || run.v !== GHOST_VERSION) return false;
  if (![run.off, run.step, run.distance, run.startX, run.prompt].every(finite)) return false;
  if (run.step < 1 / 1000 || run.step > 1 / 30 || run.off > 0 || run.off < -run.step) return false;
  const numbers = (o, like) => o && typeof o === 'object' && Object.keys(like).every((k) => typeof like[k] !== 'number' || finite(o[k]));
  if (!numbers(run.runner, CONFIG.runner) || !numbers(run.dip, CONFIG.dip)) return false;
  const ev = run.ev;
  return Array.isArray(ev) && ev.length % 4 === 0 && ev.length <= MAX_EVENTS * 4 && ev.every(finite);
}
