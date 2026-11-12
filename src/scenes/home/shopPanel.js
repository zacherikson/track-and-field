import { text, slab, chamfer, titlePlate, PAL } from '../../core/ui.js';
import { drawIcon } from '../../core/icons.js';
import { getCustom, setCustom, setCharacter, getPlayerName } from '../../core/storage.js';
import { parse, encode, cleanAthleteName, DEFAULT_NAME } from '../../athletes/custom.js';
import { itemById, noGear, SLOT_NAMES } from '../../economy/items.js';
import { cantBuy, offerItems, SECTION_NAMES } from '../../economy/shop.js';
import { levelOf } from '../../economy/levels.js';
import { formatAmount } from '../../economy/currencies.js';
import { isSignedIn } from '../../online/firebase.js';
import { cachedWallet } from '../../online/wallet.js';
import { myLevel } from '../../online/xp.js';
import { shopOffers, shopTime, myInventory, myCounts, openShop, buyOffer } from '../../online/shop.js';
import { drawWearing, RARITY_COLOR } from '../gearPreview.js';

const WARN = '#ffb35c';
const OK = '#7fd8a0';
const DIM = 'rgba(245,234,208,0.75)';
// Who models the gear when you haven't made an athlete of your own (custom.js LOOK picks).
const MODEL = { skin: 3, style: 1, hair: 1, shirt: 7, shorts: 0, height: 3, build: 0 };
const WHY = {
  funds: 'Not enough to buy that yet.',
  level: 'Your level isn’t high enough for that yet.',
  owned: 'You already have that.',
  bought: 'You’ve already had that one.',
  'not-for-sale': 'That’s gone from the shop.',
  guest: 'Sign in with Google (Athlete tab) to buy gear.',
};
const ROW_MAX = 8; // cards across at most
const COIN = { earned: { face: '#F2B632', edge: '#B9851B', mark: 'C' }, premium: { face: '#59C9E8', edge: '#2A86A8', mark: 'G' } };

/**
 * THE SHOP tab (the home screen's far left; economy/shop.js): whatever the
 * server has on sale (online/shop.js), a card per offer, a row or two of
 * sections (this week's, today's, the basics, or any the server makes up),
 * with a countdown on the ones that end. A card shows what you get (gear on
 * your athlete close up, or the Coins or Gems), its name and its price (or
 * FREE, OWNED, or the level it needs). Tap a card to buy it; the server takes
 * the price and keeps it for you, then you can wear gear straight away.
 */
export class ShopPanel {
  constructor(home) {
    this.home = home;
    this.game = home.game;
  }

  enter() {
    this.offers = shopOffers(); // as last sent; asked again when you come to the tab
    this.inventory = myInventory();
    this.counts = myCounts();
    this.wallet = cachedWallet();
    this.level = myLevel()?.level ?? 1;
    this.busy = false;
    this.asked = false;
    this.status = isSignedIn() ? null : { text: WHY.guest, color: WARN };
    const mine = parse(getCustom());
    this.look = mine?.look ?? MODEL;
    this.gear = mine?.gear ?? noGear();
    this.cards = [];
    this.labels = [];
    if (this.home.panels[this.home.tab] === this) this.onShow(); // the home screen opened on this tab
  }

  /** Coming to this tab: your athlete may have changed, and the shop and what you own (asked again: no network until you look). */
  onShow() {
    const mine = parse(getCustom());
    this.look = mine?.look ?? MODEL;
    this.gear = mine?.gear ?? noGear();
    this.wallet = cachedWallet() ?? this.wallet;
    openShop()
      .then((a) => a && this.take(a))
      .catch(() => {
        this.status = { text: this.offers.length ? 'Offline: buying needs a connection.' : 'Offline: the shop needs a connection.', color: WARN };
      })
      .finally(() => {
        this.asked = true;
      });
  }

  /** The server's answer: the shop now, and (signed in) what you have. */
  take(a) {
    this.offers = shopOffers();
    if (a.wallet) {
      this.inventory = myInventory();
      this.counts = myCounts();
      this.wallet = cachedWallet();
      if (this.wallet) this.level = levelOf(this.wallet.xp);
    }
    this.layout(this.game.view, this.bottom);
  }

  /**
   * `bottom`: the top of the tab bar. The offers go in their sections, in the
   * order sent; sections sit side by side on a row while they fit (ROW_MAX
   * cards across), each under its name.
   */
  layout(view, bottom) {
    this.bottom = bottom;
    this.cards = [];
    this.labels = [];
    const sections = [];
    for (const o of this.offers) {
      const last = sections.at(-1);
      if (last?.id === o.section) last.offers.push(o);
      else sections.push({ id: o.section, offers: [o] });
    }
    const rows = [];
    for (const sec of sections) {
      const row = rows.at(-1);
      if (row && row.n + sec.offers.length <= ROW_MAX) {
        row.sections.push(sec);
        row.n += sec.offers.length;
      } else rows.push({ sections: [sec], n: sec.offers.length });
    }
    if (!rows.length) return;
    const s = view.safe;
    const margin = 16 + Math.max(s.l, s.r);
    const W = view.w - margin * 2;
    const gap = 12;
    const split = 20; // between two sections on a row
    const top = 124 + s.t;
    const labelH = 40;
    const h = Math.min(200, (bottom - 12 - top - (rows.length - 1) * labelH) / rows.length);
    rows.forEach((row, r) => {
      const y = top + r * (h + labelH);
      const extra = (row.sections.length - 1) * (split - gap);
      const w = Math.min(170, (W - extra - (row.n - 1) * gap) / row.n);
      let x = view.w / 2 - (row.n * w + (row.n - 1) * gap + extra) / 2;
      for (const sec of row.sections) {
        this.labels.push({ x, y: y - 14, text: SECTION_NAMES[sec.id] ?? sec.id.toUpperCase().replace(/-/g, ' '), until: sec.offers.find((o) => o.until)?.until ?? 0 });
        for (const offer of sec.offers) {
          this.cards.push({ offer, x, y, w, h, featured: sec.id === 'weekly' });
          x += w + gap;
        }
        x += split - gap;
      }
    });
  }

  /** `events`: this tab's taps and keys (the home screen has sorted out swipes). */
  update(dt, events) {
    for (const e of events) {
      if (e.type !== 'down') continue;
      const card = this.cards.find((c) => e.x >= c.x && e.x <= c.x + c.w && e.y >= c.y && e.y <= c.y + c.h);
      if (card) this.tapCard(card);
    }
    // An offer ended (or began) while the shop is open: what's on sale now.
    const now = shopTime();
    if (this.offers.some((o) => o.until && now >= o.until)) {
      this.offers = shopOffers();
      this.layout(this.game.view, this.bottom);
      if (!this.busy) this.onShow(); // and what the server has now
    }
  }

  /** What stops you buying `offer` now, or null (as the server will decide it). */
  why(offer) {
    const why = cantBuy(offer, shopTime(), { level: this.level, inventory: this.inventory, counts: this.counts, wallet: this.wallet ?? {} });
    if (why === 'owned' || why === 'bought' || why === 'not-for-sale') return why;
    return isSignedIn() ? why : 'guest';
  }

  tapCard(card) {
    if (this.busy) return;
    const { offer } = card;
    const item = itemById(offerItems(offer)[0]);
    const name = offerName(offer);
    const why = this.why(offer);
    if (why === 'owned' && item) return this.offerWear(item, 'You have it.');
    if (why) {
      this.status = { text: why === 'level' ? `${name} needs level ${offer.level}. You’re level ${this.level}.` : WHY[why] ?? why, color: WARN };
      return;
    }
    if (!isFree(offer)) {
      const sure = window.confirm(`Buy ${name} for ${priceText(offer)}?`);
      this.game.input.clear(); // the dialog swallowed the rest of that tap
      if (!sure) return;
    }
    this.busy = true;
    this.status = { text: isFree(offer) ? 'Collecting…' : 'Buying…', color: DIM };
    buyOffer(offer.id)
      .then((a) => {
        if (a) this.take(a);
        const said = isFree(offer) ? `${name}: ${grantText(offer)}!` : `Bought ${name}!`;
        this.status = { text: said, color: OK };
        if (item) this.offerWear(item, said);
      })
      .catch((e) => {
        this.status = { text: WHY[e?.message] ?? 'Couldn’t reach the server. Nothing was bought.', color: WARN };
      })
      .finally(() => {
        this.busy = false;
      });
  }

  /** Puts `item` on the athlete you made, if you'd like (or says how to wear it). */
  offerWear(item, said) {
    const code = getCustom();
    const mine = parse(code);
    if (!mine) {
      this.status = { text: `${said} Make your own athlete (Athlete tab) to wear it.`, color: OK };
      return;
    }
    if (mine.gear[item.slot] === item.n) {
      this.status = { text: `${said} Your athlete is wearing it.`, color: OK };
      return;
    }
    const sure = window.confirm(`${said} Wear ${item.name} now?`);
    this.game.input.clear();
    if (!sure) return;
    const gear = { ...mine.gear, [item.slot]: item.n };
    const next = encode(mine.look, cleanAthleteName(getPlayerName()) || DEFAULT_NAME, gear);
    setCustom(next);
    setCharacter(next);
    this.gear = gear;
    this.status = { text: `You’re wearing ${item.name}.`, color: OK };
  }

  render(ctx, view) {
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(0, 0, view.w, view.h);
    titlePlate(ctx, view, 'SHOP', '', { face: PAL.gold, ink: PAL.ink, maxW: view.w - 340 });
    // Your wallet, top right.
    const w = this.wallet;
    const money = w ? `${formatAmount('earned', w.earned)}  ·  ${formatAmount('premium', w.premium)}` : isSignedIn() ? '…' : 'Guest';
    text(ctx, money, view.w - 16 - Math.max(view.safe.l, view.safe.r), 36 + view.safe.t, { size: 19, font: 'body', weight: 800, color: PAL.gold, align: 'right' });
    text(ctx, `Level ${this.level}`, view.w - 16 - Math.max(view.safe.l, view.safe.r), 58 + view.safe.t, { size: 14, font: 'body', weight: 700, color: DIM, align: 'right' });
    if (this.status) text(ctx, this.status.text, view.w / 2, 76 + view.safe.t, { size: 16, font: 'body', weight: 700, color: this.status.color, maxWidth: view.w - 40 });
    if (!this.cards.length) text(ctx, this.asked ? 'Nothing on sale right now.' : 'Opening the shop…', view.w / 2, view.h / 2, { size: 18, font: 'body', weight: 700, color: DIM });
    const now = shopTime();
    for (const l of this.labels) {
      const until = l.until ? `  ·  new in ${countdown(l.until - now)}` : '';
      text(ctx, `${l.text}${until}`, l.x, l.y, { size: 15, font: 'display', track: 2, color: PAL.gold, align: 'left' });
    }
    for (const c of this.cards) this.drawCard(ctx, c);
  }

  /** A card: the rarity's band, what you get (gear on your athlete close up, or the money), its name and price (or FREE, OWNED, its level). */
  drawCard(ctx, c) {
    const { offer } = c;
    const item = itemById(offerItems(offer)[0]);
    const money = offer.grants.find((g) => g.currency);
    const why = this.why(offer);
    const tint = (item && RARITY_COLOR[item.rarity]) ?? (money && !item ? COIN[money.currency].face : PAL.creamShade);
    slab(ctx, c.x, c.y, c.w, c.h, { face: PAL.cream, lip: PAL.creamShade, lipH: 5, c: 7 });
    ctx.fillStyle = tint;
    ctx.fillRect(c.x + 6, c.y + 6, c.w - 12, 5);
    // The preview.
    const s = Math.min(c.w - 16, c.h - 94);
    const px = c.x + (c.w - s) / 2;
    const py = c.y + 16;
    ctx.save();
    chamfer(ctx, px, py, s, s, 6);
    ctx.clip();
    ctx.fillStyle = c.featured ? '#FBEBC4' : '#EFE3C6';
    ctx.fillRect(px, py, s, s);
    if (item) drawWearing(ctx, px, py, s, this.look, { ...this.gear, [item.slot]: item.n }, item.slot);
    else if (money) drawCoins(ctx, px, py, s, money.currency);
    ctx.restore();
    const ty = py + s + 14;
    text(ctx, offerName(offer), c.x + c.w / 2, ty, { size: 15, font: 'body', weight: 800, color: PAL.ink, maxWidth: c.w - 12 });
    const sub = item ? `${item.rarity.toUpperCase()} ${SLOT_NAMES[item.slot].toUpperCase()}${offer.grants.length > 1 ? ' + MORE' : ''}` : offer.title ? grantText(offer).toUpperCase() : '';
    text(ctx, sub, c.x + c.w / 2, ty + 16, { size: 11, font: 'display', track: 1.5, color: !item || item.rarity === 'common' ? PAL.muted : tint, maxWidth: c.w - 10 });
    // The price, or why not.
    const by = c.y + c.h - 18;
    if (why === 'owned' || why === 'bought') {
      drawIcon(ctx, 'check', c.x + c.w / 2 - 34, by, 16, PAL.liveGreen);
      text(ctx, why === 'owned' ? 'OWNED' : isFree(offer) ? 'GOT IT' : 'BOUGHT', c.x + c.w / 2 + 8, by + 1, { size: 15, font: 'display', track: 2, color: PAL.liveGreen });
    } else if (why === 'level') {
      drawIcon(ctx, 'lock', c.x + c.w / 2 - 26, by, 16, PAL.muted);
      text(ctx, `LV ${offer.level}`, c.x + c.w / 2 + 8, by + 1, { size: 15, font: 'display', track: 2, color: PAL.muted });
    } else if (isFree(offer)) {
      text(ctx, 'FREE', c.x + c.w / 2, by + 1, { size: 16, font: 'display', track: 2, color: PAL.liveGreen });
    } else {
      text(ctx, priceText(offer), c.x + c.w / 2, by, { size: 14, font: 'body', weight: 800, color: why === 'funds' ? PAL.brick : PAL.ink, maxWidth: c.w - 10 });
    }
  }
}

const isFree = (offer) => !Object.keys(offer.price).length;

/** What an offer gives, as words: "Lava spikes", "1,000 Coins", "Lava spikes + 5 Gems". */
function grantText(offer) {
  return offer.grants.map((g) => (g.item ? itemById(g.item)?.name ?? g.item : formatAmount(g.currency, g.amount))).join(' + ');
}

/** What an offer is called: its title, or what it gives. */
const offerName = (offer) => offer.title || grantText(offer);

/** "1,500 Coins", "40 Gems", or both. */
function priceText(offer) {
  return Object.entries(offer.price).map(([cur, n]) => formatAmount(cur, n)).join(' + ');
}

/** A little pile of Coins or Gems in a square at (x, y), side `s`. */
function drawCoins(ctx, x, y, s, currency) {
  const { face, edge, mark } = COIN[currency];
  const r = s * 0.2;
  for (const [dx, dy] of [[-0.16, 0.12], [0.17, 0.1], [0, -0.08]]) {
    const cx = x + s * (0.5 + dx);
    const cy = y + s * (0.52 + dy);
    ctx.fillStyle = edge;
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.14, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, mark, cx, cy + 1, { size: r * 1.1, font: 'display', color: edge });
  }
}

/** How long until then, roughly: "3d 4h", "5h 12m", "9m". */
function countdown(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m % 60}m`;
  return `${m}m`;
}
