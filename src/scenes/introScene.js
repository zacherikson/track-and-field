import { Button, text, roundRect } from '../core/ui.js';
import { getBest } from '../core/storage.js';
import { player, heightOf } from '../athletes/roster.js';
import { drawFigure, runPose } from '../athletes/stickFigure.js';
import { formatMark } from '../events/registry.js';
import { flow } from '../flow.js';
import { tournament, ORDER } from '../tournament/tournament.js';
import { serverNow } from '../online/live.js';
import { prewarmSDK, isSignedIn } from '../online/firebase.js';
import { counts } from '../online/bests.js';
import { meet } from '../meet/meet.js';
import { formatPoints } from '../meet/scoring.js';
import { MEET_ORDER } from '../meet/rules.js';
import { drawStrip, drawSteps, stepsHeight } from './howTo.js';

const ON_TRACK = 4000; // ms before a live event starts that it's shown (the gun's READY / GET SET, or a round's countdown)

/**
 * Event title card: name, world record, your best, and the controls in the
 * order you use them (howTo.js strip). Tap to start. In a live tournament it
 * counts down instead, and the event starts at the same moment for everyone
 * (online/live.js).
 *
 * Top left, Back (Quit in a tournament) goes to the menu. Top right, your
 * athlete, warming up. ❓ How to play opens the event's steps over the card
 * (not a screen of their own, so a live countdown carries on underneath);
 * any tap closes them.
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
      : new Button({ label: tournament.active ? '‹ Quit' : '‹ Back', w: 110, h: 42, size: 19, color: 'rgba(255,255,255,0.15)', onTap: () => flow.menu(this.game) });
    this.howBtn = new Button({ label: '❓ How to play', w: 200, h: 44, size: 19, color: 'rgba(255,255,255,0.15)', onTap: () => (this.howOpen = true) });
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

  render(ctx, view) {
    ctx.fillStyle = '#12203a';
    ctx.fillRect(0, 0, view.w, view.h);
    const cw = Math.min(720, view.w - 40);
    const cx = view.w / 2;
    roundRect(ctx, cx - cw / 2, 40, cw, 460, 22);
    ctx.fillStyle = '#1d3a66';
    ctx.fill();

    if (this.meet) {
      const mine = meet.standings?.find((r) => r.squad === meet.me?.squad);
      const pts = mine ? ` · ${meet.mySquad?.name ?? ''} ${formatPoints(mine.total)} pts` : '';
      text(ctx, `SQUAD MEET · EVENT ${meet.index + 1} OF ${MEET_ORDER.length}${pts}`, cx, 20, { size: 15, weight: 700, color: 'rgba(255,255,255,0.7)' });
    } else if (tournament.active) {
      const me = tournament.standings().find((t) => t.isPlayer);
      const pts = me ? ` · ${me.total} pts` : '';
      text(ctx, `${this.live ? 'LIVE ' : ''}TOURNAMENT · EVENT ${tournament.index + 1} OF ${ORDER.length}${pts}`, cx, 20, { size: 15, weight: 700, color: 'rgba(255,255,255,0.7)' });
    }
    text(ctx, this.ev.name.toUpperCase(), cx, 100, { size: 50, color: '#ffb400', shadow: true });
    text(ctx, `World Record  ${formatMark(this.ev, this.ev.record)}`, cx, 160, { size: 22 });
    text(ctx, `Your Best  ${formatMark(this.ev, this.best)}`, cx, 192, { size: 18, weight: 500, color: 'rgba(255,255,255,0.8)' });

    drawStrip(ctx, this.ev.id, cx, 284);
    if (this.meet) text(ctx, this.meetLine(), cx, 222, { size: 17, weight: 700, color: '#ffd35c', maxWidth: cw - 200 });

    Object.assign(this.howBtn, { x: cx - this.howBtn.w / 2, y: 366 });
    this.howBtn.draw(ctx);
    const pulse = 0.6 + 0.4 * Math.sin(this.age * 5);
    text(ctx, this.prompt(), cx, 450, { size: 24, color: `rgba(255,255,255,${pulse})`, maxWidth: cw - 40 });

    if (this.backBtn) {
      Object.assign(this.backBtn, { x: cx - cw / 2 + 16, y: 56 });
      this.backBtn.draw(ctx);
    }
    this.drawAthlete(ctx, cx + cw / 2 - 80, 186);
    if (this.howOpen) this.drawHowTo(ctx, view, cx, cw);
  }

  /** The event's steps over the card. */
  drawHowTo(ctx, view, cx, cw) {
    ctx.fillStyle = 'rgba(8,14,28,0.7)';
    ctx.fillRect(0, 0, view.w, view.h);
    const rowH = 54;
    const h = stepsHeight(this.ev.id, rowH) + 112;
    const y = Math.max(16, (view.h - h) / 2);
    roundRect(ctx, cx - cw / 2, y, cw, h, 22);
    ctx.fillStyle = '#1d3a66';
    ctx.fill();
    text(ctx, `HOW TO PLAY · ${this.ev.name.toUpperCase()}`, cx, y + 26, { size: 20, color: '#ffb400', maxWidth: cw - 40 });
    drawSteps(ctx, this.ev.id, cx - cw / 2 + 10, y + 46, cw - 20, rowH);
    text(ctx, 'Tap to close', cx, y + h - 14, { size: 14, weight: 600, color: 'rgba(255,255,255,0.6)' });
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

  /** Your athlete, feet at (x, y), with their name. */
  drawAthlete(ctx, x, y) {
    const c = player(this.ev.id);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 22, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    drawFigure(ctx, x, y, 104 * heightOf(c.colors), runPose(this.phase, 0.12), c.colors, y);
    text(ctx, c.name, x, y + 18, { size: 17, weight: 800, maxWidth: 120 });
  }
}
