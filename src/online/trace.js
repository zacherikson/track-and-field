/**
 * TRACE GHOSTS: what the player's athlete looked like, frame by frame, played
 * back see-through later. Used by every event except the 100m, whose ghost
 * replays the run's inputs exactly (ghost.js). The jumps, vault, throw and
 * hurdles have too much event-specific physics for that, so they keep the
 * picture instead: where the athlete was, their pose, and the pole or javelin.
 *
 * A frame is taken about 30 times a second while the player's attempt is drawn
 * and played back with the frames blended, so the ghost moves smoothly.
 *
 * Stored shape (plain JSON: one flat number list):
 *   { v, kind: 'trace', ev, mark, athlete, props, f: [frame, frame, ...] }
 * Online, `f` travels as one comma-separated string instead (toWire/fromWire):
 * several thousand numbers make a big Firestore array, which is indexed number
 * by number; one string is smaller and isn't.
 * frame = t, x, e, 14 pose numbers, `props` event numbers
 *   t = seconds since the attempt (or the gun) began, x = where the athlete is
 *   along the track (m), e = how far the figure is drawn above the ground (m),
 *   props = what the event needs besides the body (see each event's traceProps).
 *
 * Pure logic (no DOM), so it can run in Node.
 */
export const TRACE_VERSION = 1;
export const TRACE_HZ = 30;
export const MAX_FRAMES = 600; // 20 s: longer than any attempt
const POSE_N = 14;
export const HEAD = 3 + POSE_N; // numbers per frame before the event ones: t, x, e, pose

const r3 = (v) => Math.round(v * 1000) / 1000;

/** A pose (see stickFigure.js) as 14 numbers. */
export function packPose(p) {
  const [l0, l1] = p.legs;
  const [a0, a1] = p.arms;
  return [p.hipX, p.hipY, p.lean, l0.thigh, l0.shin, l0.toe ?? 0, l1.thigh, l1.shin, l1.toe ?? 0, a0.upper, a0.fore, a1.upper, a1.fore, p.flip ? 1 : 0];
}

function unpackPose(v) {
  return {
    hipX: v[0],
    hipY: v[1],
    lean: v[2],
    legs: [
      { thigh: v[3], shin: v[4], toe: v[5] },
      { thigh: v[6], shin: v[7], toe: v[8] },
    ],
    arms: [
      { upper: v[9], fore: v[10] },
      { upper: v[11], fore: v[12] },
    ],
    flip: v[13] > 0.5,
  };
}

/**
 * Collects frames of the player's attempt. `props` = how many event numbers each frame carries.
 * `hz` and `maxFrames`: a longer event can take fewer frames a second, and more of them.
 */
export class TraceRecorder {
  constructor(evId, props = 0, { hz = TRACE_HZ, maxFrames = MAX_FRAMES } = {}) {
    this.evId = evId;
    this.props = props;
    this.hz = hz;
    this.maxFrames = maxFrames;
    this.start();
  }

  start() {
    this.f = [];
    this.lastT = -Infinity;
  }

  get frames() {
    return this.f.length / (HEAD + this.props);
  }

  /** Adds a frame at `t` s unless one was taken very recently. */
  sample(t, x, e, pose, props = []) {
    if (t - this.lastT < 1 / this.hz - 0.004 || this.frames >= this.maxFrames) return;
    if (![t, x, e].every(Number.isFinite)) return;
    this.lastT = t;
    const extra = Array.from({ length: this.props }, (_, i) => props[i] ?? 0);
    for (const v of [t, x, e, ...packPose(pose), ...extra]) this.f.push(Number.isFinite(v) ? r3(v) : 0);
  }

  /** The attempt so far, ready to keep or upload. `athlete` = character id, so the ghost looks like who made it. */
  data(mark, athlete = null) {
    return { v: TRACE_VERSION, kind: 'trace', ev: this.evId, mark, athlete, props: this.props, f: [...this.f] };
  }
}

/** True if `data` is a trace this version can play for event `evId` with `props` event numbers. */
export function isTrace(data, evId, props) {
  if (!data || typeof data !== 'object' || data.v !== TRACE_VERSION || data.kind !== 'trace') return false;
  if (data.ev !== evId || data.props !== props || !Number.isFinite(data.mark)) return false;
  const f = data.f;
  const stride = HEAD + props;
  return Array.isArray(f) && f.length >= stride && f.length % stride === 0 && f.length <= MAX_FRAMES * stride && f.every(Number.isFinite);
}

/** A trace as it's uploaded: the frames as one string. */
export function toWire(data) {
  return { ...data, f: data.f.join(',') };
}

/** A downloaded trace back as toWire got it (a string of frames, or a list from before). */
export function fromWire(data) {
  if (!data || typeof data.f !== 'string') return data;
  return { ...data, f: data.f.split(',').map(Number) };
}

/**
 * Plays a trace back: `at(t)` gives the frame at `t` s ({ x, e, pose, pa, pb, k }),
 * blended between the recorded ones, or null after the last one.
 */
export class TracePlayer {
  constructor(data) {
    this.data = data;
    this.stride = HEAD + data.props;
    this.n = data.f.length / this.stride;
    this.i = 0; // search cursor: playback mostly moves forward
  }

  get duration() {
    return this.data.f[(this.n - 1) * this.stride];
  }

  /** The value at column `c` of frame `i`. */
  v(i, c) {
    return this.data.f[i * this.stride + c];
  }

  at(t) {
    if (t > this.duration + 0.05) return null;
    if (this.i >= this.n || this.v(this.i, 0) > t) this.i = 0;
    while (this.i + 1 < this.n && this.v(this.i + 1, 0) <= t) this.i++;
    const i = this.i;
    const j = Math.min(i + 1, this.n - 1);
    const t0 = this.v(i, 0);
    const t1 = this.v(j, 0);
    const k = j === i || t1 <= t0 ? 0 : Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    const lerp = (c) => this.v(i, c) + (this.v(j, c) - this.v(i, c)) * k;
    const pose = [];
    for (let c = 3; c < HEAD; c++) {
      const a = this.v(i, c);
      const b = this.v(j, c);
      // A big jump between frames (an angle wrapping round, the vaulter
      // turning) snaps instead of sweeping through.
      pose.push(Math.abs(b - a) > 1.5 ? (k < 0.5 ? a : b) : a + (b - a) * k);
    }
    const props = (f) => Array.from({ length: this.data.props }, (_, c) => this.v(f, HEAD + c));
    // The event numbers of the frames either side, and how far between them: each event blends its own.
    return { x: lerp(1), e: lerp(2), pose: unpackPose(pose), pa: props(i), pb: props(j), k };
  }
}
