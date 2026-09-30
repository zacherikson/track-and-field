import { rand } from '../core/math.js';
import { EMOTES } from './poses.js';

/**
 * The computer rivals in the late hits: they pick someone (you, often), walk
 * up, and throw punches, kicks and the odd body slam, then gloat. Pro rivals
 * are quicker to swing. No more than two of them gang up on you at once; the
 * rest brawl among themselves.
 */
const GLOATS = ['laugh', 'flex', 'chicken', 'dab', 'taunt', 'dance'];
const LEVELS = {
  amateur: { think: [0.35, 0.8], cooldown: [0.7, 1.5], speed: 0.75 },
  pro: { think: [0.25, 0.6], cooldown: [0.45, 1.0], speed: 0.9 },
};

export class BotBrain {
  constructor(fighter, level = 'amateur') {
    this.f = fighter;
    this.lv = LEVELS[level] ?? LEVELS.amateur;
    this.target = null;
    this.nextThink = 0;
    this.nextSwing = rand(0.6, 1.6); // a moment before the first swing
    this.wander = null; // { x, d } to stroll to when not after anyone
    this.downed = new Set(); // who this bot has knocked down (to gloat once)
  }

  /**
   * One step: steer the fighter and maybe start a move. `spare` = true to
   * leave you alone (you're reading the results).
   */
  update(dt, t, brawl, spare) {
    const f = this.f;
    f.mx = 0;
    f.md = 0;
    if (!f.free) return;
    if (t >= this.nextThink) this.think(t, brawl, spare);
    const v = this.target;
    if (v && (spare && v.isMe)) this.target = null;
    if (this.target) {
      const v = this.target;
      if (v.floored) {
        // Down: gloat, then find someone else.
        if (!this.downed.has(v) && Math.random() < 0.5) {
          this.downed.add(v);
          if (Math.random() < 0.6) brawl.command(f, 'emote', t, GLOATS[Math.floor(Math.random() * GLOATS.length)]);
        }
        this.target = null;
        this.nextThink = t + rand(0.4, 1.2);
        return;
      }
      if (v.state === 'getup') this.downed.delete(v);
      const side = Math.sign(f.x - v.x) || 1;
      const gx = v.x + side * 0.8;
      const dx = gx - f.x;
      const dd = v.d - f.d;
      const close = Math.abs(f.x - v.x) < 1.15 && Math.abs(dd) < 0.35;
      if (close) {
        f.facing = Math.sign(v.x - f.x) || f.facing;
        if (t >= this.nextSwing && v.vulnerable(t)) {
          const r = Math.random();
          const move = r < 0.5 ? 'punch' : r < 0.8 ? 'kick' : 'slam';
          brawl.command(f, move, t);
          this.nextSwing = t + rand(...this.lv.cooldown);
        }
        return;
      }
      this.steer(dx, dd);
      return;
    }
    if (this.wander) {
      const dx = this.wander.x - f.x;
      const dd = this.wander.d - f.d;
      if (Math.hypot(dx, dd) < 0.3) this.wander = null;
      else this.steer(dx, dd, 0.5);
    }
  }

  steer(dx, dd, pace = 1) {
    const m = Math.hypot(dx, dd);
    if (m < 0.05) return;
    const k = (this.lv.speed * pace) / Math.max(m, 0.4);
    this.f.mx = dx * k;
    this.f.md = dd * k;
  }

  /** Every so often: who to go after (you half the time), or stroll, or emote. */
  think(t, brawl, spare) {
    const f = this.f;
    this.nextThink = t + rand(...this.lv.think);
    if (this.target && !this.target.floored && Math.random() < 0.75) return; // mostly stick with it
    const me = brawl.me;
    const onMe = brawl.fighters.filter((g) => g.brain?.target === me && g !== f).length;
    const others = brawl.fighters.filter((g) => g !== f && !g.floored && !(g.isMe && spare));
    const r = Math.random();
    if (r < 0.08) {
      brawl.command(f, 'emote', t, EMOTES[Math.floor(Math.random() * EMOTES.length)].id);
      this.target = null;
      return;
    }
    if (r < 0.2 || !others.length) {
      const v = brawl.venue;
      this.target = null;
      this.wander = { x: rand(v.xMin + 1, v.xMax - 1), d: rand(v.dMin, v.dMax) };
      return;
    }
    if (me && !spare && !me.floored && onMe < 2 && Math.random() < 0.5) this.target = me;
    else this.target = others[Math.floor(Math.random() * others.length)];
    this.wander = null;
  }
}
