import { CONFIG } from '../config.js';
import { Input } from './input.js';
import { text } from './ui.js';

/**
 * The Game owns three things: the view (canvas sizing), the loop, and the
 * current scene (a state machine where each state is a Scene object).
 *
 * GAME LOOP: requestAnimationFrame calls `frame()` once per display refresh
 * (60, 90, 120Hz... varies by phone). We split work into:
 *   - update(): advance the simulation. Runs in FIXED steps (e.g. 1/120s) using
 *     an accumulator, so physics behaves identically on a 60Hz and a 120Hz phone.
 *   - render(): draw the current state once per frame.
 *
 * DELTA TIME: the real time since the last frame. We clamp it (maxFrameDt) so a
 * backgrounded tab or a GC pause doesn't make the sim jump several seconds at once.
 *
 * SCENES: menu, intro, event, result. Exactly one is active. Each implements
 * enter() / exit() / update(dt, t) / render(ctx, view). Switching scenes is the
 * only way to change "what mode the game is in", which keeps states from leaking.
 */
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.view = { w: 960, h: CONFIG.view.logicalHeight, scale: 1, dpr: 1, portrait: false, safe: { l: 0, r: 0, t: 0, b: 0 } };
    this.input = new Input(canvas, this.view);
    this.scene = null;
    this.time = 0; // simulation clock, seconds
    this.acc = 0; // un-simulated time carried to the next frame
    this.lastTs = null;
    this.fps = 60;
    this.debug = new URLSearchParams(location.search).has('debug');
    this.cssW = 0;
    this.cssH = 0;
    this.safeKey = '';
    this.frame = this.frame.bind(this);
    // iOS settles the screen size and the notch insets a beat after a launch,
    // a rotation or coming back to the app (the insets after the size), so a
    // single measurement can catch it half-way: the game drawn short, or the
    // top bar pushed down for a notch that's now at the side. Look again a few
    // times after each, and put back any scroll the page picked up meanwhile.
    const settle = () => {
      for (const ms of [0, 100, 300, 700, 1500]) setTimeout(() => this.remeasure(), ms);
    };
    for (const type of ['resize', 'orientationchange', 'pageshow']) window.addEventListener(type, settle);
    window.visualViewport?.addEventListener('resize', settle);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && settle());
    settle();
  }

  setScene(scene) {
    this.scene?.exit?.();
    this.scene = scene;
    scene.game = this;
    this.input.clear(); // don't let a tap from the old scene leak into the new one
    this.input.wantReleases = !!scene.wantsReleases; // press-and-hold scenes also get finger lifts / key releases
    scene.enter?.();
  }

  start(firstScene) {
    this.setScene(firstScene);
    requestAnimationFrame(this.frame);
  }

  /** Measure the screen again next frame, even if the canvas looks the same size (the insets may have moved). */
  remeasure() {
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    this.forceMeasure = true;
  }

  resizeIfNeeded() {
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.view.maxDpr);
    const forced = this.forceMeasure;
    this.forceMeasure = false;
    if (cssW === this.cssW && cssH === this.cssH && dpr === this.view.dpr && !forced) return;
    const probe = getComputedStyle(document.getElementById('safe-probe'));
    const safeKey = [probe.paddingTop, probe.paddingRight, probe.paddingBottom, probe.paddingLeft].join();
    if (cssW === this.cssW && cssH === this.cssH && dpr === this.view.dpr && safeKey === this.safeKey) return; // nothing moved
    this.safeKey = safeKey;
    this.cssW = cssW;
    this.cssH = cssH;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);

    // Fixed logical height, variable logical width: a 19.5:9 phone simply sees
    // more track than a 16:9 one. UI anchors to edges, so nothing is cut off.
    const v = this.view;
    v.dpr = dpr;
    v.portrait = cssH > cssW;
    v.scale = cssH / CONFIG.view.logicalHeight;
    v.w = cssW / v.scale;
    v.h = CONFIG.view.logicalHeight;

    const px = (s) => (parseFloat(s) || 0) / v.scale;
    v.safe = { t: px(probe.paddingTop), r: px(probe.paddingRight), b: px(probe.paddingBottom), l: px(probe.paddingLeft) };
    this.scene?.onResize?.(v);
  }

  frame(ts) {
    requestAnimationFrame(this.frame);
    this.resizeIfNeeded();
    if (this.lastTs === null) this.lastTs = ts;
    const rawDt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    const dt = Math.min(rawDt, CONFIG.loop.maxFrameDt);
    if (rawDt > 0) this.fps += (1 / rawDt - this.fps) * 0.05;
    this.worstFrameMs = Math.max(this.worstFrameMs ?? 0, rawDt * 1000); // hitch meter (reset by scenes)

    if (this.view.portrait) {
      // Paused: freeze the sim clock and drop any taps.
      this.input.clear();
      this.acc = 0;
    } else {
      this.acc += dt;
      this.input.syncClock(ts, this.time + this.acc);
      const step = CONFIG.loop.fixedStep;
      while (this.acc >= step) {
        this.scene.update(step, this.time);
        this.time += step;
        this.acc -= step;
      }
    }
    this.render();
  }

  render() {
    const { ctx, view } = this;
    ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, 0, 0);
    if (view.portrait) {
      this.renderRotateHint();
      return;
    }
    this.scene.render(ctx, view);
    if (this.debug) {
      text(ctx, `${this.fps.toFixed(0)} fps`, view.w - 8 - view.safe.r, view.h - 10, { size: 12, align: 'right', weight: 500, color: 'rgba(255,255,255,0.7)' });
    }
  }

  renderRotateHint() {
    const { ctx, view } = this;
    // In portrait the logical width is narrow; draw a centered message.
    ctx.fillStyle = '#12203a';
    ctx.fillRect(0, 0, view.w, view.h);
    const cx = view.w / 2;
    ctx.save();
    ctx.translate(cx, view.h / 2 - 40);
    ctx.rotate(-Math.PI / 2 * ((Math.sin(performance.now() / 600) + 1) / 2));
    ctx.strokeStyle = '#ffb400';
    ctx.lineWidth = 4;
    ctx.strokeRect(-18, -30, 36, 60);
    ctx.restore();
    text(ctx, 'Rotate your phone', cx, view.h / 2 + 40, { size: 20 });
    text(ctx, 'Track Royale plays in landscape', cx, view.h / 2 + 68, { size: 13, weight: 500, color: 'rgba(255,255,255,0.7)' });
  }
}
