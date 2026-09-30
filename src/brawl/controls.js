import { text } from '../core/ui.js';
import { EMOTES } from './poses.js';

/**
 * Controls for the late hits, two thumbs as in the events:
 * - left thumb: put it down anywhere on the left of the screen and drag to walk
 *   (a stick appears where you put it down);
 * - right thumb: PUNCH, KICK and SLAM buttons, and the emote button: hold it,
 *   drag toward an emote on the wheel and let go to play it (let go in the
 *   middle for none).
 * Keyboard: arrows / WASD walk, J punch, K kick, L slam, 1-6 emotes.
 *
 * The scene passes its input events to handle(); each step, read() says where
 * the stick points and which moves were pressed since the last read.
 */
const STICK_R = 56; // px of drag for full speed
const BTN = [
  { move: 'punch', label: 'PUNCH', key: 'KeyJ', color: '#e4572e', r: 42, at: [66, 76] },
  { move: 'kick', label: 'KICK', key: 'KeyK', color: '#2f7fd8', r: 38, at: [162, 62] },
  { move: 'slam', label: 'SLAM', key: 'KeyL', color: '#8e44ad', r: 38, at: [70, 180] },
];
const EMOTE_BTN = { r: 30, at: [176, 164] };
const WHEEL = { r: 120, inner: 38 };
const MOVE_KEYS = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, 1], KeyW: [0, 1], ArrowDown: [0, -1], KeyS: [0, -1],
};

export class BrawlControls {
  constructor(input) {
    this.input = input;
    this.stick = null; // { id, ox, oy, x, y }
    this.wheel = null; // { id, ox, oy, pick }: the emote wheel, open while the button is held
    this.keys = new Set();
    this.moves = []; // pressed since the last read: 'punch' | 'kick' | 'slam' | { emote }
    this.flash = {}; // move -> s of button-press glow left
    this.top = 70; // taps above this are the scene's (its bar of buttons)
    this.buttons = [];
    this.emoteBtn = null;
  }

  layout(view, top) {
    this.view = view;
    this.top = top;
    const R = view.w - view.safe.r;
    const B = view.h - view.safe.b;
    this.buttons = BTN.map((b) => ({ ...b, x: R - b.at[0], y: B - b.at[1] }));
    this.emoteBtn = { ...EMOTE_BTN, x: R - EMOTE_BTN.at[0], y: B - EMOTE_BTN.at[1] };
  }

  /** Handles one input event; true if it was the controls'. */
  handle(e) {
    if (e.type === 'key') {
      if (MOVE_KEYS[e.code]) this.keys.add(e.code);
      else {
        const b = BTN.find((x) => x.key === e.code);
        if (b) this.press(b.move);
        else if (/^Digit[1-6]$/.test(e.code)) this.moves.push({ emote: EMOTES[+e.code.slice(5) - 1].id });
        else return false;
      }
      return true;
    }
    if (e.type === 'keyup') {
      this.keys.delete(e.code);
      return !!MOVE_KEYS[e.code];
    }
    if (e.type === 'up') {
      if (this.stick?.id === e.id) this.stick = null;
      if (this.wheel?.id === e.id) this.closeWheel(e.x, e.y);
      return true;
    }
    if (e.type !== 'down' || !this.view) return false;
    if (e.y < this.top) return false;
    const hit = (b, slack = 10) => Math.hypot(e.x - b.x, e.y - b.y) <= b.r + slack;
    const b = this.buttons.find((x) => hit(x));
    if (b) {
      this.press(b.move);
      return true;
    }
    if (hit(this.emoteBtn, 6)) {
      this.wheel = { id: e.id, ox: e.x, oy: e.y, pick: null };
      return true;
    }
    if (e.x < this.view.w * 0.5) {
      this.stick = { id: e.id, ox: e.x, oy: e.y, x: e.x, y: e.y };
      return true;
    }
    return false;
  }

  press(move) {
    this.moves.push(move);
    this.flash[move] = 0.15;
  }

  closeWheel(x, y) {
    this.track(this.wheel, x, y);
    if (this.wheel.pick != null) this.moves.push({ emote: EMOTES[this.wheel.pick].id });
    this.wheel = null;
  }

  /** Follows a finger on the wheel: which emote it points at, if it's moved far enough. */
  track(w, x, y) {
    const dx = x - w.ox;
    const dy = y - w.oy;
    if (Math.hypot(dx, dy) < 26) {
      w.pick = null;
      return;
    }
    const n = EMOTES.length;
    const a = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2 + Math.PI / n) % (Math.PI * 2); // 0 = straight up
    w.pick = Math.floor(a / ((Math.PI * 2) / n)) % n;
  }

  /** Stick direction ({ mx, md }, -1..1, md + = away from you) and the moves pressed since last time. */
  read(dt) {
    for (const k of Object.keys(this.flash)) this.flash[k] = Math.max(0, this.flash[k] - dt);
    let mx = 0;
    let md = 0;
    const s = this.stick;
    if (s) {
      const p = this.input.pointers.get(s.id);
      if (!p) this.stick = null; // lifted without us hearing (the phone took the touch back)
      else {
        [s.x, s.y] = [p.x, p.y];
        const dx = (s.x - s.ox) / STICK_R;
        const dy = (s.y - s.oy) / STICK_R;
        const m = Math.hypot(dx, dy);
        const k = m > 1 ? 1 / m : 1;
        mx = dx * k;
        md = -dy * k;
      }
    }
    for (const code of this.keys) {
      mx += MOVE_KEYS[code][0];
      md += MOVE_KEYS[code][1];
    }
    const m = Math.hypot(mx, md);
    if (m > 1) [mx, md] = [mx / m, md / m];
    if (this.wheel) {
      const p = this.input.pointers.get(this.wheel.id);
      if (p) this.track(this.wheel, p.x, p.y);
      else this.closeWheel(this.wheel.ox, this.wheel.oy); // taken back by the phone: no emote
    }
    const moves = this.moves;
    this.moves = [];
    return { mx, md, moves };
  }

  release() {
    this.stick = null;
    this.wheel = null;
    this.keys.clear();
    this.moves = [];
  }

  draw(ctx, view) {
    // The stick, where your thumb went down (or a faint one at rest, bottom left).
    const s = this.stick;
    const base = s ? { x: s.ox, y: s.oy } : { x: view.safe.l + 100, y: view.h - view.safe.b - 96 };
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(base.x, base.y, STICK_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    let kx = base.x;
    let ky = base.y;
    if (s) {
      const dx = s.x - s.ox;
      const dy = s.y - s.oy;
      const m = Math.hypot(dx, dy);
      const k = m > STICK_R ? STICK_R / m : 1;
      kx += dx * k;
      ky += dy * k;
    }
    ctx.fillStyle = s ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(kx, ky, 24, 0, Math.PI * 2);
    ctx.fill();
    if (!s) text(ctx, 'MOVE', base.x, base.y + STICK_R + 14, { size: 12, color: 'rgba(255,255,255,0.7)', shadow: true });

    for (const b of this.buttons) {
      const lit = this.flash[b.move] > 0;
      ctx.fillStyle = b.color;
      ctx.globalAlpha = lit ? 1 : 0.82;
      ctx.beginPath();
      ctx.arc(b.x, b.y, lit ? b.r - 3 : b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      text(ctx, b.label, b.x, b.y + 1, { size: b.r > 40 ? 15 : 14, color: '#fff', weight: 900 });
    }
    const e = this.emoteBtn;
    ctx.fillStyle = this.wheel ? '#ffd23f' : 'rgba(255,210,63,0.85)';
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, '😀', e.x, e.y + 1, { size: 26 });
    if (this.wheel) this.drawWheel(ctx, view);
  }

  /** The emote wheel, in the middle of the screen: slices round a centre, the one you point at lit. */
  drawWheel(ctx, view) {
    const cx = view.w / 2;
    const cy = view.h / 2 + 10;
    const n = EMOTES.length;
    const step = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 - step / 2 + i * step;
      const lit = this.wheel.pick === i;
      ctx.fillStyle = lit ? 'rgba(255,210,63,0.92)' : 'rgba(12,22,44,0.82)';
      ctx.beginPath();
      ctx.arc(cx, cy, WHEEL.r, a0 + 0.02, a0 + step - 0.02);
      ctx.arc(cx, cy, WHEEL.inner, a0 + step - 0.02, a0 + 0.02, true);
      ctx.closePath();
      ctx.fill();
      const am = a0 + step / 2;
      const rx = cx + Math.cos(am) * (WHEEL.r + WHEEL.inner) / 2;
      const ry = cy + Math.sin(am) * (WHEEL.r + WHEEL.inner) / 2;
      text(ctx, EMOTES[i].icon, rx, ry - 8, { size: 28 });
      text(ctx, EMOTES[i].label, rx, ry + 20, { size: 12, color: lit ? '#12203a' : '#fff', weight: 800 });
    }
    ctx.fillStyle = 'rgba(12,22,44,0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, WHEEL.inner - 4, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, this.wheel.pick == null ? 'drag' : '✓', cx, cy + 1, { size: 13, color: 'rgba(255,255,255,0.8)' });
  }
}
