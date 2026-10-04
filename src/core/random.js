/**
 * SAME BUTTONS FOR EVERYONE in live play: the 100m's targets, the hurdles'
 * button sets and the field events' run-up targets come from a random-number
 * function seeded with something every phone in the room already knows (the
 * room or meet, and the stage), so everybody gets the same sequence and nothing
 * extra goes over the network. A target only changes on a hit and a button set
 * only at a hurdle, so target 12 (or hurdle 4's set) is the same for everyone
 * whatever their timing. Off line it's Math.random, as before.
 */

/** A string's 32-bit hash (FNV-1a). */
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Like Math.random, but the same sequence on every phone for the same `seed` (mulberry32). */
export function seededRandom(seed) {
  let a = hashString(String(seed));
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The random numbers for `what` (the buttons of one kind) in `stage` of the
 * room or meet being played (`live`: online/live.js LiveSession or
 * meetSession.js): the same on every phone in it. Math.random off line.
 * Each use gets its own seed, so nothing else random can shift it.
 */
export function liveRandom(live, stage, what) {
  return live && stage != null ? seededRandom(`${live.seedOf(stage)}/${what}`) : Math.random;
}
