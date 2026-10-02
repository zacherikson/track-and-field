// Draws every venue through every renderer against a recording canvas stub, so
// a venue missing a color any renderer reads fails here instead of on a phone.
//
//   node tools/venuecheck.mjs
//
import { VENUES } from '../src/render/venues.js';
import { TrackRenderer } from '../src/render/track.js';
import { RunwayRenderer } from '../src/render/runway.js';
import { VaultRenderer } from '../src/render/vaultArena.js';
import { JavelinRenderer } from '../src/render/javelinField.js';
import { RoadRenderer, drawCyclist } from '../src/render/road.js';
import { buildCourse } from '../src/events/cyclingRules.js';
import { CHARACTERS } from '../src/athletes/roster.js';
import { Camera } from '../src/core/camera.js';
import { CONFIG } from '../src/config.js';

const grad = () => ({ addColorStop(o, c) { if (c == null) throw new Error(`gradient stop ${o} is ${c}`); } });

function recorder() {
  const fills = new Set();
  const ctx = {
    _fills: fills,
    set fillStyle(v) { if (v == null) throw new Error('fillStyle set to ' + v); if (typeof v === 'string') fills.add(v); },
    get fillStyle() { return '#000'; },
    set strokeStyle(v) { if (v == null) throw new Error('strokeStyle set to ' + v); if (typeof v === 'string') fills.add(v); },
    get strokeStyle() { return '#000'; },
    lineWidth: 1, lineCap: 'butt', font: '', textAlign: 'center', textBaseline: 'middle',
    shadowColor: '', shadowBlur: 0, shadowOffsetY: 0,
    fillRect() {}, strokeRect() {}, clearRect() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, fill() {}, stroke() {},
    arc() {}, ellipse() {}, rect() {}, clip() {},
    save() {}, restore() {}, translate() {}, scale() {}, rotate() {},
    createLinearGradient: grad, createRadialGradient: grad,
    measureText: (s) => ({ width: s.length * 8 }),
    fillText() {},
  };
  return ctx;
}

const view = { w: 960, h: CONFIG.view.logicalHeight, safe: { l: 0, r: 0, t: 0, b: 0 } };
let checks = 0;

function run(label, fn) {
  const ctx = recorder();
  fn(ctx);
  checks++;
  return ctx._fills;
}

for (const [id, venue] of Object.entries(VENUES)) {
  const cam = new Camera();
  cam.x = 40;

  // 100m / hurdles / relay: the full stadium, start blocks, finish, zones.
  const race = new TrackRenderer(6, 100, 2, venue);
  race.zones = [{ from: 80, to: 100 }]; // relay exchange zone
  const raceFills = run('race', (ctx) => {
    race.draw(ctx, view, cam);
    race.highlightLane(ctx, view, 3, 0.2);
    const near = new Camera(); near.x = 2;
    race.draw(ctx, view, near); // start blocks in view
    const end = new Camera(); end.x = 99;
    race.draw(ctx, view, end); // finish line, ticks and post in view
  });
  if (!raceFills.has(venue.track.surface)) throw new Error(`${id}: track surface never painted`);
  if (!raceFills.has(venue.blocks.plate)) throw new Error(`${id}: start blocks never painted`);
  if (!raceFills.has(venue.zone.line)) throw new Error(`${id}: relay zone never painted`);

  // Long jump: runway, pit, signs, marks.
  const lj = new RunwayRenderer(40, { from: 1, to: 10.5 }, CONFIG.longJump.runwayZones, venue);
  lj.marks = [{ x: 7.2 }];
  lj.footmarks = [{ x: -0.1, foul: false }, { x: 0.05, foul: true }];
  const ljFills = run('longJump', (ctx) => {
    const c = new Camera(); c.x = 4;
    lj.draw(ctx, view, c);
  });
  if (!ljFills.has(venue.sand.sand)) throw new Error(`${id}: sand never painted`);
  if (!ljFills.has(venue.signs.plate)) throw new Error(`${id}: distance signs never painted`);

  // Pole vault: runway, plant box, mat, both uprights, the tall sky.
  const pv = new VaultRenderer(CONFIG.poleVault, venue);
  pv.bar = 5.2;
  pv.lastHeight = 4.8;
  const pvFills = run('vault', (ctx) => {
    const c = new Camera(); c.x = 1;
    pv.draw(ctx, view, c);
    pv.drawMat(ctx, view, c);
    pv.drawUprightsBack(ctx, view, c);
    pv.drawUprightsFront(ctx, view, c);
  });
  if (!pvFills.has(venue.mat.top)) throw new Error(`${id}: vault mat never painted`);
  if (!pvFills.has(venue.upright.post)) throw new Error(`${id}: uprights never painted`);

  // Javelin: runway, sector, foul line, plus the flight and landing shots.
  const jv = new JavelinRenderer(CONFIG.javelin, 98.5, venue);
  const jvFills = run('javelin', (ctx) => {
    const c = new Camera(); c.x = 2;
    jv.draw(ctx, view, c);
    jv.drawFlight(ctx, view, c, 40, 14);
    jv.drawSkyline(ctx, view, 40, 200);
  });
  if (!jvFills.has(venue.sector.base)) throw new Error(`${id}: javelin sector never painted`);

  // Time trial: the road at the start, a time check and the finish, and a rider on it.
  const road = new RoadRenderer(buildCourse(CONFIG.cycling.course), venue);
  const roadFills = run('road', (ctx) => {
    for (const x of [0, CONFIG.cycling.course.checks[0], CONFIG.cycling.course.length]) road.draw(ctx, view, { x, h: road.road.heightAt(x) });
    drawCyclist(ctx, 300, 300, 80, -0.1, { crank: 1, wheel: 1, tuck: false, reach: 0.3 }, CHARACTERS[0].colors);
  });
  if (!roadFills.has(venue.road.asphalt)) throw new Error(`${id}: road never painted`);
  if (!roadFills.has(venue.road.banner)) throw new Error(`${id}: road banners never painted`);

  const all = new Set([...raceFills, ...ljFills, ...pvFills, ...jvFills, ...roadFills]);
  console.log(`${id.padEnd(9)} ok — ${all.size} distinct colors, sky ${venue.sky.top} → ${venue.sky.bottom}, track ${venue.track.surface}`);
}

console.log(`\n${checks} draw passes, 0 undefined colors.`);
