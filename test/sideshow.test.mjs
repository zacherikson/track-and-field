// The home screens' sideshow (src/scenes/home/sideshow.js, skits.js): every skit plays start to finish. Run: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKITS, Stage } from '../src/scenes/home/sideshow.js';
import { CHARACTERS, REFEREE } from '../src/athletes/roster.js';

/** A 2D context that draws nothing (and measures every string 10 px wide). */
const ctx = new Proxy({}, {
  get: (o, k) => (k in o ? o[k] : k === 'measureText' ? () => ({ width: 10 }) : () => {}),
  set: (o, k, v) => ((o[k] = v), true),
});

const LONGEST = 24; // sideshow.js cuts a skit off here: none should need it

for (const [id, skit] of Object.entries(SKITS)) {
  test(`${id}: plays through and finishes, both ways round, on a narrow and a wide screen`, () => {
    let i = 0;
    const cast = skit.cast.map((r) => (r === 'ref' ? REFEREE : CHARACTERS[i++]));
    for (const m of [1, -1]) {
      for (const [w, x, H] of [[700, 140, 60], [1200, 960, 50]]) {
        let end = null;
        for (let t = 0; t <= LONGEST && end == null; t += 1 / 30) {
          if (!skit.draw(new Stage(ctx, { x, ground: 400, H }, m, w), t, cast)) end = t;
        }
        assert.ok(end != null, `${id} still going after ${LONGEST} s (m ${m}, w ${w})`);
        assert.ok(end > 2, `${id} over after only ${end.toFixed(2)} s`);
      }
    }
  });
}

test('skits only ask for athletes and the referee', () => {
  for (const [id, { cast }] of Object.entries(SKITS)) {
    assert.ok(cast.every((r) => r === 'athlete' || r === 'ref'), id);
    assert.ok(cast.filter((r) => r === 'athlete').length <= CHARACTERS.length - 1, `${id}: more athletes than there are (less yours)`);
  }
});
