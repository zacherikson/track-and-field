import { CONFIG } from '../../config.js';
import { Button, text, roundRect } from '../../core/ui.js';
import { drawFigure, runPose } from '../../athletes/stickFigure.js';
import { EVENTS, TOURNAMENT_BOARDS, formatMark } from '../../events/registry.js';
import { getBest, getDifficulty, setDifficulty, getGhostOn, setGhostOn, getPlayerName, getTourMode, setTourMode } from '../../core/storage.js';
import { lineupAthlete, lineupSlotEmpty, heightOf } from '../../athletes/roster.js';
import { TOUR_KINDS } from '../../tournament/tournament.js';
import { flow } from '../../flow.js';
import { syncBests } from '../../online/bests.js';

const SHORT = { sprint100: '100m', longjump: 'Long jump', hurdles110: 'Hurdles', polevault: 'Pole vault', javelin: 'Javelin' };
const DIM = 'rgba(255,255,255,0.6)';
const PLAIN = 'rgba(255,255,255,0.15)';

// The list you were on (null: the two big buttons), kept for the session so
// Menu after a race comes back to it.
let lastList = null;

/**
 * The home screen's middle tab: where you play. Two big buttons, vs Computer
 * and Live, over your lineup standing on the track; each opens its list (the
 * tournament and the five events, with that mode's settings). Tuning,
 * Leaderboard and Profile along the top.
 */
export class PlayPanel {
  constructor(home) {
    this.home = home;
    this.game = home.game;
  }

  enter() {
    this.list = lastList; // null | 'offline' | 'live'
    this.fade = 1; // 0 -> 1 as a list (or the buttons) come in
    this.phase = 0;
    this.demoX = 0;
    // The two big buttons.
    this.offlineBig = new BigButton({ label: '🤖 vs Computer', sub: 'Tournament + 5 events', color: '#e4572e', onTap: () => this.open('offline') });
    this.liveBig = new BigButton({ label: '🌐 Live', sub: 'Race people right now', color: '#1f8a58', onTap: () => this.open('live') });
    // A team tournament needs every lineup slot filled (Lineup tab); trying one without says so.
    this.warnT = 0;
    this.fillBtn = new Button({ label: 'Fill your lineup ›', w: 230, h: 42, size: 19, color: '#3a6fd8', onTap: () => this.home.show(0) });
    this.backBtn = new Button({ label: '‹ Back', w: 120, h: 44, size: 20, color: PLAIN, onTap: () => this.back() });
    // Tournament: all five events in a row, decathlon scoring; solo or team (the TOURNAMENT toggle).
    this.mode = getTourMode();
    this.tourButton = new Button({ label: '🏆 Tournament', color: TOUR_COLOR.offline, onTap: () => this.tournament(() => flow.tournament(this.game, this.mode)) });
    this.buttons = EVENTS.map(
      (ev) =>
        new Button({
          label: ev.name,
          sub: ev.available ? `Best ${formatMark(ev, getBest(ev.id))}` : 'Coming soon',
          enabled: ev.available,
          onTap: () => flow.intro(this.game, ev),
        }),
    );
    // Live: the same, against other people (a waiting room first, online/live.js).
    this.liveButtons = [
      new Button({ label: '🏆 Tournament', color: TOUR_COLOR.live, onTap: () => this.tournament(() => flow.live(this.game, TOUR_KINDS[this.mode])) }),
      ...EVENTS.map((ev) => new Button({ label: ev.name, sub: 'Live', color: '#2bb673', enabled: ev.available, onTap: () => flow.live(this.game, ev.id) })),
    ];
    // Tournament: solo (one athlete does all five) or team (your lineup), remembered on this device.
    this.modeButtons = ['solo', 'team'].map(
      (mode) =>
        new Button({
          label: mode === 'team' ? 'Team' : 'Solo',
          w: 90,
          h: 44,
          onTap: () => {
            this.mode = mode;
            setTourMode(mode);
            this.styleModes();
          },
        }),
    );
    // Rival difficulty (vs Computer only): a two-way toggle, remembered on this device.
    this.level = getDifficulty();
    this.levelButtons = ['amateur', 'pro'].map(
      (level) =>
        new Button({
          label: level === 'pro' ? 'Pro' : 'Amateur',
          w: 130,
          h: 44,
          onTap: () => {
            this.level = level;
            setDifficulty(level);
            this.styleLevels();
          },
        }),
    );
    // Your ghost (vs Computer only): race your best attempt in every event (remembered on this device).
    this.ghostButton = new Button({
      label: '',
      w: 110,
      h: 44,
      onTap: () => {
        setGhostOn(!getGhostOn());
        this.styleGhost();
      },
    });
    this.styleLevels();
    this.styleModes();
    this.styleGhost();
    this.onShow();
    this.tuneButton = new Button({ label: '⚙ Tuning', w: 132, h: 44, color: PLAIN, onTap: () => flow.tuning(this.game) });
    this.onlineButton = new Button({ label: '🌐 Leaderboard', w: 196, h: 44, color: PLAIN, onTap: () => flow.leaderboard(this.game) });
    // Your profile (username for the online leaderboard), top right.
    this.profileButton = new Button({ label: `👤 ${getPlayerName()}`, w: 190, h: 44, color: PLAIN, onTap: () => flow.profile(this.game) });
    this.fsButton = document.fullscreenEnabled ? new Button({ label: '⛶', w: 48, h: 44, color: PLAIN, onTap: () => toggleFullscreen() }) : null;
    // Your bests come from the online boards: catch up with them, then show them.
    syncBests()
      .then((changed) => changed && this.game.scene === this.home && this.showBests())
      .catch(() => {});
  }

  /** Coming to this tab: your lineup may have changed on the Lineup tab. */
  onShow() {
    this.lineup = EVENTS.map((ev) => ({ ev, c: lineupAthlete(ev.id) }));
    this.warnT = 0;
    if (this.modeButtons) this.styleModes(); // a slot may have been emptied or filled
  }

  /** A team tournament with an empty lineup slot: it can't start (single events and solo tournaments can). */
  get teamBlocked() {
    return this.mode === 'team' && EVENTS.some((ev) => lineupSlotEmpty(ev.id));
  }

  /** Starts a tournament (`go`), unless it's a team one and your lineup isn't full. */
  tournament(go) {
    if (this.teamBlocked) this.warnT = 4;
    else go();
  }

  /** Opens a list: 'offline' (vs Computer) or 'live'. */
  open(list) {
    this.list = lastList = list;
    this.fade = 0;
    this.relayout();
  }

  /** Back from a list to the two big buttons. True if there was a list to leave (Esc). */
  back() {
    if (!this.list) return false;
    this.list = lastList = null;
    this.fade = 0;
    this.relayout();
    return true;
  }

  relayout() {
    if (this.view) this.layout(this.view, this.bottom);
  }

  /** The Best lines under the buttons, from your saved bests. */
  showBests() {
    this.styleModes();
    EVENTS.forEach((ev, i) => {
      if (ev.available) this.buttons[i].sub = `Best ${formatMark(ev, getBest(ev.id))}`;
    });
  }

  styleLevels() {
    for (const b of this.levelButtons) b.color = (b.label === 'Pro') === (this.level === 'pro') ? '#e4572e' : PLAIN;
    this.offlineBig.sub = `Tournament + 5 events · ${this.level === 'pro' ? 'Pro' : 'Amateur'} rivals`;
  }

  styleModes() {
    for (const b of this.modeButtons) b.color = (b.label === 'Team') === (this.mode === 'team') ? '#e4572e' : PLAIN;
    const name = this.mode === 'team' ? 'Team' : 'Solo';
    const best = getBest(TOURNAMENT_BOARDS[this.mode].id);
    const blocked = this.teamBlocked;
    this.tourButton.sub = blocked ? 'Team · Lineup not full' : best == null ? `${name} · all 5` : `${name} · Best ${best}`;
    this.liveButtons[0].sub = blocked ? 'Team · Lineup not full' : `Live · ${name}`;
    // Greyed out (but still tappable, to say why) while it can't start.
    this.tourButton.color = blocked ? 'rgba(201,138,0,0.4)' : TOUR_COLOR.offline;
    this.liveButtons[0].color = blocked ? 'rgba(31,138,88,0.45)' : TOUR_COLOR.live;
    if (!blocked) this.warnT = 0;
  }

  styleGhost() {
    const on = getGhostOn();
    this.ghostButton.label = on ? 'On' : 'Off';
    this.ghostButton.color = on ? '#e4572e' : PLAIN;
  }

  /** `bottom`: the top of the tab bar. */
  layout(view, bottom) {
    const margin = 24 + Math.max(view.safe.l, view.safe.r);
    const top = 14 + view.safe.t;

    // Top bar: Tuning, Leaderboard ... Profile, fullscreen (the buttons); Back (a list).
    this.tuneButton.x = 14 + view.safe.l;
    this.onlineButton.x = this.tuneButton.x + this.tuneButton.w + 10;
    this.backBtn.x = 14 + view.safe.l;
    if (this.fsButton) this.fsButton.x = view.w - 48 - 14 - view.safe.r;
    this.profileButton.x = (this.fsButton ? this.fsButton.x - 10 : view.w - 14 - view.safe.r) - this.profileButton.w;
    for (const b of [this.tuneButton, this.onlineButton, this.backBtn, this.fsButton, this.profileButton]) if (b) b.y = top;

    // The two big buttons, side by side.
    const bw = Math.min(330, (view.w - margin * 2 - 24) / 2);
    this.offlineBig.w = this.liveBig.w = bw;
    this.offlineBig.h = this.liveBig.h = 108;
    this.offlineBig.x = view.w / 2 - 12 - bw;
    this.liveBig.x = view.w / 2 + 12;
    this.offlineBig.y = this.liveBig.y = 150;

    // A list: the tournament and the five events, three to a row.
    const gap = 12;
    const w = Math.min(260, (view.w - margin * 2 - gap * 2) / 3);
    const x0 = (view.w - (w * 3 + gap * 2)) / 2;
    for (const row of [[this.tourButton, ...this.buttons], this.liveButtons]) {
      row.forEach((b, i) => Object.assign(b, { w, h: 66, x: x0 + (i % 3) * (w + gap), y: LIST_Y + Math.floor(i / 3) * (66 + gap) }));
    }
    this.listLeft = x0;
    // Its settings: TOURNAMENT (both), RIVALS and GHOST (vs Computer). Narrower on a narrow (4:3) screen.
    const k = Math.min(1, (view.w - 32) / (90 * 2 + 130 * 2 + 110 + 8 * 2 + 32 * 2));
    const [mw, lw, gw, sp] = [90, 130, 110, 32].map((v) => Math.floor(v * k));
    this.modeButtons.forEach((b) => (b.w = mw));
    this.levelButtons.forEach((b) => (b.w = lw));
    this.ghostButton.w = gw;
    const row = mw * 2 + 8 + sp + lw * 2 + 8 + sp + gw;
    this.settingsX = { offline: view.w / 2 - row / 2, live: view.w / 2 - (mw * 2 + 8) / 2 };
    const lx = this.settingsX.offline + mw * 2 + 8 + sp;
    this.levelButtons.forEach((b, i) => Object.assign(b, { x: lx + i * (lw + 8), y: SETTINGS_Y }));
    Object.assign(this.ghostButton, { x: this.settingsX.offline + row - gw, y: SETTINGS_Y });
    this.placeModes();

    // The track along the bottom: your lineup on the buttons screen, a runner under a list.
    this.trackTop = this.list ? SETTINGS_Y + 44 + 18 : 286;
    this.trackBottom = bottom - 6;
    Object.assign(this.fillBtn, { x: view.w / 2 - this.fillBtn.w / 2, y: Math.min(this.trackTop + 58, this.trackBottom - this.fillBtn.h - 6) });
    this.view = view;
    this.bottom = bottom;
  }

  /** The Solo / Team toggle sits in a different place in each list. */
  placeModes() {
    const x = this.settingsX?.[this.list ?? 'offline'] ?? 0;
    this.modeButtons.forEach((b, i) => Object.assign(b, { x: x + i * (b.w + 8), y: SETTINGS_Y }));
  }

  get allButtons() {
    const fill = this.warnT > 0 ? [this.fillBtn] : [];
    if (this.list === 'offline') return [...fill, this.backBtn, this.tourButton, ...this.buttons, ...this.modeButtons, ...this.levelButtons, this.ghostButton];
    if (this.list === 'live') return [...fill, this.backBtn, ...this.liveButtons, ...this.modeButtons];
    return [this.fsButton, this.tuneButton, this.onlineButton, this.profileButton, this.offlineBig, this.liveBig].filter(Boolean);
  }

  /** `events`: this tab's taps and keys (the home screen has sorted out swipes). */
  update(dt, events) {
    for (const ev of events) {
      if (ev.type === 'key' && ev.code === 'Backspace') this.back();
      if (ev.type !== 'down') continue;
      if (this.allButtons.some((b) => b.tap(ev.x, ev.y))) {
        if (this.game.scene !== this.home) return; // off to another screen
        continue;
      }
      // Your lineup on the track: tap it to change it.
      if (!this.list && ev.y >= this.trackTop && ev.y <= this.trackBottom) this.home.show(0);
    }
    this.allButtons.forEach((b) => b.update(dt));
    this.fade = Math.min(1, this.fade + dt * 6);
    this.warnT = Math.max(0, this.warnT - dt);
    this.phase += dt * 5; // the lineup warming up
    // The runner under a list goes along the track.
    const speed = 9;
    this.demoX += speed * dt;
    this.runPhase = (this.runPhase ?? 0) + ((speed * dt) / (CONFIG.runner.strideBase + CONFIG.runner.stridePerMps * speed)) * Math.PI * 2;
  }

  render(ctx, view) {
    // A list (or the buttons) comes in from a little below, fading up.
    const e = 1 - (1 - this.fade) ** 3;
    ctx.save();
    ctx.globalAlpha = e;
    ctx.translate(0, (1 - e) * 24);
    if (this.list) this.renderList(ctx, view);
    else this.renderButtons(ctx, view);
    ctx.restore();
  }

  renderButtons(ctx, view) {
    text(ctx, 'TRACK ROYALE', view.w / 2, 88, { size: 44, color: '#ffb400', shadow: true });
    text(ctx, `Five events. Two thumbs. Starring ${starring(this.lineup)}.`, view.w / 2, 122, { size: 15, weight: 500, color: 'rgba(255,255,255,0.8)', maxWidth: view.w - 40 });
    for (const b of [this.fsButton, this.tuneButton, this.onlineButton, this.profileButton, this.offlineBig, this.liveBig]) b?.draw(ctx);

    // Your lineup, warming up on the track: an athlete per event.
    const top = this.trackTop;
    const h = this.trackBottom - top;
    this.drawTrack(ctx, view, top, h);
    const n = this.lineup.length;
    const step = Math.min(170, (view.w - 80) / n);
    const ground = top + h - 30;
    const H = Math.min(118, h - 46);
    this.lineup.forEach(({ ev, c }, i) => {
      const x = view.w / 2 + (i - (n - 1) / 2) * step;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(x, ground + 2, 22, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      drawFigure(ctx, x, ground, H * heightOf(c.colors), runPose(this.phase + i * 1.3, 0.12), c.colors, ground);
      text(ctx, `${SHORT[ev.id] ?? ev.name} · ${c.name}`, x, ground + 17, { size: 13, weight: 700, color: 'rgba(255,255,255,0.85)', maxWidth: step - 8 });
    });
  }

  renderList(ctx, view) {
    const offline = this.list === 'offline';
    this.backBtn.draw(ctx);
    text(ctx, offline ? 'VS COMPUTER' : 'LIVE', view.w / 2, 40, { size: 32, color: offline ? '#ffb400' : '#59cd90', shadow: true });
    text(ctx, offline ? 'Race the computer. Your best marks are saved.' : 'Race people right now: a waiting room first, then everyone goes together.', view.w / 2, 72, {
      size: 15,
      weight: 500,
      color: 'rgba(255,255,255,0.8)',
      maxWidth: view.w - 40,
    });
    this.drawTrack(ctx, view, this.trackTop, this.trackBottom - this.trackTop, true);
    for (const b of offline ? [this.tourButton, ...this.buttons] : this.liveButtons) b.draw(ctx);
    if (this.warnT > 0) {
      // Clash Royale style: say what's missing, right over the track.
      ctx.save();
      ctx.globalAlpha *= Math.min(1, this.warnT * 2);
      text(ctx, 'You need a full lineup for a Team tournament!', view.w / 2, this.trackTop + 28, { size: 24, weight: 800, color: '#fff', shadow: true, maxWidth: view.w - 40 });
      this.fillBtn.draw(ctx);
      ctx.restore();
    }
    const ly = SETTINGS_Y - 14;
    const label = (s, a, b) => text(ctx, s, (a.x + b.x + b.w) / 2, ly, { size: 13, weight: 700, color: DIM });
    const [m0, m1] = this.modeButtons;
    label('TOURNAMENT', m0, m1);
    this.modeButtons.forEach((b) => b.draw(ctx));
    if (!offline) return;
    label('RIVALS', ...this.levelButtons);
    this.levelButtons.forEach((b) => b.draw(ctx));
    label('GHOST', this.ghostButton, this.ghostButton);
    this.ghostButton.draw(ctx);
  }

  /** A strip of track; `runner`: with your 100m runner going along it. */
  drawTrack(ctx, view, top, h, runner = false) {
    if (h < 30) return;
    ctx.fillStyle = '#b8452c';
    ctx.fillRect(0, top, view.w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(0, top, view.w, 2);
    ctx.fillRect(0, top + h - 2, view.w, 2);
    if (!runner) return;
    const me = this.lineup[0].c;
    const ppm = 30; // the demo runner keeps its own small scale
    const span = view.w + 120;
    const sx = ((this.demoX * ppm) % span) - 60;
    drawFigure(ctx, sx, top + h - 10, CONFIG.figure.height * ppm * heightOf(me.colors), runPose(this.runPhase ?? 0, 1), me.colors);
  }
}

/** One of the two big buttons: a big label with a line under it, and a bottom edge so it stands up. */
class BigButton extends Button {
  draw(ctx) {
    const inset = this.pressT > 0 ? 3 : 0;
    const { x, y, w, h } = this;
    roundRect(ctx, x + inset, y + inset + 5, w - inset * 2, h - inset * 2, 18);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();
    roundRect(ctx, x + inset, y + inset + (inset ? 3 : 0), w - inset * 2, h - inset * 2, 18);
    ctx.fillStyle = this.color;
    ctx.fill();
    const cy = y + h / 2 + (inset ? 3 : 0);
    text(ctx, this.label, x + w / 2, cy - 12, { size: 32, weight: 800, shadow: true, maxWidth: w - 24 });
    text(ctx, this.sub, x + w / 2, cy + 24, { size: 15, weight: 600, color: 'rgba(255,255,255,0.88)', maxWidth: w - 24 });
  }
}

/** "Juno", or "Juno, Okoro and Chan": everyone in your lineup, once each. */
function starring(lineup) {
  const names = [...new Set(lineup.map(({ c }) => c.name))];
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

const TOUR_COLOR = { offline: '#c98a00', live: '#1f8a58' };
const LIST_Y = 100; // top of a list's first row of buttons
const SETTINGS_Y = 270; // a list's settings row

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
    return;
  }
  document.documentElement
    .requestFullscreen?.({ navigationUI: 'hide' })
    .then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => {});
}
