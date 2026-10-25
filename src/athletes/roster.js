import { getCharacter, getCustom } from '../core/storage.js';
import { athleteFromCode } from './custom.js';
import { survival } from '../survival/survival.js';

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

/**
 * The rivals you meet on the way up, a cast for each level below Pro (Pro is
 * where the six above race each other). They only ever race: you can't pick
 * them. High schoolers haven't finished growing, so they're a bit shorter.
 */
const HIGH_SCHOOL = [
  { id: 'hs-brayden', name: 'Brayden', colors: { shirt: '#e63946', shorts: '#1d3557', skin: '#f1c9a5', hair: '#c58b3a', style: 'spiky', height: 0.86 } },
  { id: 'hs-kenzie', name: 'Kenzie', colors: { shirt: '#06d6a0', shorts: '#073b4c', skin: '#e0ac8a', hair: '#2b1a10', style: 'ponytail', height: 0.83 } },
  { id: 'hs-deshawn', name: 'DeShawn', colors: { shirt: '#ffd166', shorts: '#26547c', skin: '#6b4226', hair: '#111111', style: 'mohawk', height: 0.88 } },
  { id: 'hs-mateo', name: 'Mateo', colors: { shirt: '#118ab2', shorts: '#222222', skin: '#c68e5e', hair: '#1a1a1a', style: 'fringe', height: 0.85 } },
  { id: 'hs-hailey', name: 'Hailey', colors: { shirt: '#ff7eb6', shorts: '#3a3a3a', skin: '#f3d3b8', hair: '#e3b04b', style: 'long', height: 0.82 } },
  { id: 'hs-gus', name: 'Gus', colors: { shirt: '#8ac926', shorts: '#2b2d42', skin: '#f0b99a', hair: '#7a3e1d', style: 'short', height: 0.84 } },
];
const COLLEGIATE = [
  { id: 'col-marcus', name: 'Marcus', colors: { shirt: '#1d4ed8', shorts: '#0b1f4d', skin: '#4a2c1a', hair: '#0e0e0e', style: 'short' } },
  { id: 'col-ingrid', name: 'Ingrid', colors: { shirt: '#dc2626', shorts: '#1f1f1f', skin: '#f5d6c0', hair: '#f2d88a', style: 'ponytail' } },
  { id: 'col-kai', name: 'Kai', colors: { shirt: '#0d9488', shorts: '#1f2937', skin: '#d6a57c', hair: '#151515', style: 'spiky' } },
  { id: 'col-ramirez', name: 'Ramírez', colors: { shirt: '#f59e0b', shorts: '#3b2414', skin: '#b07650', hair: '#2a1a10', style: 'bald' } },
  { id: 'col-sloane', name: 'Sloane', colors: { shirt: '#7c3aed', shorts: '#1e1b4b', skin: '#efc7a8', hair: '#8b3a1a', style: 'bun' } },
  { id: 'col-theo', name: 'Theo', colors: { shirt: '#16a34a', shorts: '#14532d', skin: '#f1c9a5', hair: '#5a3a22', style: 'long' } },
];
const CASTS = { highschool: HIGH_SCHOOL, collegiate: COLLEGIATE };

/** Who races at `level` (a LEVELS id, core/storage.js): its own cast, or for Pro (and anything else) the six above. */
export function castOf(level) {
  return CASTS[level] ?? CHARACTERS;
}

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
 * Everyone else in event `eventId` at `level`: your rivals, five of that
 * level's cast (castOf). At Pro that's the six above without you; playing as
 * an athlete you made, or against a cast you're not in, the one whose shirt
 * looks most like yours sits out, so the lanes still read apart.
 */
export function rivals(eventId, level) {
  if (survival.active) return [survival.rival]; // survival: just him
  const me = player(eventId);
  const others = castOf(level).filter((c) => c !== me);
  if (others.length < 6) return others;
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
