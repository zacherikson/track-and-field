import { CONFIG } from '../config.js';
import { Button, text } from '../core/ui.js';
import { drawFigure, runPose } from '../athletes/stickFigure.js';
import { EVENTS, formatMark } from '../events/registry.js';
import { getBest } from '../core/storage.js';
import { HERO } from '../athletes/roster.js';
import { flow } from '../flow.js';

export class MenuScene {
  enter() {
    this.demoX = 0;
    this.phase = 0;
    this.buttons = EVENTS.map(
      (ev) =>
        new Button({
          label: ev.name,
          sub: ev.available ? `Best ${formatMark(ev, getBest(ev.id))}` : 'Coming soon',
          enabled: ev.available,
          onTap: () => flow.intro(this.game, ev),
        }),
    );
    this.fsButton = document.fullscreenEnabled
      ? new Button({ label: '⛶', w: 48, h: 44, color: 'rgba(255,255,255,0.15)', onTap: () => toggleFullscreen() })
      : null;
    this.layout(this.game.view);
  }

  onResize(view) {
    this.layout(view);
  }

  layout(view) {
    const n = this.buttons.length;
    const margin = 24 + Math.max(view.safe.l, view.safe.r);
    const gap = 12;
    const w = Math.min(180, (view.w - margin * 2 - gap * (n - 1)) / n);
    const total = w * n + gap * (n - 1);
    this.buttons.forEach((b, i) => {
      b.w = w;
      b.h = 72;
      b.x = (view.w - total) / 2 + i * (w + gap);
      b.y = 205;
    });
    if (this.fsButton) {
      this.fsButton.x = view.w - 48 - 14 - view.safe.r;
      this.fsButton.y = 14 + view.safe.t;
    }
  }

  update(dt, t) {
    for (const ev of this.game.input.consume(t + dt)) {
      if (ev.type !== 'down') continue;
      if (this.fsButton?.tap(ev.x, ev.y)) continue;
      for (const b of this.buttons) if (b.tap(ev.x, ev.y)) break;
    }
    this.buttons.forEach((b) => b.update(dt));
    this.fsButton?.update(dt);

    // Demo runner loops across the bottom of the screen.
    const speed = 9;
    this.demoX += speed * dt;
    this.phase += ((speed * dt) / 2.3) * Math.PI * 2;
  }

  render(ctx, view) {
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, '#0d1830');
    g.addColorStop(1, '#1d3a66');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);

    text(ctx, 'THUMBATHLON', view.w / 2, 88, { size: 62, color: '#ffb400', shadow: true });
    text(ctx, `Five events. Two thumbs. Starring ${HERO.name}.`, view.w / 2, 140, { size: 18, weight: 500, color: 'rgba(255,255,255,0.8)' });
    this.buttons.forEach((b) => b.draw(ctx));
    this.fsButton?.draw(ctx);

    // Track strip + demo runner.
    const trackY = 470;
    ctx.fillStyle = '#b8452c';
    ctx.fillRect(0, trackY - 40, view.w, 70);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(0, trackY - 40, view.w, 2);
    ctx.fillRect(0, trackY + 28, view.w, 2);
    const ppm = CONFIG.world.pixelsPerMeter;
    const span = view.w + 120;
    const sx = ((this.demoX * ppm) % span) - 60;
    drawFigure(ctx, sx, trackY + 10, CONFIG.figure.height * ppm, runPose(this.phase, 1), HERO.colors);
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
    return;
  }
  document.documentElement
    .requestFullscreen?.({ navigationUI: 'hide' })
    .then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => {});
}
