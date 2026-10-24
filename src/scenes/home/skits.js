import { CONFIG } from '../../config.js';
import { runPose, lerpPose, sampleTrack, hurdlePose, tripPose, launchPose, POSES, JUMP_POSES, JAVELIN_POSES, VAULT_POSES } from '../../athletes/stickFigure.js';
import { heightOf } from '../../athletes/roster.js';
import { FIGHT, PUNCH, KICK, SLAM, HURT, KNOCK, relaxed, stance, punch, kick, slam, hurt, fly, getup, held, emote } from '../../brawl/poses.js';

/**
 * The sideshow's skits (sideshow.js plays them): id -> { cast, draw(s, t, cast) }.
 * `cast` names who a skit needs ('athlete' or 'ref'), in the order draw()
 * gets them. draw() draws the skit `t` s in through the stage `s`
 * (sideshow.js Stage: figures, props, POW bursts, emoji) and returns false
 * once it's over. Positions are in figure heights from the slot's x, + to the
 * right (each run is mirrored at random); `s.left` and `s.right` are the
 * screen's edges in the same units, for coming on and going off.
 */

const TAU = Math.PI * 2;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const ease = (k) => k * k * (3 - 2 * k);
const lerp = (a, b, t) => a + (b - a) * t;
const arc = (k, h) => h * 4 * k * (1 - k); // up and back down: 0 at k = 0 and 1, h at the top

// ---------- poses ----------
/** One stride, in figure heights, at run effort `a` (as runPose's stride). */
const cycle = (a) => (CONFIG.runner.strideBase + CONFIG.runner.stridePerMps * 11 * a) / CONFIG.figure.height;
const WALK = cycle(0.22); // relaxed() walks with runPose at 0.22
/** Walking, `d` figure heights along. */
const walkPose = (d, t) => relaxed((d / WALK) * TAU, 1, t);
/** Running at effort `a`, `d` figure heights along. */
const runAt = (d, a = 0.8) => runPose((d / cycle(a)) * TAU, a);
const standPose = (t) => relaxed(0, 0, t);
/** Near arm straight up: a red card, a flag. */
const ARM_UP = { ...POSES.stand, arms: [{ upper: 2.85, fore: 3.05 }, POSES.stand.arms[1]] };
/** Arms out both ways: break it up. */
const SPLIT = { ...POSES.stand, lean: -0.05, arms: [{ upper: 1.55, fore: 1.6 }, { upper: -1.55, fore: -1.6 }] };
/** Near arm up and forward, for a high five. */
const HIGH5 = { ...POSES.stand, lean: 0.08, arms: [{ upper: 2.2, fore: 2.45 }, POSES.stand.arms[1]] };
/** In the air in a panic: knees up, arms up, flailing. */
function panic(t) {
  const w = Math.sin(t * 24) * 0.3;
  return { hipX: 0, hipY: -0.5, lean: -0.15, legs: JUMP_POSES.tuck.legs, arms: [{ upper: 2.8 + w, fore: 3.2 - w }, { upper: -2.8 - w, fore: -3.2 + w }] };
}
/** Stood up from flat on your face: hands and knees, then up. */
const fromProne = (u) => sampleTrack([[0, JUMP_POSES.prone], [0.35, JUMP_POSES.crouch], [0.75, POSES.stand]], u);
/** Walking off dazed, swaying. */
const dazed = (d, t) => ({ ...walkPose(d, t), lean: 0.12 * Math.sin(t * 5) });

/** Hand over the face: the referee, despairing. */
const FACEPALM = { ...POSES.stand, lean: 0.15, arms: [{ upper: 2.4, fore: -1.65 }, POSES.stand.arms[1]] };
/** Both arms up: winning. */
const ARMS_UP = { ...POSES.stand, arms: [{ upper: 2.75, fore: 2.95 }, { upper: -2.75, fore: -2.95 }] };
/** Near hand reaching back for a baton. */
const REACH_BACK = { ...POSES.stand, lean: 0.15, arms: [{ upper: -1.1, fore: -0.9 }, { upper: 0.4, fore: 1.2 }] };
/** In a conga line, `d` along: walking, hands on the shoulders in front, a kick on every fourth beat. */
function congaPose(d, t) {
  const w = walkPose(d, t);
  const beat = (t * 2.5) % 4;
  const kick = beat > 3 ? Math.sin((beat - 3) * Math.PI) : 0;
  const far = w.legs[1];
  const legs = [w.legs[0], { thigh: lerp(far.thigh, 1.1, kick), shin: lerp(far.shin, 0.9, kick), toe: 0 }];
  return { ...w, lean: 0.1 + 0.05 * Math.sin(t * 15), legs, arms: [{ upper: 1.25, fore: 1.6 }, { upper: 1.15, fore: 1.5 }] };
}
const hash = (n) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}; // 0..1, the same for the same n

/**
 * Two people trading punches: `hits` is [[time, 'a' | 'b', arm], ...] (who
 * throws at that time). The pose of `me` at `t`: punching, rocked, or guard up.
 */
function tradePose(me, t, hits) {
  for (const [h, who, arm] of hits) {
    if (who === me && t >= h && t < h + PUNCH.time) return punch(t - h, arm);
    if (who !== me && t >= h + 0.1 && t < h + 0.1 + HURT.time) return hurt(t - h - 0.1);
  }
  return stance(0, 0, t);
}

// ---------- the skits ----------
export const SKITS = {
  /** Shown a red card, they punch the referee out, flex over him, and run for it when he gets up. */
  redCard: {
    cast: ['athlete', 'ref'],
    draw(s, t, [A, R]) {
      const a1 = -0.3;
      const a0 = a1 - 3.2;
      const r0 = 0.3;
      const rDown = r0 + 1.15;
      const hits = [2.7, 2.7 + PUNCH.time, 2.7 + 2 * PUNCH.time]; // each punch connects 0.1 s in
      const downT = hits[2] + KNOCK.fly;
      const upT = 6;
      const chaseT = upT + KNOCK.getup;
      const fleeT = upT + 0.45;
      // The referee: card up, rocked twice, knocked flat, then after them.
      let rx = r0;
      let rp;
      let rl = 0;
      if (t < hits[0]) rp = lerpPose(standPose(t), ARM_UP, ease(clamp((t - 1.3) / 0.2, 0, 1)));
      else if (t < hits[2]) rp = hurt(t - (t < hits[1] ? hits[0] : hits[1]));
      else if (t < downT) {
        const k = (t - hits[2]) / KNOCK.fly;
        rp = fly(t - hits[2]);
        rx = lerp(r0, rDown, k);
        rl = arc(k, 0.4);
      } else if (t < upT) {
        rp = FIGHT.down;
        rx = rDown;
      } else if (t < chaseT) {
        rp = getup(t - upT);
        rx = rDown;
      } else {
        const d = (t - chaseT) * 4.4;
        rx = rDown - d;
        rp = runAt(d, 0.75);
      }
      // The athlete: walks up, fumes, three punches, flexes, runs.
      let ax = a1;
      let ap;
      let af = 1;
      if (t < 2) {
        ax = lerp(a0, a1, t / 2);
        ap = walkPose(ax - a0, t);
      } else if (t < 2.6) ap = standPose(t);
      else if (t < 2.6 + 3 * PUNCH.time) {
        const u = t - 2.6;
        const k = Math.min(2, Math.floor(u / PUNCH.time));
        ap = punch(u - k * PUNCH.time, k % 2);
      } else if (t < upT) ap = emote('flex', t - 2.6 - 3 * PUNCH.time);
      else if (t < fleeT) ap = standPose(t);
      else {
        const d = (t - fleeT) * 5;
        ax = a1 - d;
        af = -1;
        ap = runAt(d, 0.85);
      }
      const fa = s.fig(A, ax, ap, { face: af });
      const fr = s.fig(R, rx, rp, { face: -1, lift: rl });
      if (t > 1.3 && t < hits[0]) s.card(fr);
      ['BAP', 'BIF', 'POW!'].forEach((w, i) => s.pow(fr.headX, fr.headY + fr.h * 0.12, t - hits[i], w));
      s.dust(rDown, t - downT);
      s.say(fa, '😡', t, 1.9, 2.7);
      s.say(fa, '💪', t, 3.8, upT);
      s.say(fa, '😱', t, fleeT, Infinity);
      s.say(fr, '💫', t, downT + 0.2, upT + 0.4);
      s.say(fr, '😡', t, chaseT, Infinity);
      return rx > s.left - 1.5;
    },
  },

  /** Someone dancing gets grabbed from behind, hoisted overhead and slammed; they stagger off. */
  bodySlam: {
    cast: ['athlete', 'athlete'],
    draw(s, t, [A, V]) {
      const a1 = -0.3;
      const a0 = a1 - 3.3;
      const v0 = 0.3;
      const T0 = 1.9; // the slam starts
      const grabT = T0 + SLAM.grab;
      const upT = T0 + 0.45; // overhead
      const dropT = T0 + SLAM.drop;
      const landT = dropT + 0.07;
      const dabT = T0 + SLAM.time;
      const vUp = 5.5;
      const vGo = vUp + KNOCK.getup;
      const vDown = a1 + 0.85;
      let ax = a1;
      let ap;
      if (t < T0) {
        ax = lerp(a0, a1, t / T0);
        ap = walkPose(ax - a0, t);
      } else if (t < dabT) ap = slam(t - T0, true);
      else if (t < vGo) ap = emote('dab', t - dabT);
      else ap = emote('laugh', t - vGo);
      const fa = s.fig(A, ax, ap);
      // Held overhead: their hips on the slammer's hands.
      const over = () => {
        const p = fa.hand(0);
        const q = fa.hand(1);
        const hv = s.H * heightOf(V.colors);
        const u = s.toU((p.x + q.x) / 2);
        return { u, v: s.toV(u, (p.y + q.y) / 2 + 0.46 * hv) };
      };
      let vx = v0;
      let vp;
      let vl = 0;
      if (t < grabT) vp = emote('dance', t);
      else if (t < upT) {
        const k = ease((t - grabT) / (upT - grabT));
        const o = over();
        vx = lerp(v0, o.u, k);
        vl = Math.max(0, lerp(0, o.v, k));
        vp = lerpPose(FIGHT.hurt, held(t), k);
      } else if (t < dropT) {
        const o = over();
        vx = o.u;
        vl = o.v;
        vp = held(t);
      } else if (t < landT) {
        const k = (t - dropT) / (landT - dropT);
        const o = over();
        vx = lerp(o.u, vDown, k);
        vl = Math.max(0, lerp(o.v, 0, k));
        vp = lerpPose(held(t), FIGHT.down, k);
      } else if (t < vUp) {
        vx = vDown;
        vp = FIGHT.down;
      } else if (t < vGo) {
        vx = vDown;
        vp = getup(t - vUp);
      } else {
        const d = (t - vGo) * 1.3;
        vx = vDown + d;
        vp = dazed(d, t);
      }
      const fv = s.fig(V, vx, vp, { lift: vl });
      s.pow(s.X(vDown), s.Y(vDown, 0.1), t - landT, 'WHAM!', s.H * 0.42);
      s.dust(vDown, t - landT);
      s.say(fv, '🕺', t, 0.2, grabT);
      s.say(fv, '😱', t, grabT, landT);
      s.say(fv, '💫', t, landT + 0.2, Infinity);
      s.say(fa, '😎', t, dabT + 0.1, vGo);
      s.say(fa, '😂', t, vGo, Infinity);
      return vx < s.right + 1.2;
    },
  },

  /** Clears the first hurdle, takes the second with their face, then kicks it into next week. */
  hurdles: {
    cast: ['athlete'],
    draw(s, t, [A]) {
      const h1 = -1.9;
      const h2 = 0;
      const x0 = h1 - 4;
      const v = 4.6;
      const tripT = (h2 - 0.3 - x0) / v; // catches the second hurdle
      const xT = x0 + v * tripT;
      const SLIDE = 0.9; // s from the trip to a stop, flat out
      const xRest = xT + (v * SLIDE) / 2;
      const upT = tripT + 2.3;
      const backT = upT + 0.75 + 0.5; // stood up, fumed
      const xKick = h2 + 1.0;
      const kickT = backT + (xRest - xKick) / 1.2;
      const hitT = kickT + 0.18;
      const goT = kickT + KICK.time + 0.4;
      let ax;
      let ap;
      let af = 1;
      let al = 0;
      if (t < tripT) {
        ax = x0 + v * t;
        const run = runAt(ax - x0, 0.75);
        const k = ease(clamp(1 - Math.abs(ax - (h1 - 0.1)) / 0.6, 0, 1)); // over the first
        ap = hurdlePose(run, k);
        al = 0.12 * k;
      } else if (t < tripT + SLIDE) {
        const u = t - tripT;
        ax = xT + v * u * (1 - u / (2 * SLIDE));
        const trip = tripPose(runAt(ax - x0, 0.75), u, { hit: 0, stumble: 1, recover: 1 });
        const k = ease(clamp((u - 0.2) / 0.25, 0, 1)); // ...and down on their face
        ap = lerpPose(trip, JUMP_POSES.prone, k);
        al = u > 0.2 ? arc(clamp((u - 0.2) / 0.25, 0, 1), 0.12) : 0;
      } else if (t < upT) {
        ax = xRest;
        ap = JUMP_POSES.prone;
      } else if (t < backT) {
        ax = xRest;
        ap = fromProne(t - upT);
      } else if (t < kickT) {
        af = -1;
        ax = lerp(xRest, xKick, (t - backT) / (kickT - backT));
        ap = walkPose(xRest - ax, t);
      } else if (t < goT) {
        af = -1;
        ax = xKick;
        ap = t < kickT + KICK.time ? kick(t - kickT) : standPose(t);
      } else {
        const d = (t - goT) * 3;
        ax = xKick + d;
        ap = runAt(d, 0.45);
      }
      // The hurdles: the second tips over at the trip, then goes flying, spinning, and lands on its feet.
      s.hurdle(h1, 0);
      if (t < hitT) s.hurdle(h2, 1.5 * ease(clamp((t - tripT) / 0.25, 0, 1)));
      else {
        const k = clamp((t - hitT) / 1.1, 0, 1);
        s.hurdle(h2 + 0.2 - 3.8 * k, 1.5 * (1 - k) - TAU * 2 * k, arc(k, 1.6));
      }
      const fa = s.fig(A, ax, ap, { face: af, lift: al });
      s.pow(s.X(h2 + 0.25), s.Y(h2, 0.2), t - hitT, 'BONK', s.H * 0.36);
      s.dust(xT + 0.6, t - tripT - 0.3);
      s.say(fa, '💫', t, tripT + SLIDE, upT);
      s.say(fa, '😤', t, upT + 0.75, kickT + 0.2);
      s.say(fa, '😌', t, kickT + KICK.time, Infinity);
      return ax < s.right + 1.5;
    },
  },

  /** A big throw, straight at the referee's feet. He leaves; they laugh. */
  javelin: {
    cast: ['athlete', 'ref'],
    draw(s, t, [A, R]) {
      const x0 = -4.3;
      const xB = -1.6;
      const r0 = 2.9;
      const xL = 2.55; // where it sticks in
      const LEN = 1.4;
      const wT = 1.4; // the last strides: javelin drawn back
      const thT = wT + 0.4; // the throw
      const relT = thT + 0.27;
      const landT = relT + 1.05;
      const hopT = landT + 0.08;
      const fleeT = hopT + 0.6;
      const lolT = landT + 0.3;
      const goT = lolT + 2.4;
      const xThrow = xB + 0.7;
      const athlete = (t) => {
        if (t < wT) {
          const d = (t / wT) * (xB - x0);
          return { x: x0 + d, p: { ...runAt(d, 0.55), arms: JAVELIN_POSES.carryArms }, ang: 0.1 };
        }
        if (t < thT) {
          const d = xB - x0 + ((t - wT) / (thT - wT)) * 0.7;
          return { x: x0 + d, p: { ...runAt(d, 0.55), arms: JAVELIN_POSES.withdrawArms }, ang: 0.3 };
        }
        const base = { ...runAt(xB - x0 + 0.7, 0.55), arms: JAVELIN_POSES.withdrawArms };
        const p = sampleTrack([[0, base], [0.15, JAVELIN_POSES.brace], [0.27, JAVELIN_POSES.release], [0.5, JAVELIN_POSES.follow], [1.1, POSES.stand]], t - thT);
        return { x: xThrow + 0.25 * clamp((t - thT) / 0.5, 0, 1), p, ang: lerp(0.3, 0.6, clamp((t - thT) / 0.27, 0, 1)) };
      };
      let ax;
      let ap;
      let af = 1;
      if (t < lolT) ({ x: ax, p: ap } = athlete(t));
      else if (t < goT) {
        ax = xThrow + 0.25;
        ap = emote('laugh', t - lolT);
      } else {
        const d = (t - goT) * 3;
        ax = xThrow + 0.25 - d;
        af = -1;
        ap = runAt(d, 0.45);
      }
      // The referee: hops out of his skin, and is gone.
      let rx = r0;
      let rp = standPose(t);
      let rl = 0;
      let rf = -1;
      if (t >= hopT && t < fleeT) {
        const k = (t - hopT) / (fleeT - hopT);
        rp = panic(t);
        rl = arc(k, 0.55);
      } else if (t >= fleeT) {
        const d = (t - fleeT) * 5;
        rx = r0 + d;
        rf = 1;
        rp = runAt(d, 0.85);
      }
      const fr = s.fig(R, rx, rp, { face: rf, lift: rl });
      const fa = s.fig(A, ax, ap, { face: af });
      // The javelin: in the hand, then flying tip first, then stuck in the ground, wobbling.
      if (t < relT) {
        const { ang } = athlete(t);
        const h = fa.hand(0);
        const u = s.toU(h.x) + Math.cos(ang) * LEN * 0.1;
        s.javelin(u, s.toV(u, h.y) + Math.sin(ang) * LEN * 0.1, ang, LEN);
      } else {
        // The tip's path, from the hand at the release to the ground.
        const rel = athlete(relT);
        const g = s.place(A, rel.x, rel.p);
        const h = g.hand(0);
        const u0 = s.toU(h.x) + Math.cos(0.6) * LEN * 0.6;
        const v0 = s.toV(u0, h.y) + Math.sin(0.6) * LEN * 0.6;
        const k = clamp((t - relT) / (landT - relT), 0, 1);
        const tu = lerp(u0, xL, k);
        const tv = lerp(v0, -0.06, k) + arc(k, 1.5);
        let ang = Math.atan2(-0.06 - v0 + 1.5 * 4 * (1 - 2 * k), xL - u0);
        if (k >= 1) ang += 0.1 * Math.sin((t - landT) * 40) * Math.exp(-(t - landT) * 5);
        s.javelin(tu - (Math.cos(ang) * LEN) / 2, tv - (Math.sin(ang) * LEN) / 2, ang, LEN);
      }
      s.pow(s.X(xL), s.Y(xL, 0.05), t - landT, 'THUNK', s.H * 0.3);
      s.say(fr, '😱', t, landT, Infinity);
      s.say(fa, '😂', t, lolT, goT);
      return rx < s.right + 1.5 || ax > s.left - 1.5;
    },
  },

  /** A long jump that ends on their face, a red flag, and the referee kicked into the infield. */
  longJump: {
    cast: ['athlete', 'ref'],
    draw(s, t, [A, R]) {
      const x0 = -5.2;
      const xT = -1.1; // takeoff
      const offT = 1.15;
      const FLIGHT = 0.7;
      const landT = offT + FLIGHT;
      const xLand = 1.2;
      const upT = 3.3;
      const madT = upT + 0.75;
      const walkT = madT + 0.6;
      const r0 = 3.4;
      const xKick = r0 - 0.62;
      const kickT = walkT + (xKick - xLand) / 1.5;
      const hitT = kickT + 0.18;
      const rDown = r0 + 1.2;
      const downT = hitT + KNOCK.fly;
      const dabT = kickT + KICK.time;
      const goT = dabT + 2;
      const rUp = 8.9;
      const rGo = rUp + KNOCK.getup;
      const flagT = 2.3;
      let ax;
      let ap;
      let al = 0;
      let af = 1;
      if (t < offT) {
        ax = x0 + ((xT - x0) * t) / offT;
        ap = runAt(ax - x0, 0.8);
      } else if (t < landT) {
        const k = (t - offT) / FLIGHT;
        ax = lerp(xT, xLand, k);
        al = arc(k, 0.5);
        ap = sampleTrack([[0, JUMP_POSES.plant], [0.18, JUMP_POSES.arch], [0.36, JUMP_POSES.hang], [0.52, JUMP_POSES.tuck], [FLIGHT, JUMP_POSES.crouch]], t - offT);
      } else if (t < upT) {
        ax = xLand;
        ap = sampleTrack([[0, JUMP_POSES.crouch], [0.18, JUMP_POSES.prone]], t - landT);
      } else if (t < madT) {
        ax = xLand;
        ap = fromProne(t - upT);
      } else if (t < walkT) {
        ax = xLand;
        ap = standPose(t);
      } else if (t < kickT) {
        ax = lerp(xLand, xKick, (t - walkT) / (kickT - walkT));
        ap = walkPose(ax - xLand, t);
      } else if (t < dabT) {
        ax = xKick;
        ap = kick(t - kickT);
      } else if (t < goT) {
        ax = xKick;
        ap = emote('dab', t - dabT);
      } else {
        const d = (t - goT) * 3;
        ax = xKick - d;
        af = -1;
        ap = runAt(d, 0.45);
      }
      let rx = r0;
      let rp;
      let rl = 0;
      let rf = -1;
      if (t < hitT) {
        const k = ease(clamp((t - flagT) / 0.2, 0, 1));
        const wave = { ...ARM_UP, arms: [{ upper: 2.85 + 0.2 * Math.sin(t * 9), fore: 3.05 + 0.25 * Math.sin(t * 9) }, ARM_UP.arms[1]] };
        rp = lerpPose(standPose(t), wave, k);
      } else if (t < downT) {
        const k = (t - hitT) / KNOCK.fly;
        rp = fly(t - hitT);
        rx = lerp(r0, rDown, k);
        rl = arc(k, 0.5);
      } else if (t < rUp) {
        rx = rDown;
        rp = FIGHT.down;
      } else if (t < rGo) {
        rx = rDown;
        rp = getup(t - rUp);
      } else {
        const d = (t - rGo) * 1.3;
        rx = rDown + d;
        rf = 1;
        rp = dazed(d, t);
      }
      if (t >= hitT) s.flagDown(r0 - 0.1);
      const fr = s.fig(R, rx, rp, { face: rf, lift: rl });
      if (t > flagT && t < hitT) s.flag(fr);
      const fa = s.fig(A, ax, ap, { face: af, lift: al });
      s.dust(xLand + 0.3, t - landT);
      s.dust(rDown, t - downT);
      s.pow(fr.headX, fr.headY + fr.h * 0.3, t - hitT, 'BOOT!');
      s.say(fa, '💫', t, landT + 0.4, upT);
      s.say(fa, '😡', t, madT, kickT);
      s.say(fa, '😎', t, dabT + 0.1, goT);
      s.say(fr, '💫', t, downT + 0.2, Infinity);
      return ax > s.left - 1.5 || rx < s.right + 1.2;
    },
  },

  /** A baton thief, and a flying tackle that hits nothing but track. */
  baton: {
    cast: ['athlete', 'athlete'],
    draw(s, t, [A, B]) {
      const vA = 4.8;
      const vB = 4.4;
      const start = s.left - 1;
      const ax = start + vA * t;
      const b0 = start - 1.8;
      const diveT = (-0.6 - b0) / vB; // B dives from here
      const FLY = 0.42;
      const SLIDE = 0.45;
      const bDive = b0 + vB * diveT;
      const xFly = bDive + 1.8;
      const xStop = xFly + 0.6;
      const upT = diveT + FLY + SLIDE + 1.4;
      const goT = upT + 0.75 + 0.5;
      let bx;
      let bp;
      let bl = 0;
      if (t < diveT) {
        bx = b0 + vB * t;
        bp = runAt(bx - b0, 0.85);
      } else if (t < diveT + FLY) {
        const k = (t - diveT) / FLY;
        bx = lerp(bDive, xFly, k);
        bl = arc(k, 0.35);
        bp = lerpPose(JUMP_POSES.dive, { ...JUMP_POSES.dive, lean: 1.4 }, k);
      } else if (t < diveT + FLY + SLIDE) {
        const k = (t - diveT - FLY) / SLIDE;
        bx = lerp(xFly, xStop, ease(k));
        bp = lerpPose(JUMP_POSES.dive, JUMP_POSES.prone, ease(clamp(k * 2, 0, 1)));
      } else if (t < upT) {
        bx = xStop;
        bp = JUMP_POSES.prone;
      } else if (t < goT) {
        bx = xStop;
        bp = fromProne(t - upT);
      } else {
        const d = (t - goT) * 4;
        bx = xStop + d;
        bp = runAt(d, 0.7);
      }
      const fb = s.fig(B, bx, bp, { lift: bl });
      const fa = s.fig(A, ax, runAt(ax - start, 0.85));
      s.baton(fa);
      s.dust(xFly + 0.3, t - diveT - FLY);
      s.say(fa, '😜', t, 0.3, Infinity);
      s.say(fb, '😡', t, 0.3, diveT);
      s.say(fb, '💫', t, diveT + FLY + 0.2, goT);
      s.say(fb, '😤', t, goT, Infinity);
      return bx < s.right + 1.5;
    },
  },

  /** Two athletes going at it; the referee steps in between, and they both deck him. Then high fives, and back to it. */
  breakItUp: {
    cast: ['athlete', 'athlete', 'ref'],
    draw(s, t, [A, B, R]) {
      const ax0 = -0.42;
      const bx0 = 0.42;
      const r0 = s.right + 1;
      const inT = 0.5;
      const atT = 2;
      const hit1 = 2.7;
      const hit2 = hit1 + PUNCH.time;
      const AIR = 0.95;
      const downT = hit2 + AIR;
      const h5T = downT + 0.35; // step in, high five
      const showT = h5T + 0.8;
      const rUp = 6.4;
      const rGo = rUp + KNOCK.getup;
      const backT = rGo + 0.5;
      const before = [[0.25, 'a', 0], [0.7, 'b', 0], [1.15, 'a', 1], [1.55, 'b', 1]];
      const after = [[backT, 'a', 0], [backT + 0.45, 'b', 1], [backT + 0.9, 'a', 1], [backT + 1.35, 'b', 0], [backT + 1.8, 'a', 0]];
      // The two of them.
      const fighter = (me, x0) => {
        if (t < atT) return { x: x0, p: tradePose(me, t, before) };
        if (t < hit1 - 0.1) return { x: x0, p: stance(0, 0, t) };
        if (t < hit2 + PUNCH.time) {
          const u = t - hit1 + 0.1;
          return { x: x0, p: punch(u < PUNCH.time ? u : u - PUNCH.time, u < PUNCH.time ? 0 : 1) };
        }
        if (t < h5T) return { x: x0, p: stance(0, 0, t) };
        if (t < showT) {
          const k = ease(clamp((t - h5T) / 0.25, 0, 1));
          return { x: lerp(x0, x0 * 0.62, k), p: lerpPose(stance(0, 0, t), HIGH5, k) };
        }
        if (t < backT) {
          const k = ease(clamp((t - showT) / 0.3, 0, 1));
          return { x: lerp(x0 * 0.62, x0, k), p: emote(me === 'a' ? 'flex' : 'dance', t - showT) };
        }
        return { x: x0, p: tradePose(me, t, after) };
      };
      const a = fighter('a', ax0);
      const b = fighter('b', bx0);
      // The referee: runs in, arms out, rocked, launched spinning straight up, flat out, gone.
      let rx = 0;
      let rp;
      let rl = 0;
      let rf = -1;
      let rot = 0;
      if (t < inT) {
        rx = r0;
        rp = standPose(t);
      } else if (t < atT) {
        const k = (t - inT) / (atT - inT);
        rx = lerp(r0, 0, k);
        rp = runAt(r0 - rx, 0.75);
      } else if (t < hit1 + 0.1) rp = lerpPose(runAt(r0, 0.75), SPLIT, ease(clamp((t - atT) / 0.2, 0, 1)));
      else if (t < hit2 + 0.1) rp = hurt(t - hit1 - 0.1);
      else if (t < downT + 0.1) {
        const k = clamp((t - hit2 - 0.1) / AIR, 0, 1);
        rp = lerpPose(FIGHT.hurt, FIGHT.down, ease(k));
        rl = arc(k, 1.7);
        rot = -TAU * 2 * ease(k);
      } else if (t < rUp) rp = FIGHT.down;
      else if (t < rGo) rp = getup(t - rUp);
      else {
        const d = (t - rGo) * 5;
        rx = d;
        rf = 1;
        rp = runAt(d, 0.85);
      }
      const fr = s.fig(R, rx, rp, { face: rf, lift: rl, rot });
      const fa = s.fig(A, a.x, a.p);
      const fb = s.fig(B, b.x, b.p, { face: -1 });
      if (t < atT) {
        for (const [h, who] of before) {
          const f = who === 'a' ? fb : fa;
          s.pow(f.headX, f.headY + f.h * 0.15, t - h - 0.1, null, s.H * 0.22);
        }
      }
      s.pow(fr.headX, fr.headY + fr.h * 0.1, t - hit1 - 0.1, 'BAP', s.H * 0.3);
      s.pow(fr.headX, fr.headY + fr.h * 0.1, t - hit2 - 0.1, 'KA-POW!', s.H * 0.44);
      s.pow(s.X(0), s.Y(0, 0.95), t - h5T - 0.2, 'SLAP', s.H * 0.3);
      s.dust(0, t - downT);
      if (t >= backT) {
        for (const [h, who] of after) {
          const f = who === 'a' ? fb : fa;
          s.pow(f.headX, f.headY + f.h * 0.15, t - h - 0.1, null, s.H * 0.22);
        }
      }
      s.say(fr, '✋', t, atT, hit1 + 0.1);
      s.say(fr, '💫', t, downT + 0.2, rGo);
      s.say(fr, '😭', t, rGo, Infinity);
      s.say(fa, '😤', t, 0.1, atT);
      s.say(fb, '😠', t, 0.1, atT);
      s.say(fa, '💪', t, showT + 0.2, backT);
      s.say(fb, '🕺', t, showT + 0.2, backT);
      return t < backT + 2.4;
    },
  },

  /** A dance-off: one dances, one does the chicken, gets laughed at, and kicks the laugher flat. */
  danceOff: {
    cast: ['athlete', 'athlete'],
    draw(s, t, [A, B]) {
      const ax0 = -0.36;
      const bx = 0.36;
      const danceT = 0.3;
      const chickT = 2.4;
      const lolT = 4.4;
      const kickT = 6;
      const hitT = kickT + 0.18;
      const aDown = ax0 - 1.25;
      const downT = hitT + KNOCK.fly;
      const dabT = kickT + KICK.time;
      const aUp = 8.6;
      const aGo = aUp + KNOCK.getup;
      let ax = ax0;
      let ap;
      let al = 0;
      let af = 1;
      if (t < danceT) ap = standPose(t);
      else if (t < chickT) ap = emote('dance', t - danceT);
      else if (t < lolT) ap = standPose(t);
      else if (t < hitT) ap = emote('laugh', t - lolT);
      else if (t < downT) {
        const k = (t - hitT) / KNOCK.fly;
        ap = fly(t - hitT);
        ax = lerp(ax0, aDown, k);
        al = arc(k, 0.5);
      } else if (t < aUp) {
        ax = aDown;
        ap = FIGHT.down;
      } else if (t < aGo) {
        ax = aDown;
        ap = getup(t - aUp);
      } else {
        const d = (t - aGo) * 4.5;
        ax = aDown - d;
        af = -1;
        ap = runAt(d, 0.85);
      }
      let bp;
      if (t < chickT) bp = standPose(t);
      else if (t < lolT) bp = emote('chicken', t - chickT);
      else if (t < kickT) bp = standPose(t);
      else if (t < dabT) bp = kick(t - kickT);
      else bp = emote('dab', t - dabT);
      const fa = s.fig(A, ax, ap, { face: af, lift: al });
      const fb = s.fig(B, bx, bp, { face: -1 });
      s.pow(fa.headX, fa.headY + fa.h * 0.35, t - hitT, 'WHUMP', s.H * 0.38);
      s.dust(aDown, t - downT);
      s.say(fa, '🕺', t, danceT + 0.1, chickT);
      s.say(fb, '🐔', t, chickT + 0.1, lolT);
      s.say(fa, '😂', t, lolT + 0.1, hitT);
      s.say(fb, '😠', t, lolT + 0.6, kickT);
      s.say(fa, '💫', t, downT + 0.2, aGo);
      s.say(fb, '😎', t, dabT + 0.1, Infinity);
      return ax > s.left - 1.5;
    },
  },

  /** One goes early; the starter fires, and they hit the deck thinking they've been shot. The other one wins. */
  falseStart: {
    cast: ['athlete', 'athlete', 'ref'],
    draw(s, t, [A, B, R]) {
      const ax0 = 0;
      const bx0 = -1.1;
      const rx = -2.3;
      const jumpT = 1.5; // A goes early
      const bangT = 1.85;
      const dropT = bangT + 0.12;
      const SLIDE = 0.5;
      const upT = dropT + 2.3;
      const goT = upT + 0.75 + 0.9;
      const ACC = 9; // figure heights/s², out of the blocks
      const out = (u) => (u < 0.6 ? 0.5 * ACC * u * u : 0.5 * ACC * 0.36 + ACC * 0.6 * (u - 0.6)); // distance u s after going
      const sprint = (u) => {
        const d = out(u);
        return u < 0.25 ? launchPose(u / 0.25) : runPose((d / cycle(0.85)) * TAU, 0.85, Math.max(0, 1 - u * 1.2));
      };
      // A: twitchy in the blocks, gone early, flat on the deck at the bang, up, off.
      let ax = ax0;
      let ap;
      let al = 0;
      const xDrop = ax0 + out(dropT - jumpT);
      const vDrop = ACC * (dropT - jumpT);
      if (t < jumpT) ap = { ...POSES.set, hipY: POSES.set.hipY + 0.012 * Math.sin(t * 30) * clamp(t - 0.7, 0, 1) };
      else if (t < dropT) {
        ax = ax0 + out(t - jumpT);
        ap = sprint(t - jumpT);
      } else if (t < upT) {
        const u = Math.min(t - dropT, SLIDE);
        ax = xDrop + vDrop * u * (1 - u / (2 * SLIDE));
        ap = lerpPose(sprint(dropT - jumpT), JUMP_POSES.prone, ease(clamp((t - dropT) / 0.22, 0, 1)));
        al = arc(clamp((t - dropT) / 0.3, 0, 1), 0.15);
      } else {
        ax = xDrop + (vDrop * SLIDE) / 2;
        if (t < goT) ap = t < upT + 0.75 ? fromProne(t - upT) : standPose(t);
        else {
          const d = (t - goT) * 2.6;
          ap = runAt(d, 0.4);
          ax += d;
        }
      }
      // B: waits for the gun like you're meant to, and is gone.
      const bp = t < bangT + 0.08 ? POSES.set : sprint(t - bangT - 0.08);
      const bx = t < bangT + 0.08 ? bx0 : bx0 + out(t - bangT - 0.08);
      // The starter: pistol up, BANG, then his face in his hand.
      let rp = lerpPose(standPose(t), ARM_UP, ease(clamp((t - 0.4) / 0.25, 0, 1)));
      if (t > bangT + 0.9) rp = lerpPose(ARM_UP, FACEPALM, ease(clamp((t - bangT - 0.9) / 0.25, 0, 1)));
      s.blocks(ax0);
      s.blocks(bx0);
      const fr = s.fig(R, rx, rp);
      if (t < bangT + 1) s.pistol(fr);
      const fb = s.fig(B, bx, bp);
      const fa = s.fig(A, ax, ap, { lift: al });
      const gun = fr.hand(0);
      s.pow(gun.x, gun.y - fr.h * 0.18, t - bangT, 'BANG!', s.H * 0.34);
      s.dust(xDrop + 0.6, t - dropT - 0.15);
      s.say(fa, '😬', t, 0.8, jumpT);
      s.say(fa, '😵', t, dropT + 0.1, upT);
      s.say(fa, '😳', t, upT + 0.75, goT);
      s.say(fa, '😅', t, goT, Infinity);
      s.say(fb, '😏', t, bangT + 0.6, Infinity);
      s.say(fr, '🤦', t, bangT + 1.1, Infinity);
      return ax < s.right + 1.2;
    },
  },

  /** A scrap turns into a cartoon fight cloud; it spits them out flat, they get up, glare, and dive back in. */
  fightCloud: {
    cast: ['athlete', 'athlete', 'athlete'],
    draw(s, t, [A, B, C]) {
      const c0 = s.left - 1;
      const inT = Math.max(1.5, (-0.9 - c0) / 5); // C arrives and dives in
      const cStart = inT - (-0.9 - c0) / 5;
      const outT = inT + 3; // the cloud spits them out
      const upT = outT + 1.6;
      const glareT = upT + 0.75;
      const againT = glareT + 1.3; // and back in they go
      const DIVE = 0.3;
      const hits = [];
      for (let h = 0.25, i = 0; h < inT - 0.3; h += 0.45, i++) hits.push([h, i % 2 ? 'b' : 'a', (i >> 1) % 2]);
      const people = [A, B, C];
      const inCloud = (t >= inT && t < outT) || t >= againT + DIVE;
      // Where everyone lands, and the cloud's wander.
      const spots = { a: -1.1, b: 1.1, c: -0.35 };
      const cu = (tt) => 0.5 * Math.sin((tt - inT) * 2.3);
      if (!inCloud) {
        // A and B squared up (or flat out, or glaring); C running in (or flat out).
        const pose = (me, x0, face) => {
          if (t < inT) return { x: x0, p: tradePose(me, t, hits), face };
          const xs = spots[me];
          if (t < upT) return { x: xs, p: FIGHT.down, face };
          if (t < glareT) return { x: xs, p: getup(t - upT), face };
          if (t < againT) return { x: xs, p: stance(0, 0, t), face };
          const k = ease((t - againT) / DIVE);
          return { x: lerp(xs, 0, k), p: lerpPose(stance(0, 0, t), JUMP_POSES.dive, k), face, lift: arc(k, 0.3) };
        };
        const a = pose('a', -0.4, 1);
        const b = pose('b', 0.4, -1);
        let c;
        if (t < inT) c = { x: c0 + 5 * Math.max(0, t - cStart), p: runAt(5 * Math.max(0, t - cStart), 0.85), face: 1 };
        else if (t < upT) c = { x: spots.c, p: JUMP_POSES.prone, face: 1 };
        else if (t < glareT) c = { x: spots.c, p: fromProne(t - upT), face: 1 };
        else if (t < againT) c = { x: spots.c, p: stance(0, 0, t), face: 1 };
        else {
          const k = ease((t - againT) / DIVE);
          c = { x: lerp(spots.c, 0, k), p: lerpPose(stance(0, 0, t), JUMP_POSES.dive, k), face: 1, lift: arc(k, 0.3) };
        }
        const fc = s.fig(C, c.x, c.p, { face: c.face, lift: c.lift });
        const fa = s.fig(A, a.x, a.p, { face: a.face, lift: a.lift });
        const fb = s.fig(B, b.x, b.p, { face: b.face, lift: b.lift });
        if (t < inT) {
          for (const [h, who] of hits) {
            const f = who === 'a' ? fb : fa;
            s.pow(f.headX, f.headY + f.h * 0.15, t - h - 0.1, null, s.H * 0.2);
          }
        }
        for (const [f, xs] of [[fa, spots.a], [fb, spots.b], [fc, spots.c]]) {
          s.dust(xs, t - outT);
          s.say(f, '💫', t, outT + 0.2, upT);
          s.say(f, '😠', t, glareT + 0.1, againT);
        }
        s.say(fc, '😤', t, Math.max(0.1, cStart), inT);
        return true;
      }
      // The cloud, bouncing about, hits going off all over it.
      const t0 = t >= againT ? againT + DIVE : inT;
      const u = cu(t) * (t >= againT ? 0.6 : 1);
      s.cloud(u, 0.5 + 0.08 * Math.abs(Math.sin((t - t0) * 9)), t - t0, people);
      const k = Math.floor((t - t0) / 0.3);
      const age = t - t0 - k * 0.3;
      s.pow(s.X(u + (hash(k) - 0.5) * 1.4), s.Y(u, 0.5 + (hash(k + 99) - 0.5) * 0.9), age, ['BIF', 'ZOK', 'BAM', 'OOF', 'POW'][k % 5], s.H * 0.26);
      s.pow(s.X(u), s.Y(u, 0.5), t - t0, 'SCRAP!', s.H * 0.45);
      return t < againT + DIVE + 2;
    },
  },

  /** A pole vaulter jogs past and clonks the referee with the pole. Then comes back the other way, just as he's up. */
  poleClonk: {
    cast: ['athlete', 'ref'],
    draw(s, t, [A, R]) {
      const v = 4.2;
      const LEN = 2.5;
      const BACK = 0.55;
      const ANG = 0.12;
      const reach = 0.22 + (LEN - BACK) * Math.cos(ANG); // the tip, ahead of the runner's feet
      const r0 = 0.6;
      const x0 = s.left - 3;
      const hit1 = (r0 - 0.05 - reach - x0) / v;
      const r1 = r0 + 1.1; // where he lands, face down
      const up1 = hit1 + 1.9;
      const stood = up1 + 0.75;
      const xEnd = s.right + 3; // the runner turns round out here
      const outT = (xEnd - x0) / v;
      const hit2 = Math.max(stood + 0.5, outT + (xEnd - (r1 + 0.05 + reach)) / v);
      const back0 = hit2 - (xEnd - (r1 + 0.05 + reach)) / v; // back on again
      const r2 = r1 - 1.15;
      const down2 = hit2 + KNOCK.fly;
      // The vaulter: oblivious, both ways.
      let ax;
      let af = 1;
      let d;
      if (t < back0) {
        ax = Math.min(xEnd, x0 + v * t);
        d = ax - x0;
      } else {
        ax = xEnd - v * (t - back0);
        af = -1;
        d = xEnd - ax;
      }
      const ap = { ...runAt(d, 0.6), arms: VAULT_POSES.carryArms };
      // The referee: watching something else, clonked flat, up, angry, clonked again.
      let rx = r0;
      let rp = standPose(t);
      let rl = 0;
      if (t >= hit1 && t < up1) {
        const k = clamp((t - hit1) / 0.45, 0, 1);
        rx = lerp(r0, r1, ease(k));
        rl = arc(k, 0.3);
        rp = lerpPose(FIGHT.hurt, JUMP_POSES.prone, ease(k));
      } else if (t >= up1 && t < hit2) {
        rx = r1;
        rp = t < stood ? fromProne(t - up1) : standPose(t);
      } else if (t >= hit2) {
        const k = clamp((t - hit2) / KNOCK.fly, 0, 1);
        rx = lerp(r1, r2, k);
        rl = arc(k, 0.35);
        rp = t < down2 ? fly(t - hit2) : FIGHT.down;
      }
      const fr = s.fig(R, rx, rp, { lift: rl });
      const fa = s.fig(A, ax, ap, { face: af });
      const p = fa.hand(0);
      const q = fa.hand(1);
      s.pole(fa, (p.x + q.x) / 2, (p.y + q.y) / 2, ANG, LEN, BACK);
      s.pow(s.X(r0 + 0.05), s.Y(r0, 0.95), t - hit1, 'CLONK', s.H * 0.34);
      s.pow(s.X(r1 - 0.05), s.Y(r1, 0.95), t - hit2, 'BONK!', s.H * 0.4);
      s.dust(r1, t - hit1 - 0.45);
      s.dust(r2, t - down2);
      s.say(fa, '🎶', t, 0.2, Infinity);
      s.say(fr, '💫', t, hit1 + 0.5, up1);
      s.say(fr, '😡', t, stood, hit2);
      s.say(fr, '💫', t, down2 + 0.2, Infinity);
      return t < down2 + 1 || ax > s.left - 3;
    },
  },

  /** A race to the line; the winner celebrates, the loser flying-dropkicks them and leaves with the gold. */
  photoFinish: {
    cast: ['athlete', 'athlete'],
    draw(s, t, [A, B]) {
      const xF = 0.2;
      const v = 5;
      const a0 = s.left - 1;
      const lineT = (xF - a0) / v;
      const STOP = 0.6;
      const aStop = xF + (v * STOP) / 2;
      const celebT = lineT + STOP;
      const jumpX = aStop - 1.75;
      const jumpT = celebT + 0.9; // B leaves the ground
      const vB = 4.4;
      const hitX = aStop - 0.62;
      const hitT = jumpT + (hitX - jumpX) / vB;
      const landT = hitT + 0.3;
      const bLand = hitX + vB * 0.3 * 0.5;
      const aLand = aStop + 1.3;
      const bUp = landT + 1.1;
      const bDab = bUp + KNOCK.getup;
      const bGo = bDab + 1.6;
      const aUp = bGo + 0.6;
      // A: the race, the line, arms up, then a boot in the back.
      let ax;
      let ap;
      let al = 0;
      if (t < lineT) {
        ax = a0 + v * t;
        ap = runAt(ax - a0, 0.9);
      } else if (t < celebT) {
        const u = t - lineT;
        ax = xF + v * u * (1 - u / (2 * STOP));
        ap = lerpPose(runAt(ax - a0, 0.9), ARMS_UP, ease(u / STOP));
      } else if (t < hitT) {
        ax = aStop;
        ap = { ...ARMS_UP, hipY: ARMS_UP.hipY + 0.02 * Math.abs(Math.sin(t * 8)) };
      } else {
        const k = clamp((t - hitT) / 0.5, 0, 1);
        ax = lerp(aStop, aLand, ease(k));
        al = arc(k, 0.35);
        ap = t < aUp ? lerpPose(FIGHT.hurt, JUMP_POSES.prone, ease(k)) : fromProne(t - aUp);
      }
      // B: second, still running, airborne, feet first.
      let bx;
      let bp;
      let bl = 0;
      let bf = 1;
      if (t < jumpT) {
        bx = jumpX - vB * (jumpT - t);
        bp = runAt(bx - a0, 0.85);
      } else if (t < hitT) {
        const k = (t - jumpT) / (landT - jumpT);
        bx = jumpX + vB * (t - jumpT);
        bl = arc(k * 0.6 + 0.1, 0.55);
        bp = lerpPose(JUMP_POSES.plant, JUMP_POSES.glide, ease(clamp((t - jumpT) / 0.12, 0, 1)));
      } else if (t < landT) {
        const k = (t - hitT) / (landT - hitT);
        bx = lerp(hitX, bLand, k);
        bl = lerp(arc(((hitT - jumpT) / (landT - jumpT)) * 0.6 + 0.1, 0.55), 0, ease(k));
        bp = lerpPose(JUMP_POSES.glide, FIGHT.down, ease(k));
      } else if (t < bUp) {
        bx = bLand;
        bp = FIGHT.down;
      } else if (t < bDab) {
        bx = bLand;
        bp = getup(t - bUp);
      } else if (t < bGo) {
        bx = bLand;
        bp = emote('dab', t - bDab);
      } else {
        const d = (t - bGo) * 3.5;
        bx = bLand + d;
        bp = runAt(d, 0.6);
      }
      s.finishLine(xF);
      const fa = s.fig(A, ax, ap, { lift: al });
      const fb = s.fig(B, bx, bp, { face: bf, lift: bl });
      s.pow(fa.headX, fa.headY + fa.h * 0.4, t - hitT, 'KABLAM!', s.H * 0.44);
      s.dust(aLand + 0.3, t - hitT - 0.5);
      s.dust(bLand, t - landT);
      s.say(fa, '🥇', t, celebT - 0.3, hitT);
      s.say(fa, '💫', t, hitT + 0.6, aUp);
      s.say(fa, '😭', t, aUp, Infinity);
      s.say(fb, '😤', t, celebT, jumpT);
      s.say(fb, '🥇', t, bDab, Infinity);
      return bx < s.right + 1.2 || t < aUp + 1;
    },
  },

  /** The referee chases someone off; they stop, turn round and flex. Now the referee's the one running. */
  tablesTurned: {
    cast: ['athlete', 'ref'],
    draw(s, t, [A, R]) {
      const v = 4;
      const a0 = s.left - 1;
      const stopX = 1.2;
      const stopT = (stopX - a0) / v; // A pulls up
      const SKID = 0.25;
      const flexT = stopT + SKID;
      const rStopT = stopT;
      const RSKID = 0.4;
      const rStop = stopX - 2 + (v * RSKID) / 2;
      const turnT = stopT + 1.0; // and runs for it
      const chaseT = flexT + 1.3;
      let ax;
      let ap;
      let af = 1;
      if (t < stopT) {
        ax = a0 + v * t;
        ap = runAt(ax - a0, 0.7);
      } else if (t < flexT) {
        const u = t - stopT;
        ax = stopX + v * u * (1 - u / (2 * SKID));
        ap = lerpPose(runAt(stopX - a0, 0.7), { ...POSES.stand, lean: -0.35 }, ease(u / SKID));
      } else if (t < chaseT) {
        ax = stopX + (v * SKID) / 2;
        af = -1;
        ap = emote('flex', t - flexT);
      } else {
        const d = (t - chaseT) * 4.6;
        ax = stopX + (v * SKID) / 2 - d;
        af = -1;
        ap = runAt(d, 0.8);
      }
      let rx;
      let rp;
      let rf = 1;
      if (t < rStopT) {
        rx = a0 - 2 + v * t;
        rp = runAt(rx - a0 + 2, 0.7);
      } else if (t < turnT) {
        const u = Math.min(t - rStopT, RSKID);
        rx = stopX - 2 + v * u * (1 - u / (2 * RSKID));
        rp = lerpPose(runAt(stopX - a0, 0.7), { ...POSES.stand, lean: -0.4 }, ease(u / RSKID));
      } else {
        const d = (t - turnT) * 5;
        rx = rStop - d;
        rf = -1;
        rp = runAt(d, 0.85);
      }
      const fr = s.fig(R, rx, rp, { face: rf });
      const fa = s.fig(A, ax, ap, { face: af });
      s.dust(stopX + 0.3, t - stopT);
      s.dust(rStop, t - rStopT);
      s.say(fa, '😱', t, 0.2, stopT);
      s.say(fa, '💪', t, flexT + 0.1, chaseT);
      s.say(fa, '😡', t, chaseT, Infinity);
      s.say(fr, '😠', t, 0.2, rStopT);
      s.say(fr, '😳', t, rStopT + 0.2, turnT + 0.3);
      s.say(fr, '😱', t, turnT + 0.3, Infinity);
      return ax > s.left - 1.5;
    },
  },

  /** The referee's asleep on the track. One runner hurdles him; the next trips over him, and gets the red card. */
  sleepingRef: {
    cast: ['ref', 'athlete', 'athlete'],
    draw(s, t, [R, A, B]) {
      const v = 4.6;
      const x0 = s.left - 1;
      const bDelay = 1.6;
      const tripX = -0.6;
      const tripT = bDelay + (tripX - x0) / v;
      const SLIDE = 0.8;
      const bRest = tripX + (v * SLIDE) / 2;
      const wakeT = tripT + 0.35;
      const standT = wakeT + 1.1;
      const cardT = standT + 0.8;
      // A: over him like a hurdle, and away.
      const ax = x0 + v * t;
      const k = ease(clamp(1 - Math.abs(ax - 0.05) / 0.75, 0, 1));
      const ap = hurdlePose(runAt(ax - x0, 0.75), k);
      // B: not so lucky.
      let bx;
      let bp;
      let bl = 0;
      if (t < tripT) {
        bx = x0 + v * Math.max(0, t - bDelay);
        bp = runAt(bx - x0, 0.75);
      } else {
        const u = Math.min(t - tripT, SLIDE);
        bx = tripX + v * u * (1 - u / (2 * SLIDE));
        const trip = tripPose(runAt(bx - x0, 0.75), u, { hit: 0, stumble: 1, recover: 1 });
        bp = lerpPose(trip, JUMP_POSES.prone, ease(clamp((t - tripT - 0.15) / 0.25, 0, 1)));
        bl = arc(clamp((t - tripT - 0.15) / 0.3, 0, 1), 0.12);
      }
      // The referee: asleep, woken, up, and there's a red card for that.
      let rp = FIGHT.down;
      if (t >= wakeT && t < standT) rp = sampleTrack([[0, FIGHT.down], [0.3, JUMP_POSES.sitUp]], t - wakeT);
      else if (t >= standT && t < cardT) rp = sampleTrack([[0, JUMP_POSES.sitUp], [0.35, FIGHT.crouch], [0.7, POSES.stand]], t - standT);
      else if (t >= cardT) rp = lerpPose(POSES.stand, ARM_UP, ease(clamp((t - cardT) / 0.2, 0, 1)));
      const fr = s.fig(R, 0, rp);
      if (t > cardT + 0.1) s.card(fr);
      const fa = s.fig(A, ax, ap, { lift: 0.18 * k });
      const fb = s.fig(B, bx, bp, { lift: bl });
      s.dust(bRest - 0.4, t - tripT - 0.35);
      s.say(fr, '💤', t, 0.1, wakeT);
      s.say(fr, '😳', t, wakeT + 0.1, standT + 0.3);
      s.say(fr, '😠', t, standT + 0.3, cardT); // then the card goes up where it was
      s.say(fa, '😎', t, (0.8 - x0) / v, Infinity);
      s.say(fb, '💫', t, tripT + 0.6, cardT + 0.3);
      s.say(fb, '😭', t, cardT + 0.3, Infinity);
      return t < cardT + 2.6;
    },
  },

  /** A conga line goes by. The referee blows up at it, then joins the end. */
  conga: {
    cast: ['athlete', 'athlete', 'athlete', 'ref'],
    draw(s, t, [A, B, C, R]) {
      const v = 1.8;
      const GAP = 0.46;
      const x0 = s.left - 1;
      const rX = 0.6;
      const lead = x0 + v * t;
      const joinT = (rX + 3 * GAP - x0) / v; // the last one's gone by
      const wave = { upper: 2.6 + 0.35 * Math.sin(t * 8), fore: 2.95 + 0.35 * Math.sin(t * 8) };
      const lp = { ...congaPose(lead - x0, t), arms: [wave, { upper: -2.6 - 0.35 * Math.sin(t * 8), fore: -2.95 - 0.35 * Math.sin(t * 8) }] };
      let rx = rX;
      let rp;
      let rf = -1;
      if (t < joinT) rp = lerpPose(standPose(t), ARM_UP, ease(clamp((t - joinT + 2.5) / 0.3, 0, 1)));
      else {
        rx = lead - 3 * GAP;
        rf = 1;
        rp = lerpPose(standPose(t), congaPose(rx - x0, t), ease(clamp((t - joinT) / 0.3, 0, 1)));
      }
      const fr = s.fig(R, rx, rp, { face: rf });
      const fc = s.fig(C, lead - 2 * GAP, congaPose(lead - x0 - 2 * GAP, t - 0.2));
      const fb = s.fig(B, lead - GAP, congaPose(lead - x0 - GAP, t - 0.1));
      const fa = s.fig(A, lead, lp);
      s.say(fa, '🎶', t, 0.2, Infinity);
      s.say(fb, '🎉', t, 1.2, Infinity);
      s.say(fc, '😁', t, 2.2, Infinity);
      s.say(fr, '😠', t, joinT - 2.4, joinT - 0.6);
      s.say(fr, '🤔', t, joinT - 0.6, joinT);
      s.say(fr, '🎉', t, joinT + 0.2, Infinity);
      return rx < s.right + 1;
    },
  },

  /** A relay handover: the baton goes over cleanly, and the new runner sprints off the wrong way. */
  wrongWay: {
    cast: ['athlete', 'athlete'],
    draw(s, t, [A, B]) {
      const v = 4.6;
      const x0 = s.left - 1;
      const b0 = 0.6;
      const handX = b0 - 0.72;
      const handT = (handX - x0) / v;
      const BRAKE = 0.5;
      const aStop = handX + (v * BRAKE) / 2;
      const offT = handT + 0.25; // B goes
      const chaseT = handT + 1.1;
      let ax;
      let ap;
      let af = 1;
      if (t < handT) {
        ax = x0 + v * t;
        ap = runAt(ax - x0, 0.8);
      } else if (t < chaseT) {
        const u = Math.min(t - handT, BRAKE);
        ax = handX + v * u * (1 - u / (2 * BRAKE));
        ap = lerpPose(runAt(handX - x0, 0.8), { ...POSES.stand, arms: [{ upper: 1.4, fore: 1.5 }, { upper: -0.6, fore: -0.3 }] }, ease(u / BRAKE));
      } else {
        const d = (t - chaseT) * 4.4;
        ax = aStop - d;
        af = -1;
        ap = runAt(d, 0.8);
      }
      let bx = b0;
      let bp;
      let bf = 1;
      if (t < handT - 0.6) bp = runAt(t * 0.5, 0.15); // jogging on the spot
      else if (t < offT) bp = lerpPose(standPose(t), REACH_BACK, ease(clamp((t - handT + 0.6) / 0.25, 0, 1)));
      else {
        const u = t - offT;
        const d = u < 0.5 ? 4.5 * u * u : 1.125 + 4.5 * (u - 0.5);
        bx = b0 - d;
        bf = -1;
        bp = runAt(d, 0.85);
      }
      const fb = s.fig(B, bx, bp, { face: bf });
      const fa = s.fig(A, ax, ap, { face: af });
      s.baton(t < handT ? fa : fb);
      s.say(fb, '👍', t, handT - 0.6, offT);
      s.say(fb, '😁', t, offT + 0.2, Infinity);
      s.say(fa, '😱', t, handT + 0.4, chaseT + 0.4);
      s.say(fa, '😡', t, chaseT + 0.4, Infinity);
      return ax > s.left - 1.5;
    },
  },
};
