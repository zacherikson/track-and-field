/**
 * THE ECONOMY'S NUMBERS (the design doc's Economy & Progression): what a race
 * pays, how levels come, what contracts are worth. Currency names are in
 * currencies.js; the shop's prices are the server's alone (server/src/shopPlan.js).
 *
 * THE MEET SERVER OWNS THESE. This file is its copy: what it pays and checks
 * by. The game reads the same numbers only to show them (the XP a race should
 * be worth, a contract's standards), and takes the server's over its own:
 * the server sends them (GET /api/balance) and the game lays them over what's
 * here (applyBalance, online/balance.js). So a change is made here, the server
 * deploys, and every phone shows it the next time it's at the menu, whatever
 * build it's running. What's here in a phone's build is only what it shows
 * before the server has answered.
 *
 * All placeholders.
 */
export const BALANCE = {
  fines: false, // built in, switched off at launch: a 'fine' change is refused while false
  premiumToEarned: 100, // earned currency for each premium converted (placeholder)
  // XP for finishing a race (src/economy/levels.js), by who you raced: `finish` for
  // finishing, plus `place[0]` for 1st, [1] for 2nd, [2] for 3rd when you raced anyone.
  // computer = campaigns, Special Events and Survival; live = people. Placeholders.
  xp: {
    training: { finish: 0, place: [] }, // open question (design doc): no XP for now
    computer: { finish: 10, place: [15, 10, 5] },
    live: { finish: 20, place: [30, 20, 10] },
    dailyCap: 1000, // XP a day at most: races are reported by the phones, so this limits a faked one
  },
  // Level L takes step·L·(L−1)/2 XP in all: level 2 at 100, 3 at 300, 4 at 600, 10 at 4,500.
  levels: { step: 100, max: 99 },
  // What a PUBLIC live room pays (src/economy/payouts.js; squad Practice pays nothing),
  // worked out by the server from everyone's results (src/online/liveResults.js). Placeholders.
  live: {
    finish: 25, // earned currency for finishing
    prize: [200, 100, 50], // ...plus this for 1st, 2nd, 3rd
    prizeMin: 2, // finishers needed for the place prizes (alone: just finishing)
    medalsMin: 3, // finishers needed for medals (no gold for beating one friend)
    medalPremium: [6, 3, 2], // premium currency with a gold, silver, bronze (1 gold = 2 silver = 3 bronze)
    tournament: 3, // a live tournament pays this many times as much (it's five events)
    giveUp: 90000, // ms waiting for a player's result once the others' are in; then it's settled without them
  },
  // CONTRACTS (src/economy/contracts.js): beat a campaign's tournament for an offer,
  // collect its pay once a day, keep up its one clause each week. Placeholders.
  contracts: {
    // Daily pay by contract (Pro also needs `proProof` medal points from live races).
    pay: { scholarship: 150, nil: 1500, pro: 7000 },
    proProof: 6, // medal points (gold 6, silver 3, bronze 2): one gold, or two silvers...
    // How good the offer is: medal points + 2 for each of the contract's standards you've met.
    grades: [
      { name: 'Rookie', points: 0, pay: 1 },
      { name: 'Starter', points: 8, pay: 1.3 },
      { name: 'Star', points: 20, pay: 1.7 },
    ],
    standardPoints: 2,
    // Qualifying standards: about what wins a race at that campaign's level (tools/simulate.mjs).
    standards: {
      scholarship: { sprint100: 11.1, hurdles110: 14.7, longjump: 6.4, polevault: 3.0, javelin: 71 },
      nil: { sprint100: 10.25, hurdles110: 13.65, longjump: 7.65, polevault: 4.0, javelin: 81.5 },
      pro: { sprint100: 9.4, hurdles110: 12.0, longjump: 9.25, polevault: 5.5, javelin: 94 },
    },
    clauseRaces: 3, // the clause: race this many times a week (any race but Training)
    probationCut: 0.2, // pay on probation: 20% less
    signingBonus: 1, // days of pay on signing
    requalify: 3, // after losing one: top-3 finishes before offers come again
    zoneEvery: 7, // days between changes of your time zone (your day ends at your midnight)
  },
};

/** Bumped when a number's meaning changes (not its value): a phone ignores a copy from another version. */
export const BALANCE_VERSION = 1;

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

/** `from` laid over `onto`, in place, wherever it's the same kind of thing: numbers, booleans, strings, lists, maps key by key. */
function lay(onto, from) {
  for (const key of Object.keys(onto)) {
    const a = onto[key];
    const b = from?.[key];
    if (isObj(a)) {
      if (isObj(b)) lay(a, b);
    } else if (Array.isArray(a)) {
      if (!Array.isArray(b)) continue;
      // A list of maps (the contract grades): one for one. A list of numbers (prizes by place): any few will do.
      if (a.length && a.every(isObj)) b.length === a.length && a.forEach((x, i) => isObj(b[i]) && lay(x, b[i]));
      else if (b.length <= 16 && b.every((x) => Number.isFinite(x))) onto[key] = [...b];
    } else if (typeof b === typeof a && (typeof b !== 'number' || Number.isFinite(b))) onto[key] = b;
  }
}

/**
 * Takes the server's numbers (`sent`: { v, balance }) over the ones here. Only
 * what's the same shape is taken: a number for a number, a list for a list, so
 * a bad or old copy can't break anything. Returns true if it was taken.
 */
export function applyBalance(sent) {
  if (!isObj(sent) || sent.v !== BALANCE_VERSION || !isObj(sent.balance)) return false;
  lay(BALANCE, sent.balance);
  return true;
}
