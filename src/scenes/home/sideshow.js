import { CONFIG } from '../../config.js';
import { text, PAL } from '../../core/ui.js';
import { drawFigure, runPose, handPos, headCircle, lerpPose, sampleTrack, hurdlePose, tripPose, POSES, JUMP_POSES, JAVELIN_POSES } from '../../athletes/stickFigure.js';
import { FIGHT, PUNCH, KICK, SLAM, HURT, KNOCK, relaxed, stance, punch, kick, slam, hurt, fly, getup, held, emote } from '../../brawl/poses.js';
import { CHARACTERS, REFEREE, heightOf } from '../../athletes/roster.js';
import { drawJavelin } from '../../render/javelinField.js';

/**
 * The home screens' sideshow: the other athletes (and the referee) up to no
 * good in the background, one little skit at a time. Someone punches the
 * referee for showing them a red card, a body slam, a hurdler who takes the
 * second hurdle with their face, a javelin that nearly skewers the referee,
 * a long jump that ends in a foul and a kick, a baton thief, a referee who
 * steps between two fighters, a dance-off that ends badly.
 *
 * A panel gives the sideshow a few SLOTS (where on its screen a skit can play:
 * an x, a ground line and a figure height) and calls update(dt) and draw(ctx,
 * slots). Each slot plays a skit, waits a few seconds, and plays another; no
 * athlete is in two at once. Looks only: nothing here is tappable.
 *
 * A skit is { cast, draw(s, t, cast) }: `cast` names who it needs ('athlete'
 * or 'ref'); draw() draws it `t` s in through the stage `s` (below) and
 * returns false once it's over (then it fades out). Skit positions are in
 * figure heights from the slot's x, + to the right; each run is mirrored at
 * random, so everything also plays the other way round.
 */

const TAU = Math.PI * 2;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const ease = (k) => k * k * (3 - 2 * k);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const arc = (k, h) => h * 4 * k * (1 - k); // up and back down: 0 at k = 0 and 1, h at the top

const FADE = 0.4; // s: a skit fades in, and out when it's over
const LONGEST = 24; // s: a skit that somehow never finishes is cut here

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
const SKITS = {
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
      s.say(fa, '😱', t, fleeT, LONGEST);
      s.say(fr, '💫', t, downT + 0.2, upT + 0.4);
      s.say(fr, '😡', t, chaseT, LONGEST);
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
      s.say(fv, '💫', t, landT + 0.2, LONGEST);
      s.say(fa, '😎', t, dabT + 0.1, vGo);
      s.say(fa, '😂', t, vGo, LONGEST);
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
      s.say(fa, '😌', t, kickT + KICK.time, LONGEST);
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
      s.say(fr, '😱', t, landT, LONGEST);
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
      s.say(fr, '💫', t, downT + 0.2, LONGEST);
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
      s.say(fa, '😜', t, 0.3, LONGEST);
      s.say(fb, '😡', t, 0.3, diveT);
      s.say(fb, '💫', t, diveT + FLY + 0.2, goT);
      s.say(fb, '😤', t, goT, LONGEST);
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
      s.say(fr, '😭', t, rGo, LONGEST);
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
      s.say(fb, '😎', t, dabT + 0.1, LONGEST);
      return ax > s.left - 1.5;
    },
  },
};

// ---------- the stage: drawing for a skit, in its own coordinates ----------
/**
 * Draws a skit into a slot: positions `u` in figure heights from the slot's
 * x (+ to the right, or the left if this run is mirrored), heights `v` in
 * figure heights above the ground there. `left` and `right` are the edges of
 * the screen, in the same units.
 */
class Stage {
  constructor(ctx, slot, m, w) {
    this.ctx = ctx;
    this.ox = slot.x;
    this.H = slot.H;
    this.m = m;
    this.groundAt = slot.groundAt ?? (() => slot.ground);
    const a = -this.ox / (m * this.H);
    const b = (w - this.ox) / (m * this.H);
    this.left = Math.min(a, b);
    this.right = Math.max(a, b);
  }

  X(u) {
    return this.ox + this.m * u * this.H;
  }

  /** Screen y of a point `v` figure heights over the ground at `u`. */
  Y(u, v = 0) {
    return this.groundAt(this.X(u)) - v * this.H;
  }

  toU(px) {
    return (px - this.ox) / (this.m * this.H);
  }

  toV(u, py) {
    return (this.groundAt(this.X(u)) - py) / this.H;
  }

  /** Where a figure would be: screen position, drawn height, the pose as drawn, its head top and hands. */
  place(who, u, pose, { face = 1, lift = 0, rot = 0 } = {}) {
    const h = this.H * heightOf(who.colors);
    const flip = face * this.m < 0;
    const p = flip ? { ...pose, flip: true } : pose;
    const x = this.X(u);
    const g = this.groundAt(x);
    const y = g - lift * this.H;
    const hc = headCircle(x, y, h, pose);
    return { x, y, g, h, p, rot: rot * (flip ? -1 : 1), headX: flip ? 2 * x - hc.x : hc.x, headY: hc.y - hc.r, hand: (i) => handPos(x, y, h, p, i) };
  }

  /** Draws `who` `u` along in `pose`, facing + (face 1) or back (-1), `lift` off the ground, spun `rot` about the hips. */
  fig(who, u, pose, opts) {
    const f = this.place(who, u, pose, opts);
    const { ctx } = this;
    if (f.rot) {
      const hx = f.x + (f.p.flip ? -1 : 1) * pose.hipX * f.h;
      const hy = f.y + pose.hipY * f.h;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(f.rot);
      ctx.translate(-hx, -hy);
      drawFigure(ctx, f.x, f.y, f.h, f.p, who.colors, f.g);
      ctx.restore();
      f.headY = f.y - f.h * 1.1; // spinning: say things from above it
    } else drawFigure(ctx, f.x, f.y, f.h, f.p, who.colors, f.g);
    return f;
  }

  /** `str` (an emoji) over figure `f`'s head while from <= t < to, popping in. */
  say(f, str, t, from, to) {
    if (t < from || t >= to) return;
    const age = t - from;
    const size = Math.max(14, f.h * 0.3);
    const k = age < 0.15 ? ease(age / 0.15) * 1.2 : 1.2 - 0.2 * clamp((age - 0.15) / 0.12, 0, 1);
    const { ctx } = this;
    ctx.save();
    ctx.translate(f.headX, f.headY - size * 0.62 + Math.sin(age * 5) * size * 0.06);
    ctx.scale(k, k);
    text(ctx, str, 0, 0, { size });
    ctx.restore();
  }

  /** A comic-book hit, `age` s after it lands: a gold burst with `word` on it. */
  pow(x, y, age, word, size = this.H * 0.34) {
    const LIFE = 0.45;
    if (age < 0 || age > LIFE) return;
    const { ctx } = this;
    const k = age < 0.06 ? age / 0.06 : 1 + 0.15 * ((age - 0.06) / (LIFE - 0.06));
    ctx.save();
    ctx.globalAlpha *= age > 0.3 ? 1 - (age - 0.3) / (LIFE - 0.3) : 1;
    ctx.translate(x, y);
    ctx.scale(k, k);
    const n = 9;
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = (i % 2 ? 0.55 : 1) * size * (word ? 1 : 0.6);
      const a = (i / (n * 2)) * TAU + 0.2;
      ctx.lineTo(Math.cos(a) * r * 1.15, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = PAL.gold;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, size * 0.07);
    ctx.strokeStyle = PAL.ink;
    ctx.stroke();
    if (word) {
      ctx.rotate(-0.12);
      text(ctx, word, 0, 1, { size: Math.round(size * (word.length > 5 ? 0.42 : 0.52)), font: 'display', color: PAL.ink });
    }
    ctx.restore();
  }

  /** A puff of dust at `u`, `age` s old. */
  dust(u, age) {
    const LIFE = 0.6;
    if (age < 0 || age > LIFE) return;
    const { ctx, H } = this;
    const k = age / LIFE;
    const x = this.X(u);
    const y = this.Y(u);
    ctx.fillStyle = `rgba(245,234,208,${0.7 * (1 - k)})`;
    for (const [dx, s] of [[-0.25, 0.8], [0, 1], [0.25, 0.8]]) {
      ctx.beginPath();
      ctx.arc(x + (dx + Math.sign(dx) * 0.2 * k) * H, y - (0.04 + 0.06 * k) * H, (0.05 + 0.09 * k) * s * H, 0, TAU);
      ctx.fill();
    }
  }

  /** Runs `draw(ctx, H)` with the origin at `u` on the ground (`lift` up), facing +, tilted `tilt` (+ = top forward). */
  prop(u, tilt, lift, draw) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(this.X(u), this.Y(u, lift));
    ctx.scale(this.m, 1);
    ctx.rotate(tilt);
    draw(ctx, this.H);
    ctx.restore();
  }

  /** A hurdle seen side on: a foot pointing back, the post, the striped board on top. */
  hurdle(u, tilt = 0, lift = 0) {
    this.prop(u, tilt, lift, (ctx, H) => {
      const hh = 0.56 * H;
      const lw = Math.max(2, 0.035 * H);
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2d3340';
      ctx.lineWidth = lw * 1.3;
      ctx.beginPath();
      ctx.moveTo(-0.24 * H, 0);
      ctx.lineTo(0, 0);
      ctx.stroke();
      ctx.strokeStyle = '#8b93a3';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -hh);
      ctx.stroke();
      ctx.fillStyle = PAL.cream;
      ctx.fillRect(-0.035 * H, -hh - 0.02 * H, 0.07 * H, 0.13 * H);
      ctx.fillStyle = PAL.ink;
      ctx.fillRect(-0.035 * H, -hh + 0.025 * H, 0.07 * H, 0.035 * H);
    });
  }

  /** A javelin centred `u` along, `v` up, at `ang` (+ = tip up, pointing +), `len` figure heights long. */
  javelin(u, v, ang, len) {
    const a = this.m > 0 ? ang : Math.PI - ang;
    drawJavelin(this.ctx, this.X(u), this.Y(u, v), len * this.H, a, Math.max(2, 0.03 * this.H));
  }

  /** The referee's red card, in figure `f`'s near hand. */
  card(f) {
    const p = f.hand(0);
    const { ctx, H } = this;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(f.p.flip ? 0.2 : -0.2);
    ctx.fillStyle = '#E0322B';
    ctx.fillRect(-0.05 * H, -0.15 * H, 0.1 * H, 0.14 * H);
    ctx.restore();
  }

  /** A red flag on a short stick, up from figure `f`'s near hand. */
  flag(f) {
    const p = f.hand(0);
    const dir = f.p.flip ? -1 : 1;
    const { ctx, H } = this;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(dir, 1);
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = Math.max(1.5, 0.025 * H);
    ctx.beginPath();
    ctx.moveTo(0, 0.04 * H);
    ctx.lineTo(0, -0.32 * H);
    ctx.stroke();
    ctx.fillStyle = '#E0322B';
    ctx.fillRect(0, -0.32 * H, 0.2 * H, 0.13 * H);
    ctx.restore();
  }

  /** The flag where it fell. */
  flagDown(u) {
    this.prop(u, 1.45, 0.02, (ctx, H) => {
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = Math.max(1.5, 0.025 * H);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -0.36 * H);
      ctx.stroke();
      ctx.fillStyle = '#E0322B';
      ctx.fillRect(0, -0.36 * H, 0.2 * H, 0.13 * H);
    });
  }

  /** A relay baton in figure `f`'s near hand, held up. */
  baton(f) {
    const p = f.hand(0);
    const { ctx, H } = this;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = PAL.gold;
    ctx.lineWidth = Math.max(2, 0.045 * H);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + 0.06 * H);
    ctx.lineTo(p.x + (f.p.flip ? -0.04 : 0.04) * H, p.y - 0.12 * H);
    ctx.stroke();
    ctx.restore();
  }
}

// ---------- the sideshow ----------
export class Sideshow {
  /** `exclude`: an athlete's id to leave out (yours, on the Play tab, where you're out on the track already). */
  constructor({ exclude = null } = {}) {
    this.exclude = exclude;
    this.slots = [];
    this.recent = []; // the last few skits, so they don't come round again too soon
    this.key = null;
  }

  update(dt) {
    for (const slot of this.slots) {
      const run = slot.run;
      if (!run) {
        if ((slot.wait -= dt) <= 0) {
          slot.run = this.start();
          slot.wait = 1; // nobody free: try again in a second
        }
        continue;
      }
      run.t += dt;
      if (run.t > LONGEST) run.endT ??= run.t;
      if (run.endT != null && run.t - run.endT > FADE) {
        slot.run = null;
        slot.wait = rand(1.5, 5);
      }
    }
  }

  /** A skit and a cast for it, from the athletes (and the referee) not in a skit already. */
  start() {
    const busy = new Set(this.slots.flatMap((s) => s.run?.cast.map((c) => c.id) ?? []));
    const free = CHARACTERS.filter((c) => c.id !== this.exclude && !busy.has(c.id));
    const fits = Object.keys(SKITS).filter((id) => {
      const need = SKITS[id].cast;
      return need.filter((r) => r === 'athlete').length <= free.length && (!need.includes('ref') || !busy.has(REFEREE.id));
    });
    if (!fits.length) return null;
    const fresh = fits.filter((id) => !this.recent.includes(id));
    const id = pick(fresh.length ? fresh : fits);
    this.recent = [id, ...this.recent].slice(0, 3);
    const pool = [...free];
    const cast = SKITS[id].cast.map((r) => (r === 'ref' ? REFEREE : pool.splice(Math.floor(Math.random() * pool.length), 1)[0]));
    return { id, cast, t: 0, endT: null, m: Math.random() < 0.5 ? 1 : -1 };
  }

  /**
   * Draws the skits playing in `slots` ([{ x, ground, H, groundAt? }] in
   * panel pixels; `groundAt(x)` for ground that isn't flat), clipped to the
   * panel (`w` x `h`). A different `key` (another page: the slots have moved)
   * starts the sideshow over.
   */
  draw(ctx, slots, { w, h, key = null }) {
    if (key !== this.key || slots.length !== this.slots.length) {
      this.key = key;
      this.slots = slots.map((_, i) => ({ run: null, wait: rand(0.3, 1.2) + i * rand(1.5, 3) }));
    }
    if (!slots.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    // Furthest back (highest on the screen) first.
    const order = slots.map((s, i) => i).sort((a, b) => slots[a].ground - slots[b].ground);
    for (const i of order) {
      const run = this.slots[i].run;
      if (!run) continue;
      const t = run.endT ?? run.t;
      ctx.save();
      ctx.globalAlpha *= Math.min(1, run.t / FADE) * (run.endT == null ? 1 : Math.max(0, 1 - (run.t - run.endT) / FADE));
      const going = SKITS[run.id].draw(new Stage(ctx, slots[i], run.m, w), t, run.cast);
      if (!going) run.endT ??= run.t;
      ctx.restore();
    }
    ctx.restore();
  }
}

/** The skits, for tools and tests: id -> { cast, draw }. */
export { SKITS, Stage };
