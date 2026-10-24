import { Button, text, slab, chamfer, nameTag, PAL } from '../core/ui.js';
import { drawIcon } from '../core/icons.js';
import { pinebrook, westfield, olympic } from '../render/posterScenery.js';
import { getBest, getCampaign } from '../core/storage.js';
import { player, heightOf } from '../athletes/roster.js';
import { drawFigure, runPose } from '../athletes/stickFigure.js';
import { formatMark, SPECIAL_EVENTS } from '../events/registry.js';
import { flow } from '../flow.js';
import { tournament, ORDER } from '../tournament/tournament.js';
import { serverNow } from '../online/live.js';
import { prewarmSDK, isSignedIn } from '../online/firebase.js';
import { counts } from '../online/bests.js';
import { meet } from '../meet/meet.js';
import { formatPoints } from '../meet/scoring.js';
import { MEET_ORDER } from '../meet/rules.js';
import { drawStrip, drawSteps, stepsHeight } from './howTo.js';
import { survival } from '../survival/survival.js';

const ON_TRACK = 4000; // ms before a live event starts that it's shown (the gun's READY / GET SET, or a round's countdown)

/**
 * Event title card, a cream poster: down its left side a strip of the venue
 * you're about to compete in, the event's icon on a plate in the venue's
 * colour, and your athlete warming up; on the right the name, world record,
 * your best and the controls in the order you use them (howTo.js strip).
 * Tap to start. In a live tournament it counts down instead, and the event
 * starts at the same moment for everyone (online/live.js).
 *
 * In survival: the round, your points, and who you're up against (a new
 * name each round).
 *
 * Top left, Back (Quit in a tournament or a survival run) goes to the menu. How to play opens
 * the event's steps over the card (not a screen of their own, so a live
 * countdown carries on underneath); any tap closes them.
 */
export class IntroScene {
  constructor(ev) {
    this.ev = ev;
  }

  enter() {
    this.age = 0;
    this.phase = 0;
    this.meet = meet.active;
    this.backBtn = tournament.live || this.meet
      ? null
      : new Button({ label: tournament.active || survival.active ? 'Quit' : 'Back', icon: 'back', look: 'chip', w: 104, h: 44, onTap: () => flow.menu(this.game) });
    this.howBtn = new Button({ label: 'How to play', icon: 'howto', w: 184, h: 48, size: 20, color: PAL.ink, lip: PAL.inkShade, onTap: () => (this.howOpen = true) });
    // Tap to start, as a real button (a live event: its countdown, on ink).
    this.startBtn = new Button({ label: 'Tap to start', w: 280, h: 56, size: 27, color: PAL.orange, lip: PAL.orangeShade });
    this.howOpen = false;
    this.best = getBest(this.ev.id);
    this.live = this.meet ? meet.session : tournament.active ? tournament.live : null;
    this.stage = this.live?.eventStage(this.ev.id);
    this.live?.ready(this.stage); // already, from the standings
    // Your mark goes up the moment this event ends (online/post.js), which is
    // the first write of most sessions and so pays for the Firebase SDK. Fetch
    // it while this card is up and the race is on, so the results screen shows
    // your place without waiting for a download. Only when the mark will go up:
    // guests and changed tuning don't post one.
    if (this.ev.online && isSignedIn() && counts()) prewarmSDK();
  }

  update(dt, t) {
    this.age += dt;
    this.phase += dt * 5; // your athlete warming up
    this.backBtn?.update(dt);
    this.howBtn.update(dt);
    this.startBtn.update(dt);
    for (const e of this.game.input.consume(t + dt)) {
      // Short grace period so the tap that opened this card doesn't also skip it.
      if (this.age < 0.35) continue;
      // The steps are up: any tap (or key) puts them away.
      if (this.howOpen) {
        if (e.type === 'down' || e.type === 'key') this.howOpen = false;
        continue;
      }
      if (e.type === 'key' && e.code === 'Escape') return flow.menu(this.game);
      if (e.type === 'key' && e.code === 'KeyH') this.howOpen = true;
      if (e.type === 'down' && (this.backBtn?.tap(e.x, e.y) || this.howBtn.tap(e.x, e.y))) return;
      if (!this.live && e.type === 'down') this.startBtn.pressT = 0.12;
      if (!this.live && (e.type === 'down' || ['Space', 'Enter'].includes(e.code))) return flow.play(this.game, this.ev);
    }
    // A meet lost on this phone (meet/meet.js): back to the squad, rather than wait for a start that won't come.
    if (this.meet && meet.lost && !meet.final) return flow.menu(this.game, 'squad');
    // Live: to the event a few seconds before it starts (it counts down the rest there).
    const start = this.live?.startOf(this.stage);
    if (start != null && serverNow() >= start - ON_TRACK) flow.play(this.game, this.ev);
  }

  /** The line at the bottom: what a tap does, or when a live tournament's event starts. */
  prompt() {
    if (!this.live) return 'Tap to start';
    const start = this.live.startOf(this.stage);
    if (start != null) return `Starts in ${Math.max(1, Math.ceil((start - serverNow()) / 1000))}`;
    const names = this.live.waitingFor(this.stage).map((p) => p.name);
    return `Waiting for ${names.join(', ') || 'the others'}…`;
  }

  /** Where you're about to compete: { draw(ctx, x, y, w, h), plate } (the icon plate's colour). */
  venue() {
    const lit = (fn, opts = {}) => (ctx, x, y, w, h) => fn(ctx, x, y, w, h, { trackH: 120, ...opts });
    if (this.live) return { draw: lit(olympic, { night: !this.meet }), plate: PAL.liveGreen };
    if (SPECIAL_EVENTS.some((e) => e.id === this.ev.id)) return { draw: lit(olympic), plate: PAL.magenta };
    if (survival.active) return { draw: survival.round <= 2 ? lit(westfield) : lit(olympic), plate: PAL.survival }; // as render/venues.js venueFor
    const level = getCampaign();
    if (level === 'amateur') return { draw: lit(westfield), plate: PAL.brick };
    if (level === 'pro') return { draw: lit(olympic), plate: PAL.blue };
    return { draw: lit(pinebrook, { clouds: [[0.5, 0.12, 0.05]] }), plate: PAL.deep };
  }

  render(ctx, view) {
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(0, 0, view.w, view.h);
    const pw = Math.min(660, view.w - 40);
    const ph = 460;
    const px = view.w / 2 - pw / 2;
    const py = 40;
    const lipH = 7;
    slab(ctx, px, py, pw, ph, { face: PAL.cream, lip: PAL.creamShade, lipH, c: 10 });

    // The venue strip down the left, the event's icon on a plate, your athlete.
    const colW = Math.min(220, pw * 0.34);
    const venue = this.venue();
    ctx.save();
    chamfer(ctx, px, py, colW, ph - lipH, 10);
    ctx.clip();
    venue.draw(ctx, px - 100, py, colW + 200, ph - lipH);
    ctx.restore();
    const plate = Math.min(140, colW - 60);
    ctx.fillStyle = venue.plate;
    chamfer(ctx, px + colW / 2 - plate / 2, py + 120, plate, plate, 8);
    ctx.fill();
    drawIcon(ctx, this.ev.id, px + colW / 2, py + 120 + plate / 2, plate * 0.74, PAL.cream);
    this.drawAthlete(ctx, px + colW / 2, py + ph - 40);

    // Above the card: where you are in a tournament or meet.
    const top = (s) => text(ctx, s, view.w / 2, 20, { size: 17, font: 'body', color: 'rgba(245,234,208,0.75)', maxWidth: view.w - 40 });
    if (this.meet) {
      const mine = meet.standings?.find((r) => r.squad === meet.me?.squad);
      const pts = mine ? ` · ${meet.mySquad?.name ?? ''} ${formatPoints(mine.total)} pts` : '';
      top(`SQUAD MEET · EVENT ${meet.index + 1} OF ${MEET_ORDER.length}${pts}`);
    } else if (survival.active) {
      top(`SURVIVAL · ROUND ${survival.round} · EVENT ${survival.index + 1} OF ${survival.order.length} · ${survival.total} pts`);
    } else if (tournament.active) {
      const me = tournament.standings().find((t) => t.isPlayer);
      const pts = me ? ` · ${me.total} pts` : '';
      top(`${this.live ? 'LIVE ' : ''}TOURNAMENT · EVENT ${tournament.index + 1} OF ${ORDER.length}${pts}`);
    }

    // The right side: name over orange and gold rules, the marks, the controls, the buttons.
    const rw = pw - colW;
    const cx = px + colW + rw / 2;
    text(ctx, this.ev.name.toUpperCase(), cx, py + 76, { size: 64, font: 'display', track: 2, color: PAL.ink, maxWidth: rw - 40 });
    const rule = Math.min(300, rw - 60);
    ctx.fillStyle = PAL.orange;
    ctx.fillRect(cx - rule / 2, py + 112, rule, 5);
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(cx - rule / 2, py + 120, rule, 5);
    text(ctx, `World Record  ${formatMark(this.ev, this.ev.record)}`, cx, py + 152, { size: 24, font: 'body', weight: 800, color: PAL.ink, maxWidth: rw - 30 });
    text(ctx, `Your Best  ${formatMark(this.ev, this.best)}`, cx, py + 182, { size: 19, font: 'body', weight: 600, color: PAL.muted });
    if (this.meet) text(ctx, this.meetLine(), cx, py + 212, { size: 17, font: 'body', weight: 800, color: PAL.orangeShade, maxWidth: rw - 30 });
    if (survival.active) {
      const fresh = survival.index === 0 && survival.round > 1 ? ' · a new rival, and better' : '';
      text(ctx, `vs ${survival.rival.name}${fresh}`, cx, py + 212, { size: 19, font: 'body', weight: 800, color: PAL.survival, maxWidth: rw - 30 });
    }
    drawStrip(ctx, this.ev.id, cx, py + 250, { width: rw - 20, ink: PAL.ink, arrow: '#9D9070', font: 'display' });

    Object.assign(this.howBtn, { x: cx - this.howBtn.w / 2, y: py + 326 });
    this.howBtn.draw(ctx);
    const b = this.startBtn;
    b.label = this.prompt();
    b.color = this.live ? PAL.ink2 : PAL.orange;
    b.lip = this.live ? PAL.inkShade : PAL.orangeShade;
    Object.assign(b, { w: Math.min(this.live ? 380 : 280, rw - 30), x: 0, y: py + 386 });
    b.x = cx - b.w / 2;
    b.draw(ctx);

    if (this.backBtn) {
      Object.assign(this.backBtn, { x: px + 14, y: py + 14 });
      this.backBtn.draw(ctx);
    }
    if (this.howOpen) this.drawHowTo(ctx, view, view.w / 2, Math.min(720, view.w - 40));
  }

  /** The event's steps over the card, on ink. */
  drawHowTo(ctx, view, cx, cw) {
    ctx.fillStyle = 'rgba(23,20,58,0.78)';
    ctx.fillRect(0, 0, view.w, view.h);
    const rowH = 54;
    const h = stepsHeight(this.ev.id, rowH) + 132;
    const y = Math.max(16, (view.h - h) / 2);
    slab(ctx, cx - cw / 2, y, cw, h, { face: PAL.ink, lip: PAL.inkShade, lipH: 7, c: 10 });
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(cx - cw / 2 + 10, y, cw - 20, 5);
    text(ctx, `HOW TO PLAY · ${this.ev.name.toUpperCase()}`, cx, y + 30, { size: 26, font: 'display', track: 1.5, color: PAL.gold, maxWidth: cw - 40 });
    drawSteps(ctx, this.ev.id, cx - cw / 2 + 10, y + 50, cw - 20, rowH);
    text(ctx, 'Tap to close', cx, y + h - 24, { size: 16, font: 'body', color: 'rgba(245,234,208,0.6)' });
  }

  /** A meet: your heat and who's in it (the relay: your leg). */
  meetLine() {
    const i = meet.index;
    const ev = meet.events[i];
    if (!ev) return '';
    if (ev.legs) {
      const legs = ev.legs[meet.me?.squad] ?? [];
      const mine = legs.map((u, k) => (u === meet.uid ? k + 1 : null)).filter(Boolean);
      return mine.length ? `You run leg ${mine.join(' and ')} for ${meet.mySquad?.name ?? 'your squad'}` : '';
    }
    const h = meet.heatOf(i);
    const vs = meet.othersIn(i).map((p) => `${p.name} (${p.squadName})`);
    return `${ev.event === 'sprint100' || ev.event === 'hurdles110' ? 'Heat' : 'Flight'} ${h + 1} of ${ev.heats.length}${vs.length ? ` · vs ${vs.join(', ')}` : ''}`;
  }

  /** Your athlete warming up, feet at (x, y), their name on an ink tag. */
  drawAthlete(ctx, x, y) {
    const c = player(this.ev.id);
    ctx.fillStyle = 'rgba(38,34,79,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 22, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    drawFigure(ctx, x, y, 96 * heightOf(c.colors), runPose(this.phase, 0.12), c.colors, y);
    nameTag(ctx, c.name, x, y + 18);
  }
}
