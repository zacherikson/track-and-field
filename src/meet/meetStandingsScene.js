import { Button, text, slab, chamfer, PAL, FONT_BODY, FONT_DISPLAY } from '../core/ui.js';
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


/**
 * Between a meet's events, over the event's late hits (the backdrop): this
 * event's places across every heat with the points they scored, and the
 * squads' totals, side by side in the top right corner (each sheet just as
 * wide as its rows), so the middle of the screen is clear for the fighting. Your heat's results show at once; the overall places come
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
    this.nextBtn = new Button({ label: '…', color: PAL.liveGreen, lip: PAL.liveShade, onTap: () => {} }); // counts down: the next event comes by itself
    // Over the event's ad boards ink reads best; on plain ink it needs ink2.
    this.menuBtn = new Button({ label: 'Leave meet', color: this.backdrop ? PAL.ink : PAL.ink2, lip: PAL.inkShade, onTap: () => this.leave() });
    this.againBtn = new Button({ label: 'Meet again', icon: 'meet', color: PAL.liveGreen, lip: PAL.liveShade, onTap: () => this.again() });
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
    if (meet.lost && !meet.final) {
      this.nextBtn.label = 'Meet lost';
      return;
    }
    if (this.last && !meet.final) this.nextBtn.label = 'Final standings…';
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
      ctx.fillStyle = PAL.ink;
      ctx.fillRect(0, 0, view.w, view.h);
    }
    const s = view.safe;
    const top = s.t + 8;
    const room = Math.min(LAYOUT.farY, view.h - 80) - top - 6; // above the track, clear of the late hits
    const places = this.places();
    const squads = this.squads();
    // One row height for both, as big as fits the longer one.
    const n = Math.max(1, places.rows.length, squads.rows.length);
    const rowH = Math.max(20, Math.min(34, (room - HEAD - 8) / n));
    const size = Math.round(rowH * 0.64);
    const wp = this.fit(ctx, places, size);
    const ws = this.fit(ctx, squads, size);
    // Squads at the right edge, this event's places to their left; narrowed together if they'd take over half the screen.
    const k = Math.min(1, (view.w * 0.62) / (wp + ws + 10));
    const right = view.w - Math.max(s.r, 0) - 10;
    this.panel(ctx, right - ws * k, top, ws * k, rowH, size, squads);
    this.panel(ctx, right - ws * k - 10 - wp * k, top, wp * k, rowH, size, places);
    this.buttons.forEach((b) => b.draw(ctx));
    if (this.backdrop) this.backdrop.after?.drawControls(ctx, view);
    if (meet.lostText && !meet.final) {
      const w = Math.min(view.w - 40, 620);
      slab(ctx, view.w / 2 - w / 2, view.h - 96 - s.b, w, 40, { face: PAL.ink, lip: PAL.inkShade, lipH: 4, c: 5 });
      text(ctx, meet.lostText, view.w / 2, view.h - 78 - s.b, { size: 18, font: 'body', weight: 700, color: '#ffb35c', maxWidth: w - 20 });
    }
  }

  /** This event's sheet: the overall places once the server has them (else your heat). { title, rows }. */
  places() {
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
          color: sq?.color ?? PAL.ink3,
          value: `${r.mark != null ? formatMark(this.ev, r.mark) : 'NM'}${r.pts ? `  +${formatPoints(r.pts)}` : ''}`,
          me: relay ? r.id === meet.me?.squad : r.id === meet.uid,
        };
      });
    } else {
      title = relay ? `${this.ev.name.toUpperCase()} · WAITING FOR EVERY TEAM` : `${this.ev.name.toUpperCase()} · YOUR HEAT`;
      rows = this.results.map((r, i) => ({
        place: r.status === 'ok' ? String(i + 1) : '–',
        name: r.name,
        color: r.colors?.shirt ?? PAL.ink3,
        value: r.status === 'ok' ? formatMark(this.ev, r.mark) : r.status.toUpperCase(),
        me: r.isPlayer,
      }));
    }
    return { title, rows };
  }

  /** The squads' sheet: their totals so far (or final). { title, rows, gold }. */
  squads() {
    const st = meet.final?.standings ?? meet.standings ?? [];
    const done = !!meet.final;
    const title = done ? `${meet.squads.get(st[0]?.squad)?.name?.toUpperCase() ?? ''} WIN` : `SQUADS · AFTER ${meet.results.filter(Boolean).length} OF ${MEET_ORDER.length}`;
    const rows = st.map((r) => {
      const sq = meet.squads.get(r.squad);
      return { place: String(r.rank), name: sq?.name ?? r.squad, color: sq?.color ?? PAL.ink3, value: formatPoints(r.total), me: r.squad === meet.me?.squad };
    });
    return { title, rows, gold: done };
  }

  /** How wide sheet `p` needs to be for its rows at `size` px (place and colour bar, name, a small gap, value) and its title. */
  fit(ctx, p, size) {
    const measure = (strs, font) => {
      ctx.font = font;
      return Math.max(0, ...strs.map((t) => ctx.measureText(t).width));
    };
    p.nameW = measure(p.rows.map((r) => r.name), `800 ${size}px ${FONT_BODY}`);
    const valueW = measure(p.rows.map((r) => r.value), `700 ${size}px ${FONT_BODY}`);
    ctx.letterSpacing = '1px';
    const titleW = measure([p.title], `900 19px ${FONT_DISPLAY}`) + 24;
    ctx.letterSpacing = '0px';
    return Math.max(NAME_X + p.nameW + 20 + valueW + 12, titleW, 160);
  }

  /** Sheet `p` ({ title, rows, gold }): cream under a title strip (gold for the winners, else ink), zebra rows, yours gold. */
  panel(ctx, x, y, w, rowH, size, { title, rows, gold = false, nameW }) {
    const head = HEAD;
    const h = head + rows.length * rowH + 6;
    slab(ctx, x, y, w, h + 5, { face: PAL.cream, lip: PAL.creamShade, lipH: 5, c: 7 });
    ctx.fillStyle = gold ? PAL.gold : this.backdrop ? PAL.ink : PAL.ink2;
    chamfer(ctx, x, y, w, head, 7);
    ctx.fill();
    ctx.fillRect(x, y + head / 2, w, head / 2);
    text(ctx, title, x + w / 2, y + head / 2 + 1, { size: 19, font: 'display', track: 1, color: gold ? PAL.ink : PAL.cream, maxWidth: w - 14 });
    rows.forEach((r, i) => {
      const ry = y + head + i * rowH + rowH / 2;
      if (r.me || i % 2) {
        ctx.fillStyle = r.me ? PAL.gold : '#EFE2C3';
        ctx.fillRect(x, ry - rowH / 2, w, rowH);
      }
      text(ctx, r.place, x + 17, ry + 1, { size: size + 2, font: 'display', color: PAL.ink });
      ctx.fillStyle = r.color;
      ctx.fillRect(x + 32, ry - size * 0.45, 6, size * 0.9);
      text(ctx, r.name, x + NAME_X, ry + 1, { size, font: 'body', align: 'left', weight: r.me ? 800 : 700, color: PAL.ink, maxWidth: Math.min(nameW + 2, w - NAME_X - 60) });
      text(ctx, r.value, x + w - 12, ry + 1, { size, font: 'body', weight: 700, align: 'right', color: PAL.muted, maxWidth: w * 0.5 });
    });
  }
}

const HEAD = 32; // a sheet's title strip
const NAME_X = 46; // where the names start: after the place and the colour bar
