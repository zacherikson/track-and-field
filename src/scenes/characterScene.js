import { Button, text, roundRect } from '../core/ui.js';
import { drawFigure, runPose, POSES } from '../athletes/stickFigure.js';
import { CHARACTERS, player, heightOf } from '../athletes/roster.js';
import { setCharacter } from '../core/storage.js';
import { flow } from '../flow.js';

/**
 * Choose your athlete: a card for each character (running in place when
 * picked, standing otherwise). The rest become your rivals. Remembered on this
 * device.
 */
export class CharacterScene {
  enter() {
    this.age = 0;
    this.chosen = player().id;
    this.phase = 0;
    this.cards = CHARACTERS.map((c) => ({ c, x: 0, y: 0, w: 0, h: 0, pressT: 0 }));
    this.done = new Button({ label: 'Ready', w: 220, h: 56, onTap: () => flow.menu(this.game) });
    this.layout(this.game.view);
  }

  onResize(view) {
    this.layout(view);
  }

  layout(view) {
    const n = this.cards.length;
    const margin = 20 + Math.max(view.safe.l, view.safe.r);
    const perRow = view.w - margin * 2 >= 6 * 150 + 5 * 12 ? 6 : 3;
    const rows = Math.ceil(n / perRow);
    const gap = 12;
    const w = Math.min(180, (view.w - margin * 2 - gap * (perRow - 1)) / perRow);
    const h = rows === 1 ? 300 : 170;
    const top = rows === 1 ? 110 : 96;
    this.cards.forEach((card, i) => {
      const r = Math.floor(i / perRow);
      const k = i % perRow;
      const inRow = Math.min(perRow, n - r * perRow);
      const total = inRow * w + (inRow - 1) * gap;
      Object.assign(card, { x: (view.w - total) / 2 + k * (w + gap), y: top + r * (h + gap), w, h });
    });
    this.done.x = view.w / 2 - this.done.w / 2;
    this.done.y = view.h - 56 - 18 - view.safe.b;
  }

  update(dt, t) {
    this.age += dt;
    this.phase += dt * 9;
    for (const card of this.cards) card.pressT = Math.max(0, card.pressT - dt);
    this.done.update(dt);
    for (const e of this.game.input.consume(t + dt)) {
      if (e.type === 'key' && (e.code === 'Escape' || e.code === 'Enter')) return flow.menu(this.game);
      if (e.type === 'key' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
        const i = CHARACTERS.findIndex((c) => c.id === this.chosen);
        this.pick(CHARACTERS[(i + (e.code === 'ArrowRight' ? 1 : CHARACTERS.length - 1)) % CHARACTERS.length].id);
        continue;
      }
      if (e.type !== 'down' || this.age < 0.25) continue;
      if (this.done.tap(e.x, e.y)) return;
      const card = this.cards.find((k) => e.x >= k.x && e.x <= k.x + k.w && e.y >= k.y && e.y <= k.y + k.h);
      if (card) {
        card.pressT = 0.12;
        this.pick(card.c.id);
      }
    }
  }

  pick(id) {
    this.chosen = id;
    setCharacter(id);
  }

  render(ctx, view) {
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, '#0d1830');
    g.addColorStop(1, '#1d3a66');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
    text(ctx, 'CHOOSE YOUR ATHLETE', view.w / 2, 52, { size: 40, color: '#ffb400', shadow: true });
    text(ctx, 'The other five are your rivals.', view.w / 2, 84, { size: 16, weight: 500, color: 'rgba(255,255,255,0.75)' });
    for (const card of this.cards) this.drawCard(ctx, card);
    const me = CHARACTERS.find((c) => c.id === this.chosen);
    text(ctx, me.tagline, view.w / 2, this.done.y - 22, { size: 17, weight: 500, color: 'rgba(255,255,255,0.85)', maxWidth: view.w - 40 });
    this.done.draw(ctx);
  }

  drawCard(ctx, card) {
    const { c, w, h } = card;
    const on = c.id === this.chosen;
    const inset = card.pressT > 0 ? 3 : 0;
    const x = card.x + inset;
    const y = card.y + inset;
    roundRect(ctx, x, y, w - inset * 2, h - inset * 2, 16);
    ctx.fillStyle = on ? 'rgba(255,180,0,0.18)' : 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.lineWidth = on ? 4 : 1.5;
    ctx.strokeStyle = on ? '#ffb400' : 'rgba(255,255,255,0.18)';
    ctx.stroke();
    // Kit stripe along the top.
    roundRect(ctx, x + 10, y + 10, w - 20 - inset * 2, 6, 3);
    ctx.fillStyle = c.colors.shirt;
    ctx.fill();
    const figH = Math.min(h - 70, 150);
    const ground = y + h - 44;
    const pose = on ? runPose(this.phase, 0.8) : POSES.stand;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(x + 14, ground + 1, w - 28 - inset * 2, 2);
    drawFigure(ctx, x + w / 2 - inset, ground, figH * heightOf(c.colors), pose, c.colors, ground);
    text(ctx, c.name, x + w / 2 - inset, y + h - 22, { size: 19, weight: on ? 800 : 600, color: on ? '#ffd35c' : '#fff', maxWidth: w - 16 });
  }
}
