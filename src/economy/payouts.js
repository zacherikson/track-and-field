import { CONFIG } from '../config.js';
import { xpForRace } from './levels.js';
import { MEDALS } from './wallet.js';

/**
 * WHAT A PUBLIC LIVE ROOM PAYS (the design doc's "Medals" and "Where money
 * comes from"), from its standings (src/online/liveResults.js), as wallet
 * changes (src/economy/wallet.js) the server makes for each player:
 *
 * - every finisher: earned currency for finishing, plus a prize for 1st to 3rd
 *   when at least `prizeMin` finished;
 * - 1st to 3rd, when at least `medalsMin` finished: a gold, silver or bronze
 *   medal (kept forever) and the premium currency that comes with it;
 * - XP for each event you finished (levels.js, as live).
 * A tournament pays `tournament` times as much money. Squad Practice pays
 * nothing (the server only settles public rooms). Amounts: CONFIG.economy.live.
 *
 * Each change's `ref` is the room (and the event, for XP), so a room pays
 * everyone once, however many times it's settled.
 */

/**
 * `room` = the room's id, `standings` = roomStandings(...), `day` = levels.js xpDay.
 * Returns a Map uid -> { changes: [change], summary: { place, field, earned, premium, medal, xp } }
 * (`place`/`medal` null for a player who only gets XP: a tournament they didn't finish).
 */
export function livePayouts({ kind, room, standings, day }) {
  const L = CONFIG.economy.live;
  const factor = kind === 'tournament' ? L.tournament : 1;
  const out = new Map();
  const entry = (uid) => {
    if (!out.has(uid)) out.set(uid, { changes: [], summary: { place: null, field: 0, earned: 0, premium: 0, medal: null, xp: 0 } });
    return out.get(uid);
  };
  const finishers = standings.overall;
  const n = finishers.length;
  for (const f of finishers) {
    const e = entry(f.uid);
    const earned = (L.finish + (n >= L.prizeMin ? (L.prize[f.place - 1] ?? 0) : 0)) * factor;
    e.changes.push({ kind: 'grant', currency: 'earned', amount: earned, reason: 'live-prize', ref: room });
    Object.assign(e.summary, { place: f.place, field: n, earned });
    if (n >= L.medalsMin && f.place <= MEDALS.length) {
      const medal = MEDALS[f.place - 1];
      const premium = L.medalPremium[f.place - 1] * factor;
      e.changes.push({ kind: 'grant', currency: medal, amount: 1, reason: 'medal', ref: room });
      e.changes.push({ kind: 'grant', currency: 'premium', amount: premium, reason: 'medal-pay', ref: room });
      Object.assign(e.summary, { medal, premium });
    }
  }
  // XP for every event each player finished, by their place in it.
  for (const ev of standings.events) {
    const field = ev.ranked.length;
    for (const r of ev.ranked) {
      if (r.result.status !== 'ok') continue;
      const xp = xpForRace({ mode: 'live', place: r.place, field });
      if (!xp) continue;
      const e = entry(r.uid);
      e.changes.push({ kind: 'grant', currency: 'xp', amount: xp, reason: 'race', ref: `${room}-${ev.step}`, day });
      e.summary.xp += xp;
    }
  }
  return out;
}
