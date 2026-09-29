import { Button, text, roundRect } from '../core/ui.js';
import { ordinal } from '../core/math.js';
import { formatMark } from '../events/registry.js';
import { getBest, submitBest, getDifficulty, saveGhostIfBetter } from '../core/storage.js';
import { postMark } from '../online/post.js';
import { counts } from '../online/bests.js';
import { flow } from '../flow.js';

/**
 * Results: your mark, placing, personal best, and full standings.
 * `results` is a sorted array of { name, lane, mark, status: 'ok'|'dnf', isPlayer, colors }.
 */
export class ResultScene {
  constructor(ev, results, stats = null) {
    this.ev = ev;
    this.results = results;
    this.stats = stats; // { hits, misses, topSpeed, run } for the player, when the event tracks them
  }

  enter() {
    this.age = 0;
    const me = this.results.find((r) => r.isPlayer);
    this.me = me;
    this.place = this.results.indexOf(me) + 1;
    const prevBest = getBest(this.ev.id);
    // Only runs that could go on the online board count as a best (online/bests.js).
    this.newPB = me.status === 'ok' && counts() && submitBest(this.ev.id, me.mark, this.ev.lowerIsBetter);
    this.best = getBest(this.ev.id);
    this.hadBest = prevBest != null;
    this.beatWR = me.status === 'ok' && (this.ev.lowerIsBetter ? me.mark < this.ev.record : me.mark > this.ev.record);
    this.online = null; // one line about the online leaderboard
    const run = this.stats?.run ?? null; // the recorded attempt: your ghost
    if (run && counts()) saveGhostIfBetter(this.ev, run);
    if (me.status === 'ok') postMark(this.ev, me.mark, run, (s) => (this.online = s));

    this.buttons = [
      new Button({ label: this.ev.againLabel ?? 'Race again', color: '#2bb673', onTap: () => flow.play(this.game, this.ev) }),
      new Button({ label: 'Menu', color: 'rgba(255,255,255,0.18)', onTap: () => flow.menu(this.game) }),
      new Button({ label: '⚙ Tuning', color: 'rgba(255,255,255,0.18)', onTap: () => flow.tuning(this.game) }),
    ];
    if (this.ev.online) this.buttons.splice(2, 0, new Button({ label: '🌐 Leaderboard', color: 'rgba(255,255,255,0.18)', onTap: () => flow.leaderboard(this.game, this.ev) }));
    this.layout(this.game.view);
  }

  onResize(view) {
    this.layout(view);
  }

  layout(view) {
    const gap = 14;
    const n = this.buttons.length;
    const w = Math.min(180, (view.w - 40 - Math.max(view.safe.l, view.safe.r) * 2 - gap * (n - 1)) / n);
    const x0 = view.w / 2 - (n * w + (n - 1) * gap) / 2;
    this.buttons.forEach((b, i) => Object.assign(b, { x: x0 + i * (w + gap), y: 458, w, h: 58 }));
  }

  update(dt, t) {
    this.age += dt;
    for (const e of this.game.input.consume(t + dt)) {
      if (this.age < 0.6) continue; // don't let frantic race taps hit a button
      if (e.type === 'down') this.buttons.some((b) => b.tap(e.x, e.y));
      else if (e.code === 'Space' || e.code === 'Enter') flow.play(this.game, this.ev);
      else if (e.code === 'Escape') flow.menu(this.game);
    }
    this.buttons.forEach((b) => b.update(dt));
  }

  render(ctx, view) {
    ctx.fillStyle = '#12203a';
    ctx.fillRect(0, 0, view.w, view.h);
    const me = this.me;
    const colW = Math.min(360, (view.w - 60) / 2);
    const lx = view.w / 2 - colW - 10;
    const rx = view.w / 2 + 10;

    // Left column: your result.
    let headline;
    if (me.status === 'dnf') headline = 'DID NOT FINISH';
    else if (me.status === 'nm') headline = 'NO MARK';
    else headline = formatMark(this.ev, me.mark);
    const cx = lx + colW / 2;
    text(ctx, `${this.ev.name.toUpperCase()} · ${getDifficulty() === 'pro' ? 'PRO' : 'AMATEUR'}`, cx, 52, { size: 20, color: 'rgba(255,255,255,0.7)' });
    text(ctx, headline, cx, 118, { size: me.status === 'ok' ? 72 : 38, color: '#fff', shadow: true });
    if (me.status === 'ok') text(ctx, `${ordinal(this.place)} place`, cx, 178, { size: 32, color: this.place === 1 ? '#ffb400' : '#fff' });

    const flash = 0.65 + 0.35 * Math.sin(this.age * 8);
    let y = 236;
    if (this.beatWR) {
      text(ctx, 'NEW WORLD RECORD!', cx, y, { size: 24, color: `rgba(255,180,0,${flash})` });
      y += 34;
    }
    if (this.newPB) {
      text(ctx, this.hadBest ? 'NEW PERSONAL BEST!' : 'FIRST PERSONAL BEST!', cx, y, { size: 22, color: `rgba(89,205,144,${flash})` });
      y += 34;
    }
    text(ctx, `Personal best  ${formatMark(this.ev, this.best)}`, cx, y + 8, { size: 18, weight: 500, color: 'rgba(255,255,255,0.8)' });
    text(ctx, `World record  ${formatMark(this.ev, this.ev.record)}`, cx, y + 36, { size: 18, weight: 500, color: 'rgba(255,255,255,0.8)' });
    if (this.stats && me.status === 'ok') {
      // Numbers to talk about when tuning.
      const s = this.stats;
      const pace = s.hits / me.mark;
      text(ctx, `${s.hits} hits · ${s.misses} ${s.misses === 1 ? 'miss' : 'misses'}${s.extra ? ` · ${s.extra}` : ''} · ${s.paceText ?? `${pace.toFixed(1)} hits/s`} · top ${(s.topSpeed * 3.6).toFixed(0)} km/h`, cx, y + 72, {
        size: 15, weight: 500, color: 'rgba(255,255,255,0.65)', maxWidth: colW,
      });
    }
    if (this.stats?.input) {
      // Input check: every touch the phone delivered should be judged by the game.
      const i = this.stats.input;
      const ign = i.ignored.map(([k, v]) => `${v} ${k}`).join(', ');
      const l1 = `Touches ${i.touches} · judged ${i.judged}${ign ? ` (ignored: ${ign})` : ''}${i.cancels ? ` · ${i.cancels} cancelled by phone` : ''}`;
      const ms = (v) => `${Math.round(v)} ms`;
      const slow = i.slow ? ` · ${i.slow} slow (>60 ms)${i.slowEdge ? `, ${i.slowEdge} near edge` : ''}${i.slowMulti ? `, ${i.slowMulti} with other thumb down` : ''}` : '';
      const l2 = `Phone delay: typical ${ms(i.phoneTypical)}, worst ${ms(i.phoneMax)}${slow}`;
      const l3 = `Game: worst frame ${ms(i.worstFrameMs)} · worst total tap delay ${ms(i.lagMax)}`;
      const warn = i.cancels > 0 || i.touches !== i.judged || i.worstFrameMs > 100 || i.slow > 0;
      const color = warn ? 'rgba(255,190,90,0.9)' : 'rgba(255,255,255,0.45)';
      text(ctx, l1, cx, y + 96, { size: 13, weight: 500, color, maxWidth: colW });
      text(ctx, l2, cx, y + 114, { size: 13, weight: 500, color, maxWidth: colW });
      text(ctx, l3, cx, y + 132, { size: 13, weight: 500, color, maxWidth: colW });
    }

    // Right column: standings.
    roundRect(ctx, rx, 30, colW, 400, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    text(ctx, 'RESULTS', rx + colW / 2, 58, { size: 18, color: 'rgba(255,255,255,0.7)' });
    this.results.forEach((r, i) => {
      const ry = 100 + i * 52;
      if (r.isPlayer) {
        roundRect(ctx, rx + 8, ry - 22, colW - 16, 44, 10);
        ctx.fillStyle = 'rgba(255,180,0,0.18)';
        ctx.fill();
      }
      const mark = r.status === 'ok' ? formatMark(this.ev, r.mark) : r.status.toUpperCase();
      text(ctx, r.status === 'ok' ? String(i + 1) : '–', rx + 30, ry, { size: 20 });
      ctx.fillStyle = r.colors.shirt;
      ctx.fillRect(rx + 50, ry - 9, 6, 18);
      text(ctx, r.name, rx + 66, ry, { size: 19, align: 'left', weight: r.isPlayer ? 800 : 600 });
      if (r.lane != null) text(ctx, `L${r.lane}`, rx + colW - 110, ry, { size: 14, weight: 500, color: 'rgba(255,255,255,0.6)' });
      text(ctx, mark, rx + colW - 22, ry, { size: 20, align: 'right' });
    });

    if (this.online) text(ctx, this.online, rx + colW / 2, 410, { size: 14, weight: 500, color: 'rgba(255,255,255,0.7)', maxWidth: colW - 24 });

    this.buttons.forEach((b) => b.draw(ctx));
  }
}
