import { CONFIG } from '../../config.js';
import { Button, text, roundRect } from '../../core/ui.js';
import { drawFigure, runPose, POSES } from '../../athletes/stickFigure.js';
import { CHARACTERS, soloAthlete, lineupAthlete, lineupSlotEmpty, heightOf } from '../../athletes/roster.js';
import { setCharacter, setLineupSlot, getLineup } from '../../core/storage.js';
import { EVENTS } from '../../events/registry.js';

const SHORT = { sprint100: '100m', longjump: 'Long jump', hurdles110: 'Hurdles', polevault: 'Pole vault', javelin: 'Javelin' };
const GOLD = '#ffb400';
const DIM = 'rgba(255,255,255,0.6)';

/**
 * The home screen's left tab: your lineup, Clash Royale deck style. Along the
 * top, a slot per event plus your solo athlete (who does all five in a solo
 * tournament); below, your athletes.
 * - Tap an athlete: Info, or Use, then the slot to put them in (the slots
 *   wiggle while you pick). The same athlete can fill any number of slots.
 * - Tap a slot: Info, or Remove to empty it. An empty event slot is done by
 *   your solo athlete in single events, but a team tournament can't start
 *   until it's filled (playPanel.js); the solo slot can't be emptied.
 * Remembered on this device.
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
    // Slots never set follow your solo athlete; fill them in now, so changing
    // the solo athlete from here doesn't change them too. (An emptied slot stays empty.)
    for (const ev of EVENTS) if (getLineup()[ev.id] === undefined) setLineupSlot(ev.id, soloAthlete().id);
    this.cards = CHARACTERS.map((c) => ({ c, x: 0, y: 0, w: 0, h: 0, pressT: 0 }));
    this.picked = null; // the athlete card tapped (Info and Use show under it)
    this.slotMenu = null; // the slot tapped (Info and Remove show under it)
    this.placing = null; // the athlete being put in a slot: pick the slot
    this.info = null; // the athlete whose Info is open
    this.cursor = -1; // keyboard: the slot picked (-1: none until an arrow key)
    this.note = null; // { text, t, plain }: what just changed
    this.useBtn = new Button({ label: 'Use', w: 64, h: 38, size: 18, color: '#e89a00', onTap: () => this.use() });
    this.cardInfoBtn = new Button({ label: 'Info', w: 58, h: 38, size: 18, color: '#3a6fd8', onTap: () => this.openInfo(this.picked) });
    this.slotInfoBtn = new Button({ label: 'Info', w: 100, h: 36, size: 18, color: '#3a6fd8', onTap: () => this.openInfo(this.slotMenu && this.who(this.slotMenu)) });
    this.removeBtn = new Button({ label: 'Remove', w: 100, h: 36, size: 18, color: '#d64040', onTap: () => this.remove(this.slotMenu) });
    this.cancelBtn = new Button({ label: 'Cancel', w: 170, h: 46, size: 20, color: '#3a6fd8', onTap: () => this.cancel() });
    this.closeBtn = new Button({ label: 'Close', w: 140, h: 44, size: 20, color: 'rgba(255,255,255,0.18)', onTap: () => (this.info = null) });
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
    // Info: a card in the middle, Close at its foot.
    const iw = Math.min(540, view.w - 40);
    const ih = Math.min(290, bottom - 40);
    this.infoBox = { x: view.w / 2 - iw / 2, y: Math.max(16, (bottom - ih) / 2), w: iw, h: ih };
    Object.assign(this.closeBtn, { x: view.w / 2 - this.closeBtn.w / 2, y: this.infoBox.y + ih - this.closeBtn.h - 14 });
    this.bottom = bottom;
    this.placeMenus();
  }

  /** Info and Use sit under the athlete card you tapped; Info and Remove under the slot. */
  placeMenus() {
    const k = this.cards.find((c) => c.c === this.picked);
    if (k) {
      const w = this.cardInfoBtn.w + 6 + this.useBtn.w;
      Object.assign(this.cardInfoBtn, { x: k.x + k.w / 2 - w / 2, y: k.y + k.h + 6 });
      Object.assign(this.useBtn, { x: this.cardInfoBtn.x + this.cardInfoBtn.w + 6, y: k.y + k.h + 6 });
    }
    const s = this.slotMenu;
    if (s) {
      const bw = Math.max(s.w - 8, 90);
      this.slotInfoBtn.w = this.removeBtn.w = bw;
      Object.assign(this.slotInfoBtn, { x: s.x + s.w / 2 - bw / 2, y: s.y + s.h + 6 });
      Object.assign(this.removeBtn, { x: this.slotInfoBtn.x, y: this.slotInfoBtn.y + this.slotInfoBtn.h + 6 });
    }
  }

  /** Coming to this tab: nothing half-done from last time. */
  onShow() {
    this.placing = this.picked = this.slotMenu = this.info = null;
  }

  /** Esc: a step back (close Info, stop picking a slot, put a card or slot down). True if there was one. */
  back() {
    if (this.info) this.info = null;
    else if (this.placing) this.cancel();
    else if (this.slotMenu) this.slotMenu = null;
    else if (this.picked) this.picked = null;
    else return false;
    return true;
  }

  /** Who is in a slot now (for an empty event slot: your solo athlete, who fills in). */
  who(slot) {
    return slot.event ? lineupAthlete(slot.event) : soloAthlete();
  }

  empty(slot) {
    return !!slot.event && lineupSlotEmpty(slot.event);
  }

  pick(c) {
    this.slotMenu = null;
    this.picked = this.picked === c ? null : c;
    this.placeMenus();
  }

  /** A slot tapped: its Info and Remove (an empty one says how to fill it). */
  openSlot(slot) {
    this.picked = null;
    if (this.empty(slot)) {
      this.slotMenu = null;
      this.note = { text: `The ${slot.label.toLowerCase()} slot is empty: tap an athlete, then Use, to fill it.`, t: 3, plain: true };
      return;
    }
    this.slotMenu = this.slotMenu === slot ? null : slot;
    this.placeMenus();
  }

  openInfo(c) {
    if (c) this.info = c;
  }

  /** Use: now pick the slot for the athlete you tapped. */
  use(keyboard = false) {
    if (!this.picked) return;
    this.placing = this.picked;
    this.picked = null;
    this.cursor = keyboard ? Math.max(0, this.slots.findIndex((s) => this.empty(s) || this.who(s) !== this.placing)) : -1;
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

  /** Remove: empties an event slot (your solo athlete fills in for single events; no team tournament until it's filled). */
  remove(slot) {
    if (!slot?.event) return;
    const was = this.who(slot);
    const solo = soloAthlete();
    setLineupSlot(slot.event, null);
    this.slotMenu = null;
    const out = was === solo ? `The ${slot.label.toLowerCase()} slot is empty.` : `${was.name} is out of the ${slot.label.toLowerCase()}.`;
    this.note = { text: `${out} ${solo.name} fills in for single events; a Team tournament needs a full lineup.`, t: 4, plain: true };
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
    for (const b of [this.useBtn, this.cardInfoBtn, this.slotInfoBtn, this.removeBtn, this.cancelBtn, this.closeBtn]) b.update(dt);
    const inside = (e, k) => e.x >= k.x && e.x <= k.x + k.w && e.y >= k.y && e.y <= k.y + k.h;
    for (const e of events) {
      if (e.type === 'key') this.key(e.code);
      if (e.type !== 'down') continue;
      if (this.info) {
        // Info is open: any tap closes it.
        if (!this.closeBtn.tap(e.x, e.y)) this.info = null;
        continue;
      }
      const slot = this.slots.find((k) => inside(e, k));
      if (this.placing) {
        // Picking a slot: a slot takes them; anywhere else (or Cancel) calls it off.
        if (slot) {
          slot.pressT = 0.12;
          this.place(slot);
        } else if (!this.cancelBtn.tap(e.x, e.y)) this.cancel();
        continue;
      }
      if (this.slotMenu && (this.slotInfoBtn.tap(e.x, e.y) || (this.slotMenu.event && this.removeBtn.tap(e.x, e.y)))) continue;
      if (this.picked && (this.cardInfoBtn.tap(e.x, e.y) || this.useBtn.tap(e.x, e.y))) continue;
      const card = this.cards.find((k) => inside(e, k));
      if (card) {
        card.pressT = 0.12;
        this.pick(card.c);
      } else if (slot) {
        slot.pressT = 0.12;
        this.openSlot(slot);
      } else this.picked = this.slotMenu = null;
    }
  }

  /** Keyboard: ← / → choose (an athlete, or a slot while placing), Enter: Use / put them there. */
  key(code) {
    if (this.info) {
      if (code === 'Enter' || code === 'Space') this.info = null;
      return;
    }
    const step = code === 'ArrowRight' ? 1 : code === 'ArrowLeft' ? -1 : 0;
    if (this.placing) {
      if (step) this.cursor = this.cursor < 0 ? 0 : (this.cursor + step + this.slots.length) % this.slots.length;
      if ((code === 'Enter' || code === 'Space') && this.cursor >= 0) this.place(this.slots[this.cursor]);
      return;
    }
    if (step) {
      const i = CHARACTERS.indexOf(this.picked);
      this.slotMenu = null;
      this.picked = CHARACTERS[i < 0 ? 0 : (i + step + CHARACTERS.length) % CHARACTERS.length];
      this.placeMenus();
    }
    if ((code === 'Enter' || code === 'Space') && this.picked) this.use(true);
  }

  render(ctx, view) {
    text(ctx, 'YOUR LINEUP', view.w / 2, 34, { size: 30, color: GOLD, shadow: true });
    const sub = this.note?.text ?? 'Tap an athlete, then Use, then the slot to put them in. Tap a slot for Info or Remove.';
    text(ctx, sub, view.w / 2, 62, { size: 14, weight: this.note ? 700 : 500, color: this.note ? (this.note.plain ? '#ffd35c' : '#59cd90') : 'rgba(255,255,255,0.75)', maxWidth: view.w - 40 });

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
    } else {
      text(ctx, 'ATHLETES', this.cards[0].x, top + 14, { size: 13, weight: 800, align: 'left', color: DIM });
      for (const k of this.cards) this.drawCard(ctx, k, k.c === this.picked);
      if (this.picked) {
        this.cardInfoBtn.draw(ctx);
        this.useBtn.draw(ctx);
        const y = Math.min(this.useBtn.y + this.useBtn.h + 18, this.bottom - 12);
        text(ctx, this.picked.tagline, view.w / 2, y, { size: 15, weight: 600, color: '#fff', maxWidth: view.w - 40 });
      }
    }

    // The slots, then the tapped slot's menu over everything below it.
    this.slots.forEach((s, i) => this.drawSlot(ctx, s, i));
    if (this.slotMenu && !this.placing) {
      const s = this.slotMenu;
      const last = s.event ? this.removeBtn : this.slotInfoBtn;
      roundRect(ctx, this.slotInfoBtn.x - 6, s.y - 6, this.slotInfoBtn.w + 12, last.y + last.h - s.y + 12, 16);
      ctx.fillStyle = '#2a5292';
      ctx.fill();
      this.drawSlot(ctx, s, this.slots.indexOf(s), true);
      this.slotInfoBtn.draw(ctx);
      if (s.event) this.removeBtn.draw(ctx);
    }
    if (this.info) this.renderInfo(ctx, view, this.info);
  }

  /** Info: the athlete running, their tagline, height and where they are in your lineup. */
  renderInfo(ctx, view, c) {
    ctx.fillStyle = 'rgba(6,12,28,0.75)';
    ctx.fillRect(0, 0, view.w, this.bottom);
    const b = this.infoBox;
    roundRect(ctx, b.x, b.y, b.w, b.h, 18);
    ctx.fillStyle = '#1d3a66';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = GOLD;
    ctx.stroke();
    const fx = b.x + Math.min(110, b.w * 0.22);
    const ground = this.closeBtn.y - 16;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(fx, ground + 2, 34, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    drawFigure(ctx, fx, ground, Math.min(160, ground - b.y - 24) * heightOf(c.colors), runPose(this.phase * 0.8, 0.9), c.colors, ground);
    const tx = fx + Math.min(100, b.w * 0.2);
    const tw = b.x + b.w - 20 - tx;
    text(ctx, c.name, tx, b.y + 44, { size: 32, align: 'left', color: GOLD, shadow: true, maxWidth: tw });
    text(ctx, c.tagline, tx, b.y + 82, { size: 16, weight: 600, align: 'left', color: '#fff', maxWidth: tw });
    text(ctx, `Height ${(CONFIG.figure.height * heightOf(c.colors)).toFixed(2)} m`, tx, b.y + 112, { size: 15, weight: 600, align: 'left', color: DIM, maxWidth: tw });
    const where = this.slots.filter((s) => (s.event ? getLineup()[s.event] === c.id : soloAthlete() === c)).map((s) => s.label);
    text(ctx, 'IN YOUR LINEUP', tx, b.y + 140, { size: 12, weight: 800, align: 'left', color: DIM });
    text(ctx, where.length ? where.join(' · ') : 'Not yet', tx, b.y + 162, { size: 16, weight: 700, align: 'left', color: where.length ? '#59cd90' : DIM, maxWidth: tw });
    text(ctx, 'Everyone runs on the same physics: pick who you like the look of.', tx, b.y + 192, { size: 14, weight: 500, align: 'left', color: DIM, maxWidth: tw });
    this.closeBtn.draw(ctx);
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

  /** A slot; `open`: the one whose menu is showing (drawn lit, over the rest). */
  drawSlot(ctx, s, i, open = false) {
    const placing = !!this.placing;
    const on = open || (placing && this.cursor === i);
    const cx = s.x + s.w / 2;
    ctx.save();
    if (placing) {
      // The slots wiggle while you pick one, like Clash Royale's deck.
      const cy = s.y + s.h / 2;
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(this.age * 22 + i * 1.7) * 0.035);
      ctx.translate(-cx, -cy);
    }
    if (this.empty(s)) {
      // Empty: a dashed outline, and who fills in.
      const inset = s.pressT > 0 ? 3 : 0;
      roundRect(ctx, s.x + inset, s.y + inset, s.w - inset * 2, s.h - inset * 2, 14);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fill();
      ctx.setLineDash([7, 6]);
      ctx.lineWidth = on ? 3 : 2;
      ctx.strokeStyle = on ? GOLD : 'rgba(255,255,255,0.35)';
      ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, s.label.toUpperCase(), cx, s.y + 18, { size: 13, weight: 800, color: 'rgba(255,255,255,0.7)', maxWidth: s.w - 12 });
      text(ctx, '+', cx, s.y + s.h / 2 - 4, { size: 44, weight: 300, color: 'rgba(255,255,255,0.35)' });
      text(ctx, 'Empty', cx, s.y + s.h - 34, { size: 15, weight: 700, color: 'rgba(255,255,255,0.75)' });
      text(ctx, `${soloAthlete().name} fills in`, cx, s.y + s.h - 15, { size: 12, weight: 600, color: DIM, maxWidth: s.w - 10 });
      ctx.restore();
      return;
    }
    const c = this.who(s);
    this.box(ctx, s, on, 14, s.flashT > 0);
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
