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
 *   price     null: free once you reach `level` (the starter set). Otherwise
 *             { earned?, premium? }, bought in the shop (a later phase)
 *   sponsor   null, or a brand (later)
 *   art       how it's drawn (stickFigure.js drawFigure, from gearColors)
 */
export const SLOTS = ['spikes', 'socks', 'headband', 'glasses', 'sleeves', 'kit'];
export const SLOT_NAMES = { spikes: 'Spikes', socks: 'Socks', headband: 'Headband', glasses: 'Glasses', sleeves: 'Sleeves', kit: 'Kit' };
export const RARITIES = ['common', 'rare', 'epic', 'legendary'];

const item = (slot, n, id, name, level, rarity, art) => ({ id, slot, n, name, rarity, level, price: null, sponsor: null, art });

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
 * Do you have it? A free item once you're at its level; a priced one if it's
 * in your inventory (item ids: the shop, later). `level` null (a guest, or not
 * known yet) counts as level 1.
 */
export function owns(item, { level = 1, inventory = [] } = {}) {
  if (!item) return true; // nothing on
  if (item.price == null) return (level ?? 1) >= item.level;
  return inventory.includes(item.id);
}

/** The free items that come with reaching `level` (exactly that level). */
export function unlockedAt(level) {
  return ITEMS.filter((i) => i.price == null && i.level === level);
}

/** What `gear` ({ [slot]: n }) looks like on the figure: the art of each item worn, merged (stickFigure.js reads these keys). */
export function gearColors(gear) {
  const out = {};
  for (const slot of SLOTS) Object.assign(out, itemAt(slot, gear?.[slot])?.art ?? {});
  return out;
}
