import { Button, PAL } from '../core/ui.js';
import { formatMark, eventById, SURVIVAL_BOARD } from '../events/registry.js';
import { submitBest, saveGhostIfBetter, getBest } from '../core/storage.js';
import { postMark } from '../online/post.js';
import { counts, recordTopMark } from '../online/bests.js';
import { ResultsPanel } from '../brawl/aftermath.js';
import { flow } from '../flow.js';
import { survival } from './survival.js';

/**
 * Between survival events, over the event's late hits (the backdrop): you and
 * your rival, each mark and the points it scored, in the top right corner
 * (brawl/aftermath.js ResultsPanel).
 *
 * Still in: Next (the next event, or the next round after the fifth) and Quit.
 * Out: Game over › turns the page to how the run went (rounds survived, events
 * won, your total, your best), with Try again and Menu. Your total goes on the
 * Survival leaderboard when the run ends (not when you quit).
 */
export class SurvivalScene {
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
    // Personal bests, ghosts and the event's online board still count.
    this.online = null;
    const run = this.stats?.run ?? null;
    if (run && counts()) saveGhostIfBetter(this.ev, run);
    if (me?.status === 'ok') {
      if (counts()) submitBest(this.ev.id, me.mark, this.ev.lowerIsBetter);
      recordTopMark(this.ev, me.mark, false);
      postMark(this.ev, me.mark, run, () => {});
    }
    this.entry = survival.record(this.ev, this.results);
    this.over = survival.over;
    this.page = 'event';
    this.newBest = false;
    if (this.over) this.finishRun();

    const next = !this.over && survival.nextEventId ? eventById(survival.nextEventId) : null;
    this.main = new Button({
      label: this.over ? 'Game over ›' : next ? `Next: ${next.name}` : `Round ${survival.round + 1} ›`,
      icon: next?.id ?? null,
      color: this.over ? PAL.survival : PAL.liveGreen,
      lip: this.over ? PAL.survivalShade : PAL.liveShade,
      onTap: () => (this.over ? this.showSummary() : this.goNext()),
    });
    this.other = new Button({ label: 'Quit', color: PAL.ink, lip: PAL.inkShade, onTap: () => flow.menu(this.game) });
    this.buttons = [this.main, this.other];
    this.panel = new ResultsPanel(this.buttons, () => this.title(), () => this.rows());
    this.panel.layout(this.game.view);
  }

  /** The run's over: your total goes up as your best and on the Survival board. */
  finishRun() {
    const total = survival.total;
    if (total <= 0) return;
    this.newBest = counts() && submitBest(SURVIVAL_BOARD.id, total, false);
    recordTopMark(SURVIVAL_BOARD, total, false);
    postMark(SURVIVAL_BOARD, total, null, (s) => (this.online = s));
  }

  exit() {
    this.backdrop?.leave();
  }

  goNext() {
    survival.advance();
    flow.intro(this.game, eventById(survival.eventId));
  }

  /** From the event to how the run went: Try again and Menu. */
  showSummary() {
    if (this.page === 'summary') return;
    this.page = 'summary';
    Object.assign(this.main, { label: 'Try again', icon: null, color: PAL.liveGreen, lip: PAL.liveShade, onTap: () => flow.survival(this.game) });
    Object.assign(this.other, { label: 'Menu', onTap: () => flow.menu(this.game) });
    this.panel.age = 0; // fades in again
  }

  title() {
    if (this.page === 'summary') return `GAME OVER · ${survival.total} PTS`;
    const ev = this.ev.name.toUpperCase();
    return this.over ? `OUT IN ROUND ${survival.round} · ${ev}` : `ROUND ${survival.round} · ${ev} · ${survival.total} PTS`;
  }

  rows() {
    if (this.page === 'summary') {
      const best = getBest(SURVIVAL_BOARD.id);
      const rows = [
        { name: 'Rounds survived', value: String(survival.roundsSurvived) },
        { name: 'Events won', value: String(survival.won) },
        { name: 'Total', value: `${survival.total} pts`, isPlayer: true },
        { name: this.newBest ? 'New best!' : 'Your best', value: best == null ? '—' : `${best} pts` },
      ];
      if (this.online) rows.push({ name: this.online, value: '' });
      return rows.map((r) => ({ place: '', colors: null, ...r }));
    }
    // You and him, in finishing order: each mark and the points it scored.
    const { me, him, pts, hisPts } = this.entry;
    return this.results
      .filter((r) => r === me || r === him)
      .map((r, i) => ({
        place: r.status === 'ok' ? String(i + 1) : '–',
        name: r.name,
        colors: r.colors,
        value: `${r.status === 'ok' ? formatMark(this.ev, r.mark) : r.status.toUpperCase()} · +${r === me ? pts : hisPts}`,
        isPlayer: r.isPlayer,
      }));
  }

  onResize(view) {
    this.panel.layout(view);
    this.backdrop?.after?.layout(view);
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
      else if (e.code === 'Space' || e.code === 'Enter') this.main.onTap();
      else if (e.code === 'Escape') flow.menu(this.game);
      if (this.game.scene !== this) return; // a button took us on
    }
    this.buttons.forEach((b) => b.update(dt));
    this.panel.update(dt);
    bd?.lateUpdate(dt, t);
  }

  render(ctx, view) {
    if (this.backdrop) this.backdrop.lateRender(ctx, view);
    else {
      ctx.fillStyle = PAL.ink;
      ctx.fillRect(0, 0, view.w, view.h);
    }
    this.panel.draw(ctx, view);
    this.backdrop?.after?.drawControls(ctx, view);
  }
}
