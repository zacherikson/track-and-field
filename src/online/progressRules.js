/**
 * YOUR PROGRESS's rules (online/progress.js): pure, shared by the game and the
 * meet server, which keeps your account's copy (server/src/api.js POST
 * /api/progress).
 *
 * Progress is { beaten, top, lineup, character, lineupAt }:
 *   beaten    { [level]: { [event id | 'tournament']: true } }  what you've beaten in each campaign
 *   top       { [board id]: [{ mark, at, who, where }] }        your best TOP_N marks per board, best first
 *   character your athlete; lineup: the old per-event one (kept as it was); lineupAt: when either last changed
 *
 * Two copies merge so nothing is lost: everything either has beaten, both
 * copies' marks (the best TOP_N kept), and the athlete changed last.
 */
export const TOP_N = 5; // (core/storage.js keeps the same number)
const LEVELS = ['highschool', 'amateur', 'pro']; // 'amateur' is Collegiate (its old name, kept where it's saved)
const EVENTS = ['sprint100', 'hurdles110', 'longjump', 'polevault', 'javelin'];
const BEATABLE = [...EVENTS, 'tournament'];
// Boards where a bigger mark is better; everywhere else (the races) a smaller one is.
const HIGHER = new Set(['longjump', 'polevault', 'javelin', 'tournament', 'teamtournament', 'survival']);
const BOARD_ID = /^[a-z0-9]{1,24}$/;
const MAX_BOARDS = 30;

export const lowerIsBetter = (id) => !HIGHER.has(id);

const keys = (...objs) => [...new Set(objs.flatMap((o) => Object.keys(o ?? {})))];
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

/**
 * Progress as kept, whatever was read: anything malformed dropped.
 * `strict` (the server, for what a phone sends): only the campaigns and events
 * there are, board ids that look like ones, and sizes held down.
 */
export function clean(d, strict = false) {
  const beaten = {};
  for (const [level, ids] of Object.entries(isObj(d?.beaten) ? d.beaten : {})) {
    if (!isObj(ids) || (strict && !LEVELS.includes(level))) continue;
    beaten[level] = Object.fromEntries(
      Object.keys(ids)
        .filter((id) => ids[id] === true && (!strict || BEATABLE.includes(id)))
        .map((id) => [id, true]),
    );
  }
  const top = {};
  for (const [id, list] of Object.entries(isObj(d?.top) ? d.top : {})) {
    if (!Array.isArray(list) || (strict && (!BOARD_ID.test(id) || Object.keys(top).length >= MAX_BOARDS))) continue;
    top[id] = list
      .filter((e) => isObj(e) && Number.isFinite(e.mark))
      .map((e) => ({ mark: e.mark, at: Number.isFinite(e.at) ? e.at : null, who: typeof e.who === 'string' ? e.who.slice(0, 32) : null, where: typeof e.where === 'string' ? e.where.slice(0, 16) : null }))
      .slice(0, TOP_N);
  }
  const lineup = {};
  for (const [ev, id] of Object.entries(isObj(d?.lineup) ? d.lineup : {})) {
    if (strict && (!BOARD_ID.test(ev) || Object.keys(lineup).length >= MAX_BOARDS)) continue;
    if (id === null || typeof id === 'string') lineup[ev] = typeof id === 'string' ? id.slice(0, 32) : null;
  }
  return { beaten, top, lineup, character: typeof d?.character === 'string' ? d.character.slice(0, 32) : null, lineupAt: Number.isFinite(d?.lineupAt) ? d.lineupAt : 0 };
}

/** `a` and `b` merged (see the top of this file); `b` may be null (nothing saved yet). */
export function merge(a, b) {
  if (!b) return a;
  const beaten = {};
  for (const level of keys(a.beaten, b.beaten)) {
    beaten[level] = {};
    for (const id of keys(a.beaten[level], b.beaten[level])) if (a.beaten[level]?.[id] || b.beaten[level]?.[id]) beaten[level][id] = true;
  }
  const top = {};
  for (const id of keys(a.top, b.top)) top[id] = mergeTop(a.top[id], b.top[id], lowerIsBetter(id));
  // The lineup changed last wins; a tie goes to `b` (the account: a new phone's untouched lineup mustn't replace it).
  const lineup = (b.lineupAt ?? 0) >= (a.lineupAt ?? 0) ? b : a;
  return { beaten, top, lineup: lineup.lineup, character: lineup.character, lineupAt: lineup.lineupAt };
}

/** Two top lists as one: every mark either has (once), best first, TOP_N kept. */
function mergeTop(x = [], y = [], lower = true) {
  const seen = new Set();
  const all = [];
  for (const e of [...x, ...y]) {
    const k = `${e.mark}|${e.at}`;
    if (seen.has(k)) continue;
    seen.add(k);
    all.push(e);
  }
  // A best with no details (from before the list was kept) goes once the same mark turns up with them.
  const detailed = new Set(all.filter((e) => e.at != null).map((e) => e.mark));
  return all
    .filter((e) => e.at != null || !detailed.has(e.mark))
    .sort((p, q) => (lower ? p.mark - q.mark : q.mark - p.mark))
    .slice(0, TOP_N);
}

/** Same progress (key order aside). */
export function same(a, b) {
  return canon(a) === canon(b);
}

function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${k}:${canon(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
