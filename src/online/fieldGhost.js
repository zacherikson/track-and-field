import { CHARACTERS, player as chosenPlayer } from '../athletes/roster.js';
import { drawFigure } from '../athletes/stickFigure.js';
import { text } from '../core/ui.js';
import { formatMark } from '../events/registry.js';
import { TraceRecorder, TracePlayer, isTrace } from './trace.js';
import { pickGhost } from './ghosts.js';

/**
 * Ghosts for the field events (long jump, pole vault, javelin), where each
 * attempt starts from the top of the runway. Records every attempt of the
 * player frame by frame (online/trace.js) and keeps the best one; plays a
 * recorded attempt back from the start of each of your attempts.
 *
 * The event calls startAttempt() when an attempt begins, sample() each time it
 * draws the player, endAttempt() with the attempt's result, and frame() /
 * drawFigure() to show the ghost. `ev.traceProps` (registry.js) = the event
 * numbers each frame keeps (the pole, the javelin).
 */
export class FieldGhost {
  constructor(ev) {
    const props = ev.traceProps;
    this.ev = ev;
    this.tracer = new TraceRecorder(ev.id, props);
    this.takes = []; // each attempt's recording, null for a foul
    this.t0 = 0;
    const spec = pickGhost(ev, (d) => isTrace(d, ev.id, props));
    this.spec = spec;
    this.play = spec ? new TracePlayer(spec.data) : null;
    this.colors = spec ? (CHARACTERS.find((c) => c.id === spec.data.athlete) ?? chosenPlayer()).colors : null;
    this.label = spec ? `${spec.name} · ${formatMark(ev, spec.data.mark)}` : '';
  }

  startAttempt(t) {
    this.t0 = t;
    this.tracer.start();
  }

  /** One frame of the player: x along the runway (m), e = drawn this far above the ground (m). */
  sample(now, x, e, pose, props) {
    this.tracer.sample(now - this.t0, x, e, pose, props);
  }

  /** The attempt is over: `result` = { mark }, or { foul: true } / { fail: true }. */
  endAttempt(result) {
    this.takes.push(result.foul || result.fail || result.mark == null ? null : this.tracer.data(result.mark, chosenPlayer().id));
  }

  /** The recording of the attempt that set your mark for this competition (the best one). */
  best() {
    const ok = this.takes.filter(Boolean);
    return ok.length ? ok.reduce((a, b) => (this.ev.lowerIsBetter ? (b.mark < a.mark ? b : a) : b.mark > a.mark ? b : a)) : null;
  }

  /** The ghost's frame now, or null (no ghost, or its attempt is over). */
  frame(now) {
    return this.play?.at(now - this.t0) ?? null;
  }

  /** Draws the ghost figure see-through, with its name tag while it's on the ground (clear of the HUD). */
  drawFigure(ctx, x, y, H, pose, groundY) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    drawFigure(ctx, x, y, H, pose, this.colors, groundY);
    ctx.restore();
    if (groundY - y < 0.3 * H) text(ctx, this.label, x, y - H * 1.05 - 8, { size: 14, color: 'rgba(255,255,255,0.8)', shadow: true });
  }
}
