import { CONFIG } from '../config.js';
import { MeetRelay } from './meetRelay.js';
import { RelayTeamSim } from './relaySim.js';
import { nearestLanes } from './laneRace.js';
import { assignLegs } from '../meet/relayLegs.js';
import { SQUAD_COLORS } from '../meet/rules.js';
import { CHARACTERS } from '../athletes/roster.js';
import { seededRandom } from '../core/random.js';

const LEVEL = 'pro'; // how the practice squad runs and passes (CONFIG.ai, CONFIG.relay.ai)
const KIT = { shirt: '#8a96a8', shorts: '#1b2a41' }; // the practice squad's: grey
const CPU_WAIT = 10; // s after your team's finish that the practice squad gets to finish before it's run to the line

/**
 * THE 4x100m RELAY IN A SQUAD'S PRACTICE (online/live.js, a room of 2 to 4
 * squadmates): the squad is ONE team, its runners each on their own phone as
 * in a meet (meetRelay.js), against the PRACTICE SQUAD, a computer team.
 *
 * Legs go round the room (meet/relayLegs.js, seeded by the room so every
 * phone agrees): 2 take turns, A B A B; 3, one of them runs two legs that
 * aren't next to each other; 4, a leg each. Someone whose phone drops off is
 * run by the computer on the first phone still here (in the room's order),
 * until they're back.
 *
 * The practice squad runs on every phone at once (relaySim.js): the same seed,
 * the same race, the same time, with nothing sent.
 */
export class PracticeRelay extends MeetRelay {
  setUp() {
    const s = this.live;
    this.uid = s.uid;
    this.mates = s.players; // the room, in the order they joined
    this.legUids = assignLegs(this.mates.map((p) => p.uid), seededRandom(`${s.room}/legs`));
    this.proxyKey = null;
    this.proxies = this.currentProxies();
  }

  /** Everyone gone is run by the first phone still here. */
  currentProxies() {
    const s = this.live;
    const gone = this.mates.filter((p) => p.uid !== this.uid && s.left(p.uid)).map((p) => p.uid);
    const stand = this.mates.find((p) => p.uid === this.uid || !s.left(p.uid))?.uid ?? this.uid;
    const key = `${gone.join(',')}>${stand}`;
    if (key !== this.proxyKey) {
      this.proxyKey = key;
      this.proxyMap = Object.fromEntries(gone.map((u) => [u, stand]));
    }
    return this.proxyMap;
  }

  relayTeams() {
    const sq = this.live.squad;
    return { mine: { key: sq?.key ?? 'squad', name: sq?.name ?? 'Your squad', color: SQUAD_COLORS[0], legs: this.legUids }, others: [] };
  }

  memberName(uid) {
    return this.mates.find((p) => p.uid === uid)?.name;
  }

  memberPlayer(uid) {
    return this.mates.find((p) => p.uid === uid);
  }

  /** Your squad in your lane, the practice squad next to it. */
  buildField() {
    const field = super.buildField();
    field.push(this.practiceSquad(nearestLanes(this.cfg.playerLane, this.cfg.lanes)[0]));
    return field.sort((a, b) => a.lane - b.lane);
  }

  /** The computer team: four athletes (the same on every phone) in grey, run by relaySim.js. */
  practiceSquad(lane) {
    const pick = seededRandom(`${this.live.room}/practice-squad`);
    const cap = CHARACTERS[Math.floor(pick() * CHARACTERS.length) % CHARACTERS.length];
    const team = this.team(lane, cap, false, false);
    for (const l of team.legs) l.colors = l.view.colors = { ...l.colors, ...KIT };
    this.toLeg(team, 0);
    return Object.assign(team, { name: 'Practice Squad', squad: 'practice', uids: [null, null, null, null], cpu: true });
  }

  resetField() {
    super.resetField();
    for (const a of this.athletes) {
      if (!a.cpu) continue;
      a.sim = new RelayTeamSim({
        cfg: this.cfg,
        level: CONFIG.ai[LEVEL],
        exchange: this.cfg.ai[LEVEL],
        rng: seededRandom(`${this.live.seedOf(this.stage)}/practice-squad`),
        legs: a.legs.map((l) => l.runner),
      });
      a.exchanges = a.sim.exchanges;
      this.toLeg(a, 0);
    }
  }

  takeControl(a, t) {
    if (!a.cpu) super.takeControl(a, t);
  }

  /** The practice squad, caught up to race time on its own clock. */
  stepAthlete(a, dt, t) {
    if (!a.cpu) return super.stepAthlete(a, dt, t);
    a.sim.advanceTo(t + dt - this.goT);
    if (a.sim.leg !== a.leg) this.toLeg(a, a.sim.leg);
    if (a.mark == null) a.mark = a.sim.mark; // its own time, exactly (not this phone's clock back again): the same on every phone
  }

  /** The practice squad's time is its own (stepAthlete). */
  crossing(a, t, dt) {
    return a.cpu ? null : super.crossing(a, t, dt);
  }

  /** The results wait for the practice squad (a while), then run it to the line. */
  finish() {
    const cpu = this.athletes.find((a) => a.cpu);
    if (cpu && cpu.mark == null) {
      const raceT = this.game.time - this.goT;
      if (raceT < (this.player.mark ?? this.cfg.maxRaceTime) + CPU_WAIT && cpu.sim.t < this.cfg.maxRaceTime) return;
      cpu.sim.advanceTo(this.cfg.maxRaceTime);
      cpu.mark = cpu.sim.mark;
    }
    super.finish();
  }
}
