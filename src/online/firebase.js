import { getPlayerName } from '../core/storage.js';
import { GHOST_VERSION } from './ghost.js';

/**
 * ONLINE LEADERBOARD (Firebase: Firestore + anonymous sign-in).
 *
 * Firestore layout, one collection per event:
 *   leaderboards/{eventId}/runs/{uid} = { name, mark, ghost, v, createdAt }
 * One doc per player per event, holding their best time and its recorded run
 * (the ghost others can race). firestore.rules says who may write what.
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

const runs = (fs, db, eventId) => fs.collection(db, 'leaderboards', eventId, 'runs');

/** Your place on the board for a time of `mark` (1 = fastest). */
async function rankOf(fs, db, eventId, mark) {
  const faster = await fs.getCountFromServer(fs.query(runs(fs, db, eventId), fs.where('mark', '<', mark)));
  return faster.data().count + 1;
}

/**
 * Posts a finished run if it beats your time on the board.
 * Resolves to { improved, best, rank }.
 */
export async function submitRun(eventId, run) {
  const { fs, db, uid } = await connect();
  const ref = fs.doc(runs(fs, db, eventId), uid);
  const prev = await fs.getDoc(ref);
  const prevMark = prev.exists() ? prev.data().mark : null;
  if (prevMark != null && prevMark <= run.mark) return { improved: false, best: prevMark, rank: await rankOf(fs, db, eventId, prevMark) };
  await fs.setDoc(ref, { name: getPlayerName(), mark: run.mark, ghost: run, v: GHOST_VERSION, createdAt: fs.serverTimestamp() });
  return { improved: true, best: run.mark, rank: await rankOf(fs, db, eventId, run.mark) };
}

/**
 * The fastest `n` runs, plus yours if it isn't among them.
 * Resolves to { top: [{ uid, name, mark, ghost, me, rank }], mine }.
 */
export async function leaderboard(eventId, n = 10) {
  const { fs, db, uid } = await connect();
  const snap = await fs.getDocs(fs.query(runs(fs, db, eventId), fs.orderBy('mark'), fs.limit(n)));
  const top = snap.docs.map((d, i) => ({ uid: d.id, ...d.data(), me: d.id === uid, rank: i + 1 }));
  let mine = top.find((r) => r.me) ?? null;
  if (!mine) {
    const own = await fs.getDoc(fs.doc(runs(fs, db, eventId), uid));
    if (own.exists()) mine = { uid, ...own.data(), me: true, rank: await rankOf(fs, db, eventId, own.data().mark) };
  }
  return { top, mine };
}

/** Changes your name on your existing board entries. */
export async function renameOnBoard(eventId, name) {
  const { fs, db, uid } = await connect();
  const ref = fs.doc(runs(fs, db, eventId), uid);
  if ((await fs.getDoc(ref)).exists()) await fs.updateDoc(ref, { name });
}
