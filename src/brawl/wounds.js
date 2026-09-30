/**
 * Wounds from the late hits: black eyes, bruises, a bloody nose, a cut, a
 * stain on the shirt. Each hit you take may add one (the same one on every
 * phone: they come from a seed), drawn on your head and body from then on.
 *
 * They stay with you for as long as you keep playing (a whole tournament's
 * worth of late hits), and heal when you go back to the menu (resetScars).
 */

const MAX = 9; // wounds one athlete can carry

// athlete key -> their wounds, kept between events
const scars = new Map();

export function resetScars() {
  scars.clear();
}

/** The wound list for `key` (the same array every time, so it grows in place). */
export function woundsOf(key) {
  if (!scars.has(key)) scars.set(key, []);
  return scars.get(key);
}

/** A small seeded random generator: the same seed gives the same wounds on every phone. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Maybe add a wound to `list` for a hit of `kind` (punch, kick, slam), from `seed`. */
export function wound(list, kind, seed) {
  const r = seeded(seed);
  const chance = { punch: 0.55, kick: 0.7, slam: 1 }[kind] ?? 0.5;
  if (r() > chance) return null;
  const pick = (opts) => {
    let x = r() * opts.reduce((s, o) => s + o[1], 0);
    for (const [type, w] of opts) if ((x -= w) <= 0) return type;
    return opts[0][0];
  };
  const type =
    kind === 'punch' ? pick([['eye', 3], ['bruise', 3], ['nose', 3], ['lip', 1]])
    : kind === 'kick' ? pick([['bruise', 3], ['stain', 2], ['nose', 1], ['eye', 1]])
    : pick([['cut', 3], ['bruise', 2], ['stain', 2], ['nose', 1]]);
  // One black eye and one bloody nose is plenty: make it something else.
  const has = (t) => list.some((w) => w.type === t);
  const final = (type === 'eye' || type === 'nose' || type === 'lip') && has(type) ? 'bruise' : type;
  const w = { type: final, u: r(), v: r(), hue: r() };
  if (list.length >= MAX) {
    // Full up: freshen an old bruise instead.
    const i = list.findIndex((x) => x.type === 'bruise');
    if (i < 0) return null;
    list[i] = w;
  } else list.push(w);
  return w;
}

const BRUISE = ['rgba(96,52,140,0.75)', 'rgba(70,70,150,0.7)', 'rgba(110,60,110,0.7)', 'rgba(120,120,60,0.6)'];
const BLOOD = '#c4161c';

/**
 * Draws `wounds` on a figure drawn with drawFigure(ctx, x, y, H, pose),
 * facing +x (`facing` 1) or -x (-1). Call right after drawFigure.
 */
export function drawWounds(ctx, x, y, H, pose, wounds, facing = 1) {
  if (!wounds?.length) return;
  ctx.save();
  if (facing < 0) {
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    x = 0;
  }
  const TORSO = 0.32 * H;
  const r = 0.085 * H; // head radius, as drawFigure
  const hip = { x: x + pose.hipX * H, y: y + pose.hipY * H };
  const sin = Math.sin(pose.lean);
  const cos = Math.cos(pose.lean);
  const along = (d) => ({ x: hip.x + sin * d, y: hip.y - cos * d });
  const head = along(TORSO + r * 1.3);

  for (const w of wounds) {
    if (w.type === 'stain') {
      // Blood on the shirt, part way up the torso.
      const c = along(TORSO * (0.4 + 0.35 * w.v));
      ctx.fillStyle = 'rgba(170,16,24,0.8)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, r * 0.35, r * 0.28, pose.lean + w.u, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(c.x + r * 0.3, c.y + r * 0.25, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    // Face wounds, in the head's own frame: +x toward the face, -y up.
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(pose.lean);
    switch (w.type) {
      case 'eye':
        ctx.fillStyle = 'rgba(70,30,95,0.9)';
        ctx.beginPath();
        ctx.ellipse(r * 0.5, -r * 0.1, r * 0.3, r * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(30,10,40,0.9)';
        ctx.beginPath();
        ctx.arc(r * 0.55, -r * 0.1, r * 0.1, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'bruise':
        ctx.fillStyle = BRUISE[Math.floor(w.hue * BRUISE.length)];
        ctx.beginPath();
        ctx.ellipse(r * (w.u * 0.9 - 0.2), r * (w.v * 0.9 - 0.3), r * 0.26, r * 0.2, w.hue * 3, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'nose': {
        // A trickle from the nose to the chin, and a drop.
        ctx.strokeStyle = BLOOD;
        ctx.lineWidth = Math.max(1.5, r * 0.16);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(r * 0.92, r * 0.15);
        ctx.quadraticCurveTo(r * 0.98, r * 0.5, r * 0.8, r * 0.85);
        ctx.stroke();
        ctx.fillStyle = BLOOD;
        ctx.beginPath();
        ctx.arc(r * 0.8, r * 0.95, r * 0.12, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'lip':
        ctx.fillStyle = BLOOD;
        ctx.beginPath();
        ctx.ellipse(r * 0.82, r * 0.52, r * 0.14, r * 0.09, 0.4, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'cut': {
        // A gash above the eye with a line of blood running down the face.
        const cx = r * (0.1 + 0.5 * w.u);
        ctx.strokeStyle = BLOOD;
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1.5, r * 0.18);
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.2, -r * 0.55);
        ctx.lineTo(cx + r * 0.2, -r * 0.45);
        ctx.stroke();
        ctx.lineWidth = Math.max(1, r * 0.11);
        ctx.beginPath();
        ctx.moveTo(cx + r * 0.1, -r * 0.45);
        ctx.lineTo(cx + r * 0.15, r * 0.3);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }
  ctx.restore();
}
