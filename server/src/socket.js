import { verifyToken } from './auth.js';
import { MIN_PROTOCOL } from '../../src/meet/protocol.js';

const MAX_MESSAGE = 96 * 1024; // bytes
const RATE = 80; // messages a second, at most (frames go 10 a second; late hits a few more)

/**
 * Takes a WebSocket upgrade for a Durable Object and runs the handshake
 * (src/meet/protocol.js): the first message must be `hello` with a Firebase ID
 * token, checked before anything else is listened to. Then `ping` is answered
 * here, for the phone's clock, and everything else goes to `handlers`:
 *
 *   onPeer(peer, hello) -> true (welcome) / false (denied)   peer = { uid, name, dev, send(msg), close() }
 *   onMessage(peer, msg)
 *   onClose(peer)
 */
export function acceptSocket(request, env, handlers) {
  if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  let peer = null;
  let checking = false;
  const early = []; // messages that came in while the hello was being checked
  let open = true;
  let window = { at: Date.now(), n: 0 };
  const send = (msg) => {
    if (!open) return;
    try {
      server.send(JSON.stringify(msg));
    } catch {
      open = false;
    }
  };
  const close = (code = 1000, why = '') => {
    if (!open) return;
    open = false;
    try {
      server.close(code, why);
    } catch {}
  };

  server.addEventListener('message', async (e) => {
    if (typeof e.data !== 'string' || e.data.length > MAX_MESSAGE) return;
    const now = Date.now();
    if (now - window.at > 1000) window = { at: now, n: 0 };
    if (++window.n > RATE) return; // too chatty: dropped
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'ping') return send({ t: 'pong', c: msg.c, now: Date.now() });
    if (peer) return handlers.onMessage(peer, msg);
    if (checking) return early.length < 20 && early.push(msg);
    if (msg.t !== 'hello') return;
    checking = true;
    if (!(msg.v >= MIN_PROTOCOL)) {
      send({ t: 'reload' });
      return close(4000, 'old');
    }
    const who = await verifyToken(msg.token, env);
    if (!who) {
      send({ t: 'denied', why: 'auth' });
      return close(4001, 'auth');
    }
    // What the handlers send before the welcome waits for it, so the welcome always comes first.
    const held = [];
    const p = { uid: who.uid, name: who.name ?? null, dev: !!who.dev, send: (m) => (peer ? send(m) : held.push(m)), close: () => close() };
    let ok = false;
    try {
      ok = await handlers.onPeer(p, msg);
    } catch (err) {
      console.error('onPeer', err);
    }
    if (!ok) {
      send({ t: 'denied', why: 'not-here' });
      return close(4003, 'not here');
    }
    peer = p;
    if (!open) return handlers.onClose(peer); // the phone went while it was being let in
    send({ t: 'welcome', uid: p.uid, now: Date.now() });
    for (const m of held) send(m);
    for (const m of early.splice(0)) handlers.onMessage(peer, m);
  });
  const closed = () => {
    open = false;
    if (peer) handlers.onClose(peer);
  };
  server.addEventListener('close', closed);
  server.addEventListener('error', closed);
  return new Response(null, { status: 101, webSocket: client });
}
