import { hasAdmin, setDocs } from './firestoreAdmin.js';

/**
 * THE AUDIT TRAIL: a note in the database (audit/, which only the server can
 * read or write) each time the server turns down something a phone claimed:
 * a mark for the boards that isn't possible or doesn't replay (api.js), a
 * live result that came too soon (roomCore.js). So there's something to look
 * at when a board or a payout looks wrong: who, what, why, when
 * (tools/audit.mjs lists them).
 *
 * A note is { uid, kind, why, detail, at }: `kind` 'mark' | 'live-result',
 * `why` the reason's code, `detail` a short line. Its id starts with the time,
 * so they list in order. Writing one never holds anything up or fails
 * anything: if it can't be written it's only logged.
 */
const short = (v, n) => String(v ?? '').slice(0, n);

/** Notes that `uid`'s `kind` was refused. `deps` (tests): { set, now }. */
export async function audit(env, { uid, kind, why, detail = '' }, deps = {}) {
  if (!deps.set && !hasAdmin(env)) return;
  const now = deps.now?.() ?? Date.now();
  const id = `${String(now).padStart(14, '0')}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    await (deps.set ?? setDocs)(env, [{ path: `audit/${id}`, data: { uid: short(uid, 128), kind: short(kind, 24), why: short(why, 32), detail: short(detail, 200) }, stamp: 'at' }]);
  } catch (e) {
    console.warn('audit', kind, why, e?.message);
  }
}
