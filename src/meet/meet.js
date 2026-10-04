import { Conn } from '../online/net.js';
import { MeetSession } from '../online/meetSession.js';
import { setClock } from '../online/live.js';
import { MEET_ORDER } from './rules.js';

/**
 * THE MEET YOU'RE IN (docs/meets.md), on this phone: its socket to the meet
 * server, and everything the server has said about it, for the scenes to read.
 * Like `tournament` for a tournament, one at a time.
 *
 *   lobby      the lobby as last heard: { squads: [{ key, name, captain, ready, vote, lane, color, roster }], canStartEarly, voteUntil, lockAt, firstStart }
 *   squads     key -> { key, name, lane, color, roster: [uid] }
 *   members    uid -> { uid, name, squad, athlete, lineup, connected }
 *   events     per event (MEET_ORDER index): { index, event, start, heats, legs, proxies }
 *   stages     stage key -> { start, cutoff, setLen, done }
 *   results    per event: { ranked: [{ id, squad, mark, place, pts, heat }], standings }
 *   standings  the squads' totals so far: [{ squad, total, rank, places }]
 *   final      the final standings, once the relay's done
 *   index      the event you're on (the scenes move it on: advance)
 *   session    the MeetSession the events play through (online/meetSession.js)
 */
export const meet = {
  active: false,
  conn: null,
  id: null,
  uid: null,
  state: 'connecting', // the socket: net.js Conn states
  withdrawn: null, // why the squad was sent back from the lobby
  listeners: new Set(),

  /** Into meet `id` (a SquadHub sent us there). */
  join(id) {
    this.end();
    Object.assign(this, {
      active: true,
      id,
      uid: null,
      lobby: null,
      squads: new Map(),
      members: new Map(),
      events: [],
      stages: new Map(),
      results: [],
      standings: null,
      final: null,
      index: 0,
      withdrawn: null,
      state: 'connecting',
    });
    this.session = null;
    this.conn = new Conn(`/meet/${id}`, {
      message: (m) => this.receive(m),
      status: (s) => {
        this.state = s;
        this.changed();
      },
    });
    setClock(() => this.conn?.now() ?? Date.now());
  },

  /** Out of the meet (to the menu, or it's over). */
  end() {
    this.conn?.close();
    this.conn = null;
    this.session?.close();
    this.session = null;
    if (this.active) setClock(null);
    this.active = false;
  },

  /** `fn()` on every change heard from the server. Returns a function that stops it. */
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },

  changed() {
    for (const fn of this.listeners) fn();
  },

  send(msg) {
    this.conn?.send(msg);
  },

  receive(m) {
    switch (m.t) {
      case 'snapshot':
        this.uid = this.conn.uid;
        this.takeLobby(m.lobby);
        if (m.event) this.takeEvent(m.event);
        for (const s of m.stages ?? []) this.stages.set(s.key, s);
        for (const r of m.results ?? []) this.results[r.index] = r;
        this.standings = m.standings ?? this.standings;
        if (m.phase !== 'lobby') this.startSession();
        this.session?.seed(m.docs);
        // Back mid-meet: on from the event coming up (the one being played can't be joined halfway).
        if (m.event && this.index < m.event.index) this.index = m.event.index;
        break;
      case 'lobby':
        this.takeLobby(m);
        if (m.lockAt != null) this.startSession();
        break;
      case 'event':
        this.takeEvent(m);
        break;
      case 'stage':
        this.stages.set(m.key, { ...this.stages.get(m.key), key: m.key, start: m.start, cutoff: m.cutoff, setLen: m.setLen, done: null });
        break;
      case 'stageDone':
        this.stages.set(m.key, { ...this.stages.get(m.key), done: m.at });
        break;
      case 'results':
        this.results[m.index] = m;
        this.standings = m.standings;
        break;
      case 'final':
        this.final = m;
        this.standings = m.standings;
        break;
      case 'doc':
        this.session?.receive(m.u, m.p);
        return; // many a second: nobody needs telling
      case 'presence': {
        const mem = this.members.get(m.uid);
        if (mem) mem.connected = m.connected;
        break;
      }
      case 'proxies':
        if (this.events[m.index]) this.events[m.index].proxies = m.proxies;
        break;
      case 'withdrawn':
        this.withdrawn = m.why;
        break;
    }
    this.changed();
  },

  takeLobby(l) {
    if (!l) return;
    this.lobby = l;
    this.takeSquads(l.squads);
  },

  takeEvent(ev) {
    this.events[ev.index] = ev;
    this.takeSquads(ev.squads);
  },

  takeSquads(squads) {
    for (const s of squads ?? []) {
      this.squads.set(s.key, { key: s.key, name: s.name, lane: s.lane, color: s.color, roster: s.roster.map((m) => m.uid) });
      for (const m of s.roster) this.members.set(m.uid, { ...this.members.get(m.uid), ...m });
    }
  },

  startSession() {
    this.uid = this.conn?.uid ?? this.uid;
    this.session ??= new MeetSession(this);
    this.session.uid = this.uid;
    this.session.name = this.me?.name ?? '';
  },

  get me() {
    return this.members.get(this.uid) ?? null;
  },

  /** Your squad: { key, name, lane, color, roster }. */
  get mySquad() {
    return this.squads.get(this.me?.squad) ?? null;
  },

  squadOf(uid) {
    return this.squads.get(this.members.get(uid)?.squad) ?? null;
  },

  /** The squads in lane order. */
  get lanes() {
    return [...this.squads.values()].filter((s) => s.lane != null).sort((a, b) => a.lane - b.lane);
  },

  /** Event `i`'s id. */
  eventId(i = this.index) {
    return MEET_ORDER[i];
  },

  /** Your heat in event `i` (its index), or -1 if you're not in it. */
  heatOf(i, uid = this.uid) {
    return this.events[i]?.heats?.findIndex((h) => h.includes(uid)) ?? -1;
  },

  /** True if you're in event `i` (an athlete in its heats, or the relay). */
  inEvent(i) {
    const ev = this.events[i];
    if (!ev) return false;
    if (ev.legs) return !!ev.legs[this.me?.squad];
    return this.heatOf(i) >= 0;
  },

  /** The others in your heat of event `i`, in lane order, as a live room's players. */
  othersIn(i) {
    const h = this.heatOf(i);
    const ev = this.events[i];
    if (!ev || h < 0) return [];
    return ev.heats[h]
      .filter((u) => u !== this.uid)
      .map((u) => this.player(u))
      .sort((a, b) => a.lane - b.lane);
  },

  /** Player `uid` as the events want them: { uid, name, athlete, lineup, color, lane, squadName }. */
  player(uid) {
    const m = this.members.get(uid) ?? { name: '?' };
    const s = this.squadOf(uid);
    return { uid, name: m.name, athlete: m.athlete, lineup: m.lineup, color: s?.color ?? '#ffb400', lane: s?.lane ?? 9, squadName: s?.name ?? '' };
  },

  /** When the event after `i` starts (server ms), once the server has set it. */
  startOfEvent(i) {
    return this.events[i]?.start ?? null;
  },
};
