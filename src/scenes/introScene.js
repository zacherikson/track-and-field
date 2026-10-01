import { Button, text, roundRect } from '../core/ui.js';
import { getBest, setLineupSlot } from '../core/storage.js';
import { CHARACTERS, player, heightOf } from '../athletes/roster.js';
import { drawFigure, runPose } from '../athletes/stickFigure.js';
import { formatMark } from '../events/registry.js';
import { flow } from '../flow.js';
import { tournament, ORDER } from '../tournament/tournament.js';
import { serverNow } from '../online/live.js';
import { prewarmSDK, isSignedIn } from '../online/firebase.js';
import { counts } from '../online/bests.js';

const ON_TRACK = 4000; // ms before a live event starts that it's shown (the gun's READY / GET SET, or a round's countdown)

/**
 * Event title card: name, world record, your best, how to play. Tap to start.
 * In a live tournament it counts down instead, and the event starts at the
 * same moment for everyone (online/live.js).
 *
 * Top left, Back (Quit in a tournament) goes to the menu. Top right, the
 * athlete who does this event for you, warming up: tap them to swap in
 * someone else (it changes this event's lineup slot). Not in a solo
 * tournament (one athlete does all five) or a live one (the others already
 * know who you are).
 */
export class IntroScene {
  constructor(ev) {
    this.ev = ev;
  }

  enter() {
    this.age = 0;
    this.phase = 0;
    this.picking = false; // the athlete picker is open
    const solo = tournament.active && tournament.mode === 'solo';
    this.canSwap = !tournament.live && !solo;
    this.athleteNote = solo ? 'Does all five' : this.canSwap ? 'Tap to swap' : '';
    this.backBtn = tournament.live
      ? null
      : new Button({ label: tournament.active ? '‹ Quit' : '‹ Back', w: 110, h: 42, size: 19, color: 'rgba(255,255,255,0.15)', onTap: () => flow.menu(this.game) });
    this.best = getBest(this.ev.id);
    this.live = tournament.active ? tournament.live : null;
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
    for (const e of this.game.input.consume(t + dt)) {
      // Short grace period so the tap that opened this card doesn't also skip it.
      if (this.age < 0.35) continue;
      if (this.picking) {
        this.pickInput(e);
        continue;
      }
      if (e.type === 'key' && e.code === 'Escape') return flow.menu(this.game);
      if (e.type === 'down' && this.backBtn?.tap(e.x, e.y)) return;
      if (e.type === 'down' && this.canSwap && inBox(this.athleteBox, e)) {
        this.picking = true;
        continue;
      }
      if (!this.live && (e.type === 'down' || ['Space', 'Enter'].includes(e.code))) return flow.play(this.game, this.ev);
    }
    // Live: to the event a few seconds before it starts (it counts down the rest there).
    const start = this.live?.startOf(this.stage);
    if (start != null && serverNow() >= start - ON_TRACK) flow.play(this.game, this.ev);
  }

  /** The athlete picker: tap someone to put them in this event, anywhere else (or Esc) to leave it as it was. */
  pickInput(e) {
    if (e.type === 'key' && e.code === 'Escape') this.picking = false;
    if (e.type !== 'down') return;
    const hit = (this.pickBoxes ?? []).find((b) => inBox(b, e));
    if (hit) setLineupSlot(this.ev.id, hit.c.id);
    this.picking = false;
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

    if (tournament.active) {
      const me = tournament.standings().find((t) => t.isPlayer);
      const pts = me ? ` · ${me.total} pts` : '';
      text(ctx, `${this.live ? 'LIVE ' : ''}TOURNAMENT · EVENT ${tournament.index + 1} OF ${ORDER.length}${pts}`, cx, 20, { size: 15, weight: 700, color: 'rgba(255,255,255,0.7)' });
    }
    text(ctx, this.ev.name.toUpperCase(), cx, 100, { size: 50, color: '#ffb400', shadow: true });
    text(ctx, `World Record  ${formatMark(this.ev, this.ev.record)}`, cx, 160, { size: 22 });
    text(ctx, `Your Best  ${formatMark(this.ev, this.best)}`, cx, 192, { size: 18, weight: 500, color: 'rgba(255,255,255,0.8)' });

    const lines = this.ev.howTo || [];
    lines.forEach((l, i) => text(ctx, l, cx, 250 + i * 30, { size: 18, weight: 500, color: '#e6eefc', maxWidth: cw - 40 }));

    const pulse = 0.6 + 0.4 * Math.sin(this.age * 5);
    text(ctx, this.prompt(), cx, 450, { size: 24, color: `rgba(255,255,255,${pulse})`, maxWidth: cw - 40 });

    if (this.backBtn) {
      Object.assign(this.backBtn, { x: cx - cw / 2 + 16, y: 56 });
      this.backBtn.draw(ctx);
    }
    this.drawAthlete(ctx, cx + cw / 2 - 80, 186);
    if (this.picking) this.drawPicker(ctx, view);
  }

  /** Who does this event for you, feet at (x, y), with their name; tap them to swap. */
  drawAthlete(ctx, x, y) {
    const c = player(this.ev.id);
    this.athleteBox = { x: x - 70, y: y - 130, w: 140, h: 180 };
    if (this.canSwap) {
      roundRect(ctx, x - 62, y - 126, 124, 168, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 22, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    drawFigure(ctx, x, y, 104 * heightOf(c.colors), runPose(this.phase, 0.12), c.colors, y);
    text(ctx, c.name, x, y + 18, { size: 17, weight: 800, maxWidth: 120 });
    if (this.athleteNote) text(ctx, this.athleteNote, x, y + 36, { size: 13, weight: 600, color: this.canSwap ? '#ffd35c' : 'rgba(255,255,255,0.65)', maxWidth: 120 });
  }

  /** Everyone, side by side: who should do this event? The one doing it now is ringed in gold. */
  drawPicker(ctx, view) {
    ctx.fillStyle = 'rgba(5,10,22,0.75)';
    ctx.fillRect(0, 0, view.w, view.h);
    const n = CHARACTERS.length;
    const slot = Math.min(120, (view.w - 60) / n);
    const pw = slot * n + 28;
    const px = view.w / 2 - pw / 2;
    const py = 120;
    roundRect(ctx, px, py, pw, 290, 20);
    ctx.fillStyle = '#1d3a66';
    ctx.fill();
    text(ctx, `Who does the ${this.ev.name}?`, view.w / 2, py + 34, { size: 24, weight: 800, maxWidth: pw - 30 });
    const now = player(this.ev.id);
    const ground = py + 200;
    this.pickBoxes = CHARACTERS.map((c, i) => {
      const x = px + 14 + slot * i + slot / 2;
      const box = { x: x - slot / 2 + 4, y: py + 64, w: slot - 8, h: 196, c };
      roundRect(ctx, box.x, box.y, box.w, box.h, 12);
      ctx.fillStyle = c === now ? 'rgba(255,180,0,0.22)' : 'rgba(255,255,255,0.07)';
      ctx.fill();
      if (c === now) {
        ctx.strokeStyle = '#ffb400';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      drawFigure(ctx, x, ground, 104 * heightOf(c.colors), runPose(this.phase + i * 1.3, 0.12), c.colors, ground);
      text(ctx, c.name, x, ground + 22, { size: 15, weight: 800, maxWidth: slot - 12 });
      if (c === now) text(ctx, 'Doing it', x, ground + 42, { size: 12, weight: 700, color: '#ffd35c' });
      return box;
    });
    text(ctx, 'Tap an athlete to swap them in · tap outside to cancel', view.w / 2, py + 276, { size: 13, weight: 600, color: 'rgba(255,255,255,0.6)', maxWidth: pw - 30 });
  }
}

const inBox = (b, e) => !!b && e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h;
