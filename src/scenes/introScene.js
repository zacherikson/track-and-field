import { text, roundRect } from '../core/ui.js';
import { getBest } from '../core/storage.js';
import { formatMark } from '../events/registry.js';
import { flow } from '../flow.js';
import { tournament, ORDER } from '../tournament/tournament.js';

/** Event title card: name, world record, your best, how to play. Tap to start. */
export class IntroScene {
  constructor(ev) {
    this.ev = ev;
  }

  enter() {
    this.age = 0;
    this.best = getBest(this.ev.id);
  }

  update(dt, t) {
    this.age += dt;
    for (const e of this.game.input.consume(t + dt)) {
      // Short grace period so the tap that opened this card doesn't also skip it.
      if (this.age < 0.35) continue;
      if (e.type === 'key' && e.code === 'Escape') return flow.menu(this.game);
      if (e.type === 'down' || ['Space', 'Enter'].includes(e.code)) return flow.play(this.game, this.ev);
    }
  }

  render(ctx, view) {
    ctx.fillStyle = '#12203a';
    ctx.fillRect(0, 0, view.w, view.h);
    const cw = Math.min(720, view.w - 40);
    const cx = view.w / 2;
    roundRect(ctx, cx - cw / 2, 40, cw, 460, 22);
    ctx.fillStyle = '#1d3a66';
    ctx.fill();

    if (tournament.active) {
      const me = tournament.standings().find((t) => t.isPlayer);
      const pts = me ? ` · ${me.total} pts` : '';
      text(ctx, `TOURNAMENT · EVENT ${tournament.index + 1} OF ${ORDER.length}${pts}`, cx, 20, { size: 15, weight: 700, color: 'rgba(255,255,255,0.7)' });
    }
    text(ctx, this.ev.name.toUpperCase(), cx, 100, { size: 50, color: '#ffb400', shadow: true });
    text(ctx, `World Record  ${formatMark(this.ev, this.ev.record)}`, cx, 160, { size: 22 });
    text(ctx, `Your Best  ${formatMark(this.ev, this.best)}`, cx, 192, { size: 18, weight: 500, color: 'rgba(255,255,255,0.8)' });

    const lines = this.ev.howTo || [];
    lines.forEach((l, i) => text(ctx, l, cx, 250 + i * 30, { size: 18, weight: 500, color: '#e6eefc', maxWidth: cw - 40 }));

    const pulse = 0.6 + 0.4 * Math.sin(this.age * 5);
    text(ctx, 'Tap to start', cx, 450, { size: 24, color: `rgba(255,255,255,${pulse})` });
  }
}
