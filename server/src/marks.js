import { CONFIG } from '../../src/config.js';
import { GHOST_VERSION, MAX_EVENTS, replayMark } from '../../src/online/ghost.js';

/**
 * MARKS ON THE ONLINE BOARDS, as the server takes them (api.js POST /api/mark;
 * it alone writes leaderboards/ and ghosts/). A phone says "I ran this"; here
 * is where that's looked at before it goes on a board. How hard it's looked at
 * depends on the board:
 *
 * - every board: a mark shaped right (to the hundredth, or whole points) and
 *   inside what's possible (LIMITS: a good way past the simulator's perfect
 *   player, tools/simulate.mjs, so nobody honest is ever turned away);
 * - the 100m: REPLAYED. Its recording is the run's inputs (src/online/
 *   ghost.js), so the server runs them through the game's own physics, with
 *   its own numbers, and takes the time that comes out. The inputs have to be
 *   ones a phone could have produced (checkRun);
 * - the other events: their recording is a picture of the attempt, frame by
 *   frame (src/online/trace.js), which can't be re-run: it's checked for shape
 *   and size only. (To check one properly its event has to be recorded as
 *   inputs first.)
 *
 * The limits are the server's alone: change them here.
 */
export const BOARDS = {
  sprint100: { lower: true, kind: 'replay', unit: 's', min: 7.9, max: 60 },
  hurdles110: { lower: true, kind: 'trace', unit: 's', min: 10.6, max: 120 },
  longjump: { lower: false, kind: 'trace', unit: 'm', min: 0.01, max: 11.6 },
  polevault: { lower: false, kind: 'trace', unit: 'm', min: 0.01, max: 7.3 },
  javelin: { lower: false, kind: 'trace', unit: 'm', min: 0.01, max: 112 },
  tournament: { lower: false, kind: 'points', unit: 'pts', min: 1, max: 7200 },
  survival: { lower: false, kind: 'points', unit: 'pts', min: 1, max: 1000000 },
};
const TRACE_MAX = 200000; // characters of frames
const TAPS_PER_S = 10; // strides a second over a whole 100m: nobody's thumbs
const LATE = 0.3; // s an input's own time can be before the step it landed in (a phone delivers them late)

/** A refused mark: `code` says why ('bad-board', 'bad-mark', 'implausible', 'bad-ghost', 'replay'). */
export class MarkError extends Error {
  constructor(code, detail = code) {
    super(detail);
    this.code = code;
  }
}

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
/** A mark as it's kept (src/events/registry.js roundMark): to the hundredth, or whole points. */
export const roundMark = (board, v) => (board.unit === 'pts' ? Math.round(v) : Math.round(v * 100) / 100);

/** True if mark `a` beats mark `b` on `board`. */
export const beats = (board, a, b) => (board.lower ? a < b : a > b);

/**
 * A 100m recording's inputs, as a phone could have made them: in order, each
 * stride inside (or a little before) the physics step it landed in, no stumble that
 * speeds you up, and not more taps than thumbs manage. Throws MarkError('bad-ghost').
 */
export function checkRun(g) {
  const bad = (why) => new MarkError('bad-ghost', why);
  if (!g || typeof g !== 'object' || g.v !== GHOST_VERSION) throw bad('version');
  const step = CONFIG.loop.fixedStep;
  if (!finite(g.off) || g.off > 0 || g.off < -step) throw bad('off');
  const ev = g.ev;
  if (!Array.isArray(ev) || ev.length % 4 !== 0 || ev.length > MAX_EVENTS * 4 || !ev.every(finite)) throw bad('events');
  let lastN = 0;
  let strides = 0;
  let lastT = -Infinity;
  for (let i = 0; i < ev.length; i += 4) {
    const [n, t, code, value] = ev.slice(i, i + 4);
    if (!Number.isInteger(n) || n < lastN) throw bad('order');
    lastN = n;
    if (code === 0) {
      // A stride carries its own time, which sets your rhythm: it has to be when it says it was.
      const from = g.off + n * step;
      if (t > from + step + 1e-6 || t < from - LATE) throw bad('timing');
      if (t < lastT) throw bad('stride order');
      lastT = t;
      strides++;
    } else if (code === 1) {
      if (value < 0) throw bad('stumble');
    } else if (code !== 2) throw bad('code');
  }
  return strides;
}

/**
 * The time a 100m recording really comes to: its inputs through the game's
 * physics as the server has them (never the numbers the phone sent along).
 * Resolves to { mark, ghost }: the time, and the recording as kept. Throws
 * MarkError('bad-ghost') for inputs no phone made, or a run that never finishes.
 */
export function replayRun(g) {
  const strides = checkRun(g);
  const cfg = CONFIG.sprint100;
  const ghost = {
    v: GHOST_VERSION,
    mark: 0,
    off: g.off,
    step: CONFIG.loop.fixedStep,
    distance: cfg.distance,
    startX: cfg.startX,
    prompt: cfg.dipPromptDistance ?? CONFIG.dip.promptDistance,
    athlete: null,
    runner: { ...CONFIG.runner },
    dip: { ...CONFIG.dip },
    ev: [...g.ev],
  };
  const time = replayMark(ghost);
  if (time == null) throw new MarkError('bad-ghost', 'never finishes');
  if (strides > TAPS_PER_S * time + 2) throw new MarkError('bad-ghost', 'taps');
  ghost.mark = roundMark(BOARDS.sprint100, time);
  return { mark: ghost.mark, ghost };
}

/** A frame-by-frame recording as uploaded (trace.js toWire), checked for shape and size: the recording as kept. */
function checkTrace(id, mark, g) {
  const bad = (why) => new MarkError('bad-ghost', why);
  if (!g || typeof g !== 'object' || g.v !== 1 || g.kind !== 'trace' || g.ev !== id) throw bad('trace');
  if (g.mark !== mark) throw bad('trace mark');
  if (!Number.isInteger(g.props) || g.props < 0 || g.props > 32) throw bad('props');
  if (typeof g.f !== 'string' || !g.f.length || g.f.length > TRACE_MAX || !/^[0-9eE+.,-]+$/.test(g.f)) throw bad('frames');
  return { v: 1, kind: 'trace', ev: id, mark, athlete: null, props: g.props, f: g.f };
}

/**
 * A mark a phone wants on board `id`, looked at: { board, mark, ghost, traced }
 * as it would be kept (`ghost`: the 100m's replayed run, or another event's
 * recording; null with none). Throws MarkError.
 */
export function checkMark(id, mark, ghost = null) {
  const board = Object.hasOwn(BOARDS, id) ? BOARDS[id] : null;
  if (!board) throw new MarkError('bad-board', String(id));
  if (!finite(mark) || roundMark(board, mark) !== mark) throw new MarkError('bad-mark', String(mark));
  if (mark < board.min || mark > board.max) throw new MarkError('implausible', `${id} ${mark}`);
  if (board.kind === 'replay') {
    const run = replayRun(ghost);
    if (run.mark !== mark) throw new MarkError('replay', `${mark} claimed, ${run.mark} run`);
    return { board, mark, ghost: run.ghost, traced: false };
  }
  if (board.kind === 'trace' && ghost) return { board, mark, ghost: checkTrace(id, mark, ghost), traced: true };
  return { board, mark, ghost: null, traced: false };
}
