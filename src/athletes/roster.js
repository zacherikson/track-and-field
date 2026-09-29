import { getCharacter } from '../core/storage.js';

/**
 * The athletes (original characters). You pick one on the menu; the other
 * five are your rivals. Each has a kit, a skin tone and a hairstyle (`hair`
 * color + `style`, drawn by drawFigure) so they read apart at a glance, and
 * Chonk has a heavier build (`girth`).
 * Looks only: everyone runs on the same physics.
 */
export const CHARACTERS = [
  { id: 'juno', name: 'Juno', tagline: 'The original. Headband on, eyes on gold.', colors: { shirt: '#ffb400', shorts: '#12203a', skin: '#f1c9a5', hair: '#3a2416', style: 'band' } },
  { id: 'brix', name: 'Brix', tagline: 'Short fuse, shorter splits.', colors: { shirt: '#3fa7d6', shorts: '#1b2a41', skin: '#8d5a3b', hair: '#1a1a1a', style: 'spiky' } },
  { id: 'okoro', name: 'Okoro', tagline: 'Big hair, bigger strides.', colors: { shirt: '#59cd90', shorts: '#1b2a41', skin: '#5c3a24', hair: '#141414', style: 'afro' } },
  { id: 'lindqvist', name: 'Lindqvist', tagline: 'Ice cold at the line.', colors: { shirt: '#ee6352', shorts: '#2b2b2b', skin: '#f3d3b8', hair: '#f0d27a', style: 'ponytail' } },
  { id: 'chan', name: 'Chan', tagline: 'Quiet, quick, and never late off the blocks.', colors: { shirt: '#b388eb', shorts: '#2b2b2b', skin: '#eccb9f', hair: '#121212', style: 'fringe' } },
  { id: 'chonk', name: 'Chonk', tagline: 'Built for comfort. Somehow still fast.', colors: { shirt: '#f5f5f5', shorts: '#3d3d3d', skin: '#f0b99a', hair: '#8a4b2a', style: 'bun', girth: 2.3 } },
];

/** The athlete you play as (chosen on the menu, remembered on this device). */
export function player() {
  return CHARACTERS.find((c) => c.id === getCharacter()) ?? CHARACTERS[0];
}

/** Everyone else: your rivals. */
export function rivals() {
  const me = player();
  return CHARACTERS.filter((c) => c !== me);
}

/** The default athlete (tools and sprite sheets draw Juno). */
export const HERO = CHARACTERS[0];
