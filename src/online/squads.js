import { connectSDK, knownUid, rest, fields, docId, nameKey } from './firebase.js';
import { cleanName } from '../core/storage.js';

/**
 * SQUADS: you and your friends in a named group (like a clan). For now a squad
 * is a name and a member list: anyone can start one or join one that has room,
 * and you're in one squad at a time.
 *
 * Firestore layout (firestore.rules says who may write what):
 *   squads/{key}         = { name, key, leader, size, members: { [uid]: { name, at } }, createdAt, v }
 *   squadmembers/{uid}   = { squad: key }   which squad you're in (at most one)
 * `key` is the name lowercased, so no two squads share a name. `size` is the
 * number of members (kept so squads can be listed biggest first). `leader`
 * started the squad and can kick members out; when they leave, whoever has
 * been in it longest takes over, and the last one out closes it. A member's `name` is their username
 * (users/{uid}), so you need one before joining (Profile).
 *
 * An invite is a link to the game with the squad (and who sent it) in it
 * (inviteLink); opening it shows the invite screen (scenes/inviteScreen.js),
 * and the squad is offered on the Squad tab until you join one.
 *
 * Joining, leaving and starting a squad are transactions over both docs, so
 * they always agree. Reads are public and go through the REST API like the
 * leaderboards (no SDK download just to look), and the SDK is fetched as the
 * Squad tab opens (firebase.js prewarmSDK) rather than when a button waits on
 * it. A change doesn't read the squad back afterwards: the transaction read it
 * and the commit matches what it read, so the new member list is worked out
 * here, saving two round trips on a phone.
 */

export const SQUAD_MAX = 30; // firestore.rules has the same cap

const DOC_VERSION = 1;

const err = (code) => Object.assign(new Error(code), { code });

/** A squad as the game uses it: { key, name, leader, size, members: [{ uid, name, at, me, leader }] }, longest-standing first. */
function squadOf(key, d) {
  const uid = knownUid();
  const ms = (t) => (typeof t === 'number' ? t : typeof t === 'string' ? Date.parse(t) : (t?.toMillis?.() ?? 0)) || 0;
  const members = Object.entries(d.members ?? {})
    .map(([id, m]) => ({ uid: id, name: m?.name ?? '?', at: ms(m?.at), me: id === uid, leader: id === d.leader }))
    .sort((a, b) => a.at - b.at || a.name.localeCompare(b.name));
  return { key, name: d.name ?? key, leader: d.leader, size: members.length, members };
}

const path = (...parts) => parts.map(encodeURIComponent).join('/');

/** `squad` with `uid` taken off its member list, or null if that was the last member. */
function without(squad, uid) {
  const members = (squad?.members ?? []).filter((m) => m.uid !== uid);
  return members.length ? { ...squad, members, size: members.length } : null;
}

// Your squad as last loaded this session (undefined: not yet), so the Squad tab shows at once.
let mine;

/** Your squad as last loaded (null: none), or undefined if it hasn't been loaded yet. */
export const cachedSquad = () => mine;

/** Your squad, fresh from the server, or null if you're not in one. */
export async function loadMySquad() {
  const uid = knownUid();
  if (!uid) return (mine = null); // never been online: can't be in a squad
  const link = await rest(path('squadmembers', uid));
  const key = link?.fields ? fields(link.fields).squad : null;
  if (!key) return (mine = null);
  const doc = await rest(path('squads', key));
  const squad = doc?.fields ? squadOf(key, fields(doc.fields)) : null;
  if (squad?.members.some((m) => m.me)) return (mine = squad);
  forgetStaleLink(uid, key);
  return (mine = null);
}

/**
 * Your squadmembers link says a squad that no longer has you (you were kicked
 * out, and the leader's phone didn't clear it): clear it, so you can join
 * another. Nothing waits for it; if it doesn't go through, it's tried again.
 */
function forgetStaleLink(uid, key) {
  connectSDK()
    .then(async ({ fs, db }) => {
      const ref = fs.doc(db, 'squadmembers', uid);
      const link = await fs.getDoc(ref);
      if (link.exists() && link.data().squad === key) await fs.deleteDoc(ref);
    })
    .catch((e) => console.warn('old squad link not cleared', e));
}

/** Squad rows from a REST query: [{ key, name, size }]. */
const rows = (res) =>
  (res ?? [])
    .filter((r) => r.document)
    .map((r) => {
      const d = fields(r.document.fields);
      return { key: docId(r.document), name: d.name, size: Object.keys(d.members ?? {}).length };
    });

/** The biggest squads (up to `n`): [{ key, name, size }]. */
export async function topSquads(n = 20) {
  return rows(
    await rest(':runQuery', {
      structuredQuery: { from: [{ collectionId: 'squads' }], orderBy: [{ field: { fieldPath: 'size' }, direction: 'DESCENDING' }], limit: n },
    }),
  );
}

/** Squads whose name starts with `typed` (any case): [{ key, name, size }]. */
export async function searchSquads(typed, n = 20) {
  const q = nameKey(typed);
  const at = (op, v) => ({ fieldFilter: { field: { fieldPath: 'key' }, op, value: { stringValue: v } } });
  return rows(
    await rest(':runQuery', {
      structuredQuery: {
        from: [{ collectionId: 'squads' }],
        where: { compositeFilter: { op: 'AND', filters: [at('GREATER_THAN_OR_EQUAL', q), at('LESS_THAN', q + '')] } },
        orderBy: [{ field: { fieldPath: 'key' }, direction: 'ASCENDING' }],
        limit: n,
      },
    }),
  );
}

/**
 * Reads what joining or starting a squad needs, in a transaction: your
 * username (Error 'no-name' if you haven't picked one) and that you're not in
 * a squad already (Error 'in-squad').
 */
async function readMe(tx, fs, db, uid) {
  const [user, link] = await Promise.all([tx.get(fs.doc(db, 'users', uid)), tx.get(fs.doc(db, 'squadmembers', uid))]);
  if (!user.exists()) throw err('no-name');
  if (link.exists()) throw err('in-squad');
  return user.data().name;
}

/** Starts a squad called `name` (already cleaned up: storage.js cleanName), with you as its leader. Error 'taken' if the name is. */
export async function createSquad(name) {
  const { fs, db, uid } = await connectSDK();
  const key = nameKey(name);
  const ref = fs.doc(db, 'squads', key);
  let started = null;
  await fs.runTransaction(db, async (tx) => {
    // Who you are, that you're free to start one, and whether the name is taken: one round trip.
    const [myName, taken] = await Promise.all([readMe(tx, fs, db, uid), tx.get(ref)]);
    if (taken.exists()) throw err('taken');
    tx.set(ref, {
      name,
      key,
      leader: uid,
      size: 1,
      members: { [uid]: { name: myName, at: fs.serverTimestamp() } },
      createdAt: fs.serverTimestamp(),
      v: DOC_VERSION,
    });
    tx.set(fs.doc(db, 'squadmembers', uid), { squad: key });
    started = squadOf(key, { name, key, leader: uid, members: { [uid]: { name: myName, at: Date.now() } } });
  });
  return (mine = started);
}

/** Joins the squad with this key. Errors: 'gone' (it closed), 'full'. */
export async function joinSquad(key) {
  const { fs, db, uid } = await connectSDK();
  const ref = fs.doc(db, 'squads', key);
  let joined = null;
  await fs.runTransaction(db, async (tx) => {
    // Who you are, that you're free to join, and the squad itself: one round trip.
    const [myName, squad] = await Promise.all([readMe(tx, fs, db, uid), tx.get(ref)]);
    if (!squad.exists()) throw err('gone');
    const d = squad.data();
    const members = d.members ?? {};
    const size = Object.keys(members).length;
    if (size >= SQUAD_MAX) throw err('full');
    tx.update(ref, new fs.FieldPath('members', uid), { name: myName, at: fs.serverTimestamp() }, 'size', size + 1);
    tx.set(fs.doc(db, 'squadmembers', uid), { squad: key });
    joined = squadOf(key, { ...d, members: { ...members, [uid]: { name: myName, at: Date.now() } } });
  });
  return (mine = joined);
}

/** Leaves your squad (passing on the lead if it was yours, closing it if you were the last one). */
export async function leaveSquad() {
  const { fs, db, uid } = await connectSDK();
  const linkRef = fs.doc(db, 'squadmembers', uid);
  await fs.runTransaction(db, async (tx) => {
    const link = await tx.get(linkRef);
    if (!link.exists()) return;
    const ref = fs.doc(db, 'squads', link.data().squad);
    const squad = await tx.get(ref);
    const d = squad.exists() ? squad.data() : null;
    if (d?.members?.[uid]) {
      const others = squadOf(squad.id, d).members.filter((m) => m.uid !== uid);
      if (!others.length) tx.delete(ref);
      else {
        const lead = d.leader === uid ? ['leader', others[0].uid] : [];
        tx.update(ref, new fs.FieldPath('members', uid), fs.deleteField(), 'size', others.length, ...lead);
      }
    }
    tx.delete(linkRef);
  });
  mine = null;
  return null;
}

/**
 * The leader only: takes a member out of your squad. Error 'not-leader' if
 * you're not its leader (any more).
 *
 * The squad's own doc says who leads it, so this doesn't look up which squad
 * you're in first: it goes straight at the one you're looking at.
 */
export async function kickFromSquad(memberUid) {
  const { fs, db, uid } = await connectSDK();
  const key = mine?.key;
  if (!key) throw err('not-leader');
  const ref = fs.doc(db, 'squads', key);
  const theirRef = fs.doc(db, 'squadmembers', memberUid);
  await fs.runTransaction(db, async (tx) => {
    const [squad, theirs] = await Promise.all([tx.get(ref), tx.get(theirRef)]);
    const d = squad.exists() ? squad.data() : null;
    if (d?.leader !== uid) throw err('not-leader');
    if (!d.members?.[memberUid]) return; // gone already
    tx.update(ref, new fs.FieldPath('members', memberUid), fs.deleteField(), 'size', Object.keys(d.members).length - 1);
    if (theirs.exists() && theirs.data().squad === key) tx.delete(theirRef);
  });
  return (mine = without(mine, memberUid));
}

/** After a username change: your name in your squad's member list too (if you're in one). */
export async function renameInSquad(name) {
  const { fs, db, uid } = await connectSDK();
  const link = await fs.getDoc(fs.doc(db, 'squadmembers', uid));
  if (!link.exists()) return;
  await fs.updateDoc(fs.doc(db, 'squads', link.data().squad), new fs.FieldPath('members', uid, 'name'), name);
  if (mine) mine = { ...mine, members: mine.members.map((m) => (m.me ? { ...m, name } : m)) };
}

// ------------------------------------------------------------------ invites

const INVITE_KEY = 'trackroyale.invite';

/** The game's address with an invite to `squad` from `from` (your name) in it: ?squad=key&from=name. */
export function inviteLink(squad, from) {
  const q = new URLSearchParams({ squad: squad.key });
  if (from) q.set('from', from);
  return `${location.origin}${location.pathname.replace(/index\.html$/, '')}?${q}`;
}

/**
 * Call once as the page loads. If it was opened from an invite link, keeps the
 * invite (until you join a squad or turn it down, so it survives closing the
 * game first), tidies the address and returns { key, from } (`from`: who sent
 * it, as the link says, or null). Null if it wasn't.
 */
export function takeInviteLink() {
  const q = new URLSearchParams(location.search);
  const key = q.get('squad');
  if (!key) return null;
  const from = cleanName(q.get('from')) || null;
  q.delete('squad');
  q.delete('from');
  history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : '') + location.hash);
  const invite = { key: nameKey(key.slice(0, 16)), from };
  setInvite(invite.key);
  return invite;
}

/** The squad you've been invited to (its key), or null. */
export function getInvite() {
  try {
    return localStorage.getItem(INVITE_KEY);
  } catch {
    return null;
  }
}

/** Remembers an invite (a squad key), or with null forgets it. */
export function setInvite(key) {
  try {
    if (key) localStorage.setItem(INVITE_KEY, key);
    else localStorage.removeItem(INVITE_KEY);
  } catch {}
}

/** A squad with its members (as loadMySquad gives yours), or null if there's no squad with this key. */
export async function loadSquad(key) {
  const doc = await rest(path('squads', key));
  return doc?.fields ? squadOf(key, fields(doc.fields)) : null;
}

/** A squad's row ({ key, name, size }), or null if there's no squad with this key. */
export async function squadInfo(key) {
  const s = await loadSquad(key);
  return s && { key, name: s.name, size: s.size };
}
