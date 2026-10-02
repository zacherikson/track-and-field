import { rand } from '../core/math.js';

/**
 * Time trial physics: the road, the bike and the rivals' legs. Pure logic (no
 * DOM), shared by the game and tools/simulate.mjs.
 *
 * PEDALLING. Each tap is a pedal stroke, left and right in turn. The bike's
 * pedal speed is locked to its road speed: c = v / d strokes/s in a gear that
 * goes d m per stroke. The legs push hardest when the pedals are slow and have
 * nothing left at cMax strokes/s (a muscle's force falls with its speed), so
 *
 *   push at the wheel = F0 (1 - c / cMax) / d       power = F0 c (1 - c / cMax)
 *
 * and power peaks at c = cMax / 2, whatever the gear. The gear only decides what
 * road speed that pedal speed is: too big a gear on a climb and the pedals
 * crawl round (you grind, with little power); too small on the flat and they're
 * already as fast as your thumbs can go (you spin out). Your taps set the most
 * the pedals can turn: once they're turning as fast as you tap, you've nothing
 * to push against and you freewheel. So: tap a steady rhythm, and shift to keep
 * the pedals near cMax / 2.
 *
 * Against you: the hill (gravity along the road), rolling resistance and air
 * drag (v², less tucked). Hold both thumbs to tuck: no pedalling, less drag,
 * which is quicker than pedalling once a descent spins you out.
 */

export const G = 9.81;

/** The road from CONFIG.cycling.course: its gradient and height at any distance. */
export function buildCourse(course) {
  const pts = course.grade;
  const gradeAt = (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      const [x1, g1] = pts[i];
      if (x <= x1) {
        const [x0, g0] = pts[i - 1];
        const k = (x - x0) / (x1 - x0);
        return g0 + (g1 - g0) * k * k * (3 - 2 * k); // eased, so the road bends rather than kinks
      }
    }
    return pts[pts.length - 1][1];
  };
  // Heights every metre (and a bit past the finish, for the run-out).
  const end = course.length + 80;
  const heights = [0];
  for (let x = 1; x <= end; x++) heights.push(heights[x - 1] + gradeAt(x - 0.5));
  const heightAt = (x) => {
    const xc = Math.max(0, Math.min(end - 1e-6, x));
    const i = Math.floor(xc);
    return heights[i] + (heights[i + 1] - heights[i]) * (xc - i);
  };
  const top = Math.max(...heights);
  const bottom = Math.min(...heights);
  return { length: course.length, checks: course.checks, gradeAt, heightAt, top, bottom };
}

export class Bike {
  /** @param cfg CONFIG.cycling  @param road buildCourse(cfg.course) */
  constructor(cfg, road) {
    this.cfg = cfg;
    this.road = road;
    this.F0 = (4 * cfg.power) / cfg.cMax; // so power peaks at cfg.power, at cMax / 2
    this.onEvent = null; // optional (kind, t) listener
    this.reset();
  }

  reset() {
    this.x = 0; // m: the bike's middle, from the start line
    this.prevX = 0;
    this.v = 0;
    this.gear = this.cfg.startGear;
    this.crank = 0; // rad
    this.wheel = 0; // rad
    this.started = false;
    this.finished = false;
    this.tuck = false;
    this.lastSide = null; // the foot that last pushed: the next stroke is the other one
    this.lastTapT = 0;
    this.avgInterval = null;
    this.strokes = 0;
    this.wrong = 0;
    this.shifts = 0;
    this.pushing = 0; // 0..1: how hard the legs are pushing right now (0 freewheeling)
    this.throwT = null; // s since the bike throw started
    this.reach = 0; // m the front wheel is thrown ahead
    this.prevFront = this.front;
  }

  get gearSize() {
    return this.cfg.gears[this.gear];
  }

  /** Pedal speed (strokes/s), locked to road speed through the gear. */
  get pedalCadence() {
    return this.v / this.gearSize;
  }

  /** What crosses the line: the front of the front tyre, further out in a bike throw. */
  get front() {
    return this.x + this.cfg.wheelFront + this.reach;
  }

  get grade() {
    return this.road.gradeAt(this.x);
  }

  /** The gun. */
  start(t) {
    this.started = true;
    this.lastTapT = t;
  }

  /** A pedal stroke on `side` ('L' | 'R'): 'ok', 'wrong' (same foot twice) or 'idle'. */
  stroke(side, t) {
    if (!this.started || this.finished || this.tuck) return 'idle';
    if (side === this.lastSide) {
      this.wrong++;
      return 'wrong';
    }
    const p = this.cfg.pace;
    if (this.avgInterval == null) this.avgInterval = p.first;
    else this.avgInterval += p.smoothing * (Math.min(t - this.lastTapT, p.maxInterval) - this.avgInterval);
    this.lastTapT = t;
    this.lastSide = side;
    this.strokes++;
    this.onEvent?.('stroke', t);
    return 'ok';
  }

  /** Your rhythm (strokes/s): fades if you stop tapping. */
  tapCadence(t) {
    if (this.avgInterval == null || this.tuck) return 0;
    return 1 / Math.max(this.avgInterval, (t - this.lastTapT) / this.cfg.pace.idleGrace);
  }

  /** One gear harder (+1) or easier (-1). Returns true if it changed. */
  shift(dir) {
    const g = Math.max(0, Math.min(this.cfg.gears.length - 1, this.gear + dir));
    if (g === this.gear) return false;
    this.gear = g;
    this.shifts++;
    return true;
  }

  /** Throw the bike at the line. False if it's not possible now. */
  throwBike() {
    if (this.throwT != null || this.finished || !this.started) return false;
    this.throwT = 0;
    this.tuck = false;
    return true;
  }

  update(dt, t) {
    const c = this.cfg;
    this.prevX = this.x;
    this.prevFront = this.front;
    if (!this.started) return;
    const g = this.road.gradeAt(this.x);
    const th = Math.atan(g);
    const d = this.gearSize;
    const cad = this.pedalCadence;
    const tap = this.finished ? 0 : this.tapCadence(t);
    // Legs: push while the pedals are slower than your rhythm, harder the slower they go.
    this.pushing = !this.tuck && tap > 0 ? Math.min(1, Math.max(0, (tap - cad) / c.soft)) : 0;
    const drive = (this.pushing * this.F0 * Math.max(0, 1 - cad / c.cMax)) / d;
    const drag = (this.tuck ? c.tuckAero : c.aero) * this.v * this.v;
    let a = drive - G * (Math.sin(th) + c.roll * Math.cos(th)) - drag;
    if (this.finished) a -= 2; // sitting up and braking after the line
    else if (this.pushing > 0 && this.v < c.crawl) a = Math.max(a, 0.6); // standing on the pedals
    this.v = Math.max(0, this.v + Math.min(a, c.maxAccel) * dt);
    this.updateThrow(dt);
    this.x += this.v * dt;
    // The pedals turn with the wheel while you push; freewheeling, they stay where they are.
    if (this.pushing > 0) this.crank += cad * Math.PI * dt;
    this.wheel += (this.v * dt) / 0.34;
  }

  /** The bike throw: shoved forward over `rise`, held, drawn back. */
  updateThrow(dt) {
    if (this.throwT == null) return;
    const tw = this.cfg.throw;
    this.throwT += dt;
    const t = this.throwT;
    const smooth = (k) => k * k * (3 - 2 * k);
    let k;
    if (t < tw.rise) k = smooth(t / tw.rise);
    else if (t < tw.rise + tw.hold) k = 1;
    else k = 1 - smooth(Math.min(1, (t - tw.rise - tw.hold) / tw.recover));
    this.reach = tw.reach * k;
  }

  /** If this step carried the front tyre across lineX, the exact time it did, else null. */
  crossing(lineX, stepStartT, dt) {
    const a = this.prevFront;
    const b = this.front;
    if (a < lineX && b >= lineX) return stepStartT + (dt * (lineX - a)) / (b - a);
    return null;
  }
}

/** The gear that puts the pedals nearest `cadence` strokes/s at speed v (from `gears`). */
export function gearFor(gears, v, cadence) {
  let best = 0;
  for (let i = 1; i < gears.length; i++) if (Math.abs(v / gears[i] - cadence) < Math.abs(v / gears[best] - cadence)) best = i;
  return best;
}

/**
 * A rival's legs and head: strokes at a personal rhythm, shifts toward the
 * gear that keeps the pedals near their best (a beat late: `react`), tucks on
 * the descents if they're the sort to (`tuck`), and throws the bike at the
 * line, give or take `throwErr` m.
 */
export class BikeAI {
  constructor(bike, lv) {
    this.bike = bike;
    this.lv = lv;
    this.cadence = rand(...lv.cadence);
    this.react = rand(...lv.react);
    this.tucker = Math.random() < lv.tuck;
    this.throwErr = rand(...lv.throwErr);
    this.nextT = Infinity;
    this.side = Math.random() < 0.5 ? 'L' : 'R';
    this.wantSince = null;
  }

  go(t) {
    this.bike.start(t);
    this.nextT = t + rand(0.15, 0.3);
  }

  update(t, dt) {
    const b = this.bike;
    if (b.finished) return;
    const cfg = b.cfg;
    const end = t + dt;
    // Tuck when a descent has the pedals spinning faster than they can turn them.
    const spunOut = b.grade < -0.025 && b.v / cfg.gears[cfg.gears.length - 1] > this.cadence * 0.95;
    b.tuck = this.tucker && spunOut && b.throwT == null;
    while (this.nextT < end) {
      if (!b.tuck) {
        b.stroke(this.side, this.nextT);
        this.side = this.side === 'L' ? 'R' : 'L';
      }
      this.nextT += (1 / this.cadence) * (1 + rand(-this.lv.jitter, this.lv.jitter));
    }
    // Shift a gear at a time toward the one that suits, once they've noticed.
    const want = gearFor(cfg.gears, b.v, Math.min(cfg.cMax / 2, this.cadence * 0.9));
    if (want === b.gear || b.tuck) this.wantSince = null;
    else if (this.wantSince == null) this.wantSince = t;
    else if (t - this.wantSince >= this.react) {
      b.shift(Math.sign(want - b.gear));
      this.wantSince = t;
    }
    // The bike throw: at the line's ideal distance, give or take.
    const toLine = b.road.length - b.front;
    if (toLine <= idealThrow(b) + this.throwErr) b.throwBike();
  }
}

/** Distance from the line at which a bike throw has the tyre at full stretch on it. */
export function idealThrow(bike) {
  return bike.v * bike.cfg.throw.rise + bike.cfg.throw.reach;
}
