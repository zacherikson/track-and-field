import { Button, text, slab, chamfer, PAL } from '../core/ui.js';
import { ordinal } from '../core/math.js';
import { formatMark } from '../events/registry.js';
import { getBest, submitBest, getCampaign, getBeaten, saveGhostIfBetter, canTune, getSpecialLevel } from '../core/storage.js';
import { postMark } from '../online/post.js';
import { counts, recordTopMark } from '../online/bests.js';
import { worldRecord, isWorldRecord } from '../online/worldRecords.js';
import { flow } from '../flow.js';
import { ResultsPanel } from '../brawl/aftermath.js';

/**
 * Results: your mark, placing, personal best, and full standings.
 * `results` is a sorted array of { name, lane, mark, status: 'ok'|'dnf', isPlayer, colors }.
 *
 * With a `backdrop` (the event scene, carrying on with its late hits) it's
 * just the results up top over the event, with Race again and Menu along the
 * bottom (brawl/aftermath.js ResultsPanel).
 */
export class ResultScene {
  constructor(ev, results, stats = null, backdrop = null) {
    this.ev = ev;
    this.results = results;
    this.stats = stats; // { hits, misses, topSpeed, run } for the player, when the event tracks them
    this.backdrop = backdrop;
    this.wantsReleases = !!backdrop; // the late hits' stick is held
  }

  enter() {
    this.age = 0;
    const me = this.results.find((r) => r.isPlayer);
    this.me = me;
    this.place = this.results.indexOf(me) + 1;
    // Won in a campaign: this event is ticked off (flow.results did the ticking).
    const level = getCampaign();
    this.beaten = !!level && !this.stats?.live && this.results.find((r) => !r.ghost) === me && getBeaten(level)[this.ev.id];
    const prevBest = getBest(this.ev.id);
    // Only runs that could go on the online board count as a best (online/bests.js).
    this.newPB = me.status === 'ok' && counts() && submitBest(this.ev.id, me.mark, this.ev.lowerIsBetter);
    if (me.status === 'ok') recordTopMark(this.ev, me.mark, !!this.stats?.live);
    this.best = getBest(this.ev.id);
    this.hadBest = prevBest != null;
    // Beats the top of the online board (only a mark that could go on it: shipped tuning).
    this.beatWR = me.status === 'ok' && (counts() || !this.ev.online) && isWorldRecord(this.ev, me.mark);
    this.online = null; // one line about the online leaderboard
    const run = this.stats?.run ?? null; // the recorded attempt: your ghost
    if (run && counts()) saveGhostIfBetter(this.ev, run);
    if (me.status === 'ok') postMark(this.ev, me.mark, run, (s) => (this.online = s));

    this.buttons = [
      this.stats?.live
        ? new Button({ label: `${(this.ev.againLabel ?? 'Race again').replace(' again', '')} live again`, color: PAL.liveGreen, lip: PAL.liveShade, onTap: () => flow.live(this.game, this.ev.id, this.stats.squad) })
        : new Button({ label: this.ev.againLabel ?? 'Race again', color: PAL.liveGreen, lip: PAL.liveShade, onTap: () => flow.play(this.game, this.ev) }),
      new Button({ label: 'Menu', icon: 'back', color: PAL.ink2, lip: PAL.inkShade, onTap: () => flow.menu(this.game, this.stats?.squad ? 'squad' : 'play') }),
    ];
    if (canTune()) this.buttons.push(new Button({ label: 'Tuning', icon: 'tuning', color: PAL.ink2, lip: PAL.inkShade, onTap: () => flow.tuning(this.game) }));
    if (this.ev.online) this.buttons.splice(2, 0, new Button({ label: 'Leaderboard', icon: 'leaderboard', color: PAL.ink2, lip: PAL.inkShade, onTap: () => flow.leaderboard(this.game, this.ev) }));
    const live = !!this.stats?.live;
    if (this.backdrop) {
      // Over the late hits: just the results and the two buttons.
      this.buttons = this.buttons.slice(0, 2);
      this.panel = new ResultsPanel(this.buttons, () => `RESULTS · ${this.ev.name.toUpperCase()}${this.beaten ? ` · ${getCampaign().toUpperCase()} BEATEN!` : ''}`, () =>
        this.results.map((r, i) => ({
          place: r.status === 'ok' ? String(i + 1) : '–',
          name: r.name,
          colors: r.colors,
          value: r.status === 'ok' ? formatMark(this.ev, r.mark) : r.status.toUpperCase(),
          isPlayer: r.isPlayer,
          gold: live && !r.isPlayer,
        })),
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

  onResize(view) {
    if (this.panel) this.panel.layout(view);
    else this.layout(view);
    this.backdrop?.after?.layout(view);
  }

  layout(view) {
    const gap = 14;
    const n = this.buttons.length;
    const w = Math.min(180, (view.w - 40 - Math.max(view.safe.l, view.safe.r) * 2 - gap * (n - 1)) / n);
    const x0 = view.w / 2 - (n * w + (n - 1) * gap) / 2;
    this.buttons.forEach((b, i) => Object.assign(b, { x: x0 + i * (w + gap), y: 454, w, h: 60 }));
  }

  update(dt, t) {
    this.age += dt;
    const bd = this.backdrop;
    for (const e of this.game.input.consume(t + dt)) {
      const onButton = e.type === 'down' && this.buttons.some((b) => b.hit(e.x, e.y));
      // Over the late hits, everything but the buttons (and Enter / Space / Escape) is for your controls.
      if (bd && !onButton && bd.after?.handle(e)) continue;
      if (this.age < 0.6 && e.type !== 'up' && e.type !== 'keyup') continue; // don't let frantic race taps hit a button
      if (e.type === 'down') this.buttons.some((b) => b.tap(e.x, e.y));
      else if (e.code === 'Space' || e.code === 'Enter') this.buttons[0].onTap();
      else if (e.code === 'Escape') flow.menu(this.game);
    }
    if (this.game.scene !== this) return; // a button took us on
    this.buttons.forEach((b) => b.update(dt));
    this.panel?.update(dt);
    bd?.lateUpdate(dt, t);
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
    const me = this.me;
    const colW = Math.min(360, (view.w - 60) / 2);
    const lx = view.w / 2 - colW - 10;
    const rx = view.w / 2 + 10;
    const CREAM = (a) => `rgba(245,234,208,${a})`;

    // Left column: your result.
    let headline;
    if (me.status === 'dnf') headline = 'DID NOT FINISH';
    else if (me.status === 'nm') headline = 'NO MARK';
    else headline = formatMark(this.ev, me.mark);
    const cx = lx + colW / 2;
    const where = this.stats?.squad ? 'PRACTICE' : this.stats?.live ? 'LIVE' : this.ev.special ? getSpecialLevel().toUpperCase() : getCampaign() ? getCampaign().toUpperCase() : 'TRAINING';
    text(ctx, `${this.ev.name.toUpperCase()} · ${where}${this.beaten ? ' · BEATEN!' : ''}`, cx, 52, { size: 22, font: 'display', track: 1.5, color: this.beaten ? PAL.gold : CREAM(0.75), maxWidth: colW });
    text(ctx, headline, cx, 118, { size: me.status === 'ok' ? 84 : 44, font: 'display', track: 2, color: PAL.cream, maxWidth: colW });
    if (me.status === 'ok' && this.results.length > 1) text(ctx, `${ordinal(this.place).toUpperCase()} PLACE`, cx, 180, { size: 34, font: 'display', track: 2, color: this.place === 1 ? PAL.gold : PAL.cream });

    const flash = 0.65 + 0.35 * Math.sin(this.age * 8);
    let y = 236;
    if (this.beatWR) {
      text(ctx, 'NEW WORLD RECORD!', cx, y, { size: 28, font: 'display', track: 1.5, color: `rgba(242,182,50,${flash})` });
      y += 34;
    }
    if (this.newPB) {
      text(ctx, this.hadBest ? 'NEW PERSONAL BEST!' : 'FIRST PERSONAL BEST!', cx, y, { size: 26, font: 'display', track: 1.5, color: `rgba(127,216,160,${flash})` });
      y += 34;
    }
    text(ctx, `Personal best  ${formatMark(this.ev, this.best)}`, cx, y + 8, { size: 19, font: 'body', weight: 600, color: CREAM(0.85) });
    text(ctx, `World record  ${formatMark(this.ev, worldRecord(this.ev))}`, cx, y + 36, { size: 19, font: 'body', weight: 600, color: CREAM(0.85) });
    if (this.stats && me.status === 'ok') {
      // Numbers to talk about when tuning.
      const s = this.stats;
      const pace = s.hits / me.mark;
      text(ctx, `${s.hits} ${s.hitWord ?? 'hits'} · ${s.misses} ${s.misses === 1 ? 'miss' : 'misses'}${s.extra ? ` · ${s.extra}` : ''} · ${s.paceText ?? `${pace.toFixed(1)} hits/s`} · top ${(s.topSpeed * 3.6).toFixed(0)} km/h`, cx, y + 72, {
        size: 16, font: 'body', weight: 600, color: CREAM(0.65), maxWidth: colW,
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
      const color = warn ? 'rgba(255,190,90,0.9)' : CREAM(0.45);
      text(ctx, l1, cx, y + 96, { size: 14, font: 'body', weight: 600, color, maxWidth: colW });
      text(ctx, l2, cx, y + 114, { size: 14, font: 'body', weight: 600, color, maxWidth: colW });
      text(ctx, l3, cx, y + 132, { size: 14, font: 'body', weight: 600, color, maxWidth: colW });
    }

    // Right column: the standings on a cream sheet under an ink title strip.
    const top = 30;
    const sheetH = 400;
    slab(ctx, rx, top, colW, sheetH, { face: PAL.cream, lip: PAL.creamShade, lipH: 5, c: 7 });
    ctx.fillStyle = PAL.ink2; // ink2: it stands off the ink behind
    chamfer(ctx, rx, top, colW, 48, 7);
    ctx.fill();
    ctx.fillRect(rx, top + 24, colW, 24);
    text(ctx, 'RESULTS', rx + colW / 2, top + 25, { size: 24, font: 'display', track: 2, color: PAL.cream });
    this.results.forEach((r, i) => {
      const ry = 100 + i * 52;
      if (r.isPlayer || i % 2) {
        ctx.fillStyle = r.isPlayer ? PAL.gold : '#EFE2C3';
        ctx.fillRect(rx, ry - 26, colW, 52);
      }
      const mark = r.status === 'ok' ? formatMark(this.ev, r.mark) : r.status.toUpperCase();
      text(ctx, r.status === 'ok' ? String(i + 1) : '–', rx + 30, ry + 1, { size: 26, font: 'display', color: PAL.ink });
      ctx.fillStyle = r.colors.shirt;
      ctx.fillRect(rx + 50, ry - 10, 6, 20);
      text(ctx, r.name, rx + 66, ry + 1, { size: 20, font: 'body', align: 'left', weight: r.isPlayer ? 800 : 700, color: PAL.ink, maxWidth: colW - 190 });
      if (r.lane != null) text(ctx, `L${r.lane}`, rx + colW - 110, ry + 1, { size: 16, font: 'body', weight: 700, color: PAL.muted });
      text(ctx, mark, rx + colW - 22, ry + 1, { size: 20, font: 'body', weight: 800, align: 'right', color: PAL.ink });
    });

    if (this.online) text(ctx, this.online, rx + colW / 2, top + sheetH - 26, { size: 15, font: 'body', weight: 600, color: PAL.muted, maxWidth: colW - 24 });

    this.buttons.forEach((b) => b.draw(ctx));
  }
}
