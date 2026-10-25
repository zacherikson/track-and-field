import { Button, text, slab, chamfer, titlePlate, nameTag, PAL } from '../core/ui.js';
import { drawIcon } from '../core/icons.js';
import { pinebrook } from '../render/posterScenery.js';
import { drawFigure, runPose } from '../athletes/stickFigure.js';
import { relaxed, emote } from '../brawl/poses.js';
import { LOOK, STARTERS, parse, encode, lookColors, isCode, athleteFromCode, cleanAthleteName, DEFAULT_NAME } from '../athletes/custom.js';
import { getPlayerName, setPlayerName, cleanName, isMadeUpName, getCustom, setCustom, getCharacter, setCharacter, setOnboarded } from '../core/storage.js';
import { isSignedIn, setUsername, claimedUsername } from '../online/firebase.js';
import { syncProgress } from '../online/progress.js';
import { goSignIn, completeSignIn, signInError, usernameError } from '../online/account.js';
import { openInvite } from './inviteScreen.js';
import { flow } from '../flow.js';

const WARN = '#ffb35c';
const OK = '#7fd8a0';
const SOFT = 'rgba(245,234,208,0.75)';
const STEPS = ['account', 'name', 'look'];
const STEP_LABELS = ['Account', 'Username', 'Athlete'];
const SYNC_WAIT = 5000; // ms to wait for your account's athlete before going on without it

/**
 * The first-launch setup: what a new player sees before the menu, three
 * steps, any already done skipped.
 *
 *   1. Account: sign in with Google (or play as a guest for now).
 *   2. Username: claim the name shown on the leaderboards (firebase.js setUsername).
 *   3. Athlete: male or female, and a skin tone (custom.js STARTERS). Once
 *      only: an athlete you'd already made is simply yours (no picking
 *      again). The rest of the look is the Athlete Maker's, from the
 *      Athlete tab, any time.
 *
 * Players from before this run it once as well, so everyone ends up as an
 * athlete of their own (the six cast athletes are rivals only now). Signing
 * out clears it (profileScene.js), so the next player sets up from the start.
 */
export class OnboardingScene {
  /**
   * `signingIn`: finishGoogleSignIn()'s promise, when the page has just come back from Google's sign-in.
   * `invite`: a squad invite the game was opened from, shown once you're set up.
   */
  constructor(signingIn = null, invite = null) {
    this.signingIn = signingIn;
    this.invite = invite;
  }

  enter() {
    this.t = 0;
    this.step = null; // what's showing: a STEPS id, or null while working out which
    this.shown = []; // the steps shown so far (Back goes through them)
    this.status = null; // { text, color }
    this.busy = false;
    this.nameClaimed = false;
    this.nameFailed = false; // couldn't reach the server: you can skip the name for now
    this.react = null;
    const chip = (o) => new Button({ look: 'chip', h: 46, ...o });
    this.googleBtn = new Button({ label: 'Sign in with Google', w: 320, h: 60, size: 24, color: PAL.blue, lip: PAL.blueShade, onTap: () => this.signIn() });
    this.guestBtn = chip({ label: 'Play as guest', w: 184, onTap: () => this.goName() });
    this.nameBtn = new Button({ label: 'Choose a name', w: 250, h: 56, size: 24, color: PAL.orange, lip: PAL.orangeShade, onTap: () => this.chooseName() });
    this.nextBtn = new Button({ label: 'Next', icon: 'next', w: 170, h: 56, size: 24, color: PAL.liveGreen, lip: PAL.liveShade, onTap: () => this.goLook() });
    this.skipBtn = chip({ label: 'Skip for now', w: 170, onTap: () => this.goLook() });
    this.goBtn = new Button({ label: 'Let’s go', icon: 'check', w: 190, h: 56, size: 24, color: PAL.liveGreen, lip: PAL.liveShade, onTap: () => this.finish() });
    this.backBtn = chip({ label: 'Back', icon: 'back', w: 116, onTap: () => this.back() });
    this.setupLook();
    this.layout(this.game.view);
    if (this.signingIn) this.finishSignIn();
    else if (isSignedIn()) this.goName();
    else this.show('account');
  }

  /** The athletes to pick from on the last step: the two starters. */
  setupLook() {
    this.options = [
      { id: 'male', label: 'MALE', look: STARTERS.male },
      { id: 'female', label: 'FEMALE', look: STARTERS.female },
    ];
    this.choice = null; // nothing picked yet: Let's go waits
    this.skin = STARTERS.male.skin;
  }

  get buttons() {
    const back = this.shown.length > 1 && !this.busy ? [this.backBtn] : [];
    if (this.step === 'account') return [this.googleBtn, this.guestBtn, ...back];
    if (this.step === 'name') return [...(this.nameClaimed ? [this.nextBtn] : [this.nameBtn]), ...(this.nameFailed ? [this.skipBtn] : []), ...back];
    if (this.step === 'look') return [this.goBtn, ...back];
    return [];
  }

  show(step) {
    this.step = step;
    if (this.shown.at(-1) !== step) this.shown.push(step);
    this.layout(this.game.view);
  }

  back() {
    if (this.busy || this.shown.length < 2) return;
    this.shown.pop();
    this.status = null;
    this.step = this.shown.at(-1);
    this.layout(this.game.view);
  }

  // --- Step 1: your account ---

  signIn() {
    if (this.busy) return;
    this.busy = true;
    this.status = { text: 'Opening Google…', color: SOFT };
    try {
      goSignIn(() => {
        this.busy = false;
        this.status = null;
      });
    } catch {
      this.busy = false;
      this.status = { text: 'Couldn’t open Google’s sign-in page.', color: WARN };
    }
  }

  finishSignIn() {
    this.show('account');
    this.busy = true;
    this.status = { text: 'Signing in…', color: SOFT };
    completeSignIn(this.signingIn, (t) => (this.status = { text: t, color: OK }))
      .then(({ reloading }) => {
        if (reloading) return; // back here as that player, which skips what they've done
        this.busy = false;
        this.status = null;
        this.goName();
      })
      .catch((e) => {
        this.busy = false;
        this.status = { text: signInError(e), color: WARN };
      });
  }

  // --- Step 2: your username ---

  /** On to the username, unless you've claimed one already (then on to your athlete). */
  async goName() {
    if (this.busy) return;
    this.status = null;
    if (!isMadeUpName(getPlayerName())) return this.goLook(); // only a claimed name replaces the made-up one
    // A made-up name here may still have been claimed on the server (from before it was kept on the phone).
    this.busy = true;
    this.step = null;
    this.status = { text: 'Checking…', color: SOFT };
    const name = await claimedUsername().catch(() => null);
    this.busy = false;
    this.status = null;
    if (name) {
      setPlayerName(name);
      return this.goLook();
    }
    this.show('name');
  }

  chooseName() {
    if (this.busy) return;
    const typed = window.prompt('Your username (up to 16 letters or numbers)', isMadeUpName(getPlayerName()) ? '' : getPlayerName());
    this.game.input.clear(); // the dialog swallowed the rest of that tap
    if (typed == null) return;
    const name = cleanName(typed);
    if (!name) {
      this.status = { text: "Use letters and numbers (spaces and _ . ' - are fine inside)", color: WARN };
      return;
    }
    this.busy = true;
    this.status = { text: 'Saving…', color: SOFT };
    setUsername(name)
      .then(() => {
        setPlayerName(name);
        this.nameClaimed = true;
        this.nameFailed = false;
        this.status = { text: 'That name is yours.', color: OK };
      })
      .catch((e) => {
        this.status = { text: usernameError(e, name), color: WARN };
        if (e?.message !== 'taken' && e?.code !== 'permission-denied') this.nameFailed = true;
      })
      .finally(() => {
        this.busy = false;
        this.layout(this.game.view);
      });
  }

  // --- Step 3: your athlete ---

  /** On to your athlete, unless your account already has one you made (then you're done). */
  async goLook() {
    if (this.busy) return;
    this.status = null;
    if (isSignedIn()) {
      // Your account's athlete, if you made one on another phone (not waiting for ever offline).
      this.busy = true;
      this.step = null;
      this.status = { text: 'Loading your athlete…', color: SOFT };
      await Promise.race([syncProgress().catch(() => false), new Promise((r) => setTimeout(r, SYNC_WAIT))]);
      this.busy = false;
      this.status = null;
    }
    if (isCode(getCharacter()) && athleteFromCode(getCharacter())) return this.finish(true);
    // An athlete you'd made (while playing as one of the cast): you're them now, no picking again.
    if (parse(getCustom())) {
      setCharacter(getCustom());
      return this.finish(true);
    }
    this.setupLook();
    this.show('look');
  }

  pick(option) {
    this.choice = option;
    this.skin = option.look.skin;
    this.changed();
  }

  setSkin(k) {
    if (this.skin === k) return;
    this.skin = k;
    this.changed();
  }

  changed() {
    this.react = { id: ['flex', 'dance', 'dab', 'taunt'][Math.floor(Math.random() * 4)], t: 0 };
  }

  /** The look as it stands: the athlete picked, in the skin tone picked. */
  get look() {
    if (!this.choice) return null;
    return { ...this.choice.look, skin: this.skin };
  }

  /** drawFigure's colors for `look`. */
  colorsOf(look) {
    return lookColors(look);
  }

  /** Done: your athlete saved (unless `kept`: you have one already), then the menu. */
  finish(kept = false) {
    if (!kept) {
      if (!this.look) return;
      const code = encode(this.look, cleanAthleteName(getPlayerName()) || DEFAULT_NAME);
      setCustom(code);
      setCharacter(code);
    }
    setOnboarded(true);
    flow.menu(this.game, kept ? 'play' : 'athlete');
    if (this.invite) openInvite(this.game, this.invite);
  }

  // --- Layout, input, drawing ---

  onResize(view) {
    this.layout(view);
  }

  layout(view) {
    const s = view.safe;
    const margin = 16 + Math.max(s.l, s.r);
    const cx = view.w / 2;
    Object.assign(this.backBtn, { x: margin, y: 12 + s.t });
    // Account: Google above, guest below.
    Object.assign(this.googleBtn, { x: cx - this.googleBtn.w / 2, y: 300 });
    Object.assign(this.guestBtn, { x: cx - this.guestBtn.w / 2, y: 374 });
    // Username: the button(s) under the bib.
    const nameRow = [this.nameClaimed ? this.nextBtn : this.nameBtn, ...(this.nameFailed ? [this.skipBtn] : [])];
    let x = cx - (nameRow.reduce((a, b) => a + b.w, 0) + 16 * (nameRow.length - 1)) / 2;
    for (const b of nameRow) {
      Object.assign(b, { x, y: b.look === 'chip' ? 316 : 311 });
      x += b.w + 16;
    }
    // Athlete: the stage on the left, the picks on the right, Let's go under them.
    const bottom = view.h - 14 - s.b;
    const top = 92 + s.t;
    const sw = Math.max(220, Math.min(320, view.w * 0.3));
    this.stage = { x: margin, y: top, w: sw, h: bottom - top };
    const rx = margin + sw + 26;
    const rw = view.w - margin - rx;
    const n = this.options.length;
    const cw = Math.min(200, (rw - 14 * (n - 1)) / n);
    const ch = 220;
    const cx0 = rx + (rw - (cw * n + 14 * (n - 1))) / 2;
    this.cards = this.options.map((o, i) => ({ o, x: cx0 + i * (cw + 14), y: top, w: cw, h: ch, pressT: this.cards?.[i]?.pressT ?? 0 }));
    const sy = top + ch + 46;
    const ts = Math.floor(Math.min(40, (rw - 9 * 8) / LOOK.skin.length));
    const sx0 = rx + (rw - (ts * LOOK.skin.length + 8 * (LOOK.skin.length - 1))) / 2;
    this.skinRow = { label: { x: rx + rw / 2, y: sy - 18 }, tiles: LOOK.skin.map((_, k) => ({ x: sx0 + k * (ts + 8), y: sy, s: ts })) };
    Object.assign(this.goBtn, { x: view.w - margin - this.goBtn.w, y: bottom - this.goBtn.h });
    this.hintBox = { x: rx, y: bottom - 28, w: rw - this.goBtn.w - 16 };
  }

  update(dt, t) {
    this.t += dt;
    if (this.react && (this.react.t += dt) > 1.3) this.react = null;
    for (const k of this.cards) k.pressT = Math.max(0, k.pressT - dt);
    const buttons = this.buttons;
    this.goBtn.enabled = !!this.choice;
    for (const b of [this.googleBtn, this.guestBtn, this.nameBtn, this.nextBtn, this.skipBtn]) b.enabled = !this.busy;
    for (const e of this.game.input.consume(t + dt)) {
      if (e.type === 'key') {
        if (e.code === 'Escape') this.back();
        else if (e.code === 'Enter') {
          if (this.step === 'account') this.goName();
          else if (this.step === 'name') this.nameClaimed ? this.goLook() : this.chooseName();
          else if (this.step === 'look') this.finish();
        }
        continue;
      }
      if (e.type !== 'down') continue;
      if (buttons.some((b) => b.tap(e.x, e.y))) {
        if (this.game.scene !== this) return;
        continue;
      }
      if (this.step !== 'look') continue;
      const card = this.cards.find((k) => e.x >= k.x && e.x <= k.x + k.w && e.y >= k.y && e.y <= k.y + k.h);
      if (card) {
        card.pressT = 0.12;
        this.pick(card.o);
        continue;
      }
      const k = this.skinRow.tiles.findIndex((tl) => e.x >= tl.x - 4 && e.x <= tl.x + tl.s + 4 && e.y >= tl.y - 6 && e.y <= tl.y + tl.s + 6);
      if (k >= 0) this.setSkin(k);
    }
    for (const b of buttons) b.update(dt);
  }

  render(ctx, view) {
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(0, 0, view.w, view.h);
    const title = { account: 'WELCOME TO TRACK ROYALE', name: 'PICK A USERNAME', look: 'CHOOSE YOUR ATHLETE' }[this.step] ?? 'TRACK ROYALE';
    titlePlate(ctx, view, title, '', { y: 34 + view.safe.t, face: PAL.gold, ink: PAL.ink, maxW: view.w - 300 });
    this.renderSteps(ctx, view);
    if (this.step === 'account') this.renderAccount(ctx, view);
    else if (this.step === 'name') this.renderName(ctx, view);
    else if (this.step === 'look') this.renderLook(ctx, view);
    else this.renderStatus(ctx, view, view.h / 2);
    for (const b of this.buttons) b.draw(ctx);
  }

  /** Where you are: the three steps under the title, the one showing in gold. */
  renderSteps(ctx, view) {
    const i = STEPS.indexOf(this.step);
    const y = 72 + view.safe.t;
    const gap = 130;
    STEPS.forEach((_, k) => {
      const x = view.w / 2 + (k - 1) * gap;
      const on = k === i;
      const done = i > k;
      ctx.fillStyle = on ? PAL.gold : done ? PAL.liveGreen : PAL.ink2;
      ctx.beginPath();
      ctx.arc(x - 44, y, 9, 0, Math.PI * 2);
      ctx.fill();
      if (done) drawIcon(ctx, 'check', x - 44, y, 12, PAL.cream);
      else text(ctx, String(k + 1), x - 44, y + 1, { size: 12, font: 'body', weight: 800, color: on ? PAL.ink : SOFT });
      text(ctx, STEP_LABELS[k].toUpperCase(), x - 30, y + 1, { size: 13, font: 'display', track: 1, align: 'left', color: on ? PAL.gold : SOFT });
    });
  }

  renderStatus(ctx, view, y) {
    if (this.status) text(ctx, this.status.text, view.w / 2, y, { size: 18, font: 'body', color: this.status.color, maxWidth: view.w - 40 });
  }

  renderAccount(ctx, view) {
    const w = Math.min(560, view.w - 40);
    const x0 = view.w / 2 - w / 2;
    const y0 = 98 + view.safe.t;
    slab(ctx, x0, y0, w, 186, { face: PAL.ink2, lip: PAL.inkShade, lipH: 5, c: 7 });
    text(ctx, 'SET UP YOUR ACCOUNT', view.w / 2, y0 + 26, { size: 22, font: 'display', track: 2, color: PAL.gold });
    const perks = ['Your own username on the online leaderboards', 'Keep your winnings, medals and progress', 'Play as you on any phone'];
    perks.forEach((p, k) => {
      const y = y0 + 68 + k * 36;
      drawIcon(ctx, 'check', x0 + 46, y, 22, OK);
      text(ctx, p, x0 + 68, y + 1, { size: 20, font: 'body', weight: 700, align: 'left', color: PAL.cream, maxWidth: w - 90 });
    });
    this.renderStatus(ctx, view, 436);
    if (!this.status) text(ctx, 'As a guest you can sign in later from the Athlete tab.', view.w / 2, 436, { size: 15, font: 'body', weight: 600, color: SOFT, maxWidth: view.w - 40 });
  }

  renderName(ctx, view) {
    // Your username, on a race bib (as on the Profile screen).
    const w = Math.min(500, view.w - 40);
    const x0 = view.w / 2 - w / 2;
    const cx = view.w / 2;
    const by = 104 + view.safe.t;
    const bh = 176;
    ctx.fillStyle = PAL.inkShade;
    chamfer(ctx, x0 + 6, by + 7, w, bh, 8);
    ctx.fill();
    ctx.fillStyle = PAL.cream;
    chamfer(ctx, x0, by, w, bh, 8);
    ctx.fill();
    ctx.fillStyle = PAL.orange;
    ctx.fillRect(x0, by + 16, w, 26);
    text(ctx, 'USERNAME', cx, by + 30, { size: 18, font: 'display', track: 3, color: PAL.cream });
    ctx.fillStyle = PAL.creamShade;
    for (const [px, py] of [[x0 + 14, by + 12], [x0 + w - 14, by + 12], [x0 + 14, by + bh - 12], [x0 + w - 14, by + bh - 12]]) {
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    const placeholder = !this.nameClaimed && isMadeUpName(getPlayerName());
    text(ctx, placeholder ? 'YOUR NAME HERE' : getPlayerName().toUpperCase(), cx, by + 88, { size: placeholder ? 40 : 56, font: 'display', track: 2, color: placeholder ? PAL.creamShade : PAL.ink, maxWidth: w - 50 });
    text(ctx, 'Shown on the leaderboards and to everyone you race. No two players can have the same name.', cx, by + 140, { size: 15, font: 'body', weight: 600, color: PAL.muted, maxWidth: w - 40 });
    this.renderStatus(ctx, view, 400);
  }

  renderLook(ctx, view) {
    const look = this.look;
    // The stage: Pinebrook Park, your athlete warming up (or waiting for you to pick one).
    const st = this.stage;
    slab(ctx, st.x, st.y, st.w, st.h, { face: PAL.cream, lip: PAL.creamShade, lipH: 6, c: 8 });
    ctx.save();
    chamfer(ctx, st.x, st.y, st.w, st.h - 6, 8);
    ctx.clip();
    const trackH = Math.min(80, st.h * 0.26);
    pinebrook(ctx, st.x - 40, st.y - 10, st.w + 80, st.h + 4, { trackH, clouds: [[0.3, 0.16, 0.06], [0.8, 0.24, 0.05]] });
    const ground = st.y + st.h - 6 - trackH * 0.45;
    if (look) {
      const colors = this.colorsOf(look);
      const hop = this.react ? Math.sin(Math.min(1, this.react.t / 0.3) * Math.PI) * 12 : 0;
      drawFigure(ctx, st.x + st.w / 2, ground - hop, Math.min(st.h * 0.56, 200) * colors.height, this.pose(), colors, ground);
    }
    ctx.restore();
    if (look) nameTag(ctx, getPlayerName(), st.x + st.w / 2, st.y + 26, 20);
    else text(ctx, 'Pick one →', st.x + st.w / 2, st.y + st.h * 0.42, { size: 26, font: 'display', track: 1, color: PAL.ink });

    // The picks: a card each, yours in gold.
    for (const k of this.cards) {
      const on = k.o === this.choice;
      const pressed = k.pressT > 0;
      const lipH = 5;
      slab(ctx, k.x, k.y, k.w, k.h, { face: on ? PAL.gold : PAL.cream, lip: on ? PAL.goldShade : PAL.creamShade, lipH, c: 7, pressed });
      const y = k.y + (pressed ? lipH - 1 : 0);
      const colors = this.colorsOf({ ...k.o.look, skin: this.skin });
      ctx.fillStyle = colors.shirt;
      ctx.fillRect(k.x, y + 10, k.w, 8);
      const g = y + k.h - lipH - 40;
      drawFigure(ctx, k.x + k.w / 2, g, Math.min(130, k.h - 80) * colors.height, on ? runPose(this.t * 9, 0.6) : relaxed(0, 0, this.t), colors, g);
      text(ctx, k.o.label, k.x + k.w / 2, y + k.h - lipH - 18, { size: 22, font: 'display', track: 2, color: PAL.ink, maxWidth: k.w - 12 });
    }

    // Skin tone.
    const sr = this.skinRow;
    text(ctx, 'SKIN TONE', sr.label.x, sr.label.y, { size: 17, font: 'display', track: 2, color: PAL.cream });
    sr.tiles.forEach((tl, k) => {
      const on = k === this.skin;
      if (on) {
        ctx.fillStyle = PAL.gold;
        chamfer(ctx, tl.x - 4, tl.y - 4, tl.s + 8, tl.s + 8, 6);
        ctx.fill();
      }
      ctx.fillStyle = on ? PAL.ink : PAL.inkShade;
      chamfer(ctx, tl.x, tl.y, tl.s, tl.s, 5);
      ctx.fill();
      ctx.fillStyle = LOOK.skin[k];
      chamfer(ctx, tl.x + 3, tl.y + 3, tl.s - 6, tl.s - 6, 4);
      ctx.fill();
    });
    const h = this.hintBox;
    text(ctx, 'Hair, kit, height and build: change them any time on the Athlete tab.', h.x, h.y, { size: 15, font: 'body', weight: 600, align: 'left', color: SOFT, maxWidth: h.w });
  }

  /** The stage's pose: reacting to a change, else jogging on the spot. */
  pose() {
    if (this.react) return emote(this.react.id, this.react.t);
    return this.t % 5 < 3 ? runPose(this.t * 10, 0.8) : relaxed(0, 0, this.t);
  }
}
