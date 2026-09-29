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
 * draws the player, endAttempt() with the attempt's result, and figures() /
 * drawFigure() to show the ghost. `ev.traceProps` (registry.js) = the event
 * numbers each frame keeps (the pole, the javelin).
 *
 * Played live (`live` = the event's LiveField, online/liveField.js) there's no
 * ghost: the other players are drawn the same way instead, and each frame of
 * yours goes out to them as it's recorded.
 */
export class FieldGhost {
  constructor(ev, live = null) {
    const props = ev.traceProps;
    this.ev = ev;
    this.live = live;
    this.tracer = new TraceRecorder(ev.id, props);
    this.takes = []; // each attempt's recording, null for a foul
    this.t0 = 0;
    const spec = live ? null : pickGhost(ev, (d) => isTrace(d, ev.id, props));
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
    this.live?.pump();
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

  /** Everyone to draw on your runway now: the ghost, or the other live players. [{ frame, colors, label, live }] */
  figures(now) {
    if (this.live) return this.live.figures();
    const frame = this.frame(now);
    return frame ? [{ frame, colors: this.colors, label: this.label, live: false }] : [];
  }

  /**
   * Draws one of figures() see-through at x, y (H tall), with its name tag while
   * it's on the ground (clear of the HUD): gold for a live player.
   */
  drawFigure(ctx, fig, x, y, H, groundY) {
    ctx.save();
    ctx.globalAlpha = fig.live ? 0.6 : 0.45;
    drawFigure(ctx, x, y, H, fig.frame.pose, fig.colors, groundY);
    ctx.restore();
    if (groundY - y < 0.3 * H) text(ctx, fig.label, x, y - H * 1.05 - 8, { size: 14, color: fig.live ? '#ffb400' : 'rgba(255,255,255,0.8)', shadow: true });
  }
}
