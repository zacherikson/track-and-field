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
  // "On your marks / Ready": back knee on the ground, hands on the line.
  blocks: {
    hipX: -0.14, hipY: -0.27, lean: 1.2,
    legs: [{ thigh: 1.35, shin: -0.25 }, { thigh: 0.35, shin: -1.4 }],
    arms: [{ upper: 0.05, fore: 0.05 }, { upper: -0.02, fore: -0.02 }],
  },
  // "Get set": hips raised a little above the shoulders, weight forward on the hands.
  set: {
    hipX: -0.12, hipY: -0.41, lean: 1.68,
    legs: [{ thigh: 0.9, shin: -0.35 }, { thigh: 0.35, shin: -0.75 }],
    arms: [{ upper: -0.08, fore: -0.08 }, { upper: -0.12, fore: -0.12 }],
  },
};

/** Running pose from a stride phase (radians) and intensity amp (0..1, grows with speed). */
export function runPose(phase, amp) {
  const legs = [0, 1].map((i) => {
    const q = phase + i * Math.PI;
    const thigh = 0.12 + 0.78 * amp * Math.sin(q);
    // Knee folds most while the leg swings forward (cos q > 0), straight-ish in stance.
    const fold = 0.15 + 1.7 * amp * Math.pow(Math.max(0, Math.cos(q)), 1.3);
    return { thigh, shin: thigh - fold };
  });
  const arms = [0, 1].map((i) => {
    const q = phase + i * Math.PI;
    const upper = -0.85 * amp * Math.sin(q) + 0.05;
    return { upper, fore: upper + 0.4 + 1.1 * amp };
  });
  return {
    hipX: 0,
    hipY: -0.49 + 0.025 * amp * Math.cos(2 * phase),
    lean: 0.06 + 0.22 * amp,
    legs,
    arms,
  };
}

const lerp = (a, b, t) => a + (b - a) * t;

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
    legs: a.legs.map((l, i) => ({ thigh: lerp(l.thigh, b.legs[i].thigh, t), shin: lerp(l.shin, b.legs[i].shin, t) })),
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
    // Little forward-pointing foot so direction reads at a glance.
    ctx.lineTo(foot.x + 0.06 * H, foot.y);
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
