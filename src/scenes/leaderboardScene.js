import { CONFIG } from '../config.js';
import { Button, text, roundRect } from '../core/ui.js';
import { BOARDS, TOURNAMENT_BOARD, formatMark } from '../events/registry.js';
import { getPlayerName } from '../core/storage.js';
import { leaderboard, cachedLeaderboard, fetchGhost, learnUid } from '../online/firebase.js';
import { chooseGhost, isReplayable } from '../online/ghost.js';
import { isTrace } from '../online/trace.js';
import { flow } from '../flow.js';

const ROW_H = 30;
const TOP = 122;
const BOX_Y = 100;

const TAB_LABELS = { sprint100: '100m', longjump: 'Long jump', hurdles110: 'Hurdles', polevault: 'Pole vault', javelin: 'Javelin', tournament: 'Tournament' };

let lastBoard = null; // the tab you looked at last, for the menu's Leaderboard button

/**
 * The online leaderboards: a tab per event plus the tournament score, each
 * with the best marks from every player. On the event boards each recorded
 * mark has a Race button that puts it next to you as a ghost.
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
    this.age = 0; // s on this screen: animates the loading rows
    this.setNameLabel();
    this.layout(this.game.view); // before anything loads, so the buttons start in place
    this.show(this.board);
    // Your row is found by your player id; sign in to learn it if needed, then load again.
    learnUid()
      .then((learned) => learned && this.game.scene === this && this.load())
      .catch(() => {});
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
    // Seen this session: show it now and refresh it quietly.
    const cached = cachedLeaderboard(board);
    this.state = cached ? 'ready' : 'loading';
    this.rows = [];
    if (cached) this.showRows(cached);
    leaderboard(board)
      .then((b) => {
        if (board === this.board) this.showRows(b); // unless you switched tabs while it loaded
      })
      .catch(() => {
        if (board === this.board && !cached) this.state = 'error';
      });
  }

  showRows({ top, mine }) {
    const rows = [...top];
    if (mine && !top.includes(mine)) rows.push({ ...mine, gap: true });
    this.rows = rows.map((r) => ({ ...r, btn: this.raceButton(r) }));
    this.state = 'ready';
    this.layout(this.game.view);
  }

  /**
   * A Race button for a row with a recording this version can play: the 100m's
   * comes with the row, the other events' is fetched when you tap.
   */
  raceButton(r) {
    const ev = this.board;
    const name = r.me ? 'Your online best' : r.name;
    const race = (data) => {
      chooseGhost({ name, data, ev: ev.id });
      flow.play(this.game, ev);
    };
    const btn = new Button({ label: 'Race', w: 84, h: ROW_H - 4, size: 18, color: '#2bb673' });
    if (ev.ghosts) {
      if (!isReplayable(r.ghost, { runner: CONFIG.runner, dip: CONFIG.dip })) return null;
      btn.onTap = () => race(r.ghost);
    } else if (ev.traceProps != null && r.traced === true) {
      btn.onTap = () => {
        if (!btn.enabled) return;
        btn.enabled = false;
        btn.label = '…';
        fetchGhost(ev, r)
          .then((data) => {
            if (this.board !== ev || this.game.scene !== this) return; // moved on meanwhile
            if (isTrace(data, ev.id, ev.traceProps)) return race(data);
            btn.label = 'Gone';
          })
          .catch(() => {
            btn.label = 'Retry';
            btn.enabled = true;
          });
      };
    } else return null;
    return btn;
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
    this.age += dt;
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
    if (this.state === 'loading') this.drawLoading(ctx, x0, w);
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

  /** Placeholder rows where the marks will go, shimmering until they arrive. */
  drawLoading(ctx, x0, w) {
    for (let i = 0; i < 10; i++) {
      const y = TOP + i * ROW_H;
      const a = 0.05 + 0.05 * (0.5 + 0.5 * Math.sin(this.age * 5 - i * 0.6));
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      roundRect(ctx, x0 + 22, y - 7, 20, 14, 7);
      ctx.fill();
      roundRect(ctx, x0 + 60, y - 7, (w - 280) * (0.55 + 0.35 * ((i * 37) % 10) / 10), 14, 7);
      ctx.fill();
      roundRect(ctx, x0 + w - 170, y - 7, 60, 14, 7);
      ctx.fill();
    }
    text(ctx, 'Loading…', this.game.view.w / 2, TOP + 10 * ROW_H + 12, { size: 15, weight: 500, color: 'rgba(255,255,255,0.55)' });
  }
}
