import { CONFIG } from '../../config.js';
import { Button, text, slab, chamfer, titlePlate, PAL } from '../../core/ui.js';
import { pinebrook } from '../../render/posterScenery.js';
import { drawFigure, runPose } from '../../athletes/stickFigure.js';
import { myAthlete, heightOf } from '../../athletes/roster.js';
import { cleanAthleteName } from '../../athletes/custom.js';
import { getPlayerName } from '../../core/storage.js';
import { isSignedIn } from '../../online/firebase.js';
import { myLevel } from '../../online/xp.js';
import { goSignIn } from '../../online/account.js';
import { Sideshow } from './sideshow.js';
import { flow } from '../../flow.js';


/**
 * The home screen's left tab: you. A cream card in a flat spotlight: your
 * athlete warming up in Pinebrook Park, your username, level and height,
 * and Customize (the Athlete Maker, scenes/athleteMaker.js) and Profile.
 * A guest gets Sign in with Google there too. Under it, on a band, the cast
 * up to no good (they're your rivals: you don't pick them any more; everyone
 * starts as an athlete of their own, scenes/onboarding.js).
 */
export class AthletePanel {
  constructor(home) {
    this.home = home;
    this.game = home.game;
  }

  enter() {
    this.phase = 0;
    this.status = null; // a sign-in that couldn't start
    this.busy = false;
    this.customizeBtn = new Button({ label: 'Customize', icon: 'edit', w: 200, h: 52, size: 21, color: PAL.orange, lip: PAL.orangeShade, onTap: () => flow.maker(this.game) });
    this.profileBtn = new Button({ label: 'Profile', icon: 'profile', look: 'chip', w: 140, h: 46, onTap: () => flow.profile(this.game, 'athlete') });
    this.signInBtn = new Button({ label: 'Sign in with Google', w: 250, h: 46, size: 18, color: PAL.blue, lip: PAL.blueShade, onTap: () => this.signIn() });
    this.sideshow = new Sideshow(); // the cast, up to no good under your card
  }

  get buttons() {
    return [this.customizeBtn, this.profileBtn, ...(isSignedIn() ? [] : [this.signInBtn])];
  }

  /** `bottom`: the top of the tab bar. */
  layout(view, bottom) {
    const margin = 20 + Math.max(view.safe.l, view.safe.r);
    const sw = Math.min(680, view.w - margin * 2);
    const sh = Math.min(300, bottom - 66 - 60);
    this.spot = { x: view.w / 2 - sw / 2, y: 66, w: sw, h: sh };
    this.bandY = this.spot.y + sh + 16;
    this.bottom = bottom;
    this.placeButtons();
  }

  placeButtons() {
    const b = this.spot;
    const vw = Math.min(220, b.w * 0.34);
    const tx = b.x + vw + 30;
    const y = b.y + b.h - 6 - 18 - this.customizeBtn.h;
    Object.assign(this.customizeBtn, { x: tx, y });
    Object.assign(this.profileBtn, { x: tx + this.customizeBtn.w + 12, y: y + 3 });
    Object.assign(this.signInBtn, { x: tx, y: b.y + 140 }); // a guest's, under its note
  }

  onShow() {}

  signIn() {
    if (this.busy) return;
    this.busy = true;
    this.status = null;
    try {
      // Back from Google's page without signing in: as you were. Signed in: the Profile screen says how it went.
      goSignIn(() => (this.busy = false));
    } catch {
      this.busy = false;
      this.status = 'Couldn’t open Google’s sign-in page.';
    }
  }

  /** `events`: this tab's taps and keys (the home screen has sorted out swipes). */
  update(dt, events) {
    this.phase += dt * 9;
    this.sideshow.update(dt);
    const buttons = this.buttons;
    this.signInBtn.enabled = !this.busy;
    for (const b of buttons) b.update(dt);
    for (const e of events) {
      if (e.type === 'key') {
        if (e.code === 'KeyE' || e.code === 'KeyM') flow.maker(this.game);
        continue;
      }
      if (e.type !== 'down') continue;
      if (buttons.some((b) => b.tap(e.x, e.y))) {
        if (this.game.scene !== this.home) return;
        continue;
      }
      // Tapping your athlete opens the Athlete Maker too.
      const s = this.spot;
      if (e.x >= s.x && e.x <= s.x + Math.min(220, s.w * 0.34) && e.y >= s.y && e.y <= s.y + s.h) return flow.maker(this.game);
    }
  }

  render(ctx, view) {
    // A flat spotlight from the top onto your card.
    ctx.fillStyle = PAL.ink2;
    ctx.beginPath();
    ctx.moveTo(view.w / 2 - 60, 0);
    ctx.lineTo(view.w / 2 + 60, 0);
    ctx.lineTo(view.w / 2 + 380, this.bandY - 2);
    ctx.lineTo(view.w / 2 - 380, this.bandY - 2);
    ctx.fill();
    titlePlate(ctx, view, 'YOUR ATHLETE', '', { face: PAL.gold, ink: PAL.ink });
    // The band under it, with a gold rule, and the cast's skits along it.
    ctx.fillStyle = PAL.ink2;
    ctx.fillRect(0, this.bandY, view.w, this.bottom - this.bandY);
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(0, this.bandY, view.w, 3);
    this.sideshow.draw(ctx, this.sideshowSlots(view), { w: view.w, h: this.bottom });
    this.renderSpot(ctx, myAthlete());
  }

  /** Where the sideshow's skits play: along the band under your card (if there's room). */
  sideshowSlots(view) {
    const H = Math.min(60, this.bottom - this.bandY - 18);
    if (H < 36) return [];
    return [
      { x: view.w * 0.22, ground: this.bottom - 12, H },
      { x: view.w * 0.78, ground: this.bottom - 10, H },
    ];
  }

  /** Your card: your athlete warming up in Pinebrook Park, your username, level and height, and the buttons. */
  renderSpot(ctx, c) {
    const b = this.spot;
    const lipH = 6;
    slab(ctx, b.x, b.y, b.w, b.h, { face: PAL.cream, lip: PAL.creamShade, lipH, c: 8 });
    const fh = b.h - lipH;
    const vw = Math.min(220, b.w * 0.34);
    ctx.save();
    chamfer(ctx, b.x, b.y, vw, fh, 8);
    ctx.clip();
    pinebrook(ctx, b.x - 60, b.y - 20, vw + 120, fh + 20, { trackH: 40, clouds: [[0.5, 0.2, 0.09]] });
    ctx.restore();
    ctx.fillStyle = shirtBar(c);
    ctx.fillRect(b.x + vw, b.y, 8, fh);
    const fx = b.x + vw / 2;
    const ground = b.y + fh - 18;
    ctx.fillStyle = 'rgba(38,34,79,0.35)';
    ctx.beginPath();
    ctx.ellipse(fx, ground + 2, 28, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    drawFigure(ctx, fx, ground, Math.min(150, fh - 40) * heightOf(c.colors), runPose(this.phase * 0.8, 0.9), c.colors, ground);

    const tx = b.x + vw + 30;
    const tw = b.x + b.w - 16 - tx;
    const name = getPlayerName();
    text(ctx, name.toUpperCase(), tx, b.y + 46, { size: 46, font: 'display', align: 'left', track: 2, color: PAL.ink, maxWidth: tw });
    // Level (signed in) or guest; the athlete's own name if it isn't your username; their height.
    const signedIn = isSignedIn();
    const lv = signedIn ? myLevel() : null;
    const bits = [signedIn ? (lv ? `Level ${lv.level}` : null) : 'Guest', `${(CONFIG.figure.height * heightOf(c.colors)).toFixed(2)} m`];
    if (cleanAthleteName(name).toLowerCase() !== c.name.toLowerCase()) bits.splice(1, 0, `races as ${c.name}`);
    text(ctx, bits.filter(Boolean).join('  ·  '), tx + 2, b.y + 88, { size: 18, font: 'body', weight: 700, align: 'left', color: PAL.muted, maxWidth: tw });
    if (!signedIn) {
      text(ctx, this.status ?? 'Sign in to keep your progress and winnings and go on the leaderboards.', tx + 2, b.y + 122, { size: 15, font: 'body', weight: 600, align: 'left', color: this.status ? PAL.brick : PAL.ink, maxWidth: tw });
    }
    for (const btn of this.buttons) btn.draw(ctx);
  }
}

/** A shirt colour that shows on cream (a white shirt goes darker). */
function shirtBar(c) {
  return /^#f[0-9a-f]f[0-9a-f]f[0-9a-f]$/i.test(c.colors.shirt) || c.colors.shirt.toLowerCase() === '#ffffff' ? '#C9C3B2' : c.colors.shirt;
}
