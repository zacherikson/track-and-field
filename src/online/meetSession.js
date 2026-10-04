import { applyPatch } from '../meet/protocol.js';
import { FIELD } from './live.js';

const SEND_EVERY = 100; // ms between updates during a stage, as live.js

/** True if `a` would clash with `b` in one update (one path inside the other). */
const clash = (a, b) => a !== b && (a.startsWith(`${b}/`) || b.startsWith(`${a}/`));

/**
 * A squad meet as the events see it: the same face as a live room's
 * LiveSession (online/live.js), so the events play a meet the way they play
 * any live room, but on the meet server (server/, meet/meet.js):
 *
 * - `others` is your heat in the event being played (it changes every event);
 * - stage starts, cutoffs and GET SET's length come from the server's schedule
 *   (startOf, cutoffOf, setLenFor), and `stageDone` says the server has every
 *   result for a stage (or its cutoff has passed), so nobody waits longer;
 * - your doc goes out as patches over the meet's socket; the server keeps it
 *   and passes it on to your heat.
 */
export class MeetSession {
  constructor(meet) {
    this.meet = meet;
    this.isMeet = true;
    this.uid = meet.uid;
    this.name = meet.me?.name ?? '';
    this.squad = null; // not a squad practice
    this.docs = new Map(); // uid -> their doc, as patched
    this.listeners = new Set();
    this.batches = [];
    this.lastSent = 0;
    this.step = 0; // which event of the meet (MEET_ORDER index): the stages' prefix
    this.done = false;
  }

  /** Your heat-mates in the event being played: [{ uid, name, athlete, lineup, color, squadName }]. */
  get others() {
    return this.meet.othersIn(this.step);
  }

  /** A patch to another player's doc, from the server. */
  receive(uid, patch) {
    const doc = this.docs.get(uid) ?? {};
    applyPatch(doc, patch);
    this.docs.set(uid, doc);
    for (const fn of this.listeners) fn(uid, doc);
  }

  /** Whole docs (a snapshot after connecting). */
  seed(docs) {
    for (const [uid, doc] of Object.entries(docs ?? {})) {
      if (uid === this.uid) continue;
      this.docs.set(uid, doc);
      for (const fn of this.listeners) fn(uid, doc);
    }
  }

  listen(fn) {
    this.listeners.add(fn);
    for (const [id, doc] of this.docs) fn(id, doc);
    return () => this.listeners.delete(fn);
  }

  left(uid) {
    return !!this.docs.get(uid)?.left || this.meet.members.get(uid)?.connected === false;
  }

  stage(evId, round = 0) {
    return `${this.step}-${evId}${round ? `-${round}` : ''}`;
  }

  eventStage(evId, step = this.step) {
    return `${step}-${evId}${FIELD.has(evId) ? '-1' : ''}`;
  }

  setLenFor(stage) {
    return this.meet.stages.get(stage)?.setLen ?? 1.7;
  }

  /** Nothing to say: the server schedules every stage. */
  ready() {}

  startOf(stage) {
    return this.meet.stages.get(stage)?.start ?? null;
  }

  /** When the server stops waiting for `stage` (server ms), or null. */
  cutoffOf(stage) {
    return this.meet.stages.get(stage)?.cutoff ?? null;
  }

  /** True once the server has closed `stage`: every result is in, or its cutoff has passed. */
  stageDone(stage) {
    return this.meet.stages.get(stage)?.done != null;
  }

  waitingFor() {
    return [];
  }

  begin(stage, t0) {
    this.send({ s: stage, t0: Math.round(t0), run: null, n: null, done: null, f: null }, true);
  }

  result(stage, r) {
    this.send({ [`res/${stage}`]: r }, true);
  }

  /** As LiveSession.send: merged, in order, at most every SEND_EVERY ms (`now`: at once). */
  send(patch, now = false) {
    let b = this.batches[this.batches.length - 1];
    if (!b || Object.keys(patch).some((k) => Object.keys(b).some((j) => clash(k, j)))) this.batches.push((b = {}));
    Object.assign(b, patch);
    if (now) this.urgent = true;
    this.flush();
  }

  flush() {
    if (!this.batches.length || this.closed) return;
    const wait = this.urgent ? 0 : this.lastSent + SEND_EVERY - Date.now();
    if (wait > 0) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), wait);
      return;
    }
    while (this.batches.length) this.meet.conn?.send({ t: 'patch', p: this.batches.shift() });
    this.urgent = false;
    this.lastSent = Date.now();
  }

  /** The events call this when they're done with a room; the meet ends it (meet.end). */
  end() {}

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.listeners.clear();
  }
}
