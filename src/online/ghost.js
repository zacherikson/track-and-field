import { Runner } from '../athletes/runner.js';

/**
 * GHOSTS: a recorded run that races again later, see-through, in another lane.
 *
 * A Runner only ever changes through stride(t), stumble(loss, t) and lean() (see
 * runner.js), so a run is fully described by those calls, the physics step each
 * one landed in, and the physics numbers that were in force. Replaying the same
 * calls through a fresh Runner on the same step grid reproduces the run, and its
 * time, exactly. The stride targets, the rivals and the phone's frame rate don't
 * matter to the replay.
 *
 * Times are stored relative to the gun. `off` is where the step grid sat relative
 * to the gun: the race's first physics step started `off` seconds after GO
 * (-step < off <= 0), so the replay steps at exactly the same moments.
 *
 * The physics numbers travel with the run, so a ghost replays the same on a phone
 * with different tuning. Bump GHOST_VERSION when runner.js's physics code (not
 * its numbers) changes: older ghosts would no longer replay faithfully.
 *
 * Stored shape (plain JSON, and Firestore-friendly: no nested arrays):
 *   { v, mark, off, step, distance, startX, prompt, athlete, runner: {...}, dip: {...},
 *     ev: [n, t, code, value, n, t, code, value, ...] }
 * n = physics step since the gun, t = seconds since the gun,
 * code 0 = stride, 1 = stumble (value = speed lost), 2 = lean.
 *
 * Pure logic (no DOM), so it can run in Node.
 */
export const GHOST_VERSION = 1;
export const MAX_EVENTS = 1000; // a 100m run is ~60 events; this is a sanity cap for data from the network

const CODES = { stride: 0, stumble: 1, lean: 2 };
const STRIDE = 0;
const STUMBLE = 1;
const LEAN = 2;

/** Listens to the player's Runner during a race and packs what it did into a ghost. */
export class GhostRecorder {
  /** @param track { step, distance, startX, prompt, athlete } where prompt = the lean zone's length in m, athlete = the runner's character id */
  constructor(runner, track) {
    this.runner = runner;
    this.track = track;
    this.n = 0; // the physics step the race is on; the scene keeps this current
    this.start(0, 0);
    runner.onEvent = (kind, t, value = 0) => {
      this.ev.push(this.n, t == null ? 0 : t - this.goT, CODES[kind], value);
    };
  }

  /** The gun fired at goT; the first race step started `off` s after it. */
  start(goT, off) {
    this.goT = goT;
    this.off = off;
    this.n = 0;
    this.ev = [];
    // Snapshot the physics now: the Runner reads the live CONFIG objects, which tuning can change.
    this.params = { ...this.runner.p };
    this.dip = { ...this.runner.dip };
  }

  /** The finished run, ready to save or upload. `mark` = the player's time. */
  data(mark) {
    const { step, distance, startX, prompt, athlete = null } = this.track;
    return { v: GHOST_VERSION, mark, off: this.off, step, distance, startX, prompt, athlete, runner: this.params, dip: this.dip, ev: [...this.ev] };
  }
}

/** Replays a recorded run through its own Runner, on its own step grid. */
export class GhostRun {
  constructor(data) {
    this.data = data;
    this.runner = new Runner(data.runner, data.dip, data.startX);
    this.reset();
  }

  reset() {
    this.runner.reset();
    this.started = false;
    this.n = 0;
    this.i = 0;
    this.mark = null; // seconds after the gun, once the chest crosses the line
  }

  /** The gun. */
  go() {
    this.started = true;
  }

  /** Run every ghost step that starts by `raceT` s after the gun. */
  advanceTo(raceT) {
    const d = this.data;
    const maxSteps = 120 / d.step; // two minutes: far past any finish
    while (this.started && this.n < maxSteps && d.off + (this.n + 1) * d.step <= raceT + 1e-9) this.stepOnce();
  }

  /**
   * One physics step, in the same order as the live race (laneRace.js): the gun,
   * then this step's inputs, then the lean-zone check, then the Runner.
   */
  stepOnce() {
    const d = this.data;
    const r = this.runner;
    const ev = d.ev;
    const t = d.off + this.n * d.step;
    if (this.n === 0) r.go(0);
    while (this.i < ev.length && ev[this.i] <= this.n) {
      const et = ev[this.i + 1];
      const code = ev[this.i + 2];
      if (code === STRIDE) r.stride(et);
      else if (code === STUMBLE) r.stumble(ev[this.i + 3], et);
      else if (code === LEAN) r.lean();
      this.i += 4;
    }
    if (d.distance - r.x <= d.prompt && r.mode === 'run' && !r.dipUsed) r.carry();
    r.update(d.step, t);
    const cross = r.crossing(d.distance, t, d.step);
    if (cross != null && this.mark == null) {
      this.mark = cross;
      r.finished = true;
    }
    this.n++;
  }
}

/** Replays a run to the line without drawing it; returns its time (or null if it never finishes). */
export function replayMark(data) {
  const g = new GhostRun(data);
  g.go();
  while (g.mark == null && g.n < 120 / data.step) g.stepOnce();
  return g.mark;
}

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const numbers = (o, like) => o && typeof o === 'object' && Object.keys(like).every((k) => typeof like[k] !== 'number' || finite(o[k]));

/**
 * True if `data` is a ghost this version can replay. Ghosts can come from the
 * network, so check the shape before handing it to the physics. `like` gives the
 * runner and dip keys that must be present (the live CONFIG objects).
 */
export function isReplayable(data, like) {
  if (!data || typeof data !== 'object' || data.v !== GHOST_VERSION) return false;
  if (![data.mark, data.off, data.step, data.distance, data.startX, data.prompt].every(finite)) return false;
  if (data.step < 1 / 1000 || data.step > 1 / 30 || data.off > 0 || data.off < -data.step) return false;
  if (!numbers(data.runner, like.runner) || !numbers(data.dip, like.dip)) return false;
  const ev = data.ev;
  return Array.isArray(ev) && ev.length % 4 === 0 && ev.length <= MAX_EVENTS * 4 && ev.every(finite);
}

// The ghost picked on the leaderboard to race next ({ name, data }), until the
// player goes back to the menu. Without one, the 100m races your own best run.
let chosen = null;

export function chooseGhost(ghost) {
  chosen = ghost;
}

export function chosenGhost() {
  return chosen;
}
