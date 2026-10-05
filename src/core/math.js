export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** A random number in [lo, hi): from `rng` if given (core/random.js seededRandom: the same on every phone), else Math.random. */
export const rand = (lo, hi, rng = Math.random) => lo + rng() * (hi - lo);

/**
 * Frame-rate independent smoothing ("exponential damping").
 * `a = lerp(a, b, 0.1)` every frame converges faster at 120fps than at 60fps.
 * This version converges at the same real-time rate regardless of dt:
 * `sharpness` ~= how many "e-foldings" per second (higher = snappier).
 */
export const damp = (a, b, sharpness, dt) => lerp(a, b, 1 - Math.exp(-sharpness * dt));

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
