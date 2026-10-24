/**
 * Ruins for the Lost Stadium (Survival's venue): carved stone statues in the
 * style of the Andean monoliths (a block of a figure: a square head with a
 * headdress band, square eyes and a slit of a mouth, arms carved across the
 * chest, on a plinth) and broken columns. Flat fills, drawn by the stand
 * (track.js drawOvergrowth) and the menus' poster version (posterScenery.js
 * lostStadium) alike.
 *
 * Colors: { stone, shade, carve, moss }.
 */

/**
 * A statue standing on `base` (screen y) at x, `h` tall. `lean` (rad) tips it
 * over a little; `headless`: its head lies toppled at its feet instead.
 */
export function drawMonolith(ctx, x, base, h, C, { lean = 0, headless = false } = {}) {
  const w = h * 0.3;
  const plinthH = h * 0.08;
  const bodyH = h * 0.55;
  const headH = h * 0.32;
  ctx.save();
  ctx.translate(x, base);
  // The plinth stays put; the figure leans on it.
  block(ctx, -w * 0.65, -plinthH, w * 1.3, plinthH, C);
  ctx.translate(0, -plinthH);
  ctx.rotate(lean);
  // Body: arms carved down the sides, hands meeting across the chest, a belt.
  block(ctx, -w / 2, -bodyH, w, bodyH, C);
  ctx.fillStyle = C.carve;
  ctx.fillRect(-w * 0.42, -bodyH * 0.92, w * 0.12, bodyH * 0.5);
  ctx.fillRect(w * 0.3, -bodyH * 0.92, w * 0.12, bodyH * 0.5);
  ctx.fillRect(-w * 0.42, -bodyH * 0.46, w * 0.84, bodyH * 0.06);
  ctx.fillRect(-w * 0.5, -bodyH * 0.2, w, bodyH * 0.05);
  if (!headless) {
    // Head: wider than the body, a headdress band, square eyes, a slit mouth.
    const hw = w * 1.12;
    block(ctx, -hw / 2, -bodyH - headH, hw, headH, C);
    ctx.fillStyle = C.carve;
    ctx.fillRect(-hw / 2, -bodyH - headH, hw, headH * 0.18);
    ctx.fillRect(-hw * 0.32, -bodyH - headH * 0.62, hw * 0.18, headH * 0.16);
    ctx.fillRect(hw * 0.14, -bodyH - headH * 0.62, hw * 0.18, headH * 0.16);
    ctx.fillRect(-hw * 0.22, -bodyH - headH * 0.28, hw * 0.44, headH * 0.08);
    // Moss on the crown.
    ctx.fillStyle = C.moss;
    ctx.beginPath();
    ctx.ellipse(-hw * 0.1, -bodyH - headH, hw * 0.4, headH * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // A broken neck, moss in the break.
    ctx.fillStyle = C.moss;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -bodyH);
    ctx.lineTo(-w * 0.2, -bodyH - h * 0.03);
    ctx.lineTo(w * 0.1, -bodyH + h * 0.01);
    ctx.lineTo(w / 2, -bodyH - h * 0.02);
    ctx.lineTo(w / 2, -bodyH + h * 0.03);
    ctx.lineTo(-w / 2, -bodyH + h * 0.03);
    ctx.fill();
  }
  ctx.restore();
  if (headless) {
    // The head, toppled at the foot of the plinth, face up.
    const hw = w * 1.12;
    ctx.save();
    ctx.translate(x + w * 1.05, base);
    ctx.rotate(-1.3);
    block(ctx, 0, -hw, headH, hw, C);
    ctx.fillStyle = C.carve;
    ctx.fillRect(headH * 0.35, -hw * 0.82, headH * 0.16, hw * 0.18);
    ctx.fillRect(headH * 0.35, -hw * 0.36, headH * 0.16, hw * 0.18);
    ctx.restore();
  }
}

/** A broken column standing on `base` at x: `h` tall, `w` wide, a jagged top. */
export function drawColumn(ctx, x, base, h, w, C, jag = 0.5) {
  ctx.fillStyle = C.stone;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, base);
  ctx.lineTo(x - w / 2, base - h);
  ctx.lineTo(x - w * 0.15, base - h - w * 0.5 * jag);
  ctx.lineTo(x + w * 0.1, base - h + w * 0.25);
  ctx.lineTo(x + w / 2, base - h - w * 0.35 * (1 - jag));
  ctx.lineTo(x + w / 2, base);
  ctx.closePath();
  ctx.fill();
  // Fluting, and the shaded side.
  ctx.fillStyle = C.shade;
  ctx.fillRect(x + w * 0.2, base - h + w * 0.3, w * 0.3, h - w * 0.3);
  ctx.fillStyle = C.carve;
  ctx.fillRect(x - w * 0.22, base - h + w * 0.5, Math.max(1, w * 0.08), h - w * 0.5);
  // A capital-less stump: a wider foot.
  ctx.fillStyle = C.stone;
  ctx.fillRect(x - w * 0.65, base - w * 0.35, w * 1.3, w * 0.35);
  ctx.fillStyle = C.moss;
  ctx.fillRect(x - w * 0.65, base - w * 0.4, w * 1.3, w * 0.12);
}

/** A flat block with its right side in shadow. */
function block(ctx, x, y, w, h, C) {
  ctx.fillStyle = C.stone;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = C.shade;
  ctx.fillRect(x + w * 0.78, y, w * 0.22, h);
}
