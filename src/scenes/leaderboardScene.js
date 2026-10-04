import { CONFIG } from '../config.js';
import { Button, text, roundRect } from '../core/ui.js';
import { BOARDS, formatMark } from '../events/registry.js';
import { getTopMarks, TOP_N, getBoardView, setBoardView } from '../core/storage.js';
import { leaderboard, cachedLeaderboard, fetchGhost, learnUid, isSignedIn, startGoogleSignIn } from '../online/firebase.js';
import { chooseGhost, isReplayable, GHOST_VERSION } from '../online/ghost.js';
import { isTrace } from '../online/trace.js';
import { flow } from '../flow.js';

const ROW_H = 30;
const TOP = 122;
const BOX_Y = 100;

const TAB_LABELS = { sprint100: '100m', longjump: 'Long jump', hurdles110: 'Hurdles', polevault: 'Pole vault', javelin: 'Javelin', tournament: '🏆 Tournament' };

let lastBoard = null; // the tab you looked at last, for the menu's Leaderboard button

/**
 * Leaderboards, two views (Mine | Global along the top, the last one used is remembered):
 *
 * - Mine: your own top five on every board (storage.js getTopMarks), five
 *   events across, the two tournament scores under them, each mark with who
 *   set it, where (Amateur, Pro, Training, Live) and when. Kept on this phone,
 *   so guests have it too. Tap a board to see it on Global.
 * - Global: the online leaderboards, a tab per event plus the solo and team
 *   tournament scores, each with the best marks from every player. On the event
 *   boards each recorded mark has a Race button that puts it next to you as a
 *   ghost. Guests don't see these: the screen asks them to sign in with Google
 *   first (the boards themselves are public, see firestore.rules).
 */
export class LeaderboardScene {
  constructor(board = null) {
    this.board = board ?? lastBoard ?? BOARDS[0];
  }

  enter() {
    const dim = 'rgba(255,255,255,0.18)';
    this.backBtn = new Button({ label: 'Menu', w: 150, h: 50, color: dim, onTap: () => flow.menu(this.game) });
    this.viewBtns = ['mine', 'global'].map((v) => new Button({ label: v === 'mine' ? '👤 Mine' : '🌐 Global', w: 140, h: 36, size: 17, onTap: () => this.setView(v) }));
    this.mine = BOARDS.map((board) => ({ board, list: getTopMarks(board.id, board.lowerIsBetter) }));
    this.view = getBoardView();
    this.styleViews();
    this.retryBtn = new Button({ label: 'Try again', w: 180, h: 50, onTap: () => this.load() });
    this.tabs = BOARDS.map((b) => new Button({ label: TAB_LABELS[b.id] ?? b.name, h: 38, size: 16, onTap: () => this.show(b) }));
    this.age = 0; // s on this screen: animates the loading rows
    this.guest = !isSignedIn();
    if (this.guest) {
      this.signInBtn = new Button({ label: 'Sign in with Google', w: 250, h: 56, color: '#3a6fd8', onTap: () => this.signIn() });
      this.signInError = null;
      this.layout(this.game.view);
      return;
    }
    this.layout(this.game.view); // before anything loads, so the buttons start in place
    if (this.view === 'global') this.openGlobal();
  }

  /** Global, the first time it's shown: load the board, and learn your player id to find your row. */
  openGlobal() {
    if (this.guest || this.globalOpen) return;
    this.globalOpen = true;
    this.show(this.board);
    // Your row is found by your player id; sign in to learn it if needed, then load again.
    learnUid()
      .then((learned) => learned && this.game.scene === this && this.load())
      .catch(() => {});
  }

  /** 'mine' or 'global' (remembered on this device). */
  setView(view) {
    this.view = view;
    setBoardView(view);
    this.styleViews();
    if (view === 'global') this.openGlobal();
  }

  styleViews() {
    this.viewBtns.forEach((b, i) => (b.color = ['mine', 'global'][i] === this.view ? '#e4572e' : 'rgba(255,255,255,0.12)'));
  }

  /** Off to Google's sign-in page; it comes back to the Profile screen (main.js). */
  signIn() {
    try {
      startGoogleSignIn();
    } catch {
      this.signInError = 'Couldn’t open Google’s sign-in page.';
    }
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
   * A Race button for a row whose recording this version can play, fetched
   * when you tap it. The row itself doesn't carry the recording (a board of
   * 100m runs would be 85KB of them): it says which version the run is, and
   * whether a field event kept one, which is enough to offer the button.
   */
  raceButton(r) {
    const ev = this.board;
    const kept = ev.ghosts ? r.ghost?.v === GHOST_VERSION : ev.traceProps != null && r.traced === true;
    if (!kept) return null;
    const name = r.me ? 'Your online best' : r.name;
    const playable = (data) => (ev.ghosts ? isReplayable(data, { runner: CONFIG.runner, dip: CONFIG.dip }) : isTrace(data, ev.id, ev.traceProps));
    const btn = new Button({ label: 'Race', w: 84, h: ROW_H - 4, size: 18, color: '#2bb673' });
    btn.onTap = () => {
      if (!btn.enabled) return;
      btn.enabled = false;
      btn.label = '…';
      fetchGhost(ev, r)
        .then((data) => {
          if (this.board !== ev || this.game.scene !== this) return; // moved on meanwhile
          if (!playable(data)) {
            btn.label = 'Gone'; // their mark changed while the board was up, or this build can't play it
            return;
          }
          chooseGhost({ name, data, ev: ev.id });
          flow.play(this.game, ev);
        })
        .catch(() => {
          btn.label = 'Retry';
          btn.enabled = true;
        });
    };
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
    const tabsW = Math.min(800, view.w - 40);
    const tw = (tabsW - gap * (this.tabs.length - 1)) / this.tabs.length;
    this.tabs.forEach((t, i) => Object.assign(t, { x: view.w / 2 - tabsW / 2 + i * (tw + gap), y: 52, w: tw }));
    Object.assign(this.backBtn, { x: view.w / 2 - 75, y: 472 });
    this.viewBtns.forEach((b, i) => Object.assign(b, { x: view.w / 2 - b.w - 4 + i * (b.w + 8), y: 8 }));
    // Mine: five event panels across, the two tournaments centred under them.
    const pw = Math.min(176, (view.w - 32 - 4 * 8) / 5);
    const events = this.mine.filter((m) => !m.board.tournament);
    const tours = this.mine.filter((m) => m.board.tournament);
    const place = (row, y) => row.forEach((m, i) => Object.assign(m, { x: view.w / 2 - (row.length * pw + (row.length - 1) * 8) / 2 + i * (pw + 8), y, w: pw, h: MINE_H }));
    place(events, MINE_Y);
    place(tours, MINE_Y + MINE_H + 10);
    Object.assign(this.retryBtn, { x: view.w / 2 - 90, y: 300 });
    if (this.signInBtn) Object.assign(this.signInBtn, { x: view.w / 2 - this.signInBtn.w / 2, y: 300 });
  }

  rowY(i) {
    const r = this.rows[i];
    return TOP + i * ROW_H + (r?.gap ? 10 : 0);
  }

  buttons() {
    if (this.view === 'mine') return [this.backBtn, ...this.viewBtns];
    if (this.guest) return [this.backBtn, ...this.viewBtns, this.signInBtn];
    const list = [this.backBtn, ...this.viewBtns, ...this.tabs];
    if (this.state === 'error') list.push(this.retryBtn);
    if (this.state === 'ready') for (const r of this.rows) if (r.btn) list.push(r.btn);
    return list;
  }

  update(dt, t) {
    for (const e of this.game.input.consume(t + dt)) {
      if (e.type === 'down') {
        if (this.buttons().some((b) => b.tap(e.x, e.y))) continue;
        // Mine: tap a board to see it on Global.
        const m = this.view === 'mine' ? this.mine.find((p) => e.x >= p.x && e.x <= p.x + p.w && e.y >= p.y && e.y <= p.y + p.h) : null;
        if (m) {
          this.board = lastBoard = m.board;
          this.setView('global');
          if (!this.guest) this.show(m.board);
        }
      } else if (e.code === 'Escape') flow.menu(this.game);
      else if (e.code === 'Tab' || e.code === 'KeyM') this.setView(this.view === 'mine' ? 'global' : 'mine');
      else if (this.guest || this.view === 'mine') continue;
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
    if (this.view === 'mine') {
      this.renderMine(ctx);
      this.buttons().forEach((b) => b.draw(ctx));
      return;
    }

    const w = this.boxW;
    const x0 = view.w / 2 - w / 2;
    roundRect(ctx, x0, BOX_Y, w, 360, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();

    const mid = (s) => text(ctx, s, view.w / 2, 250, { size: 18, weight: 500, color: 'rgba(255,255,255,0.75)', maxWidth: w - 30 });
    if (this.guest) {
      text(ctx, 'Connect your account to Google', view.w / 2, 210, { size: 22, weight: 700, color: '#fff', maxWidth: w - 30 });
      mid('to see the global leaderboard.');
      if (this.signInError) text(ctx, this.signInError, view.w / 2, 390, { size: 16, weight: 600, color: '#ffb35c', maxWidth: w - 30 });
    } else if (this.state === 'loading') this.drawLoading(ctx, x0, w);
    else if (this.state === 'error') mid('Can’t reach the online leaderboard right now.');
    else if (!this.rows.length) mid(this.board.tournament ? `No scores yet. Finish a ${this.board.name.toLowerCase()} to be first!` : `No marks yet. Finish a ${this.board.name} to be first!`);
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

  /** Mine: a panel per board, your top five on it. */
  renderMine(ctx) {
    for (const { board, list, x, y, w, h } of this.mine) {
      roundRect(ctx, x, y, w, h, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();
      text(ctx, (TAB_LABELS[board.id] ?? board.name).toUpperCase(), x + w / 2, y + 16, { size: 13, weight: 800, color: '#ffb400', maxWidth: w - 12 });
      if (!list.length) {
        text(ctx, 'No marks yet', x + w / 2, y + h / 2 + 8, { size: 13, weight: 600, color: 'rgba(255,255,255,0.45)', maxWidth: w - 12 });
        continue;
      }
      for (let i = 0; i < TOP_N; i++) {
        const e = list[i];
        const ry = y + 32 + i * MINE_ROW;
        const top = i === 0;
        text(ctx, String(i + 1), x + 14, ry + 8, { size: 14, weight: 800, color: top ? '#ffb400' : 'rgba(255,255,255,0.55)' });
        if (!e) {
          text(ctx, '—', x + 30, ry + 8, { size: 14, align: 'left', color: 'rgba(255,255,255,0.25)' });
          continue;
        }
        text(ctx, formatMark(board, e.mark), x + 28, ry + 8, { size: 16, weight: 800, align: 'left', color: top ? '#ffd35c' : '#fff', maxWidth: w - 36 });
        text(ctx, details(e), x + 28, ry + 24, { size: 11, weight: 600, align: 'left', color: 'rgba(255,255,255,0.55)', maxWidth: w - 34 });
      }
    }
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

const MINE_Y = 52; // top of the first row of Mine panels
const MINE_ROW = 33; // a mark and its details line
const MINE_H = 32 + TOP_N * MINE_ROW + 2;
const WHERE = { amateur: 'Amateur', pro: 'Pro', training: 'Training', live: 'Live' };

/** "Okoro · Pro · Oct 1": who set a mark, where and when ("From before" for one kept before the list was). */
function details(e) {
  if (e.at == null) return 'From before';
  const day = new Date(e.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return [e.who, WHERE[e.where], day].filter(Boolean).join(' · ');
}
