import { getCharacter, getLineup } from '../core/storage.js';

/**
 * The athletes (original characters). Your lineup (LineupScene) says who does
 * each event, and your solo athlete does all five in a solo tournament; in each
 * event the other five are your rivals. Each has a kit, a skin tone and a hairstyle (`hair`
 * color + `style`, drawn by drawFigure) so they read apart at a glance, and
 * Chonk has a heavier build (`girth`), Joey is two-thirds the height (`height`).
 * An athlete with drawn art names its sheet with `sprite` (e.g. `sprite: 'juno'`
 * for src/athletes/sprites/juno.png + .json); lane races draw it in place of the
 * stick figure (sprites.js).
 * Looks only: everyone runs on the same physics.
 */
export const CHARACTERS = [
  { id: 'juno', name: 'Juno', tagline: 'The original. Headband on, eyes on gold.', colors: { shirt: '#ffb400', shorts: '#12203a', skin: '#f1c9a5', hair: '#3a2416', style: 'band' } },
  { id: 'joey', name: 'Joey', tagline: 'Half the height, twice the attitude, bald.', colors: { shirt: '#2f7fd8', shorts: '#1b2a41', skin: '#f5d2b8', hair: '#6b4226', style: 'short', height: 2 / 3 } },
  { id: 'okoro', name: 'Okoro', tagline: 'Big hair, bigger strides.', colors: { shirt: '#59cd90', shorts: '#1b2a41', skin: '#5c3a24', hair: '#141414', style: 'afro' } },
  { id: 'lindqvist', name: 'Lindqvist', tagline: 'Ice cold at the line.', colors: { shirt: '#ee6352', shorts: '#2b2b2b', skin: '#f3d3b8', hair: '#f0d27a', style: 'ponytail' } },
  { id: 'chan', name: 'Chan', tagline: 'Quiet, quick, and never late off the blocks.', colors: { shirt: '#b388eb', shorts: '#2b2b2b', skin: '#eccb9f', hair: '#121212', style: 'fringe' } },
  { id: 'chonk', name: 'Chonk', tagline: 'Built for comfort. Somehow still fast.', colors: { shirt: '#f5f5f5', shorts: '#3d3d3d', skin: '#f0b99a', hair: '#8a4b2a', style: 'bun', girth: 2.3 } },
];

const byId = (id) => CHARACTERS.find((c) => c.id === id) ?? null;

let solo = false; // a solo tournament is on: your solo athlete does every event

/** Set by the tournament: while `on`, player() is your solo athlete in every event. */
export function useSolo(on) {
  solo = on;
}

/** Your solo athlete (chosen on the Lineup screen, remembered on this device). */
export function soloAthlete() {
  return byId(getCharacter()) ?? CHARACTERS[0];
}

/** Who does event `eventId` in your lineup (your solo athlete if that slot was never set). */
export function lineupAthlete(eventId) {
  return byId(getLineup()[eventId]) ?? soloAthlete();
}

/** The athlete you play event `eventId` as: your lineup's, or your solo athlete in a solo tournament. */
export function player(eventId) {
  return solo ? soloAthlete() : lineupAthlete(eventId);
}

/** Another player's athlete in event `eventId`, from what their phone sent: { athlete, lineup? } (tournament.js liveAthletes). */
export function theirAthlete(p, eventId) {
  return byId(p?.lineup?.[eventId]) ?? byId(p?.athlete) ?? CHARACTERS[0];
}

/** An athlete's height as a share of everyone else's (Joey: 2/3). */
export function heightOf(colors) {
  return colors?.height ?? 1;
}

/** Everyone else in event `eventId`: your rivals. */
export function rivals(eventId) {
  const me = player(eventId);
  return CHARACTERS.filter((c) => c !== me);
}

/** The default athlete (tools and sprite sheets draw Juno). */
export const HERO = CHARACTERS[0];
