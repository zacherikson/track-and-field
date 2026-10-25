import { rest, fields } from './firebase.js';

/**
 * WORLD RECORDS are the best mark on each event's global leaderboard (online/
 * firebase.js), not fixed numbers: whoever tops a board holds its record.
 *
 * The phone keeps the last ones it saw, so the game shows them at once and
 * offline. syncWorldRecords() reads every board's top mark when you're at the
 * menu; a board read (the Leaderboard screen) or a post that goes to #1 brings
 * one up to date in between.
 *
 * A board that's never been read on this phone has no record yet (shown as
 * "—", and nothing can beat it); an empty board has none either, but then any
 * mark that goes on it is one.
 *
 * Special events (registry.js SPECIAL_EVENTS) aren't on the boards, so theirs
 * stays the target set in the registry.
 */

const KEY = 'trackroyale.records';
const SYNC_EVERY = 60_000; // ms: menu visits closer together than this share one read

/** Board id -> its top mark, or null for a board known to be empty. No key: never read. */
const records = load();
let lastSync = -Infinity;

function load() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY));
    return r && typeof r === 'object' ? r : {};
  } catch {
    return {};
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    /* ignore */
  }
}

const beats = (ev, a, b) => (ev.lowerIsBetter ? a < b : a > b);

/** The event's world record, or null if there isn't one (yet). */
export function worldRecord(ev) {
  if (!ev.online) return ev.record ?? null;
  return records[ev.id] ?? null;
}

/** True if `mark` would be a new world record: it beats the record, or the board is empty. */
export function isWorldRecord(ev, mark) {
  if (mark == null || !Number.isFinite(mark)) return false;
  if (!ev.online) return ev.record != null && beats(ev, mark, ev.record);
  if (!(ev.id in records)) return false; // never read: can't tell
  const wr = records[ev.id];
  return wr == null || beats(ev, mark, wr);
}

/** The board's top mark as just read from it (null: the board is empty). */
export function setWorldRecord(board, mark) {
  if (board.points) return; // point totals: no world record
  const value = mark == null || !Number.isFinite(mark) ? null : mark;
  if (records[board.id] === value && board.id in records) return;
  records[board.id] = value;
  save();
}

/** A mark that just went on the board at #1. */
export function noteTopMark(board, mark) {
  if (board.points || mark == null) return;
  const wr = records[board.id];
  if (wr == null || beats(board, mark, wr)) setWorldRecord(board, mark);
}

/** One board's top mark, from Firestore (null if it has none). */
async function topMark(board) {
  const res = await rest(`leaderboards/${board.id}:runQuery`, {
    structuredQuery: {
      from: [{ collectionId: 'runs' }],
      orderBy: [{ field: { fieldPath: 'mark' }, direction: board.lowerIsBetter ? 'ASCENDING' : 'DESCENDING' }],
      limit: 1,
      select: { fields: [{ fieldPath: 'mark' }] },
    },
  });
  const doc = (res ?? []).find((r) => r.document)?.document;
  return doc ? fields(doc.fields).mark ?? null : null;
}

/**
 * Reads the top mark of each event board in `events` (registry.js EVENTS).
 * Boards are public, so guests get them too. A board that can't be read keeps
 * what this phone had. Resolves true if any record changed.
 */
export async function syncWorldRecords(events) {
  if (performance.now() - lastSync < SYNC_EVERY) return false;
  lastSync = performance.now();
  const boards = events.filter((e) => e.online && !e.points);
  const tops = await Promise.allSettled(boards.map(topMark));
  let changed = false;
  tops.forEach((t, i) => {
    if (t.status !== 'fulfilled') return;
    const id = boards[i].id;
    if (id in records && records[id] === t.value) return;
    setWorldRecord(boards[i], t.value);
    changed = true;
  });
  if (tops.every((t) => t.status === 'rejected')) lastSync = -Infinity; // offline: try again next time
  return changed;
}
