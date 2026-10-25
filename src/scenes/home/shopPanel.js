import { text, slab, chamfer, titlePlate, PAL } from '../../core/ui.js';
import { drawIcon } from '../../core/icons.js';
import { getCustom, setCustom, setCharacter, getPlayerName } from '../../core/storage.js';
import { parse, encode, cleanAthleteName, DEFAULT_NAME } from '../../athletes/custom.js';
import { itemById, owns, noGear, SLOT_NAMES } from '../../economy/items.js';
import { cantBuy, shopDay } from '../../economy/shop.js';
import { levelOf } from '../../economy/levels.js';
import { formatAmount } from '../../economy/currencies.js';
import { isSignedIn } from '../../online/firebase.js';
import { cachedWallet } from '../../online/wallet.js';
import { myLevel } from '../../online/xp.js';
import { todaysShop, myInventory, openShop, buyItem } from '../../online/shop.js';
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
  'not-for-sale': 'That’s gone from the shop.',
  guest: 'Sign in with Google (Athlete tab) to buy gear.',
};

/**
 * THE SHOP tab (the home screen's far left; economy/shop.js): this week's two picks and today's four on top,
 * the basics underneath, each a card with the gear on your athlete close up,
 * its rarity, name and price (or OWNED, or the level it needs). Tap a card to
 * buy it; the server takes the price and keeps it for you (online/shop.js),
 * then you can wear it straight away. The shop is the same for everyone and
 * changes at midnight UTC (the week's on Mondays).
 */
export class ShopPanel {
  constructor(home) {
    this.home = home;
    this.game = home.game;
  }

  enter() {
    this.shop = todaysShop();
    this.inventory = myInventory();
    this.wallet = cachedWallet();
    this.level = myLevel()?.level ?? 1;
    this.busy = false;
    this.status = isSignedIn() ? null : { text: WHY.guest, color: WARN };
    const mine = parse(getCustom());
    this.look = mine?.look ?? MODEL;
    this.gear = mine?.gear ?? noGear();
    if (this.home.panels[this.home.tab] === this) this.onShow(); // the home screen opened on this tab
  }

  /** Coming to this tab: your athlete may have changed, and what you own (asked again: no network until you look). */
  onShow() {
    const mine = parse(getCustom());
    this.look = mine?.look ?? MODEL;
    this.gear = mine?.gear ?? noGear();
    this.wallet = cachedWallet() ?? this.wallet;
    if (!isSignedIn()) return;
    openShop()
      .then((a) => a && this.take(a))
      .catch(() => {
        this.status = { text: 'Offline: buying needs a connection.', color: WARN };
      });
  }

  take(a) {
    this.shop = a.shop ?? this.shop;
    this.inventory = a.inventory ?? this.inventory;
    this.wallet = cachedWallet();
    if (this.wallet) this.level = levelOf(this.wallet.xp);
    this.layout(this.game.view, this.bottom);
  }

  /** `bottom`: the top of the tab bar. */
  layout(view, bottom) {
    this.bottom = bottom;
    const s = view.safe;
    const margin = 16 + Math.max(s.l, s.r);
    const W = view.w - margin * 2;
    const gap = 12;
    // Top row: the week's picks (a little wider), a gap, today's.
    const w1 = Math.min(170, (W - 5 * gap - 20) / 6.3);
    const top = 124 + s.t;
    const h1 = Math.min(200, (bottom - top - 60) * 0.52);
    let x = view.w / 2 - (2 * w1 * 1.15 + 4 * w1 + 4 * gap + 20) / 2;
    this.cards = [];
    this.labels = [];
    this.labels.push({ x, y: top - 14, text: 'THIS WEEK', until: this.shop.nextWeek });
    for (const id of this.shop.weekly) {
      this.cards.push({ id, x, y: top, w: w1 * 1.15, h: h1, featured: true });
      x += w1 * 1.15 + gap;
    }
    x += 20 - gap + gap;
    this.labels.push({ x, y: top - 14, text: 'TODAY', until: this.shop.nextDay });
    for (const id of this.shop.daily) {
      this.cards.push({ id, x, y: top, w: w1, h: h1 });
      x += w1 + gap;
    }
    // Bottom row: the basics.
    const n = this.shop.always.length;
    const w2 = Math.min(150, (W - (n - 1) * gap) / n);
    const top2 = top + h1 + 40;
    const h2 = Math.min(h1, bottom - 12 - top2);
    x = view.w / 2 - (n * w2 + (n - 1) * gap) / 2;
    this.labels.push({ x, y: top2 - 14, text: 'BASICS' });
    for (const id of this.shop.always) {
      this.cards.push({ id, x, y: top2, w: w2, h: h2 });
      x += w2 + gap;
    }
  }

  /** `events`: this tab's taps and keys (the home screen has sorted out swipes). */
  update(dt, events) {
    for (const e of events) {
      if (e.type !== 'down') continue;
      const card = this.cards.find((c) => e.x >= c.x && e.x <= c.x + c.w && e.y >= c.y && e.y <= c.y + c.h);
      if (card) this.tapCard(card);
    }
    // A new day while the shop is open: the new shop.
    if (Date.now() >= this.shop.nextDay) {
      this.shop = todaysShop();
      this.layout(this.game.view, this.bottom);
    }
  }

  /** What stops you buying `item` now, or null (as the server will decide it). */
  why(item) {
    if (!isSignedIn()) return 'guest';
    return cantBuy(item, shopDay(Date.now()), { level: this.level, inventory: this.inventory, wallet: this.wallet ?? {} });
  }

  tapCard(card) {
    if (this.busy) return;
    const item = itemById(card.id);
    const why = this.why(item);
    if (why === 'owned') return this.offerWear(item, 'You have it.');
    if (why) {
      this.status = { text: why === 'level' ? `${item.name} needs level ${item.level}. You’re level ${this.level}.` : WHY[why] ?? why, color: WARN };
      return;
    }
    const sure = window.confirm(`Buy ${item.name} for ${priceText(item)}?`);
    this.game.input.clear(); // the dialog swallowed the rest of that tap
    if (!sure) return;
    this.busy = true;
    this.status = { text: 'Buying…', color: DIM };
    buyItem(item.id)
      .then((a) => {
        if (a) this.take(a);
        this.status = { text: `Bought ${item.name}!`, color: OK };
        this.offerWear(item, `Bought ${item.name}!`);
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
    for (const l of this.labels) {
      const until = l.until ? `  ·  new in ${countdown(l.until - Date.now())}` : '';
      text(ctx, `${l.text}${until}`, l.x, l.y, { size: 15, font: 'display', track: 2, color: PAL.gold, align: 'left' });
    }
    for (const c of this.cards) this.drawCard(ctx, c);
  }

  /** A card: the rarity's band, your athlete wearing it close up, its name and price (or OWNED, or its level). */
  drawCard(ctx, c) {
    const item = itemById(c.id);
    if (!item) return;
    const why = this.why(item);
    const tint = RARITY_COLOR[item.rarity] ?? PAL.creamShade;
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
    drawWearing(ctx, px, py, s, this.look, { ...this.gear, [item.slot]: item.n }, item.slot);
    ctx.restore();
    const ty = py + s + 14;
    text(ctx, item.name, c.x + c.w / 2, ty, { size: 15, font: 'body', weight: 800, color: PAL.ink, maxWidth: c.w - 12 });
    text(ctx, `${item.rarity.toUpperCase()} ${SLOT_NAMES[item.slot].toUpperCase()}`, c.x + c.w / 2, ty + 16, { size: 11, font: 'display', track: 1.5, color: item.rarity === 'common' ? PAL.muted : tint, maxWidth: c.w - 12 });
    // The price, or why not.
    const by = c.y + c.h - 18;
    if (why === 'owned' || owns(item, { level: this.level, inventory: this.inventory })) {
      drawIcon(ctx, 'check', c.x + c.w / 2 - 34, by, 16, PAL.liveGreen);
      text(ctx, 'OWNED', c.x + c.w / 2 + 8, by + 1, { size: 15, font: 'display', track: 2, color: PAL.liveGreen });
    } else if (why === 'level') {
      drawIcon(ctx, 'lock', c.x + c.w / 2 - 26, by, 16, PAL.muted);
      text(ctx, `LV ${item.level}`, c.x + c.w / 2 + 8, by + 1, { size: 15, font: 'display', track: 2, color: PAL.muted });
    } else {
      text(ctx, priceText(item), c.x + c.w / 2, by, { size: 14, font: 'body', weight: 800, color: why === 'funds' ? PAL.brick : PAL.ink, maxWidth: c.w - 10 });
    }
  }
}

/** "1,500 Coins", "40 Gems", or both. */
function priceText(item) {
  return Object.entries(item.price).map(([cur, n]) => formatAmount(cur, n)).join(' + ');
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
