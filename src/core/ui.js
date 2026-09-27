// Canvas UI helpers: text, rounded rects and tappable buttons (logical coords).

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function text(ctx, str, x, y, { size = 24, color = '#fff', align = 'center', baseline = 'middle', weight = 700, shadow = false, maxWidth = 0 } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  if (maxWidth) {
    // Shrink-to-fit so labels survive narrow (4:3) screens.
    const w = ctx.measureText(str).width;
    if (w > maxWidth) ctx.font = `${weight} ${Math.floor((size * maxWidth) / w)}px ${FONT}`;
  }
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(str, x + 2, y + 3);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
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

export class Button {
  constructor({ x = 0, y = 0, w = 200, h = 56, label = '', sub = '', enabled = true, color = '#e4572e', onTap = null }) {
    Object.assign(this, { x, y, w, h, label, sub, enabled, color, onTap });
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

  draw(ctx) {
    const inset = this.pressT > 0 ? 3 : 0;
    roundRect(ctx, this.x + inset, this.y + inset, this.w - inset * 2, this.h - inset * 2, 14);
    ctx.fillStyle = this.enabled ? this.color : 'rgba(255,255,255,0.12)';
    ctx.fill();
    const cy = this.y + this.h / 2;
    if (this.sub) {
      text(ctx, this.label, this.x + this.w / 2, cy - 9, { size: 22, maxWidth: this.w - 14, color: this.enabled ? '#fff' : 'rgba(255,255,255,0.45)' });
      text(ctx, this.sub, this.x + this.w / 2, cy + 14, { size: 13, weight: 500, color: this.enabled ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)' });
    } else {
      text(ctx, this.label, this.x + this.w / 2, cy, { size: 22, maxWidth: this.w - 14, color: this.enabled ? '#fff' : 'rgba(255,255,255,0.45)' });
    }
  }
}
