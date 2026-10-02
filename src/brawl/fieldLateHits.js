import { text } from '../core/ui.js';
import { flow } from '../flow.js';
import { Aftermath } from './aftermath.js';
import { FIELD_DEPTH, fieldSpot } from './venue.js';
import { REFEREE } from '../athletes/roster.js';

/**
 * The late hits after a field event (long jump, javelin, pole vault), shared.
 * They start with your last attempt: you're already on your feet where it left
 * you, and the computer rivals walk over from off screen to stand round you.
 * Where there's a referee (the scene has refereeSpot()), offline they join in
 * too, from their post: leave them be and they stay there; hit them (or taunt
 * them) and they come after you like a rival, then go back to their post.
 * Offline the results come up a moment later; live, when everyone's done
 * (online/liveField.js). The event scene provides:
 *
 *   player, rivals, live, ev, game, now, camera, hitExit(e), drawHUD(ctx, view)
 *   lateVenue()      its Venue (venue.js), on its own camera
 *   lateUpdate(dt, t) / lateRender(ctx, view): the late hits and the venue
 *   markLabel()      your last mark, as the banner shows it ('7.12 m', 'FOUL')
 */
const RESULTS_AFTER = 2.2; // s from your last mark to the results (offline)

/** You at (x, the middle of the infield) facing `facing`, eased from `pose`; the computer rivals come over. */
export function startFieldLateHits(scene, x, pose, facing = 1) {
  const venue = scene.lateVenue();
  scene.after = new Aftermath(scene.game, venue, { name: scene.player.name, colors: scene.player.colors, x, d: FIELD_DEPTH / 2, facing }, {
    live: scene.live ?? null,
    key: scene.live ? scene.live.stage(scene.ev.id) : '',
    pose,
    lookup: (uid) => scene.rivals.find((r) => r.uid === uid) ?? null,
  });
  scene.lateT = scene.now;
  const bots = scene.rivals.filter((r) => !r.live && !r.uid);
  scene.after.callOver(bots.map((r) => ({ id: r.name, name: r.name, colors: r.colors })), fieldSpot(x, FIELD_DEPTH));
  // Live, every phone would have its own referee: they stay painted at the line instead.
  if (scene.refereeSpot && !scene.live) {
    const post = scene.refereeSpot();
    const ref = scene.after.join({ id: REFEREE.id, name: REFEREE.name, colors: REFEREE.colors, x: post.x, d: post.d, facing: post.facing });
    if (ref.brain) ref.brain.post = post;
    scene.refereeFights = true; // the event stops drawing them at the line
  }
}

/** A step before the results: the ✕, your controls, and (offline) the results after a moment. */
export function fieldLateStep(scene, dt, t) {
  for (const e of scene.game.input.consume(t + dt)) {
    if (e.type === 'down' && scene.hitExit(e)) return flow.menu(scene.game);
    if (e.type === 'key' && e.code === 'Escape') return flow.menu(scene.game);
    scene.after.handle(e);
  }
  scene.lateUpdate(dt, t);
  if (!scene.liveField && scene.now - scene.lateT >= RESULTS_AFTER) scene.finish();
}

/** Drawn before the results: the venue, the HUD, your last mark (no panel), your controls. */
export function fieldLateRender(scene, ctx, view) {
  scene.lateRender(ctx, view);
  scene.drawHUD(ctx, view);
  const k = Math.min(1, (scene.now - scene.lateT) / 0.2);
  ctx.globalAlpha = k;
  const label = scene.markLabel();
  const bad = !/m$/.test(label);
  text(ctx, label, view.w / 2, 70 + view.safe.t, { size: 56, color: bad ? '#ff4b3e' : '#fff', shadow: true });
  const hint = scene.liveField?.hint();
  if (hint) text(ctx, hint, view.w / 2, 112 + view.safe.t, { size: 16, color: 'rgba(255,255,255,0.85)', shadow: true });
  ctx.globalAlpha = 1;
  scene.after.drawControls(ctx, view);
}
