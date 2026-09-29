import { CONFIG } from '../config.js';
import { Button, text, roundRect } from '../core/ui.js';
import { BOARDS, TOURNAMENT_BOARD, formatMark } from '../events/registry.js';
import { getPlayerName } from '../core/storage.js';
import { leaderboard } from '../online/firebase.js';
import { chooseGhost, isReplayable } from '../online/ghost.js';
import { flow } from '../flow.js';

const ROW_H = 30;
const TOP = 122;
const BOX_Y = 100;

const TAB_LABELS = { sprint100: '100m', longjump: 'Long jump', hurdles110: 'Hurdles', polevault: 'Pole vault', javelin: 'Javelin', tournament: 'Tournament' };

let lastBoard = null; // the tab you looked at last, for the menu's Online button

/**
 * The online leaderboards: a tab per event plus the tournament score, each
 * with the best marks from every player. On the 100m each run has a Race
 * button that puts it next to you as a ghost.
 */
export class LeaderboardScene {
  constructor(board = null) {
    this.board = board ?? lastBoard ?? BOARDS[0];
  }

  enter() {
    const dim = 'rgba(255,255,255,0.18)';
    this.backBtn = new Button({ label: 'Menu', w: 150, h: 50, color: dim, onTap: () => flow.menu(this.game) });
    this.nameBtn = new Button({ label: '', w: 280, h: 50, color: dim, onTap: () => flow.profile(this.game) });
    this.retryBtn = new Button({ label: 'Try again', w: 180, h: 50, onTap: () => this.load() });
    this.tabs = BOARDS.map((b) => new Button({ label: TAB_LABELS[b.id] ?? b.name, h: 38, size: 16, onTap: () => this.show(b) }));
    this.setNameLabel();
    this.show(this.board);
  }

  setNameLabel() {
    this.nameBtn.label = `👤 ${getPlayerName()}`;
  }

  show(board) {
    this.board = lastBoard = board;
    this.tabs.forEach((t, i) => (t.color = BOARDS[i] === board ? '#e4572e' : 'rgba(255,255,255,0.12)'));
    this.load();
  }

  load() {
    const board = this.board;
    this.state = 'loading';
    this.rows = [];
    leaderboard(board)
      .then(({ top, mine }) => {
        if (board !== this.board) return; // switched tabs while it loaded
        const rows = [...top];
        if (mine && !top.includes(mine)) rows.push({ ...mine, gap: true });
        this.rows = rows.map((r) => ({ ...r, btn: this.raceButton(r) }));
        this.state = 'ready';
        this.layout(this.game.view);
      })
      .catch(() => {
        if (board === this.board) this.state = 'error';
      });
  }

  /** A Race button for a row whose recorded run this version can replay (the 100m). */
  raceButton(r) {
    if (!isReplayable(r.ghost, { runner: CONFIG.runner, dip: CONFIG.dip })) return null;
    const ev = this.board;
    return new Button({
      label: 'Race',
      w: 84,
      h: ROW_H - 4,
      size: 18,
      color: '#2bb673',
      onTap: () => {
        chooseGhost({ name: r.me ? 'Your online best' : r.name, data: r.ghost });
        flow.play(this.game, ev);
      },
    });
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
    const gap = 6;
    const tabsW = Math.min(720, view.w - 40);
    const tw = (tabsW - gap * (this.tabs.length - 1)) / this.tabs.length;
    this.tabs.forEach((t, i) => Object.assign(t, { x: view.w / 2 - tabsW / 2 + i * (tw + gap), y: 52, w: tw }));
    Object.assign(this.backBtn, { x: view.w / 2 - 150 - 8, y: 472 });
    Object.assign(this.nameBtn, { x: view.w / 2 + 8, y: 472 });
    Object.assign(this.retryBtn, { x: view.w / 2 - 90, y: 300 });
  }

  rowY(i) {
    const r = this.rows[i];
    return TOP + i * ROW_H + (r?.gap ? 10 : 0);
  }

  buttons() {
    const list = [this.backBtn, this.nameBtn, ...this.tabs];
    if (this.state === 'error') list.push(this.retryBtn);
    if (this.state === 'ready') for (const r of this.rows) if (r.btn) list.push(r.btn);
    return list;
  }

  update(dt, t) {
    for (const e of this.game.input.consume(t + dt)) {
      if (e.type === 'down') this.buttons().some((b) => b.tap(e.x, e.y));
      else if (e.code === 'Escape') flow.menu(this.game);
      else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        const i = BOARDS.indexOf(this.board) + (e.code === 'ArrowLeft' ? -1 : 1);
        this.show(BOARDS[(i + BOARDS.length) % BOARDS.length]);
      }
    }
    this.buttons().forEach((b) => b.update(dt));
  }

  render(ctx, view) {
    ctx.fillStyle = '#12203a';
    ctx.fillRect(0, 0, view.w, view.h);
    text(ctx, 'ONLINE LEADERBOARDS', view.w / 2, 28, { size: 24, color: '#ffb400', shadow: true });

    const w = this.boxW;
    const x0 = view.w / 2 - w / 2;
    roundRect(ctx, x0, BOX_Y, w, 360, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();

    const mid = (s) => text(ctx, s, view.w / 2, 250, { size: 18, weight: 500, color: 'rgba(255,255,255,0.75)', maxWidth: w - 30 });
    if (this.state === 'loading') mid('Loading…');
    else if (this.state === 'error') mid('Can’t reach the online leaderboard right now.');
    else if (!this.rows.length) mid(this.board === TOURNAMENT_BOARD ? 'No scores yet. Finish a tournament to be first!' : `No marks yet. Finish a ${this.board.name} to be first!`);
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
        text(ctx, formatMark(this.board, r.mark), x0 + w - 110, y, { size: 17, align: 'right' });
      });
    }
    this.buttons().forEach((b) => b.draw(ctx));
  }
}
