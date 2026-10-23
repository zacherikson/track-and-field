// Real event scenes set up at their orange pads, on the test rig (rig.mjs).
// Each returns { sc, rig, z } where z = when the orange pads appeared (sim s);
// test times are given from z, as in the spec (/workspace/specs/orange-pad-fix-v1.md §5).
import { makeRig, down, LX } from './rig.mjs';
import { CONFIG } from '../../src/config.js';
import { LongJump } from '../../src/events/longJump.js';
import { PoleVault } from '../../src/events/poleVault.js';
import { Javelin } from '../../src/events/javelin.js';
import { Sprint100 } from '../../src/events/sprint100.js';
import { Hurdles110 } from '../../src/events/hurdles110.js';

/**
 * A field event running into its zone at speed v. `before(rig)`: queue
 * run-up presses (they're strides, the zone isn't lit yet). The zone lights
 * on the step after `lead` m of running.
 */
function field(Scene, ev, zoneAt, { v = 10, lead = 0.3, before } = {}) {
  const sc = new Scene(ev);
  const rig = makeRig(sc);
  sc.enter();
  sc.setState('run');
  sc.runner.v = v;
  sc.runner.x = zoneAt - lead;
  before?.(rig);
  rig.runUntil(() => !sc.runUp.striding, 2);
  return { sc, rig, z: sc.runUp.zoneT };
}

export const longJump = (o) => field(LongJump, { id: 'longjump', name: 'Long Jump' }, -CONFIG.longJump.zoneDistance, o);
export const javelin = (o) => field(Javelin, { id: 'javelin', name: 'Javelin' }, -CONFIG.javelin.zoneDistance, o);
// Pole vault: the zone is plantX - zoneDistance, known once the scene exists.
export function poleVaultAt(o = {}) {
  const sc = new PoleVault({ id: 'polevault', name: 'Pole Vault' });
  const rig = makeRig(sc);
  sc.enter();
  sc.setState('run');
  sc.runner.v = o.v ?? 10;
  sc.runner.x = sc.plantX - CONFIG.poleVault.zoneDistance - (o.lead ?? 0.3);
  o.before?.(rig);
  rig.runUntil(() => !sc.runUp.striding, 2);
  return { sc, rig, z: sc.runUp.zoneT };
}

/** Seconds from the zone lighting to the plant, at the default speed (a dry run: no presses). */
export function plantOffset(o = {}) {
  const { sc, rig, z } = poleVaultAt(o);
  rig.runUntil(() => sc.plantT != null, 5);
  return sc.plantT - z;
}

/**
 * A lane race at its lean zone: through the countdown to GO, then the player
 * put just short of the zone at speed v. z = carryT (the lean pads appear).
 */
function race(Scene, ev, { v = 11, setup } = {}) {
  const sc = new Scene(ev);
  const rig = makeRig(sc);
  sc.enter();
  rig.at(rig.time + 0.02, down(900, LX)).at(rig.time + 0.05, { kind: 'up', id: 900, x: LX }); // start the countdown
  rig.runUntil(() => sc.state === 'race', 10);
  const r = sc.player.runner;
  const D = sc.cfg.distance;
  const prompt = sc.cfg.dipPromptDistance ?? CONFIG.dip.promptDistance;
  r.v = v;
  r.x = D - prompt - 0.05;
  setup?.(sc);
  const lean = { t: null };
  const real = r.lean.bind(r);
  r.lean = () => {
    const ok = real();
    if (ok && lean.t == null) lean.t = rig.time; // the step it happened in
    return ok;
  };
  rig.runUntil(() => r.mode === 'carry', 2);
  return { sc, rig, z: sc.carryT, lean };
}

export const sprint100 = (o) => race(Sprint100, { id: 'sprint100', name: '100m Dash' }, o);
export const hurdles110 = (o) =>
  race(Hurdles110, { id: 'hurdles110', name: '110m Hurdles' }, {
    ...o,
    setup: (sc) => {
      sc.player.hurdles.next = Infinity; // past the last hurdle
      o?.setup?.(sc);
    },
  });
