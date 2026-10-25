/**
 * Athletes you make yourself (the Athlete Maker, scenes/athleteMaker.js),
 * Mii style: a skin tone, a hairstyle and its colour, a shirt, shorts, a
 * height and a build, each picked from the lists in LOOK, and a name.
 *
 * A made athlete travels as its CODE, which is also its id everywhere an
 * athlete id goes (your saved character, your account's progress, a live
 * room's or a meet's player list, a ghost's runner): "~1", one base-36 digit
 * per LOOK list (in FIELDS order: the pick's index), then the name. With gear
 * on (economy/items.js), "~2": the same, then one digit per gear slot (in
 * SLOTS order: the item's number, 0 for none), then the name. At most 27
 * characters, inside every limit on the way (a live room, a meet and your
 * account keep 32). A phone that doesn't know a code (an older build) shows
 * the default athlete instead; gear this build doesn't know is left off.
 *
 * Looks only: everyone runs on the same physics, whatever their height.
 */
import { SLOTS, noGear, itemAt, gearColors } from '../economy/items.js';

export const LOOK = {
  skin: ['#f8dfc8', '#f3d3b8', '#f1c9a5', '#eccb9f', '#d9a77c', '#c68863', '#a46a45', '#7a4a2e', '#5c3a24', '#3f2718'],
  // drawFigure's hairstyles (stickFigure.js drawHair); 'band' is the headband, in the shirt colour.
  style: ['band', 'short', 'spiky', 'afro', 'ponytail', 'bun', 'fringe', 'bald', 'mohawk', 'long'],
  hair: ['#141414', '#3a2416', '#6b4226', '#8a4b2a', '#b5562a', '#d98f3a', '#f0d27a', '#e8e2d0', '#8a8a8a', '#3b6cc2', '#c2407e', '#59cd90'],
  shirt: ['#ffb400', '#f2d03b', '#e8743b', '#ee6352', '#d32020', '#c2407e', '#b388eb', '#2f7fd8', '#40c4c4', '#59cd90', '#2e8b57', '#12203a', '#2b2b2b', '#f5f5f5'],
  shorts: ['#12203a', '#1b2a41', '#2b2b2b', '#3d3d3d', '#f5f5f5', '#d32020', '#2f7fd8', '#2e8b57', '#ffb400', '#6b4226'],
  height: [2 / 3, 0.8, 0.9, 1, 1.08], // shares of everyone else's (Joey is 2/3)
  build: [1, 1.4, 1.8, 2.3], // drawFigure's girth (Chonk is 2.3)
};

/**
 * The two looks a new player starts from (scenes/onboarding.js), as LOOK
 * indexes: short hair or a ponytail, in a blue or a coral kit. The skin tone
 * is picked alongside; the rest changes later in the Athlete Maker.
 */
export const STARTERS = {
  male: { skin: 2, style: 1, hair: 1, shirt: 7, shorts: 0, height: 3, build: 0 },
  female: { skin: 2, style: 4, hair: 1, shirt: 3, shorts: 0, height: 3, build: 0 },
};

/** The LOOK lists, in the order their digits go in a code. */
export const FIELDS = ['skin', 'style', 'hair', 'shirt', 'shorts', 'height', 'build'];

const PREFIX = '~1';
const GEAR_PREFIX = '~2'; // with gear
export const NAME_MAX = 12;
export const DEFAULT_NAME = 'Rookie';

/** A typed name tidied for an athlete: letters, numbers, spaces, ' - . only, single spaces, NAME_MAX at most. */
export function cleanAthleteName(s) {
  const t = String(s ?? '')
    .replace(/[^\p{L}\p{N} '.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return [...t].slice(0, NAME_MAX).join('').trim();
}

/** Is `id` a made athlete's code (not one of the cast)? */
export function isCode(id) {
  return typeof id === 'string' && (id.startsWith(PREFIX) || id.startsWith(GEAR_PREFIX));
}

/** A look ({ skin: index, style: index, ... }), a name and gear ({ spikes: n, ... }: economy/items.js), as a code. */
export function encode(look, name, gear = null) {
  const digits = FIELDS.map((f) => clamp(look[f] ?? 0, 0, LOOK[f].length - 1).toString(36)).join('');
  const worn = SLOTS.map((s) => clamp(itemAt(s, gear?.[s]) ? gear[s] : 0, 0, 35));
  const tail = cleanAthleteName(name) || DEFAULT_NAME;
  if (worn.every((n) => !n)) return PREFIX + digits + tail; // nothing on: the old code, which every build knows
  return GEAR_PREFIX + digits + worn.map((n) => n.toString(36)).join('') + tail;
}

/** A code back to { look, name, gear }, or null if it isn't one (or is from a newer build with picks this one doesn't have). */
export function parse(code) {
  if (!isCode(code)) return null;
  const geared = code.startsWith(GEAR_PREFIX);
  const digits = code.slice(PREFIX.length, PREFIX.length + FIELDS.length);
  if (digits.length < FIELDS.length) return null;
  const look = {};
  for (let i = 0; i < FIELDS.length; i++) {
    const n = parseInt(digits[i], 36);
    if (!Number.isInteger(n) || n >= LOOK[FIELDS[i]].length) return null;
    look[FIELDS[i]] = n;
  }
  const gear = noGear();
  let at = PREFIX.length + FIELDS.length;
  if (geared) {
    const g = code.slice(at, at + SLOTS.length);
    if (g.length < SLOTS.length) return null;
    SLOTS.forEach((s, i) => {
      const n = parseInt(g[i], 36);
      gear[s] = itemAt(s, n) ? n : 0; // an item this build doesn't know: left off
    });
    at += SLOTS.length;
  }
  return { look, gear, name: cleanAthleteName(code.slice(at)) || DEFAULT_NAME };
}

/** What a look and gear look like on the figure: drawFigure's colors. */
export function lookColors(look, gear = null) {
  return {
    skin: LOOK.skin[look.skin],
    style: LOOK.style[look.style],
    hair: LOOK.hair[look.hair],
    shirt: LOOK.shirt[look.shirt],
    shorts: LOOK.shorts[look.shorts],
    height: LOOK.height[look.height],
    girth: LOOK.build[look.build],
    ...gearColors(gear),
  };
}

const made = new Map(); // code -> its athlete: the same object each time (screens compare athletes by identity)

/** A code as an athlete, shaped like roster.js CHARACTERS (with `custom: true`), or null. */
export function athleteFromCode(code) {
  if (made.has(code)) return made.get(code);
  const p = parse(code);
  if (!p) return null;
  const { look, gear } = p;
  const a = {
    id: code,
    name: p.name,
    tagline: 'Made by you.',
    custom: true,
    look,
    gear,
    colors: lookColors(look, gear),
  };
  made.set(code, a);
  return a;
}

/** A look picked at random (`rng` like Math.random): average height and build more often than not. */
export function randomLook(rng = Math.random) {
  const pick = (f) => Math.floor(rng() * LOOK[f].length);
  return {
    skin: pick('skin'),
    style: pick('style'),
    hair: pick('hair'),
    shirt: pick('shirt'),
    shorts: pick('shorts'),
    height: rng() < 0.6 ? 3 : pick('height'),
    build: rng() < 0.7 ? 0 : pick('build'),
  };
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, Math.round(Number(n) || 0)));
}
