import { CHARACTERS, player as chosenPlayer } from '../athletes/roster.js';
import { text, roundRect } from '../core/ui.js';
import { serverNow } from './live.js';
import { LiveTrace, TraceStream } from './liveTrace.js';
import { flow } from '../flow.js';

const FINISH_WAIT = 30000; // ms after your last attempt to wait for the others'
const RESULTS_AFTER = 5000; // ms after your last attempt before the results, at the soonest

/**
 * A field event (long jump, pole vault, javelin) played live (online/live.js).
 * Each round starts at the same moment on every phone, so everyone runs up
 * together: the other players are drawn on your runway, see-through and named
 * in gold, a moment behind (liveTrace.js), and their marks join the standings
 * as they land. Nobody taps to go on: once everyone's attempt is over the next
 * round counts down and starts by itself; after the last, the results come up
 * once everyone has had theirs. The other players are the only rivals
 * (`people`), so every phone shows the same results.
 *
 * The event scene takes `people` as its rivals and calls update() first in its update
 * (true = waiting: do nothing else), begin() in startRound(), pump() after
 * recording a frame (FieldGhost does), result() with its mark, next() instead
 * of going on (it does nothing: going on is automatic), figures() to draw the others (FieldGhost does), hint() for the
 * line under its standings, draw() last in its render, and close() on exit.
 */
export class LiveField {
  constructor(scene) {
    this.scene = scene;
    this.session = scene.live;
    this.ev = scene.ev;
    this.rounds = scene.cfg.rounds;
    this.stream = new TraceStream(this.session);
    this.people = this.session.others.map((p) => ({
      name: p.name,
      colors: (CHARACTERS.find((c) => c.id === p.athlete) ?? chosenPlayer()).colors,
      isPlayer: false,
      uid: p.uid,
      live: true,
      left: false,
      jumps: [],
      trace: null,
    }));
    this.stageKey = null;
    this.wait = { round: 1, stage: this.session.stage(this.ev.id, 1) }; // round 1 waits for its start
    this.finishing = null; // server ms to give up waiting for the others' last attempts
    this.finishAfter = null; // server ms before which the results don't come up
    this.stop = this.session.listen((uid, doc) => this.onDoc(uid, doc));
  }

  /** True while a round is waiting for its start (the scene hides its controls). */
  get holding() {
    return !!this.wait;
  }

  onDoc(uid, doc) {
    const p = this.people.find((q) => q.uid === uid);
    if (!p) return;
    p.left = !!doc.left;
    // Their marks so far, round by round (no mark: counts as neither a foul nor a failure's mark).
    const jumps = [];
    for (let r = 1; r <= this.rounds; r++) {
      const res = doc.res?.[this.session.stage(this.ev.id, r)];
      if (!res || typeof res !== 'object') break;
      jumps.push(Number.isFinite(res.mark) ? { mark: res.mark } : { foul: true, fail: true });
    }
    p.jumps = jumps;
    p.trace?.receive(doc);
  }

  /**
   * First thing in the scene's update: starts the next round, or shows the
   * results, when it's time. True if the scene should do nothing else this
   * step (before round 1, which is set up but mustn't move yet).
   */
  update(dt, t) {
    const sc = this.scene;
    if (this.wait?.round === 1) {
      for (const e of sc.game.input.consume(t + dt)) {
        if ((e.type === 'down' && sc.hitExit(e)) || (e.type === 'key' && e.code === 'Escape')) {
          flow.menu(sc.game);
          return true;
        }
      }
    }
    if (this.wait) {
      const start = this.session.startOf(this.wait.stage);
      if (start == null || serverNow() < start) return this.wait.round === 1;
      sc.round = this.wait.round - 1;
      this.wait = null;
      sc.startRound();
      return false;
    }
    if (this.finishing == null) return false;
    const now = serverNow();
    if (now < this.finishAfter || (this.unfinished().length && now < this.finishing)) return false;
    this.finishing = null;
    sc.finish();
    return true;
  }

  unfinished() {
    return this.people.filter((p) => !p.left && p.jumps.length < this.rounds);
  }

  /** A round has started (startRound): send it, and follow the others' attempts at it. */
  begin() {
    if (this.wait) return; // round 1 is set up before its start; it begins for real then
    const sc = this.scene;
    this.stageKey = this.session.stage(this.ev.id, sc.round);
    this.session.begin(this.stageKey, serverNow());
    this.stream.reset(sc.ghost.tracer);
    for (const p of this.people) {
      p.trace = new LiveTrace(this.ev.id, this.ev.traceProps, this.stageKey);
      const doc = this.session.docs.get(p.uid);
      if (doc) p.trace.receive(doc);
    }
  }

  /** Sends the frames of your attempt recorded so far. */
  pump() {
    if (this.stageKey && !this.wait) this.stream.pump();
  }

  /**
   * Your attempt is over: `mark` = { mark } or { foul } / { fail }. From here
   * wait for the next round's start, or for everyone's last attempt.
   */
  result(mark) {
    if (!this.stageKey) return;
    this.stream.pump(true);
    this.session.result(this.stageKey, Number.isFinite(mark?.mark) ? { mark: mark.mark } : mark?.fail ? { fail: true } : { foul: true });
    const r = this.scene.round;
    if (r < this.rounds) {
      this.wait = { round: r + 1, stage: this.session.stage(this.ev.id, r + 1) };
      this.session.ready(this.wait.stage);
    } else {
      this.finishAfter = serverNow() + RESULTS_AFTER;
      this.finishing = serverNow() + FINISH_WAIT;
    }
  }

  /** A tap after an attempt: nothing (the next round, or the results, come by themselves). */
  next() {}

  /** The line under the standings after an attempt, while waiting (else null). */
  hint() {
    if (this.finishing != null) {
      const left = this.unfinished();
      return left.length ? `Waiting for ${names(left)} to finish…` : `Results in ${Math.max(1, Math.ceil((this.finishAfter - serverNow()) / 1000))}`;
    }
    if (!this.wait) return null;
    const start = this.session.startOf(this.wait.stage);
    if (start != null) return `Round ${this.wait.round} starts in ${Math.max(1, Math.ceil((start - serverNow()) / 1000))}`;
    return `Waiting for ${names(this.session.waitingFor(this.wait.stage))}…`;
  }

  /** The other players' athletes to draw now: [{ frame, colors, label, live }]. */
  figures() {
    const out = [];
    for (const p of this.people) {
      const frame = p.trace?.frameAt();
      if (frame) out.push({ frame, colors: p.colors, label: p.left ? `${p.name} (left)` : p.name, live: true });
    }
    return out;
  }

  /** Before round 1: who you're up against and when it starts. */
  draw(ctx, view) {
    if (!this.wait || this.wait.round !== 1) return;
    const start = this.session.startOf(this.wait.stage);
    const cx = view.w / 2;
    const w = Math.min(460, view.w - 40);
    roundRect(ctx, cx - w / 2, 150, w, 120, 16);
    ctx.fillStyle = 'rgba(12,22,44,0.8)';
    ctx.fill();
    text(ctx, `LIVE · vs ${names(this.people)}`, cx, 182, { size: 17, color: '#ffb400', maxWidth: w - 30 });
    const left = start == null ? null : Math.max(1, Math.ceil((start - serverNow()) / 1000));
    text(ctx, left == null ? 'Waiting for everyone…' : `Starts in ${left}`, cx, 228, { size: 34, color: '#fff', shadow: true });
  }

  close() {
    this.stop();
  }
}

/** "Ann", "Ann and Bo", "Ann, Bo and Cy". */
function names(people) {
  const n = people.map((p) => p.name);
  if (n.length <= 1) return n[0] ?? 'the others';
  return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}
