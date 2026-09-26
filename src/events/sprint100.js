import { CONFIG } from '../config.js';
import { text } from '../core/ui.js';
import { LaneRace } from './laneRace.js';

const LEFT_KEYS = ['ArrowLeft', 'KeyA', 'KeyZ', 'KeyF'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD', 'KeyX', 'KeyJ'];

/**
 * 100m Dash: alternate left and right thumbs.
 * Hit zones are whole screen halves (thumbs never "miss"); the circles are
 * just visual feedback. Red before the gun, green after.
 */
export class Sprint100 extends LaneRace {
  constructor(ev) {
    super(ev, CONFIG.sprint100);
  }

  enter() {
    this.pads = {
      L: { x: 0, y: 0, r: 62, pressT: 0, rejectT: 0 },
      R: { x: 0, y: 0, r: 62, pressT: 0, rejectT: 0 },
    };
    super.enter();
  }

  onResize(view) {
    super.onResize(view);
    const { L, R } = this.pads;
    const pad = 30;
    L.x = view.safe.l + pad + L.r;
    R.x = view.w - view.safe.r - pad - R.r;
    L.y = R.y = view.h - Math.max(view.safe.b, 10) - pad - L.r + 14;
  }

  mapInput(e) {
    if (e.type === 'down') return e.x < this.game.view.w / 2 ? 'L' : 'R';
    if (LEFT_KEYS.includes(e.code)) return 'L';
    if (RIGHT_KEYS.includes(e.code)) return 'R';
    return null;
  }

  onPlayerAction(side, t) {
    const result = this.player.runner.tap(side, t);
    const pad = this.pads[side];
    if (result === 'ok') pad.pressT = 0.09;
    else if (result === 'same') pad.rejectT = 0.22;
  }

  updateControls(dt) {
    for (const p of Object.values(this.pads)) {
      p.pressT = Math.max(0, p.pressT - dt);
      p.rejectT = Math.max(0, p.rejectT - dt);
    }
  }

  drawControls(ctx) {
    const racing = this.state === 'race';
    const before = this.state === 'ready' || this.state === 'set';
    const base = racing ? '#2bb673' : before ? '#d7263d' : 'rgba(150,150,150,0.8)';
    const lastSide = this.player.runner.lastSide;
    const now = this.game.time;

    for (const side of ['L', 'R']) {
      const p = this.pads[side];
      const shake = p.rejectT > 0 ? Math.sin(p.rejectT * 90) * 5 : 0;
      const r = p.r * (p.pressT > 0 ? 0.9 : 1);
      ctx.save();
      ctx.translate(p.x + shake, p.y);

      // "Tap me next" ring: teaches alternation without a tutorial.
      if (racing && lastSide && lastSide !== side) {
        ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.25 * Math.sin(now * 20)})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, p.r + 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.globalAlpha = 0.88;
      ctx.fillStyle = p.rejectT > 0 ? '#777' : base;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      if (p.pressT > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.stroke();
      text(ctx, side, 0, 2, { size: 34 });
      ctx.restore();
    }
  }
}
