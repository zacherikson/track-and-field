/**
 * Input manager.
 *
 * Game-dev concept: browsers deliver input as *events* at arbitrary moments
 * between frames, but the game simulates in discrete fixed steps. So we never
 * act on input inside the event handler. We queue it with a precise timestamp,
 * and the simulation drains the queue at the step each event belongs to.
 *
 * Why the timestamp matters: tapping speed is measured from the gap between
 * taps. If we used "the frame we noticed it", every gap would be rounded to
 * 16.7ms at 60Hz, which is ~20% noise at 14 taps/sec. `event.timeStamp` is
 * sub-millisecond accurate, so we convert it to simulation time instead.
 *
 * Pointer Events cover touch, mouse and pen with one API and give each finger
 * its own `pointerId`, which is what makes two-thumb multi-touch work.
 */
export class Input {
  constructor(canvas, view) {
    this.canvas = canvas;
    this.view = view;
    this.queue = []; // { type: 'down'|'key', x, y, id, code, wall }
    this.active = new Map(); // pointerId -> { x, y } for held pointers
    this.wallRef = performance.now();
    this.simRef = 0;
    this.lastConsumed = 0;

    const opts = { passive: false };
    canvas.addEventListener('pointerdown', (e) => this.onDown(e), opts);
    window.addEventListener('pointermove', (e) => this.onMove(e), opts);
    window.addEventListener('pointerup', (e) => this.onUp(e), opts);
    window.addEventListener('pointercancel', (e) => this.onUp(e), opts);
    window.addEventListener('keydown', (e) => this.onKey(e));

    // iOS Safari still fires some gestures despite touch-action: none.
    const block = (e) => e.preventDefault();
    canvas.addEventListener('touchstart', block, opts);
    canvas.addEventListener('touchmove', block, opts);
    document.addEventListener('gesturestart', block, opts);
    document.addEventListener('dblclick', block, opts);
    document.addEventListener('contextmenu', block, opts);
  }

  wallTime(e) {
    // event.timeStamp shares performance.now()'s clock in modern browsers.
    // Fall back to now() if a browser reports something odd.
    const now = performance.now();
    const t = e.timeStamp;
    return Number.isFinite(t) && t > 0 && Math.abs(now - t) < 2000 ? t : now;
  }

  toLogical(e) {
    const r = this.canvas.getBoundingClientRect();
    const s = this.view.scale || 1;
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
  }

  onDown(e) {
    e.preventDefault();
    const p = this.toLogical(e);
    this.active.set(e.pointerId, p);
    this.queue.push({ type: 'down', x: p.x, y: p.y, id: e.pointerId, wall: this.wallTime(e) });
  }

  onMove(e) {
    if (this.active.has(e.pointerId)) this.active.set(e.pointerId, this.toLogical(e));
  }

  onUp(e) {
    this.active.delete(e.pointerId);
  }

  onKey(e) {
    if (e.repeat) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    this.queue.push({ type: 'key', code: e.code, wall: this.wallTime(e) });
  }

  /** Called once per frame by the loop: "wall-clock time `wallMs` == sim time `simSec`". */
  syncClock(wallMs, simSec) {
    this.wallRef = wallMs;
    this.simRef = simSec;
  }

  /** Remove and return all queued events that happened at or before sim time `until`. */
  consume(until) {
    if (!this.queue.length) return [];
    const out = [];
    const keep = [];
    for (const ev of this.queue) {
      let t = this.simRef + (ev.wall - this.wallRef) / 1000;
      t = Math.max(t, this.lastConsumed); // keep time monotonic across lag spikes
      if (t <= until) out.push({ ...ev, t });
      else keep.push(ev);
    }
    this.queue = keep;
    if (out.length) {
      out.sort((a, b) => a.t - b.t);
      this.lastConsumed = out[out.length - 1].t;
    }
    return out;
  }

  clear() {
    this.queue.length = 0;
  }
}
