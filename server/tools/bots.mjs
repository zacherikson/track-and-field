#!/usr/bin/env node
// Bot squads for the meet server: they sign up, ready up, and post plausible
// marks at plausible times, so a whole meet runs without 24 people.
//
//   npm run dev                                   (in server/, another terminal)
//   node tools/bots.mjs --squads 3 [--url ws://localhost:8787] [--drop 0.1] [--meets 1]
//
// --squads  squads per meet (each of 4 bots); --meets  meets at once
// --drop    chance each bot drops out (its socket closes) at some point
// --prefix  squad name prefix (to keep runs apart)
// --min     squads in the lobby before bot captains vote Start early (default 2)
// --droprelay key  that squad's bots drop out as the relay comes up (their legs go to a computer runner)
// --dropevent  with --droprelay: drop out as this event comes up instead (javelin: gone before the relay's legs are drawn)
// --join    key:n  also sign n bots up for squad `key` (to play alongside a real player in that squad)
// Prints the meet's timeline and how long it took.
import { PROTOCOL } from '../../src/meet/protocol.js';
import { MEET_ORDER } from '../../src/meet/rules.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] == null ? '1' : all[i + 1]]] : acc), []),
);
const URL_BASE = args.url ?? 'ws://localhost:8787';
const SQUADS = Number(args.squads ?? 3);
const MEETS = Number(args.meets ?? 1);
const DROP = Number(args.drop ?? 0);
const PREFIX = args.prefix ?? `b${Date.now().toString(36).slice(-4)}`;
const MIN_VOTE = Number(args.min ?? 2); // squads in the lobby before the bots' captains vote Start early (wait for a real player's squad)

const rnd = (a, b) => a + Math.random() * (b - a);
const T0 = Date.now();
const stamp = () => `${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}s`;
const log = (...a) => console.log(stamp(), ...a);

/** How long each event's attempt takes a bot (s from the stage start) and its mark. */
function attempt(event, skill) {
  switch (event) {
    case 'sprint100': {
      const m = rnd(9.6, 12.5) + skill;
      return { after: m, mark: m };
    }
    case 'hurdles110': {
      const m = rnd(12.5, 16.5) + skill;
      return { after: m, mark: m };
    }
    case 'longjump':
      return { after: rnd(7, 10), mark: Math.random() < 0.2 ? null : rnd(6, 8.4) - skill };
    case 'polevault':
      return { after: rnd(8, 12), mark: Math.random() < 0.25 ? null : rnd(4.2, 5.9) - skill / 2 };
    case 'javelin':
      return { after: rnd(7, 10), mark: Math.random() < 0.2 ? null : rnd(55, 85) - skill * 5 };
    case 'relay4x100': {
      const m = rnd(35, 44);
      return { after: m, mark: m };
    }
  }
}

class Bot {
  constructor(squadKey, uid, name) {
    Object.assign(this, { squadKey, uid, name, skill: rnd(0, 1.5), meetWs: null, sent: new Set(), drop: Math.random() < DROP ? rnd(20, 240) : null });
  }

  socket(path, onMsg) {
    const ws = new WebSocket(`${URL_BASE}${path}`);
    ws.addEventListener('open', () => ws.send(JSON.stringify({ t: 'hello', token: `dev:${this.uid}:${this.name}`, v: PROTOCOL, build: 'bot', squadName: this.squadKey })));
    ws.addEventListener('message', (e) => onMsg(JSON.parse(e.data)));
    ws.addEventListener('error', (e) => log(this.uid, 'socket error', e.message ?? ''));
    return ws;
  }

  signup() {
    this.hub = this.socket(`/squad/${encodeURIComponent(this.squadKey)}`, (m) => {
      if (m.t === 'welcome') this.hub.send(JSON.stringify({ t: 'signup', athlete: 'juno', pbs: { sprint100: 10 + this.skill } }));
      if (m.t === 'goto') {
        this.hub.close();
        this.joinMeet(m.meet);
      }
      if (m.t === 'busy') log(this.uid, 'busy', m.why);
    });
  }

  joinMeet(id) {
    this.meetId = id;
    this.stages = new Map();
    this.meetWs = this.socket(`/meet/${id}`, (m) => this.onMeet(m));
    if (this.drop != null) setTimeout(() => {
      log(this.uid, 'drops out');
      this.meetWs.close();
      this.dropped = true;
    }, this.drop * 1000);
  }

  send(m) {
    if (this.meetWs?.readyState === 1) this.meetWs.send(JSON.stringify(m));
  }

  onMeet(m) {
    if (m.t === 'lobby' || m.t === 'snapshot') {
      const lobby = m.t === 'lobby' ? m : m.lobby;
      const mine = lobby.squads.find((s) => s.key === this.squadKey);
      if (lobby.phase !== 'lobby' || mine?.captain !== this.uid) return;
      if (!mine.ready && mine.roster.length === 4) setTimeout(() => this.send({ t: 'ready' }), rnd(300, 1500));
      if (lobby.canStartEarly && !mine.vote && lobby.squads.length >= MIN_VOTE) setTimeout(() => this.send({ t: 'startEarly' }), rnd(300, 1500));
    }
    if (m.t === 'event') this.event = m;
    if (m.t === 'event' && m.event === (args.dropevent ?? 'relay4x100') && args.droprelay === this.squadKey) {
      log(this.uid, `drops out at the ${m.event}`);
      setTimeout(() => this.meetWs.close(), 300);
      this.dropped = true;
    }
    if (m.t === 'stage') this.onStage(m);
    if (m.t === 'final' && this.isReporter) {
      onFinal(this.meetId, m);
    }
    if (m.t === 'results' && this.isReporter) onResults(this.meetId, m);
  }

  /** A stage is set: post a mark when the attempt would be over. */
  onStage(st) {
    if (this.sent.has(st.key)) return;
    this.sent.add(st.key);
    const [i, event] = st.key.split('-');
    const ev = this.event;
    if (!ev || Number(i) !== ev.index) return;
    let mine = ev.heats.some((h) => h.includes(this.uid));
    if (event === 'relay4x100') {
      const legs = ev.legs?.[this.squadKey];
      mine = legs?.[3] === this.uid; // the anchor's phone gives the time
    }
    if (!mine) return;
    const a = attempt(event, this.skill);
    const wait = st.start - Date.now() + a.after * 1000;
    setTimeout(() => {
      if (this.dropped) return;
      this.send({ t: 'patch', p: { s: st.key, [`res/${st.key}`]: a.mark == null ? { foul: true } : { mark: Math.round(a.mark * 1000) / 1000 } } });
    }, Math.max(0, wait));
  }
}

const meets = new Map(); // id -> { lockAt, events: [] }
function onResults(id, m) {
  const top = m.ranked.slice(0, 3).map((r) => `${r.id}:${r.mark?.toFixed?.(2) ?? '—'}(${r.pts})`).join(' ');
  log(`[${id.slice(0, 6)}] ${MEET_ORDER[m.index]} done · ${top} · ${m.standings.map((s) => `${s.squad}=${s.total}`).join(' ')}`);
}
let finals = 0;
function onFinal(id, m) {
  const info = meets.get(id) ?? {};
  log(`[${id.slice(0, 6)}] FINAL ${m.standings.map((s) => `${s.rank}. ${s.squad} ${s.total}`).join(' · ')}`);
  if (info.lockAt) log(`[${id.slice(0, 6)}] meet took ${((m.at - info.lockAt) / 1000).toFixed(1)} s from the lock (${((m.at - info.lockAt) / 60000).toFixed(2)} min)`);
  if (++finals >= MEETS) setTimeout(() => process.exit(0), 500);
}

const bots = [];
for (let mt = 0; mt < MEETS; mt++) {
  for (let s = 0; s < SQUADS; s++) {
    const key = `${PREFIX}m${mt}s${s}`;
    for (let i = 0; i < 4; i++) bots.push(new Bot(key, `${key}u${i}`, `${String.fromCharCode(65 + s)}${i + 1}`));
  }
}
if (args.join) {
  const [key, n] = args.join.split(':');
  for (let i = 0; i < Number(n ?? 3); i++) bots.push(new Bot(key, `${key}bot${i}`, `Bot${i + 1}`));
}
// One bot per squad tells us about its meet.
const reporters = new Set();
for (const b of bots) {
  if (!reporters.has(b.squadKey)) {
    reporters.add(b.squadKey);
    if ([...reporters].length % SQUADS === 1 || SQUADS === 1) b.isReporter = true;
  }
}
// Note when each meet locks.
const watchLock = (b) => {
  const orig = b.onMeet.bind(b);
  b.onMeet = (m) => {
    const lobby = m.t === 'lobby' ? m : m.t === 'snapshot' ? m.lobby : null;
    if (lobby?.lockAt && !meets.get(b.meetId)?.lockAt) {
      meets.set(b.meetId, { lockAt: lobby.lockAt });
      log(`[${b.meetId.slice(0, 6)}] locked with ${lobby.squads.length} squads: ${lobby.squads.map((s) => `${s.key}(lane ${s.lane})`).join(', ')}`);
    }
    orig(m);
  };
};
bots.filter((b) => b.isReporter).forEach(watchLock);
log(`${bots.length} bots, ${SQUADS} squads a meet, ${MEETS} meet(s), ${URL_BASE}`);
bots.forEach((b, i) => setTimeout(() => b.signup(), i * 40));
setTimeout(() => {
  log('gave up after 15 minutes');
  process.exit(1);
}, 15 * 60 * 1000);
