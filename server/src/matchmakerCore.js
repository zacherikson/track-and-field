import { MAX_SQUADS } from '../../src/meet/rules.js';

const STALE = 3 * 60 * 1000; // ms without word from a lobby before it's forgotten

/**
 * THE MATCHMAKER: which meet lobbies are open, and putting each squad in one.
 * A squad goes in the oldest lobby with room (place); each Meet says how its
 * lobby stands whenever that changes (update), so the list follows the truth.
 * Two squads placed in the last spot at once: the Meet turns the second away
 * and its SquadHub asks again, leaving that lobby out.
 */
export class MatchmakerCore {
  constructor(io) {
    this.io = io; // { now(), newId() }
    this.lobbies = new Map(); // id -> { id, squads: [key], open, at, seen }
  }

  /** A lobby for squad `key` (not one of `exclude`): the oldest with room, or a new one. */
  place(key, exclude = []) {
    const now = this.io.now();
    this.prune(now);
    const open = [...this.lobbies.values()].filter((l) => l.open && l.squads.length < MAX_SQUADS && !exclude.includes(l.id)).sort((a, b) => a.at - b.at);
    let lobby = open.find((l) => l.squads.includes(key)) ?? open[0];
    if (!lobby) {
      lobby = { id: this.io.newId(), squads: [], open: true, at: now, seen: now };
      this.lobbies.set(lobby.id, lobby);
    }
    if (!lobby.squads.includes(key)) lobby.squads.push(key);
    return lobby.id;
  }

  /** A Meet's news: { id, phase, open, squads: [{ key }] }. */
  update(info) {
    const now = this.io.now();
    if (info.phase !== 'lobby' || !info.squads?.length) {
      this.lobbies.delete(info.id);
      return;
    }
    const was = this.lobbies.get(info.id);
    this.lobbies.set(info.id, { id: info.id, squads: info.squads.map((s) => s.key), open: !!info.open, at: was?.at ?? now, seen: now });
  }

  prune(now) {
    for (const [id, l] of this.lobbies) if (now - l.seen > STALE) this.lobbies.delete(id);
  }

  /** For storage: the lobbies as a plain list. */
  toJSON() {
    return [...this.lobbies.values()];
  }

  load(list) {
    this.lobbies = new Map((list ?? []).map((l) => [l.id, l]));
  }
}
