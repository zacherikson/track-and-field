/**
 * 110m Hurdles rules, from footage of the original (clean runs and failing ones).
 *
 * Pure logic (no DOM), shared by the game and tools/simulate.mjs.
 *
 * BUTTON SETS. At GO, and every time you go over a hurdle, a new set of three
 * numbered buttons appears in three slots (left, centre, right) in a shuffled
 * order. Always tap the LOWEST number still showing:
 * - right: a stride; the button vanishes with a ring;
 * - wrong: that button turns into a red ✕ and is lost (you never get that
 *   stride), you stumble a little, and you carry on with what's left.
 * Once no buttons are left you CRUISE: you keep the pace you set until the
 * next hurdle, where the next set appears.
 *
 * HURDLES are jumped automatically. At takeoff, count the set's FAULTS: buttons
 * lost to wrong taps plus buttons still untapped. One fault is forgiven; with
 * `tripFaults` (2) or more, or if you're slower than `minSpeed`, you TRIP: you
 * go over the hurdle low, sprawl on the track (crawling at `trip.speed`), get
 * up and have to build speed again. The hurdle stays up. A clean clearance
 * costs a little speed.
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
    this.state = ['live', 'live', 'live']; // per slot: 'live' | 'hit' | 'lost'
    this.lostT = [0, 0, 0]; // when each slot was lost (its ✕ shows briefly)
    this.shownT = -Infinity;
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.setTimes = []; // s from each clean set appearing to its last tap
  }

  /** The number you should tap now: the lowest one still showing. */
  get next() {
    if (!this.slots) return null;
    const live = this.slots.filter((n, i) => this.state[i] === 'live');
    return live.length ? Math.min(...live) : null;
  }

  get done() {
    return this.next == null;
  }

  /** Lost buttons plus untapped ones: two or more at a hurdle and you trip. */
  get faults() {
    if (!this.slots) return 0;
    return this.state.filter((s) => s !== 'hit').length;
  }

  /** A new shuffled set at time t (GO or a hurdle). */
  start(t) {
    this.slots = shuffled(this.rng);
    this.state = ['live', 'live', 'live'];
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
    if (this.state[slot] !== 'live') return 'cleared slot';
    if (this.slots[slot] !== this.next) {
      this.misses++;
      this.state[slot] = 'lost';
      this.lostT[slot] = t;
      this.runner.stumble(this.cfg.missSpeedLoss, t);
      this.finishIfDone(t);
      return 'miss';
    }
    if (this.runner.stride(t) !== 'ok') return 'not running';
    this.hits++;
    this.state[slot] = 'hit';
    this.finishIfDone(t);
    return 'hit';
  }

  finishIfDone(t) {
    if (!this.done) return;
    this.runner.cruise = true; // hold this pace to the next hurdle
    if (this.faults === 0) this.setTimes.push(t - this.shownT);
  }
}

/** One runner's way down the hurdle course. */
export class HurdleRun {
  constructor(positions, clear) {
    this.positions = positions;
    this.clear = clear;
    this.next = 0; // index of the next hurdle to take off for
    this.hop = null; // { i, x0, x1, trip, t0 } while going over a hurdle
    this.tripT = -Infinity; // when the last trip started (for the animation)
    this.trips = 0;
  }

  /** How far through the current hop (0..1), or null when not hurdling. */
  hopProgress(x) {
    if (!this.hop) return null;
    return Math.min(1, Math.max(0, (x - this.hop.x0) / (this.hop.x1 - this.hop.x0)));
  }

  /** Seconds since the current trip started, or null if not tripping. */
  tripAge(t) {
    const age = t - this.tripT;
    const tr = this.clear.trip;
    return age >= 0 && age < tr.over + tr.down + tr.up ? age : null;
  }

  /**
   * Call after each physics step with the current set's fault count. Returns
   * null, or { trip, last } at the moment of a takeoff.
   */
  update(r, t, faults) {
    if (this.hop && (r.x >= this.hop.x1 || this.hop.trip)) this.hop = null; // a trip replaces the hop
    if (this.hop || this.next >= this.positions.length) return null;
    const c = this.clear;
    const hx = this.positions[this.next];
    if (r.x < hx - c.takeoff) return null;
    const trip = faults >= c.tripFaults || r.v < c.minSpeed;
    this.next++;
    if (trip) {
      this.trips++;
      this.tripT = t;
      // Over the hurdle low at full speed, then down on the track and up again.
      r.fall(t + c.trip.over, c.trip.down + c.trip.up, c.trip.speed);
    } else {
      this.hop = { i: this.next - 1, x0: hx - c.takeoff, x1: hx + c.landing, trip, t0: t };
      r.v = Math.max(0, r.v - c.cleanLoss);
    }
    return { trip, last: this.next >= this.positions.length };
  }
}

const rand = (a, b, rng) => a + (b - a) * rng();

/**
 * A rival's thumbs: when a set appears it reads it (`setReact` s), then taps
 * the three buttons `tapGap` s apart (with jitter). Now and then it taps a
 * wrong number and loses that button, as the player does. Leans for the line
 * like the 100m AI.
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
    this.lost = 0;
  }

  // Kept for LaneRace, which reuses a rival's pace between races.
  get cadence() {
    return this.skill;
  }

  get done() {
    return this.queue.length === 0;
  }

  get faults() {
    return this.lost + this.queue.length;
  }

  go(t) {
    this.runner.go(t);
    this.start(t + this.reaction - this.skill.setReact * 0.5); // reacting to the gun overlaps reading the first set
  }

  start(t) {
    const jit = () => 1 + (this.rng() * 2 - 1) * this.level.jitter;
    const t1 = t + this.skill.setReact * jit();
    this.queue = [t1, t1 + this.skill.tapGap * jit(), t1 + this.skill.tapGap * (1 + jit())];
    this.lost = 0;
    this.runner.cruise = false;
    this.runner.restartInterval(t);
  }

  stop() {
    this.queue = [];
    this.lost = 0;
    this.runner.cruise = true;
  }

  update(t, dt, progress, toLine = Infinity) {
    const r = this.runner;
    if (r.mode === 'carry' && toLine <= r.idealDipDistance() + this.dipError) r.lean();
    while (this.queue.length && this.queue[0] < t + dt) {
      const tt = this.queue.shift();
      if (this.rng() < this.level.missChance) {
        this.lost++; // wrong number: that button is gone
        r.stumble(this.level.missSpeedLoss, tt);
      } else {
        r.stride(tt);
      }
      if (!this.queue.length) r.cruise = true;
    }
  }
}
