import { Button, text, roundRect } from '../core/ui.js';
import { getPlayerName, setPlayerName, cleanName } from '../core/storage.js';
import { setUsername, accountInfo, startGoogleSignIn, signOut } from '../online/firebase.js';
import { forgetBests, postBests } from '../online/bests.js';
import { renameInSquad } from '../online/squads.js';
import { flow } from '../flow.js';

const WARN = '#ffb35c';
const OK = '#59cd90';
const DIM = 'rgba(255,255,255,0.6)';

/**
 * Your profile: the username shown on the online leaderboard, and your
 * account. Names are unique (saved in the users database, see
 * online/firebase.js), so a change only sticks once the server has claimed it
 * for you.
 *
 * You start as a guest: an online id for this phone only, off the
 * leaderboards. Signing in with Google keeps that id (so your name, bests and
 * any board entries stay), puts your bests on the boards, and lets you pick it
 * up on any phone by signing in there too.
 */
export class ProfileScene {
  /**
   * `signingIn`: finishGoogleSignIn()'s promise, when the page has just come back from Google's sign-in.
   * `backTab`: the home screen tab Back returns to.
   */
  constructor(signingIn = null, backTab = 'play') {
    this.signingIn = signingIn;
    this.backTab = backTab;
  }

  enter() {
    const dim = 'rgba(255,255,255,0.18)';
    this.changeBtn = new Button({ label: 'Change name', w: 200, h: 56, onTap: () => this.change() });
    this.accountBtn = new Button({ label: 'Sign in with Google', w: 250, h: 56, color: '#3a6fd8', enabled: false, onTap: () => this.accountTap() });
    this.backBtn = new Button({ label: 'Back', w: 130, h: 56, color: dim, onTap: () => flow.menu(this.game, this.backTab) });
    this.status = null; // { text, color }
    this.saving = false;
    this.busy = false; // signing in or out
    this.account = null; // accountInfo() once it answers; 'offline' if it can't
    if (this.signingIn) this.finishSignIn(this.signingIn);
    else this.loadAccount();
    this.layout(this.game.view);
  }

  loadAccount() {
    accountInfo()
      .then((a) => {
        this.account = a;
      })
      .catch(() => {
        this.account = 'offline';
      })
      .finally(() => this.layout(this.game.view));
  }

  change() {
    if (this.saving || this.busy) return;
    const typed = window.prompt('Your username (up to 16 letters or numbers)', getPlayerName());
    this.game.input.clear(); // the dialog swallowed the rest of that tap
    if (typed == null) return;
    const name = cleanName(typed);
    if (!name) {
      this.status = { text: "Use letters and numbers (spaces and _ . ' - are fine inside)", color: WARN };
      return;
    }
    this.saving = true;
    this.status = { text: 'Saving…', color: 'rgba(255,255,255,0.7)' };
    setUsername(name)
      .then(async (renamedBoards) => {
        setPlayerName(name);
        // Your squad's member list too (if you're in one); if that fails it keeps the old name for now.
        await renameInSquad(name).catch((e) => console.warn('name not changed in your squad', e));
        // The name is saved either way; your board rows may still show the old one.
        this.status = renamedBoards
          ? { text: 'Saved', color: OK }
          : { text: 'Saved. Your leaderboard rows will catch up later.', color: WARN };
      })
      .catch((e) => {
        // The name wasn't claimed: the profile and claim are written together,
        // before anything else, so nothing changed.
        let msg = 'Couldn’t reach the server. Your name wasn’t changed.';
        if (e?.message === 'taken') msg = `“${name}” is taken. Try another name.`;
        else if (e?.code === 'permission-denied') msg = 'The server didn’t accept that name. Try another.';
        this.status = { text: msg, color: WARN };
      })
      .finally(() => {
        this.saving = false;
      });
  }

  accountTap() {
    if (this.busy || this.saving || !this.account || this.account === 'offline') return;
    if (this.account.guest) this.signIn();
    else this.signOut();
  }

  /** Off to Google's sign-in page; it comes back to this screen (finishSignIn). */
  signIn() {
    this.busy = true;
    this.status = { text: 'Opening Google…', color: 'rgba(255,255,255,0.7)' };
    // Back from Google's page without signing in (the browser kept this page as it was).
    addEventListener('pageshow', (e) => {
      if (!e.persisted) return;
      this.busy = false;
      this.status = null;
    }, { once: true });
    try {
      startGoogleSignIn();
    } catch {
      this.busy = false;
      this.status = { text: 'Couldn’t open Google’s sign-in page.', color: WARN };
    }
  }

  finishSignIn(signingIn) {
    this.busy = true;
    this.status = { text: 'Signing in…', color: 'rgba(255,255,255,0.7)' };
    signingIn
      .then(async ({ switched }) => {
        // What you did as a guest goes on the leaderboard now (only where it beats your entry).
        this.status = { text: 'Signed in. Putting your bests on the leaderboard…', color: OK };
        const posted = await postBests();
        if (switched) {
          // That Google account already had a player: this phone is them now.
          forgetBests();
          this.status = { text: 'Loading your player…', color: OK };
          location.reload();
          return;
        }
        this.status = { text: posted ? 'Signed in. Your bests are on the online leaderboard.' : 'Signed in. Your name and bests are saved to your Google account.', color: OK };
      })
      .catch((e) => {
        this.status = { text: signInError(e), color: WARN };
      })
      .finally(() => {
        this.busy = false;
        this.loadAccount();
      });
  }

  signOut() {
    const sure = window.confirm('Sign out? This phone goes back to being a new guest. Sign in again to get your name and bests back.');
    this.game.input.clear();
    if (!sure) return;
    this.busy = true;
    this.status = { text: 'Signing out…', color: 'rgba(255,255,255,0.7)' };
    signOut()
      .then(() => {
        forgetBests();
        location.reload();
      })
      .catch(() => {
        this.busy = false;
        this.status = { text: 'Couldn’t sign out. Check your connection and try again.', color: WARN };
      });
  }

  onResize(view) {
    this.layout(view);
  }

  layout(view) {
    const signedIn = this.account && this.account !== 'offline' && !this.account.guest;
    this.accountBtn.label = signedIn ? 'Sign out' : 'Sign in with Google';
    this.accountBtn.w = signedIn ? 160 : 250;
    this.accountBtn.color = signedIn ? 'rgba(255,255,255,0.18)' : '#3a6fd8';
    const btns = [this.changeBtn, this.accountBtn, this.backBtn];
    const gap = 16;
    let x = view.w / 2 - (btns.reduce((s, b) => s + b.w, 0) + gap * (btns.length - 1)) / 2;
    for (const b of btns) {
      Object.assign(b, { x, y: 440 });
      x += b.w + gap;
    }
  }

  update(dt, t) {
    for (const e of this.game.input.consume(t + dt)) {
      if (e.type === 'down') [this.changeBtn, this.accountBtn, this.backBtn].some((b) => b.tap(e.x, e.y));
      else if (e.code === 'Escape') flow.menu(this.game, this.backTab);
      else if (e.code === 'Enter') this.change();
    }
    this.changeBtn.update(dt);
    this.accountBtn.update(dt);
    this.backBtn.update(dt);
  }

  render(ctx, view) {
    ctx.fillStyle = '#12203a';
    ctx.fillRect(0, 0, view.w, view.h);
    text(ctx, 'PROFILE', view.w / 2, 50, { size: 26, color: '#ffb400', shadow: true });

    const w = Math.min(560, view.w - 40);
    const x0 = view.w / 2 - w / 2;
    const cx = view.w / 2;
    roundRect(ctx, x0, 80, w, 150, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    text(ctx, 'USERNAME', cx, 108, { size: 13, weight: 700, color: DIM });
    text(ctx, getPlayerName(), cx, 152, { size: 44, color: '#fff', maxWidth: w - 40 });
    text(ctx, 'Shown on the online leaderboard. No two players can have the same name.', cx, 202, { size: 14, weight: 500, color: DIM, maxWidth: w - 30 });

    roundRect(ctx, x0, 246, w, 124, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    text(ctx, 'ACCOUNT', cx, 274, { size: 13, weight: 700, color: DIM });
    const [line, note] = accountLines(this.account);
    text(ctx, line, cx, 308, { size: 20, weight: 700, color: '#fff', maxWidth: w - 30 });
    text(ctx, note, cx, 342, { size: 14, weight: 500, color: DIM, maxWidth: w - 30 });

    if (this.status) text(ctx, this.status.text, cx, 404, { size: 17, weight: 600, color: this.status.color, maxWidth: view.w - 40 });

    this.changeBtn.enabled = !this.saving && !this.busy;
    this.accountBtn.enabled = !this.saving && !this.busy && !!this.account && this.account !== 'offline';
    this.changeBtn.draw(ctx);
    this.accountBtn.draw(ctx);
    this.backBtn.draw(ctx);
  }
}

/** The account panel's two lines. */
function accountLines(account) {
  if (!account) return ['Checking…', ''];
  if (account === 'offline') return ['Offline', 'Signing in needs a connection.'];
  if (account.guest) return ['Guest on this phone', 'Sign in to go on the online leaderboard and keep your name and bests on any phone.'];
  return [`Signed in with ${account.via}`, account.email ?? 'Sign in with the same account on another phone to play as you there.'];
}

/** What to say when signing in didn't work. */
function signInError(e) {
  switch (e?.code ?? e?.message) {
    case 'auth/user-cancelled':
      return 'Sign-in cancelled.';
    case 'auth/state-mismatch':
      return 'Sign-in didn’t finish. Try again.';
    case 'auth/operation-not-allowed':
      return 'Google sign-in isn’t switched on for this game yet.';
    case 'auth/network-request-failed':
      return 'Couldn’t reach the server. Check your connection and try again.';
    default:
      return `Couldn’t sign in${e?.code ? ` (${e.code})` : ''}.`;
  }
}
