/**
 * The meet server's wire protocol (server/), shared by the game and the server.
 * JSON over a WebSocket, every message { t: type, ... }.
 *
 * The first message on a socket is `hello` { token, v, build }: your Firebase ID
 * token, PROTOCOL and the game's build. The server answers `welcome`
 * { uid, now } or `reload` (your build is too old: reload the page) or
 * `denied` { why }. After that either side can `ping` { c } / `pong` { c, now }
 * for the clock (online/net.js).
 *
 * During play each player has a DOC on the server, the same shape as a live
 * room's in the Realtime Database (online/live.js): you send `patch` { p } with
 * { path: value } updates (null deletes), the server keeps the doc and passes
 * the patch on to the players you can see (your heat) as `doc` { u, p }.
 * applyPatch() is how both sides apply one.
 */
export const PROTOCOL = 1; // bump on any change the other side has to know about
export const MIN_PROTOCOL = 1; // the oldest the server still talks to (Pages caches for ~10 minutes)

const MAX_DEPTH = 4;

/**
 * Applies `patch` ({ 'a/b': value }) to `doc` in place: a path's parents are
 * made as needed, null (or undefined) deletes. Returns `doc`.
 */
export function applyPatch(doc, patch) {
  for (const [path, value] of Object.entries(patch ?? {})) {
    const parts = path.split('/').filter(Boolean);
    if (!parts.length || parts.length > MAX_DEPTH || parts.some(badKey)) continue;
    let node = doc;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (node[k] == null || typeof node[k] !== 'object') {
        if (value == null) {
          node = null;
          break;
        }
        node[k] = {};
      }
      node = node[k];
    }
    if (!node) continue;
    const last = parts[parts.length - 1];
    if (value == null) delete node[last];
    else node[last] = value;
  }
  return doc;
}

/** Keys that could reach an object's prototype: never applied. */
function badKey(k) {
  return k === '__proto__' || k === 'constructor' || k === 'prototype';
}
