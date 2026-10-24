import { openTuning } from './panel.js';
import { roundRect, text } from '../core/ui.js';

/**
 * The ⚙ in an event played from the Tuning screen (game.tuneEvent set by
 * flow.tuning): under the ✕, it pauses the game and opens the tuning panel
 * with that event's settings. Game.frame takes the tap before the scene sees it.
 */
const TUNED = ['sprint100', 'hurdles110', 'longjump', 'polevault', 'javelin'];

function shown(game) {
  const ev = game.scene?.ev;
  return game.tuneEvent && ev && TUNED.includes(ev.id) && !game.paused ? ev : null;
}

function rect(view) {
  return { x: 10 + view.safe.l, y: 56 + view.safe.t, w: 44, h: 40 };
}

/** A press on the gear: pause and open the panel (true if it took one). */
export function takeGearTap(game) {
  const ev = shown(game);
  if (!ev) return false;
  const r = rect(game.view);
  const q = game.input.queue;
  const i = q.findIndex((e) => e.type === 'down' && e.x >= r.x && e.x <= r.x + r.w && e.y >= r.y && e.y <= r.y + r.h);
  if (i < 0) return false;
  q.splice(i, 1);
  game.paused = true;
  openTuning(() => {
    game.paused = false;
    game.input.clear();
  }, ev);
  return true;
}

export function drawGear(ctx, game) {
  if (!shown(game)) return;
  const r = rect(game.view);
  roundRect(ctx, r.x, r.y, r.w, r.h, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  text(ctx, '⚙', r.x + r.w / 2, r.y + r.h / 2 + 1, { size: 22 });
}
