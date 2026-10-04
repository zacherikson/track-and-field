import { CONFIG } from '../../src/config.js';
import { SQUAD_SIZE } from '../../src/meet/rules.js';

const SQUAD_CACHE = 20000; // ms a squad's member list is trusted before it's read again
const STALE_MEET = 3 * 60 * 1000; // ms without word from the squad's meet before it's taken as gone

/**
 * ONE SQUAD'S MEET SIGN-UP (docs/meets.md). The Squad tab keeps a socket here
 * while it's showing, so every member sees the sign-up and the squad's meet.
 *
 * Tapping Meet signs you up: the first four make the squad's team. With four
 * the squad goes to the Matchmaker, which finds it a meet lobby, and the four
 * are sent there (`goto`). Once the squad is in a meet, a place that opens up
 * (someone left the lobby) is filled by the next squadmate to tap Meet.
 *
 * `io`: { now(), loadSquad() -> { name, members: { uid: name } } | null,
 *         place(squad) -> meet id | null (Matchmaker + Meet.addSquad),
 *         fill(meetId, member) -> { ok }, save(state) }
 */
export class SquadHubCore {
  constructor(key, io) {
    this.key = key;
    this.io = io;
    this.peers = new Map(); // uid -> Set of their sockets (the Squad tab, the sign-up, another phone)
    this.forming = []; // the sign-up before the squad has a meet: [{ uid, name, athlete, lineup, pbs, lostAt }]
    this.meet = null; // { id, phase, squads, seen }: the squad's meet
    this.squad = null; // { name, members, at }
    this.placing = false;
  }

  /** The squad, from Firestore (cached), or null if it's closed. */
  async squadInfo(fresh = false) {
    const now = this.io.now();
    if (!fresh && this.squad && now - this.squad.at < SQUAD_CACHE) return this.squad;
    const s = await this.io.loadSquad();
    this.squad = s && { ...s, at: now };
    return this.squad;
  }

  /** A Squad tab connects. Members only (a dev-auth bot is taken at its word). */
  async connect(peer, hello) {
    let name = peer.name;
    if (!peer.dev) {
      let s = await this.squadInfo();
      if (!s?.members?.[peer.uid]) s = await this.squadInfo(true); // just joined the squad?
      if (!s?.members?.[peer.uid]) return false;
      name = s.members[peer.uid];
    } else this.squad ??= { name: String(hello.squadName ?? this.key).slice(0, 16), members: {}, at: this.io.now() };
    peer.name = name ?? '?';
    if (!this.peers.has(peer.uid)) this.peers.set(peer.uid, new Set());
    this.peers.get(peer.uid).add(peer);
    const f = this.forming.find((x) => x.uid === peer.uid);
    if (f) f.lostAt = null;
    peer.send(this.view());
    return true;
  }

  disconnect(peer) {
    const mine = this.peers.get(peer.uid);
    if (!mine?.delete(peer) || mine.size) return; // still here on another socket
    this.peers.delete(peer.uid);
    const f = this.forming.find((x) => x.uid === peer.uid);
    if (f) f.lostAt = this.io.now(); // off the sign-up if they're not back soon
  }

  async message(peer, msg) {
    if (msg.t === 'signup') return this.signup(peer, msg);
    if (msg.t === 'unsignup') {
      this.forming = this.forming.filter((x) => x.uid !== peer.uid);
      this.changed();
    }
  }

  /** Tapped Meet: onto the sign-up, into the squad's meet if it has a place, or back to it. */
  async signup(peer, msg) {
    const member = {
      uid: peer.uid,
      name: peer.name,
      athlete: typeof msg.athlete === 'string' ? msg.athlete.slice(0, 32) : '',
      lineup: msg.lineup && typeof msg.lineup === 'object' ? msg.lineup : null,
      pbs: msg.pbs && typeof msg.pbs === 'object' ? msg.pbs : {},
      lostAt: null,
    };
    this.checkMeet();
    const meet = this.meet;
    if (meet) {
      const mine = meet.squads?.find((s) => s.key === this.key);
      if (mine?.uids?.includes(peer.uid)) return peer.send({ t: 'goto', meet: meet.id }); // already in it: back you go
      if (meet.phase === 'lobby' && mine?.open > 0) {
        const r = await this.io.fill(meet.id, member).catch(() => ({ ok: false }));
        if (r?.ok) return peer.send({ t: 'goto', meet: meet.id });
      }
      return peer.send({ t: 'busy', why: meet.phase === 'lobby' ? 'full' : 'running' });
    }
    if (!this.forming.some((x) => x.uid === peer.uid)) {
      if (this.forming.length >= SQUAD_SIZE) return peer.send({ t: 'busy', why: 'full' });
      this.forming.push(member);
    }
    this.changed();
    this.tryPlace();
  }

  /** Four signed up: off to a meet. */
  async tryPlace() {
    if (this.placing || this.meet || this.forming.length < SQUAD_SIZE) return;
    this.placing = true;
    const team = this.forming.slice(0, SQUAD_SIZE);
    try {
      const s = await this.squadInfo().catch(() => null);
      const id = await this.io.place({ key: this.key, name: s?.name ?? this.key, roster: team.map(({ lostAt, ...m }) => m) });
      if (id) {
        this.meet = { id, phase: 'lobby', squads: [{ key: this.key, uids: team.map((m) => m.uid), open: 0 }], seen: this.io.now() };
        this.forming = this.forming.filter((x) => !team.includes(x));
        for (const m of team) this.sendTo(m.uid, { t: 'goto', meet: id });
        this.save();
      }
    } catch (e) {
      console.error('place', e);
    } finally {
      this.placing = false;
      this.changed();
    }
  }

  /** News from the squad's meet (Meet.info). */
  meetUpdate(info) {
    if (this.meet && this.meet.id !== info.id) return;
    if (info.phase === 'closed' || info.phase === 'done' || !info.squads?.some((s) => s.key === this.key)) return this.released(info.id);
    this.meet = { id: info.id, phase: info.phase, squads: info.squads, seen: this.io.now() };
    this.save();
    this.changed();
  }

  /** The squad is out of its meet (sent back, or it's over). */
  released(id) {
    if (!this.meet || this.meet.id !== id) return;
    this.meet = null;
    this.save();
    this.changed();
  }

  /** A meet that's gone quiet (its object restarted) is no meet. */
  checkMeet() {
    if (this.meet && this.io.now() - this.meet.seen > STALE_MEET) {
      this.meet = null;
      this.save();
    }
  }

  tick() {
    const now = this.io.now();
    const gone = this.forming.filter((x) => x.lostAt != null && now - x.lostAt > CONFIG.meet.reconnect * 1000);
    if (gone.length) {
      this.forming = this.forming.filter((x) => !gone.includes(x));
      this.changed();
    }
    this.checkMeet();
    this.tryPlace();
  }

  view() {
    const mine = this.meet?.squads?.find((s) => s.key === this.key);
    return {
      t: 'squad',
      key: this.key,
      forming: this.forming.map((x) => ({ uid: x.uid, name: x.name })),
      meet: this.meet && { id: this.meet.id, phase: this.meet.phase, squads: this.meet.squads.length, names: mine?.names ?? [], uids: mine?.uids ?? [], open: mine?.open ?? 0 },
    };
  }

  changed() {
    const v = this.view();
    for (const set of this.peers.values()) for (const p of set) p.send(v);
  }

  sendTo(uid, msg) {
    for (const p of this.peers.get(uid) ?? []) p.send(msg);
  }

  save() {
    this.io.save({ meet: this.meet });
  }

  load(state) {
    this.meet = state?.meet ?? null;
  }
}
