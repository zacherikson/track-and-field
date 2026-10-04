import { Button, text, roundRect } from '../core/ui.js';
import { formatMark, eventById } from '../events/registry.js';
import { submitBest, saveGhostIfBetter } from '../core/storage.js';
import { postMark } from '../online/post.js';
import { counts, recordTopMark } from '../online/bests.js';
import { serverNow } from '../online/live.js';
import { LAYOUT } from '../render/track.js';
import { CONFIG } from '../config.js';
import { flow } from '../flow.js';
import { meet } from './meet.js';
import { formatPoints } from './scoring.js';
import { MEET_ORDER } from './rules.js';

const GOLD = '#ffb400';
const DIM = 'rgba(255,255,255,0.7)';

/**
 * Between a meet's events, over the event's late hits (the backdrop): this
 * event's places across every heat with the points they scored, and the
 * squads' totals. Your heat's results show at once; the overall places come
 * up as soon as the server has every heat's. Nobody taps on: the next event's
 * title card comes up by itself when the server says (CONFIG.meet).
 *
 * After the relay: the final standings, the winning squad, and Meet again.
 */
export class MeetStandingsScene {
  constructor(ev, results, stats = null, backdrop = null) {
    this.ev = ev;
    this.results = results; // your heat, as the event scene saw it
    this.stats = stats;
    this.backdrop = backdrop;
    this.wantsReleases = !!backdrop;
  }

  enter() {
    this.age = 0;
    this.index = meet.index;
    const me = this.results.find((r) => r.isPlayer);
    // Personal bests and the online boards still count in a meet (not the relay: a team's time).
    if (!this.ev.special && me?.status === 'ok') {
      const run = this.stats?.run ?? null;
      if (run && counts()) saveGhostIfBetter(this.ev, run);
      if (counts()) submitBest(this.ev.id, me.mark, this.ev.lowerIsBetter);
      recordTopMark(this.ev, me.mark, true);
      postMark(this.ev, me.mark, run, () => {});
    }
    const last = this.index + 1 >= MEET_ORDER.length;
    this.nextBtn = new Button({ label: '…', color: '#2bb673', onTap: () => {} }); // counts down: the next event comes by itself
    this.menuBtn = new Button({ label: 'Leave meet', color: 'rgba(18,32,58,0.92)', onTap: () => this.leave() });
    this.againBtn = new Button({ label: 'Meet again', color: '#2bb673', onTap: () => this.again() });
    this.last = last;
    this.layout(this.game.view);
  }

  exit() {
    this.backdrop?.leave();
  }

  leave() {
    flow.menu(this.game, 'squad');
  }

  again() {
    const s = meet.mySquad;
    if (!s) return this.leave();
    flow.meet(this.game, { key: s.key, name: s.name });
  }

  get buttons() {
    if (meet.final || (this.last && !meet.active)) return [this.againBtn, this.menuBtn];
    return [this.nextBtn, this.menuBtn];
  }

  onResize(view) {
    this.layout(view);
    this.backdrop?.after?.layout(view);
  }

  layout(view) {
    const s = view.safe;
    const by = view.h - s.b - 56;
    const mw = 250;
    const ow = 150;
    const bx = view.w / 2 - (mw + 12 + ow) / 2;
    for (const [main, other] of [
      [this.nextBtn, this.menuBtn],
      [this.againBtn, this.menuBtn],
    ]) {
      Object.assign(main, { x: bx, y: by, w: mw, h: 52, size: 20 });
      Object.assign(other, { x: bx + mw + 12, y: by, w: ow, h: 52, size: 19 });
    }
  }

  update(dt, t) {
    this.age += dt;
    const bd = this.backdrop;
    const btns = this.buttons;
    for (const e of this.game.input.consume(t + dt)) {
      const onButton = e.type === 'down' && btns.some((b) => b.hit(e.x, e.y));
      if (bd && !onButton && bd.after?.handle(e)) continue; // your late hits controls
      if (this.age < 0.6 && e.type !== 'up' && e.type !== 'keyup') continue;
      if (e.type === 'down') btns.some((b) => b.tap(e.x, e.y));
      else if (e.code === 'Escape') this.leave();
      if (this.game.scene !== this) return;
    }
    btns.forEach((b) => b.update(dt));
    bd?.lateUpdate(dt, t);
    if (meet.final || this.last) return;
    // The next event: its title card comes up by itself.
    const next = meet.events[this.index + 1];
    const name = eventById(MEET_ORDER[this.index + 1]).name;
    if (!next) {
      this.nextBtn.label = `Next: ${name}`;
      return;
    }
    const left = Math.max(1, Math.ceil((next.start - CONFIG.meet.titleCard * 1000 - serverNow()) / 1000));
    this.nextBtn.label = `${name} in ${left}`;
    if (serverNow() >= next.start - CONFIG.meet.titleCard * 1000) flow.meetEvent(this.game, this.index + 1);
  }

  render(ctx, view) {
    if (this.backdrop) this.backdrop.lateRender(ctx, view);
    else {
      ctx.fillStyle = '#12203a';
      ctx.fillRect(0, 0, view.w, view.h);
    }
    const s = view.safe;
    const room = Math.min(LAYOUT.farY, view.h - 80) - s.t - 14; // above the track, clear of the late hits
    const squadsW = Math.min(250, view.w * 0.28);
    const placesW = Math.min(500, view.w - squadsW - 40 - Math.max(s.l, s.r) * 2);
    const x0 = view.w / 2 - (placesW + squadsW + 12) / 2;
    this.drawPlaces(ctx, x0, s.t + 10, placesW, room);
    this.drawSquads(ctx, x0 + placesW + 12, s.t + 10, squadsW, room);
    this.buttons.forEach((b) => b.draw(ctx));
    if (this.backdrop) this.backdrop.after?.drawControls(ctx, view, false);
  }

  /** This event: the overall places once the server has them (else your heat), or the final standings. */
  drawPlaces(ctx, x, y, w, room) {
    const res = meet.results[this.index];
    const relay = this.ev.id === 'relay4x100';
    let title;
    let rows;
    if (res) {
      title = `${this.ev.name.toUpperCase()} · EVERY HEAT`;
      const ranked = res.ranked;
      const mine = ranked.findIndex((r) => (relay ? r.id === meet.me?.squad : r.id === meet.uid));
      const shown = ranked.slice(0, 8);
      if (mine >= 8) shown.push(ranked[mine]);
      rows = shown.map((r) => {
        const sq = relay ? meet.squads.get(r.id) : meet.squadOf(r.id);
        const who = relay ? sq?.name ?? r.id : meet.members.get(r.id)?.name ?? '?';
        return {
          place: r.place != null ? String(r.place) : '–',
          name: relay ? who : `${who}${r.heat != null ? ` · H${r.heat + 1}` : ''}`,
          color: sq?.color ?? '#fff',
          value: `${r.mark != null ? formatMark(this.ev, r.mark) : 'NM'}${r.pts ? `  +${formatPoints(r.pts)}` : ''}`,
          me: relay ? r.id === meet.me?.squad : r.id === meet.uid,
        };
      });
    } else {
      title = relay ? `${this.ev.name.toUpperCase()} · WAITING FOR EVERY TEAM` : `${this.ev.name.toUpperCase()} · YOUR HEAT`;
      rows = this.results.map((r, i) => ({
        place: r.status === 'ok' ? String(i + 1) : '–',
        name: r.name,
        color: r.colors?.shirt ?? '#fff',
        value: r.status === 'ok' ? formatMark(this.ev, r.mark) : r.status.toUpperCase(),
        me: r.isPlayer,
      }));
    }
    this.panel(ctx, x, y, w, room, title, rows);
  }

  /** The squads' totals so far (or final). */
  drawSquads(ctx, x, y, w, room) {
    const st = meet.final?.standings ?? meet.standings ?? [];
    const done = !!meet.final;
    const title = done ? `🏆 ${meet.squads.get(st[0]?.squad)?.name?.toUpperCase() ?? ''} WIN` : `SQUADS · AFTER ${meet.results.filter(Boolean).length} OF ${MEET_ORDER.length}`;
    const rows = st.map((r) => {
      const sq = meet.squads.get(r.squad);
      return { place: String(r.rank), name: sq?.name ?? r.squad, color: sq?.color ?? '#fff', value: formatPoints(r.total), me: r.squad === meet.me?.squad };
    });
    this.panel(ctx, x, y, w, room, title, rows, done);
  }

  panel(ctx, x, y, w, room, title, rows, gold = false) {
    const head = 30;
    const rowH = Math.max(20, Math.min(28, (room - head - 8) / Math.max(1, rows.length)));
    const h = head + rows.length * rowH + 8;
    roundRect(ctx, x, y, w, h, 12);
    ctx.fillStyle = 'rgba(12,22,44,0.72)';
    ctx.fill();
    if (gold) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = GOLD;
      ctx.stroke();
    }
    text(ctx, title, x + w / 2, y + 17, { size: 13, weight: 800, color: gold ? GOLD : 'rgba(255,255,255,0.9)', maxWidth: w - 16 });
    const size = Math.round(rowH * 0.56);
    rows.forEach((r, i) => {
      const ry = y + head + i * rowH + rowH / 2;
      if (r.me) {
        roundRect(ctx, x + 4, ry - rowH / 2 + 1, w - 8, rowH - 2, 7);
        ctx.fillStyle = 'rgba(255,180,0,0.25)';
        ctx.fill();
      }
      text(ctx, r.place, x + 18, ry, { size, shadow: true });
      ctx.fillStyle = r.color;
      ctx.fillRect(x + 32, ry - size * 0.5, 5, size);
      text(ctx, r.name, x + 44, ry, { size, align: 'left', weight: r.me ? 800 : 600, color: r.me ? '#ffd35c' : '#fff', shadow: true, maxWidth: w * 0.55 });
      text(ctx, r.value, x + w - 10, ry, { size, align: 'right', shadow: true, color: DIM });
    });
  }
}

