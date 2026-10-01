import { rand } from '../core/math.js';
import { EMOTES } from './poses.js';

/**
 * The computer rivals in the late hits. They start out peaceful: they stand
 * about, stroll, and never go for each other. A rival turns on you if you hit
 * them, or if you emote right in front of them; then they come after you and
 * throw punches, kicks and the odd body slam until they put you on the floor,
 * gloat with an emote, and calm down again. Pro rivals are quicker to swing.
 */
const GLOATS = ['laugh', 'flex', 'chicken', 'dab', 'taunt', 'dance'];
const TAUNT_RANGE = { x: 2.2, d: 1.2 }; // m: an emote this close to a rival starts a fight
const LEVELS = {
  amateur: { cooldown: [0.7, 1.5], speed: 0.75 },
  pro: { cooldown: [0.45, 1.0], speed: 0.9 },
};

export class BotBrain {
  constructor(fighter, level = 'amateur') {
    this.f = fighter;
    this.lv = LEVELS[level] ?? LEVELS.amateur;
    this.angry = false; // after you: you hit them, or taunted them up close
    this.floored = false; // they've just put you down (to gloat once)
    this.nextSwing = 0;
    this.nextStroll = rand(1, 4);
    this.wander = null; // { x, d, pace?, facing? } to stroll to (and which way to face there)
    this.tauntSeq = -1; // your emote they've already reacted to
    this.post = null; // { x, d, facing }: somewhere they keep to when at peace (the referee)
  }

  /** You started it: `me` hit this rival. */
  provoked(me, t) {
    if (!this.angry) this.nextSwing = t + rand(0.25, 0.6); // a beat to shake it off
    this.angry = true;
    this.wander = null;
  }

  /** This rival just knocked you down. */
  beatYou() {
    this.floored = true;
  }

  /** Walk over to (x, d) and face that way, e.g. coming over after a field event. */
  goTo(x, d, facing) {
    this.wander = { x, d, pace: 0.8, facing };
  }

  /** One step: steer the fighter and maybe start a move. `spare` = true to leave you alone. */
  update(dt, t, brawl, spare) {
    const f = this.f;
    const me = brawl.me;
    f.mx = 0;
    f.md = 0;
    if (!f.free || !me) return;
    // Emoting in a rival's face is asking for it.
    if (me.state === 'emote' && me.seq !== this.tauntSeq && Math.abs(me.x - f.x) < TAUNT_RANGE.x && Math.abs(me.d - f.d) < TAUNT_RANGE.d) {
      this.tauntSeq = me.seq;
      this.provoked(me, t);
    }
    if (this.angry) f.guardUntil = Math.max(f.guardUntil, t + 1.5); // fists up while they're after you
    if (this.angry && !spare) return this.fight(t, brawl, me);
    this.stroll(t, brawl);
  }

  fight(t, brawl, me) {
    const f = this.f;
    if (me.floored) {
      // Down: the one who put you there gloats, and they all cool off.
      if (this.floored) brawl.command(f, 'emote', t, GLOATS[Math.floor(Math.random() * GLOATS.length)]);
      this.floored = false;
      this.angry = false;
      this.nextStroll = t + rand(2, 5);
      return;
    }
    const side = Math.sign(f.x - me.x) || 1;
    const dd = me.d - f.d;
    if (Math.abs(f.x - me.x) < 1.0 && Math.abs(dd) < 0.35) {
      f.facing = Math.sign(me.x - f.x) || f.facing;
      if (t >= this.nextSwing && me.vulnerable(t)) {
        const r = Math.random();
        brawl.command(f, r < 0.5 ? 'punch' : r < 0.8 ? 'kick' : 'slam', t);
        this.nextSwing = t + rand(...this.lv.cooldown);
      }
      return;
    }
    this.steer(me.x + side * 0.7 - f.x, dd);
  }

  /** At peace: now and then wander somewhere nearby, or show off a little (or, with a post, go back to it and stay). */
  stroll(t, brawl) {
    const f = this.f;
    if (this.post && !this.wander) {
      if (Math.hypot(this.post.x - f.x, this.post.d - f.d) > 0.3) this.wander = { ...this.post, pace: 0.6 };
      else return;
    }
    if (this.wander) {
      const dx = this.wander.x - f.x;
      const dd = this.wander.d - f.d;
      if (Math.hypot(dx, dd) < 0.3) {
        if (this.wander.facing) f.facing = this.wander.facing;
        this.wander = null;
      } else this.steer(dx, dd, this.wander.pace ?? 0.45);
      return;
    }
    if (t < this.nextStroll) return;
    this.nextStroll = t + rand(3, 7);
    if (Math.random() < 0.15) {
      brawl.command(f, 'emote', t, EMOTES[Math.floor(Math.random() * EMOTES.length)].id);
      return;
    }
    const v = brawl.venue;
    this.wander = {
      x: Math.min(v.xMax - 0.5, Math.max(v.xMin + 0.5, f.x + rand(-2.5, 2.5))),
      d: Math.min(v.dMax, Math.max(v.dMin, f.d + rand(-1.5, 1.5))),
    };
  }

  steer(dx, dd, pace = 1) {
    const m = Math.hypot(dx, dd);
    if (m < 0.05) return;
    const k = (this.lv.speed * pace) / Math.max(m, 0.4);
    this.f.mx = dx * k;
    this.f.md = dd * k;
  }
}
