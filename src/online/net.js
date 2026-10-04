import { connectSDK } from './firebase.js';
import { PROTOCOL } from '../meet/protocol.js';

/**
 * THE MEET SERVER CONNECTION (server/, docs/meets.md): a WebSocket to the
 * Cloudflare Worker that runs squad meets.
 *
 * MEET_SERVER is where it's deployed (`npx wrangler deploy` in server/ prints
 * it). Empty: meets aren't open, and the Meet button says so. Testing with the
 * game served locally, `?meetserver=ws://localhost:8787` in the page's address
 * uses another one (remembered; `?meetserver=` with nothing forgets it),
 * `?devuid=<uid>:<name>` signs in as a test player (server/ `npm run dev`
 * only), and `?meetlag=150` holds every message 150 ms each way.
 *
 * A Conn says hello with your Firebase ID token (online/firebase.js), keeps
 * the server's clock (a few pings when it connects, then every 10 s, keeping
 * the quickest reply), holds messages while it's (re)connecting, and
 * reconnects by itself after a drop, a second or two later and then less
 * often, until it's closed.
 */
export const MEET_SERVER = '';

const SERVER_KEY = 'trackroyale.meetserver';
const BUILD = '1';

/**
 * True when the game itself is served from this computer (testing): only then
 * do the address's test switches count, so a link can't send your sign-in to
 * some other server.
 */
const LOCAL = (() => {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  } catch {
    return false;
  }
})();

/** A test switch from the page's address (`?name=`), only when the game runs locally. */
function testParam(name) {
  if (!LOCAL) return null;
  try {
    return new URLSearchParams(location.search).get(name);
  } catch {
    return null;
  }
}

/** The server to use, or '' if meets aren't open. */
export function meetServer() {
  if (!LOCAL) return MEET_SERVER;
  try {
    const q = testParam('meetserver');
    if (q != null) {
      if (q) localStorage.setItem(SERVER_KEY, q);
      else localStorage.removeItem(SERVER_KEY);
    }
    return localStorage.getItem(SERVER_KEY) || MEET_SERVER;
  } catch {
    return MEET_SERVER;
  }
}

/** Your Firebase ID token (a fresh one if it's near expiry), or a dev token from `?devuid=` for local tests. */
async function token() {
  const dev = testParam('devuid');
  if (dev) return `dev:${dev}`;
  const { auth } = await connectSDK();
  return auth.currentUser.getIdToken();
}

/** Testing a slow connection: `?meetlag=150` holds every message this many ms (±20%) each way. */
const LAG = Number(testParam('meetlag')) || 0;
const lanes = { in: 0, out: 0 }; // when each way's last held message goes (they stay in order, as on a real connection)
function lagged(way, fn) {
  if (!LAG) return fn();
  const at = Math.max(lanes[way], performance.now() + LAG * (0.8 + Math.random() * 0.4));
  lanes[way] = at;
  setTimeout(fn, at - performance.now());
}

const PING_EVERY = 10000; // ms
const QUEUE_MAX = 300; // messages held while disconnected (the oldest go first)

export class Conn {
  /**
   * @param path      '/squad/<key>' or '/meet/<id>'
   * @param handlers  { message(msg), status(state) }: state is 'connecting' | 'open' | 'reconnecting' | 'denied' | 'reload' | 'replaced' | 'closed'
   * @param hello     extra fields for the hello
   */
  constructor(path, handlers, hello = {}) {
    this.url = meetServer().replace(/\/$/, '') + path;
    this.handlers = handlers;
    this.hello = hello;
    this.queue = [];
    this.state = 'connecting';
    this.offset = 0; // server clock minus this phone's (ms)
    this.bestRtt = Infinity;
    this.tries = 0;
    this.closed = false;
    this.uid = null;
    this.connect();
  }

  /** The server's clock now (ms). */
  now() {
    return Date.now() + this.offset;
  }

  async connect() {
    if (this.closed) return;
    let tok;
    try {
      tok = await token();
    } catch (e) {
      console.warn('meet server: no sign-in', e);
      return this.retry();
    }
    if (this.closed) return;
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch (e) {
      console.warn('meet server unreachable', e);
      return this.retry();
    }
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: tok, v: PROTOCOL, build: BUILD, ...this.hello }));
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      lagged('in', () => this.receive(msg));
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      clearInterval(this.pinger);
      if (this.closed || this.state === 'denied' || this.state === 'reload' || this.state === 'replaced') return;
      this.retry();
    };
  }

  retry() {
    if (this.closed) return;
    this.setState(this.tries ? 'reconnecting' : 'connecting');
    const wait = Math.min(10000, 1000 * 2 ** Math.min(this.tries, 4)) * (0.8 + Math.random() * 0.4);
    this.tries++;
    clearTimeout(this.again);
    this.again = setTimeout(() => this.connect(), wait);
  }

  receive(msg) {
    switch (msg.t) {
      case 'welcome':
        this.uid = msg.uid;
        this.tries = 0;
        this.adjust(msg.now, 0, true);
        this.setState('open');
        for (const m of this.queue.splice(0)) this.ws?.send(JSON.stringify(m));
        this.pings();
        return;
      case 'pong':
        return this.adjust(msg.now, performance.now() - msg.c);
      case 'reload':
        this.setState('reload');
        return this.close(false);
      case 'denied':
        this.setState('denied');
        return this.close(false);
      case 'replaced':
        // This account connected again elsewhere (another tab or phone): that one's in now.
        this.setState('replaced');
        return this.close(false);
    }
    this.handlers.message?.(msg);
  }

  /** A server time `now` that took `rtt` ms there and back: the clock, if it's the best reading yet. */
  adjust(now, rtt, rough = false) {
    if (rough) {
      if (this.bestRtt === Infinity) this.offset = now - Date.now();
      return;
    }
    if (rtt > this.bestRtt * 1.5 && rtt > 40) return;
    this.bestRtt = Math.min(this.bestRtt, rtt);
    this.offset = now + rtt / 2 - Date.now();
  }

  pings() {
    clearInterval(this.pinger);
    const ping = () => this.ws?.readyState === 1 && this.ws.send(JSON.stringify({ t: 'ping', c: performance.now() }));
    [0, 250, 600, 1200].forEach((ms) => setTimeout(ping, ms));
    this.pinger = setInterval(() => {
      this.bestRtt *= 1.2; // let a slowly drifting clock back in
      ping();
    }, PING_EVERY);
  }

  send(msg) {
    if (LAG && this.state === 'open') return lagged('out', () => this.ws?.readyState === 1 && this.ws.send(JSON.stringify(msg)));
    if (this.state === 'open' && this.ws?.readyState === 1) return this.ws.send(JSON.stringify(msg));
    if (this.closed) return;
    this.queue.push(msg);
    if (this.queue.length > QUEUE_MAX) this.queue.shift();
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.handlers.status?.(s);
  }

  close(final = true) {
    if (final) this.setState('closed');
    this.closed = true;
    clearTimeout(this.again);
    clearInterval(this.pinger);
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close();
    } catch {}
  }
}
