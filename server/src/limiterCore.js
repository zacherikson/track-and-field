/**
 * REQUEST LIMITS: how often one player may call each of the game's HTTP
 * endpoints (api.js). Nobody playing gets near them; they're there so one
 * account with a script can't run up the database's daily writes, or keep the
 * server replaying 100m runs, for everyone else.
 *
 * One Limiter object per player (index.js: a Durable Object named for their
 * id) holds this, counting calls in fixed windows: `perMinute` in any clock
 * minute, `perHour` in any clock hour. The counts live in memory: an object
 * that's been idle long enough to be put away comes back empty, which only
 * ever errs on the player's side.
 *
 * The numbers are the server's alone: change them here.
 */
export const LIMITS = {
  xp: { perMinute: 30, perHour: 600 },
  contract: { perMinute: 20, perHour: 300 },
  shop: { perMinute: 30, perHour: 600 },
  athlete: { perMinute: 12, perHour: 120 },
  mark: { perMinute: 12, perHour: 240 },
  progress: { perMinute: 20, perHour: 300 },
};
const MINUTE = 60000;
const HOUR = 3600000;

export class LimiterCore {
  constructor(limits = LIMITS) {
    this.limits = limits;
    this.counts = new Map(); // `${what}/m` | `${what}/h` -> { window, n }
  }

  /** A call to `what` at `now` (ms): true if it's within the limits (and counted), false if it's one too many. */
  hit(what, now) {
    const limit = Object.hasOwn(this.limits, what) ? this.limits[what] : null;
    if (!limit) return true;
    const minute = this.count(`${what}/m`, Math.floor(now / MINUTE));
    const hour = this.count(`${what}/h`, Math.floor(now / HOUR));
    if (minute.n >= limit.perMinute || hour.n >= limit.perHour) return false;
    minute.n++;
    hour.n++;
    return true;
  }

  count(key, window) {
    let c = this.counts.get(key);
    if (!c || c.window !== window) this.counts.set(key, (c = { window, n: 0 }));
    return c;
  }
}
