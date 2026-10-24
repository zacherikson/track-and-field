import { CONFIG } from '../../config.js';
import { text, slab, chamfer, titlePlate, PAL } from '../../core/ui.js';
import { pinebrook } from '../../render/posterScenery.js';
import { drawFigure, runPose, POSES } from '../../athletes/stickFigure.js';
import { CHARACTERS, myAthlete, heightOf } from '../../athletes/roster.js';
import { setCharacter } from '../../core/storage.js';
import { Sideshow } from './sideshow.js';


/**
 * The home screen's left tab: your athlete, who does every event. Along the
 * top, a cream card in a flat spotlight: them warming up in Pinebrook Park,
 * their shirt colour, name, tagline and height; below, on a band, everyone as
 * cream cards (yours gold), and tapping one makes them yours. Remembered on this device and your
 * account (online/progress.js).
 */
export class AthletePanel {
  constructor(home) {
    this.home = home;
    this.game = home.game;
  }

  enter() {
    this.phase = 0;
    this.flashT = 0; // just changed: the spotlight lights up
    this.cards = CHARACTERS.map((c) => ({ c, x: 0, y: 0, w: 0, h: 0, pressT: 0 }));
    this.sideshow = new Sideshow(); // everyone, up to no good under the cards
  }

  /** `bottom`: the top of the tab bar. */
  layout(view, bottom) {
    const margin = 20 + Math.max(view.safe.l, view.safe.r);
    const gap = 12;
    const n = CHARACTERS.length;
    const cw = Math.min(130, (view.w - margin * 2 - gap * (n - 1)) / n);
    const ctotal = cw * n + gap * (n - 1);
    const ch = Math.min(160, bottom - CARDS_Y - 14);
    this.cards.forEach((k, i) => Object.assign(k, { x: (view.w - ctotal) / 2 + i * (cw + gap), y: CARDS_Y, w: cw, h: ch }));
    const sw = Math.min(580, view.w - margin * 2);
    this.spot = { x: view.w / 2 - sw / 2, y: 66, w: sw, h: BAND_Y - 66 - 16 };
    this.bottom = bottom;
  }

  onShow() {}

  pick(c) {
    if (c === myAthlete()) return;
    setCharacter(c.id);
    this.flashT = 0.5;
  }

  /** `events`: this tab's taps and keys (the home screen has sorted out swipes). */
  update(dt, events) {
    this.phase += dt * 9;
    this.flashT = Math.max(0, this.flashT - dt);
    this.sideshow.update(dt);
    for (const k of this.cards) k.pressT = Math.max(0, k.pressT - dt);
    for (const e of events) {
      if (e.type === 'key') {
        // ← / →: the next athlete along.
        const step = e.code === 'ArrowRight' ? 1 : e.code === 'ArrowLeft' ? -1 : 0;
        if (step) this.pick(CHARACTERS[(CHARACTERS.indexOf(myAthlete()) + step + CHARACTERS.length) % CHARACTERS.length]);
        continue;
      }
      if (e.type !== 'down') continue;
      const card = this.cards.find((k) => e.x >= k.x && e.x <= k.x + k.w && e.y >= k.y && e.y <= k.y + k.h);
      if (card) {
        card.pressT = 0.12;
        this.pick(card.c);
      }
    }
  }

  render(ctx, view) {
    // A flat spotlight from the top onto your card.
    ctx.fillStyle = PAL.ink2;
    ctx.beginPath();
    ctx.moveTo(view.w / 2 - 60, 0);
    ctx.lineTo(view.w / 2 + 60, 0);
    ctx.lineTo(view.w / 2 + 330, BAND_Y - 2);
    ctx.lineTo(view.w / 2 - 330, BAND_Y - 2);
    ctx.fill();
    titlePlate(ctx, view, 'YOUR ATHLETE', '', { face: PAL.gold, ink: PAL.ink });
    const me = myAthlete();
    this.renderSpot(ctx, me);
    // Everyone, on a band with a gold rule.
    ctx.fillStyle = PAL.ink2;
    ctx.fillRect(0, BAND_Y, view.w, this.bottom - BAND_Y);
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(0, BAND_Y, view.w, 3);
    this.sideshow.draw(ctx, this.sideshowSlots(view), { w: view.w, h: this.bottom });
    for (const k of this.cards) this.drawCard(ctx, k, k.c === me);
  }

  /** Where the sideshow's skits play: along the bottom of the band, under the cards (if there's room). */
  sideshowSlots(view) {
    const k = this.cards[0];
    const room = this.bottom - (k.y + k.h);
    const H = Math.min(60, (room - 14) / 1.4); // and an emoji over their heads, under the cards
    if (H < 36) return [];
    return [
      { x: view.w * 0.22, ground: this.bottom - 12, H },
      { x: view.w * 0.78, ground: this.bottom - 10, H },
    ];
  }

  /** Your athlete's card: them warming up in Pinebrook Park, their shirt colour, name, tagline and height. */
  renderSpot(ctx, c) {
    const b = this.spot;
    const lipH = 6;
    slab(ctx, b.x, b.y, b.w, b.h, { face: this.flashT > 0 ? '#FBF3DF' : PAL.cream, lip: PAL.creamShade, lipH, c: 8 });
    const fh = b.h - lipH;
    const vw = Math.min(180, b.w * 0.32);
    ctx.save();
    chamfer(ctx, b.x, b.y, vw, fh, 8);
    ctx.clip();
    pinebrook(ctx, b.x - 60, b.y - 20, vw + 120, fh + 20, { trackH: 34, clouds: [[0.5, 0.2, 0.09]] });
    ctx.restore();
    ctx.fillStyle = shirtBar(c);
    ctx.fillRect(b.x + vw, b.y, 8, fh);
    const fx = b.x + vw / 2;
    const ground = b.y + fh - 16;
    ctx.fillStyle = 'rgba(38,34,79,0.35)';
    ctx.beginPath();
    ctx.ellipse(fx, ground + 2, 26, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    drawFigure(ctx, fx, ground, Math.min(112, fh - 24) * heightOf(c.colors), runPose(this.phase * 0.8, 0.9), c.colors, ground);
    const tx = b.x + vw + 30;
    const tw = b.x + b.w - 16 - tx;
    text(ctx, c.name.toUpperCase(), tx, b.y + fh * 0.3, { size: 50, font: 'display', align: 'left', track: 2, color: PAL.ink, maxWidth: tw });
    text(ctx, c.tagline, tx + 2, b.y + fh * 0.6, { size: 19, font: 'body', align: 'left', color: PAL.ink, maxWidth: tw });
    text(ctx, `${(CONFIG.figure.height * heightOf(c.colors)).toFixed(2)} m`, tx + 2, b.y + fh * 0.8, { size: 17, font: 'body', align: 'left', color: PAL.muted, maxWidth: tw });
  }

  /** An athlete card: cream, with their shirt colour along the top; `on`: yours (gold, and warming up). */
  drawCard(ctx, k, on) {
    const { c } = k;
    const lipH = 5;
    const pressed = k.pressT > 0;
    slab(ctx, k.x, k.y, k.w, k.h, { face: on ? PAL.gold : PAL.cream, lip: on ? PAL.goldShade : PAL.creamShade, lipH, c: 7, pressed });
    const y = k.y + (pressed ? lipH - 1 : 0);
    ctx.fillStyle = shirtBar(c);
    ctx.fillRect(k.x, y + 10, k.w, 8);
    const ground = y + k.h - lipH - 36;
    drawFigure(ctx, k.x + k.w / 2, ground, Math.min(76, k.h - 64) * heightOf(c.colors), on ? runPose(this.phase, 0.6) : POSES.stand, c.colors, ground);
    text(ctx, c.name.toUpperCase(), k.x + k.w / 2, y + k.h - lipH - 16, { size: Math.min(21, Math.round(k.w * 0.17)), font: 'display', track: 1, color: PAL.ink, maxWidth: k.w - 12 });
  }
}

/** A shirt colour that shows on cream (a white shirt goes darker). */
function shirtBar(c) {
  return /^#f[0-9a-f]f[0-9a-f]f[0-9a-f]$/i.test(c.colors.shirt) || c.colors.shirt.toLowerCase() === '#ffffff' ? '#C9C3B2' : c.colors.shirt;
}

const BAND_Y = 228; // top of the band of athlete cards
const CARDS_Y = 244; // top of the athlete cards
