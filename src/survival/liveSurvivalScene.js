import { Button, text, slab, chamfer, titlePlate, PAL } from '../core/ui.js';
import { ordinal } from '../core/math.js';
import { formatMark, eventById } from '../events/registry.js';
import { submitBest, saveGhostIfBetter } from '../core/storage.js';
import { theirAthlete } from '../athletes/roster.js';
import { postMark } from '../online/post.js';
import { counts, recordTopMark } from '../online/bests.js';
import { serverNow } from '../online/live.js';
import { SURVIVAL_KIND } from '../online/liveRules.js';
import { ResultsPanel } from '../brawl/aftermath.js';
import { colosseum } from '../render/posterScenery.js';
import { flow } from '../flow.js';
import { liveSurvival } from './liveSurvival.js';

const TITLE_CARD = 7000; // ms before the next event starts that its title card comes up (as a live tournament's)
const OUT_HOLD = 9000; // ms you're shown you're out, over the late hits, before the standings take over

/**
 * Between live survival events, over the event's late hits (the backdrop):
 * everyone who was still in, their marks, and who's out (survival/liveSurvival.js).
 * Nobody taps: it waits for everyone's results, says who's out, and the next
 * event comes up by itself (a countdown on the button, as a live tournament's).
 *
 * Out: "You're out" and where you finished, then the standings
 * (LiveSurvivalBoard) to watch the rest until there's a winner.
 * Last one standing: you win, with Play again and Menu.
 */
export class LiveSurvivalScene {
  constructor(ev, results, stats = null, backdrop = null) {
    this.ev = ev;
    this.results = results;
    this.stats = stats;
    this.backdrop = backdrop;
    this.wantsReleases = !!backdrop; // the late hits' stick is held
  }

  enter() {
    this.age = 0;
    this.live = liveSurvival.live;
    // Personal bests, ghosts and the event's online board still count.
    const me = this.results.find((r) => r.isPlayer);
    const run = this.stats?.run ?? null;
    if (run && counts()) saveGhostIfBetter(this.ev, run);
    if (me?.status === 'ok') {
      if (counts()) submitBest(this.ev.id, me.mark, this.ev.lowerIsBetter);
      recordTopMark(this.ev, me.mark, true);
      postMark(this.ev, me.mark, run, () => {});
    }
    this.field = liveSurvival.standing; // who was in this one
    this.entry = null;
    this.main = new Button({ label: 'Waiting…', color: PAL.ink2, lip: PAL.inkShade, onTap: () => this.tapMain() });
    this.other = new Button({ label: 'Leave', color: PAL.ink, lip: PAL.inkShade, onTap: () => flow.menu(this.game) });
    this.buttons = [this.main, this.other];
    this.panel = new ResultsPanel(this.buttons, () => this.title(), () => this.rows());
    this.panel.layout(this.game.view);
  }

  exit() {
    this.backdrop?.leave();
  }

  /** Everyone's results are in: who's out, and what next. */
  settled(entry) {
    this.entry = entry;
    this.decidedAt = serverNow();
    this.panel.age = 0; // fades in again
    const s = liveSurvival;
    if (s.over || !s.meIn) {
      this.live.done = true; // you've played your part: leaving now isn't leaving early
      s.bankPoints();
      if (s.over && s.winner === s.uid) {
        Object.assign(this.main, { label: 'Play again', color: PAL.liveGreen, lip: PAL.liveShade });
        this.other.label = 'Menu';
      } else Object.assign(this.main, { label: 'Standings ›', color: PAL.survival, lip: PAL.survivalShade });
      return;
    }
    // Still in: ready for the next one, which starts once everyone still in is.
    this.next = eventById(s.eventId);
    this.nextStage = this.live.eventStage(this.next.id, s.step);
    this.live.ready(this.nextStage);
    Object.assign(this.main, { icon: this.next.id, color: PAL.liveGreen, lip: PAL.liveShade });
  }

  tapMain() {
    const s = liveSurvival;
    if (!this.entry) return;
    if (s.over && s.winner === s.uid) return flow.live(this.game, SURVIVAL_KIND, this.live.squad);
    if (s.over || !s.meIn) return this.watch();
  }

  /** Out (or someone else won): the standings, until there's a winner. */
  watch() {
    this.game.setScene(new LiveSurvivalBoard());
  }

  goNext() {
    this.live.step = liveSurvival.step; // the room's stages for the next event
    flow.intro(this.game, this.next);
  }

  title() {
    const s = liveSurvival;
    const ev = this.ev.name.toUpperCase();
    if (!this.entry) return `${ev} · ${this.field.length} IN`;
    if (s.over && s.winner === s.uid) return 'YOU WIN! · LAST ONE STANDING';
    if (s.over) return `${s.players.get(s.winner)?.name.toUpperCase() ?? 'NOBODY'} WINS`;
    if (!s.meIn) return `YOU’RE OUT · ${ordinal(s.placeOf(s.uid)).toUpperCase()} OF ${s.players.size}`;
    if (this.entry.void) return `${ev} · ALL TIED · NOBODY OUT`;
    return `${ev} · ${s.alive.size} LEFT`;
  }

  /** Everyone who was in, best first: each mark, and OUT by the ones going. Before it's settled, as the results come in. */
  rows() {
    const colors = (p) => theirAthlete(p, this.ev.id).colors;
    if (this.entry) {
      return this.entry.rows.map((r) => ({
        place: r.left ? '–' : String(r.place ?? ''),
        name: r.name,
        colors: colors(r),
        value: `${r.left ? 'LEFT' : r.status === 'ok' ? formatMark(this.ev, r.mark) : r.status.toUpperCase()}${r.out ? ' · OUT' : ''}`,
        isPlayer: r.me,
        gold: !r.me,
        out: r.out,
      }));
    }
    const s = liveSurvival;
    const rows = this.field.map((p) => ({ p, r: s.resultOf(p.uid) }));
    const lower = this.ev.lowerIsBetter;
    const key = (x) => (!x.r ? 2e6 : x.r.status !== 'ok' ? 1e6 : lower ? x.r.mark : -x.r.mark);
    rows.sort((a, b) => key(a) - key(b));
    return rows.map(({ p, r }) => ({
      place: '',
      name: p.name,
      colors: colors(p),
      value: !r ? (s.gone.has(p.uid) ? 'LEFT' : '…') : r.status === 'ok' ? formatMark(this.ev, r.mark) : r.status.toUpperCase(),
      isPlayer: p.me,
      gold: !p.me,
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
    if (!this.entry) {
      const entry = liveSurvival.decide(serverNow());
      if (entry) this.settled(entry);
      else {
        const names = liveSurvival.pending().filter((p) => !p.me).map((p) => p.name);
        this.main.label = names.length ? `Waiting for ${names.length > 2 ? `${names.length} players` : names.join(', ')}…` : 'Waiting…';
      }
    } else if (this.next) this.countDown();
    else if (!liveSurvival.over && serverNow() - this.decidedAt > OUT_HOLD) return this.watch();
    this.buttons.forEach((b) => b.update(dt));
    this.panel.update(dt);
    bd?.lateUpdate(dt, t);
  }

  /** Still in: the button counts down to the next event, which comes up by itself. */
  countDown() {
    const start = this.live.startOf(this.nextStage);
    if (start == null) {
      const names = this.live.waitingFor(this.nextStage).map((p) => p.name);
      this.main.label = `Waiting for ${names.length > 2 ? `${names.length} players` : names.join(', ') || 'the others'}…`;
      return;
    }
    this.main.label = `${this.next.name} in ${Math.max(1, Math.ceil((start - serverNow()) / 1000))}`;
    if (serverNow() >= start - TITLE_CARD) this.goNext();
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

/**
 * Out of live survival (or it's over): everyone in the room and how they
 * stand, live, until there's a winner: the ones still in, the event they're
 * on and their marks as they come in, and the ones out, best place first.
 * Then the winner, with Play again and Menu.
 */
export class LiveSurvivalBoard {
  enter() {
    this.age = 0;
    this.live = liveSurvival.live;
    this.live.done = true;
    this.again = new Button({ label: 'Play again', color: PAL.liveGreen, lip: PAL.liveShade, w: 230, h: 54, onTap: () => flow.live(this.game, SURVIVAL_KIND, this.live.squad) });
    this.menu = new Button({ label: 'Menu', icon: 'back', color: PAL.ink2, lip: PAL.inkShade, w: 160, h: 54, onTap: () => flow.menu(this.game) });
  }

  get buttons() {
    return liveSurvival.over ? [this.again, this.menu] : [this.menu];
  }

  update(dt, t) {
    this.age += dt;
    liveSurvival.catchUp(serverNow());
    for (const e of this.game.input.consume(t + dt)) {
      if (e.type === 'down') this.buttons.some((b) => b.tap(e.x, e.y));
      else if (e.code === 'Escape') flow.menu(this.game);
      if (this.game.scene !== this) return;
    }
    this.buttons.forEach((b) => b.update(dt));
  }

  /** Everyone: the ones still in (with this event's mark so far), then the ones out, best place first. */
  rows() {
    const s = liveSurvival;
    const ev = s.over ? null : eventById(s.eventId);
    const rows = [];
    for (const p of s.standing) {
      const r = ev && s.resultOf(p.uid);
      const won = s.over && s.winner === p.uid;
      rows.push({ p, place: won ? '1' : '', note: won ? 'WINNER' : !r ? (s.gone.has(p.uid) ? 'left' : '…') : r.status === 'ok' ? formatMark(ev, r.mark) : r.status.toUpperCase(), in: true });
    }
    for (const o of [...s.out].sort((a, b) => a.place - b.place)) {
      const p = s.players.get(o.uid);
      const at = eventById(s.history.find((h) => h.step === o.step)?.evId);
      rows.push({ p, place: String(o.place), note: o.left ? `left · event ${o.step + 1}` : `out · event ${o.step + 1}${at ? ` · ${at.name}` : ''}`, in: false });
    }
    return rows;
  }

  render(ctx, view) {
    colosseum(ctx, 0, 0, view.w, view.h, { trackH: 120 });
    const s = liveSurvival;
    const winner = s.over ? s.players.get(s.winner) : null;
    const head = s.over ? (winner ? (winner.me ? 'YOU WIN!' : `${winner.name.toUpperCase()} WINS`) : 'NOBODY LEFT') : `LIVE SURVIVAL · ${s.alive.size} LEFT`;
    const ev = s.over ? null : eventById(s.eventId);
    titlePlate(ctx, view, head, ev ? `Now: ${ev.name} · event ${s.step + 1}` : 'Last one standing', { face: PAL.survival, ink: PAL.cream });
    const rows = this.rows();
    const w = Math.min(560, view.w - 40);
    const x0 = view.w / 2 - w / 2;
    const top = 92;
    const bottom = view.h - 84 - view.safe.b;
    const rowH = Math.min(36, (bottom - top - 16) / Math.max(1, rows.length));
    slab(ctx, x0, top, w, rows.length * rowH + 16, { face: PAL.cream, lip: PAL.creamShade, lipH: 6, c: 8 });
    rows.forEach((r, i) => {
      const y = top + 8 + i * rowH + rowH / 2;
      const me = r.p?.me;
      ctx.fillStyle = me ? PAL.gold : i % 2 ? PAL.cream : '#EFE2C3';
      chamfer(ctx, x0 + 8, y - rowH / 2 + 1, w - 16, rowH - 2, 3);
      ctx.fill();
      const size = Math.round(rowH * 0.56);
      text(ctx, r.place, x0 + 30, y + 1, { size: size + 2, font: 'display', color: PAL.ink });
      ctx.fillStyle = theirAthlete(r.p, ev?.id ?? 'sprint100').colors.shirt;
      ctx.fillRect(x0 + 48, y - size * 0.45, 6, size * 0.9);
      const ink = r.in ? PAL.ink : 'rgba(38,34,79,0.5)';
      text(ctx, me ? `${r.p.name} (you)` : r.p?.name ?? '?', x0 + 64, y + 1, { size, font: 'body', align: 'left', weight: me ? 800 : 700, color: ink, maxWidth: w * 0.5 });
      text(ctx, r.note, x0 + w - 22, y + 1, { size: size - 1, font: 'body', align: 'right', weight: 800, color: r.in ? (r.note === 'WINNER' ? PAL.liveShade : PAL.ink) : PAL.survival });
    });
    const bs = this.buttons;
    const gap = 14;
    let x = view.w / 2 - (bs.reduce((a, b) => a + b.w, 0) + gap * (bs.length - 1)) / 2;
    for (const b of bs) {
      Object.assign(b, { x, y: view.h - 70 - view.safe.b });
      x += b.w + gap;
      b.draw(ctx);
    }
  }
}
