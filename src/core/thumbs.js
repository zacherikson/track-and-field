/**
 * Which thumbs are down right now, from the input stream a scene consumes.
 *
 * Why: the orange pads (long jump takeoff and stretch, the finish lean, the
 * pole vault plant, the javelin hold) used to look only at the instant a
 * finger went down, inside a narrow window. A deliberate press-and-hold, with
 * the thumbs landing 100 ms apart, or one thumb still down from the last
 * stride, never counted. Tracking what is held makes those gates
 * level-triggered: the scene asks every step "are both thumbs down, with at
 * least one pressed since the pads lit?" A hold registers exactly like a tap.
 *
 * Pure (no DOM), one per scene. Feed it EVERY consumed event, presses and
 * lifts ('down'/'up' for fingers and the mouse, 'key'/'keyup' for keys); the
 * scene must set `wantsReleases` so Input queues the lifts.
 */
export class Thumbs {
  constructor() {
    this.down = new Map(); // id -> { side: 'L' | 'R', t }
  }

  reset() {
    this.down.clear();
  }

  /** One consumed event. `sideOf(e)` -> 'L' | 'R' | 'BOTH' | null (only asked for presses). */
  track(e, sideOf) {
    if (e.type === 'down' || e.type === 'key') {
      const s = sideOf(e);
      if (!s) return;
      const id = e.id ?? e.code;
      if (s === 'BOTH') {
        // A both-thumbs key (Space, Up arrow): held as two thumbs until its keyup.
        this.down.set(id + ':L', { side: 'L', t: e.t });
        this.down.set(id + ':R', { side: 'R', t: e.t });
      } else this.down.set(id, { side: s, t: e.t });
    } else if (e.type === 'up' || e.type === 'keyup') {
      const id = e.id ?? e.code;
      this.down.delete(id);
      this.down.delete(id + ':L');
      this.down.delete(id + ':R');
    }
  }

  /** The earliest press still held on side `s`, or null. */
  side(s) {
    let best = null;
    for (const d of this.down.values()) if (d.side === s && (!best || d.t < best.t)) best = d;
    return best;
  }

  /** True if a thumb is down on both sides. */
  get bothDown() {
    return this.side('L') != null && this.side('R') != null;
  }

  /**
   * Both thumbs down, with at least one pressed at or after `armT` (so a thumb
   * left down from the run-up counts once the other one is pressed in the
   * zone, but two thumbs that were already down when the pads lit don't).
   * Returns the time the pair completed (the later of the two presses), or null.
   */
  both(armT = -Infinity) {
    const L = this.side('L');
    const R = this.side('R');
    if (!L || !R) return null;
    const later = Math.max(L.t, R.t);
    return later >= armT ? later : null;
  }
}
