import { DurableObject } from 'cloudflare:workers';
import { acceptSocket } from './socket.js';
import { loadSquad } from './firestore.js';
import { MeetCore } from './meetCore.js';
import { SquadHubCore } from './squadHubCore.js';
import { MatchmakerCore } from './matchmakerCore.js';

/**
 * THE MEET SERVER (docs/meets.md): a Cloudflare Worker and three kinds of
 * Durable Object. The game connects with a WebSocket to
 *
 *   /squad/<squad key>   that squad's SquadHub: the Squad tab, meet sign-up
 *   /meet/<meet id>      a Meet: its lobby, then the meet itself
 *
 * and the objects talk to each other by RPC: a SquadHub asks the Matchmaker
 * for a lobby and hands its squad to that Meet; a Meet tells the Matchmaker
 * and its squads' SquadHubs how it stands. All the rules are in the *Core
 * classes, which don't touch Cloudflare's APIs (and so run in tests).
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const [, kind, raw] = url.pathname.split('/');
    let name = null;
    try {
      name = raw ? decodeURIComponent(raw) : null;
    } catch {}
    if (kind === 'health') return new Response('ok');
    if (!name || name.length > 160) return new Response('Not found', { status: 404 });
    if (kind === 'squad') return env.SQUADS.get(env.SQUADS.idFromName(name)).fetch(request);
    if (kind === 'meet' && /^[a-z0-9]{6,40}$/.test(name)) return env.MEETS.get(env.MEETS.idFromName(name)).fetch(request);
    return new Response('Not found', { status: 404 });
  },
};

const TICK = 100; // ms

/** Calls `fn` (an RPC to another object) without waiting, logging a failure. */
const later = (what, fn) => Promise.resolve().then(fn).catch((e) => console.error(what, e));

const nameFrom = (request) => decodeURIComponent(new URL(request.url).pathname.split('/')[2] ?? '');

export class SquadHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = null;
  }

  /** The core for squad `key`, loading what was saved (which meet the squad is in). */
  async hub(key) {
    if (this.core) return this.core;
    const env = this.env;
    const core = new SquadHubCore(key, {
      now: () => Date.now(),
      loadSquad: () => loadSquad(env, key),
      place: (squad) => this.place(squad),
      fill: (meetId, member) => env.MEETS.get(env.MEETS.idFromName(meetId)).fill(key, member),
      save: (state) => later('save squad', () => this.ctx.storage.put('state', state)),
    });
    core.load(await this.ctx.storage.get('state'));
    this.core ??= core;
    this.timer ??= setInterval(() => this.core.tick(), 1000);
    return this.core;
  }

  /** The Matchmaker's lobby for this squad, and the squad into it (another, if that one's just filled). */
  async place(squad) {
    const match = this.env.MATCH.get(this.env.MATCH.idFromName('global'));
    const exclude = [];
    for (let i = 0; i < 4; i++) {
      const id = await match.place(squad.key, exclude);
      const r = await this.env.MEETS.get(this.env.MEETS.idFromName(id)).addSquad(id, squad);
      if (r?.ok) return id;
      exclude.push(id);
    }
    return null;
  }

  async fetch(request) {
    const core = await this.hub(nameFrom(request));
    return acceptSocket(request, this.env, {
      onPeer: (peer, hello) => core.connect(peer, hello),
      onMessage: (peer, msg) => core.message(peer, msg),
      onClose: (peer) => core.disconnect(peer),
    });
  }

  // RPC from the squad's Meet.
  async meetUpdate(key, info) {
    (await this.hub(key)).meetUpdate(info);
  }

  async released(key, id) {
    (await this.hub(key)).released(id);
  }
}

export class Matchmaker extends DurableObject {
  async core() {
    if (this.mm) return this.mm;
    const mm = new MatchmakerCore({ now: () => Date.now(), newId: () => crypto.randomUUID().replace(/-/g, '').slice(0, 20) });
    mm.load(await this.ctx.storage.get('lobbies'));
    this.mm ??= mm;
    return this.mm;
  }

  async place(key, exclude) {
    const mm = await this.core();
    const id = mm.place(key, exclude ?? []);
    await this.ctx.storage.put('lobbies', mm.toJSON());
    return id;
  }

  async update(info) {
    const mm = await this.core();
    mm.update(info);
    await this.ctx.storage.put('lobbies', mm.toJSON());
  }
}

export class Meet extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = null;
  }

  meet(id) {
    if (this.core) return this.core;
    const env = this.env;
    this.core = new MeetCore(id, {
      now: () => Date.now(),
      released: (squadKey, why) => later('released', () => env.SQUADS.get(env.SQUADS.idFromName(squadKey)).released(squadKey, id)),
      update: (info) => {
        later('match update', () => env.MATCH.get(env.MATCH.idFromName('global')).update(info));
        for (const s of info.squads) later('squad update', () => env.SQUADS.get(env.SQUADS.idFromName(s.key)).meetUpdate(s.key, info));
      },
    }, Math.random, { firstEvent: env.DEV_AUTH === '1' ? Number(env.DEV_FIRST_EVENT ?? 0) || 0 : 0 });
    this.timer = setInterval(() => {
      try {
        this.core.tick();
      } catch (e) {
        console.error('tick', e);
      }
      if (this.core.phase === 'closed') clearInterval(this.timer);
    }, TICK);
    return this.core;
  }

  async fetch(request) {
    const core = this.meet(nameFrom(request));
    return acceptSocket(request, this.env, {
      onPeer: (peer) => core.connect(peer),
      onMessage: (peer, msg) => core.message(peer.uid, msg),
      onClose: (peer) => core.disconnect(peer),
    });
  }

  // RPC from a SquadHub.
  async addSquad(id, squad) {
    const core = this.meet(id);
    if (core.phase === 'closed') return { ok: false, why: 'closed' };
    return core.addSquad(squad);
  }

  async fill(squadKey, member) {
    if (!this.core) return { ok: false, why: 'gone' };
    return this.core.fill(squadKey, member);
  }
}
