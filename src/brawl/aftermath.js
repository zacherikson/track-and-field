import { text, roundRect } from '../core/ui.js';
import { getDifficulty } from '../core/storage.js';
import { Brawl } from './brawl.js';
import { BrawlControls } from './controls.js';
import { BotBrain } from './bots.js';
import { LiveBrawl } from './liveBrawl.js';
import { woundsOf } from './wounds.js';

const HINT = 6; // s the how-to line shows
const BAR_H = 50;
const ROW_H = 25;

/**
 * The late hits on a results screen (ResultScene, StandingsScene): the event's
 * venue with everyone who took part standing about in it, your controls from
 * the first moment, a small see-through results table in the top left and the
 * scene's two buttons (Race again / Next, and Menu / Quit) in the top right.
 *
 * The scene passes each input event to handle() first, calls update() each
 * step, draws with render(), and calls exit() when it leaves.
 */
export class Aftermath {
  /**
   * @param scene  the results scene
   * @param venue  where (venue.js), from the event scene
   * @param rows   the event's results rows ({ name, colors, isPlayer, key })
   * @param opts   { live: the room when played live, key: which brawl (live), bar: [main, other] buttons,
   *                 title: () => string, table: () => [{ place, name, colors, value, isPlayer, gold }] }
   */
  constructor(scene, venue, rows, { live = null, key = '', bar, title, table }) {
    this.scene = scene;
    this.venue = venue;
    this.title = title;
    this.table = table;
    const view = scene.game.view;
    venue.view = view;
    let k = 0;
    const people = [];
    for (const r of rows) {
      if (r.ghost || (live && !r.isPlayer && (!r.key || live.left(r.key)))) continue;
      const spot = venue.spot(r, r.isPlayer ? 0 : ++k);
      const scarKey = r.isPlayer ? 'me' : r.key ?? r.name;
      people.push({
        id: r.isPlayer ? (live ? live.uid : 'me') : r.key ?? r.name,
        scarKey,
        name: r.name,
        colors: r.colors,
        x: spot.x,
        d: spot.d,
        facing: spot.facing,
        isMe: !!r.isPlayer,
        remote: !!live && !r.isPlayer,
        wounds: woundsOf(scarKey),
      });
    }
    this.brawl = new Brawl(venue, people);
    if (!live) for (const f of this.brawl.fighters) if (!f.isMe) f.brain = new BotBrain(f, getDifficulty());
    this.live = live ? new LiveBrawl(this.brawl, live, key) : null;
    if (this.brawl.me) venue.snap(this.brawl.me.x);
    this.controls = new BrawlControls(scene.game.input);
    this.age = 0;
    this.pending = []; // moves pressed while busy: { m, t }
    this.bar = bar.filter(Boolean);
    this.layout(view);
  }

  layout(view) {
    const s = view.safe;
    const y = 8 + s.t;
    let x = view.w - 10 - s.r;
    for (const b of this.bar) {
      b.w = b === this.bar[0] ? 220 : 110;
      b.h = BAR_H;
      b.size = 18;
      x -= b.w;
      Object.assign(b, { x, y });
      x -= 10;
    }
    this.controls.layout(view, y + BAR_H + 6);
  }

  /** One input event: true if the late hits took it (else the scene handles it as before). */
  handle(e) {
    if (e.type === 'up' || e.type === 'keyup') {
      this.controls.handle(e);
      return true;
    }
    if (e.type === 'key' && ['Enter', 'Space', 'Escape'].includes(e.code)) return false;
    if (e.type === 'down' && this.bar.some((b) => b.hit(e.x, e.y))) return false; // the scene's buttons
    this.controls.handle(e);
    return true;
  }

  update(dt, t) {
    this.age += dt;
    const me = this.brawl.me;
    const c = this.controls.read(dt);
    if (me) {
      me.mx = c.mx;
      me.md = c.md;
      for (const m of c.moves) this.pending.push({ m, t });
      // A move pressed a moment before the last one finishes still happens.
      this.pending = this.pending.filter((p) => t - p.t < 0.25);
      while (this.pending.length) {
        const { m } = this.pending[0];
        const ok = typeof m === 'string' ? this.brawl.command(me, m, t) : this.brawl.command(me, 'emote', t, m.emote);
        if (!ok) break;
        this.pending.shift();
      }
    }
    for (const f of this.brawl.fighters) f.brain?.update(dt, t, this.brawl, false);
    this.live?.update(dt);
    this.brawl.update(dt, t);
  }

  render(ctx, view) {
    this.brawl.render(ctx, view);
    this.drawTable(ctx, view);
    this.bar.forEach((b) => b.draw(ctx));
    this.controls.draw(ctx, view);
    if (this.age < HINT) {
      ctx.globalAlpha = Math.min(1, (HINT - this.age) / 0.6);
      text(ctx, 'Drag on the left to walk · PUNCH, KICK, SLAM · hold 😀 to emote', view.w / 2, view.h - 24 - view.safe.b, {
        size: 14, color: '#fff', shadow: true, maxWidth: view.w - 460,
      });
      ctx.globalAlpha = 1;
    }
  }

  /** The results, small, top left, on a light see-through panel. */
  drawTable(ctx, view) {
    const rows = this.table();
    const x = 10 + view.safe.l;
    const y = 8 + view.safe.t;
    const w = Math.min(290, view.w * 0.3);
    const h = 30 + rows.length * ROW_H + 6;
    roundRect(ctx, x, y, w, h, 12);
    ctx.fillStyle = 'rgba(12,22,44,0.45)';
    ctx.fill();
    text(ctx, this.title(), x + 12, y + 16, { size: 12, align: 'left', weight: 800, color: 'rgba(255,255,255,0.8)', maxWidth: w - 24 });
    rows.forEach((r, i) => {
      const ry = y + 30 + i * ROW_H + ROW_H / 2;
      if (r.isPlayer) {
        roundRect(ctx, x + 4, ry - ROW_H / 2 + 1, w - 8, ROW_H - 2, 7);
        ctx.fillStyle = 'rgba(255,180,0,0.25)';
        ctx.fill();
      }
      text(ctx, r.place, x + 20, ry, { size: 14, shadow: true });
      ctx.fillStyle = r.colors.shirt;
      ctx.fillRect(x + 34, ry - 7, 4, 14);
      text(ctx, r.name, x + 44, ry, { size: 14, align: 'left', weight: r.isPlayer ? 800 : 600, color: r.gold ? '#ffb400' : '#fff', shadow: true, maxWidth: w - 130 });
      text(ctx, r.value, x + w - 12, ry, { size: 14, align: 'right', shadow: true });
    });
  }

  exit() {
    this.live?.close();
  }
}
