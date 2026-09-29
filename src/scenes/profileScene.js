import { Button, text, roundRect } from '../core/ui.js';
import { getPlayerName, setPlayerName, cleanName } from '../core/storage.js';
import { setUsername } from '../online/firebase.js';
import { flow } from '../flow.js';

/**
 * Your profile: the username shown on the online leaderboard. Names are unique
 * (saved in the users database, see online/firebase.js), so a change only
 * sticks once the server has claimed it for you.
 */
export class ProfileScene {
  enter() {
    const dim = 'rgba(255,255,255,0.18)';
    this.changeBtn = new Button({ label: 'Change name', w: 220, h: 56, onTap: () => this.change() });
    this.backBtn = new Button({ label: 'Menu', w: 150, h: 56, color: dim, onTap: () => flow.menu(this.game) });
    this.status = null; // { text, color }
    this.saving = false;
    this.layout(this.game.view);
  }

  change() {
    if (this.saving) return;
    const typed = window.prompt('Your username (up to 16 letters or numbers)', getPlayerName());
    this.game.input.clear(); // the dialog swallowed the rest of that tap
    if (typed == null) return;
    const name = cleanName(typed);
    if (!name) {
      this.status = { text: "Use letters and numbers (spaces and _ . ' - are fine inside)", color: '#ffb35c' };
      return;
    }
    this.saving = true;
    this.status = { text: 'Saving…', color: 'rgba(255,255,255,0.7)' };
    setUsername(name)
      .then(() => {
        setPlayerName(name);
        this.status = { text: 'Saved', color: '#59cd90' };
      })
      .catch((e) => {
        let msg = 'Couldn’t reach the server. Your name wasn’t changed.';
        if (e?.message === 'taken') msg = `“${name}” is taken. Try another name.`;
        else if (e?.code === 'permission-denied') msg = 'The server didn’t accept that name. Try another.';
        this.status = { text: msg, color: '#ffb35c' };
      })
      .finally(() => {
        this.saving = false;
      });
  }

  onResize(view) {
    this.layout(view);
  }

  layout(view) {
    Object.assign(this.changeBtn, { x: view.w / 2 - 220 - 8, y: 380 });
    Object.assign(this.backBtn, { x: view.w / 2 + 8, y: 380 });
  }

  update(dt, t) {
    for (const e of this.game.input.consume(t + dt)) {
      if (e.type === 'down') [this.changeBtn, this.backBtn].some((b) => b.tap(e.x, e.y));
      else if (e.code === 'Escape') flow.menu(this.game);
      else if (e.code === 'Enter') this.change();
    }
    this.changeBtn.update(dt);
    this.backBtn.update(dt);
  }

  render(ctx, view) {
    ctx.fillStyle = '#12203a';
    ctx.fillRect(0, 0, view.w, view.h);
    text(ctx, 'PROFILE', view.w / 2, 60, { size: 26, color: '#ffb400', shadow: true });

    const w = Math.min(520, view.w - 40);
    const x0 = view.w / 2 - w / 2;
    roundRect(ctx, x0, 110, w, 170, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    text(ctx, 'USERNAME', view.w / 2, 145, { size: 13, weight: 700, color: 'rgba(255,255,255,0.6)' });
    text(ctx, getPlayerName(), view.w / 2, 192, { size: 44, color: '#fff', maxWidth: w - 40 });
    text(ctx, 'Shown on the online leaderboard. No two players can have the same name.', view.w / 2, 246, {
      size: 14, weight: 500, color: 'rgba(255,255,255,0.6)', maxWidth: w - 30,
    });
    if (this.status) text(ctx, this.status.text, view.w / 2, 330, { size: 17, weight: 600, color: this.status.color, maxWidth: view.w - 40 });

    this.changeBtn.enabled = !this.saving;
    this.changeBtn.draw(ctx);
    this.backBtn.draw(ctx);
  }
}
