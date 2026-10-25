import { CONFIG } from '../config.js';
import { Button, text, slab, chamfer, PAL } from '../core/ui.js';
import { drawIcon } from '../core/icons.js';
import { BOARDS, formatMark } from '../events/registry.js';
import { getTopMarks, TOP_N, getBoardView, setBoardView, LEVEL_NAMES } from '../core/storage.js';
import { leaderboard, cachedLeaderboard, fetchGhost, learnUid, isSignedIn, startGoogleSignIn } from '../online/firebase.js';
import { chooseGhost, isReplayable, GHOST_VERSION } from '../online/ghost.js';
import { isTrace } from '../online/trace.js';
import { flow } from '../flow.js';
import { setWorldRecord } from '../online/worldRecords.js';

const ROW_H = 30;
const BOX_Y = 124; // Global: top of the cream sheet
const TOP = BOX_Y + 22; // its first row's middle
const HEADER_H = 64; // the ink2 band along the top

const TAB_LABELS = { sprint100: '100m', longjump: 'Long jump', hurdles110: 'Hurdles', polevault: 'Pole vault', javelin: 'Javelin', tournament: 'Tournament', survival: 'Survival' };
/** Each board's colour: its column header on Mine. */
const BOARD_FACE = { sprint100: PAL.orange, longjump: PAL.deep, hurdles110: PAL.brick, polevault: PAL.blue, javelin: PAL.magenta, tournament: PAL.gold, survival: PAL.survival };
const ZEBRA = '#EFE2C3'; // every other row on a cream sheet

let lastBoard = null; // the tab you looked at last, for the menu's Leaderboard button

/**
 * Leaderboards, two views (Mine | Global along the top, the last one used is remembered):
 *
 * - Mine: your own top five on every board (storage.js getTopMarks), five
 *   events across, the two tournament scores under them, each mark with who
 *   set it, where (High School, Collegiate, Pro, Training, Live) and when. Kept on this phone,
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
    this.backBtn = new Button({ label: 'Menu', icon: 'back', look: 'chip', w: 112, h: 44, onTap: () => flow.menu(this.game) });
    // Mine | Global: a segmented control (the one showing is cream).
    this.viewBtns = ['mine', 'global'].map((v) => new Button({ label: v === 'mine' ? 'Mine' : 'Global', icon: v === 'mine' ? 'profile' : 'live', w: 146, h: 46, size: 20, onTap: () => this.setView(v) }));
    this.mine = BOARDS.map((board) => ({ board, list: getTopMarks(board.id, board.lowerIsBetter) }));
    this.view = getBoardView();
    this.styleViews();
    this.retryBtn = new Button({ label: 'Try again', w: 180, h: 50, color: PAL.ink2, onTap: () => this.load() });
    this.tabs = BOARDS.map((b) => new Button({ label: TAB_LABELS[b.id] ?? b.name, icon: b.id, h: 40, size: 16, color: PAL.ink2, onTap: () => this.show(b) }));
    this.age = 0; // s on this screen: animates the loading rows
    this.guest = !isSignedIn();
    if (this.guest) {
      this.signInBtn = new Button({ label: 'Sign in with Google', w: 260, h: 56, color: PAL.blue, lip: PAL.blueShade, onTap: () => this.signIn() });
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
    this.viewBtns.forEach((b, i) => {
      const on = ['mine', 'global'][i] === this.view;
      b.color = on ? PAL.cream : PAL.ink;
      b.lip = on ? PAL.creamShade : PAL.inkShade;
    });
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
    this.tabs.forEach((t, i) => {
      const on = BOARDS[i] === board;
      t.color = on ? PAL.cream : PAL.ink2;
      t.lip = on ? PAL.creamShade : PAL.inkShade;
    });
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
        setWorldRecord(board, b.top[0]?.mark ?? null); // the board's top mark is its world record
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
    const btn = new Button({ label: 'Race', w: 84, h: ROW_H - 2, size: 17, color: PAL.liveGreen, lip: PAL.liveShade });
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
      if (r.btn) Object.assign(r.btn, { x: x0 + this.boxW - r.btn.w - 10, y: this.rowY(i) - ROW_H / 2 + 1 });
    });
    const gap = 6;
    const tabsW = Math.min(800, view.w - 40);
    const tw = (tabsW - gap * (this.tabs.length - 1)) / this.tabs.length;
    this.tabs.forEach((t, i) => Object.assign(t, { x: view.w / 2 - tabsW / 2 + i * (tw + gap), y: 74, w: tw }));
    Object.assign(this.backBtn, { x: 14 + view.safe.l, y: 10 });
    this.viewBtns.forEach((b, i) => Object.assign(b, { x: view.w / 2 - b.w - 4 + i * (b.w + 8), y: 10 }));
    // Mine: a cream column per board, in a row.
    const n = this.mine.length;
    const gapM = 10;
    const pw = Math.min(176, (view.w - 32 - Math.max(view.safe.l, view.safe.r) * 2 - (n - 1) * gapM) / n);
    this.mine.forEach((m, i) => Object.assign(m, { x: view.w / 2 - (n * pw + (n - 1) * gapM) / 2 + i * (pw + gapM), y: MINE_Y, w: pw, h: view.h - MINE_Y - 20 - view.safe.b }));
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
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.fillStyle = PAL.ink2;
    ctx.fillRect(0, 0, view.w, HEADER_H);
    if (this.view === 'mine') {
      this.renderMine(ctx);
      this.buttons().forEach((b) => b.draw(ctx));
      return;
    }

    // Global: one board on a cream sheet, zebra rows.
    const w = this.boxW;
    const x0 = view.w / 2 - w / 2;
    const boxH = 360;
    slab(ctx, x0, BOX_Y, w, boxH, { face: PAL.cream, lip: PAL.creamShade, lipH: 5, c: 7 });
    for (let i = 0; i < 11; i += 2) {
      const y = TOP + i * ROW_H - ROW_H / 2;
      if (y + ROW_H > BOX_Y + boxH - 5) break;
      ctx.fillStyle = ZEBRA;
      ctx.fillRect(x0, y, w, ROW_H);
    }

    const mid = (s) => text(ctx, s, view.w / 2, 260, { size: 19, font: 'body', weight: 600, color: PAL.muted, maxWidth: w - 30 });
    if (this.guest) {
      text(ctx, 'Connect your account to Google', view.w / 2, 220, { size: 24, font: 'body', weight: 800, color: PAL.ink, maxWidth: w - 30 });
      mid('to see the global leaderboard.');
      if (this.signInError) text(ctx, this.signInError, view.w / 2, 400, { size: 17, font: 'body', color: PAL.brick, maxWidth: w - 30 });
    } else if (this.state === 'loading') this.drawLoading(ctx, x0, w);
    else if (this.state === 'error') mid('Can’t reach the online leaderboard right now.');
    else if (!this.rows.length) mid(this.board.tournament ? `No scores yet. Finish a ${this.board.name.toLowerCase()} to be first!` : this.board.points ? `No scores yet. Play ${this.board.name} to be first!` : `No marks yet. Finish a ${this.board.name} to be first!`);
    else {
      this.rows.forEach((r, i) => {
        const y = this.rowY(i);
        if (r.gap) text(ctx, '⋯', view.w / 2, y - ROW_H / 2 - 2, { size: 16, font: 'body', color: PAL.muted });
        if (r.me) {
          ctx.fillStyle = PAL.gold;
          ctx.fillRect(x0, y - ROW_H / 2, w, ROW_H);
        }
        text(ctx, String(r.rank), x0 + 32, y + 1, { size: 20, font: 'display', color: PAL.ink });
        text(ctx, String(r.name ?? ''), x0 + 60, y + 1, { size: 18, font: 'body', align: 'left', weight: r.me ? 800 : 700, color: PAL.ink, maxWidth: w - 280 });
        text(ctx, formatMark(this.board, r.mark), x0 + w - 110, y + 1, { size: 18, font: 'body', weight: 800, align: 'right', color: PAL.ink });
      });
    }
    this.buttons().forEach((b) => b.draw(ctx));
  }

  /** Mine: a cream column per board, its colour along the top with its icon and name, then your top five. */
  renderMine(ctx) {
    for (const { board, list, x, y, w, h } of this.mine) {
      slab(ctx, x, y, w, h, { face: PAL.cream, lip: PAL.creamShade, lipH: 5, c: 7 });
      const face = BOARD_FACE[board.id] ?? PAL.ink2;
      const ink = face === PAL.gold ? PAL.ink : PAL.cream;
      ctx.fillStyle = face;
      chamfer(ctx, x, y, w, MINE_HEAD, 7);
      ctx.fill();
      ctx.fillRect(x, y + MINE_HEAD / 2, w, MINE_HEAD / 2);
      const iconS = Math.min(34, w * 0.2);
      drawIcon(ctx, board.id, x + 10 + iconS / 2, y + MINE_HEAD / 2, iconS, ink);
      text(ctx, (TAB_LABELS[board.id] ?? board.name).toUpperCase(), x + 18 + iconS, y + MINE_HEAD / 2 + 1, { size: 20, font: 'display', align: 'left', track: 1, color: ink, maxWidth: w - iconS - 26 });
      const rowH = Math.min(MINE_ROW, (h - 5 - MINE_HEAD - 6) / TOP_N);
      for (let i = 1; i < TOP_N; i += 2) {
        ctx.fillStyle = ZEBRA;
        ctx.fillRect(x, y + MINE_HEAD + 3 + i * rowH, w, rowH);
      }
      if (!list.length) {
        text(ctx, 'No marks yet', x + w / 2, y + MINE_HEAD + 3 + rowH / 2, { size: 16, font: 'body', color: PAL.muted, maxWidth: w - 12 });
        continue;
      }
      for (let i = 0; i < TOP_N; i++) {
        const e = list[i];
        const ry = y + MINE_HEAD + 3 + i * rowH;
        const top = i === 0;
        text(ctx, String(i + 1), x + 16, ry + rowH * 0.38, { size: 20, font: 'display', color: top ? PAL.orange : PAL.muted });
        if (!e) {
          text(ctx, '—', x + 32, ry + rowH * 0.38, { size: 16, font: 'body', align: 'left', color: PAL.creamShade });
          continue;
        }
        text(ctx, formatMark(board, e.mark), x + 32, ry + rowH * 0.38, { size: 19, font: 'body', weight: 800, align: 'left', color: PAL.ink, maxWidth: w - 40 });
        text(ctx, details(e), x + 32, ry + rowH * 0.72, { size: 13, font: 'body', weight: 600, align: 'left', color: PAL.muted, maxWidth: w - 38 });
      }
    }
  }

  /** Placeholder rows where the marks will go, shimmering until they arrive. */
  drawLoading(ctx, x0, w) {
    for (let i = 0; i < 10; i++) {
      const y = TOP + i * ROW_H;
      const a = 0.08 + 0.08 * (0.5 + 0.5 * Math.sin(this.age * 5 - i * 0.6));
      ctx.fillStyle = `rgba(38,34,79,${a.toFixed(3)})`;
      chamfer(ctx, x0 + 22, y - 7, 20, 14, 3);
      ctx.fill();
      chamfer(ctx, x0 + 60, y - 7, (w - 280) * (0.55 + 0.35 * ((i * 37) % 10) / 10), 14, 3);
      ctx.fill();
      chamfer(ctx, x0 + w - 170, y - 7, 60, 14, 3);
      ctx.fill();
    }
  }
}

const MINE_Y = 80; // top of the Mine columns
const MINE_HEAD = 64; // a column's coloured header
const MINE_ROW = 70; // a mark and its details line, at most
const WHERE = { ...LEVEL_NAMES, amateur: 'Collegiate', training: 'Training', live: 'Live' }; // amateur: Collegiate's old name, on older marks

/** "Okoro · Pro · Oct 1": who set a mark, where and when ("From before" for one kept before the list was). */
function details(e) {
  if (e.at == null) return 'From before';
  const day = new Date(e.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return [e.who, WHERE[e.where], day].filter(Boolean).join(' · ');
}
