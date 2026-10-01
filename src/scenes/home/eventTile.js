import { Button, text, roundRect } from '../../core/ui.js';
import { drawFigure, runPose, hurdlePose, handPos, JUMP_POSES, VAULT_POSES, JAVELIN_POSES } from '../../athletes/stickFigure.js';

const WHITE = { shirt: '#ffffff', shorts: '#ffffff', skin: '#ffffff', hair: '#ffffff' };

/**
 * A square event card on the vs Computer list: the event's pictogram (or the
 * trophy, for the tournament) in white on the section's colour, its name
 * under it, and an optional `sub` line (Training: your best). A campaign card
 * you've won gets a BEATEN! stamp (`beaten`; `stampAge` animates it in), and
 * a `locked` one (the tournament, until all five are beaten) is dimmed with a padlock.
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
    const inset = this.pressT > 0 ? 3 : 0;
    const x = this.x + inset;
    const y = this.y + inset;
    const w = this.w - inset * 2;
    const h = this.h - inset * 2;
    // Card, with a darker edge underneath so it stands up.
    roundRect(ctx, x, y + 4, w, h, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();
    roundRect(ctx, x, y, w, h, 12);
    ctx.fillStyle = this.color;
    ctx.fill();

    ctx.save();
    roundRect(ctx, x, y, w, h, 12);
    ctx.clip();
    if (this.locked) ctx.globalAlpha *= 0.4;
    const s = Math.min(w * 0.62, h * 0.6);
    drawPictogram(ctx, this.id, x + w / 2, y + 6 + s / 2, s);
    const nameY = this.sub ? y + h - 22 : y + h - 13;
    text(ctx, this.name, x + w / 2, nameY, { size: 13, weight: 800, maxWidth: w - 8 });
    if (this.sub) text(ctx, this.sub, x + w / 2, y + h - 8, { size: 11, weight: 600, color: 'rgba(255,255,255,0.85)', maxWidth: w - 8 });
    ctx.restore();

    if (this.locked) text(ctx, '🔒', x + w - 14, y + 15, { size: 16 });
    if (this.beaten) this.drawStamp(ctx, x, y, w, h);
  }

  /** BEATEN! across the card, a little crooked, like a rubber stamp; a new one thumps down. */
  drawStamp(ctx, x, y, w, h) {
    const DELAY = 0.35;
    const a = this.stampAge == null ? 1 : Math.max(0, Math.min(1, (this.stampAge - DELAY) / 0.25));
    if (a <= 0) return;
    const scale = 1 + (1 - a) ** 2 * 1.4;
    const bw = Math.min(w - 4, 112);
    const bh = 26;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(x + w / 2, y + h * 0.45);
    ctx.rotate(-0.12);
    ctx.scale(scale, scale);
    roundRect(ctx, -bw / 2, -bh / 2 + 3, bw, bh, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();
    roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 7);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#c4161c';
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, 'BEATEN!', 0, 1, { size: 16, weight: 900, color: '#d4161c', maxWidth: bw - 10 });
    ctx.restore();
  }
}

/** An event's pictogram in white, centred on (cx, cy) in an `s`-sized box; the trophy for 'tournament'. */
export function drawPictogram(ctx, id, cx, cy, s) {
  if (id === 'tournament') {
    text(ctx, '🏆', cx, cy + s * 0.04, { size: s * 0.82 });
    return;
  }
  const H = s * 0.78;
  const foot = cy + s * 0.42;
  const away = foot + 1000; // its shadow, off the card
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, s * 0.06);
  const line = (x0, y0, x1, y1) => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };
  if (id === 'sprint100') {
    drawFigure(ctx, cx - s * 0.05, foot, H, runPose(Math.PI * 0.5, 1, 0.4), WHITE, away);
  } else if (id === 'hurdles110') {
    const fy = foot - s * 0.12;
    drawFigure(ctx, cx - s * 0.12, fy, H, hurdlePose(runPose(0, 1), 1), WHITE, away);
    // The hurdle under the lead leg.
    const hx = cx + s * 0.06;
    const top = foot - s * 0.3;
    line(hx - s * 0.18, top, hx + s * 0.08, top);
    line(hx - s * 0.14, top, hx - s * 0.14, foot + s * 0.04);
    line(hx + s * 0.04, top, hx + s * 0.04, foot + s * 0.04);
  } else if (id === 'longjump') {
    drawFigure(ctx, cx - s * 0.2, foot - s * 0.18, H, JUMP_POSES.glide, WHITE, away);
    // The sand.
    line(cx - s * 0.05, foot + s * 0.04, cx + s * 0.48, foot + s * 0.04);
  } else if (id === 'polevault') {
    // Over the bar, face down, the pole falling away below.
    const pose = VAULT_POSES.overBar;
    drawFigure(ctx, cx + s * 0.02, cy - s * 0.04, H, pose, WHITE, away);
    line(cx - s * 0.48, cy + s * 0.1, cx + s * 0.48, cy + s * 0.1);
    line(cx - s * 0.3, foot + s * 0.04, cx + s * 0.2, cy - s * 0.15);
  } else if (id === 'javelin') {
    const pose = JAVELIN_POSES.release;
    const fx = cx - s * 0.08;
    drawFigure(ctx, fx, foot, H, pose, WHITE, away);
    const hand = handPos(fx, foot, H, pose, 0);
    const k = s * 0.34;
    line(hand.x - k * 0.75, hand.y + k * 0.55, hand.x + k * 0.75, hand.y - k * 0.55);
  }
  ctx.restore();
}
