import { Button, text, roundRect } from '../core/ui.js';
import { getBest } from '../core/storage.js';
import { Conn, meetServer } from '../online/net.js';
import { serverNow } from '../online/live.js';
import { liveAthletes, TOUR_KINDS } from '../tournament/tournament.js';
import { EVENTS } from '../events/registry.js';
import { CONFIG } from '../config.js';
import { flow } from '../flow.js';
import { meet } from './meet.js';
import { SQUAD_SIZE, MAX_SQUADS, MEET_ORDER, EVENT_NAMES } from './rules.js';

const GOLD = '#ffb400';
const OK = '#59cd90';
const DIM = 'rgba(255,255,255,0.6)';
const PLAIN = 'rgba(255,255,255,0.18)';

/** Why a squad was sent back from a lobby, as the server says it (meetCore.js). */
const WITHDRAWN = {
  idle: 'Your squad didn’t press Ready in time, so it was sent back.',
  short: 'Your squad was a member short too long, so it was sent back.',
  gone: 'You were away too long and lost your place.',
  left: 'You left the meet.',
  empty: 'Your squad left the meet.',
  closed: 'The meet closed.',
};

/**
 * A SQUAD MEET, before the first event (docs/meets.md):
 *
 * SIGN-UP: you're on your squad's sign-up (its SquadHub on the meet server);
 * the first four make the team. With four, the squad is put in a meet lobby.
 *
 * LOBBY: the squads in the meet (up to six) with their four and their meet
 * captain (👑, picked at random). Captains press Ready; with everyone ready
 * and fewer than six squads, captains get Start early, and when every captain
 * has pressed it the meet starts with the squads there. Six all ready start
 * at once.
 *
 * COUNTDOWN: the lanes, then the 100m's title card.
 *
 * Also WAITING: back in a meet that's on (you reconnected, or dropped out of
 * an event): you're in from the next event you're in.
 */
export class MeetScene {
  /** `squad`: { key, name } to sign up for its meet; null when the meet is already joined (waiting). */
  constructor(squad, { waiting = false } = {}) {
    this.squad = squad;
    this.waiting = waiting;
  }

  enter() {
    this.age = 0;
    this.note = null; // { text, color }
    this.signup = null; // the SquadHub's view: { forming: [{ uid, name }], meet }
    this.leaveBtn = new Button({ label: 'Leave', w: 140, h: 48, size: 20, color: PLAIN, onTap: () => this.leave() });
    this.readyBtn = new Button({ label: 'Ready', w: 190, h: 56, size: 24, color: '#2bb673', onTap: () => this.toggleReady() });
    this.earlyBtn = new Button({ label: 'Start early', w: 210, h: 56, size: 22, color: '#d98a00', onTap: () => meet.send({ t: 'startEarly' }) });
    this.unwatch = meet.on(() => this.onMeet());
    if (this.waiting || meet.active) return;
    if (!meetServer()) {
      this.note = { text: 'Meets aren’t open yet: the meet server isn’t set up (docs/meets.md).', color: '#ffb35c' };
      return;
    }
    this.hub = new Conn(
      `/squad/${encodeURIComponent(this.squad.key)}`,
      { message: (m) => this.onHub(m), status: (s) => this.onHubStatus(s) },
      { squadName: this.squad.name },
    );
  }

  exit() {
    this.unwatch?.();
    this.hub?.close();
  }

  /** Signed in to the squad's hub: on the sign-up (again, after a reconnect: it's the same). */
  onHubStatus(s) {
    if (s === 'open') {
      const who = liveAthletes(TOUR_KINDS.team);
      const pbs = Object.fromEntries(EVENTS.map((ev) => [ev.id, getBest(ev.id)]));
      this.hub.send({ t: 'signup', athlete: who.athlete, lineup: who.lineup, pbs });
    } else if (s === 'denied') this.note = { text: 'The meet server didn’t let you in. Are you still in the squad?', color: '#ffb35c' };
    else if (s === 'reload') this.note = { text: 'There’s a new version of the game: reload the page to play meets.', color: '#ffb35c' };
  }

  onHub(m) {
    if (m.t === 'squad') this.signup = m;
    else if (m.t === 'goto') {
      this.hub.close();
      this.hub = null;
      meet.join(m.meet);
    } else if (m.t === 'busy') {
      this.note = { text: m.why === 'running' ? 'Your squad’s meet is on without you. Next time!' : 'Your squad’s four are already in.', color: '#ffb35c' };
    }
  }

  onMeet() {
    if (meet.withdrawn) this.note = { text: WITHDRAWN[meet.withdrawn] ?? 'You’re out of the meet.', color: '#ffb35c' };
    else if (meet.lostText) this.note = { text: meet.lostText, color: '#ffb35c' };
  }

  /** The captain's Ready button: ready, or not after all. */
  toggleReady() {
    const s = this.mySquad();
    if (!s) return;
    meet.send({ t: s.ready ? 'unready' : 'ready' });
  }

  leave() {
    if (this.hub) this.hub.send({ t: 'unsignup' });
    if (meet.active && meet.lobby?.lockAt == null) meet.send({ t: 'leave' });
    // Give the goodbye a moment to go before the sockets close.
    setTimeout(() => this.hub?.close(), 300);
    flow.menu(this.game, 'squad');
  }

  /** Your squad as the lobby has it. */
  mySquad() {
    return meet.lobby?.squads.find((s) => s.roster.some((m) => m.uid === meet.uid)) ?? null;
  }

  get captain() {
    return this.mySquad()?.captain === meet.uid;
  }

  update(dt, t) {
    this.age += dt;
    const btns = this.buttons();
    for (const e of this.game.input.consume(t + dt)) {
      if (e.type === 'down') btns.some((b) => b.tap(e.x, e.y));
      else if (e.code === 'Escape') this.leave();
      if (this.game.scene !== this) return;
    }
    btns.forEach((b) => b.update(dt));
    if (this.game.scene !== this) return;
    const s = this.mySquad();
    this.readyBtn.label = s?.ready ? 'Not ready' : 'Ready';
    this.readyBtn.color = s?.ready ? PLAIN : '#2bb673';
    this.readyBtn.enabled = !!s && s.roster.length === SQUAD_SIZE;
    // The meet's on: to its first event's title card, or (back in) the next event you're in.
    if (meet.active && meet.session) this.onTo();
  }

  /** Time to go to the event you're in next? */
  onTo() {
    const titleCard = CONFIG.meet.titleCard * 1000;
    for (let i = meet.index; i < MEET_ORDER.length; i++) {
      const ev = meet.events[i];
      if (!ev) {
        if (meet.events.some((e, j) => e && j > i)) continue; // skipped (a test meet starting later on)
        return;
      }
      if (!meet.inEvent(i)) continue; // not in this one (dropped out of it): wait for the next
      if (serverNow() < ev.start - titleCard) return;
      if (serverNow() > ev.start - 2000) continue; // too late to join it now
      flow.meetEvent(this.game, i);
      return;
    }
  }

  buttons() {
    if (!meet.active || meet.lobby?.lockAt != null || this.waiting || meet.session) return [this.leaveBtn];
    const out = [this.leaveBtn];
    if (this.captain) {
      out.push(this.readyBtn);
      const mine = this.mySquad();
      if (meet.lobby?.canStartEarly && !mine?.vote) out.push(this.earlyBtn);
    }
    return out;
  }

  render(ctx, view) {
    ctx.fillStyle = '#12203a';
    ctx.fillRect(0, 0, view.w, view.h);
    const cx = view.w / 2;
    text(ctx, '🏟 SQUAD MEET', cx, 34 + view.safe.t, { size: 28, color: GOLD, shadow: true });
    Object.assign(this.leaveBtn, { x: 14 + view.safe.l, y: 12 + view.safe.t });
    if (meet.active && meet.lobby) this.renderLobby(ctx, view);
    else if (meet.active || this.waiting) this.line(ctx, view, meet.state === 'reconnecting' ? 'Reconnecting…' : `Joining the meet${this.dots()}`, 240);
    else this.renderSignup(ctx, view);
    if (this.note) text(ctx, this.note.text, cx, view.h - 24 - view.safe.b, { size: 16, weight: 600, color: this.note.color, maxWidth: view.w - 40 });
    this.buttons().forEach((b) => b.draw(ctx));
  }

  dots() {
    return '.'.repeat(1 + (Math.floor(this.age * 3) % 3));
  }

  line(ctx, view, s, y, o = {}) {
    text(ctx, s, view.w / 2, y, { size: 20, weight: 600, color: '#fff', maxWidth: view.w - 40, ...o });
  }

  /** Your squad's four places, filling up. */
  renderSignup(ctx, view) {
    const cx = view.w / 2;
    if (!this.hub) return;
    const st = this.hub.state;
    this.line(ctx, view, `${this.squad.name}`, 72 + view.safe.t, { size: 18, color: DIM });
    if (st !== 'open' && !this.signup) return this.line(ctx, view, st === 'reconnecting' ? 'Reconnecting…' : `Connecting${this.dots()}`, 240);
    const names = this.signup?.forming ?? [];
    const w = Math.min(560, view.w - 40);
    const slotW = (w - 3 * 12) / 4;
    for (let i = 0; i < SQUAD_SIZE; i++) {
      const x = cx - w / 2 + i * (slotW + 12);
      const n = names[i];
      roundRect(ctx, x, 150, slotW, 90, 14);
      ctx.fillStyle = n ? 'rgba(89,205,144,0.22)' : 'rgba(255,255,255,0.06)';
      ctx.fill();
      if (n?.uid === this.hub.uid) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = GOLD;
        ctx.stroke();
      }
      text(ctx, n ? n.name : 'Open', x + slotW / 2, 195, { size: 18, weight: n ? 800 : 500, color: n ? '#fff' : DIM, maxWidth: slotW - 12 });
    }
    this.line(ctx, view, `${names.length} of ${SQUAD_SIZE} signed up${names.length < SQUAD_SIZE ? this.dots() : ''}`, 120, { size: 22, color: names.length === SQUAD_SIZE ? OK : '#fff' });
    const tip = names.length < SQUAD_SIZE ? 'The first four in make the team. Your squadmates see it on their Squad tab and tap Meet.' : 'Finding a meet…';
    this.line(ctx, view, tip, 290, { size: 15, weight: 500, color: DIM });
  }

  /** The squads in the meet, the captains' buttons, then the countdown and the lanes. */
  renderLobby(ctx, view) {
    const l = meet.lobby;
    const cx = view.w / 2;
    const locked = l.lockAt != null;
    const squads = locked ? [...l.squads].sort((a, b) => a.lane - b.lane) : l.squads;
    // Status line.
    let status;
    const titleCard = CONFIG.meet.titleCard * 1000;
    const begun = locked && (this.waiting || serverNow() > (l.firstStart ?? meet.events.find(Boolean)?.start ?? Infinity) - titleCard);
    if (begun) status = { text: 'The meet is on: you’re back in from the next event you’re in', color: OK, size: 20 };
    else if (locked) {
      const first = l.firstStart ?? meet.events[0]?.start;
      const left = first == null ? null : Math.max(0, Math.ceil((first - titleCard - serverNow()) / 1000));
      status = { text: left == null ? 'The meet is on!' : `The meet starts in ${Math.max(1, left)}`, color: OK, size: 26 };
    } else if (l.squads.length < 2) status = { text: `Waiting for another squad${this.dots()}`, color: '#fff', size: 20 };
    else if (l.canStartEarly) {
      const votes = l.squads.filter((s) => s.vote).length;
      const left = l.voteUntil ? Math.max(0, Math.ceil((l.voteUntil - serverNow()) / 1000)) : null;
      status = { text: `Everyone’s ready! Start early: ${votes} of ${l.squads.length} captains${left != null && votes ? ` · ${left}s` : ''}`, color: GOLD, size: 20 };
    } else {
      const ready = l.squads.filter((s) => s.ready).length;
      status = { text: `${l.squads.length} of ${MAX_SQUADS} squads · ${ready} ready · six ready start at once`, color: '#fff', size: 18 };
    }
    text(ctx, status.text, cx, 70 + view.safe.t, { size: status.size, color: status.color, maxWidth: view.w - 40 });

    // One row a squad.
    const top = 98 + view.safe.t;
    const bottom = view.h - 100 - view.safe.b;
    const rowH = Math.min(52, (bottom - top) / Math.max(1, squads.length));
    const w = Math.min(820, view.w - 30);
    const x0 = cx - w / 2;
    squads.forEach((s, i) => {
      const y = top + i * rowH;
      const mine = s.roster.some((m) => m.uid === meet.uid);
      roundRect(ctx, x0, y + 3, w, rowH - 6, 10);
      ctx.fillStyle = mine ? 'rgba(255,180,0,0.16)' : 'rgba(255,255,255,0.06)';
      ctx.fill();
      const cy = y + rowH / 2;
      if (locked) {
        ctx.fillStyle = s.color ?? GOLD;
        roundRect(ctx, x0 + 8, y + 8, 40, rowH - 16, 8);
        ctx.fill();
        text(ctx, String(s.lane), x0 + 28, cy, { size: 18, color: '#12203a' });
      }
      const nameX = x0 + (locked ? 58 : 14);
      text(ctx, s.name, nameX, cy, { size: 18, align: 'left', color: mine ? '#ffd35c' : '#fff', maxWidth: w * 0.22 });
      const people = s.roster.map((m) => `${m.uid === s.captain ? '👑' : ''}${m.name}${m.connected === false ? ' (away)' : ''}`).join(' · ');
      text(ctx, people + (s.roster.length < SQUAD_SIZE ? ` · ${SQUAD_SIZE - s.roster.length} open` : ''), x0 + w * 0.3, cy, { size: 14, weight: 600, align: 'left', color: DIM, maxWidth: w * 0.5 });
      if (!locked) {
        const chip = s.vote ? { t: 'START EARLY ✓', c: GOLD } : s.ready ? { t: 'READY ✓', c: OK } : s.roster.length < SQUAD_SIZE ? { t: `${s.roster.length}/${SQUAD_SIZE}`, c: '#ffb35c' } : { t: 'NOT READY', c: DIM };
        text(ctx, chip.t, x0 + w - 14, cy, { size: 15, align: 'right', color: chip.c });
      }
    });

    // The captain's buttons, along the bottom.
    const btns = this.buttons().filter((b) => b !== this.leaveBtn);
    let bx = cx - (btns.reduce((a, b) => a + b.w, 0) + 14 * (btns.length - 1)) / 2;
    for (const b of btns) {
      Object.assign(b, { x: bx, y: view.h - 86 - view.safe.b });
      bx += b.w + 14;
    }
    if (!locked && !meet.session) {
      const mine = this.mySquad();
      const cap = mine && meet.members.get(mine.captain)?.name;
      const hint = this.captain ? 'You’re your squad’s meet captain: press Ready when your four are set.' : cap ? `${cap} is your meet captain: they press Ready.` : '';
      if (!btns.length) text(ctx, hint, cx, view.h - 60 - view.safe.b, { size: 16, weight: 600, color: DIM, maxWidth: view.w - 40 });
    }
    if (locked) text(ctx, `${EVENT_NAMES[MEET_ORDER[0]]} first, then the long jump, hurdles, pole vault, javelin and the 4×100m relay.`, cx, view.h - 60 - view.safe.b, { size: 15, weight: 500, color: DIM, maxWidth: view.w - 40 });
  }
}
