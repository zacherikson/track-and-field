import { CONFIG } from '../config.js';
import { Button, text, roundRect } from '../core/ui.js';
import { formatMark } from '../events/registry.js';
import { getPlayerName, setPlayerName } from '../core/storage.js';
import { leaderboard, renameOnBoard } from '../online/firebase.js';
import { chooseGhost, isReplayable } from '../online/ghost.js';
import { flow } from '../flow.js';

const ROW_H = 32;
const TOP = 112;

/**
 * The online leaderboard for one event: the fastest runs from every player,
 * each with a Race button that puts that run next to you as a ghost.
 */
export class LeaderboardScene {
  constructor(ev) {
    this.ev = ev;
  }

  enter() {
    const dim = 'rgba(255,255,255,0.18)';
    this.backBtn = new Button({ label: 'Menu', w: 150, h: 50, color: dim, onTap: () => flow.menu(this.game) });
    this.nameBtn = new Button({ label: '', w: 280, h: 50, color: dim, onTap: () => this.rename() });
    this.retryBtn = new Button({ label: 'Try again', w: 180, h: 50, onTap: () => this.load() });
    this.setNameLabel();
    this.rows = [];
    this.load();
  }

  setNameLabel() {
    this.nameBtn.label = `✎ ${getPlayerName()}`;
  }

  load() {
    this.state = 'loading';
    leaderboard(this.ev.id)
      .then(({ top, mine }) => {
        const rows = [...top];
        if (mine && !top.includes(mine)) rows.push({ ...mine, gap: true });
        this.rows = rows.map((r) => ({ ...r, btn: this.raceButton(r) }));
        this.state = 'ready';
        this.layout(this.game.view);
      })
      .catch(() => {
        this.state = 'error';
      });
  }

  /** A Race button for a row whose recorded run this version can replay. */
  raceButton(r) {
    if (!isReplayable(r.ghost, { runner: CONFIG.runner, dip: CONFIG.dip })) return null;
    return new Button({
      label: 'Race',
      w: 84,
      h: ROW_H - 4,
      color: '#2bb673',
      onTap: () => {
        chooseGhost({ name: r.me ? 'Your online best' : r.name, data: r.ghost });
        flow.play(this.game, this.ev);
      },
    });
  }

  rename() {
    const typed = window.prompt('Your name on the leaderboard (up to 16 letters)', getPlayerName());
    this.game.input.clear(); // the dialog swallowed the rest of that tap
    // Printable characters only, single spaces, 16 at most (the database rules check the length too).
    const name = (typed ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
    if (!name) return;
    setPlayerName(name);
    this.setNameLabel();
    renameOnBoard(this.ev.id, name)
      .then(() => this.load())
      .catch(() => {});
  }

  onResize(view) {
    this.layout(view);
  }

  get boxW() {
    return Math.min(600, this.game.view.w - 40);
  }

  layout(view) {
    const x0 = view.w / 2 - this.boxW / 2;
    this.rows?.forEach((r, i) => {
      if (r.btn) Object.assign(r.btn, { x: x0 + this.boxW - r.btn.w - 10, y: this.rowY(i) - (ROW_H - 4) / 2 });
    });
    Object.assign(this.backBtn, { x: view.w / 2 - 150 - 8, y: 470 });
    Object.assign(this.nameBtn, { x: view.w / 2 + 8, y: 470 });
    Object.assign(this.retryBtn, { x: view.w / 2 - 90, y: 290 });
  }

  rowY(i) {
    const r = this.rows[i];
    return TOP + i * ROW_H + (r?.gap ? 10 : 0);
  }

  buttons() {
    const list = [this.backBtn, this.nameBtn];
    if (this.state === 'error') list.push(this.retryBtn);
    if (this.state === 'ready') for (const r of this.rows) if (r.btn) list.push(r.btn);
    return list;
  }

  update(dt, t) {
    for (const e of this.game.input.consume(t + dt)) {
      if (e.type === 'down') this.buttons().some((b) => b.tap(e.x, e.y));
      else if (e.code === 'Escape') flow.menu(this.game);
    }
    this.buttons().forEach((b) => b.update(dt));
  }

  render(ctx, view) {
    ctx.fillStyle = '#12203a';
    ctx.fillRect(0, 0, view.w, view.h);
    text(ctx, `${this.ev.name.toUpperCase()} · ONLINE`, view.w / 2, 44, { size: 26, color: '#ffb400', shadow: true });
    text(ctx, 'Tap Race to run against a player’s recorded best, as a ghost in the lane next to you.', view.w / 2, 74, {
      size: 14, weight: 500, color: 'rgba(255,255,255,0.65)', maxWidth: view.w - 40,
    });

    const w = this.boxW;
    const x0 = view.w / 2 - w / 2;
    roundRect(ctx, x0, 88, w, 366, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();

    const mid = (s) => text(ctx, s, view.w / 2, 240, { size: 18, weight: 500, color: 'rgba(255,255,255,0.75)', maxWidth: w - 30 });
    if (this.state === 'loading') mid('Loading…');
    else if (this.state === 'error') mid('Can’t reach the online leaderboard right now.');
    else if (!this.rows.length) mid(`No runs yet. Finish a ${this.ev.name} to be first!`);
    else {
      this.rows.forEach((r, i) => {
        const y = this.rowY(i);
        if (r.gap) text(ctx, '⋯', view.w / 2, y - ROW_H / 2 - 2, { size: 14, color: 'rgba(255,255,255,0.4)' });
        if (r.me) {
          roundRect(ctx, x0 + 6, y - ROW_H / 2 + 1, w - 12, ROW_H - 2, 8);
          ctx.fillStyle = 'rgba(255,180,0,0.18)';
          ctx.fill();
        }
        text(ctx, String(r.rank), x0 + 32, y, { size: 17 });
        text(ctx, String(r.name ?? ''), x0 + 60, y, { size: 17, align: 'left', weight: r.me ? 800 : 600, maxWidth: w - 280 });
        text(ctx, formatMark(this.ev, r.mark), x0 + w - 110, y, { size: 17, align: 'right' });
      });
    }
    this.buttons().forEach((b) => b.draw(ctx));
  }
}
