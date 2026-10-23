import { Button, text, chamfer, slab, PAL } from '../../core/ui.js';
import { drawIcon } from '../../core/icons.js';

/**
 * A square event card on the vs Computer and Live pages: a slab in the page's
 * colour with the event's icon (core/icons.js; the trophy for the tournament)
 * and its name in display type under a printed rule, plus an optional `sub`
 * line (Training: your best). A light face (the gold tournament) takes ink
 * instead of cream. A campaign card you've won gets a BEATEN! stamp
 * (`beaten`; `stampAge` thumps it down), and a `locked` one (the tournament,
 * until all five are beaten) is dimmed with a lock badge.
 */
export class EventTile extends Button {
  constructor(opts) {
    super(opts);
    this.id = opts.id; // an event id, or 'tournament'
    this.name = opts.name;
    this.beaten = false;
    this.locked = false;
    this.stampAge = null; // s since the stamp started coming down; null: already there
  }

  update(dt) {
    super.update(dt);
    if (this.stampAge != null) this.stampAge += dt;
  }

  draw(ctx) {
    const { face, lip, ink } = this.paint();
    const lipH = 5;
    const pressed = this.pressT > 0;
    const { x, w, h } = this;
    slab(ctx, x, this.y, w, h, { face, lip, lipH, c: 7, pressed });
    const y = this.y + (pressed ? lipH - 1 : 0);
    const fh = h - lipH;
    const band = Math.min(32, fh * 0.26); // the name's strip along the bottom
    ctx.save();
    if (this.locked) ctx.globalAlpha *= 0.45;
    ctx.fillStyle = lip;
    ctx.fillRect(x, y + fh - band, w, 2); // printed rule above the name
    drawIcon(ctx, this.id, x + w / 2, y + (fh - band) / 2 + 2, Math.min(w, fh - band) * 0.66, ink);
    const nameY = y + fh - band / 2 + (this.sub ? -5 : 1);
    text(ctx, this.name.toUpperCase(), x + w / 2, nameY, { size: Math.min(20, Math.round(w * 0.16)), font: 'display', track: 0.5, color: ink, maxWidth: w - 10 });
    if (this.sub) text(ctx, this.sub, x + w / 2, y + fh - 6, { size: 12, font: 'body', weight: 600, color: ink, maxWidth: w - 10 });
    ctx.restore();
    if (this.locked) {
      ctx.fillStyle = PAL.ink;
      chamfer(ctx, x + w - 32, y + 6, 26, 26, 4);
      ctx.fill();
      drawIcon(ctx, 'lock', x + w - 19, y + 19, 18, PAL.cream);
    }
    if (this.beaten) this.drawStamp(ctx, x, y, w, fh);
  }

  /** BEATEN! across the card, a little crooked, like a rubber stamp; a new one thumps down. */
  drawStamp(ctx, x, y, w, h) {
    const DELAY = 0.35;
    const a = this.stampAge == null ? 1 : Math.max(0, Math.min(1, (this.stampAge - DELAY) / 0.25));
    if (a <= 0) return;
    const scale = 1 + (1 - a) ** 2 * 1.4;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(x + w / 2, y + h * 0.42);
    ctx.scale(scale, scale);
    drawStamp(ctx, 0, 0, Math.min(w - 6, 110));
    ctx.restore();
  }
}

/** The flat BEATEN! stamp, `w` wide, centred on (cx, cy): cream, brick lettering between brick rules, an ink lip. */
export function drawStamp(ctx, cx, cy, w, label = 'BEATEN!') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.12);
  ctx.fillStyle = PAL.ink;
  chamfer(ctx, -w / 2 + 3, -10, w, 30, 4);
  ctx.fill();
  ctx.fillStyle = PAL.cream;
  chamfer(ctx, -w / 2, -14, w, 30, 4);
  ctx.fill();
  ctx.fillStyle = PAL.brick;
  ctx.fillRect(-w / 2 + 4, -10, w - 8, 2);
  ctx.fillRect(-w / 2 + 4, 10, w - 8, 2);
  text(ctx, label, 0, 1, { size: 21, font: 'display', color: PAL.brick, track: 1.5, maxWidth: w - 12 });
  ctx.restore();
}
