import { EVENTS } from '../events/registry.js';
import { points } from '../events/scoring.js';
import { submitBest } from '../core/storage.js';

/**
 * Tournament mode: the five events back to back, in this order, scored like a
 * real decathlon (see scoring.js). Points add up after each event; the most
 * points at the end is the champion. Your rivals are the same five athletes
 * throughout. State lives here for the length of one tournament.
 */
export const ORDER = ['sprint100', 'longjump', 'hurdles110', 'polevault', 'javelin'];

export const tournament = {
  active: false,
  index: 0, // which event is next / being played
  totals: new Map(), // name -> { name, colors, isPlayer, total }
  history: [], // per event: { ev, rows: [{ name, colors, isPlayer, mark, status, pts }] }

  start() {
    this.active = true;
    this.index = 0;
    this.totals = new Map();
    this.history = [];
  },

  end() {
    this.active = false;
  },

  get event() {
    return EVENTS.find((e) => e.id === ORDER[this.index]);
  },

  get nextEvent() {
    return this.index + 1 < ORDER.length ? EVENTS.find((e) => e.id === ORDER[this.index + 1]) : null;
  },

  get finished() {
    return this.history.length === ORDER.length;
  },

  /** Score an event's results and add them to the totals. Returns this event's rows. */
  record(ev, results) {
    const rows = results.map((r) => ({ ...r, pts: points(ev.id, r.mark, r.status) }));
    for (const r of rows) {
      const t = this.totals.get(r.name) ?? { name: r.name, colors: r.colors, isPlayer: r.isPlayer, total: 0 };
      t.total += r.pts;
      this.totals.set(r.name, t);
    }
    this.history.push({ ev, rows });
    if (this.finished) {
      const me = [...this.totals.values()].find((t) => t.isPlayer);
      if (me) this.newBest = submitBest('tournament', me.total, false);
    }
    return rows;
  },

  /** Overall standings, most points first. */
  standings() {
    return [...this.totals.values()].sort((a, b) => b.total - a.total);
  },

  advance() {
    this.index++;
  },
};
