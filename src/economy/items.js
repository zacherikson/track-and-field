/**
 * ITEMS (the design doc's "Shop and items"): cosmetic gear for the athletes
 * you make (athletes/custom.js), worn in every race and pose. Looks only:
 * nothing here changes how anyone runs.
 *
 * Defined as data. Each item:
 *   id        neutral and permanent ('spikes-volt-01'): what inventories store
 *   slot      where it goes (SLOTS)
 *   n         its number in its slot, 1-35, never reused: what an athlete's code
 *             carries (custom.js), so others see your gear in live races
 *   name      what players see (not final, like the currency names)
 *   rarity    common | rare | epic | legendary
 *   level     the level that unlocks it
 *   avail     'level': free once you reach `level` (the starter set).
 *             'shop': yours once it's in your inventory, which only a shop
 *             offer puts it in (economy/shop.js). What it costs, and when
 *             it's on sale, is the server's business, not the catalog's.
 *   sponsor   null, or a brand (later)
 *   art       how it's drawn (stickFigure.js drawFigure, from gearColors)
 */
export const SLOTS = ['spikes', 'socks', 'headband', 'glasses', 'sleeves', 'kit'];
export const SLOT_NAMES = { spikes: 'Spikes', socks: 'Socks', headband: 'Headband', glasses: 'Glasses', sleeves: 'Sleeves', kit: 'Kit' };
export const RARITIES = ['common', 'rare', 'epic', 'legendary'];

const item = (slot, n, id, name, level, rarity, art) => ({ id, slot, n, name, rarity, level, avail: 'level', sponsor: null, art });
// A shop item: `level` is the level the shop's own offers ask for (server/src/shopPlan.js).
const sale = (slot, n, id, name, level, rarity, art) => ({ id, slot, n, name, rarity, level, avail: 'shop', sponsor: null, art });

export const ITEMS = [
  // Spikes: the shoe, and its sole.
  item('spikes', 1, 'spikes-plain-01', 'Plain spikes', 1, 'common', { shoe: '#f2f2f2', sole: '#3d3d3d' }),
  item('spikes', 2, 'spikes-volt-01', 'Volt spikes', 2, 'common', { shoe: '#c9f23a', sole: '#2b2b2b' }),
  item('spikes', 3, 'spikes-blaze-01', 'Blaze spikes', 4, 'rare', { shoe: '#ff6a2b', sole: '#f5f5f5' }),
  item('spikes', 4, 'spikes-ice-01', 'Ice spikes', 6, 'rare', { shoe: '#9fe3ff', sole: '#2f7fd8' }),
  item('spikes', 5, 'spikes-midnight-01', 'Midnight spikes', 9, 'epic', { shoe: '#1b1b2f', sole: '#f2c230' }),
  item('spikes', 6, 'spikes-gold-01', 'Gold spikes', 12, 'legendary', { shoe: '#f2c230', sole: '#8a6a10' }),
  // Socks: colour, how far up the shin (figure heights), and a stripe round the top.
  item('socks', 1, 'socks-white-01', 'White crew socks', 1, 'common', { sock: '#f5f5f5', sockH: 0.04 }),
  item('socks', 2, 'socks-black-01', 'Black crew socks', 2, 'common', { sock: '#2b2b2b', sockH: 0.04 }),
  item('socks', 3, 'socks-red-01', 'Red tall socks', 5, 'rare', { sock: '#d32020', sockH: 0.12 }),
  item('socks', 4, 'socks-stripe-01', 'Striped tall socks', 8, 'epic', { sock: '#f5f5f5', sockH: 0.12, sockStripe: '#2f7fd8' }),
  // Headbands (over any hairstyle).
  item('headband', 1, 'band-red-01', 'Red headband', 3, 'common', { band: '#d32020' }),
  item('headband', 2, 'band-blue-01', 'Royal headband', 5, 'common', { band: '#2f5fd8' }),
  item('headband', 3, 'band-white-01', 'White headband', 7, 'rare', { band: '#f5f5f5' }),
  item('headband', 4, 'band-gold-01', 'Gold headband', 10, 'epic', { band: '#f2c230' }),
  // Glasses: shades (dark lenses) or a wraparound visor.
  item('glasses', 1, 'glasses-shades-01', 'Shades', 3, 'common', { lens: '#1b1b1b', lensKind: 'shades' }),
  item('glasses', 2, 'glasses-mirror-01', 'Mirror visor', 7, 'rare', { lens: '#6fb8ff', lensKind: 'visor' }),
  item('glasses', 3, 'glasses-gold-01', 'Gold visor', 13, 'legendary', { lens: '#f2c230', lensKind: 'visor' }),
  // Sleeves: wristbands on both arms, or a sleeve down the near arm.
  item('sleeves', 1, 'sleeves-wrist-01', 'Wristbands', 2, 'common', { sleeve: '#f5f5f5', sleeveKind: 'wrist' }),
  item('sleeves', 2, 'sleeves-black-01', 'Black arm sleeve', 6, 'rare', { sleeve: '#2b2b2b', sleeveKind: 'sleeve' }),
  item('sleeves', 3, 'sleeves-neon-01', 'Neon arm sleeve', 11, 'epic', { sleeve: '#c9f23a', sleeveKind: 'sleeve' }),
  // Kit: a pattern on the shirt.
  item('kit', 1, 'kit-stripe-01', 'Racing stripe', 3, 'common', { kit: '#f5f5f5', kitKind: 'stripe' }),
  item('kit', 2, 'kit-hoops-01', 'Hoops', 7, 'rare', { kit: '#12203a', kitKind: 'hoops' }),
  item('kit', 3, 'kit-yoke-01', 'Gold yoke', 10, 'epic', { kit: '#f2c230', kitKind: 'yoke' }),

  // THE SHOP's (economy/shop.js): only ever bought.
  sale('spikes', 7, 'spikes-bubblegum-01', 'Bubblegum spikes', 2, 'common', { shoe: '#ff8fc7', sole: '#f5f5f5' }),
  sale('spikes', 8, 'spikes-forest-01', 'Forest spikes', 2, 'common', { shoe: '#2e8b57', sole: '#f5f5f5' }),
  sale('socks', 5, 'socks-pink-01', 'Pink tall socks', 2, 'common', { sock: '#ff8fc7', sockH: 0.12 }),
  sale('headband', 5, 'band-black-01', 'Black headband', 2, 'common', { band: '#1b1b1b' }),
  sale('glasses', 4, 'glasses-blackvisor-01', 'Black visor', 3, 'common', { lens: '#1b1b1b', lensKind: 'visor' }),
  sale('sleeves', 4, 'sleeves-redwrist-01', 'Red wristbands', 2, 'common', { sleeve: '#d32020', sleeveKind: 'wrist' }),
  sale('kit', 4, 'kit-blackstripe-01', 'Black stripe', 2, 'common', { kit: '#12203a', kitKind: 'stripe' }),
  sale('spikes', 9, 'spikes-lava-01', 'Lava spikes', 4, 'rare', { shoe: '#d32020', sole: '#ffb400' }),
  sale('spikes', 10, 'spikes-galaxy-01', 'Galaxy spikes', 6, 'epic', { shoe: '#5b2a86', sole: '#c9f23a' }),
  sale('spikes', 11, 'spikes-chrome-01', 'Chrome spikes', 10, 'legendary', { shoe: '#d3d8de', sole: '#5a5f66' }),
  sale('socks', 6, 'socks-gold-01', 'Gold crew socks', 3, 'rare', { sock: '#f2c230', sockH: 0.04 }),
  sale('socks', 7, 'socks-neon-01', 'Neon striped socks', 6, 'epic', { sock: '#c9f23a', sockH: 0.12, sockStripe: '#12203a' }),
  sale('headband', 6, 'band-volt-01', 'Volt headband', 4, 'rare', { band: '#c9f23a' }),
  sale('headband', 7, 'band-magenta-01', 'Magenta headband', 4, 'rare', { band: '#c2407e' }),
  sale('glasses', 5, 'glasses-redshades-01', 'Red shades', 4, 'rare', { lens: '#d32020', lensKind: 'shades' }),
  sale('glasses', 6, 'glasses-ice-01', 'Ice visor', 8, 'epic', { lens: '#9fe3ff', lensKind: 'visor' }),
  sale('sleeves', 5, 'sleeves-white-01', 'White arm sleeve', 5, 'rare', { sleeve: '#f5f5f5', sleeveKind: 'sleeve' }),
  sale('sleeves', 6, 'sleeves-goldwrist-01', 'Gold wristbands', 7, 'epic', { sleeve: '#f2c230', sleeveKind: 'wrist' }),
  sale('kit', 5, 'kit-whitehoops-01', 'White hoops', 5, 'rare', { kit: '#f5f5f5', kitKind: 'hoops' }),
  sale('kit', 6, 'kit-voltyoke-01', 'Volt yoke', 8, 'epic', { kit: '#c9f23a', kitKind: 'yoke' }),
  sale('kit', 7, 'kit-goldhoops-01', 'Gold hoops', 12, 'legendary', { kit: '#f2c230', kitKind: 'hoops' }),
];

/** The items for `slot`, by number. */
export function slotItems(slot) {
  return ITEMS.filter((i) => i.slot === slot).sort((a, b) => a.n - b.n);
}

/** Item number `n` in `slot`, or null (0, or one this build doesn't know). */
export function itemAt(slot, n) {
  return n ? ITEMS.find((i) => i.slot === slot && i.n === n) ?? null : null;
}

export const itemById = (id) => ITEMS.find((i) => i.id === id) ?? null;

/** Gear with nothing on: { [slot]: 0 }. */
export function noGear() {
  return Object.fromEntries(SLOTS.map((s) => [s, 0]));
}

/**
 * Do you have it? A starter item once you're at its level; a shop item if it's
 * in your inventory (item ids). `level` null (a guest, or not
 * known yet) counts as level 1.
 */
export function owns(item, { level = 1, inventory = [] } = {}) {
  if (!item) return true; // nothing on
  if (item.avail === 'level') return (level ?? 1) >= item.level;
  return inventory.includes(item.id);
}

/** The free items that come with reaching `level` (exactly that level). */
export function unlockedAt(level) {
  return ITEMS.filter((i) => i.avail === 'level' && i.level === level);
}

/** What `gear` ({ [slot]: n }) looks like on the figure: the art of each item worn, merged (stickFigure.js reads these keys). */
export function gearColors(gear) {
  const out = {};
  for (const slot of SLOTS) Object.assign(out, itemAt(slot, gear?.[slot])?.art ?? {});
  return out;
}
