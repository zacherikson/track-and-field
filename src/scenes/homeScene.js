import { text, PAL, FONT_DISPLAY } from '../core/ui.js';
import { drawIcon } from '../core/icons.js';
import { chooseGhost } from '../online/ghost.js';
import { AthletePanel } from './home/athletePanel.js';
import { PlayPanel } from './home/playPanel.js';
import { SquadPanel } from './home/squadPanel.js';
import { ShopPanel } from './home/shopPanel.js';
import { ContractPanel } from './home/contractPanel.js';

/** The home screen's tabs, left to right. */
export const TABS = ['shop', 'athlete', 'play', 'squad', 'contract'];
const TAB_LOOK = [
  { icon: 'shop', label: 'Shop' },
  { icon: 'athlete', label: 'Athlete' },
  { icon: 'play', label: 'Play' },
  { icon: 'squad', label: 'Squad' },
  { icon: 'contract', label: 'Contract' },
];

const BAR_H = 58; // the tab bar, above the bottom safe area
const SWIPE = 60; // a finger moved this far sideways (and more sideways than up or down) changes tab
const DRAG = 14; // past this the panels follow the finger, and the touch is no longer a tap
const TAP = 24; // a touch that ends within this of where it started is a tap

/**
 * The home screen, Clash Royale style: five panels side by side, Shop |
 * Athlete | Play | Squad | Contract, with a tab bar along the bottom. Tap a tab or swipe sideways
 * to move between them; the panels slide.
 *
 * Panels (home/*.js) are laid out over the whole screen above the tab bar and
 * get the same calls as a scene, except that input comes sorted: taps go to
 * the panel showing (as a 'down' at the touch's start, sent once the finger
 * lifts, so a swipe that starts on a button doesn't press it), and keys too.
 * Tapping the tab you're already on takes it back to its start (Play: the
 * vs Computer and Live buttons, out of any list).
 * A panel with `badge` true gets a dot on its tab (Contract: an offer waiting).
 * Keyboard: 1 to 5 or Q / E change tab, Esc steps back within a tab, then to Play.
 */
export class HomeScene {
  constructor(tab = 'play') {
    this.tab = Math.max(0, TABS.indexOf(tab));
    this.wantsReleases = true; // swipes need the finger lifts
  }

  enter() {
    chooseGhost(null); // back home: events race your own best again
    this.pos = this.tab; // where the panels are (a tab index, fractional while they slide)
    this.drag = 0; // how far a finger has dragged them, px
    this.press = null; // the touch being followed: { id, x, y, down, dragging, lost }
    this.tabPressT = TABS.map(() => 0);
    this.panels = [new ShopPanel(this), new AthletePanel(this), new PlayPanel(this), new SquadPanel(this), new ContractPanel(this)];
    this.panels.forEach((p) => p.enter());
    this.layout(this.game.view);
  }

  onResize(view) {
    this.layout(view);
  }

  exit() {
    this.panels.forEach((p) => p.exit?.());
  }

  layout(view) {
    this.barTop = view.h - BAR_H - view.safe.b;
    const w = Math.min(210, (view.w - 2 * (14 + Math.max(view.safe.l, view.safe.r))) / TABS.length);
    this.tabBoxes = TABS.map((_, i) => ({ x: view.w / 2 + (i - TABS.length / 2) * w, y: this.barTop, w, h: BAR_H }));
    this.panels.forEach((p) => p.layout(view, this.barTop));
  }

  /** Goes to the tab called `name` ('shop', 'athlete', ...: TABS). */
  showTab(name) {
    this.show(TABS.indexOf(name));
  }

  /** Goes to tab `i` (clamped to the ends). */
  show(i) {
    i = Math.max(0, Math.min(TABS.length - 1, i));
    if (i === this.tab) return;
    this.tab = i;
    this.panels[i].onShow();
  }

  update(dt, t) {
    const events = []; // for the panel showing
    for (const e of this.game.input.consume(t + dt)) {
      if (e.type === 'key') {
        const digit = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code);
        if (digit >= 0) this.show(digit);
        else if (e.code === 'KeyQ' || e.code === 'KeyE') this.show(this.tab + (e.code === 'KeyE' ? 1 : -1));
        else if (e.code === 'Escape') {
          // A step back within the tab (out of a list, or of picking a slot), else to Play.
          if (!this.panels[this.tab].back?.()) this.show(TABS.indexOf('play'));
        }
        else events.push(e);
        continue;
      }
      if (e.type === 'down') {
        if (e.y >= this.barTop) {
          const k = this.tabBoxes.findIndex((b) => e.x >= b.x && e.x <= b.x + b.w);
          if (k >= 0) {
            this.tabPressT[k] = 0.12;
            if (k === this.tab) this.panels[k].top?.(); // already here: back to the tab's start
            else this.show(k);
          }
        } else if (!this.press) {
          this.press = { id: e.id, x: e.x, y: e.y, down: e, dragging: false, lost: 0 };
        }
        continue;
      }
      if (e.type === 'up' && this.press?.id === e.id) {
        const dx = e.x - this.press.x;
        const dy = e.y - this.press.y;
        if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy) * 1.2) this.show(this.tab + (dx < 0 ? 1 : -1));
        else if (!this.press.dragging && Math.hypot(dx, dy) < TAP) events.push(this.press.down);
        this.press = null;
      }
    }

    // While a finger is down the panels follow it sideways (a little, past the ends).
    this.drag = 0;
    if (this.press) {
      const p = this.game.input.pointers.get(this.press.id);
      if (p) {
        this.press.lost = 0;
        const dx = p.x - this.press.x;
        if (!this.press.dragging && Math.abs(dx) > DRAG && Math.abs(dx) > Math.abs(p.y - this.press.y)) this.press.dragging = true;
        if (this.press.dragging) this.drag = (this.tab === 0 && dx > 0) || (this.tab === TABS.length - 1 && dx < 0) ? dx * 0.3 : dx;
      } else if ((this.press.lost += dt) > 0.4) {
        this.press = null; // its lift never came (a dialog took it)
      }
    }

    for (let i = 0; i < this.panels.length; i++) {
      this.panels[i].update(dt, i === this.tab ? events : []);
      if (this.game.scene !== this) return; // a panel has moved on to another screen
    }
    this.tabPressT = this.tabPressT.map((p) => Math.max(0, p - dt));
    this.pos += (this.tab - this.pos) * Math.min(1, dt * 14);
    if (Math.abs(this.tab - this.pos) < 0.001) this.pos = this.tab;
  }

  render(ctx, view) {
    // Flat ink; a panel paints its own scenery over it (Play: Pinebrook Park).
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(0, 0, view.w, view.h);

    this.panels.forEach((p, i) => {
      const x = (i - this.pos) * view.w + this.drag;
      if (x <= -view.w || x >= view.w) return;
      ctx.save();
      ctx.translate(x, 0);
      p.render(ctx, view);
      ctx.restore();
    });

    // The tab bar: ink under a gold rule; the tab you're on is a cream
    // trapezoid that rises out of it, capped in gold.
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(0, this.barTop, view.w, view.h - this.barTop);
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(0, this.barTop, view.w, 3);
    this.tabBoxes.forEach((b, i) => {
      const on = i === this.tab;
      const sink = this.tabPressT[i] > 0 ? 3 : 0;
      if (on) {
        const top = b.y - 10 + sink;
        ctx.fillStyle = PAL.cream;
        ctx.beginPath();
        ctx.moveTo(b.x + 8, top);
        ctx.lineTo(b.x + b.w - 8, top);
        ctx.lineTo(b.x + b.w - 2, b.y + b.h);
        ctx.lineTo(b.x + 2, b.y + b.h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = PAL.gold;
        ctx.fillRect(b.x + 8, top, b.w - 16, 5);
      }
      const ink = on ? PAL.ink : 'rgba(245,234,208,0.62)';
      const { icon, label } = TAB_LOOK[i];
      const size = on ? 24 : 21;
      const cy = b.y + b.h / 2 - 1 + sink;
      // Icon and label side by side, centred in the tab.
      ctx.font = `900 ${size}px ${FONT_DISPLAY}`;
      ctx.letterSpacing = '1px';
      const lw = ctx.measureText(label.toUpperCase()).width;
      ctx.letterSpacing = '0px';
      const iconS = on ? 28 : 24;
      const x0 = b.x + b.w / 2 - (iconS + 8 + lw) / 2;
      drawIcon(ctx, icon, x0 + iconS / 2, cy - 1, iconS, ink);
      if (this.panels[i].badge) {
        // Something waiting there: a dot on the icon's corner.
        ctx.fillStyle = PAL.brick;
        ctx.beginPath();
        ctx.arc(x0 + iconS - 1, cy - iconS / 2 + 2, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = PAL.cream;
        ctx.stroke();
      }
      text(ctx, label.toUpperCase(), x0 + iconS + 8, cy, { size, font: 'display', align: 'left', track: 1, color: ink });
    });
  }
}
