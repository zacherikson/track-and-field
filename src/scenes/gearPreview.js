import { drawFigure } from '../athletes/stickFigure.js';
import { relaxed } from '../brawl/poses.js';
import { lookColors } from '../athletes/custom.js';

/**
 * Gear close up (the Athlete Maker's Gear tab, the Shop): an athlete in a
 * square at (x, y), side `s`, wearing `gear`, framed on where `slot` is worn
 * (feet, head or torso). The caller clips to the square.
 */
export const FOCUS = { spikes: 'feet', socks: 'feet', headband: 'head', glasses: 'head', sleeves: 'torso', kit: 'torso' };

/** Each rarity's colour (common has none). */
export const RARITY_COLOR = { common: null, rare: '#3B6CC2', epic: '#C2407E', legendary: '#F2B632' };

export function drawWearing(ctx, x, y, s, look, gear, slot) {
  const c = { ...lookColors(look, gear), height: 1, girth: 1 };
  const pose = relaxed(0, 0, 0);
  const focus = FOCUS[slot];
  if (focus === 'feet') {
    const H = s * 2.4;
    drawFigure(ctx, x + s * 0.4, y + s * 0.74, H, pose, c, y + s * 0.74);
  } else if (focus === 'head') {
    const H = s * 3.2;
    const feet = y + s * 0.58 + 0.93 * H;
    drawFigure(ctx, x + s * 0.5, feet, H, pose, c, feet);
  } else {
    const H = s * 1.5;
    const feet = y + s * 0.52 + 0.64 * H;
    drawFigure(ctx, x + s * 0.5, feet, H, pose, c, feet);
  }
}
