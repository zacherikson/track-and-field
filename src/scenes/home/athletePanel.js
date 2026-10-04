import { CONFIG } from '../../config.js';
import { text, roundRect } from '../../core/ui.js';
import { drawFigure, runPose, POSES } from '../../athletes/stickFigure.js';
import { CHARACTERS, myAthlete, heightOf } from '../../athletes/roster.js';
import { setCharacter } from '../../core/storage.js';

const GOLD = '#ffb400';
const DIM = 'rgba(255,255,255,0.6)';

/**
 * The home screen's left tab: your athlete, who does every event. Along the
 * top, them warming up with their name, tagline and height; below, everyone,
 * and tapping one makes them yours. Remembered on this device and your
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
  }

  /** `bottom`: the top of the tab bar. */
  layout(view, bottom) {
    const margin = 20 + Math.max(view.safe.l, view.safe.r);
    const gap = 10;
    const n = CHARACTERS.length;
    const cw = Math.min(130, (view.w - margin * 2 - gap * (n - 1)) / n);
    const ctotal = cw * n + gap * (n - 1);
    const ch = Math.min(130, bottom - CARDS_Y - 14);
    this.cards.forEach((k, i) => Object.assign(k, { x: (view.w - ctotal) / 2 + i * (cw + gap), y: CARDS_Y, w: cw, h: ch }));
    const sw = Math.min(560, view.w - margin * 2);
    this.spot = { x: view.w / 2 - sw / 2, y: 60, w: sw, h: CARDS_Y - 60 - 24 };
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
    text(ctx, 'YOUR ATHLETE', view.w / 2, 34, { size: 30, color: GOLD, shadow: true });
    const me = myAthlete();
    this.renderSpot(ctx, me);
    const top = CARDS_Y - 14;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, top, view.w, this.bottom - top);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, top, view.w, 2);
    for (const k of this.cards) this.drawCard(ctx, k, k.c === me);
  }

  /** Your athlete running on the spot, with their name, tagline and height. */
  renderSpot(ctx, c) {
    const b = this.spot;
    roundRect(ctx, b.x, b.y, b.w, b.h, 18);
    ctx.fillStyle = this.flashT > 0 ? 'rgba(89,205,144,0.3)' : 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.lineWidth = this.flashT > 0 ? 4 : 2;
    ctx.strokeStyle = this.flashT > 0 ? '#59cd90' : 'rgba(255,180,0,0.5)';
    ctx.stroke();
    const fx = b.x + Math.min(90, b.w * 0.18);
    const ground = b.y + b.h - 16;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(fx, ground + 2, 30, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    drawFigure(ctx, fx, ground, Math.min(130, b.h - 24) * heightOf(c.colors), runPose(this.phase * 0.8, 0.9), c.colors, ground);
    const tx = fx + Math.min(90, b.w * 0.18);
    const tw = b.x + b.w - 20 - tx;
    const cy = b.y + b.h / 2;
    text(ctx, c.name, tx, cy - 30, { size: 34, align: 'left', color: GOLD, shadow: true, maxWidth: tw });
    text(ctx, c.tagline, tx, cy + 6, { size: 16, weight: 600, align: 'left', color: '#fff', maxWidth: tw });
    text(ctx, `${(CONFIG.figure.height * heightOf(c.colors)).toFixed(2)} m`, tx, cy + 34, { size: 15, weight: 600, align: 'left', color: DIM, maxWidth: tw });
  }

  /** An athlete card; `on`: yours (lit, and warming up). */
  drawCard(ctx, k, on) {
    const { c } = k;
    const inset = k.pressT > 0 ? 3 : 0;
    roundRect(ctx, k.x + inset, k.y + inset, k.w - inset * 2, k.h - inset * 2, 12);
    ctx.fillStyle = on ? 'rgba(255,180,0,0.18)' : 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.lineWidth = on ? 4 : 1.5;
    ctx.strokeStyle = on ? GOLD : 'rgba(255,255,255,0.18)';
    ctx.stroke();
    roundRect(ctx, k.x + 8, k.y + 8, k.w - 16, 5, 2.5);
    ctx.fillStyle = c.colors.shirt;
    ctx.fill();
    const ground = k.y + k.h - 28;
    drawFigure(ctx, k.x + k.w / 2, ground, Math.min(72, k.h - 48) * heightOf(c.colors), on ? runPose(this.phase, 0.6) : POSES.stand, c.colors, ground);
    text(ctx, c.name, k.x + k.w / 2, k.y + k.h - 13, { size: 15, weight: on ? 800 : 600, color: on ? '#ffd35c' : '#fff', maxWidth: k.w - 10 });
  }
}

const CARDS_Y = 228; // top of the row of athlete cards
