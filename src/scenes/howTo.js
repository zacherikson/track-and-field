import { text, roundRect, FONT } from '../core/ui.js';
import { GREEN, ORANGE, drawPad, drawNumberButton, drawX } from '../render/pads.js';

/**
 * How to play each event, as the game shows it: steps of an icon (the
 * control as it looks on the track) and one line. The How to Play screen
 * (tutorialScene.js) and the event card's pop-up (introScene.js) draw these;
 * the event card itself shows only `strip`, the controls in the order you
 * use them.
 *
 * Icons (drawIcon): 'tap' a green target, 'both' the two orange pads, 'hold'
 * them held, 'letgo' them let go, 'wrong' the red ✕, 'nums' the hurdles'
 * 1 2 3, 'blue' the relay's button (with `label`), 'spark' the pole's spark,
 * 'gears' the shifters, 'angle' the javelin's angle, or `badge` (any short
 * text, or an emoji) in a pill.
 */
export const HOW_TO = {
  sprint100: {
    strip: [
      { icon: 'tap', label: 'Run' },
      { icon: 'both', label: 'Lean' },
    ],
    steps: [
      { icon: 'tap', text: 'Tap the side the green target is on. It jumps around at random.' },
      { icon: 'wrong', text: 'Tap the wrong side and you stumble.' },
      { badge: 'L L R', text: 'It’s never on one side three times running: after two, get ready for the other side.' },
      { icon: 'both', text: 'Near the line the pads turn orange: press both to lean. Too early and you slow before the line.' },
    ],
    keys: '← → run · Space lean',
  },
  hurdles110: {
    strip: [
      { icon: 'nums', label: 'Tap 1 2 3' },
      { icon: 'both', label: 'Lean' },
    ],
    steps: [
      { icon: 'nums', text: 'At GO and at every hurdle, three buttons appear: tap 1, 2, 3.' },
      { badge: '⚡', text: 'The faster you clear a set, the faster you run to the next hurdle.' },
      { icon: 'wrong', text: 'A wrong number, or a set not done in time, and you trip on the next hurdle.' },
      { icon: 'both', text: 'After the last hurdle the pads turn orange: press both to lean.' },
    ],
    keys: '1 2 3 (or ← ↓ →) · Space lean',
  },
  longjump: {
    strip: [
      { icon: 'tap', label: 'Run' },
      { icon: 'both', label: 'Jump' },
      { icon: 'both', label: 'Stretch' },
    ],
    steps: [
      { badge: '×3', text: 'Three jumps. Your best counts.' },
      { icon: 'tap', text: 'Tap the green targets to run up.' },
      { icon: 'both', text: 'Near the board the pads turn orange and blink: press both to jump. Late is far, over the board is a foul.' },
      { icon: 'both', text: 'At the top of the jump press both again to stretch. Miss it and you crumple.' },
    ],
    keys: '← → run · Space jump and stretch',
  },
  polevault: {
    strip: [
      { icon: 'tap', label: 'Run' },
      { icon: 'hold', label: 'Plant' },
      { icon: 'letgo', label: 'Push off' },
    ],
    steps: [
      { badge: '×3', text: 'Three vaults. Your best height counts.' },
      { icon: 'tap', text: 'Tap the green targets to run up.' },
      { icon: 'spark', text: 'Near the box the pads turn orange and a spark runs down your pole.' },
      { icon: 'hold', text: 'When the spark reaches the tip, the pole plants: press and hold both.' },
      { icon: 'letgo', text: 'The spark climbs back up the pole: let go as it reaches your hands.' },
    ],
    keys: '← → run · hold Space to plant, let go to push off',
  },
  javelin: {
    strip: [
      { icon: 'tap', label: 'Run' },
      { icon: 'hold', label: 'Aim' },
      { icon: 'letgo', label: 'Throw' },
    ],
    steps: [
      { badge: '×3', text: 'Three throws. Your best counts.' },
      { icon: 'tap', text: 'Tap the green targets to run up.' },
      { icon: 'hold', text: 'Near the line the pads turn orange: press and hold both. The javelin’s tip rises.' },
      { icon: 'angle', text: 'Let go to throw. The best angle is about 36°.' },
      { icon: 'wrong', text: 'Let go close to the line, but not past it: that’s a foul.' },
    ],
    keys: '← → run · hold Space, let go to throw',
  },
  relay4x100: {
    strip: [
      { icon: 'tap', label: 'Run' },
      { icon: 'blue', glyph: 'PASS', label: 'Pass' },
      { icon: 'blue', glyph: 'TAKE', label: 'Take' },
    ],
    steps: [
      { icon: 'tap', text: 'Four legs of 100m. Tap the green targets, as in the 100m.' },
      { icon: 'blue', glyph: 'PASS', text: 'Your teammate sets off as you get close. In the blue zone, tap PASS.' },
      { icon: 'blue', glyph: 'TAKE', text: 'Then TAKE as they come into reach: when the ring meets the button.' },
      { icon: 'wrong', text: 'Too soon and they grab air. No pass by the end of the zone and you both stop to swap.' },
      { badge: '📱', text: 'In a squad meet your four each run one leg, on their own phones.' },
    ],
    keys: '← → run · Space for PASS, TAKE and the anchor’s lean',
  },
  timetrial: {
    strip: [
      { icon: 'tap', label: 'Pedal' },
      { icon: 'gears', label: 'Shift' },
      { icon: 'hold', label: 'Tuck' },
    ],
    steps: [
      { icon: 'tap', text: 'Pedal with the two big pads, left and right in turn: the green one is next.' },
      { icon: 'gears', text: 'Shift with the blue buttons: − for the climb, + for the flat. Keep the PEDALS needle in the green.' },
      { icon: 'hold', text: 'Downhill, hold both pads to tuck.' },
      { icon: 'both', text: 'In the last stretch, press both to throw the bike at the line.' },
      { badge: '👻', text: 'Your rivals ride with you as ghosts. Time checks at the top and the bottom.' },
    ],
    keys: '← → pedal · ↑ ↓ shift · hold Space to tuck',
  },
};

const BLUE = { hi: '#bfe0ff', mid: '#2f80ff', lo: '#1347b8' };

/** One step's (or strip item's) icon, centred at (x, y), about `r` in radius. */
export function drawIcon(ctx, item, x, y, r) {
  if (item.badge) return drawBadge(ctx, item.badge, x, y, r);
  switch (item.icon) {
    case 'tap':
      return drawPad(ctx, GREEN, x, y, r);
    case 'both':
    case 'hold':
    case 'letgo': {
      const pr = r * 0.62;
      ctx.save();
      if (item.icon === 'letgo') ctx.globalAlpha = 0.35;
      drawPad(ctx, ORANGE, x - pr * 1.05, y, pr);
      drawPad(ctx, ORANGE, x + pr * 1.05, y, pr);
      ctx.restore();
      if (item.icon !== 'both') drawTag(ctx, item.icon === 'hold' ? 'HOLD' : 'LET GO', x, y, r);
      return;
    }
    case 'wrong':
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(r / 40, r / 40);
      drawX(ctx, 0, 0);
      ctx.restore();
      return;
    case 'nums': {
      const nr = r * 0.46;
      [1, 2, 3].forEach((n, i) => drawNumberButton(ctx, x + (i - 1) * nr * 2.1, y, nr, n));
      return;
    }
    case 'blue':
      drawPad(ctx, BLUE, x, y, r);
      text(ctx, item.glyph ?? '', x, y + 1, { size: Math.round(r * 0.42), weight: 900, color: '#fff', shadow: true, maxWidth: r * 1.6 });
      return;
    case 'gears': {
      const gr = r * 0.62;
      [['−', -1], ['+', 1]].forEach(([g, d]) => {
        drawPad(ctx, BLUE, x + d * gr * 1.1, y, gr);
        text(ctx, g, x + d * gr * 1.1, y + 1, { size: Math.round(gr * 1.1), weight: 900, color: '#fff' });
      });
      return;
    }
    case 'spark': {
      // The pole, tip down at the box, with the spark partway down it.
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#d8f25a';
      ctx.lineWidth = Math.max(3, r * 0.12);
      ctx.beginPath();
      ctx.moveTo(x - r * 0.9, y - r * 0.7);
      ctx.lineTo(x + r * 0.9, y + r * 0.7);
      ctx.stroke();
      const g = ctx.createRadialGradient(x + r * 0.3, y + r * 0.23, 0, x + r * 0.3, y + r * 0.23, r * 0.45);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.35, '#fff27a');
      g.addColorStop(1, 'rgba(255,220,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x + r * 0.3, y + r * 0.23, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    case 'angle': {
      // The ground, the javelin at 36° and the arc between them.
      const a = (36 * Math.PI) / 180;
      const ox = x - r * 0.85;
      const oy = y + r * 0.55;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + r * 1.8, oy);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ox, oy, r * 0.8, -a, 0);
      ctx.stroke();
      ctx.strokeStyle = '#d8f25a';
      ctx.lineWidth = Math.max(3, r * 0.12);
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + Math.cos(a) * r * 1.9, oy - Math.sin(a) * r * 1.9);
      ctx.stroke();
      ctx.restore();
      text(ctx, '36°', ox + r * 1.25, oy - r * 0.32, { size: Math.round(r * 0.36), weight: 800, color: '#fff' });
      return;
    }
  }
}

function drawBadge(ctx, label, x, y, r) {
  const size = Math.round(r * 0.8);
  ctx.font = `900 ${size}px ${FONT}`;
  const w = Math.max(r * 1.6, ctx.measureText(label).width + size);
  const h = r * 1.3;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fill();
  text(ctx, label, x, y + 1, { size, weight: 900, color: '#ffd35c' });
}

/** A word on a dark pill across the middle of the pads (HOLD, LET GO). */
function drawTag(ctx, label, x, y, r) {
  const size = Math.round(r * 0.4);
  ctx.font = `900 ${size}px ${FONT}`;
  const w = ctx.measureText(label).width + size * 0.9;
  const h = size * 1.5;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fillStyle = 'rgba(10,20,40,0.85)';
  ctx.fill();
  text(ctx, label, x, y + 1, { size, weight: 900, color: '#fff' });
}

/** The height drawSteps needs for event `id`'s steps at row height `rowH`. */
export function stepsHeight(id, rowH) {
  return (HOW_TO[id]?.steps.length ?? 0) * rowH;
}

/**
 * Event `id`'s steps as a list from (x, y), `w` wide: the icon in a column on
 * the left, the line beside it, one row of `rowH` each. Then the keyboard line.
 */
export function drawSteps(ctx, id, x, y, w, rowH = 58) {
  const how = HOW_TO[id];
  if (!how) return;
  const r = Math.min(24, rowH * 0.4);
  const iconX = x + 44;
  const tx = x + 96;
  how.steps.forEach((s, i) => {
    const cy = y + i * rowH + rowH / 2;
    drawIcon(ctx, s, iconX, cy, r);
    wrapText(ctx, s.text, tx, cy, w - (tx - x) - 10, { size: 18, weight: 600, color: '#e6eefc' });
  });
  text(ctx, `Keyboard: ${how.keys}`, x + w / 2, y + how.steps.length * rowH + 22, { size: 14, weight: 500, color: 'rgba(255,255,255,0.55)', maxWidth: w - 20 });
}

/** Left-aligned text in at most two lines, centred on `cy`. */
function wrapText(ctx, str, x, cy, maxW, style) {
  const opts = { ...style, align: 'left' };
  ctx.font = `${style.weight} ${style.size}px ${FONT}`;
  if (ctx.measureText(str).width <= maxW) return text(ctx, str, x, cy, { ...opts, maxWidth: maxW });
  const words = str.split(' ');
  let line = '';
  let i = 0;
  for (; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(next).width > maxW && line) break;
    line = next;
  }
  const lh = style.size * 1.2;
  text(ctx, line, x, cy - lh / 2, { ...opts, maxWidth: maxW });
  text(ctx, words.slice(i).join(' '), x, cy + lh / 2, { ...opts, maxWidth: maxW });
}

/** The event card's controls strip: each control's icon, its word under it, arrows between, centred on (cx, y). */
export function drawStrip(ctx, id, cx, y) {
  const strip = HOW_TO[id]?.strip ?? [];
  const gap = 150;
  const x0 = cx - ((strip.length - 1) * gap) / 2;
  strip.forEach((s, i) => {
    const x = x0 + i * gap;
    drawIcon(ctx, s, x, y, 30);
    text(ctx, s.label, x, y + 48, { size: 18, weight: 800, color: '#fff' });
    if (i) text(ctx, '›', x - gap / 2, y, { size: 34, weight: 900, color: 'rgba(255,255,255,0.45)' });
  });
}
