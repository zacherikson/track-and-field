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

const THIGH_L = 0.25; // limb lengths in figure heights (must match drawFigure)
const SHIN_L = 0.25;
const FOOT_L = 0.06;

/**
 * Starting blocks, in figure heights relative to the athlete's feet origin (the
 * start position). Each foot's toes touch the track at the base of a footplate
 * inclined `plateAngle` (rad above the ground, rising backwards); the sole lies
 * on the plate. Front plate about 0.45 m and rear about 0.8 m behind the hands.
 */
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
  // ...then the front leg back into the front block, rear foot already placed.
  kickFront: {
    hipX: -0.15, hipY: -0.27, lean: 1.25,
    legs: [{ thigh: -1.2, shin: -1.45, toe: 0.3 }, blockLegs(-0.15, -0.27)[1]],
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
 * Running pose from a stride phase (radians) and intensity amp (0..1, grows with
 * speed). Modelled on the original's run cycle: each foot lands close under the
 * hips, sweeps back along the track, then the heel folds up toward the backside
 * and the knee drives forward and high before the foot paws down again. The
 * legs are solved with IK from that foot path, so the knee bends naturally and
 * the planted foot never sinks into the track. The hips bob: lowest with a foot
 * planted, highest in the airborne split between steps.
 *
 * `drive` (0..1) is the out-of-the-blocks drive phase: body pitched forward and
 * low, feet landing further back.
 */
export function runPose(phase, amp, drive = 0) {
  const a = amp;
  const stance = 0.42 - 0.12 * a; // fraction of the cycle each foot is on the track
  const reach = 0.55 + 0.45 * a; // longer foot travel at speed
  const lift = 0.35 + 0.65 * a; // higher heel kick and knee drive at speed
  const touchX = (0.07 - 0.07 * drive) * reach; // ankle lands just ahead of the hips
  const pushX = -(0.14 + 0.1 * a) * reach; // ...and pushes off behind them
  const kneeU = stance + (4 / 6) * (1 - stance); // point of the cycle where the knee is furthest forward

  // Hip height: lowest mid-stance, highest mid-flight, twice per cycle.
  const u0 = frac(phase / (2 * Math.PI) + kneeU - 0.25);
  const bob = (0.012 + 0.018 * a) * (1 - 0.5 * drive);
  const hipY = -0.485 + 0.07 * drive + bob * Math.cos(4 * Math.PI * (u0 - stance / 2));

  const legs = [0, 1].map((i) => {
    const u = frac(u0 + i * 0.5);
    let ax, h, toe;
    if (u < stance) {
      // On the track: foot rolls from flat to up on the toes as it pushes off.
      const k = u / stance;
      ax = lerp(touchX, pushX, k);
      toe = 0.9 * smoothstep(0.45, 1, k);
      h = FOOT_L * Math.sin(toe); // heel lifts, toes stay on the track
    } else {
      const w = (u - stance) / (1 - stance);
      const x = [pushX + 0.05, pushX, -0.2 * reach, -0.1 * reach, 0.1 * reach, 0.19 * reach, touchX + 0.03, touchX, touchX - 0.05];
      const y = [0, FOOT_L * Math.sin(0.9), 0.13 * lift, 0.27 * lift, 0.28 * lift, 0.17 * lift, 0.05 * lift, 0, 0];
      ax = catmull(x, w);
      h = Math.max(0, catmull(y, w));
      toe = piecewise([0.9, 0.4, 0.3, 0.1, -0.15, 0], w);
    }
    return { ...legIK(0, hipY, ax, -h), toe };
  });

  const arms = [0, 1].map((i) => {
    // Arms swing opposite to the legs: this arm is furthest back when this
    // leg's knee is furthest forward.
    const q = 2 * Math.PI * (u0 + i * 0.5 - kneeU) + Math.PI / 2;
    const back = Math.max(0, Math.sin(q)); // 1 at the end of the backswing
    // Swing biased backwards: at full speed the elbow drives far behind the body
    // (upper arm about 75° back) and the hand comes up to chin height in front.
    const upper = 0.05 - a * (0.25 + 1.05 * Math.sin(q));
    // Elbow held near 90° at any speed (about 100° jogging, 94° sprinting),
    // opening a little at the back of the swing.
    return { upper, fore: upper + 1.3 + 0.2 * a - 0.35 * a * back };
  });

  return { hipX: 0, hipY, lean: 0.06 + 0.22 * a + 0.75 * drive, legs, arms };
}

const frac = (x) => x - Math.floor(x);
const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
/** Linear interpolation through evenly spaced values over t in [0, 1]. */
function piecewise(v, t) {
  const f = t * (v.length - 1);
  const i = Math.min(v.length - 2, Math.floor(f));
  return lerp(v[i], v[i + 1], f - i);
}
/**
 * Catmull-Rom spline through evenly spaced points over t in [0, 1]. The first
 * and last entries are only tangent guides (the curve runs from v[1] to v[n-2]).
 */
function catmull(v, t) {
  const n = v.length - 3;
  const f = t * n;
  const i = Math.min(n - 1, Math.floor(f));
  const s = f - i;
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

/**
 * Draw a figure with feet at (x, y) in logical pixels.
 * @param H figure height in pixels
 * @param colors { shirt, skin, shorts }
 */
export function drawFigure(ctx, x, y, H, pose, colors) {
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

  // Ground shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 0.2 * H, 0.04 * H, 0, 0, Math.PI * 2);
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
