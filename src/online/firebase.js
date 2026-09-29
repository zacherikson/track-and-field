import { getPlayerName } from '../core/storage.js';
import { toWire, fromWire } from './trace.js';

/**
 * ONLINE LEADERBOARD (Firebase: Firestore + anonymous sign-in).
 *
 * Firestore layout:
 *   users/{uid}                       = { name, key, updatedAt }  your profile
 *   usernames/{key}                   = { uid }  claims a name (key = lowercased), so names are unique
 *   leaderboards/{boardId}/runs/{uid} = { name, mark, ghost?, traced?, v, createdAt }
 *   ghosts/{boardId}/runs/{uid}       = { mark, ghost, v, createdAt }
 * One doc per player per board, holding their best mark (a time, a distance or
 * tournament points) and a copy of their name, so the board is one query. The
 * 100m doc carries its recorded run (the ghost others can race: small). Other
 * events' recordings are frame by frame (online/trace.js) and much bigger, so
 * they sit in ghosts/, fetched only to race one; `traced: true` says there is
 * one for this mark. A board is an event from registry.js or TOURNAMENT_BOARD:
 * { id, lowerIsBetter }.
 * firestore.rules says who may write what.
 *
 * The Firebase SDK is loaded from Google's CDN the first time something is
 * written (the game has no build step, and the SDK is big). Reading a board
 * doesn't wait for it: boards are public, so they're read with plain fetch()
 * calls to Firestore's REST API (see REST below), which show up in about one
 * round trip instead of after the SDK download, sign-in and connection setup.
 * Everything here is async and may fail (offline, blocked): the game carries
 * on without it.
 *
 * The config below is not a secret: Firebase web config is meant to ship in the
 * page. The security rules are what protect the data.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyBvP-mPNzGf1JrYa3ti9D1X2ppcFaf4j9Q',
  authDomain: 'track-royale-f18ad.firebaseapp.com',
  projectId: 'track-royale-f18ad',
  storageBucket: 'track-royale-f18ad.firebasestorage.app',
  messagingSenderId: '701591973322',
  appId: '1:701591973322:web:d44061828fb08aff243333',
};

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0';

let connecting = null;

/** Loads the SDK and signs in (anonymously, once per phone). Resolves to { fs, db, uid }. */
function connect() {
  connecting ??= (async () => {
    const [app, auth, fs] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    const fbApp = app.initializeApp(firebaseConfig);
    const a = auth.getAuth(fbApp);
    await a.authStateReady(); // a returning player is still signed in from last time
    const user = a.currentUser ?? (await auth.signInAnonymously(a)).user;
    rememberUid(user.uid);
    return { fs, db: fs.getFirestore(fbApp), uid: user.uid };
  })();
  connecting.catch(() => {
    connecting = null; // try again next time
  });
  return connecting;
}

// This phone's player id, remembered so a board can mark your row without
// loading the SDK first.
const UID_KEY = 'trackroyale.uid';

function rememberUid(uid) {
  try {
    localStorage.setItem(UID_KEY, uid);
  } catch {}
}

function knownUid() {
  try {
    return localStorage.getItem(UID_KEY);
  } catch {
    return null;
  }
}

/**
 * Signs in if this phone's player id isn't remembered yet (a player from
 * before it was). Resolves true once it is known, false if it already was.
 */
export async function learnUid() {
  if (knownUid()) return false;
  await connect();
  return true;
}

const DOC_VERSION = 1;

const runs = (fs, db, boardId) => fs.collection(db, 'leaderboards', boardId, 'runs');
const ghostRuns = (fs, db, boardId) => fs.collection(db, 'ghosts', boardId, 'runs');

/** True if mark `a` beats mark `b` on this board. */
const beats = (board, a, b) => (board.lowerIsBetter ? a < b : a > b);

/** Your place on the board for a mark (1 = best). */
async function rankOf(fs, db, board, mark) {
  const better = fs.where('mark', board.lowerIsBetter ? '<' : '>', mark);
  const n = await fs.getCountFromServer(fs.query(runs(fs, db, board.id), better));
  return n.data().count + 1;
}

/**
 * Posts a mark (with `ghost`, its recording, when there is one) if it beats
 * your mark on the board. Resolves to { improved, best, rank, lost }, where
 * `lost` says why a recording didn't go up with the mark (the mark still did).
 */
export async function submitMark(board, mark, ghost = null) {
  const { fs, db, uid } = await connect();
  const ref = fs.doc(runs(fs, db, board.id), uid);
  const prev = await fs.getDoc(ref);
  const prevMark = prev.exists() ? prev.data().mark : null;
  if (prevMark != null && !beats(board, mark, prevMark)) return { improved: false, best: prevMark, rank: await rankOf(fs, db, board, prevMark) };
  const doc = { name: getPlayerName(), mark, v: DOC_VERSION, createdAt: fs.serverTimestamp() };
  let lost = null;
  if (ghost?.kind === 'trace') {
    // The mark and its recording land together. If the recording can't go up,
    // the mark still does, on its own.
    try {
      const batch = fs.writeBatch(db);
      batch.set(ref, { ...doc, traced: true });
      batch.set(fs.doc(ghostRuns(fs, db, board.id), uid), { mark, ghost: toWire(ghost), v: DOC_VERSION, createdAt: fs.serverTimestamp() });
      await batch.commit();
    } catch (err) {
      console.warn('recording not uploaded', err);
      lost = err?.code ?? err?.message ?? 'error';
      await fs.setDoc(ref, doc);
    }
  } else {
    if (ghost) doc.ghost = ghost;
    await fs.setDoc(ref, doc);
  }
  boards.delete(board.id); // your row changed
  return { improved: true, best: mark, rank: await rankOf(fs, db, board, mark), lost };
}

// ---------------------------------------------------------------- REST reads

const REST = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

async function rest(path, body = null) {
  const res = await fetch(`${REST}/${path}${path.includes('?') ? '&' : '?'}key=${firebaseConfig.apiKey}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`firestore ${res.status}`);
  return res.json();
}

/** A REST value ({ doubleValue: 8.9 }, { mapValue: { fields } }, ...) as plain JS. */
function plain(v) {
  if (v == null) return null;
  if ('mapValue' in v) return fields(v.mapValue.fields);
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(plain);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  return null;
}

function fields(f = {}) {
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, plain(v)]));
}

const docId = (doc) => doc.name.slice(doc.name.lastIndexOf('/') + 1);

/** Your place on the board for a mark (1 = best), by counting the better ones. */
async function restRank(board, mark) {
  const res = await rest(`leaderboards/${board.id}:runAggregationQuery`, {
    structuredAggregationQuery: {
      structuredQuery: {
        from: [{ collectionId: 'runs' }],
        where: { fieldFilter: { field: { fieldPath: 'mark' }, op: board.lowerIsBetter ? 'LESS_THAN' : 'GREATER_THAN', value: { doubleValue: mark } } },
      },
      aggregations: [{ alias: 'n', count: {} }],
    },
  });
  return Number(res?.[0]?.result?.aggregateFields?.n?.integerValue ?? 0) + 1;
}

// The last load of each board this session, so switching tabs back is instant.
const boards = new Map();

/** The board as last loaded this session (see leaderboard), or null. */
export function cachedLeaderboard(board) {
  return boards.get(board.id) ?? null;
}

/**
 * The best `n` marks, plus yours if it isn't among them.
 * Resolves to { top: [{ uid, name, mark, ghost, traced, me, rank }], mine }.
 * The top list and your own entry are fetched together; your place is only
 * counted when you're not in the top list.
 */
export async function leaderboard(board, n = 10) {
  const uid = knownUid();
  const [list, own] = await Promise.all([
    rest(`leaderboards/${board.id}:runQuery`, {
      structuredQuery: {
        from: [{ collectionId: 'runs' }],
        orderBy: [{ field: { fieldPath: 'mark' }, direction: board.lowerIsBetter ? 'ASCENDING' : 'DESCENDING' }],
        limit: n,
      },
    }),
    uid ? rest(`leaderboards/${board.id}/runs/${uid}`) : null,
  ]);
  const top = (list ?? []).filter((r) => r.document).map((r, i) => ({ uid: docId(r.document), ...fields(r.document.fields), me: docId(r.document) === uid, rank: i + 1 }));
  let mine = top.find((r) => r.me) ?? null;
  if (!mine && own?.fields) {
    const d = fields(own.fields);
    mine = { uid, ...d, me: true, rank: await restRank(board, d.mark) };
  }
  const result = { top, mine };
  boards.set(board.id, result);
  return result;
}

/** A player's recording for their mark on a board (a leaderboard row with `traced`), or null. */
export async function fetchGhost(board, row) {
  const doc = await rest(`ghosts/${board.id}/runs/${row.uid}`);
  const d = doc?.fields ? fields(doc.fields) : null;
  return d && d.mark === row.mark ? fromWire(d.ghost) : null;
}

/** Changes your name on your existing board entries. */
async function renameOnBoard(eventId, name) {
  const { fs, db, uid } = await connect();
  const ref = fs.doc(runs(fs, db, eventId), uid);
  if ((await fs.getDoc(ref)).exists()) await fs.updateDoc(ref, { name });
}

// Every board (registry.js BOARDS ids; firestore.rules lists the same).
const ONLINE_EVENTS = ['sprint100', 'longjump', 'hurdles110', 'polevault', 'javelin', 'tournament'];

/** The key a name is claimed under: names are unique regardless of case. */
export const nameKey = (name) => name.toLowerCase();

/**
 * Saves `name` as your username: claims it in usernames/ (failing with
 * Error('taken') if someone else has it), frees your old one, updates your
 * profile, then renames your leaderboard entries. One transaction, so two
 * players can't grab the same name at once.
 */
export async function setUsername(name) {
  const { fs, db, uid } = await connect();
  const key = nameKey(name);
  const userRef = fs.doc(db, 'users', uid);
  const claimRef = fs.doc(db, 'usernames', key);
  await fs.runTransaction(db, async (tx) => {
    const user = await tx.get(userRef);
    const claim = await tx.get(claimRef);
    if (claim.exists() && claim.data().uid !== uid) throw new Error('taken');
    const oldKey = user.exists() ? user.data().key : null;
    tx.set(claimRef, { uid });
    if (oldKey && oldKey !== key) tx.delete(fs.doc(db, 'usernames', oldKey));
    tx.set(userRef, { name, key, updatedAt: fs.serverTimestamp() });
  });
  for (const eventId of ONLINE_EVENTS) await renameOnBoard(eventId, name);
  boards.clear(); // your name changed on them
}
