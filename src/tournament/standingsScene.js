import { Button, text, roundRect } from '../core/ui.js';
import { ordinal } from '../core/math.js';
import { formatMark, TOURNAMENT_BOARD } from '../events/registry.js';
import { submitBest, saveGhostIfFaster } from '../core/storage.js';
import { postMark } from '../online/post.js';
import { tournament, ORDER } from './tournament.js';
import { flow } from '../flow.js';

/**
 * Between tournament events: this event's results with the points each mark
 * scored (left) and the running totals (right). After the last event: the
 * final standings and the champion.
 */
export class StandingsScene {
  constructor(ev, results, stats = null) {
    this.ev = ev;
    this.results = results;
    this.stats = stats;
  }

  enter() {
    this.age = 0;
    const me = this.results.find((r) => r.isPlayer);
    // Personal bests, ghosts and online marks still count in a tournament.
    this.online = null; // one line about the online leaderboard
    const run = this.stats?.run ?? null;
    if (run) saveGhostIfFaster(this.ev.id, run);
    if (me?.status === 'ok') submitBest(this.ev.id, me.mark, this.ev.lowerIsBetter);
    this.rows = tournament.record(this.ev, this.results);
    this.table = tournament.standings();
    this.final = tournament.finished;
    if (this.final) {
      // The total goes on the tournament board. This event's mark goes on its own
      // board too, but the status line is about the total.
      if (me?.status === 'ok') postMark(this.ev, me.mark, run, () => {});
      const total = this.table.find((t) => t.isPlayer)?.total;
      if (total > 0) postMark(TOURNAMENT_BOARD, total, null, (s) => (this.online = `Your total · ${s}`));
    } else if (me?.status === 'ok') postMark(this.ev, me.mark, run, (s) => (this.online = s));
    this.myPts = this.rows.find((r) => r.isPlayer)?.pts ?? 0;
    this.myPlace = this.table.findIndex((t) => t.isPlayer) + 1;
    const next = tournament.nextEvent;
    this.buttons = this.final
      ? [
          new Button({ label: 'New tournament', color: '#2bb673', onTap: () => flow.tournament(this.game) }),
          new Button({ label: '🌐 Online', color: 'rgba(255,255,255,0.18)', onTap: () => flow.leaderboard(this.game, TOURNAMENT_BOARD) }),
          new Button({ label: 'Menu', color: 'rgba(255,255,255,0.18)', onTap: () => flow.menu(this.game) }),
        ]
      : [
          new Button({ label: `Next: ${next.name}  ›`, color: '#2bb673', onTap: () => this.goNext() }),
          new Button({ label: 'Quit', color: 'rgba(255,255,255,0.18)', onTap: () => flow.menu(this.game) }),
        ];
    this.layout(this.game.view);
  }

  goNext() {
    tournament.advance();
    flow.intro(this.game, tournament.event);
  }

  onResize(view) {
    this.layout(view);
  }

  layout(view) {
    const gap = 14;
    this.buttons.forEach((b, i) => (b.w = i === 0 ? 280 : 170));
    let x = view.w / 2 - (this.buttons.reduce((s, b) => s + b.w, 0) + gap * (this.buttons.length - 1)) / 2;
    for (const b of this.buttons) {
      Object.assign(b, { x, y: view.h - 72 - view.safe.b, h: 56 });
      x += b.w + gap;
    }
  }

  update(dt, t) {
    this.age += dt;
    for (const e of this.game.input.consume(t + dt)) {
      if (this.age < 0.6) continue; // don't let frantic event taps hit a button
      if (e.type === 'down') this.buttons.some((b) => b.tap(e.x, e.y));
      else if (e.code === 'Space' || e.code === 'Enter') this.buttons[0].onTap();
      else if (e.code === 'Escape') flow.menu(this.game);
    }
    this.buttons.forEach((b) => b.update(dt));
  }

  render(ctx, view) {
    ctx.fillStyle = '#12203a';
    ctx.fillRect(0, 0, view.w, view.h);
    const n = tournament.history.length;
    const cx = view.w / 2;
    if (this.final) {
      const champ = this.table[0];
      const flash = 0.7 + 0.3 * Math.sin(this.age * 6);
      text(ctx, 'TOURNAMENT CHAMPION', cx, 34, { size: 18, color: 'rgba(255,255,255,0.7)' });
      text(ctx, `🏆 ${champ.name}`, cx, 76, { size: 44, color: champ.isPlayer ? `rgba(255,180,0,${flash})` : '#fff', shadow: true });
      const me = this.table.find((t) => t.isPlayer);
      const line = champ.isPlayer
        ? `You win with ${me.total} points!${tournament.newBest ? ' New best score!' : ''}`
        : `You finished ${ordinal(this.myPlace)} with ${me.total} points${tournament.newBest ? ' · new best score!' : ''}`;
      text(ctx, line, cx, 114, { size: 18, weight: 600, color: champ.isPlayer ? '#ffd35c' : 'rgba(255,255,255,0.85)' });
    } else {
      text(ctx, `TOURNAMENT · EVENT ${n} OF ${ORDER.length}`, cx, 34, { size: 18, color: 'rgba(255,255,255,0.7)' });
      text(ctx, this.ev.name.toUpperCase(), cx, 72, { size: 40, color: '#ffb400', shadow: true });
      text(ctx, `+${this.myPts} points · ${ordinal(this.myPlace)} overall`, cx, 110, { size: 20, weight: 600 });
    }

    const top = 136;
    const bottom = view.h - 86 - view.safe.b;
    const colW = Math.min(420, (view.w - 60) / 2);
    const lx = cx - colW - 10;
    const rx = cx + 10;
    const rowH = Math.min(44, (bottom - top - 64) / 6); // leaves room for the online line

    // Left: this event (or, at the end, points per event).
    this.panel(ctx, lx, top, colW, bottom - top, this.final ? 'POINTS PER EVENT' : 'THIS EVENT');
    if (this.final) {
      const me = this.table.find((t) => t.isPlayer);
      tournament.history.forEach(({ ev, rows }, i) => {
        const r = rows.find((k) => k.isPlayer);
        const y = top + 50 + i * rowH;
        text(ctx, ev.name, lx + 18, y, { size: 17, align: 'left', weight: 600 });
        text(ctx, r.status === 'ok' ? formatMark(ev, r.mark) : r.status.toUpperCase(), lx + colW - 110, y, { size: 16, align: 'right', weight: 500, color: 'rgba(255,255,255,0.75)' });
        text(ctx, String(r.pts), lx + colW - 18, y, { size: 18, align: 'right' });
      });
      const y = top + 50 + tournament.history.length * rowH;
      text(ctx, 'Total', lx + 18, y, { size: 18, align: 'left', weight: 800, color: '#ffd35c' });
      text(ctx, String(me.total), lx + colW - 18, y, { size: 20, align: 'right', color: '#ffd35c' });
    } else {
      const sorted = [...this.rows].sort((a, b) => b.pts - a.pts);
      sorted.forEach((r, i) => {
        const y = top + 50 + i * rowH;
        this.rowBg(ctx, r, lx, y, colW, rowH);
        this.nameCell(ctx, r, lx, y, i);
        text(ctx, r.status === 'ok' ? formatMark(this.ev, r.mark) : r.status.toUpperCase(), lx + colW - 100, y, { size: 16, align: 'right', weight: 500, color: 'rgba(255,255,255,0.75)' });
        text(ctx, `+${r.pts}`, lx + colW - 16, y, { size: 18, align: 'right' });
      });
    }

    if (this.online) text(ctx, this.online, lx + colW / 2, bottom - 16, { size: 13, weight: 500, color: 'rgba(255,255,255,0.65)', maxWidth: colW - 24 });

    // Right: overall standings.
    this.panel(ctx, rx, top, colW, bottom - top, this.final ? 'FINAL STANDINGS' : `OVERALL AFTER ${n} OF ${ORDER.length}`);
    this.table.forEach((t, i) => {
      const y = top + 50 + i * rowH;
      this.rowBg(ctx, t, rx, y, colW, rowH);
      this.nameCell(ctx, t, rx, y, i);
      text(ctx, String(t.total), rx + colW - 16, y, { size: 19, align: 'right' });
    });

    this.buttons.forEach((b) => b.draw(ctx));
  }

  panel(ctx, x, y, w, h, title) {
    roundRect(ctx, x, y, w, h, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    text(ctx, title, x + w / 2, y + 22, { size: 14, weight: 700, color: 'rgba(255,255,255,0.6)' });
  }

  rowBg(ctx, r, x, y, w, h) {
    if (!r.isPlayer) return;
    roundRect(ctx, x + 6, y - h / 2 + 2, w - 12, h - 4, 10);
    ctx.fillStyle = 'rgba(255,180,0,0.18)';
    ctx.fill();
  }

  nameCell(ctx, r, x, y, i) {
    text(ctx, String(i + 1), x + 24, y, { size: 18 });
    ctx.fillStyle = r.colors.shirt;
    ctx.fillRect(x + 42, y - 9, 6, 18);
    text(ctx, r.name, x + 56, y, { size: 18, align: 'left', weight: r.isPlayer ? 800 : 600 });
  }
}
