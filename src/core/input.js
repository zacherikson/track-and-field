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
 * Touch: we read raw `touchstart` events (every new finger in `changedTouches`),
 * registered on the window in the capture phase so nothing on the page can get
 * in first. On iOS these are the lowest-level events a page gets; pointer events
 * are derived from them. Mouse and pen still come through Pointer Events (for
 * desktop testing), and touch-generated pointer events are ignored so a tap is
 * never counted twice.
 *
 * `stats` counts what the browser delivered, for the results screen: if a tap
 * felt lost but the counts match, the phone never delivered it.
 */
export class Input {
  constructor(canvas, view) {
    this.canvas = canvas;
    this.view = view;
    this.queue = []; // { type: 'down'|'key', x, y, id, code, wall }
    this.wallRef = performance.now();
    this.simRef = 0;
    this.lastConsumed = 0;
    this.resetStats();

    const opts = { passive: false, capture: true };
    window.addEventListener('touchstart', (e) => this.onTouchStart(e), opts);
    window.addEventListener('touchmove', (e) => this.onGame(e) && e.preventDefault(), opts);
    window.addEventListener('touchend', (e) => this.onTouchEnd(e), opts);
    window.addEventListener('touchcancel', (e) => this.onTouchCancel(e), opts);
    window.addEventListener('pointerdown', (e) => this.onPointerDown(e), opts);
    window.addEventListener('keydown', (e) => this.onKey(e));

    // iOS Safari still fires some gestures despite touch-action: none.
    const block = (e) => e.preventDefault();
    document.addEventListener('gesturestart', block, opts);
    document.addEventListener('dblclick', block, opts);
    document.addEventListener('contextmenu', block, opts);
  }

  /** Counters for the results screen. `lagMax`: worst ms from a touch to the game handling it. */
  resetStats() {
    // delays: per touch, ms from the touch to the page receiving it (the phone's
    // part), and whether it landed within 60 px of the left/right screen edge.
    this.stats = { touches: 0, cancels: 0, lagMax: 0, delays: [] };
  }

  /** Only touches on the game itself: the tuning panel and other overlays keep normal behavior. */
  onGame(e) {
    return e.target === this.canvas;
  }

  wallTime(e) {
    // event.timeStamp shares performance.now()'s clock in modern browsers. Fall
    // back to now() if a browser reports something odd, and never accept a time
    // in the future (it would hold the tap in the queue until then).
    const now = performance.now();
    const t = e.timeStamp;
    return Number.isFinite(t) && t > 0 && Math.abs(now - t) < 2000 ? Math.min(t, now) : now;
  }

  toLogical(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const s = this.view.scale || 1;
    return { x: (clientX - r.left) / s, y: (clientY - r.top) / s };
  }

  push(clientX, clientY, id, wall) {
    const p = this.toLogical(clientX, clientY);
    this.queue.push({ type: 'down', x: p.x, y: p.y, id, wall });
  }

  onTouchStart(e) {
    if (!this.onGame(e)) return;
    e.preventDefault(); // no zoom, scroll, callout or synthesized mouse events
    const wall = this.wallTime(e);
    const deliver = performance.now() - wall;
    for (const t of e.changedTouches) {
      this.stats.touches++;
      const edge = Math.min(t.clientX, window.innerWidth - t.clientX) < 60;
      this.stats.delays.push({ ms: deliver, edge, fingers: e.touches.length });
      this.push(t.clientX, t.clientY, 't' + t.identifier, wall);
    }
  }

  onTouchEnd(e) {
    if (this.onGame(e)) e.preventDefault();
  }

  onTouchCancel(e) {
    // The phone took these touches back (a system gesture, usually from a screen edge).
    this.stats.cancels += e.changedTouches.length;
  }

  onPointerDown(e) {
    if (e.pointerType === 'touch' || !this.onGame(e)) return; // touches arrive via touchstart
    e.preventDefault();
    this.push(e.clientX, e.clientY, e.pointerId, this.wallTime(e));
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
      const now = performance.now();
      for (const ev of out) this.stats.lagMax = Math.max(this.stats.lagMax, now - ev.wall);
      out.sort((a, b) => a.t - b.t);
      this.lastConsumed = out[out.length - 1].t;
    }
    return out;
  }

  clear() {
    this.queue.length = 0;
  }
}
