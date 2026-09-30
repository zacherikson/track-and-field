import { CONFIG } from '../config.js';
import { drawFigure, drawShadow, joints } from './stickFigure.js';

/**
 * Sprite athletes: drawn body parts hung on the same skeleton drawFigure draws,
 * so every pose, blend and IK the events compute still applies. An athlete gets
 * sprites when its colors name a sheet (`sprite: 'juno'` in roster.js loads
 * src/athletes/sprites/juno.png + juno.json); until the sheet has loaded, or for
 * athletes without one, drawAthleteFigure draws the stick figure. The sheet
 * format and how to draw the parts: src/athletes/sprites/README.md.
 *
 * Each part is drawn in its rest orientation around its joint (limbs hanging
 * down, torso and head upright, foot pointing forward), so drawing one is:
 * move to the joint, rotate by the pose's angle, draw the image at its pivot.
 */

const sheets = new Map(); // id -> { ready, img, ppm, height, headFollow, parts }

function load(id) {
  const sheet = { ready: false };
  sheets.set(id, sheet);
  const base = new URL(`./sprites/${id}`, import.meta.url);
  const img = new Image();
  const imgLoaded = new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });
  img.src = `${base}.png`;
  Promise.all([fetch(`${base}.json`).then((r) => r.json()), imgLoaded])
    .then(([meta]) => Object.assign(sheet, { height: CONFIG.figure.height, headFollow: 1 }, meta, { img, ready: true }))
    .catch((err) => console.warn(`sprites: couldn't load ${id}`, err));
  return sheet;
}

/** Start loading the sheets for these athletes (their `colors.sprite`), so they're ready by the first race. */
export function preloadSprites(characters) {
  for (const c of characters) if (c.colors.sprite && !sheets.has(c.colors.sprite)) load(c.colors.sprite);
}

function sheetFor(colors) {
  const id = colors?.sprite;
  if (!id) return null;
  const sheet = sheets.get(id) ?? load(id);
  return sheet.ready ? sheet : null;
}

/**
 * Draw an athlete with feet at (x, y), like drawFigure, using its sprites if it
 * has them. `face`: focus, strain, joy or shock (a sheet without that face uses `head`).
 */
export function drawAthleteFigure(ctx, x, y, H, pose, colors, groundY = y, face = 'focus') {
  const sheet = sheetFor(colors);
  if (!sheet) return drawFigure(ctx, x, y, H, pose, colors, groundY);
  if (pose.flip) {
    // Mirrored (facing -x), as drawFigure does.
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    drawAthleteFigure(ctx, 0, y, H, { ...pose, flip: false }, colors, groundY, face);
    ctx.restore();
    return;
  }
  drawShadow(ctx, x, y, H, groundY);
  const j = joints(x, y, H, pose);
  const k = H / sheet.height / sheet.ppm; // screen px per sprite px
  const parts = sheet.parts;
  // Optional parts fall back: a far limb to the near one, a face to the plain head.
  const part = (names, at, angle) => {
    const p = names.map((n) => parts[n]).find(Boolean);
    if (!p) return;
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(angle);
    ctx.scale(k, k);
    ctx.drawImage(sheet.img, p.x, p.y, p.w, p.h, -p.px, -p.py, p.w, p.h);
    ctx.restore();
  };
  const limb = (name, i) => (i === 1 ? [`${name}.far`, name] : [name]);
  // Canvas angles: a limb hanging at angle a (from straight down, + forward) is
  // the down-pointing sprite rotated by -a; the upright torso and head rotate by
  // the lean; the forward-pointing foot by its toe angle.
  const arm = (i) => {
    const a = pose.arms[i];
    part(limb('fore', i), j.elbow[i], -a.fore);
    part(limb('hand', i), j.wrist[i], -a.fore);
    part(limb('upper', i), j.shoulder, -a.upper); // over the elbow
  };
  const leg = (i) => {
    const l = pose.legs[i];
    part(limb('shin', i), j.knee[i], -l.shin);
    part(limb('foot', i), j.ankle[i], l.toe ?? 0); // over the sock
    part(limb('thigh', i), j.hip, -l.thigh); // over the knee
  };
  // Back to front: far arm, far leg, body, head, near leg, near arm.
  arm(1);
  leg(1);
  part(['torso'], j.hip, pose.lean);
  part([`head.${face}`, 'head'], j.neck, pose.lean * sheet.headFollow);
  leg(0);
  arm(0);
}
