import { Button, text, roundRect } from '../core/ui.js';
import { drawFigure, runPose, POSES } from '../athletes/stickFigure.js';
import { CHARACTERS, soloAthlete, lineupAthlete, heightOf } from '../athletes/roster.js';
import { setCharacter, setLineupSlot, getLineup } from '../core/storage.js';
import { EVENTS } from '../events/registry.js';
import { flow } from '../flow.js';

const SHORT = { sprint100: '100m', longjump: 'Long jump', hurdles110: 'Hurdles', polevault: 'Pole vault', javelin: 'Javelin' };

/**
 * Your lineup: who does each event (a slot per event), plus your solo athlete,
 * who does all five in a solo tournament. Tap a slot, then an athlete. The
 * same athlete can fill any number of slots. Remembered on this device.
 */
export class LineupScene {
  enter() {
    this.age = 0;
    this.phase = 0;
    // A slot per event, then the solo one (`event` null).
    this.slots = [...EVENTS.map((ev) => ({ event: ev.id, label: SHORT[ev.id] ?? ev.name })), { event: null, label: 'Solo' }].map((s) => ({ ...s, x: 0, y: 0, w: 0, h: 0, pressT: 0 }));
    this.sel = 0;
    // Slots never filled follow your solo athlete; fill them in now, so changing
    // the solo athlete from here doesn't change them too.
    for (const ev of EVENTS) if (!getLineup()[ev.id]) setLineupSlot(ev.id, soloAthlete().id);
    this.cards = CHARACTERS.map((c) => ({ c, x: 0, y: 0, w: 0, h: 0, pressT: 0 }));
    this.done = new Button({ label: 'Ready', w: 180, h: 48, onTap: () => flow.menu(this.game) });
    this.allBtn = new Button({ label: '', w: 240, h: 48, color: 'rgba(255,255,255,0.15)', size: 18, onTap: () => this.fillAll() });
    this.layout(this.game.view);
  }

  onResize(view) {
    this.layout(view);
  }

  layout(view) {
    const margin = 20 + Math.max(view.safe.l, view.safe.r);
    const gap = 10;
    const split = 26; // between the event slots and the solo slot
    const n = this.slots.length;
    const w = Math.min(150, (view.w - margin * 2 - gap * (n - 2) - split) / n);
    const total = w * n + gap * (n - 2) + split;
    this.slots.forEach((s, i) => Object.assign(s, { x: (view.w - total) / 2 + i * (w + gap) + (s.event ? 0 : split - gap), y: 96, w, h: 148 }));
    const cw = Math.min(130, (view.w - margin * 2 - gap * (CHARACTERS.length - 1)) / CHARACTERS.length);
    const ctotal = cw * CHARACTERS.length + gap * (CHARACTERS.length - 1);
    this.cards.forEach((k, i) => Object.assign(k, { x: (view.w - ctotal) / 2 + i * (cw + gap), y: 286, w: cw, h: 122 }));
    const by = view.h - 48 - 12 - view.safe.b;
    const bw = this.allBtn.w + 16 + this.done.w;
    Object.assign(this.allBtn, { x: view.w / 2 - bw / 2, y: by });
    Object.assign(this.done, { x: view.w / 2 - bw / 2 + this.allBtn.w + 16, y: by });
    this.taglineY = (286 + 122 + by) / 2;
  }

  /** Who is in a slot now. */
  who(slot) {
    return slot.event ? lineupAthlete(slot.event) : soloAthlete();
  }

  get slot() {
    return this.slots[this.sel];
  }

  pick(c) {
    if (this.slot.event) setLineupSlot(this.slot.event, c.id);
    else setCharacter(c.id);
  }

  /** Every slot (the five events and solo) gets the selected slot's athlete. */
  fillAll() {
    const c = this.who(this.slot);
    for (const s of this.slots) {
      if (s.event) setLineupSlot(s.event, c.id);
      else setCharacter(c.id);
    }
  }

  update(dt, t) {
    this.age += dt;
    this.phase += dt * 9;
    for (const k of [...this.slots, ...this.cards]) k.pressT = Math.max(0, k.pressT - dt);
    this.done.update(dt);
    this.allBtn.update(dt);
    this.allBtn.label = `${this.who(this.slot).name} in every slot`;
    const inside = (e, k) => e.x >= k.x && e.x <= k.x + k.w && e.y >= k.y && e.y <= k.y + k.h;
    for (const e of this.game.input.consume(t + dt)) {
      if (e.type === 'key' && (e.code === 'Escape' || e.code === 'Enter')) return flow.menu(this.game);
      if (e.type === 'key' && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
        this.sel = (this.sel + (e.code === 'ArrowDown' ? 1 : this.slots.length - 1)) % this.slots.length;
        continue;
      }
      if (e.type === 'key' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
        const i = CHARACTERS.indexOf(this.who(this.slot));
        this.pick(CHARACTERS[(i + (e.code === 'ArrowRight' ? 1 : CHARACTERS.length - 1)) % CHARACTERS.length]);
        continue;
      }
      if (e.type !== 'down' || this.age < 0.25) continue;
      if (this.done.tap(e.x, e.y)) return;
      if (this.allBtn.tap(e.x, e.y)) continue;
      const slot = this.slots.find((k) => inside(e, k));
      if (slot) {
        slot.pressT = 0.12;
        this.sel = this.slots.indexOf(slot);
        continue;
      }
      const card = this.cards.find((k) => inside(e, k));
      if (card) {
        card.pressT = 0.12;
        this.pick(card.c);
      }
    }
  }

  render(ctx, view) {
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, '#0d1830');
    g.addColorStop(1, '#1d3a66');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
    text(ctx, 'YOUR LINEUP', view.w / 2, 40, { size: 38, color: '#ffb400', shadow: true });
    text(ctx, 'Tap a slot, then an athlete. A team tournament uses your lineup; a solo one, your solo athlete.', view.w / 2, 72, {
      size: 15,
      weight: 500,
      color: 'rgba(255,255,255,0.75)',
      maxWidth: view.w - 40,
    });
    this.slots.forEach((s, i) => this.drawSlot(ctx, s, i === this.sel));
    text(ctx, this.slot.event ? `WHO DOES THE ${this.slot.label.toUpperCase()}?` : 'WHO DOES ALL FIVE IN A SOLO TOURNAMENT?', view.w / 2, 268, {
      size: 14,
      weight: 700,
      color: 'rgba(255,255,255,0.6)',
    });
    const chosen = this.who(this.slot);
    for (const k of this.cards) this.drawCard(ctx, k, k.c === chosen);
    text(ctx, chosen.tagline, view.w / 2, this.taglineY, { size: 17, weight: 600, color: '#fff', maxWidth: view.w - 40 });
    this.allBtn.draw(ctx);
    this.done.draw(ctx);
  }

  box(ctx, k, on, radius) {
    const inset = k.pressT > 0 ? 3 : 0;
    roundRect(ctx, k.x + inset, k.y + inset, k.w - inset * 2, k.h - inset * 2, radius);
    ctx.fillStyle = on ? 'rgba(255,180,0,0.18)' : 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.lineWidth = on ? 4 : 1.5;
    ctx.strokeStyle = on ? '#ffb400' : 'rgba(255,255,255,0.18)';
    ctx.stroke();
  }

  drawSlot(ctx, s, on) {
    const c = this.who(s);
    this.box(ctx, s, on, 14);
    const cx = s.x + s.w / 2;
    text(ctx, s.label.toUpperCase(), cx, s.y + 18, { size: 13, weight: 800, color: on ? '#ffd35c' : 'rgba(255,255,255,0.7)', maxWidth: s.w - 12 });
    const ground = s.y + s.h - 34;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(s.x + 12, ground + 1, s.w - 24, 2);
    drawFigure(ctx, cx, ground, 80 * heightOf(c.colors), on ? runPose(this.phase, 0.8) : POSES.stand, c.colors, ground);
    text(ctx, c.name, cx, s.y + s.h - 16, { size: 16, weight: on ? 800 : 600, color: on ? '#ffd35c' : '#fff', maxWidth: s.w - 12 });
  }

  drawCard(ctx, k, on) {
    const { c } = k;
    this.box(ctx, k, on, 12);
    roundRect(ctx, k.x + 8, k.y + 8, k.w - 16, 5, 2.5);
    ctx.fillStyle = c.colors.shirt;
    ctx.fill();
    const ground = k.y + k.h - 30;
    drawFigure(ctx, k.x + k.w / 2, ground, 66 * heightOf(c.colors), POSES.stand, c.colors, ground);
    text(ctx, c.name, k.x + k.w / 2, k.y + k.h - 14, { size: 15, weight: on ? 800 : 600, color: on ? '#ffd35c' : '#fff', maxWidth: k.w - 10 });
  }
}
