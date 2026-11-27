import { CONFIG } from '../config.js';
import { releaseTarget } from '../events/poleVaultRules.js';
import { gearFor, idealThrow } from '../events/cyclingRules.js';

/**
 * The demos' player (demoScene.js): one bot per event, playing it the way the
 * How to Play steps say, through the same taps a thumb would make. Each step,
 * before the event's own update, `step(scene, t, dt, pad)` looks at what the
 * event is showing and presses with `pad`:
 *
 *   pad.tap(x, y, t)         a quick tap (down, then up a moment later)
 *   pad.down(id, x, y, t)    a thumb goes down and stays (`id`: 'L' or 'R')
 *   pad.up(id, t)            and comes up
 *
 * `caption(scene)` is the line shown under the play (with a howTo.js icon),
 * `slow(scene)` how fast the demo runs now (under 1: slow motion, for the
 * presses that are all about timing), and `done(scene, t)` says when the demo
 * has shown enough: a race over the line, a field event's first attempt measured.
 *
 * The bots play well but not perfectly (a human pace, the odd late tap), so
 * the demo looks like something you could do.
 */

const SLOW = 0.4; // the demos' slow motion
const STRIDE_RATE = 4.7; // taps/s on the green targets: quick, but a pace a person keeps up
const jitter = (k) => 1 + (Math.random() * 2 - 1) * k;

/** Taps the green target (the 100m's, and every run-up's) at a steady pace. */
function strider(rate = STRIDE_RATE) {
  let nextT = -Infinity;
  let target = null;
  return (judge, pads, t, dt, pad) => {
    if (!judge?.target) return;
    // A new target: a beat to see it (the first one at GO is your reaction).
    if (judge.target !== target || nextT === -Infinity) {
      target = judge.target;
      nextT = Math.max(nextT, t + 0.06);
    }
    if (t + dt < nextT) return;
    const p = pads[judge.target].home;
    pad.tap(p.x, p.y, Math.max(t, nextT));
    nextT = Math.max(t, nextT) + jitter(0.06) / rate;
    target = null;
  };
}

/** Both pads (`a`, `b`: { x, y }), the right `gap` s after the left, held for `hold` s (null: until let go). */
function both(pad, a, b, t, hold = 0.12, gap = 0.01) {
  pad.down('L', a.x, a.y, t);
  pad.down('R', b.x, b.y, t + gap);
  if (hold != null) {
    pad.up('L', t + hold);
    pad.up('R', t + hold + 0.01);
  }
}

/** A lane race's finish lean: both pads, timed to reach full stretch at the line. */
function leaner(line) {
  let leaned = false;
  return (scene, t, pad, a, b) => {
    const r = scene.player.runner;
    if (leaned || r.mode !== 'carry' || t < scene.carryT + CONFIG.dip.armDelay + 0.02) return;
    const toGo = line - r.x;
    if (toGo > r.v * (CONFIG.dip.riseTime + 0.03) + CONFIG.dip.torsoLead) return;
    both(pad, a, b, t);
    leaned = true;
  };
}

/** Slow motion through a lane race's lean zone, until the line. */
const leanSlow = (s) => (s.state === 'race' && s.player.mark == null && s.player.runner.mode !== 'run' ? SLOW : 1);

/** Done once the player's crossed the line and pulled up a little. */
const raceDone = (scene, t) => scene.player?.mark != null && scene.stateT != null && t - scene.stateT > 2.2;

/** Done once a field event's first attempt is on the board (its banner up a moment). */
const markDone = (scene, t) => scene.state === 'mark' && t - scene.stateT > 2.4;

/** Starts a race that waits for a tap (READY / GET SET / GO): a tap in the middle, after a moment. */
function starter(waiting) {
  let at = null;
  return (scene, t, pad) => {
    if (!waiting(scene)) return;
    at ??= t + 0.9;
    if (t >= at) {
      pad.tap(scene.game.view.w / 2, scene.game.view.h * 0.5, t);
      at = Infinity;
    }
  };
}

const BOTS = {
  sprint100() {
    const stride = strider();
    const start = starter((s) => s.state === 'waiting');
    const lean = leaner(CONFIG.sprint100.distance);
    return {
      step(s, t, dt, pad) {
        start(s, t, pad);
        if (s.state !== 'race') return;
        const mode = s.player.runner.mode;
        if (mode === 'run') stride(s.judge, s.pads, t, dt, pad);
        else lean(s, t, pad, s.pads.L.home, s.pads.R.home);
      },
      caption(s) {
        if (s.state !== 'race' && s.state !== 'finished') return { icon: 'tap', text: 'At GO a green target appears on one side…' };
        const mode = s.player.runner.mode;
        if (s.player.mark != null) return { symbol: 'star', text: 'Lean right at the line for the best time' };
        if (mode === 'run') return { icon: 'tap', text: 'Tap the side the green target is on' };
        return { icon: 'both', text: 'Near the line the pads turn orange: press both to lean' };
      },
      slow: leanSlow,
      done: raceDone,
    };
  },

  hurdles110() {
    const start = starter((s) => s.state === 'waiting');
    const lean = leaner(CONFIG.hurdles110.distance);
    let setT = null;
    let nextT = 0;
    return {
      step(s, t, dt, pad) {
        start(s, t, pad);
        if (s.state !== 'race') return;
        const set = s.set;
        if (s.player.runner.mode === 'run') {
          if (!set.slots || set.done) return;
          if (set.shownT !== setT) {
            setT = set.shownT;
            nextT = Math.max(t, setT + 0.2 * jitter(0.15)); // reading the new set
          }
          if (t + dt < nextT) return;
          const p = s.slotPos[set.slots.indexOf(set.next)];
          pad.tap(p.x, p.y, Math.max(t, nextT));
          nextT = Math.max(t, nextT) + 0.17 * jitter(0.1);
        } else lean(s, t, pad, s.slotPos[0], s.slotPos[2]);
      },
      caption(s) {
        if (s.state !== 'race' && s.state !== 'finished') return { icon: 'nums', text: 'At GO three numbered buttons appear…' };
        const mode = s.player.runner.mode;
        if (s.player.mark != null) return { symbol: 'star', text: 'The quicker each set, the quicker you run' };
        if (mode === 'run') return { icon: 'nums', text: 'Tap 1, 2, 3 in order: at GO and after every hurdle' };
        return { icon: 'both', text: 'After the last hurdle, press both to lean' };
      },
      slow: (s) => (s.state === 'race' && s.set?.sets === 1 && !s.set.done ? 0.5 : leanSlow(s)), // the first set, and the lean
      done: raceDone,
    };
  },

  longjump() {
    const stride = strider();
    let jumped = false;
    let stretched = false;
    return {
      step(s, t, dt, pad) {
        const ru = s.runUp;
        const { L, R } = ru.pads;
        if ((s.state === 'ready' || s.state === 'run') && ru.striding && !ru.gliding) stride(ru.judge, ru.pads, t, dt, pad);
        // The board is at 0: take off just behind it, on the last step before it (late is far, over it is a foul).
        if (s.state === 'run' && !ru.striding && !jumped && s.runner.x + s.runner.v * dt >= -0.04) {
          both(pad, L.home, R.home, t, 0.12, 0); // both in this step: a step later could be over the board
          jumped = true;
        }
        if (s.state === 'air' && !stretched && t + dt >= s.jump.apexT + 0.03) {
          both(pad, L.home, R.home, Math.max(t, s.jump.apexT + 0.03));
          stretched = true;
        }
      },
      caption(s) {
        const ru = s.runUp;
        if (s.state === 'ready' || (s.state === 'run' && ru.striding && !ru.gliding)) return { icon: 'tap', text: 'Tap the green targets to run up' };
        if (s.state === 'run' && ru.gliding) return { icon: 'both', text: 'The targets go: get ready to jump…' };
        if (s.state === 'run') return { icon: 'both', text: 'Pads orange: press both to jump, right at the board' };
        if (s.state === 'air' && s.jump.stretchT == null) return { icon: 'both', text: 'At the top of the jump, press both again to stretch' };
        if (s.state === 'air' || s.state === 'landed') return { icon: 'both', text: 'Stretched out: legs forward into the sand' };
        return { badge: '×3', text: 'Three jumps. Your best counts' };
      },
      slow: (s) => ((s.state === 'run' && !s.runUp.striding) || (s.state === 'air' && s.jump.stretchT == null) ? SLOW : 1),
      done: markDone,
    };
  },

  polevault() {
    const stride = strider();
    let pressed = false;
    let released = false;
    return {
      step(s, t, dt, pad) {
        const ru = s.runUp;
        const { L, R } = ru.pads;
        if ((s.state === 'ready' || s.state === 'run') && ru.striding && !ru.gliding) stride(ru.judge, ru.pads, t, dt, pad);
        // Press and hold as the spark reaches the tip: the plant.
        if (!pressed && ((s.state === 'run' && !ru.striding && s.runner.v > 0.5 && (s.plantX - s.runner.x) / s.runner.v <= 0.03) || s.state === 'vault')) {
          both(pad, L.home, R.home, t, null);
          pressed = true;
        }
        // Let go as the spark climbs back to your hands.
        if (pressed && !released && s.state === 'vault' && s.vault) {
          const c0 = s.climbStart();
          if (c0 != null && t + dt >= c0 + releaseTarget(s.cfg, s.vault.v) - 0.01) {
            pad.up('L', t);
            pad.up('R', t + 0.01);
            released = true;
          }
        }
      },
      caption(s) {
        const ru = s.runUp;
        if (s.state === 'ready' || (s.state === 'run' && ru.striding)) return { icon: 'tap', text: 'Tap the green targets to run up' };
        if (s.state === 'run' && s.holdT == null) return { icon: 'spark', text: 'A spark runs down the pole: when it hits the tip, press and hold both' };
        const c0 = s.state === 'vault' && s.vault ? s.climbStart() : null;
        const letGo = c0 != null && s.now >= c0 + releaseTarget(s.cfg, s.vault.v) - 0.4; // a beat before the release
        if ((s.state === 'run' || s.state === 'vault') && s.releaseT == null && !letGo) return { icon: 'hold', text: 'Hold on: the spark climbs back up the pole…' };
        if (s.state === 'vault' || s.state === 'fly' || s.state === 'air') return { icon: 'letgo', text: '…and let go as it reaches your hands' };
        return { badge: '×3', text: 'Three vaults. Your best height counts' };
      },
      slow: (s) => ((s.state === 'run' && !s.runUp.striding) || (s.state === 'vault' && s.releaseT == null) ? SLOW : 1),
      done: markDone,
    };
  },

  javelin() {
    const stride = strider();
    const a = CONFIG.javelin.angle;
    const holdFor = (a.best - a.start) / a.rate; // s held to reach the best angle
    let held = false;
    let thrown = false;
    return {
      step(s, t, dt, pad) {
        const ru = s.runUp;
        const { L, R } = ru.pads;
        if ((s.state === 'ready' || s.state === 'run') && ru.striding && !ru.gliding) stride(ru.judge, ru.pads, t, dt, pad);
        // Hold so the best angle comes up a couple of metres short of the line.
        if (s.state === 'run' && !ru.striding && !held && t > ru.zoneT + 0.25 && -s.runner.x <= s.runner.v * holdFor + 2) {
          both(pad, L.home, R.home, t, null);
          held = true;
        }
        if (held && !thrown && s.holdT != null && (t + dt >= s.holdT + holdFor || s.runner.x > -0.6)) {
          pad.up('L', t);
          pad.up('R', t + 0.01);
          thrown = true;
        }
      },
      caption(s) {
        const ru = s.runUp;
        if (s.state === 'ready' || (s.state === 'run' && ru.striding)) return { icon: 'tap', text: 'Tap the green targets to run up' };
        if (s.state === 'run' && s.holdT == null) return { icon: 'hold', text: 'Pads orange: press and hold both. The tip rises' };
        if (s.state === 'run') return { icon: 'angle', text: 'Let go at about 36°, before the line' };
        return { icon: 'angle', text: 'Let go before the line, or it’s a foul' };
      },
      slow: (s) => (s.state === 'run' && s.holdT != null ? 0.5 : 1), // the tip rising
      done: markDone,
    };
  },

  relay4x100() {
    const stride = strider();
    const start = starter((s) => s.state === 'waiting');
    let handT = null;
    let passedAt = null;
    return {
      step(s, t, dt, pad) {
        start(s, t, pad);
        if (s.state !== 'race') return;
        const view = s.game.view;
        const cx = view.w / 2;
        const cy = view.h * s.cfg.button.y;
        const ex = s.player.ex;
        if (s.batonUp && ex?.open) {
          if (ex.stage === 'zone' && ex.gapNow <= 2.6 && passedAt == null) {
            pad.tap(cx, cy, t);
            passedAt = t;
          } else if (ex.stage === 'reach' && t - passedAt > s.cfg.doubleTap + 0.05 && ex.gapNow <= s.cfg.reach * 0.92) {
            pad.tap(cx, cy, t);
            passedAt = Infinity;
          }
          return;
        }
        if (s.popup && s.popup.t0 !== handT) {
          handT = s.popup.t0; // handed over (relay4x100.js handOff): on to the next leg
          passedAt = null;
        }
        if (s.player.runner.mode === 'run') stride(s.judge, s.pads, t, dt, pad);
      },
      caption(s) {
        if (s.state !== 'race') return { icon: 'tap', text: 'Four legs of 100m: tap the green targets, as in the 100m' };
        const ex = s.player.ex;
        if (s.batonUp && ex?.stage === 'zone') return { icon: 'blue', glyph: 'PASS', text: 'In the blue zone, tap PASS to reach the baton out' };
        if (s.batonUp && ex?.stage === 'reach') return { icon: 'blue', glyph: 'TAKE', text: 'Tap TAKE when the ring meets the button' };
        if (handT != null) return { icon: 'blue', glyph: 'TAKE', text: 'Handed over! Now run the next leg' };
        return { icon: 'tap', text: 'Tap the green targets. Your teammate sets off as you get close' };
      },
      slow: (s) => (s.batonUp ? 0.5 : 1),
      done: (s, t) => handT != null && t - handT > 3,
    };
  },

  timetrial() {
    const RATE = 4.4; // pedal strokes/s
    const start = starter((s) => s.state === 'waiting');
    let nextT = 0;
    let shiftT = -Infinity;
    let tucked = false;
    let thrown = false;
    const lift = (pad, t) => {
      pad.up('L', t);
      pad.up('R', t);
      tucked = false;
    };
    return {
      step(s, t, dt, pad) {
        start(s, t, pad);
        if (s.state !== 'ride') return;
        const b = s.bike;
        const cfg = s.cfg;
        const P = s.pads;
        // The bike throw, timed as the rivals' (cyclingRules.js idealThrow).
        if (s.throwZone) {
          if (tucked) lift(pad, t);
          if (!thrown && s.road.length - b.front <= idealThrow(b) + 0.1) {
            both(pad, P.L, P.R, t + 0.02);
            thrown = true;
          }
          if (thrown) return;
        }
        // Downhill and spun out in top gear: tuck (both held), until it flattens out.
        const top = cfg.gears.length - 1;
        const spunOut = b.grade < -0.025 && b.gear === top && b.v / cfg.gears[top] > RATE * 0.95;
        if (spunOut && !tucked && !s.throwZone) {
          both(pad, P.L, P.R, t, null);
          tucked = true;
        }
        if (tucked) {
          if (spunOut) return;
          lift(pad, t);
          nextT = t + 0.1;
        }
        // A gear at a time toward the one that keeps the pedals near their best speed (as the rivals shift).
        const want = gearFor(cfg.gears, b.v, Math.min(cfg.cMax / 2, RATE * 0.9));
        if (want !== b.gear && t - shiftT > 0.35 && b.v > 2) {
          const sh = s.shifters[want > b.gear ? 1 : -1];
          pad.tap(sh.x, sh.y, t);
          shiftT = t;
          nextT = Math.max(nextT, t + 0.08);
          return;
        }
        if (t + dt < nextT) return;
        const side = b.lastSide === 'L' ? 'R' : 'L';
        pad.tap(P[side].x, P[side].y, Math.max(t, nextT));
        nextT = Math.max(t, nextT) + jitter(0.05) / RATE;
      },
      caption(s) {
        if (s.state === 'waiting' || s.state === 'count') return { icon: 'tap', text: 'A time trial: 620 m of hills, against the clock' };
        const b = s.bike;
        if (s.throwZone || b.throwT != null) return { icon: 'both', text: 'Last stretch: press both to throw the bike at the line' };
        if (b.tuck || tucked) return { icon: 'hold', text: 'Downhill and spun out: hold both pads to tuck' };
        if (s.game.time - shiftT < 1.2) {
          return b.grade > 0.02
            ? { icon: 'gears', text: 'Climbing: − for an easier gear. Keep the PEDALS needle in the green' }
            : { icon: 'gears', text: 'Picking up speed: + for a harder gear. Keep the needle in the green' };
        }
        return { icon: 'tap', text: 'Pedal with the big pads, left and right in turn: green is next' };
      },
      slow: (s) => (s.throwZone ? 0.5 : 1),
      captionY: 54, // its gears are along the bottom
      done: (s, t) => s.state === 'finished' && t - s.stateT > 1.6,
    };
  },
};

/** The bot for event `id`, or null if there's no demo for it. */
export function demoBot(id) {
  return BOTS[id]?.() ?? null;
}

/** Events that have a demo. */
export const DEMO_IDS = Object.keys(BOTS);
