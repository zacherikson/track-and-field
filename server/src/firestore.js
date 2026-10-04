/**
 * Reads from the game's Firestore (squads are public: firestore.rules), over
 * its REST API, so the server can check that you're in the squad you say.
 */
const doc = (project, path) => `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${path}`;

/** A Firestore REST value as plain JS. */
function plain(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, plain(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(plain);
  return null;
}

/** Squad `key`: { key, name, members: { uid: name } }, or null if there's no such squad. */
export async function loadSquad(env, key, fetcher = fetch) {
  const res = await fetcher(doc(env.FIREBASE_PROJECT, `squads/${encodeURIComponent(key)}`));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`firestore ${res.status}`);
  const d = plain({ mapValue: { fields: (await res.json()).fields ?? {} } });
  const members = Object.fromEntries(Object.entries(d.members ?? {}).map(([uid, m]) => [uid, String(m?.name ?? '?').slice(0, 16)]));
  return { key, name: String(d.name ?? key).slice(0, 16), members };
}
