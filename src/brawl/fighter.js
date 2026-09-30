import { clamp } from '../core/math.js';
import { heightOf } from '../athletes/roster.js';
import { PUNCH, KICK, SLAM, HURT, KNOCK, EMOTE_TIME, stance, punch, kick, slam, hurt, fly, getup, held, emote, FIGHT } from './poses.js';

/**
 * One athlete in the late hits (brawl.js): where they stand, which way they
 * face, and what they're doing.
 *
 * Ground coordinates are meters: `x` along the track (as in the event) and
 * `d` across it, 0 at the near edge. The venue turns them into screen points.
 *
 * STATES
 *   idle / walk            free: can move, attack or emote
 *   punch / kick / slam    attacking (slam: grab someone, hoist, slam them down)
 *   emote                  playing an emote (moving or attacking cancels it)
 *   hurt                   rocked by a punch
 *   fly -> down -> getup   knocked off your feet, flat on your back, back up
 *   held -> down           hoisted overhead by a slam, then slammed down
 *
 * `seq` counts state changes, so a live phone can tell a new punch from the
 * same one (liveBrawl.js).
 */
export const WALK = { x: 3.4, d: 2.4 }; // m/s at full stick
export const INVULN = 0.6; // s after getting up that you can't be hit again

export class Fighter {
  constructor({ id, scarKey, name, colors, x, d, facing = 1, isMe = false, remote = false, wounds }) {
    Object.assign(this, { id, scarKey, name, colors, x, d, facing, isMe, remote });
    this.tall = heightOf(colors);
    this.wounds = wounds;
    this.mx = 0; // move stick, -1..1 along the track
    this.md = 0; // ...and across it (+ = away from the camera)
    this.vx = 0; // knockback (m/s), fading
    this.vd = 0;
    this.phase = Math.random() * Math.PI * 2; // stride
    this.state = 'idle';
    this.st = 0; // when the state started (s)
    this.seq = 0;
    this.variant = 0; // punch: which arm; emote: which one
    this.invulnUntil = 0;
    this.grabbed = null; // slam: who you're holding
    this.holder = null; // held: who's holding you
    this.hitDone = false;
    this.punches = []; // times of punches taken lately (three in a row knock you down)
    this.dropSeed = 0; // held: the wound you get when you land
    this.net = null; // remote: { x, d } they last said they were at
  }

  /** Free to move, attack or emote. */
  get free() {
    return this.state === 'idle' || this.state === 'walk' || this.state === 'emote';
  }

  /** Can be hit right now. */
  vulnerable(t) {
    return t >= this.invulnUntil && !['fly', 'down', 'getup', 'held'].includes(this.state);
  }

  /** Flat on the ground (or on the way there): what an emote laughs at. */
  get floored() {
    return this.state === 'fly' || this.state === 'down' || this.state === 'held';
  }

  set(state, t, variant = 0) {
    this.state = state;
    this.st = t;
    this.variant = variant;
    this.seq++;
    this.hitDone = false;
  }

  /** How long the current state lasts (Infinity for the free ones). */
  duration() {
    switch (this.state) {
      case 'punch': return PUNCH.time;
      case 'kick': return KICK.time;
      case 'slam': return this.grabbed ? SLAM.time : SLAM.whiff;
      case 'hurt': return HURT.time;
      case 'fly': return KNOCK.fly;
      case 'down': return KNOCK.down;
      case 'getup': return KNOCK.getup;
      case 'held': return SLAM.drop - SLAM.grab;
      case 'emote': return EMOTE_TIME;
      default: return Infinity;
    }
  }

  /** Height off the ground (m) from being knocked through the air. */
  lift(t) {
    if (this.state !== 'fly') return 0;
    const k = clamp((t - this.st) / KNOCK.fly, 0, 1);
    return 4 * KNOCK.height * k * (1 - k);
  }

  pose(t) {
    const u = t - this.st;
    switch (this.state) {
      case 'punch': return punch(u, this.variant);
      case 'kick': return kick(u);
      case 'slam': return slam(u, !!this.grabbed);
      case 'hurt': return hurt(u);
      case 'fly': return fly(u);
      case 'down': return FIGHT.down;
      case 'getup': return getup(u);
      case 'held': return held(t);
      case 'emote': return emote(this.variant, u);
      default: return stance(this.phase, this.state === 'walk' ? Math.min(1, Math.hypot(this.mx, this.md)) : 0, t);
    }
  }
}
