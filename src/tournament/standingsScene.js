import { Button, text, slab, chamfer, PAL, FONT_DISPLAY } from '../core/ui.js';
import { drawIcon } from '../core/icons.js';
import { ordinal } from '../core/math.js';
import { formatMark } from '../events/registry.js';
import { submitBest, saveGhostIfBetter, getCampaign, markBeaten } from '../core/storage.js';
import { postMark } from '../online/post.js';
import { counts, recordTopMark } from '../online/bests.js';
import { tournament, ORDER, TOURNAMENT_KIND } from './tournament.js';
import { flow } from '../flow.js';
import { serverNow } from '../online/live.js';
import { ResultsPanel } from '../brawl/aftermath.js';

const TITLE_CARD = 7000; // ms before a live tournament's next event starts that its title card comes up (online/live.js EVENT_LEAD: standings, then 3 s of title, then the 4 s on the track)

/**
 * Between tournament events: this event's results with the points each mark
 * scored (left) and the running totals (right). After the last event: the
 * final standings and the champion.
 *
 * In a live tournament nobody taps Next: you're ready for the next event as
 * soon as you get here, and it comes up by itself once everyone is (a
 * countdown on the button; see online/live.js startOf).
 *
 * With a `backdrop` (the event scene, carrying on with its late hits) it's
 * just the standings in the middle over the event, with Next (or New
 * tournament) and Quit (or Menu) under them (brawl/aftermath.js ResultsPanel).
 */
export class StandingsScene {
  constructor(ev, results, stats = null, backdrop = null) {
    this.ev = ev;
    this.results = results;
    this.stats = stats;
    this.backdrop = backdrop;
    this.wantsReleases = !!backdrop; // the late hits' stick is held
  }

  enter() {
    this.age = 0;
    const me = this.results.find((r) => r.isPlayer);
    // Personal bests, ghosts and online marks still count in a tournament.
    this.online = null; // one line about the online leaderboard
    const run = this.stats?.run ?? null;
    if (run && counts()) saveGhostIfBetter(this.ev, run);
    if (me?.status === 'ok' && counts()) submitBest(this.ev.id, me.mark, this.ev.lowerIsBetter);
    if (me?.status === 'ok') recordTopMark(this.ev, me.mark, !!tournament.live);
    this.rows = tournament.record(this.ev, this.results, run);
    this.table = tournament.standings();
    this.final = tournament.finished;
    if (this.final && tournament.live) tournament.live.done = true; // played to the end: leaving now isn't leaving early
    if (this.final) {
      // The total goes on the tournament board. This event's mark goes on its own
      // board too, but the status line is about the total.
      if (me?.status === 'ok') postMark(this.ev, me.mark, run, () => {});
      const total = this.table.find((t) => t.isPlayer)?.total;
      if (total > 0) postMark(tournament.board, total, null, (s) => (this.online = `Your total · ${s}`));
    } else if (me?.status === 'ok') postMark(this.ev, me.mark, run, (s) => (this.online = s));
    this.myPts = this.rows.find((r) => r.isPlayer)?.pts ?? 0;
    this.myPlace = this.table.findIndex((t) => t.isPlayer) + 1;
    // Champion of a campaign tournament: ticked off.
    this.campaignWin = this.final && !tournament.live && this.myPlace === 1 && !!getCampaign();
    if (this.campaignWin) markBeaten(getCampaign(), 'tournament');
    // How you stand against your best recorded tournament after as many events.
    const best = this.final ? null : tournament.bestAfter(tournament.history.length);
    const mine = this.table.find((t) => t.isPlayer)?.total ?? 0;
    this.vsBest = best == null ? null : mine - best;
    const next = tournament.nextEvent;
    this.live = !this.final ? tournament.live : null;
    if (this.live) {
      this.nextStage = this.live.eventStage(next.id, tournament.index + 1);
      this.live.ready(this.nextStage);
    }
    this.buttons = this.final
      ? [
          tournament.live
            ? new Button({ label: 'Play live again', color: PAL.liveGreen, lip: PAL.liveShade, onTap: () => flow.live(this.game, TOURNAMENT_KIND, tournament.live.squad) })
            : new Button({ label: 'New tournament', icon: 'tournament', color: PAL.liveGreen, lip: PAL.liveShade, onTap: () => flow.tournament(this.game) }),
          new Button({ label: 'Leaderboard', icon: 'leaderboard', color: PAL.ink2, lip: PAL.inkShade, onTap: () => flow.leaderboard(this.game, tournament.board) }),
          new Button({ label: 'Menu', icon: 'back', color: PAL.ink2, lip: PAL.inkShade, onTap: () => flow.menu(this.game, tournament.live?.squad ? 'squad' : 'play') }),
        ]
      : [
          new Button({ label: `Next: ${next.name}`, icon: next.id, color: PAL.liveGreen, lip: PAL.liveShade, onTap: () => !this.live && this.goNext() }),
          new Button({ label: 'Quit', color: PAL.ink2, lip: PAL.inkShade, onTap: () => flow.menu(this.game) }),
        ];
    if (this.backdrop) {
      // Over the late hits: just the standings and the two buttons.
      this.buttons = [this.buttons[0], this.buttons[this.buttons.length - 1]];
      this.panel = new ResultsPanel(
        this.buttons,
        () => (this.final ? `${this.table[0].name.toUpperCase()} WINS · ${this.campaignWin ? `${getCampaign().toUpperCase()} TOURNAMENT BEATEN!` : 'FINAL STANDINGS'}` : `OVERALL AFTER ${tournament.history.length} OF ${ORDER.length} · ${this.ev.name.toUpperCase()}`),
        () =>
          this.table.map((t, i) => {
            const pts = this.rows.find((r) => (r.isPlayer ? 'you' : r.key ?? r.name) === t.key)?.pts;
            return {
              place: String(i + 1),
              name: t.name,
              colors: t.colors,
              value: this.final || pts == null ? String(t.total) : `+${pts} · ${t.total}`,
              isPlayer: t.isPlayer,
              gold: t.live,
            };
          }),
      );
      this.panel.layout(this.game.view);
    } else {
      this.panel = null;
      this.layout(this.game.view);
    }
  }

  exit() {
    this.backdrop?.leave();
  }

  goNext() {
    tournament.advance();
    flow.intro(this.game, tournament.event);
  }

  onResize(view) {
    if (this.panel) this.panel.layout(view);
    else this.layout(view);
    this.backdrop?.after?.layout(view);
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
    const bd = this.backdrop;
    for (const e of this.game.input.consume(t + dt)) {
      const onButton = e.type === 'down' && this.buttons.some((b) => b.hit(e.x, e.y));
      // Over the late hits, everything but the buttons (and Enter / Space / Escape) is for your controls.
      if (bd && !onButton && bd.after?.handle(e)) continue;
      if (this.age < 0.6 && e.type !== 'up' && e.type !== 'keyup') continue; // don't let frantic event taps hit a button
      if (e.type === 'down') this.buttons.some((b) => b.tap(e.x, e.y));
      else if (e.code === 'Space' || e.code === 'Enter') this.buttons[0].onTap();
      else if (e.code === 'Escape') flow.menu(this.game);
    }
    if (this.game.scene !== this) return; // a button took us on
    this.buttons.forEach((b) => b.update(dt));
    this.panel?.update(dt);
    bd?.lateUpdate(dt, t);
    if (this.live) this.countDown();
  }

  /** Live: the Next button counts down to the next event, which comes up by itself. */
  countDown() {
    const start = this.live.startOf(this.nextStage);
    const next = tournament.nextEvent;
    if (start == null) {
      const names = this.live.waitingFor(this.nextStage).map((p) => p.name);
      this.buttons[0].label = `Waiting for ${names.join(', ') || 'the others'}…`;
      return;
    }
    this.buttons[0].label = `${next.name} in ${Math.max(1, Math.ceil((start - serverNow()) / 1000))}`;
    if (serverNow() >= start - TITLE_CARD) this.goNext();
  }

  render(ctx, view) {
    if (this.backdrop) {
      this.backdrop.lateRender(ctx, view);
      this.panel.draw(ctx, view);
      this.backdrop.after?.drawControls(ctx, view);
      return;
    }
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(0, 0, view.w, view.h);
    const n = tournament.history.length;
    const cx = view.w / 2;
    const CREAM = (a) => `rgba(245,234,208,${a})`;
    if (this.final) {
      const champ = this.table[0];
      const flash = 0.7 + 0.3 * Math.sin(this.age * 6);
      text(ctx, 'TOURNAMENT CHAMPION', cx, 30, { size: 22, font: 'display', track: 2, color: CREAM(0.75) });
      const name = champ.name.toUpperCase();
      ctx.font = `900 48px ${FONT_DISPLAY}`;
      const nw = Math.min(view.w - 120, ctx.measureText(name).width);
      const col = champ.isPlayer ? `rgba(242,182,50,${flash})` : PAL.cream;
      drawIcon(ctx, 'tournament', cx - nw / 2 - 28, 74, 44, PAL.gold);
      text(ctx, name, cx + 22, 76, { size: 48, font: 'display', track: 2, color: col, maxWidth: view.w - 140 });
      const me = this.table.find((t) => t.isPlayer);
      const line = champ.isPlayer
        ? `You win with ${me.total} points!${this.campaignWin ? ` ${getCampaign() === 'pro' ? 'Pro' : 'Amateur'} tournament beaten!` : ''}${tournament.newBest ? ' New best score!' : ''}`
        : `You finished ${ordinal(this.myPlace)} with ${me.total} points${tournament.newBest ? ' · new best score!' : ''}`;
      text(ctx, line, cx, 114, { size: 20, font: 'body', weight: 700, color: champ.isPlayer ? PAL.gold : CREAM(0.85), maxWidth: view.w - 40 });
    } else {
      text(ctx, `TOURNAMENT · EVENT ${n} OF ${ORDER.length}`, cx, 30, { size: 20, font: 'display', track: 2, color: CREAM(0.75) });
      text(ctx, this.ev.name.toUpperCase(), cx, 72, { size: 48, font: 'display', track: 2, color: PAL.gold });
      const vs = this.vsBest == null ? '' : this.vsBest >= 0 ? ` · ${this.vsBest} ahead of your best` : ` · ${-this.vsBest} behind your best`;
      text(ctx, `+${this.myPts} points · ${ordinal(this.myPlace)} overall${vs}`, cx, 110, { size: 21, font: 'body', weight: 700, color: PAL.cream, maxWidth: view.w - 40 });
    }

    const top = 136;
    const bottom = view.h - 86 - view.safe.b;
    const colW = Math.min(420, (view.w - 60) / 2);
    const lx = cx - colW - 10;
    const rx = cx + 10;
    const rowH = Math.min(44, (bottom - top - 78) / 6); // leaves room for the online line

    // Left: this event (or, at the end, points per event).
    this.drawPanel(ctx, lx, top, colW, bottom - top, this.final ? 'POINTS PER EVENT' : 'THIS EVENT', rowH);
    if (this.final) {
      const me = this.table.find((t) => t.isPlayer);
      tournament.history.forEach(({ ev, rows }, i) => {
        const r = rows.find((k) => k.isPlayer);
        const y = top + 44 + rowH / 2 + i * rowH;
        drawIcon(ctx, ev.id, lx + 28, y, 24, PAL.ink);
        text(ctx, ev.name, lx + 48, y + 1, { size: 18, font: 'body', align: 'left', weight: 700, color: PAL.ink });
        text(ctx, r.status === 'ok' ? formatMark(ev, r.mark) : r.status.toUpperCase(), lx + colW - 110, y + 1, { size: 17, font: 'body', align: 'right', weight: 600, color: PAL.muted });
        text(ctx, String(r.pts), lx + colW - 18, y + 1, { size: 19, font: 'body', weight: 800, align: 'right', color: PAL.ink });
      });
      const y = top + 44 + rowH / 2 + tournament.history.length * rowH;
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(lx, y - rowH / 2, colW, rowH);
      text(ctx, 'TOTAL', lx + 18, y + 1, { size: 22, font: 'display', align: 'left', track: 1.5, color: PAL.ink });
      text(ctx, String(me.total), lx + colW - 18, y + 1, { size: 22, font: 'display', align: 'right', color: PAL.ink });
    } else {
      const sorted = [...this.rows].sort((a, b) => b.pts - a.pts);
      sorted.forEach((r, i) => {
        const y = top + 44 + rowH / 2 + i * rowH;
        this.rowBg(ctx, r, lx, y, colW, rowH);
        this.nameCell(ctx, r, lx, y, i);
        text(ctx, r.status === 'ok' ? formatMark(this.ev, r.mark) : r.status.toUpperCase(), lx + colW - 100, y + 1, { size: 17, font: 'body', align: 'right', weight: 600, color: PAL.muted });
        text(ctx, `+${r.pts}`, lx + colW - 16, y + 1, { size: 19, font: 'body', weight: 800, align: 'right', color: PAL.ink });
      });
    }

    if (this.online) text(ctx, this.online, lx + colW / 2, bottom - 15, { size: 15, font: 'body', weight: 600, color: PAL.muted, maxWidth: colW - 24 });

    // Right: overall standings.
    this.drawPanel(ctx, rx, top, colW, bottom - top, this.final ? 'FINAL STANDINGS' : `OVERALL AFTER ${n} OF ${ORDER.length}`, rowH);
    this.table.forEach((t, i) => {
      const y = top + 44 + rowH / 2 + i * rowH;
      this.rowBg(ctx, t, rx, y, colW, rowH);
      this.nameCell(ctx, t, rx, y, i);
      text(ctx, String(t.total), rx + colW - 16, y + 1, { size: 20, font: 'body', weight: 800, align: 'right', color: PAL.ink });
    });

    this.buttons.forEach((b) => b.draw(ctx));
  }

  /** A cream sheet with an ink title strip and zebra rows from `rowH`. */
  drawPanel(ctx, x, y, w, h, title, rowH) {
    slab(ctx, x, y, w, h, { face: PAL.cream, lip: PAL.creamShade, lipH: 5, c: 7 });
    ctx.fillStyle = PAL.ink2; // ink2: it stands off the ink behind
    chamfer(ctx, x, y, w, 40, 7);
    ctx.fill();
    ctx.fillRect(x, y + 20, w, 20);
    text(ctx, title, x + w / 2, y + 21, { size: 20, font: 'display', track: 1.5, color: PAL.cream, maxWidth: w - 20 });
    for (let i = 1; y + 44 + (i + 1) * rowH < y + h - 5; i += 2) {
      ctx.fillStyle = '#EFE2C3';
      ctx.fillRect(x, y + 44 + i * rowH, w, rowH);
    }
  }

  rowBg(ctx, r, x, y, w, h) {
    if (!r.isPlayer) return;
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(x, y - h / 2, w, h);
  }

  nameCell(ctx, r, x, y, i) {
    text(ctx, String(i + 1), x + 24, y + 1, { size: 22, font: 'display', color: PAL.ink });
    ctx.fillStyle = r.colors.shirt;
    ctx.fillRect(x + 42, y - 9, 6, 18);
    // The other people in a live tournament are named in orange (gold on the track).
    text(ctx, r.name, x + 56, y + 1, { size: 19, font: 'body', align: 'left', weight: r.isPlayer ? 800 : 700, color: !r.isPlayer && (r.live ?? !!r.key) ? PAL.orangeShade : PAL.ink });
  }
}
