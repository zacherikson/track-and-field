/**
 * 110m Hurdles rules, from footage of the original.
 *
 * Pure logic (no DOM), shared by the game and tools/simulate.mjs.
 *
 * BUTTON SETS. At GO, and every time you go over a hurdle, a new set of three
 * numbered buttons appears in three slots (left, centre, right) in a shuffled
 * order. Tap 1, then 2, then 3, wherever they are. Each correct tap is a stride
 * and the button vanishes. A wrong number stumbles you (lose speed); an
 * already-cleared slot does nothing. Once the set is cleared you CRUISE: you
 * keep the pace you set (how fast you cleared it) until the next hurdle, where
 * the next set appears.
 *
 * HURDLES are jumped automatically. At takeoff the hurdle is CLIPPED (knocked
 * over, big speed loss) if you haven't cleared the current set yet, or you're
 * slower than `minSpeed`. A clean clearance costs a little speed.
 */

export const hurdlePositions = (h) => Array.from({ length: h.count }, (_, i) => h.first + i * h.spacing);

function shuffled(rng) {
  const a = [1, 2, 3];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The player's current set of three buttons. */
export class ButtonSet {
  constructor(runner, cfg, rng = Math.random) {
    this.runner = runner;
    this.cfg = cfg;
    this.rng = rng;
    this.slots = null; // e.g. [3, 1, 2]: the number shown in the left, centre and right slot
    this.cleared = [false, false, false];
    this.next = 1;
    this.shownT = -Infinity;
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.setTimes = []; // s from each set appearing to its last tap
  }

  get done() {
    return this.slots == null || this.next > 3;
  }

  /** A new shuffled set at time t (GO or a hurdle). */
  start(t) {
    this.slots = shuffled(this.rng);
    this.cleared = [false, false, false];
    this.next = 1;
    this.shownT = t;
    this.sets++;
    this.runner.cruise = false;
    this.runner.restartInterval(t); // the first tap's interval is your reaction to the new set
  }

  /** No more sets (after the last hurdle). */
  stop() {
    this.slots = null;
    this.runner.cruise = true;
  }

  /** Slot 0/1/2 pressed at t. Returns 'hit', 'miss', 'cleared slot', 'no target' or 'not running'. */
  press(slot, t) {
    if (this.done) return 'no target';
    if (this.cleared[slot]) return 'cleared slot';
    if (this.slots[slot] !== this.next) {
      this.misses++;
      this.runner.stumble(this.cfg.missSpeedLoss, t);
      return 'miss';
    }
    if (this.runner.stride(t) !== 'ok') return 'not running';
    this.hits++;
    this.cleared[slot] = true;
    this.next++;
    if (this.next > 3) {
      this.runner.cruise = true; // set cleared: hold this pace to the next hurdle
      this.setTimes.push(t - this.shownT);
    }
    return 'hit';
  }
}

/** One runner's way down the hurdle course. */
export class HurdleRun {
  constructor(positions, clear) {
    this.positions = positions;
    this.clear = clear;
    this.next = 0; // index of the next hurdle to take off for
    this.hop = null; // { i, x0, x1, clip } while going over a hurdle
    this.knocked = new Map(); // hurdle index -> time it was knocked
    this.clips = 0;
  }

  /** How far through the current hop (0..1), or null when not hurdling. */
  hopProgress(x) {
    if (!this.hop) return null;
    return Math.min(1, Math.max(0, (x - this.hop.x0) / (this.hop.x1 - this.hop.x0)));
  }

  /**
   * Call after each physics step with whether the runner's current button set
   * is cleared. Returns null, or { clip, last } at the moment of a takeoff.
   */
  update(r, t, setDone) {
    if (this.hop && r.x >= this.hop.x1) this.hop = null;
    if (this.hop || this.next >= this.positions.length) return null;
    const c = this.clear;
    const hx = this.positions[this.next];
    if (r.x < hx - c.takeoff) return null;
    const clip = !setDone || r.v < c.minSpeed;
    this.hop = { i: this.next, x0: hx - c.takeoff, x1: hx + c.landing, clip };
    this.next++;
    if (clip) {
      this.clips++;
      this.knocked.set(this.hop.i, t);
      r.v = Math.max(0, r.v - c.clipLoss);
    } else {
      r.v = Math.max(0, r.v - c.cleanLoss);
    }
    return { clip, last: this.next >= this.positions.length };
  }
}

const rand = (a, b, rng) => a + (b - a) * rng();

/**
 * A rival's thumbs: when a set appears it reads it (`setReact` s), then taps
 * the three buttons `tapGap` s apart (with jitter), occasionally hitting a
 * wrong number. Leans for the line like the 100m AI.
 */
export class HurdleAI {
  constructor(runner, level, skill = null, rng = Math.random) {
    this.runner = runner;
    this.level = level;
    this.rng = rng;
    // Keep a rival's skill across restarts of the same event.
    this.skill = skill ?? {
      setReact: rand(...level.setReact, rng),
      tapGap: rand(...level.tapGap, rng),
    };
    this.reaction = rand(...level.reaction, rng);
    this.dipError = rand(...level.dipError, rng);
    this.queue = [];
    this.done = true;
  }

  // Kept for LaneRace, which reuses a rival's pace between races.
  get cadence() {
    return this.skill;
  }

  go(t) {
    this.runner.go(t);
    this.start(t + this.reaction - this.skill.setReact * 0.5); // reacting to the gun overlaps reading the first set
  }

  start(t) {
    const jit = () => 1 + (this.rng() * 2 - 1) * this.level.jitter;
    const t1 = t + this.skill.setReact * jit();
    this.queue = [t1, t1 + this.skill.tapGap * jit(), t1 + this.skill.tapGap * (1 + jit())];
    this.done = false;
    this.runner.cruise = false;
    this.runner.restartInterval(t);
  }

  stop() {
    this.queue = [];
    this.done = true;
    this.runner.cruise = true;
  }

  update(t, dt, progress, toLine = Infinity) {
    const r = this.runner;
    if (r.mode === 'carry' && toLine <= r.idealDipDistance() + this.dipError) r.lean();
    while (this.queue.length && this.queue[0] < t + dt) {
      const tt = this.queue.shift();
      if (this.rng() < this.level.missChance) {
        // Hit a wrong number: stumble, then find the right one a beat later.
        r.stumble(this.level.missSpeedLoss, tt);
        this.queue.unshift(tt + this.skill.tapGap * 1.5);
        continue;
      }
      r.stride(tt);
      if (!this.queue.length) {
        this.done = true;
        r.cruise = true;
      }
    }
  }
}
