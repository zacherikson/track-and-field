// Canvas UI helpers: text, rounded rects and tappable buttons (logical coords).
//
// The menus' look ("Poster", Art/Home screen redesign v1): flat fills only, no
// gradients, blur or outlines. Depth is a hard LIP: the same shape in a darker
// shade a few px down, which a pressed button drops onto. Corners are chamfered
// (cut), not rounded. Type: FONT_DISPLAY (Big Shoulders Display 900, uppercase)
// for labels and titles, FONT_BODY (Barlow Semi Condensed) for the rest.
// `text()` without a `font` keeps the old system font and drop shadow, which
// the in-race HUD still uses.
import { drawIcon } from './icons.js';

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const FONT_DISPLAY = '"Big Shoulders Display", "Arial Narrow", Impact, sans-serif';
export const FONT_BODY = '"Barlow Semi Condensed", "Arial Narrow", system-ui, sans-serif';

/** The palette. `*Shade` is that colour's lip. */
export const PAL = {
  ink: '#26224F', inkShade: '#17143A', ink2: '#3A3577', ink3: '#4C468F', // the deep violet base (was navy #12203a)
  cream: '#F5EAD0', creamShade: '#E2D2AE', muted: '#7A6E55', // text, light slabs
  gold: '#F2B632', goldShade: '#C48A1C', // active, highlight, the tournament
  orange: '#E8743B', orangeShade: '#B9542A', // primary: vs Computer, Start, Tap to start
  liveGreen: '#2E8B57', liveShade: '#1F6640', // Live, Join
  brick: '#C2452F', brickShade: '#93321F', // Amateur, the track
  blue: '#3B6CC2', blueShade: '#2A4F93', // Pro, Find, Google
  magenta: '#C2407E', magentaShade: '#8F2C5C', // Special Events
  deep: '#2E6B3C', deeper: '#21502D', // Training
  peri: '#8FA3E0', sky: '#A9BAEA', lav: '#C4B8E6', mtn: '#7E78C2', mtnShade: '#6A63B0', snow: '#E9E4F5', // scenery
  chart: '#C9D64B', green: '#7FB342',
};

/** Waits (a moment at most: offline, it goes on with the fallbacks) for the menus' fonts. */
export function loadFonts(timeout = 2500) {
  if (!document.fonts?.load) return Promise.resolve();
  const want = [`900 40px "Big Shoulders Display"`, `600 17px "Barlow Semi Condensed"`, `700 17px "Barlow Semi Condensed"`, `800 17px "Barlow Semi Condensed"`];
  const loaded = Promise.all(want.map((f) => document.fonts.load(f))).catch(() => {});
  return Promise.race([loaded, new Promise((r) => setTimeout(r, timeout))]);
}

/**
 * `font`: 'display' | 'body' (the menus), or unset for the old system font.
 * `track`: letter spacing, px. `shadow`: a drop shadow (old look only).
 * Returns the drawn width.
 */
export function text(ctx, str, x, y, { size = 24, color = '#fff', align = 'center', baseline = 'middle', weight, font, track = 0, shadow = false, maxWidth = 0 } = {}) {
  const fam = font === 'display' ? FONT_DISPLAY : font === 'body' ? FONT_BODY : FONT;
  weight ??= font === 'display' ? 900 : 700;
  ctx.font = `${weight} ${size}px ${fam}`;
  if (track) ctx.letterSpacing = `${track}px`;
  if (maxWidth) {
    // Shrink-to-fit so labels survive narrow (4:3) screens.
    const w = ctx.measureText(str).width;
    if (w > maxWidth) ctx.font = `${weight} ${Math.floor((size * maxWidth) / w)}px ${fam}`;
  }
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (shadow && !font) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(str, x + 2, y + 3);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  const w = ctx.measureText(str).width;
  if (track) ctx.letterSpacing = '0px';
  return w;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A rectangle with its corners cut `c` px (the menus' shape; cut corners read printed). */
export function chamfer(ctx, x, y, w, h, c = 6) {
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

/** A slab: a flat `face` over a hard `lip` `lipH` px below (no blur). `pressed`: the face sinks onto it. */
export function slab(ctx, x, y, w, h, { face, lip, lipH = 5, c = 6, pressed = false } = {}) {
  const d = pressed ? lipH - 1 : 0;
  chamfer(ctx, x, y + lipH, w, h - lipH, c);
  ctx.fillStyle = lip;
  ctx.fill();
  chamfer(ctx, x, y + d, w, h - lipH, c);
  ctx.fillStyle = face;
  ctx.fill();
}

/** `hex` darkened to `k` of its brightness (a slab's lip), or null if it isn't a #rrggbb colour. */
export function shade(hex, k = 0.76) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const c = (s) => Math.round(((n >> s) & 255) * k).toString(16).padStart(2, '0');
  return `#${c(16)}${c(8)}${c(0)}`;
}

/** True for a light #rrggbb face (cream, gold), which takes ink lettering instead of cream. */
function light(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 170;
}

/**
 * A tappable slab. `color` is its face (#rrggbb; anything translucent, the
 * old "plain" buttons, becomes an ink slab; default orange, or ink for a
 * chip), `lip` its shade (default: the face darkened), `icon` an icons.js id
 * drawn left of the label.
 * `look: 'chip'`: a small utility button (top bars): icon and a body-type label, left-aligned.
 */
export class Button {
  constructor({ x = 0, y = 0, w = 200, h = 56, label = '', sub = '', size = 22, enabled = true, color = null, lip = null, icon = null, look = 'slab', onTap = null }) {
    const chip = look === 'chip' && color == null;
    color ??= chip ? PAL.ink : PAL.orange;
    if (chip) lip ??= PAL.inkShade;
    Object.assign(this, { x, y, w, h, label, sub, size, enabled, color, lip, icon, look, onTap });
    this.pressT = 0; // visual press feedback timer
  }

  hit(px, py) {
    return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
  }

  /** Returns true if the tap was handled. */
  tap(px, py) {
    if (!this.enabled || !this.hit(px, py)) return false;
    this.pressT = 0.12;
    this.onTap?.();
    return true;
  }

  update(dt) {
    this.pressT = Math.max(0, this.pressT - dt);
  }

  /** { face, lip, ink } for how it stands now. */
  paint() {
    if (!this.enabled) return { face: PAL.ink2, lip: PAL.inkShade, ink: 'rgba(245,234,208,0.4)' };
    const opaque = /^#[0-9a-f]{6}$/i.test(this.color ?? '');
    if (!opaque) return { face: PAL.ink, lip: PAL.inkShade, ink: PAL.cream };
    return { face: this.color, lip: this.lip ?? shade(this.color), ink: light(this.color) ? PAL.ink : PAL.cream };
  }

  draw(ctx) {
    const { face, lip, ink } = this.paint();
    const chip = this.look === 'chip';
    const lipH = chip ? 4 : 5;
    const pressed = this.pressT > 0;
    slab(ctx, this.x, this.y, this.w, this.h, { face, lip, lipH, c: chip ? 5 : 6, pressed });
    const top = this.y + (pressed ? lipH - 1 : 0);
    const cy = top + (this.h - lipH) / 2;
    if (chip) {
      if (!this.label) return drawIcon(ctx, this.icon, this.x + this.w / 2, cy, 24, ink);
      const tx = this.icon ? this.x + 40 : this.x + 14;
      if (this.icon) drawIcon(ctx, this.icon, this.x + 22, cy, 24, ink);
      text(ctx, this.label, tx, cy + 1, { size: 19, font: 'body', align: 'left', color: ink, maxWidth: this.x + this.w - 10 - tx });
      return;
    }
    const size = Math.round(this.size * 1.1);
    const label = this.label.toUpperCase();
    const ly = this.sub ? cy - 9 : cy + 1;
    // The label (and its icon) centred together.
    const iconS = this.icon ? Math.round(size * 1.05) : 0;
    const room = this.w - 16 - (iconS ? iconS + 8 : 0);
    ctx.font = `900 ${size}px ${FONT_DISPLAY}`;
    ctx.letterSpacing = '1px';
    const lw = Math.min(room, ctx.measureText(label).width);
    ctx.letterSpacing = '0px';
    const x0 = this.x + this.w / 2 - (lw + (iconS ? iconS + 8 : 0)) / 2;
    if (iconS) drawIcon(ctx, this.icon, x0 + iconS / 2, ly, iconS, ink);
    text(ctx, label, x0 + (iconS ? iconS + 8 : 0), ly, { size, font: 'display', align: 'left', track: 1, color: ink, maxWidth: room });
    if (this.sub) text(ctx, this.sub, this.x + this.w / 2, cy + 15, { size: 14, font: 'body', weight: 600, color: ink, maxWidth: this.w - 14 });
  }
}
