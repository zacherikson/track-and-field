import { Button, text, slab, titlePlate, PAL } from '../core/ui.js';
import { EVENTS, SPECIAL_EVENTS } from '../events/registry.js';
import { setCampaign } from '../core/storage.js';
import { flow } from '../flow.js';
import { drawSteps } from './howTo.js';

const TAB_LABELS = { sprint100: '100m', longjump: 'Long jump', hurdles110: 'Hurdles', polevault: 'Pole vault', javelin: 'Javelin', relay4x100: '4×100m', timetrial: 'Time trial' };
// Every event, the five then the special ones (read when needed: the registry may still be loading when this is).
const list = () => [...EVENTS, ...SPECIAL_EVENTS];
const BOX_Y = 122;
const BOX_H = 340;

let lastId = null; // the tab you looked at last, for the next visit

/**
 * How to Play (the Play tab's How to play button): a tab per event, the five then the
 * special events, each with its steps (howTo.js) and a Practice button that
 * takes you to its card (Training for the five). Back goes to the Play tab.
 */
export class TutorialScene {
  constructor(id = null) {
    this.id = id ?? lastId ?? list()[0].id;
  }

  enter() {
    this.list = list();
    this.backBtn = new Button({ label: 'Back', icon: 'back', look: 'chip', w: 112, h: 46, onTap: () => flow.menu(this.game) });
    this.playBtn = new Button({ label: 'Practice', icon: 'next', w: 210, h: 54, color: PAL.liveGreen, lip: PAL.liveShade, onTap: () => this.practice() });
    this.tabs = this.list.map((ev) => new Button({ label: TAB_LABELS[ev.id] ?? ev.name, icon: ev.id, h: 40, size: 16, color: PAL.ink2, onTap: () => this.show(ev.id) }));
    this.show(this.id);
    this.layout(this.game.view);
  }

  get ev() {
    return this.list.find((e) => e.id === this.id);
  }

  show(id) {
    this.id = lastId = id;
    this.tabs.forEach((t, i) => {
      const on = this.list[i].id === id;
      t.color = on ? PAL.cream : PAL.ink2; // the event showing is cream
      t.lip = on ? PAL.creamShade : PAL.inkShade;
    });
  }

  /** Off to this event's card: Training for the five (no rivals), a special event at its RIVALS level. */
  practice() {
    setCampaign(null);
    flow.intro(this.game, this.ev);
  }

  onResize(view) {
    this.layout(view);
  }

  get boxW() {
    return Math.min(760, this.game.view.w - 40);
  }

  layout(view) {
    Object.assign(this.backBtn, { x: 14 + view.safe.l, y: 10 });
    const gap = 6;
    const tabsW = Math.min(900, view.w - 32 - view.safe.l - view.safe.r);
    const tw = (tabsW - gap * (this.tabs.length - 1)) / this.tabs.length;
    this.tabs.forEach((t, i) => Object.assign(t, { x: view.w / 2 - tabsW / 2 + i * (tw + gap), y: 70, w: tw }));
    Object.assign(this.playBtn, { x: view.w / 2 - this.playBtn.w / 2, y: BOX_Y + BOX_H + 10 });
  }

  get buttons() {
    return [this.backBtn, this.playBtn, ...this.tabs];
  }

  update(dt, t) {
    for (const e of this.game.input.consume(t + dt)) {
      if (e.type === 'down') this.buttons.some((b) => b.tap(e.x, e.y));
      else if (e.code === 'Escape' || e.code === 'Backspace') return flow.menu(this.game);
      else if (e.code === 'Enter') return this.practice();
      else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        const i = this.list.findIndex((ev) => ev.id === this.id) + (e.code === 'ArrowLeft' ? -1 : 1);
        this.show(this.list[(i + this.list.length) % this.list.length].id);
      }
      if (this.game.scene !== this) return; // a button took us on
    }
    this.buttons.forEach((b) => b.update(dt));
  }

  render(ctx, view) {
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(0, 0, view.w, view.h);
    titlePlate(ctx, view, 'HOW TO PLAY', '', { y: 32, face: PAL.gold, ink: PAL.ink });
    const w = this.boxW;
    const x0 = view.w / 2 - w / 2;
    slab(ctx, x0, BOX_Y, w, BOX_H, { face: PAL.ink2, lip: PAL.inkShade, lipH: 6, c: 8 });
    text(ctx, this.ev.name.toUpperCase(), view.w / 2, BOX_Y + 28, { size: 28, font: 'display', track: 2, color: PAL.gold });
    drawSteps(ctx, this.id, x0 + 10, BOX_Y + 48, w - 20, 54);
    this.buttons.forEach((b) => b.draw(ctx));
  }
}
