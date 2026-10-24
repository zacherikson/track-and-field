import { text, chamfer, slab, PAL, FONT_BODY, FONT_DISPLAY } from '../core/ui.js';
import { getDifficulty } from '../core/storage.js';
import { Brawl } from './brawl.js';
import { BrawlControls } from './controls.js';
import { BotBrain } from './bots.js';
import { LiveBrawl } from './liveBrawl.js';
import { woundsOf } from './wounds.js';
import { LAYOUT } from '../render/track.js';

const JOIN_EASE = 0.35; // s to ease from how someone was standing in the event into the late hits

/**
 * The late hits, run by the event scene itself: it starts them the moment your
 * athlete has come to a stop (past the finish line, round the pit), with you
 * exactly where you stopped, and adds the others one by one as they're done.
 * When the results come up the event carries on underneath them (the result
 * scene keeps calling the event's lateUpdate / lateRender), so nothing jumps.
 *
 *   join(p, pose)   someone who's done: { id, scarKey, name, colors, x, d, facing, isMe, remote };
 *                   `pose` = how the event last drew them (eased out of)
 *   handle(e)       an input event for your controls (true if taken)
 *   update(dt, t)   one step
 *   render(ctx, view, extras)  the venue and everyone in it; `extras` = the
 *                   event's athletes still finishing ([{ d, draw(ctx) }])
 *   drawControls(ctx, view)  your stick and buttons, over everything
 *   exit()          leaving (live: off the others' screens)
 */
export class Aftermath {
  /**
   * @param game   the game (input, view)
   * @param venue  where (venue.js), sharing the event's camera
   * @param me     your athlete, as join() takes it
   * @param opts   { live: the room when played live, key: which brawl (live),
   *                 lookup: uid -> { name, colors } for a live player who turns up }
   */
  constructor(game, venue, me, { live = null, key = '', lookup = null, pose = null } = {}) {
    this.game = game;
    game.input.wantReleases = true; // the stick is held
    this.venue = venue;
    this.lookup = lookup;
    venue.view = game.view;
    this.brawl = new Brawl(venue, []);
    this.brawl.t = game.time; // (people join before its first step)
    this.join({ ...me, isMe: true, id: live ? live.uid : 'me', scarKey: 'me' }, pose);
    this.live = live ? new LiveBrawl(this.brawl, live, key, (uid, b) => this.arrive(uid, b)) : null;
    this.controls = new BrawlControls(game.input);
    this.age = 0;
    this.pending = []; // moves pressed while busy: { m, t }
    this.layout(game.view);
  }

  get me() {
    return this.brawl.me;
  }

  has(id) {
    return !!this.brawl.byId(id);
  }

  join(p, pose = null) {
    const scarKey = p.scarKey ?? p.id;
    const f = this.brawl.add({ ...p, scarKey, wounds: woundsOf(scarKey) });
    if (f.isMe) this.brawl.me = f;
    f.easeFrom(pose, this.brawl.t, JOIN_EASE);
    f.bornT = this.brawl.t;
    // Offline, the others are computer rivals (bots.js): they stand a moment before wandering off.
    if (!f.isMe && !f.remote) {
      f.brain = new BotBrain(f, getDifficulty());
      f.brain.nextStroll = this.brawl.t + 2 + Math.random() * 4;
    }
    return f;
  }

  /**
   * The computer rivals after a field event: each walks over from off screen
   * (the side their spot is on) to spot(k), k = 1, 2...
   */
  callOver(people, spot) {
    const v = this.venue;
    const half = v.halfWidth();
    people.forEach((p, i) => {
      const s = spot(i + 1);
      const side = s.x >= this.me.x ? 1 : -1;
      const f = this.join({ ...p, x: v.camera.x + side * (half + 1 + i * 0.9), d: s.d, facing: -side });
      f.entering = true;
      f.brain?.goTo(s.x, s.d, s.facing);
    });
  }

  /** A live player's phone has started its late hits: they're here, where they say they are. */
  arrive(uid, b) {
    const who = this.lookup?.(uid);
    if (!who) return null;
    // Seen here already (still in the race): from there, walking over to where their phone has them.
    const seen = who.shown && Number.isFinite(who.x);
    const f = this.join({ id: uid, name: who.name, colors: who.colors, x: seen ? who.x : b.x, d: seen ? who.d : b.d, facing: b.f === -1 ? -1 : 1, remote: true }, seen ? who.pose : null);
    f.arriving = seen;
    return f;
  }

  layout(view) {
    this.controls.layout(view, view.safe.t + 60);
  }

  /** One input event for your controls: true if taken (Enter, Space and Escape are left to the scene). */
  handle(e) {
    if (e.type === 'key' && ['Enter', 'Space', 'Escape'].includes(e.code)) return false;
    this.controls.handle(e);
    return true;
  }

  update(dt, t) {
    this.age += dt;
    this.venue.view = this.game.view;
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

  render(ctx, view, extras = []) {
    this.brawl.render(ctx, view, extras);
  }

  drawControls(ctx, view) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.age / 0.3); // they fade in as you come to a stop
    this.controls.draw(ctx, view);
    ctx.restore();
  }

  exit() {
    this.live?.close();
  }
}

/**
 * The results (or tournament standings) over the late hits: a sheet in the
 * top right corner, over the stands (cream, under an ink title strip), just
 * as wide as its rows need at a size you can read (no gap down the middle),
 * and the scene's two buttons right at the bottom, on the ad boards below the
 * track, so the middle of the screen is left clear for the fighting. It fades
 * in, so the results just show up over the event.
 */
export class ResultsPanel {
  /**
   * @param buttons  [main, other]: the scene's Buttons (Race again / Next, and Menu / Quit)
   * @param title    () => string
   * @param rows     () => [{ place, name, colors, value, isPlayer, gold }] (no `colors`: no shirt bar)
   */
  constructor(buttons, title, rows) {
    Object.assign(this, { buttons, title, rows });
    // Over the busy ad boards: solid ink.
    if (buttons[1]) Object.assign(buttons[1], { color: PAL.ink, lip: PAL.inkShade });
    this.age = 0;
  }

  /** `ctx` (when drawing): measures the rows, and the sheet takes their width. */
  layout(view, ctx = null) {
    const s = view.safe;
    const rows = this.rows();
    const n = Math.max(1, rows.length);
    this.y = s.t + 8;
    this.head = 34;
    // The rows keep above the track where they can.
    const room = LAYOUT.farY - this.y - this.head - 8;
    this.rowH = Math.max(22, Math.min(34, room / n));
    this.size = Math.round(this.rowH * 0.64);
    this.h = this.head + n * this.rowH + 6;
    if (ctx) {
      // Place, shirt bar and name; a small gap; the value. The title fits too.
      const measure = (strs, weight, font) => {
        ctx.font = `${weight} ${this.size}px ${font}`;
        return Math.max(0, ...strs.map((t) => ctx.measureText(t).width));
      };
      this.nameW = measure(rows.map((r) => r.name), 800, FONT_BODY);
      const valueW = measure(rows.map((r) => r.value), 800, FONT_BODY);
      ctx.font = `900 20px ${FONT_DISPLAY}`;
      ctx.letterSpacing = '1px';
      const titleW = ctx.measureText(this.title()).width + 28;
      ctx.letterSpacing = '0px';
      const fit = NAME_X + this.nameW + 22 + valueW + 14;
      this.w = Math.min(Math.max(fit, titleW, 220), view.w * 0.5);
    }
    this.w ??= 300;
    this.x = view.w - Math.max(s.r, 0) - 10 - this.w; // top right
    const [main, other] = this.buttons;
    const by = view.h - s.b - 52 - 4;
    const mw = 230;
    const ow = 140;
    const bx = view.w / 2 - (mw + 12 + ow) / 2;
    Object.assign(main, { x: bx, y: by, w: mw, h: 52, size: 20 });
    if (other) Object.assign(other, { x: bx + mw + 12, y: by, w: ow, h: 52, size: 20 });
  }

  update(dt) {
    this.age += dt;
  }

  draw(ctx, view) {
    this.layout(view, ctx); // rows can change (a live standings row goes)
    const rows = this.rows();
    const { x, y, w } = this;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.age / 0.25);
    slab(ctx, x, y, w, this.h + 5, { face: PAL.cream, lip: PAL.creamShade, lipH: 5, c: 7 });
    ctx.fillStyle = PAL.ink;
    chamfer(ctx, x, y, w, this.head, 7);
    ctx.fill();
    ctx.fillRect(x, y + this.head / 2, w, this.head / 2);
    text(ctx, this.title(), x + w / 2, y + this.head / 2 + 1, { size: 20, font: 'display', track: 1, color: PAL.cream, maxWidth: w - 16 });
    const { size } = this;
    rows.forEach((r, i) => {
      const ry = y + this.head + i * this.rowH + this.rowH / 2;
      // Zebra rows; yours gold.
      if (r.isPlayer || i % 2) {
        ctx.fillStyle = r.isPlayer ? PAL.gold : '#EFE2C3';
        ctx.fillRect(x, ry - this.rowH / 2, w, this.rowH);
      }
      text(ctx, r.place, x + 18, ry + 1, { size: size + 2, font: 'display', color: PAL.ink });
      if (r.colors) {
        ctx.fillStyle = r.colors.shirt;
        ctx.fillRect(x + 34, ry - size * 0.45, 6, size * 0.9);
      }
      // Live: the other people in the race in orange, the computer's runners in ink.
      text(ctx, r.name, x + NAME_X, ry + 1, { size, font: 'body', align: 'left', weight: r.isPlayer ? 800 : 700, color: r.gold && !r.isPlayer ? PAL.orangeShade : PAL.ink, maxWidth: this.nameW + 2 });
      text(ctx, r.value, x + w - 14, ry + 1, { size, font: 'body', weight: 800, align: 'right', color: PAL.ink });
    });
    this.buttons.forEach((b) => b?.draw(ctx));
    ctx.restore();
  }
}

const NAME_X = 48; // where the names start in the results sheet: after the place and the shirt bar
