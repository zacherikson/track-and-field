import { getPlayerName, setPlayerName } from '../core/storage.js';
import { toWire, fromWire } from './trace.js';

/**
 * ONLINE LEADERBOARD (Firebase: Firestore + anonymous or Google sign-in).
 *
 * Every player has an id: a guest's is anonymous (this phone only), and
 * signing in with Google keeps it (startGoogleSignIn). Only signed-in players
 * go on the leaderboards; guests keep their bests on the phone until they sign
 * in (online/bests.js postBests).
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
 * one for this mark. A board is an event from registry.js or one of TOURNAMENT_BOARDS:
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
  databaseURL: 'https://track-royale-f18ad-default-rtdb.firebaseio.com', // Realtime Database: live races (live.js)
};

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0';

let connecting = null;

/**
 * Loads the SDK and signs in. Resolves to { app, fs, db, uid, auth, A } (A = the
 * auth module). A new player is signed in anonymously: a player id for this
 * phone only, until they sign in with Google (startGoogleSignIn), which keeps
 * the same id and so everything that hangs off it (username, board entries,
 * ghosts). A returning player is still signed in, either way.
 */
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
    rememberSignedIn(!user.isAnonymous);
    return { app: fbApp, fs, db: fs.getFirestore(fbApp), uid: user.uid, auth: a, A: auth };
  })();
  connecting.catch(() => {
    connecting = null; // try again next time
  });
  return connecting;
}

/** The Firebase app and your sign-in ({ app, fs, db, uid, auth, A }), for the other online modules (live.js). */
export const connectSDK = () => connect();

/** Where the Firebase SDK's modules load from (`${SDK_URL}/firebase-database.js`, ...). */
export const SDK_URL = SDK;

// This phone's player id, remembered so a board can mark your row without
// loading the SDK first.
const UID_KEY = 'trackroyale.uid';

function rememberUid(uid) {
  try {
    localStorage.setItem(UID_KEY, uid);
  } catch {}
}

const SIGNED_IN_KEY = 'trackroyale.signedin';

/**
 * True if this phone's player is signed in (with Google), not a guest. Known
 * without loading the SDK: remembered at every sign-in and sign-out. Only
 * signed-in players go on the leaderboards (firestore.rules checks it too).
 */
export function isSignedIn() {
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberSignedIn(yes) {
  try {
    if (yes) localStorage.setItem(SIGNED_IN_KEY, '1');
    else localStorage.removeItem(SIGNED_IN_KEY);
  } catch {}
}

function forgetUid() {
  try {
    localStorage.removeItem(UID_KEY);
  } catch {}
}

/**
 * Your account: { guest: true } while you play as this phone's anonymous
 * player, else { guest: false, via: 'Google', email }. Loads the SDK.
 */
export async function accountInfo() {
  const { auth: a } = await connect();
  const u = a.currentUser;
  if (!u || u.isAnonymous) return { guest: true };
  return { guest: false, via: u.providerData?.some((p) => p.providerId === 'google.com') ? 'Google' : 'email', email: u.email ?? null };
}

// Google's sign-in page for this game: the OAuth client Firebase made for its
// Google sign-in (Google Cloud console > APIs & Services > Credentials, "Web
// client (auto created by Google Service)"). Its Authorized redirect URIs must
// list the game's address (https://zacherikson.github.io/track-and-field/, and
// http://localhost:8123/ to test locally), or Google refuses to send you back.
const GOOGLE_CLIENT_ID = '701591973322-kg3qfuvl7jd8ob2jpffram7dglrp76dc.apps.googleusercontent.com';
const PENDING_KEY = 'trackroyale.signin';

/** Where Google sends you back to: this page, without index.html. */
const returnUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');

const randomHex = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Signs in with Google: goes to Google's sign-in page, which comes back to
 * this page with the result (finishGoogleSignIn picks it up). The whole page
 * goes, not a popup: a popup can't hand the result back to the game when it
 * runs from the home screen (iPhone).
 */
export function startGoogleSignIn() {
  const pending = { state: randomHex(), nonce: randomHex() };
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  const q = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: returnUrl(),
    response_type: 'id_token',
    scope: 'openid email profile',
    prompt: 'select_account',
    state: pending.state,
    nonce: pending.nonce,
  });
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
}

/** A JWT's claims (unchecked: Firebase checks the signature when it signs in with it). */
function claimsOf(jwt) {
  try {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')));
  } catch {
    return null;
  }
}

const fail = (code) => Promise.reject(Object.assign(new Error(code), { code }));

/**
 * Call once as the page loads. Null unless we've just come back from Google's
 * sign-in page (startGoogleSignIn); then a promise of the sign-in, and the
 * address is tidied up.
 *
 * A Google account that hasn't played yet becomes this phone's player: same
 * id, so your name, bests and board entries all stay. One that has (you signed
 * in on another phone first) takes over instead: this phone plays as that
 * player from now on, and what this phone did as a guest stays behind.
 * Resolves to { switched }: true means the page should reload (after posting
 * this phone's bests to that player, if you like), so everything starts again
 * as them.
 */
export function finishGoogleSignIn() {
  const back = new URLSearchParams(location.hash.slice(1));
  if (!back.has('id_token') && !back.has('error')) return null;
  history.replaceState(null, '', location.pathname + location.search);
  let pending = null;
  try {
    pending = JSON.parse(localStorage.getItem(PENDING_KEY));
    localStorage.removeItem(PENDING_KEY);
  } catch {}
  if (!pending || back.get('state') !== pending.state) return fail('auth/state-mismatch');
  if (back.has('error')) return fail(back.get('error') === 'access_denied' ? 'auth/user-cancelled' : `auth/${back.get('error')}`);
  const idToken = back.get('id_token');
  const claims = claimsOf(idToken);
  if (claims?.nonce !== pending.nonce || claims?.aud !== GOOGLE_CLIENT_ID) return fail('auth/state-mismatch');
  return linkGoogle(idToken);
}

/** Makes this phone's player the Google account's (see finishGoogleSignIn). */
async function linkGoogle(idToken) {
  const c = await connect();
  const { auth: a, A, fs, db } = c;
  const cred = A.GoogleAuthProvider.credential(idToken);
  try {
    await A.linkWithCredential(a.currentUser, cred);
    rememberSignedIn(true);
    return { switched: false };
  } catch (err) {
    if (err?.code !== 'auth/credential-already-in-use') throw err;
  }
  const { user } = await A.signInWithCredential(a, cred);
  rememberUid(user.uid);
  rememberSignedIn(true);
  c.uid = user.uid;
  // That player's name, from their profile (a player who never picked one gets a new made-up name).
  const profile = await fs.getDoc(fs.doc(db, 'users', user.uid)).catch(() => null);
  setPlayerName(profile?.exists() ? profile.data().name : null);
  return { switched: true };
}

/**
 * Signs out: this phone goes back to a new guest player (with a new made-up
 * name) the next time the page loads, which the caller should do now.
 */
export async function signOut() {
  const { auth: a, A } = await connect();
  await A.signOut(a);
  forgetUid();
  rememberSignedIn(false);
  setPlayerName(null);
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
  const { fs, db, uid, auth: a } = await connect();
  if (a.currentUser?.isAnonymous !== false) throw Object.assign(new Error('guest'), { code: 'guest' });
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
  const res = await fetch(`${REST}${path.startsWith(':') ? '' : '/'}${path}${path.includes('?') ? '&' : '?'}key=${firebaseConfig.apiKey}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
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

/**
 * Your entry on each board, in one request: a Map of board id -> { mark, ghost?, traced? },
 * or null where you have none. Null overall if this phone has no player id yet.
 */
export async function myEntries(boardIds) {
  const uid = knownUid();
  if (!uid) return null;
  const base = REST.slice(REST.indexOf('projects/'));
  const res = await rest(':batchGet', { documents: boardIds.map((id) => `${base}/leaderboards/${id}/runs/${uid}`) });
  const out = new Map(boardIds.map((id) => [id, null]));
  for (const r of res ?? []) {
    if (!r.found) continue;
    const id = r.found.name.split('/').at(-3);
    out.set(id, { uid, ...fields(r.found.fields) });
  }
  return out;
}

/** A player's recording for their mark on a board (a leaderboard row with `traced`), or null. */
export async function fetchGhost(board, row) {
  const doc = await rest(`ghosts/${board.id}/runs/${row.uid}`);
  const d = doc?.fields ? fields(doc.fields) : null;
  return d && d.mark === row.mark ? fromWire(d.ghost) : null;
}

/**
 * Changes your name on your existing board entries: every board read at once,
 * then a write per board, all at once too. Boards stand on their own, so one
 * that can't be read or written doesn't hold up the others; resolves to false
 * if any of them didn't go through. A board still showing an old name catches
 * up the next time you post a mark there (submitMark writes your name with it).
 */
async function renameOnBoards(name) {
  const { fs, db, uid } = await connect();
  const refs = ONLINE_EVENTS.map((eventId) => fs.doc(runs(fs, db, eventId), uid));
  const reads = await Promise.allSettled(refs.map((ref) => fs.getDoc(ref)));
  const writes = [];
  reads.forEach((read, i) => {
    if (read.status === 'fulfilled' && read.value.exists()) writes.push(fs.updateDoc(refs[i], { name }));
  });
  const failed = [...reads, ...(await Promise.allSettled(writes))].filter((r) => r.status === 'rejected');
  if (failed.length) console.warn('name not changed on every board', failed[0].reason);
  return failed.length === 0;
}

// Every board (registry.js BOARDS ids; firestore.rules lists the same).
const ONLINE_EVENTS = ['sprint100', 'longjump', 'hurdles110', 'polevault', 'javelin', 'tournament', 'teamtournament'];

/** The key a name is claimed under: names are unique regardless of case. */
export const nameKey = (name) => name.toLowerCase();

/**
 * Saves `name` as your username: claims it in usernames/ (failing with
 * Error('taken') if someone else has it), frees your old one and updates your
 * profile. One transaction, so two players can't grab the same name at once.
 *
 * Renaming your leaderboard entries comes after, and can't fail the change:
 * the name is yours once the transaction commits. Resolves to true if those
 * entries were renamed too, false if they (or some of them) have to catch up.
 */
export async function setUsername(name) {
  const { fs, db, uid } = await connect();
  const key = nameKey(name);
  const userRef = fs.doc(db, 'users', uid);
  const claimRef = fs.doc(db, 'usernames', key);
  await fs.runTransaction(db, async (tx) => {
    const [user, claim] = await Promise.all([tx.get(userRef), tx.get(claimRef)]);
    if (claim.exists() && claim.data().uid !== uid) throw new Error('taken');
    const oldKey = user.exists() ? user.data().key : null;
    tx.set(claimRef, { uid });
    if (oldKey && oldKey !== key) tx.delete(fs.doc(db, 'usernames', oldKey));
    tx.set(userRef, { name, key, updatedAt: fs.serverTimestamp() });
  });
  const renamed = await renameOnBoards(name).catch(() => false);
  boards.clear(); // your name changed on them
  return renamed;
}
