import { Button, text, titlePlate, chamfer, PAL } from '../core/ui.js';
import { formatMark } from '../events/registry.js';
import { olympic } from '../render/posterScenery.js';
import { drawFigure } from '../athletes/stickFigure.js';
import { heightOf } from '../athletes/roster.js';
import { emote } from '../brawl/poses.js';
import { formatAmount } from '../economy/currencies.js';
import { currentLive } from '../online/live.js';

/**
 * THE PODIUM, after a live event (the design doc's medal ceremony): the top
 * three on their blocks, 2nd, 1st, 3rd, under the lights, each with their medal
 * round their neck. The winner flexes, second dances, third waves to the crowd.
 * Confetti. If you're up there, what you won (the server's payout, as it comes
 * in: online/live.js `payout`).
 *
 * `results` = the event's results, best first (as the results screen has them);
 * `actions` = [{ label, color, lip, onTap }]: the results screen's buttons, so
 * you go on from here as you would have from there.
 */
const MEDAL = [
  { face: '#F2C230', rim: '#B8891A', name: 'GOLD' },
  { face: '#D3D8DE', rim: '#8E979F', name: 'SILVER' },
  { face: '#D98F4E', rim: '#9A5B26', name: 'BRONZE' },
];
const BLOCK_H = [150, 116, 94]; // 1st, 2nd, 3rd
const POSE = ['flex', 'dance', 'taunt'];
const CONFETTI = ['#F2B632', '#E8743B', '#3B6CC2', '#C2407E', '#2E8B57', '#F5EAD0'];

export class PodiumScene {
  constructor(ev, results, actions) {
    this.ev = ev;
    this.top = results.filter((r) => !r.ghost && r.status === 'ok').slice(0, 3);
    this.actions = actions;
  }

  enter() {
    this.age = 0;
    this.buttons = this.actions.map((a) => new Button({ label: a.label, color: a.color, lip: a.lip, h: 52, size: 20, onTap: a.onTap }));
    const live = currentLive();
    this.payout = live?.payout ?? null;
    this.stopPayout = live?.onPayout?.((p) => (this.payout = p));
    this.layout(this.game.view);
  }

  exit() {
    this.stopPayout?.();
  }

  onResize(view) {
    this.layout(view);
  }

  layout(view) {
    const gap = 14;
    const w = Math.min(220, (view.w - 40 - gap * (this.buttons.length - 1)) / this.buttons.length);
    const x0 = view.w / 2 - (this.buttons.length * w + (this.buttons.length - 1) * gap) / 2;
    this.buttons.forEach((b, i) => Object.assign(b, { x: x0 + i * (w + gap), y: view.h - view.safe.b - 64, w }));
  }

  update(dt, t) {
    this.age += dt;
    for (const e of this.game.input.consume(t + dt)) {
      if (e.type === 'down') this.buttons.some((b) => b.tap(e.x, e.y));
      else if (e.code === 'Escape') this.buttons.at(-1)?.onTap();
    }
    this.buttons.forEach((b) => b.update(dt));
  }

  render(ctx, view) {
    const ground = view.h - view.safe.b - 84; // the blocks stand on the track
    olympic(ctx, 0, 0, view.w, view.h, { trackH: view.h - ground, night: true });
    titlePlate(ctx, view, 'PODIUM', this.ev.name, { y: 40 });

    // The blocks, 2nd 1st 3rd, each with its athlete on top.
    const bw = Math.min(170, (view.w - 60) / 3);
    const cx = view.w / 2;
    const xs = [cx, cx - bw - 6, cx + bw + 6]; // by place
    for (let i = this.top.length - 1; i >= 0; i--) this.drawPlace(ctx, xs[i], ground, bw, i, this.top[i]);
    this.drawConfetti(ctx, view, ground);
    this.drawPayout(ctx, view, ground);
    this.buttons.forEach((b) => b.draw(ctx));
  }

  /** Place `i` (0 = 1st): its block, its number, name and mark, and the athlete on it with their medal. */
  drawPlace(ctx, x, ground, bw, i, r) {
    const h = BLOCK_H[i];
    const rise = Math.min(1, Math.max(0, (this.age - 0.15 * (2 - i)) / 0.45)); // 3rd, 2nd, then 1st come up
    const top = ground - h * (1 - (1 - rise) ** 3);
    ctx.fillStyle = PAL.creamShade;
    chamfer(ctx, x - bw / 2 + 5, top + 5, bw, ground - top, 6);
    ctx.fill();
    ctx.fillStyle = PAL.cream;
    chamfer(ctx, x - bw / 2, top, bw, ground - top, 6);
    ctx.fill();
    ctx.fillStyle = MEDAL[i].face;
    ctx.fillRect(x - bw / 2, top, bw, 8);
    if (rise > 0.6) {
      text(ctx, String(i + 1), x, top + 40, { size: 48, font: 'display', color: PAL.ink });
      text(ctx, r.name, x, top + 76, { size: 17, font: 'body', weight: 800, color: PAL.ink, maxWidth: bw - 14 });
      if (h > 110) text(ctx, formatMark(this.ev, r.mark), x, top + 98, { size: 15, font: 'body', weight: 700, color: PAL.muted });
    }
    if (rise < 1) return;
    // The athlete, celebrating, with the medal round their neck.
    const H = 112 * heightOf(r.colors);
    const pose = emote(POSE[i], this.age * 0.9 + i * 0.7);
    drawFigure(ctx, x, top, H, pose, r.colors, top);
    const neckY = top - H * 0.8;
    const medalY = top - H * 0.58;
    const m = MEDAL[i];
    ctx.strokeStyle = PAL.blue;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - 5, neckY);
    ctx.lineTo(x, medalY - 6);
    ctx.lineTo(x + 5, neckY);
    ctx.stroke();
    ctx.fillStyle = m.rim;
    ctx.beginPath();
    ctx.arc(x, medalY, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = m.face;
    ctx.beginPath();
    ctx.arc(x, medalY, 6.5, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Confetti falling over it all for a few seconds: the same every time (each piece's path comes from its number). */
  drawConfetti(ctx, view, ground) {
    const t = this.age - 0.8;
    if (t < 0 || t > 7) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (7 - t) / 1.5);
    for (let k = 0; k < 70; k++) {
      const f = (n) => ((Math.sin(k * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
      const y = -20 + ((t * (60 + f(1) * 70) + f(2) * 300) % (ground + 20));
      const x = f(3) * view.w + Math.sin(t * (1 + f(4) * 2) + k) * 18;
      ctx.fillStyle = CONFETTI[k % CONFETTI.length];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * (2 + f(5) * 4) + k);
      ctx.fillRect(-4, -2, 8, 4);
      ctx.restore();
    }
    ctx.restore();
  }

  /** If you're up there: your medal and what came with it, once the server's payout is in. */
  drawPayout(ctx, view, ground) {
    const p = this.payout;
    if (!p || p.place == null) return;
    const bits = [p.medal ? `${MEDAL[['gold', 'silver', 'bronze'].indexOf(p.medal)].name} MEDAL` : null, p.earned ? `+${formatAmount('earned', p.earned)}` : null, p.premium ? `+${formatAmount('premium', p.premium)}` : null, p.xp ? `+${p.xp} XP` : null].filter(Boolean);
    if (!bits.length) return;
    text(ctx, bits.join('  ·  '), view.w / 2, 98, { size: 20, font: 'display', track: 1, color: PAL.gold, maxWidth: view.w - 40 });
  }
}
