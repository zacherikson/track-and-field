import { CONFIG } from '../config.js';
import { Runner } from '../athletes/runner.js';
import { AIController } from '../athletes/ai.js';
import { Exchange, exchangeSpot, LEG } from './relayRules.js';
import { clamp } from '../core/math.js';

const STEP = CONFIG.loop.fixedStep;

/**
 * A COMPUTER RELAY TEAM that runs the same race on every phone: a squad's
 * practice squad (practiceRelay.js). Its randomness comes from `rng` (a
 * seededRandom every phone in the room makes from the same seed), and it runs
 * on its own clock, in fixed steps from the gun, not on the phone's frames. So
 * every phone works out the same race and the same time with nothing sent:
 * advanceTo(race time) catches it up each frame.
 *
 * It runs as a computer team does in Relay4x100 (and tools/simulate.mjs): each
 * leg on the 100m's strides, the baton changing hands in the zones
 * (relayRules.js), the anchor leaning at the line.
 *
 * @param cfg       the relay's config (Relay4x100's: CONFIG.sprint100 with CONFIG.relay over it)
 * @param level     CONFIG.ai.<level>: how its legs run
 * @param exchange  CONFIG.relay.ai.<level>: how they pass
 * @param rng       () => [0, 1)
 * @param legs      its four Runners (the race draws them), or new ones
 */
export class RelayTeamSim {
  constructor({ cfg, level, exchange, rng, legs = null, runnerParams }) {
    this.cfg = cfg;
    this.legs = legs ?? [0, 1, 2, 3].map((k) => new Runner(runnerParams, undefined, k === 0 ? cfg.startX : exchangeSpot(cfg, k - 1).wait));
    this.ais = this.legs.map((r) => new AIController(r, level, null, rng));
    this.exchanges = [0, 1, 2].map((k) => new Exchange(cfg, k, this.legs[k], this.legs[k + 1], exchange, rng));
    this.leg = 0; // who has the baton
    this.mark = null; // s from the gun, once the anchor's over the line
    this.n = 0; // steps run
  }

  /** Race time it's run to (s from the gun). */
  get t() {
    return this.n * STEP;
  }

  /** Runs every step that ends by race time `raceT` (s from the gun). */
  advanceTo(raceT) {
    const end = Math.min(raceT, this.cfg.maxRaceTime);
    while ((this.n + 1) * STEP <= end + 1e-9) this.step();
  }

  step() {
    const t = this.n * STEP;
    const D = this.cfg.distance;
    if (this.n === 0) this.ais[0].go(0);
    const r = this.legs[this.leg];
    const ex = this.exchanges[this.leg];
    if (!ex || ex.stage === 'approach') {
      if (this.leg === 3 && D - r.x <= CONFIG.dip.promptDistance && r.mode === 'run' && !r.dipUsed) r.carry();
      this.ais[this.leg].update(t, STEP, clamp((r.x - this.leg * LEG) / LEG, 0, 1), D - r.x);
      r.update(STEP, t);
    }
    for (const e of this.exchanges) {
      if (e.step(t, STEP) !== 'handoff') continue;
      this.leg = e.k + 1;
      const ai = this.ais[this.leg];
      ai.nextTapT = t + STEP + 1 / ai.cadence;
    }
    for (const l of this.legs) if (l.finished && l !== this.legs[this.leg]) l.update(STEP, t);
    if (this.leg === 3 && this.mark == null) {
      const cross = this.legs[3].crossing(D, t, STEP);
      if (cross != null) {
        this.mark = cross;
        this.legs[3].finished = true;
      }
    }
    this.n++;
  }
}
