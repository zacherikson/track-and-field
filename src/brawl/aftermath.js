import { Button, text } from '../core/ui.js';
import { getDifficulty } from '../core/storage.js';
import { Brawl } from './brawl.js';
import { BrawlControls } from './controls.js';
import { BotBrain } from './bots.js';
import { LiveBrawl } from './liveBrawl.js';
import { woundsOf } from './wounds.js';

const AUTO_CLOSE = 6; // s the results stay up before they fold away for the late hits
const HINT = 5; // s the how-to line shows once they have
const BAR_H = 50;

/**
 * The late hits on a results screen (ResultScene, StandingsScene): the event's
 * venue with everyone who took part standing about in it, your controls, and
 * the results as a panel over the top.
 *
 * The results come up first (dimmed venue behind, the rivals already going at
 * each other). Tap anywhere off their buttons, or wait a few seconds, and they
 * fold into a bar at the top (the results button, and the scene's main two
 * buttons) so you can get stuck in; the results button brings them back.
 *
 * The scene passes each input event to handle() first, calls update() each
 * step, draws with drawWorld() then (panel open) its own results over dim(),
 * or (panel closed) drawHUD(); and calls exit() when it leaves.
 */
export class Aftermath {
  /**
   * @param scene  the results scene (its `buttons` are the panel's)
   * @param venue  where (venue.js), from the event scene
   * @param rows   the event's results rows ({ name, colors, isPlayer, key })
   * @param opts   { live: the room when played live, key: which brawl (live), bar: [main, other] buttons, summary: () => string }
   */
  constructor(scene, venue, rows, { live = null, key = '', bar, summary }) {
    this.scene = scene;
    this.venue = venue;
    this.summary = summary;
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
    this.open = true;
    this.openT = 0;
    this.pinned = false; // opened by hand: stays until closed by hand
    this.hintT = null;
    this.pending = []; // moves pressed while busy: { move, t }
    this.resultsBtn = new Button({ label: '📋 Results', size: 16, color: 'rgba(12,22,44,0.82)', onTap: () => this.show() });
    this.bar = bar.filter(Boolean).map((src) => new BarButton(src));
    this.layout(view);
  }

  layout(view) {
    const s = view.safe;
    const y = 8 + s.t;
    Object.assign(this.resultsBtn, { x: 10 + s.l, y, w: 190, h: BAR_H });
    let x = view.w - 10 - s.r;
    for (const b of this.bar) {
      b.w = b === this.bar[0] ? 230 : 110;
      x -= b.w;
      Object.assign(b, { x, y, h: BAR_H });
      x -= 10;
    }
    this.controls.layout(view, y + BAR_H + 6);
  }

  show() {
    this.open = true;
    this.pinned = true;
    this.controls.release();
  }

  hide() {
    this.open = false;
    this.hintT ??= 0;
  }

  /** One input event: true if the late hits took it (else the scene handles it as before). */
  handle(e) {
    if (e.type === 'up' || e.type === 'keyup') {
      this.controls.handle(e);
      return true;
    }
    const passKey = e.type === 'key' && ['Enter', 'Space', 'Escape'].includes(e.code);
    if (this.open) {
      if (e.type === 'down') {
        if (this.scene.buttons.some((b) => b.hit(e.x, e.y))) return false;
        this.hide();
        return true;
      }
      if (passKey || !this.controls.handle(e)) return false;
      this.hide();
      return true;
    }
    if (e.type === 'down') {
      for (const b of [this.resultsBtn, ...this.bar]) if (b.tap(e.x, e.y)) return true;
      this.controls.handle(e);
      return true;
    }
    if (passKey) return false;
    return this.controls.handle(e) || true;
  }

  update(dt, t) {
    if (this.open && !this.pinned) {
      this.openT += dt;
      if (this.openT > AUTO_CLOSE) this.hide();
    }
    if (this.hintT != null) this.hintT += dt;
    const me = this.brawl.me;
    const c = this.controls.read(dt);
    if (me) {
      me.mx = this.open ? 0 : c.mx;
      me.md = this.open ? 0 : c.md;
      if (!this.open) for (const m of c.moves) this.pending.push({ m, t });
      // A move pressed a moment before the last one finishes still happens.
      this.pending = this.pending.filter((p) => t - p.t < 0.25);
      while (this.pending.length) {
        const { m } = this.pending[0];
        const ok = typeof m === 'string' ? this.brawl.command(me, m, t) : this.brawl.command(me, 'emote', t, m.emote);
        if (!ok) break;
        this.pending.shift();
      }
    }
    for (const f of this.brawl.fighters) f.brain?.update(dt, t, this.brawl, this.open);
    this.live?.update(dt);
    this.brawl.update(dt, t);
    this.bar.forEach((b) => b.update(dt));
    this.resultsBtn.update(dt);
  }

  drawWorld(ctx, view) {
    this.brawl.render(ctx, view);
  }

  /** Under the results panel: the venue dimmed, and how to get to the late hits. */
  dim(ctx, view) {
    ctx.fillStyle = 'rgba(18,32,58,0.86)';
    ctx.fillRect(0, 0, view.w, view.h);
    const pulse = 0.55 + 0.45 * Math.sin(this.scene.age * 4);
    text(ctx, 'Tap anywhere for some late hits 👊', view.w / 2, 13 + view.safe.t, { size: 13, weight: 700, color: `rgba(255,210,63,${pulse})` });
  }

  /** Panel folded away: the bar and the controls. */
  drawHUD(ctx, view) {
    this.resultsBtn.sub = this.summary();
    this.resultsBtn.draw(ctx);
    this.bar.forEach((b) => b.draw(ctx));
    this.controls.draw(ctx, view);
    if (this.hintT != null && this.hintT < HINT) {
      ctx.globalAlpha = Math.min(1, (HINT - this.hintT) / 0.6);
      text(ctx, 'LATE HITS! Drag on the left to walk · PUNCH, KICK, SLAM · hold 😀 to emote', view.w / 2, this.resultsBtn.y + BAR_H + 22, {
        size: 14, color: '#fff', shadow: true, maxWidth: view.w - 40,
      });
      ctx.globalAlpha = 1;
    }
  }

  exit() {
    this.live?.close();
  }
}

/** A scene's button in the bar: same label and action, its own place. */
class BarButton extends Button {
  constructor(src) {
    super({ size: 17, onTap: () => src.onTap?.() });
    this.src = src;
  }

  draw(ctx) {
    this.label = this.src.label;
    this.color = this.src.color;
    this.enabled = this.src.enabled;
    super.draw(ctx);
  }
}
