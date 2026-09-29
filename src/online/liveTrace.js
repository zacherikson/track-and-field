import { TRACE_VERSION, HEAD, MAX_FRAMES, TracePlayer } from './trace.js';
import { serverNow } from './live.js';

/**
 * Live play for everything but the 100m (online/live.js): each phone sends its
 * athlete frame by frame, as a trace (online/trace.js) in small chunks
 * (TraceStream), and draws the others from theirs (LiveTrace).
 *
 * The frames arrive a little after they happen, so the others are drawn a
 * moment behind: `delay` follows how late their newest frame usually is, plus
 * a margin, so they move smoothly instead of stopping and starting. Their
 * marks come from their phones, exactly.
 */
const SEND_EVERY = 100; // ms between chunks
const MIN_DELAY = 0.1; // s
const MAX_DELAY = 1.5; // s
const MARGIN = 0.08; // s drawn behind their newest frame on top of the usual lateness

/** Sends your frames as they're recorded: `f/{k}` = the new frames since the last chunk, comma-separated. */
export class TraceStream {
  constructor(session) {
    this.session = session;
    this.tracer = null;
  }

  /** A new stage: send `tracer`'s frames from the start. */
  reset(tracer) {
    this.tracer = tracer;
    this.f = tracer.f;
    this.sent = 0;
    this.k = 0;
    this.lastT = -Infinity;
  }

  /** Sends the frames recorded since the last chunk, at most every SEND_EVERY ms (at once with `force`). */
  pump(force = false) {
    const tr = this.tracer;
    if (!tr) return;
    if (tr.f !== this.f) this.reset(tr); // the recording started again
    const n = tr.f.length;
    if (n <= this.sent) return;
    const now = performance.now();
    if (!force && now - this.lastT < SEND_EVERY) return;
    this.session.send({ [`f/${this.k++}`]: tr.f.slice(this.sent, n).join(',') }, force);
    this.sent = n;
    this.lastT = now;
  }
}

/**
 * Another player's athlete in one stage (a race, or a round of a field
 * event), from the docs their phone sends. `frameAt()` gives the frame to draw
 * now (as TracePlayer.at does), `result` their result once they have one.
 * Also works where a lane race expects a live runner (advanceTo, frame, mark,
 * left, done, dx).
 */
export class LiveTrace {
  constructor(evId, props, stage) {
    this.stage = stage;
    this.data = { v: TRACE_VERSION, kind: 'trace', ev: evId, props, mark: null, f: [] };
    this.stride = HEAD + props;
    this.taken = 0; // chunks read so far
    this.play = null;
    this.t0 = null; // when their stage started (server ms): their frames' times count from it
    this.lastT = null; // their newest frame's time
    this.lag = null; // s: how far behind their clock the newest frame is when it arrives (smoothed)
    this.delay = null; // s: how far behind their clock they're drawn
    this.drawnAt = null;
    this.result = null;
    this.left = false;
    this.frame = null;
    this.dx = 0; // drawn where the frame says
  }

  get frames() {
    return this.data.f.length / this.stride;
  }

  get mark() {
    return Number.isFinite(this.result?.mark) ? this.result.mark : null;
  }

  get done() {
    return this.result != null;
  }

  /** Their latest doc. Returns false if it's not about this stage. */
  receive(doc) {
    if (!doc || typeof doc !== 'object') return false;
    if (doc.left) this.left = true;
    const res = doc.res?.[this.stage]; // results stay after they've moved on
    if (res && typeof res === 'object') this.result = res;
    if (doc.s !== this.stage) return false;
    if (Number.isFinite(doc.t0)) this.t0 = doc.t0;
    const f = doc.f; // chunks by number (the database may hand them over as a list)
    let got = false;
    while (f && typeof f === 'object' && typeof f[this.taken] === 'string') {
      const nums = f[this.taken++].split(',').map(Number);
      if (nums.length % this.stride || !nums.every(Number.isFinite) || this.frames + nums.length / this.stride > MAX_FRAMES) continue;
      for (const v of nums) this.data.f.push(v);
      got = true;
    }
    if (got) {
      this.lastT = this.data.f[(this.frames - 1) * this.stride];
      if (this.play) this.play.n = this.frames;
      else this.play = new TracePlayer(this.data);
      if (this.t0 != null) {
        const lag = (serverNow() - this.t0) / 1000 - this.lastT;
        this.lag = this.lag == null ? lag : this.lag + (lag - this.lag) * 0.25;
      }
    }
    return true;
  }

  /** The frame to draw now, or null before their first one. Holds their last frame at the end. */
  frameAt() {
    if (!this.play || this.t0 == null) return null;
    const now = serverNow();
    const dt = this.drawnAt == null ? 0 : Math.max(0, (now - this.drawnAt) / 1000);
    this.drawnAt = now;
    const want = Math.min(MAX_DELAY, Math.max(MIN_DELAY, (this.lag ?? 0.2) + MARGIN));
    this.delay = this.delay == null ? want : this.delay + (want - this.delay) * (1 - Math.exp(-2 * dt));
    const t = Math.max(0, Math.min((now - this.t0) / 1000 - this.delay, this.lastT));
    return this.play.at(t);
  }

  /** In a lane race: moves `frame` along (the race time isn't needed: their frames carry their own clock). */
  advanceTo() {
    this.frame = this.frameAt();
  }
}
