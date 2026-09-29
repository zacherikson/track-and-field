import { getPlayerName } from '../core/storage.js';

/**
 * ONLINE LEADERBOARD (Firebase: Firestore + anonymous sign-in).
 *
 * Firestore layout:
 *   users/{uid}                       = { name, key, updatedAt }  your profile
 *   usernames/{key}                   = { uid }  claims a name (key = lowercased), so names are unique
 *   leaderboards/{boardId}/runs/{uid} = { name, mark, ghost?, v, createdAt }
 * One doc per player per board, holding their best mark (a time, a distance or
 * tournament points), for the 100m its recorded run (the ghost others can
 * race), and a copy of their name so the board is one query. A board is an
 * event from registry.js or TOURNAMENT_BOARD: { id, lowerIsBetter }.
 * firestore.rules says who may write what.
 *
 * The Firebase SDK is loaded from Google's CDN the first time something online
 * is needed (the game has no build step, and the SDK is big). Everything here is
 * async and may fail (offline, blocked): the game carries on without it.
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
    return { fs, db: fs.getFirestore(fbApp), uid: user.uid };
  })();
  connecting.catch(() => {
    connecting = null; // try again next time
  });
  return connecting;
}

const DOC_VERSION = 1;

const runs = (fs, db, boardId) => fs.collection(db, 'leaderboards', boardId, 'runs');

/** True if mark `a` beats mark `b` on this board. */
const beats = (board, a, b) => (board.lowerIsBetter ? a < b : a > b);

/** Your place on the board for a mark (1 = best). */
async function rankOf(fs, db, board, mark) {
  const better = fs.where('mark', board.lowerIsBetter ? '<' : '>', mark);
  const n = await fs.getCountFromServer(fs.query(runs(fs, db, board.id), better));
  return n.data().count + 1;
}

/**
 * Posts a mark (with `ghost`, the recorded 100m run, when there is one) if it
 * beats your mark on the board. Resolves to { improved, best, rank }.
 */
export async function submitMark(board, mark, ghost = null) {
  const { fs, db, uid } = await connect();
  const ref = fs.doc(runs(fs, db, board.id), uid);
  const prev = await fs.getDoc(ref);
  const prevMark = prev.exists() ? prev.data().mark : null;
  if (prevMark != null && !beats(board, mark, prevMark)) return { improved: false, best: prevMark, rank: await rankOf(fs, db, board, prevMark) };
  const doc = { name: getPlayerName(), mark, v: DOC_VERSION, createdAt: fs.serverTimestamp() };
  if (ghost) doc.ghost = ghost;
  await fs.setDoc(ref, doc);
  return { improved: true, best: mark, rank: await rankOf(fs, db, board, mark) };
}

/**
 * The best `n` marks, plus yours if it isn't among them.
 * Resolves to { top: [{ uid, name, mark, ghost, me, rank }], mine }.
 */
export async function leaderboard(board, n = 10) {
  const { fs, db, uid } = await connect();
  const snap = await fs.getDocs(fs.query(runs(fs, db, board.id), fs.orderBy('mark', board.lowerIsBetter ? 'asc' : 'desc'), fs.limit(n)));
  const top = snap.docs.map((d, i) => ({ uid: d.id, ...d.data(), me: d.id === uid, rank: i + 1 }));
  let mine = top.find((r) => r.me) ?? null;
  if (!mine) {
    const own = await fs.getDoc(fs.doc(runs(fs, db, board.id), uid));
    if (own.exists()) mine = { uid, ...own.data(), me: true, rank: await rankOf(fs, db, board, own.data().mark) };
  }
  return { top, mine };
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
}
