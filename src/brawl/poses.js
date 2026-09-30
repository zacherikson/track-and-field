import { POSES, JUMP_POSES, runPose, lerpPose, sampleTrack, legIK, flatLegs } from '../athletes/stickFigure.js';

/**
 * Poses for the late hits (brawl.js), in the stick figure's conventions
 * (stickFigure.js): limbs measured from straight down, the torso from straight
 * up, + toward the way the figure faces. Arm 0 and leg 0 are the near ones.
 * Every function takes the time `u` (s) since the move started.
 */

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const ease = (k) => k * k * (3 - 2 * k);

const GUARD_ARMS = [{ upper: 0.45, fore: 2.5 }, { upper: 0.3, fore: 2.7 }]; // fists up by the chin

export const FIGHT = {
  guard: {
    hipX: 0, hipY: -0.49, lean: 0.08,
    legs: [{ ...legIK(0, -0.49, 0.1, 0), toe: 0 }, { ...legIK(0, -0.49, -0.1, 0), toe: 0 }],
    arms: GUARD_ARMS,
  },
  // Flat on your back, feet toward whoever hit you.
  down: {
    hipX: 0, hipY: -0.07, lean: -1.5,
    legs: [{ thigh: 1.62, shin: 1.66, toe: -1.3 }, { thigh: 1.5, shin: 1.72, toe: -1.3 }],
    arms: [{ upper: -2.3, fore: -2.6 }, { upper: -2.0, fore: -2.4 }],
  },
  // Held up over someone's head: flat, limbs flailing (see held()).
  held: {
    hipX: 0, hipY: -0.5, lean: -1.5,
    legs: [{ thigh: 1.5, shin: 1.4, toe: -0.5 }, { thigh: 1.7, shin: 1.9, toe: -0.5 }],
    arms: [{ upper: -2.0, fore: -1.6 }, { upper: -2.6, fore: -2.9 }],
  },
  hurt: {
    hipX: -0.05, hipY: -0.48, lean: -0.38,
    legs: [{ ...legIK(-0.05, -0.48, 0.12, 0), toe: 0 }, { ...legIK(-0.05, -0.48, -0.14, 0), toe: 0 }],
    arms: [{ upper: -0.6, fore: 0.2 }, { upper: 0.9, fore: 2.0 }],
  },
  crouch: {
    hipX: 0.05, hipY: -0.3, lean: 0.55,
    legs: flatLegs(0.05, -0.3, 0.2, 0.02),
    arms: [{ upper: 0.9, fore: 0.6 }, { upper: 0.7, fore: 0.4 }],
  },
};

/** Standing or walking with your guard up. `phase` advances with distance walked; `amp` 0 = still. */
export function stance(phase, amp, t) {
  const breathe = Math.sin(t * 3.2) * 0.008;
  const base = { ...FIGHT.guard, hipY: FIGHT.guard.hipY + breathe };
  if (amp < 0.02) return base;
  const walk = runPose(phase, 0.22, 0);
  return lerpPose(base, { ...walk, lean: 0.12, arms: GUARD_ARMS }, clamp(amp, 0, 1));
}

/**
 * Standing or walking normally, hands down: how everyone gets about until a
 * fight starts (fighter.js blends to the guard). `phase` and `amp` as stance().
 */
export function relaxed(phase, amp, t) {
  const still = { ...POSES.stand, hipY: POSES.stand.hipY + Math.sin(t * 2.2) * 0.005 };
  if (amp < 0.02) return still;
  const e = 0.22;
  const w = runPose(phase, e, 0);
  // runPose's arms, swinging the same way but hanging loose instead of bent at the elbow.
  const base = -w.lean + 0.25 - e * 0.2;
  const arms = w.arms.map((a) => {
    const upper = 0.35 * ((a.upper - base) / (e * 1.1));
    return { upper, fore: upper + 0.25 };
  });
  return lerpPose(still, { ...w, lean: 0.05, arms }, clamp(amp, 0, 1));
}

/** A straight punch with arm `arm` (0 near, 1 far): wind up, snap out, back to guard. */
export const PUNCH = { time: 0.34, hitFrom: 0.07, hitTo: 0.17, reach: 0.95 };
export function punch(u, arm = 0) {
  const g = FIGHT.guard;
  const out = { upper: 1.62, fore: 1.57 };
  const wind = { upper: 0.2, fore: 2.3 };
  const armAt = (a) => g.arms.map((x, i) => (i === arm ? a : x));
  const windup = { ...g, lean: 0.0, arms: armAt(wind) };
  const hit = { ...g, hipX: 0.04, lean: 0.25, arms: armAt(out), legs: [{ ...legIK(0.04, -0.48, 0.2, 0), toe: 0 }, { ...legIK(0.04, -0.48, -0.14, 0), toe: 0 }], hipY: -0.48 };
  return sampleTrack([[0, g], [0.06, windup], [0.11, hit], [0.2, hit], [PUNCH.time, g]], u);
}

/** A front kick with the near leg: knee up, snap the leg out, set it down. */
export const KICK = { time: 0.52, hitFrom: 0.15, hitTo: 0.28, reach: 1.25 };
export function kick(u) {
  const g = FIGHT.guard;
  const chamber = {
    hipX: 0, hipY: -0.49, lean: -0.05,
    legs: [{ thigh: 1.6, shin: -0.1, toe: 0.3 }, { thigh: -0.02, shin: -0.02, toe: 0 }],
    arms: [{ upper: -0.4, fore: 0.6 }, { upper: 0.7, fore: 2.2 }],
  };
  const out = {
    hipX: -0.03, hipY: -0.49, lean: -0.45,
    legs: [{ thigh: 1.55, shin: 1.52, toe: -0.2 }, { thigh: -0.06, shin: -0.06, toe: 0 }],
    arms: [{ upper: -0.9, fore: -0.4 }, { upper: 1.0, fore: 1.6 }],
  };
  return sampleTrack([[0, g], [0.12, chamber], [0.18, out], [0.3, out], [0.42, chamber], [KICK.time, g]], u);
}

/** The body slam: grab, hoist overhead, slam down in front. With nobody grabbed it's a grab at thin air. */
export const SLAM = { time: 1.0, grab: 0.16, reach: 0.85, lift: 0.26, drop: 0.62, whiff: 0.5 };
export function slam(u, grabbed) {
  const grab = {
    hipX: 0.02, hipY: -0.44, lean: 0.35,
    legs: flatLegs(0.02, -0.44, 0.18, -0.12),
    arms: [{ upper: 1.45, fore: 1.35 }, { upper: 1.35, fore: 1.25 }],
  };
  if (!grabbed) return sampleTrack([[0, FIGHT.guard], [SLAM.grab, grab], [0.3, grab], [SLAM.whiff, FIGHT.guard]], u);
  const up = {
    hipX: 0, hipY: -0.5, lean: -0.12,
    legs: flatLegs(0, -0.5, 0.12, -0.12),
    arms: [{ upper: 3.0, fore: 3.1 }, { upper: 2.9, fore: 3.0 }],
  };
  const down = {
    hipX: 0.06, hipY: -0.34, lean: 0.8,
    legs: flatLegs(0.06, -0.34, 0.24, -0.1),
    arms: [{ upper: 1.3, fore: 0.9 }, { upper: 1.2, fore: 0.8 }],
  };
  return sampleTrack([[0, FIGHT.guard], [SLAM.grab, grab], [SLAM.lift, grab], [0.45, up], [0.55, up], [SLAM.drop, down], [0.8, down], [SLAM.time, FIGHT.guard]], u);
}

/** Rocked by a punch. */
export const HURT = { time: 0.42 };
export function hurt(u) {
  return sampleTrack([[0, FIGHT.guard], [0.06, FIGHT.hurt], [0.22, FIGHT.hurt], [HURT.time, FIGHT.guard]], u);
}

/** Knocked off your feet: in the air (fly), on your back (down), then up again (getup). */
export const KNOCK = { fly: 0.46, down: 1.1, getup: 0.75, height: 0.55 };
export function fly(u) {
  const k = clamp(u / KNOCK.fly, 0, 1);
  return lerpPose(FIGHT.hurt, FIGHT.down, ease(k));
}
export function getup(u) {
  return sampleTrack([
    [0, FIGHT.down],
    [0.25, JUMP_POSES.sitUp],
    [0.5, FIGHT.crouch],
    [KNOCK.getup, FIGHT.guard],
  ], u);
}

/** Held overhead: arms and legs flailing. */
export function held(t) {
  const h = FIGHT.held;
  const w = Math.sin(t * 22) * 0.35;
  return {
    ...h,
    legs: h.legs.map((l, i) => ({ ...l, thigh: l.thigh + (i ? -w : w), shin: l.shin + (i ? w : -w) })),
    arms: h.arms.map((a, i) => ({ upper: a.upper + (i ? w : -w), fore: a.fore + (i ? -w : w) })),
  };
}

/**
 * Emotes, as on the wheel (controls.js), with the emoji shown over your head.
 * Each loops for as long as it plays (EMOTE_TIME, or until you move).
 */
export const EMOTE_TIME = 2.6;
export const EMOTES = [
  { id: 'flex', label: 'Flex', icon: '💪' },
  { id: 'dance', label: 'Dance', icon: '🕺' },
  { id: 'taunt', label: 'Come on', icon: '👋' },
  { id: 'laugh', label: 'Laugh', icon: '😂' },
  { id: 'dab', label: 'Dab', icon: '😎' },
  { id: 'chicken', label: 'Chicken', icon: '🐔' },
];

export function emote(id, u) {
  const s = POSES.stand;
  const legs = flatLegs(0, -0.5, 0.1, -0.1);
  const base = { ...s, legs };
  const into = (pose) => lerpPose(base, pose, ease(clamp(u / 0.18, 0, 1)));
  switch (id) {
    case 'flex': {
      // Double biceps, pumping.
      const p = Math.abs(Math.sin(u * 7)) * 0.3;
      return into({
        ...base, lean: 0.02, hipY: -0.5 + p * 0.02,
        arms: [{ upper: 1.75 - p * 0.3, fore: 3.05 + p }, { upper: -1.75 + p * 0.3, fore: -3.05 - p }],
      });
    }
    case 'dance': {
      const q = Math.sin(u * 8);
      const hx = 0.035 * q;
      return into({
        hipX: hx, hipY: -0.49 + 0.015 * Math.abs(q), lean: 0.18 * q,
        legs: [
          { ...legIK(hx, -0.49, 0.12, -0.08 * Math.max(0, q)), toe: 0 },
          { ...legIK(hx, -0.49, -0.1, -0.08 * Math.max(0, -q)), toe: 0 },
        ],
        arms: [{ upper: 2.6 + 0.5 * q, fore: 2.9 + 0.4 * q }, { upper: 0.6 - 0.5 * q, fore: 1.9 - 0.4 * q }],
      });
    }
    case 'taunt': {
      // "Come on": the near hand beckons, the other on the hip.
      const b = Math.abs(Math.sin(u * 6));
      return into({ ...base, lean: -0.08, arms: [{ upper: 1.35, fore: 1.5 + 1.1 * b }, { upper: -0.7, fore: 0.9 }] });
    }
    case 'laugh': {
      // Point and laugh, bent over, shaking.
      const shake = Math.sin(u * 26) * 0.06;
      return into({ ...base, hipY: -0.48, lean: 0.4 + shake, arms: [{ upper: 1.5, fore: 1.45 }, { upper: 0.35, fore: 1.95 }] });
    }
    case 'dab': {
      const k = ease(clamp((u % 1.3) / 0.2, 0, 1));
      const dab = { ...base, lean: 0.42, arms: [{ upper: 2.35, fore: 4.05 }, { upper: -2.25, fore: -2.3 }] };
      return into(lerpPose(base, dab, k));
    }
    case 'chicken': {
      const f = Math.abs(Math.sin(u * 11));
      const bob = Math.sin(u * 5.5);
      return into({
        hipX: 0, hipY: -0.46 + 0.015 * bob, lean: 0.35 + 0.12 * bob,
        legs: flatLegs(0, -0.46 + 0.015 * bob, 0.12, -0.12),
        arms: [{ upper: -0.3 - 0.7 * f, fore: 2.6 }, { upper: -0.2 - 0.7 * f, fore: 2.7 }],
      });
    }
    default:
      return base;
  }
}
