import { Button, text, roundRect } from '../../core/ui.js';
import { drawFigure, runPose, POSES } from '../../athletes/stickFigure.js';
import { CHARACTERS, soloAthlete, lineupAthlete, heightOf } from '../../athletes/roster.js';
import { setCharacter, setLineupSlot, getLineup } from '../../core/storage.js';
import { EVENTS } from '../../events/registry.js';

const SHORT = { sprint100: '100m', longjump: 'Long jump', hurdles110: 'Hurdles', polevault: 'Pole vault', javelin: 'Javelin' };
const GOLD = '#ffb400';
const DIM = 'rgba(255,255,255,0.6)';

/**
 * The home screen's left tab: your lineup, Clash Royale deck style. Along the
 * top, a slot per event plus your solo athlete (who does all five in a solo
 * tournament); below, your athletes. Tap an athlete, then Use, then the slot
 * to put them in (the slots wiggle while you pick). The same athlete can fill
 * any number of slots. Remembered on this device.
 */
export class LineupPanel {
  constructor(home) {
    this.home = home;
    this.game = home.game;
  }

  enter() {
    this.age = 0;
    this.phase = 0;
    // A slot per event, then the solo one (`event` null).
    this.slots = [...EVENTS.map((ev) => ({ event: ev.id, label: SHORT[ev.id] ?? ev.name })), { event: null, label: 'Solo' }].map((s) => ({ ...s, x: 0, y: 0, w: 0, h: 0, pressT: 0, flashT: 0 }));
    // Slots never filled follow your solo athlete; fill them in now, so changing
    // the solo athlete from here doesn't change them too.
    for (const ev of EVENTS) if (!getLineup()[ev.id]) setLineupSlot(ev.id, soloAthlete().id);
    this.cards = CHARACTERS.map((c) => ({ c, x: 0, y: 0, w: 0, h: 0, pressT: 0 }));
    this.picked = null; // the athlete card tapped (Use shows under it)
    this.placing = null; // the athlete being put in a slot: pick the slot
    this.cursor = -1; // keyboard: the slot picked (-1: none until an arrow key)
    this.note = null; // { text, t }: what just changed
    this.useBtn = new Button({ label: 'Use', w: 110, h: 40, size: 20, color: '#e89a00', onTap: () => this.use() });
    this.cancelBtn = new Button({ label: 'Cancel', w: 170, h: 46, size: 20, color: '#3a6fd8', onTap: () => this.cancel() });
  }

  /** `bottom`: the top of the tab bar. */
  layout(view, bottom) {
    const margin = 20 + Math.max(view.safe.l, view.safe.r);
    const gap = 10;
    const split = 26; // between the event slots and the solo slot
    const n = this.slots.length;
    const w = Math.min(150, (view.w - margin * 2 - gap * (n - 2) - split) / n);
    const total = w * n + gap * (n - 2) + split;
    this.slots.forEach((s, i) => Object.assign(s, { x: (view.w - total) / 2 + i * (w + gap) + (s.event ? 0 : split - gap), y: 80, w, h: 132 }));
    const cw = Math.min(130, (view.w - margin * 2 - gap * (CHARACTERS.length - 1)) / CHARACTERS.length);
    const ctotal = cw * CHARACTERS.length + gap * (CHARACTERS.length - 1);
    this.cards.forEach((k, i) => Object.assign(k, { x: (view.w - ctotal) / 2 + i * (cw + gap), y: CARDS_Y, w: cw, h: 108 }));
    // Picking a slot: the athlete big in the middle, Cancel under it.
    const bigY = CARDS_Y + 16;
    const bh = Math.min(150, bottom - bigY - 66);
    this.big = { x: view.w / 2 - bh * 0.42, y: bigY, w: bh * 0.84, h: bh };
    Object.assign(this.cancelBtn, { x: view.w / 2 - this.cancelBtn.w / 2, y: Math.min(this.big.y + bh + 12, bottom - this.cancelBtn.h - 8) });
    this.bottom = bottom;
    this.placeUse();
  }

  /** Use sits under the athlete card you tapped. */
  placeUse() {
    const k = this.cards.find((c) => c.c === this.picked);
    if (k) Object.assign(this.useBtn, { x: k.x + k.w / 2 - this.useBtn.w / 2, y: k.y + k.h + 8 });
  }

  /** Coming to this tab: nothing half-done from last time. */
  onShow() {
    this.placing = null;
    this.picked = null;
  }

  /** Esc: a step back (stop picking a slot, then put the athlete card down). True if there was one. */
  back() {
    if (this.placing) this.cancel();
    else if (this.picked) this.picked = null;
    else return false;
    return true;
  }

  /** Who is in a slot now. */
  who(slot) {
    return slot.event ? lineupAthlete(slot.event) : soloAthlete();
  }

  pick(c) {
    this.picked = this.picked === c ? null : c;
    this.placeUse();
  }

  /** Use: now pick the slot for the athlete you tapped. */
  use(keyboard = false) {
    if (!this.picked) return;
    this.placing = this.picked;
    this.picked = null;
    this.cursor = keyboard ? Math.max(0, this.slots.findIndex((s) => this.who(s) !== this.placing)) : -1;
  }

  cancel() {
    this.placing = null;
  }

  /** Puts the athlete you're placing in `slot`. */
  place(slot) {
    const c = this.placing;
    if (slot.event) setLineupSlot(slot.event, c.id);
    else setCharacter(c.id);
    slot.flashT = 0.5;
    this.placing = null;
    this.note = { text: slot.event ? `${c.name} does the ${slot.label.toLowerCase()} now.` : `${c.name} is your solo athlete now.`, t: 3 };
  }

  /** `events`: this tab's taps and keys (the home screen has sorted out swipes). */
  update(dt, events) {
    this.age += dt;
    this.phase += dt * 9;
    for (const k of [...this.slots, ...this.cards]) {
      k.pressT = Math.max(0, k.pressT - dt);
      k.flashT = Math.max(0, (k.flashT ?? 0) - dt);
    }
    if (this.note && (this.note.t -= dt) <= 0) this.note = null;
    this.useBtn.update(dt);
    this.cancelBtn.update(dt);
    const inside = (e, k) => e.x >= k.x && e.x <= k.x + k.w && e.y >= k.y && e.y <= k.y + k.h;
    for (const e of events) {
      if (e.type === 'key') this.key(e.code);
      if (e.type !== 'down') continue;
      const slot = this.slots.find((k) => inside(e, k));
      if (this.placing) {
        // Picking a slot: a slot takes them; anywhere else (or Cancel) calls it off.
        if (slot) {
          slot.pressT = 0.12;
          this.place(slot);
        } else if (!this.cancelBtn.tap(e.x, e.y)) this.cancel();
        continue;
      }
      if (this.picked && this.useBtn.tap(e.x, e.y)) continue;
      const card = this.cards.find((k) => inside(e, k));
      if (card) {
        card.pressT = 0.12;
        this.pick(card.c);
      } else if (slot) {
        // A slot shows who's in it, ready to swap someone else in.
        slot.pressT = 0.12;
        this.picked = null;
        this.placing = null;
        this.pick(this.who(slot));
      } else this.picked = null;
    }
  }

  /** Keyboard: ← / → choose (an athlete, or a slot while placing), Enter: Use / put them there. */
  key(code) {
    const step = code === 'ArrowRight' ? 1 : code === 'ArrowLeft' ? -1 : 0;
    if (this.placing) {
      if (step) this.cursor = this.cursor < 0 ? 0 : (this.cursor + step + this.slots.length) % this.slots.length;
      if ((code === 'Enter' || code === 'Space') && this.cursor >= 0) this.place(this.slots[this.cursor]);
      return;
    }
    if (step) {
      const i = CHARACTERS.indexOf(this.picked);
      this.picked = CHARACTERS[i < 0 ? 0 : (i + step + CHARACTERS.length) % CHARACTERS.length];
      this.placeUse();
    }
    if ((code === 'Enter' || code === 'Space') && this.picked) this.use(true);
  }

  render(ctx, view) {
    text(ctx, 'YOUR LINEUP', view.w / 2, 34, { size: 30, color: GOLD, shadow: true });
    const sub = this.note?.text ?? 'Tap an athlete, then Use, then the slot to put them in. Team tournaments use your lineup; solo ones, your solo athlete.';
    text(ctx, sub, view.w / 2, 62, { size: 14, weight: this.note ? 700 : 500, color: this.note ? '#59cd90' : 'rgba(255,255,255,0.75)', maxWidth: view.w - 40 });
    this.slots.forEach((s, i) => this.drawSlot(ctx, s, i));

    // Below the slots: your athletes, or (picking a slot) the one you're placing.
    const top = 228;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, top, view.w, this.bottom - top);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, top, view.w, 2);
    if (this.placing) {
      text(ctx, `Pick a slot for ${this.placing.name}`, view.w / 2, top + 20, { size: 20, weight: 800, color: '#fff', shadow: true });
      this.drawCard(ctx, { ...this.big, c: this.placing, pressT: 0 }, true, 1.25);
      this.cancelBtn.draw(ctx);
      return;
    }
    text(ctx, 'ATHLETES', this.cards[0].x, top + 14, { size: 13, weight: 800, align: 'left', color: DIM });
    for (const k of this.cards) this.drawCard(ctx, k, k.c === this.picked);
    if (this.picked) {
      this.useBtn.draw(ctx);
      const y = Math.min(this.useBtn.y + this.useBtn.h + 18, this.bottom - 12);
      text(ctx, this.picked.tagline, view.w / 2, y, { size: 15, weight: 600, color: '#fff', maxWidth: view.w - 40 });
    }
  }

  box(ctx, k, on, radius, glow = false) {
    const inset = k.pressT > 0 ? 3 : 0;
    roundRect(ctx, k.x + inset, k.y + inset, k.w - inset * 2, k.h - inset * 2, radius);
    ctx.fillStyle = glow ? 'rgba(89,205,144,0.35)' : on ? 'rgba(255,180,0,0.18)' : 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.lineWidth = on || glow ? 4 : 1.5;
    ctx.strokeStyle = glow ? '#59cd90' : on ? GOLD : 'rgba(255,255,255,0.18)';
    ctx.stroke();
  }

  drawSlot(ctx, s, i) {
    const c = this.who(s);
    const placing = !!this.placing;
    const on = placing && this.cursor === i;
    ctx.save();
    if (placing) {
      // The slots wiggle while you pick one, like Clash Royale's deck.
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(this.age * 22 + i * 1.7) * 0.035);
      ctx.translate(-cx, -cy);
    }
    this.box(ctx, s, on, 14, s.flashT > 0);
    const cx = s.x + s.w / 2;
    text(ctx, s.label.toUpperCase(), cx, s.y + 18, { size: 13, weight: 800, color: on ? '#ffd35c' : 'rgba(255,255,255,0.7)', maxWidth: s.w - 12 });
    const ground = s.y + s.h - 32;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(s.x + 12, ground + 1, s.w - 24, 2);
    const moving = s.flashT > 0 || on;
    drawFigure(ctx, cx, ground, 72 * heightOf(c.colors), moving ? runPose(this.phase, 0.8) : POSES.stand, c.colors, ground);
    text(ctx, c.name, cx, s.y + s.h - 15, { size: 16, weight: 700, color: on ? '#ffd35c' : '#fff', maxWidth: s.w - 12 });
    ctx.restore();
  }

  /** An athlete card; `scale`: bigger figure (the one being placed). */
  drawCard(ctx, k, on, scale = 1) {
    const { c } = k;
    const lift = on && scale === 1 ? -8 : 0;
    const card = { ...k, y: k.y + lift };
    this.box(ctx, card, on, 12);
    roundRect(ctx, card.x + 8, card.y + 8, card.w - 16, 5, 2.5);
    ctx.fillStyle = c.colors.shirt;
    ctx.fill();
    const ground = card.y + card.h - 28 * scale;
    drawFigure(ctx, card.x + card.w / 2, ground, 60 * scale * heightOf(c.colors), on ? runPose(this.phase, 0.6) : POSES.stand, c.colors, ground);
    text(ctx, c.name, card.x + card.w / 2, card.y + card.h - 13 * scale, { size: 15 * Math.min(scale, 1.2), weight: on ? 800 : 600, color: on ? '#ffd35c' : '#fff', maxWidth: card.w - 10 });
  }
}

const CARDS_Y = 252; // top of the row of athlete cards
