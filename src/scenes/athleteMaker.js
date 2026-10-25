import { Button, text, slab, chamfer, titlePlate, nameTag, PAL } from '../core/ui.js';
import { drawIcon } from '../core/icons.js';
import { pinebrook } from '../render/posterScenery.js';
import { drawFigure, runPose } from '../athletes/stickFigure.js';
import { relaxed, emote } from '../brawl/poses.js';
import { LOOK, parse, encode, randomLook, cleanAthleteName, lookColors, DEFAULT_NAME } from '../athletes/custom.js';
import { SLOTS, SLOT_NAMES, slotItems, itemAt, noGear, owns } from '../economy/items.js';
import { myLevel } from '../online/xp.js';
import { myInventory, openShop } from '../online/shop.js';
import { drawWearing, RARITY_COLOR } from './gearPreview.js';
import { CONFIG } from '../config.js';
import { getCustom, setCustom, setCharacter, getPlayerName } from '../core/storage.js';
import { flow } from '../flow.js';

/** The rows of picks, top to bottom: which LOOK list, its label, and how its tiles look. */
const ROWS = [
  { f: 'skin', label: 'SKIN', tile: 'swatch' },
  { f: 'style', label: 'HAIR', tile: 'head' },
  { f: 'hair', label: 'HAIR COLOUR', tile: 'swatch' },
  { f: 'shirt', label: 'SHIRT', tile: 'swatch' },
  { f: 'shorts', label: 'SHORTS', tile: 'swatch' },
  { f: 'height', label: 'HEIGHT', tile: 'body' },
  { f: 'build', label: 'BUILD', tile: 'body' },
];
/** The Gear tab's rows: a slot each (economy/items.js), its tiles close up on where it's worn. */
const GEAR_ROWS = SLOTS.map((slot) => ({ slot, label: SLOT_NAMES[slot].toUpperCase() }));
const REACTIONS = ['flex', 'dance', 'dab', 'taunt', 'laugh'];
/** The preview's warm-up, round and round: [what, seconds]. */
const WARMUP = [['stand', 2.2], ['run', 2.4], ['stand', 1.4], ['emote', 2.2]];

/**
 * The Athlete Maker, Mii style: make an athlete of your own. Your athlete
 * warms up on the left (and reacts to each change); on the right a row of
 * picks for each part of their look (custom.js LOOK); Random under them.
 * No name of their own: your athlete goes by your username. The Gear tab: a row per gear slot (economy/items.js), each item
 * unlocked by your level (a lock and the level on the ones you haven't
 * reached). Save makes them the athlete you play as (Athlete tab), Cancel
 * leaves things as they were. One athlete of your own: making a new one
 * changes it.
 */
export class AthleteMakerScene {
  /** `code`: the athlete to change (custom.js), or null for a new one (from your saved one, else at random). */
  constructor(code = getCustom()) {
    const p = parse(code);
    this.look = p ? { ...p.look } : randomLook();
    this.gear = p ? { ...p.gear } : noGear();
    this.isNew = !p;
    this.tab = 'look';
  }

  enter() {
    this.t = 0;
    this.react = null; // { id, t }: the preview reacting to a change
    this.flashT = 0;
    this.cancelBtn = new Button({ label: 'Cancel', icon: 'back', look: 'chip', w: 128, h: 46, onTap: () => this.cancel() });
    this.saveBtn = new Button({ label: 'Save', icon: 'check', w: 150, h: 50, color: PAL.liveGreen, lip: PAL.liveShade, onTap: () => this.save() });
    this.randomBtn = new Button({ label: 'Random', icon: 'dice', look: 'chip', h: 46, onTap: () => this.randomize() });
    this.lookTab = new Button({ label: 'Look', icon: 'athlete', look: 'chip', h: 44, onTap: () => this.showTab('look') });
    this.gearTab = new Button({ label: 'Gear', icon: 'star', look: 'chip', h: 44, onTap: () => this.showTab('gear') });
    this.level = myLevel()?.level ?? 1; // gear unlocks by level (a guest: level 1)
    this.inventory = myInventory(); // and what you've bought in the Shop (as last told; asked again now)
    openShop()
      .then((a) => {
        if (!a || this.game.scene !== this) return;
        this.inventory = a.inventory ?? [];
        this.layout(this.game.view);
      })
      .catch(() => {});
    this.note = null; // { text, t }: a line under the picks (an item's name, or why it's locked)
    this.layout(this.game.view);
  }

  get buttons() {
    return [this.cancelBtn, this.saveBtn, this.randomBtn, this.lookTab, this.gearTab];
  }

  showTab(tab) {
    this.tab = tab;
    this.note = null;
    this.layout(this.game.view);
  }

  /** What you have, for owns(): your level and the gear you've bought. */
  get you() {
    return { level: this.level, inventory: this.inventory };
  }

  /** The athlete as it stands, shaped like a roster athlete. */
  get colors() {
    return lookColors(this.look, this.gear);
  }

  onResize(view) {
    this.layout(view);
  }

  layout(view) {
    const s = view.safe;
    const margin = 16 + Math.max(s.l, s.r);
    const top = 12 + s.t;
    Object.assign(this.cancelBtn, { x: margin, y: top });
    Object.assign(this.saveBtn, { x: view.w - margin - this.saveBtn.w, y: top - 2 });
    const bottom = view.h - 12 - s.b;
    const bodyTop = 80 + s.t;
    // Left: the stage, Random under it.
    const sw = Math.max(230, Math.min(380, view.w * 0.32));
    this.stage = { x: margin, y: bodyTop, w: sw, h: bottom - 56 - bodyTop };
    Object.assign(this.randomBtn, { x: margin, y: bottom - 46, w: sw });
    // Right: the Look and Gear tabs, then a row of tiles per pick (Gear: a line for notes at the foot).
    const rx = margin + sw + 22;
    const rw = view.w - margin - rx;
    const tabW = Math.min(150, (rw - 10) / 2);
    Object.assign(this.lookTab, { x: rx, y: bodyTop - 4, w: tabW });
    Object.assign(this.gearTab, { x: rx + tabW + 10, y: bodyTop - 4, w: tabW });
    for (const [b, on] of [[this.lookTab, this.tab === 'look'], [this.gearTab, this.tab === 'gear']]) {
      b.color = on ? PAL.gold : PAL.ink2;
      b.lip = on ? PAL.goldShade : PAL.inkShade;
    }
    const rowsTop = bodyTop + 50;
    const labelW = Math.min(130, rw * 0.2);
    const gap = 6;
    if (this.tab === 'look') {
      const rowH = (bottom - rowsTop) / ROWS.length;
      const most = Math.max(...ROWS.map((r) => LOOK[r.f].length));
      const t = Math.floor(Math.min(rowH - 10, (rw - labelW) / most - gap));
      this.rows = ROWS.map((r, i) => {
        const y = rowsTop + i * rowH;
        return { ...r, y, h: rowH, labelX: rx, tiles: LOOK[r.f].map((_, k) => ({ x: rx + labelW + k * (t + gap), y: y + (rowH - t) / 2, s: t })) };
      });
    } else {
      const rowH = (bottom - 28 - rowsTop) / GEAR_ROWS.length;
      const most = Math.max(...GEAR_ROWS.map((r) => slotItems(r.slot).length + 1));
      const t = Math.floor(Math.min(rowH - 8, (rw - labelW) / most - gap));
      this.rows = GEAR_ROWS.map((r, i) => {
        const y = rowsTop + i * rowH;
        // None first, then the starter set (locked until its level) and what you've bought; the rest is in the Shop.
        const items = [null, ...slotItems(r.slot).filter((i) => i.price == null || this.inventory.includes(i.id))];
        return { ...r, y, h: rowH, labelX: rx, items, tiles: items.map((_, k) => ({ x: rx + labelW + k * (t + gap), y: y + (rowH - t) / 2, s: t })) };
      });
      this.noteY = bottom - 12;
    }
    this.noteX = rx + rw / 2;
  }

  update(dt, t) {
    this.t += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    if (this.note && (this.note.t -= dt) <= 0) this.note = null;
    if (this.react && (this.react.t += dt) > 1.3) this.react = null;
    for (const e of this.game.input.consume(t + dt)) {
      if (e.type === 'key') {
        if (e.code === 'Escape') this.cancel();
        else if (e.code === 'Enter') this.save();
        else if (e.code === 'KeyR') this.randomize();
        continue;
      }
      if (e.type !== 'down') continue;
      if (this.buttons.some((b) => b.tap(e.x, e.y))) {
        if (this.game.scene !== this) return;
        continue;
      }
      for (const row of this.rows) {
        const k = row.tiles.findIndex((tl) => e.x >= tl.x - 3 && e.x <= tl.x + tl.s + 3 && e.y >= row.y && e.y <= row.y + row.h);
        if (k >= 0 && row.slot) this.wear(row.slot, row.items[k]);
        else if (k >= 0) this.set(row.f, k);
      }
    }
    this.buttons.forEach((b) => b.update(dt));
  }

  set(f, k) {
    if (this.look[f] === k) return;
    this.look[f] = k;
    this.changed();
  }

  /** Puts on `item` in `slot` (null: nothing there), if it's unlocked; else says what unlocks it. */
  wear(slot, item) {
    if (!owns(item, this.you)) {
      this.note = { text: `${item.name}: unlocks at level ${item.level} (you're level ${this.level})`, t: 3, warn: true };
      return;
    }
    const n = item?.n ?? 0;
    this.note = { text: item ? item.name : `No ${SLOT_NAMES[slot].toLowerCase()}`, t: 2.5 };
    if (this.gear[slot] === n) return;
    this.gear[slot] = n;
    this.changed();
  }

  /** Something changed: the preview reacts. */
  changed() {
    this.react = { id: REACTIONS[Math.floor(Math.random() * REACTIONS.length)], t: 0 };
    this.flashT = 0.25;
  }

  randomize() {
    this.look = randomLook();
    this.changed();
  }

  save() {
    // Only gear you have goes on (a level-locked item can't be picked, but an old code might carry one).
    const gear = Object.fromEntries(SLOTS.map((slot) => [slot, owns(itemAt(slot, this.gear[slot]), this.you) ? this.gear[slot] : 0]));
    // The code still carries a name (older builds show it): your username, as far as it fits.
    const code = encode(this.look, cleanAthleteName(getPlayerName()) || DEFAULT_NAME, gear);
    setCustom(code);
    setCharacter(code);
    flow.menu(this.game, 'athlete');
  }

  cancel() {
    flow.menu(this.game, 'athlete');
  }

  /** The preview's pose now: reacting to a change, else warming up. */
  pose() {
    if (this.react) return emote(this.react.id, this.react.t);
    const loop = WARMUP.reduce((s, [, d]) => s + d, 0);
    let u = this.t % loop;
    for (const [what, d] of WARMUP) {
      if (u < d) {
        if (what === 'run') return runPose(this.t * 11, 0.85);
        if (what === 'emote') return emote(REACTIONS[Math.floor(this.t / loop) % REACTIONS.length], u);
        return relaxed(0, 0, this.t);
      }
      u -= d;
    }
    return relaxed(0, 0, this.t);
  }

  render(ctx, view) {
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(0, 0, view.w, view.h);
    titlePlate(ctx, view, 'ATHLETE MAKER', '', { y: 34 + view.safe.t, face: PAL.gold, ink: PAL.ink, maxW: view.w - 340 });
    const colors = this.colors;

    // The stage: Pinebrook Park, your athlete warming up on the track, their name and height.
    const st = this.stage;
    slab(ctx, st.x, st.y, st.w, st.h, { face: this.flashT > 0 ? '#FBF3DF' : PAL.cream, lip: PAL.creamShade, lipH: 6, c: 8 });
    ctx.save();
    chamfer(ctx, st.x, st.y, st.w, st.h - 6, 8);
    ctx.clip();
    pinebrook(ctx, st.x - 40, st.y - 10, st.w + 80, st.h + 4, { trackH: Math.min(90, st.h * 0.28), clouds: [[0.3, 0.16, 0.06], [0.8, 0.24, 0.05]] });
    const ground = st.y + st.h - 6 - Math.min(90, st.h * 0.28) * 0.45;
    const H = Math.min(st.h * 0.58, 220) * colors.height;
    const hop = this.react ? Math.sin(Math.min(1, this.react.t / 0.3) * Math.PI) * 14 : 0;
    drawFigure(ctx, st.x + st.w / 2, ground - hop, H, this.pose(), colors, ground);
    ctx.restore();
    nameTag(ctx, getPlayerName(), st.x + st.w / 2, st.y + 26, 22);
    text(ctx, `${(CONFIG.figure.height * colors.height).toFixed(2)} m`, st.x + st.w - 14, st.y + st.h - 22, { size: 16, font: 'body', weight: 700, align: 'right', color: PAL.cream });

    // The picks.
    for (const row of this.rows) {
      const cy = row.y + row.h / 2;
      text(ctx, row.label, row.labelX, cy + 1, { size: 19, font: 'display', track: 1, align: 'left', color: PAL.cream, maxWidth: row.tiles[0].x - row.labelX - 8 });
      if (row.slot) row.tiles.forEach((tl, k) => this.drawGearTile(ctx, row, tl, row.items[k]));
      else row.tiles.forEach((tl, k) => this.drawTile(ctx, row, tl, k, k === this.look[row.f], colors));
    }
    if (this.tab === 'gear') {
      const note = this.note ?? { text: `Level ${this.level}: more gear unlocks as you level up, and more is in the Shop` };
      text(ctx, note.text, this.noteX, this.noteY, { size: 16, font: 'body', weight: 700, color: note.warn ? '#ffb35c' : 'rgba(245,234,208,0.8)', maxWidth: view.w - this.noteX + (view.w - this.noteX) });
    }

    this.buttons.forEach((b) => b.draw(ctx));
  }

  /**
   * One gear pick: your athlete close up on where it's worn (feet, head or
   * torso), wearing it; 'none' first. Ringed in gold if it's on, a corner in its
   * rarity's colour, and locked (dimmed, a lock and its level) until you reach it.
   */
  drawGearTile(ctx, row, tl, item) {
    const { x, y, s } = tl;
    const on = (item?.n ?? 0) === this.gear[row.slot];
    const locked = !owns(item, this.you);
    if (on) {
      ctx.fillStyle = PAL.gold;
      chamfer(ctx, x - 4, y - 4, s + 8, s + 8, 6);
      ctx.fill();
    }
    ctx.fillStyle = on ? PAL.cream : PAL.creamShade;
    chamfer(ctx, x, y, s, s, 5);
    ctx.fill();
    ctx.save();
    chamfer(ctx, x, y, s, s, 5);
    ctx.clip();
    drawWearing(ctx, x, y, s, this.look, { ...this.gear, [row.slot]: item?.n ?? 0 }, row.slot);
    if (!item) {
      // Nothing: a slash across.
      ctx.strokeStyle = 'rgba(38,34,79,0.45)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + s * 0.2, y + s * 0.8);
      ctx.lineTo(x + s * 0.8, y + s * 0.2);
      ctx.stroke();
    }
    const tint = item && RARITY_COLOR[item.rarity];
    if (tint) {
      ctx.fillStyle = tint;
      ctx.beginPath();
      ctx.moveTo(x + s, y);
      ctx.lineTo(x + s, y + s * 0.3);
      ctx.lineTo(x + s * 0.7, y);
      ctx.closePath();
      ctx.fill();
    }
    if (locked) {
      ctx.fillStyle = 'rgba(23,20,58,0.62)';
      ctx.fillRect(x, y, s, s);
      drawIcon(ctx, 'lock', x + s / 2, y + s * 0.4, s * 0.36, PAL.cream);
      text(ctx, `LV ${item.level}`, x + s / 2, y + s * 0.78, { size: Math.max(11, s * 0.22), font: 'display', track: 1, color: PAL.cream });
    }
    ctx.restore();
  }

  /** One pick: a colour swatch, a head with that hairstyle, or a figure at that height or build. Yours ringed in gold. */
  drawTile(ctx, row, tl, k, on, colors) {
    const { x, y, s } = tl;
    if (on) {
      ctx.fillStyle = PAL.gold;
      chamfer(ctx, x - 4, y - 4, s + 8, s + 8, 6);
      ctx.fill();
    }
    if (row.tile === 'swatch') {
      ctx.fillStyle = on ? PAL.ink : PAL.inkShade;
      chamfer(ctx, x, y, s, s, 5);
      ctx.fill();
      ctx.fillStyle = LOOK[row.f][k];
      chamfer(ctx, x + 3, y + 3, s - 6, s - 6, 4);
      ctx.fill();
      return;
    }
    ctx.fillStyle = on ? PAL.cream : PAL.creamShade;
    chamfer(ctx, x, y, s, s, 5);
    ctx.fill();
    ctx.save();
    chamfer(ctx, x, y, s, s, 5);
    ctx.clip();
    if (row.tile === 'head') {
      // The head, close up: its centre is 0.93 figure heights over the feet standing (stickFigure.js), its radius 0.085.
      const H = s * 3.2;
      const feet = y + s * 0.58 + 0.93 * H;
      drawFigure(ctx, x + s * 0.56, feet, H, relaxed(0, 0, 0), { ...colors, style: LOOK.style[k], height: 1, girth: 1 }, feet);
    } else {
      const c = row.f === 'height' ? { ...colors, height: LOOK.height[k] } : { ...colors, girth: LOOK.build[k], height: 1 };
      const H = s * 0.86 * (row.f === 'height' ? LOOK.height[k] / LOOK.height[LOOK.height.length - 1] : 1);
      drawFigure(ctx, x + s / 2, y + s - 3, H, relaxed(0, 0, 0), c, y + s - 3);
    }
    ctx.restore();
  }
}
