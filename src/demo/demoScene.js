import { Button, text, slab, chamfer, PAL, FONT_BODY } from '../core/ui.js';
import { getCampaign, setCampaign, getSpecialLevel, setSpecialLevel } from '../core/storage.js';
import { drawIcon } from '../scenes/howTo.js';
import { demoBot } from './demoBots.js';

const LEVEL = 'pro'; // the demos are at the big stadium, against Pro rivals
const TAP_HOLD = 0.08; // s a demo tap stays down
const CAPTION_MIN = 0.7; // s (demo time) a caption stays up before the next can replace it
const SLOW_EASE = 6; // how quickly slow motion comes in and out (1/s)

/**
 * Taps for the event the demo is playing, in place of the screen's: the same
 * shape as core/input.js's queue, but with each event's sim time `t` set by
 * the bot. `onConsume` sees every event as the event takes it (the thumbs drawn
 * over the demo follow it).
 */
class ScriptedInput {
  constructor(onConsume) {
    this.queue = [];
    this.pointers = new Map();
    this.wantReleases = true;
    this.onConsume = onConsume;
    this.resetStats();
  }

  resetStats() {
    this.stats = { touches: 0, cancels: 0, lagMax: 0, delays: [] };
  }

  push(ev) {
    this.queue.push(ev);
  }

  /** Drops `id`'s lifts still to come (a thumb pressed again before its last tap came up). */
  dropUps(id) {
    this.queue = this.queue.filter((e) => !(e.type === 'up' && e.id === id));
  }

  consume(until) {
    if (!this.queue.length) return [];
    const out = this.queue.filter((e) => e.t <= until).sort((a, b) => a.t - b.t);
    if (!out.length) return out;
    this.queue = this.queue.filter((e) => e.t > until);
    for (const e of out) {
      if (e.type === 'down') this.stats.touches++;
      this.onConsume(e);
    }
    return out;
  }

  clear() {
    this.queue.length = 0;
  }
}

/**
 * A demo of one event, like the original's attract mode: the event itself,
 * played by a bot (demoBots.js) through the same taps you'd make, with two
 * see-through thumbs showing each press and a caption saying what's going on.
 * Nothing counts: the event never reaches its results (no marks, XP, ghosts
 * or leaderboards), and it's always at the Pro stadium, whatever you were
 * playing before (put back on the way out).
 *
 * Tap anywhere to skip to the end card: Watch again, Try it, Back.
 * `back(game)` is where Back goes; `tryIt(game)` where Try it does.
 */
export class DemoScene {
  constructor(ev, { back, tryIt }) {
    this.ev = ev; // audio.js: the stadium's sound, not the menus'
    this.back = back;
    this.tryIt = tryIt;
  }

  enter() {
    this.saved ??= { campaign: getCampaign(), special: getSpecialLevel() };
    setCampaign(LEVEL);
    setSpecialLevel(LEVEL);
    this.thumbs = {
      L: { x: 0, y: 0, down: false, t: -Infinity, seen: false },
      R: { x: 0, y: 0, down: false, t: -Infinity, seen: false },
    };
    this.input = new ScriptedInput((e) => this.sawTap(e));
    const game = this.game;
    const demo = this;
    // The event's view of the game: the real one, but with the bot's taps, its
    // own clock (it runs slow around the moments that matter), and nowhere to go
    // (Menu, the results) except back to the demo.
    this.clock = game.time;
    this.speed = 1;
    this.acc = 0;
    this.shadow = Object.create(game, {
      input: { value: this.input, writable: true },
      time: { value: this.clock, writable: true },
      scene: { get: () => this.inner },
      setScene: { value: () => demo.finish() },
    });
    this.bot = demoBot(this.ev.id);
    this.inner = this.ev.create();
    this.inner.game = this.shadow;
    this.inner.finish = () => this.finish(); // the results never come up
    this.inner.enter?.();
    this.caption = null;
    this.captionT = -Infinity;
    this.ended = false;
    this.age = 0;
    this.buttons = [
      new Button({ label: 'Watch again', w: 210, h: 54, color: PAL.ink2, lip: PAL.inkShade, onTap: () => this.again() }),
      new Button({ label: 'Try it', icon: 'next', w: 210, h: 54, color: PAL.liveGreen, lip: PAL.liveShade, onTap: () => this.leave(this.tryIt) }),
      new Button({ label: 'Back', icon: 'back', look: 'chip', w: 112, h: 46, onTap: () => this.leave(this.back) }),
    ];
    this.layout(game.view);
  }

  exit() {
    this.inner?.exit?.();
    this.restore();
  }

  /** Your campaign and RIVALS level back as they were. */
  restore() {
    if (!this.saved) return;
    setCampaign(this.saved.campaign);
    setSpecialLevel(this.saved.special);
    this.saved = null;
  }

  leave(to) {
    this.inner?.exit?.();
    this.inner = null;
    this.restore();
    to(this.game);
  }

  again() {
    this.inner?.exit?.();
    this.enter();
  }

  /** The demo has shown enough (or the event tried to leave): the end card. */
  finish() {
    this.ended = true;
  }

  onResize(view) {
    this.inner?.onResize?.(view);
    this.layout(view);
  }

  layout(view) {
    const [again, tryIt, back] = this.buttons;
    const y = view.h / 2 + 30;
    again.x = view.w / 2 - again.w - 8;
    tryIt.x = view.w / 2 + 8;
    again.y = tryIt.y = y;
    Object.assign(back, { x: view.w / 2 - back.w / 2, y: y + 74 });
  }

  // ---------------------------------------------------------------- the bot's thumbs

  /** The pad interface the bot presses with (demoBots.js). */
  get pad() {
    const input = this.input;
    const w = this.game.view.w;
    const side = (x) => (x < w / 2 ? 'L' : 'R');
    return {
      tap: (x, y, t) => {
        const id = side(x);
        input.dropUps(`demo${id}`);
        input.push({ type: 'down', x, y, id: `demo${id}`, t });
        input.push({ type: 'up', x, y, id: `demo${id}`, t: t + TAP_HOLD });
      },
      down: (id, x, y, t) => {
        input.dropUps(`demo${id}`);
        input.push({ type: 'down', x, y, id: `demo${id}`, t });
      },
      up: (id, t) => {
        const th = this.thumbs[id];
        input.push({ type: 'up', x: th.x, y: th.y, id: `demo${id}`, t });
      },
    };
  }

  /** A demo tap reached the event: the thumb on that side moves there and presses (or lifts). */
  sawTap(e) {
    const th = this.thumbs[e.id === 'demoL' ? 'L' : 'R'];
    if (e.type === 'down') Object.assign(th, { x: e.x, y: e.y, down: true, t: e.t, seen: true });
    else if (e.type === 'up') th.down = false;
  }

  // ---------------------------------------------------------------- loop

  update(dt, t) {
    this.age += dt;
    for (const e of this.game.input.consume(t + dt)) {
      if (this.ended) {
        if (e.type === 'down') this.buttons.some((b) => b.tap(e.x, e.y));
        else if (e.code === 'Escape' || e.code === 'Backspace') return this.leave(this.back);
        else if (e.code === 'Enter' || e.code === 'Space') return this.leave(this.tryIt);
        else if (e.code === 'KeyR') return this.again();
      } else if (e.type === 'down' && this.age > 0.4) this.finish(); // tap anywhere: skip
      else if (e.code === 'Escape' || e.code === 'Backspace') this.finish();
      if (this.game.scene !== this) return; // a button took us on
    }
    this.buttons.forEach((b) => b.update(dt));
    if (this.ended || !this.inner) return;
    // Slow motion around the presses that are all about timing (the bot's `slow`), eased in and out.
    const want = this.bot.slow?.(this.inner) ?? 1;
    this.speed += (want - this.speed) * Math.min(1, dt * SLOW_EASE);
    this.acc += dt * this.speed;
    while (this.acc >= dt && !this.ended && this.inner) {
      this.acc -= dt;
      this.step(dt);
    }
  }

  /** One step of the event, on the demo's clock: the bot presses, the event moves on. */
  step(dt) {
    const t = this.clock;
    this.bot.step(this.inner, t, dt, this.pad);
    this.inner.update(dt, t);
    if (this.game.scene !== this || !this.inner) return; // it left (Menu): finish() has the end card up
    this.clock = this.shadow.time = t + dt;
    if (this.bot.done(this.inner, this.clock)) this.finish();
    this.updateCaption(this.clock);
  }

  updateCaption(now) {
    const next = this.bot.caption(this.inner);
    if (!next || next.text === this.caption?.text) return;
    if (this.caption && now - this.captionT < CAPTION_MIN) return;
    this.caption = next;
    this.captionT = now;
  }

  render(ctx, view) {
    if (!this.inner) {
      ctx.fillStyle = PAL.ink;
      ctx.fillRect(0, 0, view.w, view.h);
      return;
    }
    this.inner.render(ctx, view);
    if (!this.ended) {
      this.drawThumbs(ctx, view);
      this.drawCaption(ctx, view);
    } else this.drawEndCard(ctx, view);
  }

  /**
   * The bar along the bottom (over the ad boards; the time trial's at the top):
   * on the left a gold DEMO tag (SLOW-MO while it is, the ▶ blinking like an
   * arcade's attract mode, "tap to skip" under it), then what's happening now:
   * the control's icon and one line.
   */
  drawCaption(ctx, view) {
    const c = this.caption;
    const now = this.clock;
    const k = c ? Math.min(1, (now - this.captionT) / 0.18) : 1; // the line slides in as it changes
    const size = 21;
    const tagW = 128;
    ctx.font = `700 ${size}px ${FONT_BODY}`;
    const maxW = Math.min(820, view.w - 24 - view.safe.l - view.safe.r);
    const tw = c ? Math.min(ctx.measureText(c.text).width, maxW - tagW - 80) : 0;
    const w = tagW + (c ? tw + 80 : 0);
    const h = 56;
    const x = view.w / 2 - w / 2;
    const y = this.bot.captionY ?? view.h - h - 8 - view.safe.b;
    ctx.fillStyle = PAL.ink;
    chamfer(ctx, x, y, w, h, 8);
    ctx.fill();
    // The tag.
    const slow = this.speed < 0.8;
    ctx.fillStyle = slow ? PAL.college : PAL.gold;
    chamfer(ctx, x + 5, y + 5, tagW - 10, h - 10, 5);
    ctx.fill();
    if (Math.floor(this.age * 1.6) % 2 === 0) {
      ctx.fillStyle = PAL.ink;
      ctx.beginPath();
      ctx.moveTo(x + 15, y + 15);
      ctx.lineTo(x + 25, y + 22);
      ctx.lineTo(x + 15, y + 29);
      ctx.fill();
    }
    text(ctx, slow ? 'SLOW-MO' : 'DEMO', x + 30, y + 23, { size: slow ? 20 : 22, font: 'display', track: 1, align: 'left', color: PAL.ink });
    text(ctx, 'tap to skip', x + tagW / 2, y + 41, { size: 12, font: 'body', weight: 700, color: 'rgba(38,34,79,0.75)' });
    if (!c) return;
    // The line.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + tagW, y, w - tagW, h);
    ctx.clip();
    const dy = (1 - k) * 12;
    ctx.globalAlpha = k;
    drawIcon(ctx, c, x + tagW + 30, y + h / 2 + dy, 18);
    text(ctx, c.text, x + tagW + 60, y + h / 2 + 1 + dy, { size, font: 'body', weight: 700, align: 'left', color: PAL.cream, maxWidth: maxW - tagW - 80 });
    ctx.restore();
  }

  /**
   * The bot's two thumbs, see-through, coming in from the bottom corners:
   * pressed, a fingertip on the spot with a ring going out; up, lifted off it
   * a little and fading.
   */
  drawThumbs(ctx, view) {
    const now = this.clock;
    for (const side of ['L', 'R']) {
      const th = this.thumbs[side];
      if (!th.seen) continue;
      const since = now - th.t;
      const pressed = th.down || since < TAP_HOLD;
      const lift = pressed ? 0 : Math.min(1, (since - TAP_HOLD) / 0.12);
      const fade = th.down ? 1 : Math.max(0.35, 1 - Math.max(0, since - 0.6) / 0.8);
      // The thumb points in from its own corner.
      const ang = side === 'L' ? 0.55 : -0.55;
      const ox = (side === 'L' ? -1 : 1) * 10 * lift;
      const oy = 16 * lift;
      ctx.save();
      ctx.globalAlpha = 0.55 * fade;
      ctx.translate(th.x + ox, th.y + oy + 6);
      ctx.rotate(ang);
      const s = pressed ? 0.94 : 1.04;
      ctx.scale(s, s);
      // The thumb: a long rounded body, the pad of the tip at the origin.
      const r = 24;
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.arc(0, 0, r, Math.PI, 0);
      ctx.lineTo(r * 1.05, r * 4.2);
      ctx.lineTo(-r * 1.05, r * 4.2);
      ctx.closePath();
      ctx.fillStyle = '#f6d6be';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(40,30,60,0.8)';
      ctx.stroke();
      // The nail.
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.12, r * 0.55, r * 0.68, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,240,235,0.95)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(40,30,60,0.45)';
      ctx.stroke();
      ctx.restore();
      // A ring where it pressed.
      if (since < 0.35) {
        const k = since / 0.35;
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(th.x, th.y, 18 + k * 34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  drawEndCard(ctx, view) {
    ctx.fillStyle = 'rgba(23,20,58,0.72)';
    ctx.fillRect(0, 0, view.w, view.h);
    const w = Math.min(560, view.w - 40);
    const h = 250;
    const x = view.w / 2 - w / 2;
    const y = view.h / 2 - 120;
    slab(ctx, x, y, w, h, { face: PAL.ink, lip: PAL.inkShade, lipH: 7, c: 10 });
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(x + 10, y, w - 20, 5);
    text(ctx, this.ev.name.toUpperCase(), view.w / 2, y + 40, { size: 32, font: 'display', track: 2, color: PAL.gold, maxWidth: w - 40 });
    text(ctx, 'Your turn!', view.w / 2, y + 82, { size: 19, font: 'body', weight: 600, color: PAL.cream, maxWidth: w - 40 });
    this.buttons.forEach((b) => b.draw(ctx));
  }
}
