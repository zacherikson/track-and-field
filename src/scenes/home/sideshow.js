import { text, PAL } from '../../core/ui.js';
import { drawFigure, handPos, headCircle, BLOCK_FEET } from '../../athletes/stickFigure.js';
import { CHARACTERS, REFEREE, heightOf } from '../../athletes/roster.js';
import { drawJavelin } from '../../render/javelinField.js';
import { SKITS } from './skits.js';

/**
 * The home screens' sideshow: the other athletes (and the referee) up to no
 * good in the background, one little skit at a time: the referee punched
 * out over a red card, body slams, fight clouds, hurdle faceplants, false
 * starts, a conga line (skits.js has them all).
 *
 * A panel gives the sideshow a few SLOTS (where on its screen a skit can play:
 * an x, a ground line and a figure height) and calls update(dt) and draw(ctx,
 * slots). Each slot plays a skit, waits a few seconds, and plays another; no
 * athlete is in two at once. Looks only: nothing here is tappable.
 *
 * The skits are in skits.js; they draw through the Stage below, in their own
 * coordinates (figure heights from the slot's x). Each run is mirrored at
 * random, so everything also plays the other way round; a skit fades in, and
 * fades out once its draw() says it's over.
 */

const TAU = Math.PI * 2;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const ease = (k) => k * k * (3 - 2 * k);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const hash = (n) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}; // 0..1, the same for the same n

const FADE = 0.4; // s: a skit fades in, and out when it's over
const LONGEST = 24; // s: a skit that somehow never finishes is cut here

// ---------- the stage: drawing for a skit, in its own coordinates ----------
/**
 * Draws a skit into a slot: positions `u` in figure heights from the slot's
 * x (+ to the right, or the left if this run is mirrored), heights `v` in
 * figure heights above the ground there. `left` and `right` are the edges of
 * the screen, in the same units.
 */
class Stage {
  constructor(ctx, slot, m, w) {
    this.ctx = ctx;
    this.ox = slot.x;
    this.H = slot.H;
    this.m = m;
    this.groundAt = slot.groundAt ?? (() => slot.ground);
    const a = -this.ox / (m * this.H);
    const b = (w - this.ox) / (m * this.H);
    this.left = Math.min(a, b);
    this.right = Math.max(a, b);
  }

  X(u) {
    return this.ox + this.m * u * this.H;
  }

  /** Screen y of a point `v` figure heights over the ground at `u`. */
  Y(u, v = 0) {
    return this.groundAt(this.X(u)) - v * this.H;
  }

  toU(px) {
    return (px - this.ox) / (this.m * this.H);
  }

  toV(u, py) {
    return (this.groundAt(this.X(u)) - py) / this.H;
  }

  /** Where a figure would be: screen position, drawn height, the pose as drawn, its head top and hands. */
  place(who, u, pose, { face = 1, lift = 0, rot = 0 } = {}) {
    const h = this.H * heightOf(who.colors);
    const flip = face * this.m < 0;
    const p = flip ? { ...pose, flip: true } : pose;
    const x = this.X(u);
    const g = this.groundAt(x);
    const y = g - lift * this.H;
    const hc = headCircle(x, y, h, pose);
    return { x, y, g, h, p, rot: rot * (flip ? -1 : 1), headX: flip ? 2 * x - hc.x : hc.x, headY: hc.y - hc.r, hand: (i) => handPos(x, y, h, p, i) };
  }

  /** Draws `who` `u` along in `pose`, facing + (face 1) or back (-1), `lift` off the ground, spun `rot` about the hips. */
  fig(who, u, pose, opts) {
    const f = this.place(who, u, pose, opts);
    const { ctx } = this;
    if (f.rot) {
      const hx = f.x + (f.p.flip ? -1 : 1) * pose.hipX * f.h;
      const hy = f.y + pose.hipY * f.h;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(f.rot);
      ctx.translate(-hx, -hy);
      drawFigure(ctx, f.x, f.y, f.h, f.p, who.colors, f.g);
      ctx.restore();
      f.headY = f.y - f.h * 1.1; // spinning: say things from above it
    } else drawFigure(ctx, f.x, f.y, f.h, f.p, who.colors, f.g);
    return f;
  }

  /** `str` (an emoji) over figure `f`'s head while from <= t < to, popping in. */
  say(f, str, t, from, to) {
    if (t < from || t >= to) return;
    const age = t - from;
    const size = Math.max(14, f.h * 0.3);
    const k = age < 0.15 ? ease(age / 0.15) * 1.2 : 1.2 - 0.2 * clamp((age - 0.15) / 0.12, 0, 1);
    const { ctx } = this;
    ctx.save();
    ctx.translate(f.headX, f.headY - size * 0.62 + Math.sin(age * 5) * size * 0.06);
    ctx.scale(k, k);
    text(ctx, str, 0, 0, { size });
    ctx.restore();
  }

  /** A comic-book hit, `age` s after it lands: a gold burst with `word` on it. */
  pow(x, y, age, word, size = this.H * 0.34) {
    const LIFE = 0.45;
    if (age < 0 || age > LIFE) return;
    const { ctx } = this;
    const k = age < 0.06 ? age / 0.06 : 1 + 0.15 * ((age - 0.06) / (LIFE - 0.06));
    ctx.save();
    ctx.globalAlpha *= age > 0.3 ? 1 - (age - 0.3) / (LIFE - 0.3) : 1;
    ctx.translate(x, y);
    ctx.scale(k, k);
    const n = 9;
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = (i % 2 ? 0.55 : 1) * size * (word ? 1 : 0.6);
      const a = (i / (n * 2)) * TAU + 0.2;
      ctx.lineTo(Math.cos(a) * r * 1.15, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = PAL.gold;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, size * 0.07);
    ctx.strokeStyle = PAL.ink;
    ctx.stroke();
    if (word) {
      ctx.rotate(-0.12);
      text(ctx, word, 0, 1, { size: Math.round(size * (word.length > 5 ? 0.42 : 0.52)), font: 'display', color: PAL.ink });
    }
    ctx.restore();
  }

  /** A puff of dust at `u`, `age` s old. */
  dust(u, age) {
    const LIFE = 0.6;
    if (age < 0 || age > LIFE) return;
    const { ctx, H } = this;
    const k = age / LIFE;
    const x = this.X(u);
    const y = this.Y(u);
    ctx.fillStyle = `rgba(245,234,208,${0.7 * (1 - k)})`;
    for (const [dx, s] of [[-0.25, 0.8], [0, 1], [0.25, 0.8]]) {
      ctx.beginPath();
      ctx.arc(x + (dx + Math.sign(dx) * 0.2 * k) * H, y - (0.04 + 0.06 * k) * H, (0.05 + 0.09 * k) * s * H, 0, TAU);
      ctx.fill();
    }
  }

  /** Runs `draw(ctx, H)` with the origin at `u` on the ground (`lift` up), facing +, tilted `tilt` (+ = top forward). */
  prop(u, tilt, lift, draw) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(this.X(u), this.Y(u, lift));
    ctx.scale(this.m, 1);
    ctx.rotate(tilt);
    draw(ctx, this.H);
    ctx.restore();
  }

  /** A hurdle seen side on: a foot pointing back, the post, the striped board on top. */
  hurdle(u, tilt = 0, lift = 0) {
    this.prop(u, tilt, lift, (ctx, H) => {
      const hh = 0.56 * H;
      const lw = Math.max(2, 0.035 * H);
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2d3340';
      ctx.lineWidth = lw * 1.3;
      ctx.beginPath();
      ctx.moveTo(-0.24 * H, 0);
      ctx.lineTo(0, 0);
      ctx.stroke();
      ctx.strokeStyle = '#8b93a3';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -hh);
      ctx.stroke();
      ctx.fillStyle = PAL.cream;
      ctx.fillRect(-0.035 * H, -hh - 0.02 * H, 0.07 * H, 0.13 * H);
      ctx.fillStyle = PAL.ink;
      ctx.fillRect(-0.035 * H, -hh + 0.025 * H, 0.07 * H, 0.035 * H);
    });
  }

  /** A javelin centred `u` along, `v` up, at `ang` (+ = tip up, pointing +), `len` figure heights long. */
  javelin(u, v, ang, len) {
    const a = this.m > 0 ? ang : Math.PI - ang;
    drawJavelin(this.ctx, this.X(u), this.Y(u, v), len * this.H, a, Math.max(2, 0.03 * this.H));
  }

  /** The referee's red card, in figure `f`'s near hand. */
  card(f) {
    const p = f.hand(0);
    const { ctx, H } = this;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(f.p.flip ? 0.2 : -0.2);
    ctx.fillStyle = '#E0322B';
    ctx.fillRect(-0.05 * H, -0.15 * H, 0.1 * H, 0.14 * H);
    ctx.restore();
  }

  /** A red flag on a short stick, up from figure `f`'s near hand. */
  flag(f) {
    const p = f.hand(0);
    const dir = f.p.flip ? -1 : 1;
    const { ctx, H } = this;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(dir, 1);
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = Math.max(1.5, 0.025 * H);
    ctx.beginPath();
    ctx.moveTo(0, 0.04 * H);
    ctx.lineTo(0, -0.32 * H);
    ctx.stroke();
    ctx.fillStyle = '#E0322B';
    ctx.fillRect(0, -0.32 * H, 0.2 * H, 0.13 * H);
    ctx.restore();
  }

  /** The flag where it fell. */
  flagDown(u) {
    this.prop(u, 1.45, 0.02, (ctx, H) => {
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = Math.max(1.5, 0.025 * H);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -0.36 * H);
      ctx.stroke();
      ctx.fillStyle = '#E0322B';
      ctx.fillRect(0, -0.36 * H, 0.2 * H, 0.13 * H);
    });
  }

  /** A relay baton in figure `f`'s near hand, held up. */
  baton(f) {
    const p = f.hand(0);
    const { ctx, H } = this;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = PAL.gold;
    ctx.lineWidth = Math.max(2, 0.045 * H);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + 0.06 * H);
    ctx.lineTo(p.x + (f.p.flip ? -0.04 : 0.04) * H, p.y - 0.12 * H);
    ctx.stroke();
    ctx.restore();
  }

  /** Starting blocks for an athlete whose feet are at `u`: the two footplates, a rail between. */
  blocks(u) {
    this.prop(u, 0, 0, (ctx, H) => {
      const a = BLOCK_FEET.plateAngle;
      ctx.fillStyle = '#2d3340';
      ctx.fillRect(BLOCK_FEET.rear * H - 0.06 * H, -0.015 * H, (BLOCK_FEET.front - BLOCK_FEET.rear) * H + 0.08 * H, 0.015 * H);
      ctx.fillStyle = '#8b93a3';
      for (const fx of [BLOCK_FEET.front, BLOCK_FEET.rear]) {
        ctx.beginPath();
        ctx.moveTo(fx * H, 0);
        ctx.lineTo(fx * H - 0.07 * H, 0);
        ctx.lineTo(fx * H - 0.07 * H, -0.07 * H * Math.tan(a));
        ctx.closePath();
        ctx.fill();
      }
    });
  }

  /** The starter's pistol in figure `f`'s near hand, pointing up. */
  pistol(f) {
    const p = f.hand(0);
    const { ctx, H } = this;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(f.p.flip ? -1 : 1, 1);
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(-0.02 * H, -0.12 * H, 0.04 * H, 0.12 * H); // barrel
    ctx.fillRect(-0.02 * H, -0.02 * H, 0.07 * H, 0.04 * H); // grip
    ctx.restore();
  }

  /**
   * A vault pole through point (x, y) on screen (between the hands), `back`
   * figure heights of it behind and the rest of `len` ahead, tip up at `ang`
   * (+ = tip up), pointing the way figure `f` faces.
   */
  pole(f, x, y, ang, len, back) {
    const dir = f.p.flip ? -1 : 1;
    const dx = Math.cos(ang) * dir * this.H;
    const dy = -Math.sin(ang) * this.H;
    const { ctx } = this;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = Math.max(2.5, 0.04 * this.H);
    ctx.beginPath();
    ctx.moveTo(x - dx * back, y - dy * back);
    ctx.lineTo(x + dx * (len - back), y + dy * (len - back));
    ctx.stroke();
    ctx.strokeStyle = '#5FA8D8';
    ctx.lineWidth = Math.max(1.5, 0.025 * this.H);
    ctx.stroke();
    ctx.restore();
  }

  /** The finish: a chequered line across the track and a post with a chequered flag. */
  finishLine(u) {
    this.prop(u, 0, 0, (ctx, H) => {
      const sq = 0.035 * H;
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 2; j++) {
          ctx.fillStyle = (i + j) % 2 ? PAL.ink : PAL.cream;
          ctx.fillRect((j - 1) * sq, -i * sq * 0.6, sq, sq * 0.6);
        }
      }
      ctx.fillStyle = PAL.cream;
      ctx.fillRect(-0.012 * H, -0.75 * H, 0.024 * H, 0.75 * H);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 2; j++) {
          ctx.fillStyle = (i + j) % 2 ? PAL.ink : PAL.cream;
          ctx.fillRect(0.012 * H + i * 0.055 * H, -0.75 * H + j * 0.055 * H, 0.055 * H, 0.055 * H);
        }
      }
    });
  }

  /**
   * A cartoon fight cloud `v` up at `u`, `t` s into the fight: a boiling ball
   * of dust with `people`'s arms and legs flailing out of it, and stars.
   */
  cloud(u, v, t, people) {
    const { ctx, H } = this;
    const x = this.X(u);
    const y = this.Y(u, v);
    const r = 0.62 * H;
    const k = Math.floor(t * 9); // the limbs change pose 9 times a second
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = hash(k * 7 + i * 13) * TAU;
      const len = r * (1.1 + 0.35 * hash(k * 3 + i));
      const c = people[i % people.length].colors;
      const ex = x + Math.cos(a) * len * 1.25;
      const ey = y + Math.sin(a) * len;
      ctx.strokeStyle = c.skin;
      ctx.lineWidth = Math.max(2, 0.065 * H);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      if (i % 2) {
        ctx.fillStyle = c.shorts; // a shoe
        ctx.beginPath();
        ctx.arc(ex, ey, 0.045 * H, 0, TAU);
        ctx.fill();
      }
    }
    for (const [face, dy] of [[PAL.lav, 0.08], [PAL.cream, 0]]) {
      ctx.fillStyle = face;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + t * 3;
        const lr = r * (0.42 + 0.1 * Math.sin(t * 17 + i * 2.3));
        const lx = x + Math.cos(a) * r * 0.55 * 1.25;
        const ly = y + Math.sin(a) * r * 0.5 + dy * r;
        ctx.moveTo(lx + lr, ly);
        ctx.arc(lx, ly, lr, 0, TAU);
      }
      ctx.moveTo(x + r * 0.6, y + dy * r);
      ctx.arc(x, y + dy * r, r * 0.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    for (let i = 0; i < 2; i++) {
      const a = t * 5 + i * Math.PI;
      text(ctx, i ? '💢' : '⭐', x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.3, { size: Math.max(12, 0.24 * H) });
    }
  }
}

// ---------- the sideshow ----------
export class Sideshow {
  /** `exclude`: an athlete's id to leave out (yours, on the Play tab, where you're out on the track already). */
  constructor({ exclude = null } = {}) {
    this.exclude = exclude;
    this.slots = [];
    this.recent = []; // the last few skits, so they don't come round again too soon
    this.key = null;
  }

  update(dt) {
    for (const slot of this.slots) {
      const run = slot.run;
      if (!run) {
        if ((slot.wait -= dt) <= 0) {
          slot.run = this.start();
          slot.wait = 1; // nobody free: try again in a second
        }
        continue;
      }
      run.t += dt;
      if (run.t > LONGEST) run.endT ??= run.t;
      if (run.endT != null && run.t - run.endT > FADE) {
        slot.run = null;
        slot.wait = rand(1, 3.5);
      }
    }
  }

  /** A skit and a cast for it, from the athletes (and the referee) not in a skit already. */
  start() {
    const busy = new Set(this.slots.flatMap((s) => s.run?.cast.map((c) => c.id) ?? []));
    const free = CHARACTERS.filter((c) => c.id !== this.exclude && !busy.has(c.id));
    const fits = Object.keys(SKITS).filter((id) => {
      const need = SKITS[id].cast;
      return need.filter((r) => r === 'athlete').length <= free.length && (!need.includes('ref') || !busy.has(REFEREE.id));
    });
    if (!fits.length) return null;
    const fresh = fits.filter((id) => !this.recent.includes(id));
    const id = pick(fresh.length ? fresh : fits);
    this.recent = [id, ...this.recent].slice(0, 6);
    const pool = [...free];
    const cast = SKITS[id].cast.map((r) => (r === 'ref' ? REFEREE : pool.splice(Math.floor(Math.random() * pool.length), 1)[0]));
    return { id, cast, t: 0, endT: null, m: Math.random() < 0.5 ? 1 : -1 };
  }

  /**
   * Draws the skits playing in `slots` ([{ x, ground, H, groundAt? }] in
   * panel pixels; `groundAt(x)` for ground that isn't flat), clipped to the
   * panel (`w` x `h`). A different `key` (another page: the slots have moved)
   * starts the sideshow over.
   */
  draw(ctx, slots, { w, h, key = null }) {
    if (key !== this.key || slots.length !== this.slots.length) {
      this.key = key;
      this.slots = slots.map((_, i) => ({ run: null, wait: rand(0.3, 1.2) + i * rand(1.5, 3) }));
    }
    if (!slots.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    // Furthest back (highest on the screen) first.
    const order = slots.map((s, i) => i).sort((a, b) => slots[a].ground - slots[b].ground);
    for (const i of order) {
      const run = this.slots[i].run;
      if (!run) continue;
      const t = run.endT ?? run.t;
      ctx.save();
      ctx.globalAlpha *= Math.min(1, run.t / FADE) * (run.endT == null ? 1 : Math.max(0, 1 - (run.t - run.endT) / FADE));
      const going = SKITS[run.id].draw(new Stage(ctx, slots[i], run.m, w), t, run.cast);
      if (!going) run.endT ??= run.t;
      ctx.restore();
    }
    ctx.restore();
  }
}

/** The skits, for tools and tests: id -> { cast, draw }. */
export { SKITS, Stage };
