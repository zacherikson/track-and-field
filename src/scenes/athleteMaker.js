import { Button, text, slab, chamfer, titlePlate, nameTag, PAL } from '../core/ui.js';
import { pinebrook } from '../render/posterScenery.js';
import { drawFigure, runPose } from '../athletes/stickFigure.js';
import { relaxed, emote } from '../brawl/poses.js';
import { LOOK, FIELDS, parse, encode, randomLook, cleanAthleteName, DEFAULT_NAME, NAME_MAX } from '../athletes/custom.js';
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
const REACTIONS = ['flex', 'dance', 'dab', 'taunt', 'laugh'];
/** The preview's warm-up, round and round: [what, seconds]. */
const WARMUP = [['stand', 2.2], ['run', 2.4], ['stand', 1.4], ['emote', 2.2]];

/**
 * The Athlete Maker, Mii style: make an athlete of your own. Your athlete
 * warms up on the left (and reacts to each change); on the right a row of
 * picks for each part of their look (custom.js LOOK); Rename and Random
 * under them. Save makes them the athlete you play as (Athlete tab), Cancel
 * leaves things as they were. One athlete of your own: making a new one
 * changes it.
 */
export class AthleteMakerScene {
  /** `code`: the athlete to change (custom.js), or null for a new one (from your saved one, else at random). */
  constructor(code = getCustom()) {
    const p = parse(code);
    this.look = p ? { ...p.look } : randomLook();
    this.name = p ? p.name : cleanAthleteName(getPlayerName()) || DEFAULT_NAME;
    this.isNew = !p;
  }

  enter() {
    this.t = 0;
    this.react = null; // { id, t }: the preview reacting to a change
    this.flashT = 0;
    this.cancelBtn = new Button({ label: 'Cancel', icon: 'back', look: 'chip', w: 128, h: 46, onTap: () => this.cancel() });
    this.saveBtn = new Button({ label: 'Save', icon: 'check', w: 150, h: 50, color: PAL.liveGreen, lip: PAL.liveShade, onTap: () => this.save() });
    this.renameBtn = new Button({ label: 'Rename', icon: 'edit', look: 'chip', h: 46, onTap: () => this.rename() });
    this.randomBtn = new Button({ label: 'Random', icon: 'dice', look: 'chip', h: 46, onTap: () => this.randomize() });
    this.layout(this.game.view);
  }

  get buttons() {
    return [this.cancelBtn, this.saveBtn, this.renameBtn, this.randomBtn];
  }

  /** The athlete as it stands, shaped like a roster athlete. */
  get colors() {
    const l = this.look;
    return { skin: LOOK.skin[l.skin], style: LOOK.style[l.style], hair: LOOK.hair[l.hair], shirt: LOOK.shirt[l.shirt], shorts: LOOK.shorts[l.shorts], height: LOOK.height[l.height], girth: LOOK.build[l.build] };
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
    // Left: the stage, Rename and Random under it.
    const sw = Math.max(230, Math.min(380, view.w * 0.32));
    this.stage = { x: margin, y: bodyTop, w: sw, h: bottom - 56 - bodyTop };
    const bw = (sw - 10) / 2;
    Object.assign(this.renameBtn, { x: margin, y: bottom - 46, w: bw });
    Object.assign(this.randomBtn, { x: margin + bw + 10, y: bottom - 46, w: bw });
    // Right: a row of tiles per pick.
    const rx = margin + sw + 22;
    const rw = view.w - margin - rx;
    const labelW = Math.min(130, rw * 0.2);
    const rowH = (bottom - bodyTop) / ROWS.length;
    const most = Math.max(...ROWS.map((r) => LOOK[r.f].length));
    const gap = 6;
    const t = Math.floor(Math.min(rowH - 10, (rw - labelW) / most - gap));
    this.rows = ROWS.map((r, i) => {
      const y = bodyTop + i * rowH;
      return { ...r, y, h: rowH, labelX: rx, tiles: LOOK[r.f].map((_, k) => ({ x: rx + labelW + k * (t + gap), y: y + (rowH - t) / 2, s: t })) };
    });
  }

  update(dt, t) {
    this.t += dt;
    this.flashT = Math.max(0, this.flashT - dt);
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
        if (k >= 0) this.set(row.f, k);
      }
    }
    this.buttons.forEach((b) => b.update(dt));
  }

  set(f, k) {
    if (this.look[f] === k) return;
    this.look[f] = k;
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

  rename() {
    const typed = window.prompt(`Your athlete's name (up to ${NAME_MAX} letters)`, this.name);
    this.game.input.clear(); // the dialog swallowed the rest of that tap
    if (typed == null) return;
    const name = cleanAthleteName(typed);
    if (name) {
      this.name = name;
      this.changed();
    }
  }

  save() {
    const code = encode(this.look, this.name);
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
    nameTag(ctx, this.name, st.x + st.w / 2, st.y + 26, 22);
    text(ctx, `${(CONFIG.figure.height * colors.height).toFixed(2)} m`, st.x + st.w - 14, st.y + st.h - 22, { size: 16, font: 'body', weight: 700, align: 'right', color: PAL.cream });

    // The picks.
    for (const row of this.rows) {
      const cy = row.y + row.h / 2;
      text(ctx, row.label, row.labelX, cy + 1, { size: 19, font: 'display', track: 1, align: 'left', color: PAL.cream, maxWidth: row.tiles[0].x - row.labelX - 8 });
      row.tiles.forEach((tl, k) => this.drawTile(ctx, row, tl, k, k === this.look[row.f], colors));
    }

    this.buttons.forEach((b) => b.draw(ctx));
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
