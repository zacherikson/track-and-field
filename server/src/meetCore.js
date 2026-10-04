import { CONFIG } from '../../src/config.js';
import { SQUAD_SIZE, MIN_SQUADS, MAX_SQUADS, MEET_ORDER, FIELD_EVENTS, LOWER_IS_BETTER, SQUAD_COLORS, eventStages } from '../../src/meet/rules.js';
import { rankEvent, squadStandings } from '../../src/meet/scoring.js';
import { seedHeats } from '../../src/meet/heats.js';
import { assignLegs } from '../../src/meet/relayLegs.js';
import { applyPatch } from '../../src/meet/protocol.js';

const M = CONFIG.meet;
const s2ms = (s) => Math.round(s * 1000);

/** Sanity bounds on a mark (as firestore.rules validMark), and the relay. */
const MARK_RANGE = {
  sprint100: [7, 60],
  hurdles110: [8, 120],
  longjump: [0, 15],
  polevault: [0, 9],
  javelin: [0, 150],
  relay4x100: [25, 200],
};

/** How long a race can run before the server stops waiting (s from the gun). */
const RACE_LIMIT = {
  sprint100: CONFIG.sprint100.maxRaceTime,
  hurdles110: CONFIG.hurdles110.maxRaceTime,
  relay4x100: CONFIG.relay.maxRaceTime,
};

const MAX_PATCH = 64 * 1024; // bytes in one patch, as JSON
const MAX_DOC_KEYS = 2000; // frame chunks and the like in one doc

/**
 * ONE MEET, from its lobby to the podium (docs/meets.md). No Cloudflare APIs
 * here: the Durable Object (index.js) hands it sockets as `peers`
 * ({ uid, send(msg), close() }), calls tick() about ten times a second, and
 * gives it `io` for the other objects: { now(), released(squadKey, why),
 * update(info) } (the squad's SquadHub, and the Matchmaker).
 *
 * LOBBY: squads arrive from their SquadHub with their four (addSquad). Each
 * has a captain, picked at random, who presses Ready. Six squads all ready:
 * the meet locks. Two to five, all ready: captains get Start early, and when
 * every captain has pressed it the meet locks with those squads. The first
 * Start early vote shuts the lobby to new squads until it passes or times out
 * (voteWait). A squad that stays unready while all the others are ready
 * (readyWait), or short of four (shortWait), is sent back to its SquadHub.
 *
 * MEET: the server runs the clock. Every stage (a race, or a round of a field
 * event) has a start and a cutoff; it ends when every athlete in it has a
 * result, or at the cutoff (no result: DNF, or a foul). The next stage is set
 * from there, so a slow or dropped phone can't hold anyone up. Each event is
 * heats (one athlete from each squad, seeded by personal best) that all run at
 * once, and you only hear from your own heat; the relay is one race with
 * everyone. Places across all the heats score 10-8-6-5-4-3-2-1.
 */
export class MeetCore {
  constructor(id, io, rand = Math.random, { firstEvent = 0 } = {}) {
    this.id = id;
    this.io = io;
    this.rand = rand;
    this.firstEvent = firstEvent; // local testing only (DEV_FIRST_EVENT): start the meet at a later event
    this.phase = 'lobby'; // 'lobby' | 'countdown' | 'running' | 'done' | 'closed'
    this.squads = new Map(); // key -> squad (see addSquad)
    this.members = new Map(); // uid -> member
    this.peers = new Map(); // uid -> peer
    this.voteSince = null; // when the first Start early vote came in
    this.lockAt = null;
    this.stages = []; // the meet's stages, set at the lock
    this.events = []; // per event: { index, event, start, heats, heatOf, legs, proxies, ranked }
    this.current = -1; // the event being played (or about to be)
    this.ranked = []; // rankEvent results of the events scored so far
    this.endedAt = null;
  }

  // ------------------------------------------------------------------ lobby

  /**
   * A squad arrives from its SquadHub: { key, name, roster: [{ uid, name, athlete, lineup, pbs }] }.
   * Returns { ok } or { ok: false, why }.
   */
  addSquad({ key, name, roster }) {
    if (this.phase !== 'lobby') return { ok: false, why: 'started' };
    if (this.squads.has(key)) return { ok: true }; // already here
    if (this.squads.size >= MAX_SQUADS) return { ok: false, why: 'full' };
    if (this.voteSince != null) return { ok: false, why: 'voting' };
    const now = this.io.now();
    const squad = { key, name: String(name).slice(0, 16), roster: [], captain: null, ready: false, vote: false, shortSince: null, unreadySince: null, lane: null, color: null };
    this.squads.set(key, squad);
    for (const m of (roster ?? []).slice(0, SQUAD_SIZE)) this.addMember(squad, m, now);
    this.pickCaptain(squad);
    this.lobbyChanged(true);
    return { ok: true };
  }

  /** A squadmate filling a place in a squad here (from its SquadHub). */
  fill(key, m) {
    const squad = this.squads.get(key);
    if (this.phase !== 'lobby' || !squad) return { ok: false, why: 'gone' };
    if (squad.roster.includes(m.uid)) return { ok: true };
    if (squad.roster.length >= SQUAD_SIZE) return { ok: false, why: 'full' };
    this.addMember(squad, m, this.io.now());
    this.pickCaptain(squad);
    this.lobbyChanged(true);
    return { ok: true };
  }

  addMember(squad, m, now) {
    squad.roster.push(m.uid);
    this.members.set(m.uid, {
      uid: m.uid,
      squad: squad.key,
      name: String(m.name ?? '?').slice(0, 16),
      athlete: typeof m.athlete === 'string' ? m.athlete.slice(0, 32) : '',
      lineup: m.lineup && typeof m.lineup === 'object' ? m.lineup : null,
      pbs: m.pbs && typeof m.pbs === 'object' ? m.pbs : {},
      connected: this.peers.has(m.uid),
      lostAt: this.peers.has(m.uid) ? null : now, // until their phone connects here: they have `reconnect` s
      doc: {},
    });
  }

  /** A squad without a captain (just arrived, or theirs left) gets one at random. */
  pickCaptain(squad) {
    if (squad.captain && squad.roster.includes(squad.captain)) return;
    squad.captain = squad.roster.length ? squad.roster[Math.floor(this.rand() * squad.roster.length) % squad.roster.length] : null;
    squad.vote = false;
  }

  /** Something changed in the lobby: votes clear if who's in it changed, and everyone hears. */
  lobbyChanged(clearVotes = false) {
    if (clearVotes) this.clearVotes();
    for (const s of this.squads.values()) {
      if (s.roster.length < SQUAD_SIZE) {
        s.ready = false;
        s.shortSince ??= this.io.now();
      } else s.shortSince = null;
    }
    this.checkLock();
    if (this.phase === 'lobby') {
      this.broadcast(this.lobbyView());
      this.io.update(this.info());
    }
  }

  clearVotes() {
    for (const s of this.squads.values()) s.vote = false;
    this.voteSince = null;
  }

  /** What the Matchmaker and the SquadHubs need to know. */
  info() {
    return {
      id: this.id,
      phase: this.phase,
      open: this.phase === 'lobby' && this.voteSince == null && this.squads.size < MAX_SQUADS,
      squads: [...this.squads.values()].map((s) => ({ key: s.key, uids: [...s.roster], names: s.roster.map((u) => this.members.get(u)?.name ?? '?'), open: SQUAD_SIZE - s.roster.length })),
    };
  }

  lobbyView() {
    const all = [...this.squads.values()];
    const allReady = all.length >= MIN_SQUADS && all.every((s) => s.ready);
    return {
      t: 'lobby',
      id: this.id,
      phase: this.phase,
      squads: all.map((s) => ({
        key: s.key,
        name: s.name,
        captain: s.captain,
        ready: s.ready,
        vote: s.vote,
        lane: s.lane,
        color: s.color,
        roster: s.roster.map((u) => this.memberView(u)),
      })),
      canStartEarly: allReady && all.length < MAX_SQUADS,
      voteUntil: this.voteSince == null ? null : this.voteSince + s2ms(M.lobby.voteWait),
      lockAt: this.lockAt,
      firstStart: this.stages[0]?.start ?? null,
    };
  }

  memberView(uid) {
    const m = this.members.get(uid);
    return m && { uid, name: m.name, squad: m.squad, athlete: m.athlete, lineup: m.lineup, connected: m.connected };
  }

  /** A captain's buttons, and leaving the sign-up. */
  lobbyMessage(uid, msg) {
    const m = this.members.get(uid);
    const squad = m && this.squads.get(m.squad);
    if (!squad || this.phase !== 'lobby') return;
    const captain = squad.captain === uid;
    switch (msg.t) {
      case 'ready':
        if (!captain || squad.roster.length < SQUAD_SIZE || squad.ready) return;
        squad.ready = true;
        squad.unreadySince = null;
        return this.lobbyChanged();
      case 'unready':
        if (!captain || !squad.ready) return;
        squad.ready = false;
        return this.lobbyChanged(true);
      case 'startEarly': {
        const all = [...this.squads.values()];
        if (!captain || squad.vote || all.length < MIN_SQUADS || !all.every((s) => s.ready)) return;
        squad.vote = true;
        this.voteSince ??= this.io.now();
        return this.lobbyChanged();
      }
      case 'leave':
        return this.dropMember(uid, 'left');
    }
  }

  /** `uid` is off their squad's sign-up (left, or gone too long). */
  dropMember(uid, why) {
    const m = this.members.get(uid);
    if (!m || this.phase !== 'lobby') return;
    const squad = this.squads.get(m.squad);
    this.members.delete(uid);
    this.peers.get(uid)?.send({ t: 'withdrawn', why });
    if (!squad) return;
    squad.roster = squad.roster.filter((u) => u !== uid);
    if (!squad.roster.length) return this.removeSquad(squad, 'empty');
    this.pickCaptain(squad);
    this.lobbyChanged(true);
  }

  /** Sends a squad back to its SquadHub (gone quiet, or never filled), or it emptied. */
  removeSquad(squad, why) {
    this.squads.delete(squad.key);
    for (const uid of squad.roster) {
      this.members.delete(uid);
      this.peers.get(uid)?.send({ t: 'withdrawn', why });
    }
    this.io.released(squad.key, why);
    this.lobbyChanged(true);
    if (!this.squads.size) this.close();
  }

  /** Locks the meet if it's time: six ready, or two or more ready and every captain voted. */
  checkLock() {
    if (this.phase !== 'lobby') return;
    const all = [...this.squads.values()];
    if (all.length < MIN_SQUADS || !all.every((s) => s.ready && s.roster.length === SQUAD_SIZE)) return;
    if (all.length === MAX_SQUADS || all.every((s) => s.vote)) this.lock();
  }

  /** The meet is on: lanes drawn, the schedule set. */
  lock() {
    const now = this.io.now();
    this.phase = 'countdown';
    this.lockAt = now;
    const order = shuffle([...this.squads.values()], this.rand);
    order.forEach((s, i) => {
      s.lane = i + 1;
      s.color = SQUAD_COLORS[i];
    });
    this.stages = [];
    MEET_ORDER.forEach((event, index) =>
      eventStages(index, event).forEach((key, r) => this.stages.push({ key, event, index, round: FIELD_EVENTS.has(event) ? r + 1 : 0, start: null, cutoff: null, setLen: null, done: null, results: new Map() })),
    );
    this.broadcast(this.lobbyView());
    this.io.update(this.info());
    this.startEvent(this.firstEvent, now + s2ms(M.countdown + M.titleCard));
  }

  // ------------------------------------------------------------------ the meet

  /** Event `index` starts at `start`: its heats (or relay legs), sent to everyone. */
  startEvent(index, start) {
    const event = MEET_ORDER[index];
    this.current = index;
    const here = (uid) => this.members.get(uid)?.connected;
    const squads = [...this.squads.values()].sort((a, b) => a.lane - b.lane);
    const ev = { index, event, start, window: start - s2ms(M.titleCard), heats: [], heatOf: new Map(), legs: null, proxies: {}, ranked: null };
    if (event === 'relay4x100') {
      // One race: every squad with anyone left. Its legs, with someone running again for anyone gone.
      ev.legs = {};
      for (const s of squads) {
        const legs = assignLegs(s.roster.filter(here), this.rand);
        if (legs) ev.legs[s.key] = legs;
      }
      const all = squads.filter((s) => ev.legs[s.key]).flatMap((s) => s.roster);
      ev.heats = [all];
    } else {
      const field = squads.map((s) => ({ key: s.key, members: s.roster.filter(here).map((uid) => ({ uid, pb: num(this.members.get(uid).pbs?.[event]) })) }));
      ev.heats = seedHeats(event, field);
    }
    ev.heats.forEach((h, i) => h.forEach((uid) => ev.heatOf.set(uid, i)));
    this.events[index] = ev;
    this.phase = 'running';
    this.broadcast(this.eventView(ev)); // the event first, then its first stage
    this.schedule(this.stages.find((st) => st.index === index), start);
    this.io.update(this.info());
  }

  /** Stage `st` starts at `start`: its cutoff, and GET SET's length for a race. */
  schedule(st, start) {
    st.start = start;
    if (st.round) st.cutoff = start + s2ms(M.fieldCutoff[st.event] ?? 20);
    else {
      st.cutoff = start + s2ms(RACE_LIMIT[st.event] + M.raceGrace);
      st.setLen = Math.round((1.1 + this.rand() * 1.2) * 1000) / 1000; // GET SET lasts a random time, the same on every phone
    }
    this.broadcast({ t: 'stage', key: st.key, start: st.start, cutoff: st.cutoff, setLen: st.setLen });
  }

  eventView(ev) {
    return {
      t: 'event',
      index: ev.index,
      event: ev.event,
      start: ev.start,
      heats: ev.heats,
      legs: ev.legs,
      proxies: ev.proxies,
      squads: [...this.squads.values()].map((s) => ({ key: s.key, name: s.name, lane: s.lane, color: s.color, roster: s.roster.map((u) => this.memberView(u)) })),
    };
  }

  /** The stage being played now (or next), or null. */
  get stage() {
    return this.stages.find((st) => st.start != null && st.done == null) ?? null;
  }

  /** Who's in event `ev`'s stages: everyone in its heats (the relay: one result a squad, see expected()). */
  expected(ev) {
    if (ev.event === 'relay4x100') return Object.keys(ev.legs ?? {});
    return ev.heats.flat();
  }

  /** True once stage `st` has a result from everyone it's waiting on (a dropped phone isn't waited on). */
  complete(st) {
    const ev = this.events[st.index];
    if (ev.event === 'relay4x100') {
      return Object.entries(ev.legs ?? {}).every(([key, legs]) => st.results.has(key) || !legs.some((u) => this.members.get(u)?.connected));
    }
    return this.expected(ev).every((uid) => st.results.has(uid) || !this.members.get(uid)?.connected);
  }

  /** A result in a player's doc: `res/<stage>` = { mark } | { foul } | { fail } | { status: 'dnf' }. */
  takeResult(uid, key, r) {
    const st = this.stages.find((s) => s.key === key);
    if (!st || st.start == null || st.done != null || !r || typeof r !== 'object') return;
    const ev = this.events[st.index];
    if (!ev || !ev.heatOf.has(uid)) return; // not in this event
    const [lo, hi] = MARK_RANGE[st.event];
    const mark = Number.isFinite(r.mark) && r.mark >= lo && r.mark <= hi ? r.mark : null;
    if (ev.event === 'relay4x100') {
      // The team's time, from whoever's phone ran the anchor leg (or ran it for someone gone).
      const squad = this.members.get(uid)?.squad;
      const legs = ev.legs?.[squad];
      if (!legs || st.results.has(squad)) return;
      const anchor = legs[3];
      const runsAnchor = anchor === uid || ev.proxies[anchor] === uid;
      if (!runsAnchor) return;
      st.results.set(squad, { mark, by: uid });
      return;
    }
    if (st.results.has(uid)) return; // one result a stage
    st.results.set(uid, { mark, status: mark == null ? (r.foul ? 'foul' : r.fail ? 'fail' : 'dnf') : 'ok' });
  }

  /** Ends stage `st` (everyone's in, or its cutoff): the next round, or the event's results and the next event. */
  finishStage(st, now) {
    st.done = now;
    this.broadcast({ t: 'stageDone', key: st.key, at: now });
    const next = this.stages.find((s) => s.index === st.index && s.round === st.round + 1 && st.round > 0);
    if (next) return this.schedule(next, now + s2ms(M.roundGap));
    this.scoreEvent(this.events[st.index], now);
    if (st.index + 1 < MEET_ORDER.length) this.startEvent(st.index + 1, now + s2ms(M.eventGap));
    else this.finishMeet(now);
  }

  /** Event `ev`'s places across every heat, and the squads' totals so far. */
  scoreEvent(ev, now) {
    const stages = this.stages.filter((s) => s.index === ev.index);
    let entries;
    if (ev.event === 'relay4x100') {
      entries = Object.keys(ev.legs ?? {}).map((key) => ({ id: key, squad: key, mark: stages[0].results.get(key)?.mark ?? null }));
    } else {
      entries = this.expected(ev).map((uid) => {
        const marks = stages.map((s) => s.results.get(uid)?.mark).filter((x) => Number.isFinite(x));
        return { id: uid, squad: this.members.get(uid)?.squad, marks };
      });
    }
    ev.ranked = rankEvent(ev.event, entries);
    this.ranked.push(ev.ranked);
    this.broadcast({
      t: 'results',
      index: ev.index,
      event: ev.event,
      at: now,
      ranked: ev.ranked.map((r) => ({ ...r, heat: ev.event === 'relay4x100' ? null : ev.heatOf.get(r.id) ?? null })),
      standings: this.standings(),
    });
  }

  standings() {
    return squadStandings([...this.squads.keys()], this.ranked);
  }

  finishMeet(now) {
    this.phase = 'done';
    this.endedAt = now;
    this.broadcast({ t: 'final', standings: this.standings(), at: now });
    for (const s of this.squads.values()) this.io.released(s.key, 'done');
    this.io.update(this.info());
  }

  // ------------------------------------------------------------------ sockets

  /** A phone connects (or reconnects) as `uid`. False if they're not in this meet. */
  connect(peer) {
    const m = this.members.get(peer.uid);
    if (!m || this.phase === 'closed') return false;
    const old = this.peers.get(peer.uid);
    if (old && old !== peer) old.close();
    this.peers.set(peer.uid, peer);
    const was = m.connected;
    m.connected = true;
    m.lostAt = null;
    peer.send(this.snapshot(peer.uid));
    if (this.phase === 'lobby') this.lobbyChanged();
    else if (!was) {
      // Back: no longer "left" for the others (their next event has them again).
      applyPatch(m.doc, { left: null });
      this.forward(peer.uid, { left: null });
      this.broadcast({ t: 'presence', uid: peer.uid, connected: true });
    }
    return true;
  }

  /** A phone's socket closed. */
  disconnect(peer) {
    if (this.peers.get(peer.uid) !== peer) return; // replaced by a newer socket
    this.peers.delete(peer.uid);
    const m = this.members.get(peer.uid);
    if (!m) return;
    m.connected = false;
    m.lostAt = this.io.now();
    if (this.phase === 'lobby') return this.lobbyChanged();
    // The others see them leave, as a dropped phone in a live room.
    applyPatch(m.doc, { left: true });
    this.forward(peer.uid, { left: true });
    this.broadcast({ t: 'presence', uid: peer.uid, connected: false });
    this.reassignLegs(peer.uid);
  }

  /**
   * Relay: a runner's phone dropped. Their legs are run by a computer runner
   * (Amateur) on a teammate's phone: the one running the leg after theirs, or
   * the one before, or anyone left.
   */
  reassignLegs(uid) {
    const ev = this.events[this.current];
    if (!ev || ev.event !== 'relay4x100' || this.phase !== 'running') return;
    const squad = this.members.get(uid)?.squad;
    const legs = ev.legs?.[squad];
    if (!legs || !legs.includes(uid)) return;
    const here = (u) => u !== uid && this.members.get(u)?.connected;
    const mine = legs.map((u, i) => (u === uid ? i : -1)).filter((i) => i >= 0);
    const near = mine.flatMap((i) => [legs[i + 1], legs[i - 1]]).filter(Boolean);
    const proxy = near.find(here) ?? legs.find(here) ?? this.squads.get(squad)?.roster.find(here) ?? null;
    // Anyone whose legs this phone was already running for goes along too.
    for (const [gone, by] of Object.entries(ev.proxies)) if (by === uid) ev.proxies[gone] = proxy;
    ev.proxies[uid] = proxy;
    this.broadcast({ t: 'proxies', index: ev.index, proxies: ev.proxies });
  }

  /** Everything a phone needs on (re)connecting. */
  snapshot(uid) {
    const ev = this.events[this.current] ?? null;
    const peers = this.peersOf(uid);
    return {
      t: 'snapshot',
      id: this.id,
      phase: this.phase,
      lobby: this.lobbyView(),
      event: ev && this.eventView(ev),
      stages: this.stages.filter((s) => s.start != null).map((s) => ({ key: s.key, start: s.start, cutoff: s.cutoff, setLen: s.setLen, done: s.done })),
      results: this.events.filter((e) => e?.ranked).map((e) => ({ index: e.index, event: e.event, ranked: e.ranked.map((r) => ({ ...r, heat: e.event === 'relay4x100' ? null : e.heatOf.get(r.id) ?? null })) })),
      standings: this.lockAt != null ? this.standings() : null,
      docs: Object.fromEntries(peers.map((u) => [u, this.members.get(u)?.doc ?? {}])),
    };
  }

  /** A message from `uid`'s phone. */
  message(uid, msg) {
    if (!msg || typeof msg.t !== 'string') return;
    if (this.phase === 'lobby') return this.lobbyMessage(uid, msg);
    if (msg.t === 'patch') return this.patch(uid, msg.p);
  }

  /** An update to `uid`'s doc: kept, checked for results, passed on to their heat. */
  patch(uid, p) {
    const m = this.members.get(uid);
    if (!m || !p || typeof p !== 'object' || this.phase === 'lobby') return;
    if (JSON.stringify(p).length > MAX_PATCH) return;
    applyPatch(m.doc, p);
    if (Object.keys(m.doc.f ?? {}).length > MAX_DOC_KEYS) m.doc.f = {};
    for (const [path, value] of Object.entries(p)) {
      if (path.startsWith('res/')) this.takeResult(uid, path.slice(4), value);
      else if (path === 'res' && value && typeof value === 'object') for (const [k, v] of Object.entries(value)) this.takeResult(uid, k, v);
    }
    this.forward(uid, p);
  }

  /** The players `uid` can see now: their heat in the current event (the relay: everyone in it). */
  peersOf(uid) {
    const now = this.io.now();
    // The event whose title card is up (or after): its heats.
    let ev = null;
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i] && now >= this.events[i].window) {
        ev = this.events[i];
        break;
      }
    }
    ev ??= this.events[0];
    if (!ev) return [];
    const h = ev.heatOf.get(uid);
    if (h == null) return [];
    return ev.heats[h].filter((u) => u !== uid);
  }

  /** Passes `uid`'s patch on to the players who can see them. */
  forward(uid, p) {
    const msg = { t: 'doc', u: uid, p };
    for (const u of this.peersOf(uid)) this.peers.get(u)?.send(msg);
  }

  broadcast(msg) {
    for (const peer of this.peers.values()) peer.send(msg);
  }

  // ------------------------------------------------------------------ the clock

  /** About ten times a second: the lobby's timers, and the stages' ends. */
  tick() {
    const now = this.io.now();
    if (this.phase === 'lobby') return this.lobbyTick(now);
    if (this.phase === 'running') {
      const st = this.stage;
      if (st && now >= st.start && (this.complete(st) || now >= st.cutoff)) this.finishStage(st, now);
    }
    if (this.phase === 'done' && now - this.endedAt > s2ms(M.podium)) this.close();
  }

  lobbyTick(now) {
    // Phones that never turned up, or dropped and didn't come back.
    for (const m of [...this.members.values()]) if (!m.connected && m.lostAt != null && now - m.lostAt > s2ms(M.reconnect)) this.dropMember(m.uid, 'gone');
    if (this.phase !== 'lobby') return;
    // A Start early vote that didn't get everyone.
    if (this.voteSince != null && now - this.voteSince > s2ms(M.lobby.voteWait)) this.lobbyChanged(true);
    const all = [...this.squads.values()];
    for (const s of all) {
      if (s.shortSince != null && now - s.shortSince > s2ms(M.lobby.shortWait)) return this.removeSquad(s, 'short');
      // Everyone else is ready and this squad isn't: it has readyWait to press Ready.
      const othersReady = all.length >= MIN_SQUADS && all.every((o) => o === s || o.ready);
      if (!s.ready && othersReady) {
        s.unreadySince ??= now;
        if (now - s.unreadySince > s2ms(M.lobby.readyWait)) return this.removeSquad(s, 'idle');
      } else s.unreadySince = null;
    }
  }

  /** The meet is over (or emptied): everyone off. */
  close() {
    if (this.phase === 'closed') return;
    const was = this.phase;
    this.phase = 'closed';
    if (was === 'lobby') for (const s of this.squads.values()) this.io.released(s.key, 'closed');
    this.io.update(this.info());
    for (const peer of this.peers.values()) peer.close();
    this.peers.clear();
  }
}

const num = (x) => (Number.isFinite(x) ? x : null);

function shuffle(a, rand) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
