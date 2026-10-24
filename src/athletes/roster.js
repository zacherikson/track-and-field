import { getCharacter, getCustom } from '../core/storage.js';
import { athleteFromCode } from './custom.js';

/**
 * The athletes (original characters). You pick one (the Athlete tab) and they
 * do every event; in each event the other five are your rivals. Each has a kit, a skin tone and a hairstyle (`hair`
 * color + `style`, drawn by drawFigure) so they read apart at a glance, and
 * Chonk has a heavier build (`girth`), Joey is two-thirds the height (`height`).
 * An athlete with drawn art names its sheet with `sprite` (e.g. `sprite: 'juno'`
 * for src/athletes/sprites/juno.png + .json); lane races draw it in place of the
 * stick figure (sprites.js).
 * Looks only: everyone runs on the same physics.
 */
export const CHARACTERS = [
  { id: 'juno', name: 'Juno', tagline: 'The original. Headband on, eyes on gold.', colors: { shirt: '#ffb400', shorts: '#12203a', skin: '#f1c9a5', hair: '#3a2416', style: 'band' } }, // drawn art: add sprite: 'juno' (sprites/juno.png + .json)
  { id: 'joey', name: 'Joey', tagline: 'Half the height, twice the attitude, bald.', colors: { shirt: '#2f7fd8', shorts: '#1b2a41', skin: '#f5d2b8', hair: '#6b4226', style: 'short', height: 2 / 3 } },
  { id: 'okoro', name: 'Okoro', tagline: 'Big hair, bigger strides.', colors: { shirt: '#59cd90', shorts: '#1b2a41', skin: '#5c3a24', hair: '#141414', style: 'afro' } },
  { id: 'lindqvist', name: 'Lindqvist', tagline: 'Ice cold at the line.', colors: { shirt: '#ee6352', shorts: '#2b2b2b', skin: '#f3d3b8', hair: '#f0d27a', style: 'ponytail' } },
  { id: 'chan', name: 'Chan', tagline: 'Quiet, quick, and never late off the blocks.', colors: { shirt: '#b388eb', shorts: '#2b2b2b', skin: '#eccb9f', hair: '#121212', style: 'fringe' } },
  { id: 'chonk', name: 'Chonk', tagline: 'Built for comfort. Somehow still fast.', colors: { shirt: '#f5f5f5', shorts: '#3d3d3d', skin: '#f0b99a', hair: '#8a4b2a', style: 'bun', girth: 2.3 } },
];

/** An athlete by id: one of the cast, or one you made (custom.js: its id is its code). Null if neither. */
export function athleteById(id) {
  return CHARACTERS.find((c) => c.id === id) ?? athleteFromCode(id);
}
const byId = athleteById;

/** The athlete you made in the Athlete Maker (whether or not it's the one you play as), or null. */
export function myCustom() {
  return athleteFromCode(getCustom());
}

/** Your athlete (chosen on the Athlete tab, remembered on this device and your account). */
export function myAthlete() {
  return byId(getCharacter()) ?? CHARACTERS[0];
}

/** The athlete you play an event as: always yours. */
export function player() {
  return myAthlete();
}

/**
 * Another player's athlete in event `eventId`, from what their phone sent:
 * { athlete, lineup? }. Phones from before the lineup went away still send a
 * `lineup`, and show who they had in that event.
 */
export function theirAthlete(p, eventId) {
  return byId(p?.lineup?.[eventId]) ?? byId(p?.athlete) ?? CHARACTERS[0];
}

/** An athlete's height as a share of everyone else's (Joey: 2/3). */
export function heightOf(colors) {
  return colors?.height ?? 1;
}

/**
 * Everyone else in event `eventId`: your rivals, five of the cast. Playing as
 * an athlete you made, the one whose shirt looks most like yours sits out, so
 * the lanes still read apart.
 */
export function rivals(eventId) {
  const me = player(eventId);
  const others = CHARACTERS.filter((c) => c !== me);
  if (!me.custom) return others;
  const out = others.reduce((a, b) => (colorGap(b.colors.shirt, me.colors.shirt) < colorGap(a.colors.shirt, me.colors.shirt) ? b : a));
  return others.filter((c) => c !== out);
}

/** How far apart two #rrggbb colours look (roughly). */
function colorGap(a, b) {
  const c = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = c(a);
  const [r2, g2, b2] = c(b);
  return 2 * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + 3 * (b1 - b2) ** 2;
}

/** The official at the foul line (long jump, javelin): white uniform, red cap. Fights back in the late hits. */
export const REFEREE = { id: 'referee', name: 'Referee', colors: { shirt: '#f2f2f2', shorts: '#f2f2f2', skin: '#f1c9a5', hair: '#d32020', style: 'refcap' } };

/** The default athlete (tools and sprite sheets draw Juno). */
export const HERO = CHARACTERS[0];
