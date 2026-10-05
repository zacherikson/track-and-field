import { rand } from '../core/math.js';

/**
 * 4x100m relay exchanges: the baton changing hands, for the player's team and
 * the computer's alike. Pure logic (no DOM), shared by the game and
 * tools/simulate.mjs.
 *
 * Each exchange is around a 100 m line: the zone runs from `zone.before` m
 * before it to `zone.after` m after it, and the baton has to change hands
 * inside it. The outgoing runner waits `waitBack` m before the line and takes
 * off on their own when the incoming runner is `checkTime` s away (their check
 * mark, set for how fast their teammate is coming). They pick up speed until
 * they're running `closeRate` m/s slower than the incoming runner and hold it
 * there, whatever that runner's speed, so the gap closes the same way for a
 * fast player and a slow one, and the catch comes around the middle of the
 * zone. If the incoming runner slows (reaching out early), so do they.
 *
 *   approach --(incoming enters the zone)--> zone --(PASS)--> reach --(TAKE)--> done
 *
 * In the zone the incoming runner stops striding and carries their speed.
 * PASS reaches the baton out, which slows them a little more, so reaching too
 * early costs time. TAKE is judged on the gap between the two runners:
 *
 *   gap > reach         'whiff': the outgoing runner reaches back for nothing and loses speed
 *   gap >= perfect      'perfect': right at arm's length
 *   gap >= jamGap       'good'
 *   closer              'late': bunched up, the outgoing runner checks their stride
 *
 * MISSED: if the baton (in the incoming runner's hand) reaches the end of
 * the zone still unpassed, the outgoing runner pulls up, the incoming runner
 * comes to a stop right behind them, and the baton changes hands there. The
 * next leg starts from a standstill: that's the price.
 */

export const LEG = 100; // m per leg

/** Where exchange `k` (0: leg 1 to leg 2) is: its line, its zone, and where the outgoing runner waits. */
export function exchangeSpot(cfg, k) {
  const line = LEG * (k + 1);
  const wait = line - cfg.waitBack;
  return { line, from: line - cfg.zone.before, to: line + cfg.zone.after, wait };
}

/** Moves a runner along at its current speed (the exchange drives speed itself, not strides). */
export function glide(r, dt) {
  r.prevX = r.x;
  r.prevFront = r.front;
  r.x += r.v * dt;
  r.phase += ((r.v * dt) / (r.p.strideBase + r.p.stridePerMps * r.v)) * Math.PI * 2;
}

/**
 * Hands a runner over to strides at time t, at the speed they have. Like the
 * start out of the blocks, their pace is assumed to be at least startPace (or
 * whatever their speed already needs), so they drive on, and their own taps
 * pull it toward their real rhythm from there.
 */
export function takeOver(r, t) {
  const p = r.p;
  const pace = Math.max(p.startPace, p.cadenceForTopSpeed * Math.pow(Math.min(1, r.v / p.topSpeed), 1 / p.speedCurve));
  r.started = true;
  r.mode = 'run';
  r.taps = Math.max(1, r.taps); // past the start: no launch out of the blocks
  r.avgInterval = 1 / Math.max(0.5, pace);
  r.lastTapT = t;
}

export class Exchange {
  /**
   * @param cfg       CONFIG.relay
   * @param k         which exchange (0..2)
   * @param incoming  the Runner bringing the baton
   * @param outgoing  the Runner taking it
   * @param ai        CONFIG.relay.ai.<level> for a computer team, null for the player
   * @param rng       where a computer team's timing comes from (seeded: the same on every phone, relaySim.js)
   */
  constructor(cfg, k, incoming, outgoing, ai = null, rng = Math.random) {
    this.cfg = cfg;
    this.rng = rng;
    this.k = k;
    this.spot = exchangeSpot(cfg, k);
    this.in = incoming;
    this.out = outgoing;
    this.ai = ai;
    // A computer team does both halves; in a squad meet's relay (events/meetRelay.js) a
    // computer runner standing in for someone may do just one: PASS (aiPass) or TAKE (aiTake).
    this.aiPass = null; // null: as `ai` says (a computer team: both)
    this.aiTake = null;
    // Meet relay, on the incoming runner's phone: the outgoing runner is on another phone,
    // which moves them and says when the baton changed hands (remoteHandoff).
    this.remoteOut = false;
    this.stage = 'approach';
    this.outState = 'stand'; // 'stand' | 'go' | 'hold' (pulling up: missed)
    this.reachT = null; // when PASS was pressed
    this.lockedUntil = -Infinity; // after a whiff
    this.whiffs = 0;
    this.grade = null; // 'perfect' | 'good' | 'late' | 'missed'
    this.gap = null; // m between the runners at the handover
    this.tIn = null; // when the baton entered the zone...
    this.tOut = null; // ...and left it: the time everyone talks about
    if (ai) this.plan();
  }

  /** A computer runner's timing for this exchange. */
  plan() {
    this.passAt = rand(...this.ai.passGap, this.rng);
    this.takeAt = this.cfg.reach - rand(...this.ai.takeErr, this.rng);
  }

  get gapNow() {
    return this.out.x - this.in.x;
  }

  /** True while the baton can still change hands by TAKE. */
  get open() {
    return this.stage === 'zone' || this.stage === 'reach';
  }

  /** PASS: reach the baton out. */
  pass(t) {
    if (this.stage !== 'zone') return false;
    this.stage = 'reach';
    this.reachT = t;
    return true;
  }

  /** TAKE: 'whiff' (out of reach, try again), 'handoff', or null (nothing to take yet). */
  take(t) {
    if (this.stage !== 'reach' || t < this.lockedUntil || t - this.reachT < this.cfg.doubleTap) return null;
    const c = this.cfg;
    const g = this.gapNow;
    if (g > c.reach) {
      this.whiffs++;
      this.lockedUntil = t + c.whiffLockout;
      this.out.v = Math.max(0, this.out.v - c.whiffLoss);
      return 'whiff';
    }
    this.gap = g;
    if (g >= c.reach - c.perfectBand) this.grade = 'perfect';
    else if (g >= c.jamGap) this.grade = 'good';
    else {
      this.grade = 'late';
      this.out.v = Math.max(0, this.out.v - c.lateLoss * (1 - g / c.jamGap));
    }
    this.handOver(t);
    return 'handoff';
  }

  handOver(t) {
    this.stage = 'done';
    this.in.mode = 'run';
    this.in.finished = true; // their leg is run: they pull up
    if (!this.remoteOut) takeOver(this.out, t);
  }

  /** Meet relay: the outgoing runner's phone says the baton changed hands (`grade`, at `gap` m). */
  remoteHandoff(t, grade, gap = null) {
    if (this.stage === 'done') return;
    this.grade = grade;
    this.gap = gap;
    this.handOver(t);
  }

  /**
   * One step from t to t + dt. The scene runs the incoming runner's strides
   * until they reach the zone; from there this moves both of them. Returns
   * 'handoff' if the baton changed hands in this step (a computer team's
   * TAKE, or a missed exchange's handover), else null.
   */
  step(t, dt) {
    const c = this.cfg;
    const s = this.spot;
    const end = t + dt;
    const inc = this.in;
    const out = this.out;
    if (this.stage === 'done') {
      if (this.tOut == null && out.x >= s.to) this.tOut = end;
      return null;
    }
    // The incoming runner hits the check mark: the outgoing runner goes.
    if (!this.remoteOut && this.outState === 'stand' && inc.x >= s.wait - inc.v * c.checkTime) {
      this.outState = 'go';
      out.started = true;
    }
    if (this.stage === 'approach' && inc.x >= s.from) {
      this.stage = 'zone';
      this.tIn = end;
      inc.mode = 'carry'; // strides stop counting: the scene's input goes to PASS / TAKE
    }
    if (this.remoteOut) {
      // Moved by their own phone.
    } else if (this.outState === 'go') {
      // Up to (or back down to) closeRate under the incoming runner's speed.
      const target = Math.max(0, inc.v - c.outgoing.closeRate);
      const dv = c.outgoing.accel * dt;
      out.v = out.v < target ? Math.min(target, out.v + dv) : Math.max(target, out.v - dv);
    } else if (this.outState === 'hold') out.v = Math.max(0, out.v - c.brakeDecel * dt);
    if (out.started && !this.remoteOut) glide(out, dt);

    if (this.stage === 'approach') {
      this.keepBehind();
      return null; // the scene still runs the incoming runner
    }
    // The baton is at the end of the zone and still hasn't changed hands: missed.
    if (this.open && inc.x + c.batonLead >= s.to) {
      this.stage = 'missed';
      this.outState = 'hold';
    }

    if (this.stage === 'missed') {
      // Come to a stop right behind where the outgoing runner stops; the baton changes hands there.
      const dist = out.x + (out.v * out.v) / (2 * c.brakeDecel) - c.handGap - inc.x;
      const decel = dist > 0.02 ? (inc.v * inc.v) / (2 * dist) : Infinity;
      inc.v = Math.max(0, inc.v - decel * dt);
      glide(inc, dt);
      this.keepBehind();
      if (inc.v === 0 && out.v === 0) {
        this.grade = 'missed';
        this.gap = this.gapNow;
        this.handOver(end);
        return 'handoff';
      }
      return null;
    }

    inc.v = Math.max(0, inc.v - (c.zoneDecel + (this.stage === 'reach' ? c.reachDecel : 0)) * dt);
    glide(inc, dt);
    this.keepBehind();
    if (this.ai) return this.think(end);
    return null;
  }

  /**
   * Never run into (or through) the outgoing runner: you're held up behind
   * them. Only where you are: your speed is still what the outgoing runner
   * paces off, so the two of you don't slow each other to a stop.
   */
  keepBehind() {
    const inc = this.in;
    const x = this.out.x - this.cfg.minGap;
    if (inc.x > x) inc.x = Math.max(inc.prevX, x);
  }

  /** A computer team: PASS when the gap closes to passAt, TAKE when it's down to takeAt. */
  think(t) {
    const g = this.gapNow;
    if ((this.aiPass ?? true) && this.stage === 'zone' && g <= this.passAt) this.pass(t);
    if ((this.aiTake ?? true) && this.stage === 'reach' && g <= this.takeAt && t - this.reachT >= this.cfg.doubleTap) {
      if (this.take(t) === 'whiff') this.takeAt = Math.min(this.takeAt, this.cfg.reach - 0.1); // reach for real next time
      else if (this.stage === 'done') return 'handoff';
    }
    return null;
  }
}
