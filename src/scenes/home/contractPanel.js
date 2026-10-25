import { Button, text, slab, chamfer, titlePlate, PAL } from '../../core/ui.js';
import { drawIcon } from '../../core/icons.js';
import { getBest, getBeaten } from '../../core/storage.js';
import { EVENTS, formatMark } from '../../events/registry.js';
import { CONFIG } from '../../config.js';
import { TIERS, tierOf, medalPoints, STANDARD_EVENTS } from '../../economy/contracts.js';
import { formatAmount } from '../../economy/currencies.js';
import { isSignedIn } from '../../online/firebase.js';
import { cachedContract, openContract, signContract } from '../../online/contracts.js';
import { cachedWallet } from '../../online/wallet.js';

const WARN = '#ffb35c';
const OK = '#7fd8a0';
const DIM = 'rgba(245,234,208,0.75)';
const SHORT = { sprint100: '100m', hurdles110: 'Hurdles', longjump: 'Long jump', polevault: 'Pole vault', javelin: 'Javelin' };

/**
 * THE CONTRACT tab (the home screen's far right; the design doc's "Contracts"; rules: economy/contracts.js):
 * on the left the one you have, as a cream contract sheet: its daily pay, how
 * it stands (active, on probation), and the clause's races this week; or why
 * you haven't one. On the right your offers, each with Sign; with none, what
 * to do for one, and the standards your best marks are measured against.
 *
 * Shows the last answer at once (online/contracts.js keeps it), then, each
 * time you come to the tab, asks the server again: that also collects today's
 * pay. Its tab has a dot while an offer is waiting (`badge`).
 */
export class ContractPanel {
  constructor(home) {
    this.home = home;
    this.game = home.game;
  }

  /** An offer waiting: a dot on the tab. */
  get badge() {
    return !!cachedContract()?.offers?.length;
  }

  enter() {
    this.signButtons = [];
    this.show(false);
    if (this.home.panels[this.home.tab] === this) this.onShow(); // the home screen opened on this tab
  }

  onShow() {
    this.show(true);
  }

  /** What you had last time at once; `ask`: and the server again. */
  show(ask) {
    const saved = cachedContract();
    this.contract = saved?.contract ?? null;
    this.offers = saved?.offers ?? [];
    this.wallet = cachedWallet();
    this.status = null; // { text, color }
    this.busy = false;
    if (!isSignedIn()) this.status = { text: 'Sign in with Google (Athlete tab) to get contracts.', color: WARN };
    else if (ask) {
      if (!saved) this.status = { text: 'Checking…', color: DIM };
      openContract({ force: true })
        .then((a) => a && this.take(a))
        .catch(() => {
          this.status = { text: saved ? 'Offline: this is your contract as it was last seen.' : 'Couldn’t reach the server. Try again when you’re online.', color: WARN };
        });
    }
    if (this.bottom != null) this.layout(this.game.view, this.bottom);
  }

  /** An answer from the server: what it says, and what it paid. */
  take(a) {
    this.contract = a.contract;
    this.offers = a.offers ?? [];
    this.wallet = cachedWallet();
    const got = [a.bonus ? `+${formatAmount('earned', a.bonus)} signing bonus` : null, a.paid ? `+${formatAmount('earned', a.paid)} today’s pay` : null].filter(Boolean);
    this.status = got.length ? { text: got.join('  ·  '), color: OK } : null;
    this.layout(this.game.view, this.bottom);
  }

  sign(offer) {
    if (this.busy) return;
    const t = tierOf(offer.tier);
    const now = this.contract?.tier ? tierOf(this.contract.tier).name : null;
    const sure = window.confirm(`Sign the ${t.name} (${gradeName(offer.grade)})? ${formatAmount('earned', offer.pay)} a day${now ? `. It replaces your ${now}` : ''}.`);
    this.game.input.clear(); // the dialog swallowed the rest of that tap
    if (!sure) return;
    this.busy = true;
    this.status = { text: 'Signing…', color: DIM };
    signContract(offer.tier)
      .then((a) => {
        this.take(a);
        this.status = { text: `Signed! ${this.status?.text ?? ''}`.trim(), color: OK };
      })
      .catch((e) => {
        this.status = { text: e?.message === 'no-offer' ? 'That offer isn’t open any more.' : 'Couldn’t reach the server. Nothing was signed.', color: WARN };
      })
      .finally(() => {
        this.busy = false;
      });
  }

  /** `bottom`: the top of the tab bar. */
  layout(view, bottom) {
    this.bottom = bottom;
    this.colW = Math.min(440, (view.w - 60) / 2);
    this.leftX = view.w / 2 - this.colW - 10;
    this.rightX = view.w / 2 + 10;
    this.top = 84;
    this.signButtons = this.offers.slice(0, 3).map((o, i) => new Button({
      label: 'Sign', w: 104, h: 48, size: 22, color: PAL.liveGreen, lip: PAL.liveShade,
      x: this.rightX + this.colW - 104 - 12, y: this.top + 36 + i * 94 + 18,
      onTap: () => this.sign(o),
    }));
  }

  /** `events`: this tab's taps and keys (the home screen has sorted out swipes). */
  update(dt, events) {
    for (const e of events) if (e.type === 'down') this.signButtons.some((b) => b.tap(e.x, e.y));
    this.signButtons.forEach((b) => {
      b.enabled = !this.busy;
      b.update(dt);
    });
  }

  render(ctx, view) {
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(0, 0, view.w, view.h);
    titlePlate(ctx, view, 'CONTRACT', '', { face: PAL.gold, ink: PAL.ink });
    this.drawSheet(ctx, this.leftX, this.top, this.colW, 320);
    this.drawRight(ctx, this.rightX, this.top, this.colW);
    if (this.status) text(ctx, this.status.text, view.w / 2, Math.min(430, this.bottom - 22), { size: 18, font: 'body', weight: 700, color: this.status.color, maxWidth: view.w - 40 });
  }

  /** Your contract, on a cream sheet: or no contract, or the one you lost. */
  drawSheet(ctx, x, y, w, h) {
    const c = this.contract;
    const cx = x + w / 2;
    ctx.fillStyle = PAL.inkShade;
    chamfer(ctx, x + 6, y + 7, w, h, 8);
    ctx.fill();
    ctx.fillStyle = PAL.cream;
    chamfer(ctx, x, y, w, h, 8);
    ctx.fill();
    const band = !c?.tier ? PAL.ink2 : c.status === 'probation' ? PAL.orange : PAL.gold;
    ctx.fillStyle = band;
    ctx.fillRect(x, y + 14, w, 34);
    drawIcon(ctx, 'contract', x + 26, y + 31, 24, c?.tier ? PAL.ink : PAL.cream);
    if (!c?.tier) {
      text(ctx, c?.lost ? 'CONTRACT LOST' : 'NO CONTRACT', x + 46, y + 32, { size: 22, font: 'display', track: 2, color: PAL.cream, align: 'left' });
      const [head, ...rest] = c?.lost ? lostLines(c) : noneLines();
      text(ctx, head, cx, y + 92, { size: 26, font: 'body', weight: 800, color: PAL.ink, maxWidth: w - 30 });
      rest.forEach((line, i) => text(ctx, line, cx, y + 128 + i * 24, { size: 17, font: 'body', weight: 600, color: PAL.muted, maxWidth: w - 30 }));
      if (c?.lost) pips(ctx, cx, y + 220, c.requal, c.requalNeed, PAL.liveGreen);
      text(ctx, 'Contracts come from campaign tournaments, medals and marks.', cx, y + h - 22, { size: 14, font: 'body', weight: 600, color: PAL.muted, maxWidth: w - 24 });
      return;
    }
    const t = tierOf(c.tier);
    text(ctx, t.name.toUpperCase(), x + 46, y + 32, { size: 22, font: 'display', track: 2, color: PAL.ink, align: 'left', maxWidth: w - 160 });
    text(ctx, gradeName(c.grade).toUpperCase(), x + w - 16, y + 32, { size: 18, font: 'display', track: 2, color: PAL.ink, align: 'right' });
    // The pay.
    text(ctx, formatAmount('earned', c.payToday ?? c.pay), cx, y + 84, { size: 40, font: 'display', track: 1, color: PAL.ink, maxWidth: w - 30 });
    text(ctx, 'A DAY', cx, y + 112, { size: 15, font: 'display', track: 3, color: PAL.muted });
    const standing = c.status === 'probation'
      ? { line: `On probation: ${Math.round(CONFIG.economy.contracts.probationCut * 100)}% less until you meet the clause`, color: PAL.orangeShade }
      : { line: c.paidToday ? 'Today’s pay is in. Back tomorrow for the next.' : 'Open the game each day to collect it.', color: PAL.deep };
    text(ctx, standing.line, cx, y + 140, { size: 16, font: 'body', weight: 700, color: standing.color, maxWidth: w - 24 });
    // The clause.
    const by = y + 166;
    ctx.fillStyle = PAL.creamShade;
    chamfer(ctx, x + 16, by, w - 32, 104, 6);
    ctx.fill();
    text(ctx, 'THE CLAUSE', cx, by + 18, { size: 15, font: 'display', track: 3, color: PAL.muted });
    text(ctx, `Race ${c.need} times a week`, cx, by + 42, { size: 21, font: 'body', weight: 800, color: PAL.ink });
    pips(ctx, cx, by + 70, c.races, c.need, c.races >= c.need ? PAL.liveGreen : PAL.orange);
    const left = c.daysLeft === 1 ? 'last day of this week' : `${c.daysLeft} days left this week`;
    text(ctx, `${Math.min(c.races, c.need)} of ${c.need} · ${left}`, cx, by + 92, { size: 14, font: 'body', weight: 600, color: PAL.muted });
    text(ctx, 'Any race counts but Training. Miss a week: probation. Twice: it’s gone.', cx, y + h - 22, { size: 14, font: 'body', weight: 600, color: PAL.muted, maxWidth: w - 24 });
  }

  /** Your offers; with none, what to do for one, and the standards. */
  drawRight(ctx, x, y, w) {
    text(ctx, this.offers.length ? 'OFFERS' : 'NEXT OFFER', x + w / 2, y + 14, { size: 18, font: 'display', track: 3, color: PAL.gold });
    if (this.offers.length) {
      this.offers.slice(0, 3).forEach((o, i) => this.drawOffer(ctx, o, x, y + 36 + i * 94, w));
      this.signButtons.forEach((b) => b.draw(ctx));
      return;
    }
    const hint = nextHint(this.contract, this.wallet);
    slab(ctx, x, y + 32, w, 62, { face: PAL.ink2, lip: PAL.inkShade, lipH: 5, c: 7 });
    text(ctx, hint, x + w / 2, y + 60, { size: 17, font: 'body', weight: 700, color: PAL.cream, maxWidth: w - 24 });
    this.drawStandards(ctx, x, y + 108, w, standardsTier(this.contract));
  }

  drawOffer(ctx, o, x, y, w) {
    slab(ctx, x, y, w, 84, { face: PAL.ink2, lip: PAL.inkShade, lipH: 5, c: 7 });
    const t = tierOf(o.tier);
    const bonus = Math.round(o.pay * CONFIG.economy.contracts.signingBonus);
    text(ctx, `${t.name.toUpperCase()} · ${gradeName(o.grade).toUpperCase()}`, x + 16, y + 20, { size: 17, font: 'display', track: 2, color: PAL.gold, align: 'left', maxWidth: w - 140 });
    text(ctx, `${formatAmount('earned', o.pay)} a day`, x + 16, y + 45, { size: 22, font: 'body', weight: 800, color: PAL.cream, align: 'left', maxWidth: w - 140 });
    text(ctx, `+${formatAmount('earned', bonus)} to sign · ${o.met.length} of ${STANDARD_EVENTS.length} standards`, x + 16, y + 67, { size: 14, font: 'body', weight: 600, color: DIM, align: 'left', maxWidth: w - 140 });
  }

  /** A contract's qualifying standards, and your best mark against each (a tick where it's met). */
  drawStandards(ctx, x, y, w, tierId) {
    const std = CONFIG.economy.contracts.standards[tierId];
    text(ctx, `${tierOf(tierId).name.toUpperCase()} STANDARDS`, x + w / 2, y + 10, { size: 15, font: 'display', track: 3, color: DIM });
    STANDARD_EVENTS.forEach((id, i) => {
      const ev = EVENTS.find((e) => e.id === id);
      const ry = y + 30 + i * 33;
      const best = getBest(id);
      const met = best != null && (ev.lowerIsBetter ? best <= std[id] : best >= std[id]);
      ctx.fillStyle = i % 2 ? PAL.ink : PAL.inkShade;
      ctx.fillRect(x, ry, w, 31);
      text(ctx, SHORT[id], x + 14, ry + 16, { size: 17, font: 'body', weight: 800, color: PAL.cream, align: 'left' });
      text(ctx, formatMark(ev, std[id]), x + w * 0.5, ry + 16, { size: 17, font: 'body', weight: 700, color: PAL.gold });
      text(ctx, best == null ? '—' : formatMark(ev, best), x + w - 44, ry + 16, { size: 16, font: 'body', weight: 700, color: met ? OK : DIM, align: 'right' });
      if (met) drawIcon(ctx, 'check', x + w - 22, ry + 16, 18, OK);
    });
  }
}

const gradeName = (g) => CONFIG.economy.contracts.grades[g]?.name ?? '';

/** `n` of `of` filled circles, centred on `cx`. */
function pips(ctx, cx, y, n, of, color) {
  const gap = 30;
  for (let i = 0; i < of; i++) {
    const px = cx + (i - (of - 1) / 2) * gap;
    ctx.beginPath();
    ctx.arc(px, y, 10, 0, Math.PI * 2);
    ctx.fillStyle = i < n ? color : 'rgba(38,34,79,0.18)';
    ctx.fill();
  }
}

function noneLines() {
  return ['No contract yet', 'Beat a campaign’s tournament for an offer:', 'High School for a Scholarship,', 'Collegiate for an NIL deal, Pro for a Pro contract.'];
}

function lostLines(c) {
  const left = Math.max(0, c.requalNeed - c.requal);
  return [
    `Your ${tierOf(c.lost).name} is gone`,
    'You missed the clause two weeks running.',
    left ? `Finish top 3 in ${left} more race${left === 1 ? '' : 's'} for offers again.` : 'You’ve raced your way back: offers are open.',
  ];
}

/** The campaign whose standards to show: your contract's, else the next one you can earn. */
function standardsTier(c) {
  if (c?.tier) return c.tier;
  const next = TIERS.find((t) => !getBeaten(t.level === 'amateur' ? 'collegiate' : t.level).tournament);
  return (next ?? TIERS.at(-1)).id;
}

/** What to do for your next offer, in a line. */
function nextHint(c, wallet) {
  if (c?.lost && c.requal < c.requalNeed) return 'Finish top 3 in races to earn offers again.';
  const beaten = (t) => getBeaten(t.level === 'amateur' ? 'collegiate' : t.level).tournament;
  const have = TIERS.findIndex((t) => t.id === c?.tier);
  const next = TIERS.slice(have + 1).find((t) => t.id === 'pro' || !beaten(t)) ?? null;
  if (next && !beaten(next)) return `Beat ${next.levelName}’s tournament for ${next.id === 'nil' ? 'an' : 'a'} ${next.name}.`;
  if (next?.id === 'pro' && medalPoints(wallet) < CONFIG.economy.contracts.proProof) return 'A Pro contract needs a live medal too: a gold, or two silvers.';
  return 'Better offers come with more medals and better marks.';
}
