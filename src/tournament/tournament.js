import { EVENTS } from '../events/registry.js';
import { points } from '../events/scoring.js';
import { submitBest, getBestTournament, saveBestTournament } from '../core/storage.js';
import { counts } from '../online/bests.js';

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
  history: [], // per event: { ev, rows: [{ name, colors, isPlayer, mark, status, pts }], ghost }

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

  /**
   * Score an event's results and add them to the totals. `ghost` is the
   * player's recording of it, kept for the best tournament's ghosts. Returns
   * this event's rows.
   */
  record(ev, results, ghost = null) {
    const rows = results.map((r) => ({ ...r, pts: points(ev.id, r.mark, r.status) }));
    for (const r of rows) {
      const t = this.totals.get(r.name) ?? { name: r.name, colors: r.colors, isPlayer: r.isPlayer, total: 0 };
      t.total += r.pts;
      this.totals.set(r.name, t);
    }
    this.history.push({ ev, rows, ghost });
    if (this.finished) {
      // Only with shipped tuning, like every best (online/bests.js).
      const me = counts() ? [...this.totals.values()].find((t) => t.isPlayer) : null;
      this.newBest = !!me && submitBest('tournament', me.total, false);
      // Kept for its ghosts: your best recorded tournament (the first one
      // recorded counts even if an older, unrecorded score was higher).
      const saved = getBestTournament();
      if (me && (!saved || me.total > saved.total)) saveBestTournament(this.asBest(me.total));
    }
    return rows;
  },

  /** This tournament in the shape saved as your best: { total, events: { id: { mark, pts, ghost } } }. */
  asBest(total) {
    const events = {};
    for (const { ev, rows, ghost } of this.history) {
      const r = rows.find((k) => k.isPlayer);
      events[ev.id] = { mark: r?.mark ?? null, pts: r?.pts ?? 0, ghost: ghost ?? null };
    }
    return { total, events };
  },

  /** Your best tournament's points after its first `n` events, or null if there isn't one. */
  bestAfter(n) {
    const best = getBestTournament();
    if (!best?.events) return null;
    return ORDER.slice(0, n).reduce((sum, id) => sum + (best.events[id]?.pts ?? 0), 0);
  },

  /** Overall standings, most points first. */
  standings() {
    return [...this.totals.values()].sort((a, b) => b.total - a.total);
  },

  advance() {
    this.index++;
  },
};
