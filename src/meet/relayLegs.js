/**
 * Who runs which leg of a squad's 4x100m relay in a meet (docs/meets.md).
 *
 * The squad's athletes still there are shuffled into legs 1 to 4. With fewer
 * than four, someone runs again, picked at random, but never two legs in a
 * row (that would be passing the baton to yourself across the exchange):
 *
 *   4 there   one leg each
 *   3         one of them runs two legs that aren't next to each other
 *   2         they take turns: A B A B
 *   1         all four (the relay as it plays on one phone)
 *   0         the squad doesn't start
 *
 * @param uids  the squad's athletes still connected
 * @param rand  () => [0, 1), for tests
 * @returns [uid, uid, uid, uid] (leg 1 first), or null for nobody
 */
export function assignLegs(uids, rand = Math.random) {
  const pool = shuffle([...new Set(uids)], rand).slice(0, 4);
  if (!pool.length) return null;
  if (pool.length === 4) return pool;
  if (pool.length === 1) return [pool[0], pool[0], pool[0], pool[0]];
  if (pool.length === 2) return [pool[0], pool[1], pool[0], pool[1]];
  // Three: the first runs twice, on two legs that aren't next to each other.
  const [twice, a, b] = pool;
  const pairs = [
    [0, 2],
    [1, 3],
    [0, 3],
  ];
  const [p, q] = pairs[Math.floor(rand() * pairs.length) % pairs.length];
  const legs = [null, null, null, null];
  legs[p] = legs[q] = twice;
  const rest = [a, b];
  for (let i = 0; i < 4; i++) if (legs[i] == null) legs[i] = rest.shift();
  return legs;
}

/** True if nobody in `legs` runs two in a row (unless one athlete runs all four). */
export function legsValid(legs) {
  if (!legs || legs.length !== 4) return false;
  if (new Set(legs).size === 1) return true;
  return legs.every((u, i) => i === 0 || legs[i - 1] !== u);
}

function shuffle(a, rand) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
