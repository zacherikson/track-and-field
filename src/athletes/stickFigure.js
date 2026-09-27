/**
 * Placeholder stick-figure athlete.
 *
 * A figure is described by a POSE: joint angles in radians plus a hip position,
 * all relative to the figure's height H. Poses can be blended (lerpPose), which
 * is how we transition from crouched blocks -> set -> sprinting without a
 * sprite sheet. Original art replaces this in step 6; keep gameplay code
 * talking to `drawFigure(pose)` so the swap is local.
 *
 * Angle conventions: limbs measure from straight DOWN, torso from straight UP;
 * positive = toward the running direction (+x).
 */

import { CONFIG } from '../config.js';

const THIGH_L = 0.25; // limb lengths in figure heights (must match drawFigure)
const SHIN_L = 0.25;
const FOOT_L = 0.06;

/**
 * Starting blocks, in figure heights relative to the athlete's feet origin (the
 * start position). Each foot's toes touch the track at the base of a footplate
 * inclined `plateAngle` (rad above the ground, rising backwards); the sole lies
 * on the plate. Front plate about 0.45 m and rear about 0.8 m behind the hands.
 */
/**
 * The launch pose is reached when the runner has moved LAUNCH.distance meters
 * (the race scene blends set -> launch over that distance).
 */
export const LAUNCH = { distance: 0.35, blend: 1.6 }; // m: launch pose reached; fully running
const LAUNCH_SHIFT = LAUNCH.distance / 1.8; // that distance in figure heights (1.8 m athlete)

export const BLOCK_FEET = {
  front: -0.1, // toe x of the front foot
  rear: -0.3, // toe x of the rear foot
  plateAngle: 0.85,
};

/**
 * Two-bone leg IK: thigh and shin angles (from straight down, + = forward) that
 * put the ankle at (ax, ay) from a hip at (hx, hy), knee bending forward.
 */
function legIK(hx, hy, ax, ay) {
  const dx = ax - hx;
  const dy = ay - hy;
  const d = Math.min(Math.hypot(dx, dy), THIGH_L + SHIN_L - 1e-4);
  const base = Math.atan2(dx, dy);
  const a = Math.acos((THIGH_L * THIGH_L + d * d - SHIN_L * SHIN_L) / (2 * THIGH_L * d));
  const thigh = base + a;
  const kx = hx + THIGH_L * Math.sin(thigh);
  const ky = hy + THIGH_L * Math.cos(thigh);
  return { thigh, shin: Math.atan2(ax - kx, ay - ky) };
}

/** Legs for a hip position with feet flat on the track at the given toe x's. */
function flatLegs(hipX, hipY, frontX, rearX) {
  return [
    { ...legIK(hipX, hipY, frontX - FOOT_L, 0), toe: 0 },
    { ...legIK(hipX, hipY, rearX - FOOT_L, 0), toe: 0 },
  ];
}

/** Legs for a hip position with both feet planted on the starting blocks. */
function blockLegs(hipX, hipY) {
  const toe = BLOCK_FEET.plateAngle; // foot points forward-down along the plate
  const ankle = (tx) => [tx - FOOT_L * Math.cos(toe), -FOOT_L * Math.sin(toe)];
  const [fx, fy] = ankle(BLOCK_FEET.front);
  const [rx, ry] = ankle(BLOCK_FEET.rear);
  return [
    { ...legIK(hipX, hipY, fx, fy), toe },
    { ...legIK(hipX, hipY, rx, ry), toe },
  ];
}

export const POSES = {
  stand: {
    hipX: 0, hipY: -0.5, lean: 0.02,
    legs: [{ thigh: 0.04, shin: 0.02 }, { thigh: -0.04, shin: -0.05 }],
    arms: [{ upper: 0.08, fore: 0.25 }, { upper: -0.06, fore: 0.1 }],
  },
  // Halfway down into the blocks: bent at the waist, knees bent, hands reaching for the track.
  bend: {
    hipX: -0.08, hipY: -0.42, lean: 0.95,
    legs: [{ thigh: 0.55, shin: -0.25 }, { thigh: 0.05, shin: -0.55 }],
    arms: [{ upper: 0.25, fore: 0.15 }, { upper: 0.12, fore: 0.05 }],
  },
  // Getting into the blocks (from footage of the original): drop forward onto
  // the hands at the line with the feet still in front of the blocks...
  squat: {
    hipX: -0.1, hipY: -0.24, lean: 1.2,
    legs: flatLegs(-0.1, -0.24, 0.02, -0.04),
    arms: [{ upper: 0.05, fore: 0.05 }, { upper: -0.02, fore: -0.02 }],
  },
  // ...kick the rear leg straight back into the rear block...
  kickRear: {
    hipX: -0.13, hipY: -0.27, lean: 1.3,
    legs: [flatLegs(-0.13, -0.27, 0.0, 0)[0], { thigh: -1.35, shin: -1.55, toe: 0.3 }],
    arms: [{ upper: 0.05, fore: 0.05 }, { upper: -0.02, fore: -0.02 }],
  },
  // ...then a small step: the front foot lifts just off the track and moves back
  // onto the front block (no kick), rear foot already placed.
  stepFront: {
    hipX: -0.15, hipY: -0.27, lean: 1.22,
    legs: [{ ...legIK(-0.15, -0.27, -0.09, -0.05), toe: 0.4 }, blockLegs(-0.15, -0.27)[1]],
    arms: [{ upper: 0.05, fore: 0.05 }, { upper: -0.02, fore: -0.02 }],
  },
  // "On your marks / Ready": feet on the blocks, rear knee down near the track, hands on the line.
  blocks: {
    hipX: -0.16, hipY: -0.26, lean: 1.2,
    legs: blockLegs(-0.16, -0.26),
    arms: [{ upper: 0.05, fore: 0.05 }, { upper: -0.02, fore: -0.02 }],
  },
  // "Get set": hips raised a little above the shoulders, weight forward on the hands.
  set: {
    hipX: -0.12, hipY: -0.41, lean: 1.68,
    legs: blockLegs(-0.12, -0.41),
    arms: [{ upper: -0.08, fore: -0.08 }, { upper: -0.12, fore: -0.12 }],
  },
};

/**
 * Pushing out of the blocks, k = 0 (set) .. 1 (launch). From footage of the
 * original and of real starts: the front leg drives straight off its block (the
 * toes stay on it the whole time, so the leg straightens instead of swinging),
 * the rear knee punches forward low, the body stays flat and low, and the arms
 * are thrown wide, one forward, one back. The race scene reaches k = 1 when the
 * runner has moved LAUNCH.distance.
 */
export function launchPose(k) {
  const set = POSES.set;
  const hipX = lerp(set.hipX, 0.1, k);
  const hipY = lerp(set.hipY, -0.4, k);
  const toe = BLOCK_FEET.plateAngle;
  // The block stays put while the runner moves, so it slides back in figure space.
  const ax = BLOCK_FEET.front - FOOT_L * Math.cos(toe) - LAUNCH_SHIFT * k;
  const ay = -FOOT_L * Math.sin(toe);
  const rear = { thigh: 0.95, shin: -0.55, toe: -0.1 };
  const arms = [{ upper: 1.35, fore: 2.45 }, { upper: -2.15, fore: -1.95 }]; // back arm flung up behind
  return {
    hipX,
    hipY,
    lean: lerp(set.lean, 1.12, k),
    legs: [
      { ...legIK(hipX, hipY, ax, ay), toe },
      { thigh: lerp(set.legs[1].thigh, rear.thigh, k), shin: lerp(set.legs[1].shin, rear.shin, k), toe: lerp(set.legs[1].toe ?? 0, rear.toe, k) },
    ],
    arms: set.arms.map((a, i) => ({ upper: lerp(a.upper, arms[i].upper, k), fore: lerp(a.fore, arms[i].fore, k) })),
  };
}

/**
 * Going over a hurdle, blended onto the running pose by `amount` (0 = running,
 * 1 = over the bar). Lead leg (near) shoots out straight in front, the trail leg
 * folds up behind, the torso pitches forward and the opposite arm reaches for
 * the lead foot. The hips lift so the lead leg clears the bar.
 */
export function hurdlePose(run, amount) {
  const over = {
    hipX: 0,
    hipY: -0.64,
    lean: 0.8,
    legs: [
      { thigh: 1.45, shin: 1.38, toe: -0.35 },
      { thigh: -0.35, shin: -1.9, toe: 0.6 },
    ],
    arms: [
      { upper: -0.95, fore: -0.35 },
      { upper: 1.35, fore: 1.5 },
    ],
  };
  return lerpPose(run, over, amount);
}

/**
 * Stumbling after catching a hurdle (from footage of the original), `age` s
 * after takeoff, with phase lengths `tr` ({ hit, stumble, recover }). The legs
 * keep running (`run`), but the body pitches forward and dips, and the arms
 * flail, one flung forward and up, the other back, before the runner catches
 * their balance and settles back into their form. They never go down.
 */
export function tripPose(run, age, tr) {
  const ease = (k) => k * k * (3 - 2 * k);
  const flail = Math.sin(age * 22) * 0.35; // arms windmilling a little
  const stumble = {
    ...run,
    hipY: run.hipY + 0.04,
    lean: 0.75,
    arms: [
      { upper: 2.3 + flail, fore: 2.8 + flail },
      { upper: -1.7 - flail, fore: -1.2 - flail },
    ],
  };
  let k;
  if (age < tr.hit) k = 0;
  else if (age < tr.hit + 0.1) k = ease((age - tr.hit) / 0.1); // the jolt
  else if (age < tr.hit + tr.stumble) k = 1;
  else k = 1 - ease(Math.min(1, (age - tr.hit - tr.stumble) / tr.recover));
  return lerpPose(run, stumble, k);
}

/**
 * LONG JUMP KEYFRAMES: our own sprite sheet for Juno, traced from the motion
 * of the original (frame by frame from gameplay footage). Angles in radians
 * from straight down, + = forward (the direction of the jump); lean is the
 * torso from upright, + = forward, - = arched back. In the air only the pose
 * matters (the flight path places the hips); on the ground hipY is the hip
 * height (figure heights, negative = up).
 *
 * Flight, in order:
 *   plant    takeoff: lead knee driving up, takeoff leg pushing off behind,
 *            one arm punching up, the other swinging back
 *   arch     rising: the body arched back, both arms reaching up and back
 *            overhead, knees bent with the feet trailing behind
 *   hang     the top: upright, arms straight up, legs dangling
 * With the stretch (press both at the top):
 *   snap     knees snap up to the chest, arms swing forward and down
 *   dive     jackknife: torso pitched forward over the legs, reaching for the toes
 *   glide    legs thrust out in front, arms stretched forward past the feet
 *   contact  heels hit the sand, folding forward
 *   sitSand  sat in the sand in the splash, folded over the legs
 *   rollBack momentum rolls you onto your back, legs up, arms flung back
 *   sitUp    sit back up, knees bent, hands on knees
 *   squat    rock forward over the feet into a squat
 *   (then stand)
 * Without it, you crumple:
 *   tuck     a ball in the air
 *   crouch   feet hit the sand in a crouch
 *   prone    flopped forward onto your face (hips 0.45 H ahead of the feet)
 */
export const JUMP_POSES = {
  plant: {
    hipX: 0, hipY: -0.5, lean: -0.1,
    legs: [{ thigh: 1.3, shin: 0.25, toe: -0.2 }, { thigh: -0.45, shin: -0.6, toe: 0.6 }],
    arms: [{ upper: 2.6, fore: 2.9 }, { upper: -0.9, fore: -0.5 }],
  },
  arch: {
    hipX: 0, hipY: -0.5, lean: -0.32,
    legs: [{ thigh: 0.3, shin: -1.25, toe: 0.6 }, { thigh: -0.3, shin: -1.55, toe: 0.6 }],
    arms: [{ upper: 3.4, fore: 3.6 }, { upper: 3.25, fore: 3.45 }],
  },
  hang: {
    hipX: 0, hipY: -0.5, lean: -0.2,
    legs: [{ thigh: 0.6, shin: -0.15, toe: 0.2 }, { thigh: 0.35, shin: -0.45, toe: 0.2 }],
    arms: [{ upper: 3.1, fore: 3.2 }, { upper: 2.95, fore: 3.05 }],
  },
  snap: {
    hipX: 0, hipY: -0.5, lean: 0.35,
    legs: [{ thigh: 2.25, shin: 0.45, toe: -0.2 }, { thigh: 2.1, shin: 0.3, toe: -0.2 }],
    arms: [{ upper: 1.9, fore: 1.2 }, { upper: 1.75, fore: 1.05 }],
  },
  dive: {
    hipX: 0, hipY: -0.5, lean: 0.95,
    legs: [{ thigh: 1.55, shin: 1.62, toe: -0.5 }, { thigh: 1.47, shin: 1.56, toe: -0.5 }],
    arms: [{ upper: 1.2, fore: 1.62 }, { upper: 1.1, fore: 1.52 }],
  },
  glide: {
    hipX: 0, hipY: -0.5, lean: 0.6,
    legs: [{ thigh: 1.85, shin: 1.8, toe: -0.5 }, { thigh: 1.75, shin: 1.72, toe: -0.5 }],
    arms: [{ upper: 1.75, fore: 1.7 }, { upper: 1.6, fore: 1.55 }],
  },
  contact: {
    hipX: 0, hipY: -0.22, lean: 0.95,
    legs: [{ ...legIK(0, -0.22, 0.42, 0), toe: -0.3 }, { ...legIK(0, -0.22, 0.38, 0), toe: -0.3 }],
    arms: [{ upper: 1.5, fore: 1.45 }, { upper: 1.4, fore: 1.35 }],
  },
  sitSand: {
    hipX: 0, hipY: -0.1, lean: 0.75,
    legs: [{ thigh: 1.37, shin: 1.5, toe: -0.4 }, { thigh: 1.33, shin: 1.47, toe: -0.4 }],
    arms: [{ upper: 1.1, fore: 1.3 }, { upper: 1.0, fore: 1.2 }],
  },
  rollBack: {
    hipX: 0, hipY: -0.07, lean: -1.35,
    legs: [{ thigh: 2.35, shin: 2.2, toe: -1.0 }, { thigh: 2.15, shin: 2.0, toe: -1.0 }],
    arms: [{ upper: -2.0, fore: -2.3 }, { upper: -1.75, fore: -2.0 }],
  },
  sitUp: {
    hipX: 0, hipY: -0.1, lean: 0.25,
    legs: [{ ...legIK(0, -0.1, 0.38, 0), toe: 0 }, { ...legIK(0, -0.1, 0.34, 0), toe: 0 }],
    arms: [{ upper: 0.9, fore: 1.4 }, { upper: 0.8, fore: 1.3 }],
  },
  squat: {
    hipX: 0.3, hipY: -0.3, lean: 0.7,
    legs: [{ ...legIK(0.3, -0.3, 0.38, 0), toe: 0 }, { ...legIK(0.3, -0.3, 0.34, 0), toe: 0 }],
    arms: [{ upper: 0.7, fore: 0.5 }, { upper: 0.6, fore: 0.4 }],
  },
  tuck: {
    hipX: 0, hipY: -0.5, lean: 0.3,
    legs: [{ thigh: 1.9, shin: -0.15, toe: 0.3 }, { thigh: 1.75, shin: -0.3, toe: 0.3 }],
    arms: [{ upper: 1.0, fore: 1.5 }, { upper: 0.85, fore: 1.35 }],
  },
  crouch: {
    hipX: 0, hipY: -0.28, lean: 0.95,
    legs: [{ ...legIK(0, -0.28, 0.02, 0), toe: 0 }, { ...legIK(0, -0.28, -0.04, 0), toe: 0 }],
    arms: [{ upper: 1.4, fore: 1.2 }, { upper: 1.2, fore: 1.0 }],
  },
  prone: {
    hipX: 0.45, hipY: -0.07, lean: 1.52,
    legs: [{ thigh: -1.5, shin: -1.55, toe: 1.3 }, { thigh: -1.45, shin: -1.6, toe: 1.3 }],
    arms: [{ upper: 1.65, fore: 1.6 }, { upper: 1.5, fore: 1.45 }],
  },
};

/**
 * POLE VAULT KEYFRAMES, traced frame by frame from footage of the original
 * (our own stick figure, not its art). On the pole the body hangs from the
 * hands at swing angle `alpha` (hips relative to the hands: 0 = straight
 * below, PI/2 = level ahead, PI = upside down above); vaultSwingPose builds
 * the pose from `alpha` and the leg keys below.
 *   plant       arms stretched overhead to the pole, leaning in, lead knee up
 *   lie back    on your back under the top of the pole, head to the runway,
 *               knees drawn up, while the pole bends
 *   invert      legs swing up to upside down
 * Off the top, the vaulter TURNS to face the bar: from there the figure is
 * mirrored (flip: true; angles are then in the mirrored frame, so + = toward
 * the runway on screen).
 *   turn        upside down, feet tipping over the bar
 *   overBar     face down over the bar, head to the runway, arms hanging,
 *               legs dangling down past it (held while you hang at the top)
 *   drop        falling upright, knees bent
 *   landBack    onto your back on the mat, legs up
 *   lie         lying there, legs coming down
 *   sitMat      sitting up
 *   crouchMat   rocking forward onto your feet
 *   (then stand, facing the runway)
 */
const SWING_LEGS = [
  // [u, [[thigh, shin] lead, [thigh, shin] trail]], angles relative to the body line (0 = straight away from the hands)
  [0, [[1.3, 0.3], [-0.5, -0.9]]], // takeoff: lead knee driving up, trail leg back
  [0.25, [[1.0, 1.4], [0.8, 1.2]]], // lying back: knees drawn up, feet up
  [0.6, [[0.7, 1.5], [0.6, 1.4]]],
  [0.85, [[0.25, 0.35], [0.2, 0.3]]], // legs swing up and straighten
  [1, [[0, 0], [0.04, 0.04]]], // upside down, legs straight
];
export const VAULT_POSES = {
  carryArms: [{ upper: 0.2, fore: 1.6 }, { upper: 0.7, fore: 2.1 }], // pole carried at the hip and chest, tip high
  plantArms: [{ upper: 2.9, fore: 2.75 }, { upper: 2.7, fore: 2.55 }], // both hands up to the pole
  // Mirrored from here (flip: true).
  turn: {
    flip: true, hipX: 0, hipY: 0, lean: 2.4,
    legs: [{ thigh: -2.35, shin: -2.3, toe: 0 }, { thigh: -2.45, shin: -2.4, toe: 0 }],
    arms: [{ upper: 0.15, fore: 0.2 }, { upper: 0.05, fore: 0.1 }],
  },
  overBar: {
    flip: true, hipX: 0, hipY: 0, lean: 1.5,
    legs: [{ thigh: -0.9, shin: -0.2, toe: 0.4 }, { thigh: -1.1, shin: -0.4, toe: 0.4 }],
    arms: [{ upper: 0.25, fore: 0.35 }, { upper: 0.1, fore: 0.2 }],
  },
  hang: {
    flip: true, hipX: 0, hipY: 0, lean: 1.2,
    legs: [{ thigh: -0.4, shin: 0.1, toe: 0.3 }, { thigh: -0.6, shin: -0.05, toe: 0.3 }],
    arms: [{ upper: 0.3, fore: 0.5 }, { upper: 0.15, fore: 0.35 }],
  },
  drop: {
    flip: true, hipX: 0, hipY: 0, lean: -0.3,
    legs: [{ thigh: 1.3, shin: 0.3, toe: 0 }, { thigh: 1.1, shin: 0.15, toe: 0 }],
    arms: [{ upper: 2.4, fore: 2.8 }, { upper: -2.2, fore: -2.6 }],
  },
  landBack: {
    flip: true, hipX: 0, hipY: -0.1, lean: -1.4,
    legs: [{ thigh: 2.5, shin: 3.0, toe: 0 }, { thigh: 2.35, shin: 2.85, toe: 0 }],
    arms: [{ upper: -2.6, fore: -2.9 }, { upper: -2.4, fore: -2.7 }],
  },
  lie: {
    flip: true, hipX: 0, hipY: -0.07, lean: -1.5,
    legs: [{ thigh: 1.9, shin: 1.75, toe: -0.3 }, { thigh: 1.8, shin: 1.7, toe: -0.3 }],
    arms: [{ upper: -2.2, fore: -2.5 }, { upper: -2.0, fore: -2.3 }],
  },
  crouchMat: {
    flip: true, hipX: 0, hipY: -0.28, lean: 0.55,
    legs: [{ ...legIK(0, -0.28, 0.1, 0), toe: 0 }, { ...legIK(0, -0.28, 0.05, 0), toe: 0 }],
    arms: [{ upper: 0.5, fore: 0.3 }, { upper: 0.4, fore: 0.2 }],
  },
  sitMat: {
    flip: true, hipX: 0, hipY: -0.12, lean: -0.55,
    legs: [{ thigh: 1.45, shin: 1.55, toe: -0.3 }, { thigh: 1.4, shin: 1.5, toe: -0.3 }],
    arms: [{ upper: -0.4, fore: -0.2 }, { upper: -0.5, fore: -0.3 }],
  },
};

/** On the pole: hips at `alpha` from the hands, swing progress u (0 plant .. 1 top of the pole). */
export function vaultSwingPose(alpha, u) {
  let i = 1;
  while (i < SWING_LEGS.length - 1 && u > SWING_LEGS[i][0]) i++;
  const [u0, a] = SWING_LEGS[i - 1];
  const [u1, b] = SWING_LEGS[i];
  let k = clamp01((u - u0) / (u1 - u0));
  k = k * k * (3 - 2 * k);
  const leg = (j) => ({ thigh: alpha + lerp(a[j][0], b[j][0], k), shin: alpha + lerp(a[j][1], b[j][1], k), toe: 0 });
  // Arms reach from the shoulders to the hands on the pole (along the body line, a little bent at first).
  const bend = 0.35 * (1 - clamp01(u / 0.3));
  return {
    hipX: 0, hipY: 0, lean: -alpha,
    legs: [leg(0), leg(1)],
    arms: [{ upper: alpha - Math.PI - bend, fore: alpha - Math.PI + bend * 0.6 }, { upper: alpha - Math.PI - bend + 0.1, fore: alpha - Math.PI + bend * 0.6 + 0.1 }],
  };
}

/** Copy of `pose` with every angle shifted by whole turns to lie nearest `ref`'s (so a blend doesn't spin). */
export function wrapNear(pose, ref) {
  const w = (a, r) => a + 2 * Math.PI * Math.round((r - a) / (2 * Math.PI));
  return {
    ...pose,
    lean: w(pose.lean, ref.lean),
    legs: pose.legs.map((l, i) => ({ ...l, thigh: w(l.thigh, ref.legs[i].thigh), shin: w(l.shin, ref.legs[i].shin) })),
    arms: pose.arms.map((a, i) => ({ upper: w(a.upper, ref.arms[i].upper), fore: w(a.fore, ref.arms[i].fore) })),
  };
}
const clamp01 = (k) => Math.max(0, Math.min(1, k));

/** Sample a keyframe track [[t, pose], ...] at time t: eased between keys, held past the ends. */
export function sampleTrack(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, p1] = keys[i];
    if (t <= t1) {
      const [t0, p0] = keys[i - 1];
      const k = (t - t0) / (t1 - t0);
      return lerpPose(p0, p1, k * k * (3 - 2 * k));
    }
  }
  return keys[keys.length - 1][1];
}

/**
 * Running pose from a stride phase (radians) and intensity amp (0..1, grows with
 * speed). Modelled on a real sprinter's (and the original's) run cycle; the foot
 * path relative to the hips is a loop biased BEHIND the body:
 *   1. land close under the hips and sweep back along the track, rolling up
 *      onto the toes (the hip extends: the leg ends up angled well behind);
 *   2. after push-off the leg keeps trailing back, nearly straight: the rear
 *      leg of the airborne "split";
 *   3. the heel folds up toward the backside;
 *   4. the folded leg swings through under the hips and the knee comes up in
 *      front, shin angled back;
 *   5. the leg opens out and the foot paws back down onto the track.
 * The legs are solved with IK from that foot path, so the knees bend naturally
 * and a planted foot never sinks into the track. The hips bob: lowest with a
 * foot planted, highest in the split between steps.
 *
 * `drive` (0..1) is the out-of-the-blocks drive phase: body pitched forward and
 * low, feet landing further back, and full effort (big arm swing and knee drive)
 * even though the speed is still low.
 *
 * At phase 0 the near leg (0) is just pushing off and the far leg's knee is
 * coming through: the natural continuation of the launch out of the blocks.
 */
export function runPose(phase, amp, drive = 0) {
  const a = amp;
  const e = Math.max(a, Math.min(1, 1.4 * drive)); // effort: arm swing and knee drive (full out of the blocks)
  const lean = 0.06 + 0.22 * a + 0.75 * drive;
  const reach = 0.55 + 0.45 * a; // longer foot travel at speed
  const lift = 0.35 + 0.65 * e; // higher heel kick and knee drive with effort
  const touchX = (0.1 - 0.08 * drive) * reach; // ankle lands just ahead of the hips
  const pushX = -0.26 * reach; // ...and is well behind them at push-off
  const pushToe = 1.0; // foot angle at push-off: up on the toes
  const pushH = FOOT_L * Math.sin(pushToe);
  // Time on the track: as long as the planted foot takes to slide from touchX to
  // pushX at running speed (so it doesn't skate), clamped to look right at the
  // extremes. About 15% of the cycle at a sprint, 25% jogging.
  const v = 11 * a;
  const cycle = (CONFIG.runner.strideBase + CONFIG.runner.stridePerMps * v) / CONFIG.figure.height;
  const stance = clamp((touchX - pushX) / cycle, 0.15, 0.4);
  // Swing timing (fraction of the swing at each point of the foot path below):
  // most of it is spent behind the body; the foot drops quickly out front.
  const T = [0, 0.17, 0.4, 0.6, 0.77, 0.9, 1];
  const kneeU = stance + T[4] * (1 - stance); // point of the cycle where the knee is furthest forward

  // Hip height: lowest mid-stance, highest mid-flight, twice per cycle.
  const u0 = frac(phase / (2 * Math.PI) + stance);
  const bob = (0.01 + 0.015 * a) * (1 - 0.5 * drive);
  const hipY = -0.48 + 0.07 * drive + bob * Math.cos(4 * Math.PI * (u0 - stance / 2));

  const legs = [0, 1].map((i) => {
    const u = frac(u0 + i * 0.5);
    let ax, h, toe;
    if (u < stance) {
      // On the track: the foot rolls from flat up onto the toes as it pushes off.
      const k = u / stance;
      ax = lerp(touchX, pushX, k);
      toe = pushToe * smoothstep(0.35, 1, k);
      h = FOOT_L * Math.sin(toe); // heel lifts, toes stay on the track
    } else {
      const w = (u - stance) / (1 - stance);
      // Push-off, trailing back, heel up, through under the hips, knee up, open out, touchdown.
      // First and last entries only guide the curve's direction at the ends.
      const x = [pushX + 0.05, pushX, -0.33 * reach, -0.2 * reach, 0.02 * reach, 0.2 * reach, 0.17 * reach, touchX, touchX - 0.05];
      const y = [0, pushH, 0.16 * lift, 0.33 * lift, 0.22 * lift, 0.13 * lift, 0.05 * lift, 0, 0];
      ax = catmull(x, T, w);
      h = Math.max(0, catmull(y, T, w));
      toe = piecewise([pushToe, 1.1, 0.8, 0.3, -0.1, -0.15, 0], T, w);
    }
    return { ...legIK(0, hipY, ax, -h), toe };
  });

  const arms = [0, 1].map((i) => {
    // Arms swing opposite to the legs: this arm is furthest back when this
    // leg's knee is furthest forward.
    const q = 2 * Math.PI * (u0 + i * 0.5 - kneeU) + Math.PI / 2;
    const back = Math.max(0, Math.sin(q)); // 1 at the end of the backswing
    // The swing is measured from the torso (arm hanging along it = -lean), so
    // the elbow still drives well behind the body when it's pitched forward in
    // the drive phase. At full effort it swings from about 60° behind the torso
    // line to about 65° in front: upper arm about 75° back and hand at chin
    // height when running upright, elbow up above the shoulder out of the blocks.
    const upper = -lean + 0.25 - e * (0.2 + 1.1 * Math.sin(q));
    // Elbow held near 90° at any speed (about 100° jogging, 94° sprinting),
    // opening a little at the back of the swing.
    return { upper, fore: upper + 1.3 + 0.2 * e - 0.35 * e * back };
  });

  return { hipX: 0, hipY, lean, legs, arms };
}

const frac = (x) => x - Math.floor(x);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
/** Segment index and local 0..1 position of t within the ascending times T. */
function segment(T, t) {
  let i = 0;
  while (i < T.length - 2 && t >= T[i + 1]) i++;
  return [i, (t - T[i]) / (T[i + 1] - T[i])];
}
/** Linear interpolation through values v reached at times T. */
function piecewise(v, T, t) {
  const [i, s] = segment(T, t);
  return lerp(v[i], v[i + 1], s);
}
/**
 * Catmull-Rom spline through values reached at times T. v has two extra
 * entries, first and last, that only guide the curve's direction at the ends
 * (the curve runs from v[1] at T[0] to v[n-2] at the last time).
 */
function catmull(v, T, t) {
  const [i, s] = segment(T, t);
  const [p0, p1, p2, p3] = [v[i], v[i + 1], v[i + 2], v[i + 3]];
  return 0.5 * (2 * p1 + (p2 - p0) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s + (3 * p1 - p0 - 3 * p2 + p3) * s * s * s);
}

const lerp = (a, b, t) => a + (b - a) * t;

/** How far the furthest-forward hand reaches ahead of the feet origin, in figure heights. */
export function handReach(pose) {
  const shoulder = pose.hipX + 0.9 * 0.32 * Math.sin(pose.lean);
  return Math.max(...pose.arms.map((a) => shoulder + 0.17 * Math.sin(a.upper) + 0.16 * Math.sin(a.fore)));
}

/**
 * Finish lean on top of a running pose (from footage of the original): the legs
 * keep striding, the torso pitches forward until it's nearly horizontal, and the
 * arms sweep back and up behind the body. `amount` 0 = upright run, 1 = full lean.
 */
export function leanPose(run, amount) {
  const k = amount;
  return {
    ...run,
    hipY: run.hipY + 0.04 * k,
    lean: lerp(run.lean, 1.4, k),
    arms: run.arms.map((arm, i) => ({
      upper: lerp(arm.upper, -2.05 - 0.12 * i, k),
      fore: lerp(arm.fore, -2.3 - 0.12 * i, k),
    })),
  };
}

export function lerpPose(a, b, t) {
  return {
    hipX: lerp(a.hipX, b.hipX, t),
    hipY: lerp(a.hipY, b.hipY, t),
    lean: lerp(a.lean, b.lean, t),
    legs: a.legs.map((l, i) => ({
      thigh: lerp(l.thigh, b.legs[i].thigh, t),
      shin: lerp(l.shin, b.legs[i].shin, t),
      toe: lerp(l.toe ?? 0, b.legs[i].toe ?? 0, t),
    })),
    arms: a.arms.map((l, i) => ({ upper: lerp(l.upper, b.arms[i].upper, t), fore: lerp(l.fore, b.arms[i].fore, t) })),
  };
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

/** Screen position of hand `i` (0 near, 1 far) for a figure drawn with drawFigure(ctx, x, y, H, pose). */
export function handPos(x, y, H, pose, i = 0) {
  if (pose.flip) {
    const p = handPos(x, y, H, { ...pose, flip: false }, i);
    return { x: 2 * x - p.x, y: p.y };
  }
  const hipX = x + pose.hipX * H;
  const hipY = y + pose.hipY * H;
  const sx = hipX + 0.9 * 0.32 * H * Math.sin(pose.lean);
  const sy = hipY - 0.9 * 0.32 * H * Math.cos(pose.lean);
  const a = pose.arms[i];
  return {
    x: sx + 0.17 * H * Math.sin(a.upper) + 0.16 * H * Math.sin(a.fore),
    y: sy + 0.17 * H * Math.cos(a.upper) + 0.16 * H * Math.cos(a.fore),
  };
}

/** Head centre and radius (for hats) for a figure drawn with drawFigure(ctx, x, y, H, pose). */
export function headCircle(x, y, H, pose) {
  const hipX = x + pose.hipX * H;
  const hipY = y + pose.hipY * H;
  const d = 0.32 * H + 0.085 * H * 1.3; // torso, then the head centre just past the neck (as drawFigure)
  return { x: hipX + d * Math.sin(pose.lean), y: hipY - d * Math.cos(pose.lean), r: 0.085 * H };
}

/**
 * Draw a figure with feet at (x, y) in logical pixels.
 * @param H figure height in pixels
 * @param colors { shirt, skin, shorts }
 * @param groundY where its shadow goes (defaults to y; lower when the figure is in the air)
 */
export function drawFigure(ctx, x, y, H, pose, colors, groundY = y) {
  if (pose.flip) {
    // Mirrored (facing -x): the pole vaulter after the turn at the top of the pole.
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    drawFigure(ctx, 0, y, H, { ...pose, flip: false }, colors, groundY);
    ctx.restore();
    return;
  }
  const THIGH = 0.25 * H, SHIN = 0.25 * H, TORSO = 0.32 * H;
  const UPPER = 0.17 * H, FORE = 0.16 * H, HEAD = 0.085 * H;
  const lw = Math.max(2, 0.065 * H);

  const hip = { x: x + pose.hipX * H, y: y + pose.hipY * H };
  const neck = { x: hip.x + Math.sin(pose.lean) * TORSO, y: hip.y - Math.cos(pose.lean) * TORSO };
  const shoulder = { x: lerp(hip.x, neck.x, 0.9), y: lerp(hip.y, neck.y, 0.9) };
  const limb = (from, angle, len) => ({ x: from.x + Math.sin(angle) * len, y: from.y + Math.cos(angle) * len });

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Ground shadow (at groundY when the figure is in the air: smaller and fainter the higher it is).
  const lift = Math.max(0, groundY - y) / H;
  ctx.fillStyle = `rgba(0,0,0,${0.22 * Math.max(0.3, 1 - lift)})`;
  ctx.beginPath();
  ctx.ellipse(x, groundY + 1, 0.2 * H * Math.max(0.5, 1 - lift * 0.8), 0.04 * H, 0, 0, Math.PI * 2);
  ctx.fill();

  const drawLeg = (leg, color) => {
    const knee = limb(hip, leg.thigh, THIGH);
    const foot = limb(knee, leg.shin, SHIN);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(knee.x, knee.y);
    ctx.lineTo(foot.x, foot.y);
    // Foot: flat and pointing forward, or tilted toes-down (`toe` rad) on the blocks.
    const toe = leg.toe ?? 0;
    ctx.lineTo(foot.x + FOOT_L * H * Math.cos(toe), foot.y + FOOT_L * H * Math.sin(toe));
    ctx.stroke();
  };
  const drawArm = (arm, color) => {
    const elbow = limb(shoulder, arm.upper, UPPER);
    const hand = limb(elbow, arm.fore, FORE);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw * 0.85;
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(elbow.x, elbow.y);
    ctx.lineTo(hand.x, hand.y);
    ctx.stroke();
  };

  // Far side limbs first (darker = further away), then body, then near limbs.
  drawArm(pose.arms[1], shade(colors.skin, 0.7));
  drawLeg(pose.legs[1], shade(colors.skin, 0.7));

  ctx.strokeStyle = colors.shorts;
  ctx.lineWidth = lw * 1.9;
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(lerp(hip.x, neck.x, 0.25), lerp(hip.y, neck.y, 0.25));
  ctx.stroke();
  ctx.strokeStyle = colors.shirt;
  ctx.beginPath();
  ctx.moveTo(lerp(hip.x, neck.x, 0.22), lerp(hip.y, neck.y, 0.22));
  ctx.lineTo(neck.x, neck.y);
  ctx.stroke();

  drawLeg(pose.legs[0], colors.skin);
  drawArm(pose.arms[0], colors.skin);

  // Head sits along the torso line, just past the neck.
  const hx = neck.x + Math.sin(pose.lean) * HEAD * 1.3;
  const hy = neck.y - Math.cos(pose.lean) * HEAD * 1.3;
  ctx.fillStyle = colors.skin;
  ctx.beginPath();
  ctx.arc(hx, hy, HEAD, 0, Math.PI * 2);
  ctx.fill();
  // Headband in shirt color: the character's signature detail.
  ctx.strokeStyle = colors.shirt;
  ctx.lineWidth = Math.max(1.5, HEAD * 0.45);
  ctx.beginPath();
  ctx.arc(hx, hy, HEAD * 0.92, Math.PI * 1.05 + pose.lean, Math.PI * 1.95 + pose.lean);
  ctx.stroke();

  ctx.restore();
  return { headX: hx, headY: hy - HEAD };
}
