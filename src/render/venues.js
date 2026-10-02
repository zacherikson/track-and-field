import { getCampaign } from '../core/storage.js';

/**
 * Where each mode is played: Training is a rundown community track in the
 * woods, Amateur a decent high-school stadium with a half-full stand, Pro a
 * packed Olympic one with a blue track under the lights. Live play uses Pro.
 *
 * PAINT AND PROPS ONLY. Every venue shares the geometry in track.js LAYOUT
 * (horizon, far and near edges of the track), because the perspective solve,
 * the event cameras, the late-hit venues (brawl/venue.js) and the vault's
 * upward pan are all tuned against those numbers. A venue may change any
 * color, swap what fills the stands band (`stands` or `backdrop`) and what the
 * hoardings look like (`boards.kind`), but never where the ground is.
 *
 * TrackRenderer and its subclasses read the chosen one as `this.venue`.
 *
 *   sky        { top, bottom, high }  high = the deep color the vault pans up into
 *   stands     grandstand, or null for none (then `backdrop` fills the band)
 *              { body, roof, rows, rowH, seatW, emptyEvery, shade, crowd[] }
 *              emptyEvery: 1 seat in N is empty (0 = packed solid)
 *   backdrop   what's behind the track instead of a stand: { hillFar, hill, tree, treeLit, trunk }
 *   boards     hoardings: kind 'ads' (painted sponsor boards), 'fence'
 *              (chainlink, nothing sold) or 'led' (lit panels), plus words/colors
 *   grass      { base, stripe, stripeM }  stripe null = nobody has mowed it
 *   sector     the javelin landing field, which is its own lighter green
 *   track      running surface and its paint { surface, worn, paint, band, line, apron, curb, tick }
 *              worn: scuff the surface through to dirt (that color), or null
 *   blocks     starting blocks { rail, railTop, plate, plateFace }
 *   sand       long jump pit { sand, rim }
 *   board      takeoff/foul board { face, foul }
 *   mat        vault landing mat { side, top, topBand, front, handle }
 *   upright    vault posts { post, shade }
 *   zone       relay exchange zone { fill, line } — stays blue (it matches the
 *              PASS button) but has to read against this venue's surface
 *   signs      distance signs { post, plate, text }
 *   finish     finish post { post, sign, text }
 *   lights     floodlight towers over the stand
 *   flashes    camera flashes popping in the crowd
 */

const AMATEUR = {
  id: 'amateur',
  name: 'Westfield High',
  sky: { top: '#5aa9e6', bottom: '#a9d6f5', high: '#2f7fc8' },
  stands: {
    body: '#39465e',
    roof: '#2a3346',
    rows: 6,
    rowH: 14,
    seatW: 14,
    emptyEvery: 4, // a school meet: plenty of spare seats
    shade: 'rgba(0,0,0,0.18)',
    crowd: ['#f4d35e', '#ee964b', '#f95738', '#faf0ca', '#0d3b66', '#8ecae6', '#e9edc9', '#b5838d'],
  },
  backdrop: null,
  boards: {
    kind: 'ads',
    words: ['TRACK ROYALE', 'TAP TAP GO', 'FAST THUMBS', 'RUN JUNO RUN', 'NO FALSE STARTS'],
    colors: ['#1b998b', '#e4572e', '#2e294e', '#f1c40f', '#3f88c5'],
    dark: [3], // boards whose lettering goes dark instead of white
  },
  grass: { base: '#4c9a3f', stripe: '#56a847', stripeM: 4 },
  sector: { base: '#7ccf55', stripe: '#86d65e' },
  track: {
    surface: '#c1502e',
    worn: null,
    paint: 'rgba(255,255,255,0.85)',
    band: 'rgba(255,255,255,0.7)',
    line: '#fff',
    apron: '#3f8f3a',
    curb: '#e8e8e8',
    tick: '#9a9a9a',
  },
  zone: { fill: 'rgba(64,140,255,0.2)', line: '#3d86ff' },
  blocks: { rail: '#3b4250', railTop: '#9aa3b2', plate: '#b3172b', plateFace: '#ef4f5f' },
  sand: { sand: '#e6cf95', rim: '#d9d2c3' },
  board: { face: '#f7f7f2', foul: '#e8281e' },
  mat: { side: '#22398a', top: '#f4c532', topBand: '#ffdc5e', front: '#2e4fb8', handle: '#1b2d6e' },
  upright: { post: '#e7c21c', shade: '#9a7f0a' },
  signs: { post: '#fff', plate: '#c62828', text: '#fff' },
  finish: { post: '#ddd', sign: '#12203a', text: '#ffb400' },
  lights: false,
  flashes: false,
};

const TRAINING = {
  id: 'training',
  name: 'Pinebrook Park',
  sky: { top: '#8da3b3', bottom: '#c6d2d8', high: '#6f8897' }, // overcast
  stands: null, // nobody came; there's nowhere to sit
  backdrop: { hillFar: '#7d9471', hill: '#5c7a52', tree: '#2f5436', treeLit: '#3f6b42', trunk: '#4a3b2e' },
  boards: { kind: 'fence', back: '#6e8a63', mesh: 'rgba(228,236,228,0.45)', post: '#8a8f86' },
  grass: { base: '#6f8b48', stripe: null, stripeM: 4 }, // dry and unmown
  sector: { base: '#7d9150', stripe: null },
  track: {
    surface: '#9c6a4e', // sun-faded brick, half gone to dirt
    worn: '#8a7256',
    paint: 'rgba(240,238,228,0.45)', // chalk, not paint
    band: 'rgba(240,238,228,0.3)',
    line: 'rgba(240,238,228,0.65)',
    apron: '#6f8b48',
    curb: '#b9b3a4',
    tick: '#8d8778',
  },
  zone: { fill: 'rgba(64,140,255,0.22)', line: '#4f82c8' }, // faded paint, like the rest of it
  blocks: { rail: '#4a4a46', railTop: '#8c8a80', plate: '#8c4a3a', plateFace: '#a9614c' }, // rusted
  sand: { sand: '#cdbd93', rim: '#b8b2a4' },
  board: { face: '#e4e0d2', foul: '#b4443a' },
  mat: { side: '#3f5a7a', top: '#c9b06a', topBand: '#d8c07c', front: '#49668a', handle: '#2d4259' },
  upright: { post: '#b8a24a', shade: '#7d6c2c' },
  signs: { post: '#c8c2b4', plate: '#9e4a3f', text: '#f2efe6' },
  finish: { post: '#b9b3a4', sign: '#3a4432', text: '#e8d88a' },
  lights: false,
  flashes: false,
};

const PRO = {
  id: 'pro',
  name: 'Olympic Stadium',
  sky: { top: '#17356b', bottom: '#e8915c', high: '#0d1f4d' }, // evening final
  stands: {
    body: '#1d2740',
    roof: '#121a2c',
    rows: 8, // deeper stand, smaller heads: a long way up
    rowH: 11,
    seatW: 10,
    emptyEvery: 0, // sold out
    shade: 'rgba(0,0,0,0.22)',
    crowd: ['#ffd23f', '#ff7a3d', '#ff3d5a', '#f7f3e8', '#2a6df4', '#49d6ff', '#b6f24a', '#ff6ad5', '#ffffff', '#ffb02e'],
  },
  backdrop: null,
  boards: {
    kind: 'led',
    words: ['TRACK ROYALE', 'WORLD FINAL', 'LANE 1 JUNO', 'RECORD WATCH', 'PRIME TIME'],
    colors: ['#0b8f8a', '#d92b1f', '#1b1f4b', '#f0b90b', '#1f6fd0'],
    dark: [3],
  },
  grass: { base: '#2f7d34', stripe: '#38903c', stripeM: 3 },
  sector: { base: '#49a83f', stripe: '#54b847' },
  track: {
    surface: '#1b63a8', // the blue one
    worn: null,
    paint: 'rgba(255,255,255,0.95)',
    band: 'rgba(255,255,255,0.85)',
    line: '#fff',
    apron: '#2f7d34',
    curb: '#f4f6f8',
    tick: '#c6ccd2',
  },
  zone: { fill: 'rgba(150,215,255,0.34)', line: '#a5deff' }, // pale: a blue zone on a blue track
  blocks: { rail: '#2b3140', railTop: '#cfd6e2', plate: '#d81f3c', plateFace: '#ff5a6e' },
  sand: { sand: '#efdca6', rim: '#eceade' },
  board: { face: '#ffffff', foul: '#ff2a1e' },
  mat: { side: '#16307f', top: '#ffd23f', topBand: '#ffe680', front: '#1f3fa8', handle: '#0f2060' },
  upright: { post: '#ffd23f', shade: '#b08c10' },
  signs: { post: '#fff', plate: '#e01b26', text: '#fff' },
  finish: { post: '#f0f4f8', sign: '#0b1733', text: '#ffd23f' },
  lights: true,
  flashes: true,
};

export const VENUES = { training: TRAINING, amateur: AMATEUR, pro: PRO };

/**
 * The venue for the mode being played: the campaign's (core/storage.js), or
 * the park if there isn't one. Live play is always the big stadium, whoever
 * last picked a campaign.
 */
export function venueFor(live = false) {
  if (live) return PRO;
  return VENUES[getCampaign()] ?? TRAINING;
}
