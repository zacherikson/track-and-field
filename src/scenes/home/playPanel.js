import { CONFIG } from '../../config.js';
import { Button, text, roundRect } from '../../core/ui.js';
import { drawFigure, runPose } from '../../athletes/stickFigure.js';
import { EVENTS, SPECIAL_EVENTS, formatMark } from '../../events/registry.js';
import { canTune, getBest, getGhostOn, setGhostOn, getPlayerName, setCampaign, getBeaten, takeFreshBeaten, getSpecialLevel, setSpecialLevel } from '../../core/storage.js';
import { myAthlete, heightOf } from '../../athletes/roster.js';
import { TOURNAMENT_KIND } from '../../tournament/tournament.js';
import { flow } from '../../flow.js';
import { syncBests } from '../../online/bests.js';
import { syncProgress } from '../../online/progress.js';
import { EventTile } from './eventTile.js';

const SHORT = { sprint100: '100m', longjump: 'Long jump', hurdles110: 'Hurdles', polevault: 'Pole vault', javelin: 'Javelin' };
const DIM = 'rgba(255,255,255,0.6)';
const PLAIN = 'rgba(255,255,255,0.15)';

// When the menu last fetched your progress from your account (see enter()).
let lastPull = -Infinity;
const PULL_EVERY = 60000; // ms

// The list you were on (null: the big buttons), kept for the session so
// Menu after a race comes back to it.
let lastList = null;

/**
 * The home screen's middle tab: where you play. Two big buttons, vs Computer
 * and Live, over your athlete warming up on the track; each opens its list.
 * Tuning (the owner only, storage.js canTune), Leaderboard and Profile along the top.
 *
 * vs Computer is four big buttons in a grid, each opening its own page:
 * - Amateur and Pro, a mini campaign each: six cards, the five events then the
 *   tournament. Win an event (in any order) and its card is stamped BEATEN!;
 *   beat all five and the tournament opens; win that too. Pro stays locked
 *   until all of Amateur (tournament too) is beaten.
 * - Training: the five events on your own (no tournament), no rivals (your ghost
 *   if GHOST is on), nothing ticked off. Campaigns never have a ghost.
 * - Special Events: what doesn't fit the five (the 4x100m relay, the cycling
 *   time trial), always against computer rivals at the level its RIVALS toggle says.
 * Live is the tournament and the five events against other people.
 */
export class PlayPanel {
  constructor(home) {
    this.home = home;
    this.game = home.game;
  }

  enter() {
    this.list = lastList; // null | 'offline' (its grid) | 'amateur' | 'pro' | 'training' | 'special' | 'live'
    this.fade = 1; // 0 -> 1 as a list (or the buttons) come in
    this.phase = 0;
    this.demoX = 0;
    // The two big buttons.
    this.offlineBig = new BigButton({ label: '🤖 vs Computer', sub: 'Tournament + 5 events', color: '#e4572e', onTap: () => this.open('offline') });
    this.liveBig = new BigButton({ label: '🌐 Live', sub: 'Race people right now', color: '#1f8a58', onTap: () => this.open('live') });
    // Special Events: a card each, and who you race (remembered for the session).
    this.specialButtons = SPECIAL_EVENTS.map(
      (ev) =>
        new Button({
          label: ev.name,
          sub: `Best ${formatMark(ev, getBest(ev.id))}`,
          w: 300,
          h: 96,
          size: 28,
          color: '#c2337a',
          enabled: ev.available,
          onTap: () => {
            setCampaign(null); // nothing to tick off: never a campaign
            flow.intro(this.game, ev);
          },
        }),
    );
    this.rivalButtons = ['amateur', 'pro'].map(
      (level) =>
        new Button({
          label: level === 'pro' ? 'Pro' : 'Amateur',
          w: 120,
          h: 44,
          onTap: () => {
            setSpecialLevel(level);
            this.styleRivals();
          },
        }),
    );
    this.styleRivals();
    this.warnT = 0; // a locked card tapped: why, over the track
    this.backBtn = new Button({ label: '‹ Back', w: 120, h: 44, size: 20, color: PLAIN, onTap: () => this.back() });
    // vs Computer: a page of cards per section, the five events then the tournament.
    this.sections = SECTIONS.map((spec) => {
      const sec = { ...spec };
      sec.key = spec.level ?? 'training';
      sec.tiles = [
        ...EVENTS.map(
          (ev) =>
            new EventTile({
              id: ev.id,
              name: SHORT[ev.id] ?? ev.name,
              color: sec.color,
              enabled: ev.available,
              onTap: () => {
                if (this.refuse(sec, ev.id)) return;
                setCampaign(sec.level);
                flow.intro(this.game, ev);
              },
            }),
        ),
        // A campaign ends in its tournament (Training is the five events on their own).
        ...(sec.level ? [new EventTile({ id: 'tournament', name: 'Tournament', color: sec.color, onTap: () => this.campaignTournament(sec) })] : []),
      ];
      return sec;
    });
    this.training = this.sections.find((sec) => !sec.level);
    this.buttons = this.training.tiles;
    // vs Computer's grid: a big button for each section, and Special Events.
    this.gridButtons = [
      ...this.sections.map((sec) => Object.assign(new BigButton({ label: sec.name, sub: '', color: sec.color, onTap: () => this.openSection(sec) }), { key: sec.key })),
      Object.assign(new BigButton({ label: '⭐ Special Events', sub: 'Relay · Time Trial', color: '#c2337a', onTap: () => this.open('special') }), { key: 'special' }),
    ];
    this.styleSections(takeFreshBeaten());
    // Live: the same six cards as a campaign's, against other people (a waiting room first, online/live.js).
    this.liveButtons = [
      ...EVENTS.map((ev) => new EventTile({ id: ev.id, name: SHORT[ev.id] ?? ev.name, color: '#2bb673', enabled: ev.available, onTap: () => flow.live(this.game, ev.id) })),
      new EventTile({ id: 'tournament', name: 'Tournament', color: TOUR_COLOR.live, onTap: () => flow.live(this.game, TOURNAMENT_KIND) }),
    ];
    // Your ghost (Training only): race your best attempt in every event (remembered on this device).
    this.ghostButton = new Button({
      label: '',
      w: 110,
      h: 44,
      onTap: () => {
        setGhostOn(!getGhostOn());
        this.styleGhost();
      },
    });
    this.styleGhost();
    this.onShow();
    this.tuneButton = canTune() ? new Button({ label: '⚙ Tuning', w: 132, h: 44, color: PLAIN, onTap: () => flow.tuning(this.game) }) : null;
    this.onlineButton = new Button({ label: '📊 Leaderboard', w: 196, h: 44, color: PLAIN, onTap: () => flow.leaderboard(this.game) });
    // Your profile (username for the online leaderboard), top right.
    this.profileButton = new Button({ label: `👤 ${getPlayerName()}`, w: 190, h: 44, color: PLAIN, onTap: () => flow.profile(this.game) });
    this.fsButton = document.fullscreenEnabled ? new Button({ label: '⛶', w: 48, h: 44, color: PLAIN, onTap: () => toggleFullscreen() }) : null;
    // Your bests come from the online boards: catch up with them, then show them.
    syncBests()
      .then((changed) => changed && this.game.scene === this.home && this.showBests())
      .catch(() => {});
    // Your campaign progress and athlete follow your account (online/progress.js):
    // catch up with it too. That needs the Firebase SDK (it's private), so not
    // every time you're back at the menu: your own changes go up as they happen.
    if (performance.now() - lastPull > PULL_EVERY) {
      lastPull = performance.now();
      syncProgress()
        .then((changed) => changed && this.game.scene === this.home && this.showProgress())
        .catch((e) => console.warn('progress not synced', e));
    }
  }

  /** Your progress came in from your account: the campaign cards and your athlete again. */
  showProgress() {
    this.onShow();
    this.styleSections();
  }

  /** Coming to this tab: your athlete may have changed on the Athlete tab. */
  onShow() {
    this.me = myAthlete();
    this.warnT = 0;
  }

  /** A section's page from the grid (Pro: once all of Amateur is beaten). */
  openSection(sec) {
    if (sec.locked) {
      const lock = this.lockOf(sec, sec.tiles[0].id);
      return this.warn(lock.title, lock.detail);
    }
    this.open(sec.key);
  }

  /** The vs Computer section whose page is open, or null. */
  get section() {
    return this.sections.find((sec) => sec.key === this.list) ?? null;
  }

  /** A campaign's tournament card, once its five events are beaten. */
  campaignTournament(sec) {
    if (this.refuse(sec, 'tournament')) return;
    setCampaign(sec.level);
    flow.tournament(this.game);
  }

  /**
   * Why card `id` in section `sec` is locked, as { title, detail }, or null if it isn't:
   * a section with `after` waits for all of that one, and a campaign's tournament for its five events.
   */
  lockOf(sec, id) {
    if (sec.after) {
      const prev = this.sections.find((s) => s.level === sec.after);
      const beaten = getBeaten(prev.level);
      const left = prev.tiles.filter((t) => !beaten[t.id]);
      const rest = left.length > 3 ? `${left.length} cards to go` : listOf(left); // a long list won't fit the card
      if (left.length) return { title: `🔒 ${titleCase(sec.title)} is locked`, detail: `Beat the rest of ${titleCase(prev.title)} first: ${rest}.` };
    }
    if (sec.level && id === 'tournament') {
      const beaten = getBeaten(sec.level);
      const left = sec.tiles.filter((t) => t.id !== 'tournament' && !beaten[t.id]);
      if (left.length) return { title: '🔒 Tournament locked', detail: `Beat ${listOf(left)} in ${titleCase(sec.title)} to unlock it.` };
    }
    return null;
  }

  /** Tapped a locked card: says why (and true). */
  refuse(sec, id) {
    const lock = this.lockOf(sec, id);
    if (lock) this.warn(lock.title, lock.detail);
    return !!lock;
  }

  /** A line over the track for a few seconds; `detail`: a second, smaller line. */
  warn(msg, detail = '') {
    this.warnMsg = msg;
    this.warnDetail = detail;
    this.warnT = detail ? 5 : 4;
  }

  /** Opens a list: 'offline' (vs Computer's grid), one of its pages ('amateur', 'pro', 'training', 'special'), or 'live'. */
  open(list) {
    this.list = lastList = list;
    this.fade = 0;
    this.warnT = 0;
    // A card beaten since you were last here thumps its stamp down as the list comes in.
    for (const sec of this.sections) for (const t of sec.tiles) if (t.stampAge != null) t.stampAge = 0;
    this.relayout();
  }

  /** Back a step: from a vs Computer page to its grid, from a list to the big buttons. True if there was a list to leave (Esc). */
  back() {
    if (!this.list) return false;
    this.list = lastList = this.list === 'offline' || this.list === 'live' ? null : 'offline';
    this.warnT = 0;
    this.fade = 0;
    this.relayout();
    return true;
  }

  relayout() {
    if (this.view) this.layout(this.view, this.bottom);
  }

  /** The Best lines under the Training and Special Events cards, from your saved bests. */
  showBests() {
    EVENTS.forEach((ev, i) => {
      this.buttons[i].sub = ev.available ? `Best ${formatMark(ev, getBest(ev.id))}` : 'Coming soon';
    });
    SPECIAL_EVENTS.forEach((ev, i) => {
      this.specialButtons[i].sub = ev.available ? `Best ${formatMark(ev, getBest(ev.id))}` : 'Coming soon';
    });
  }

  styleRivals() {
    const level = getSpecialLevel();
    for (const b of this.rivalButtons) b.color = (b.label === 'Pro') === (level === 'pro') ? '#c2337a' : PLAIN;
  }

  /** The campaign cards: BEATEN! stamps, the locked tournaments; `fresh` ({ level, id }) is stamped in. */
  styleSections(fresh = null) {
    for (const sec of this.sections) {
      if (!sec.level) continue;
      const beaten = getBeaten(sec.level);
      sec.done = sec.tiles.filter((t) => beaten[t.id]).length;
      sec.locked = !!(sec.after && this.lockOf(sec, sec.tiles[0].id));
      for (const t of sec.tiles) {
        t.beaten = !!beaten[t.id];
        t.locked = !!this.lockOf(sec, t.id);
        t.stampAge = fresh && fresh.level === sec.level && fresh.id === t.id ? 0 : null;
      }
    }
    const done = (level) => this.sections.find((sec) => sec.level === level).done;
    const pro = this.sections.find((sec) => sec.level === 'pro');
    this.offlineBig.sub = `Amateur ${done('amateur')}/6 · Pro ${pro.locked ? '🔒' : `${done('pro')}/6`} · Training · Special`;
    for (const b of this.gridButtons) {
      const sec = this.sections.find((x) => x.key === b.key);
      if (!sec) continue;
      const complete = sec.level && sec.done === sec.tiles.length;
      b.sub = !sec.level ? 'Just you (and your ghost)' : sec.locked ? `🔒 Beat ${titleCase(sec.after)} first` : complete ? '★ Complete' : `${sec.done} / ${sec.tiles.length} beaten`;
      b.color = sec.locked ? 'rgba(123,47,191,0.45)' : sec.color;
    }
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
    if (this.tuneButton) this.tuneButton.x = 14 + view.safe.l;
    this.onlineButton.x = this.tuneButton ? this.tuneButton.x + this.tuneButton.w + 10 : 14 + view.safe.l;
    this.backBtn.x = 14 + view.safe.l;
    if (this.fsButton) this.fsButton.x = view.w - 48 - 14 - view.safe.r;
    this.profileButton.x = (this.fsButton ? this.fsButton.x - 10 : view.w - 14 - view.safe.r) - this.profileButton.w;
    for (const b of [this.tuneButton, this.onlineButton, this.backBtn, this.fsButton, this.profileButton]) if (b) b.y = top;

    // The two big buttons, side by side.
    const bigs = [this.offlineBig, this.liveBig];
    const bigGap = 18;
    const bw = Math.min(340, (view.w - margin * 2 - bigGap) / 2);
    bigs.forEach((b, i) => Object.assign(b, { w: bw, h: 108, x: view.w / 2 - (bw * 2 + bigGap) / 2 + i * (bw + bigGap), y: 150 }));

    // vs Computer: its four big buttons, two by two.
    const gw = Math.min(320, (view.w - margin * 2 - GRID_GAP) / 2);
    this.gridButtons.forEach((b, i) => Object.assign(b, { w: gw, h: GRID_H, x: view.w / 2 - gw - GRID_GAP / 2 + (i % 2) * (gw + GRID_GAP), y: GRID_Y + Math.floor(i / 2) * (GRID_H + GRID_GAP) }));

    // Special Events: the cards in a row, the RIVALS toggle under them.
    const sw = Math.min(300, (view.w - margin * 2 - gapFor(this.specialButtons.length)) / this.specialButtons.length);
    const sx = view.w / 2 - (sw * this.specialButtons.length + gapFor(this.specialButtons.length)) / 2;
    this.specialButtons.forEach((b, i) => Object.assign(b, { w: sw, h: 96, x: sx + i * (sw + 16), y: SPECIAL_Y }));
    this.rivalButtons.forEach((b, i) => Object.assign(b, { x: view.w / 2 - b.w - 4 + i * (b.w + 8), y: SPECIAL_SETTINGS_Y }));

    // A vs Computer section's page, and Live: six cards in a row (each the same).
    const n = 6;
    const tw = Math.min(TILE_MAX, (view.w - margin * 2 - (n - 1) * TILE_GAP) / n);
    this.tileH = Math.round(tw * 1.08);
    for (const row of [...this.sections.map((sec) => sec.tiles), this.liveButtons]) {
      const rx = (view.w - (row.length * tw + (row.length - 1) * TILE_GAP)) / 2; // Training's five, centred
      row.forEach((t, i) => Object.assign(t, { w: tw, h: this.tileH, x: rx + i * (tw + TILE_GAP), y: TILES_Y }));
    }
    // Its setting: GHOST (Training).
    Object.assign(this.ghostButton, { x: view.w / 2 - this.ghostButton.w / 2, y: TILES_Y + this.tileH + 34 });

    // The track along the bottom: your athlete on the buttons screen, a runner under a list.
    const sec = this.section;
    this.trackTop = !this.list
      ? 286
      : this.list === 'offline'
        ? GRID_Y + 2 * GRID_H + GRID_GAP + 16
        : sec?.level || this.list === 'live'
          ? TILES_Y + this.tileH + 22 // a campaign and Live have no settings row
          : this.settingsY + 44 + 14;
    this.trackBottom = bottom - 6;
    // The warning: a card over the buttons (the track under them is short).
    this.warnY = this.list === 'offline' ? GRID_Y + GRID_H - 10 : TILES_Y + this.tileH / 2 - 22;
    this.view = view;
    this.bottom = bottom;
  }

  /** Top of the open list's settings row. */
  get settingsY() {
    return this.list === 'special' ? SPECIAL_SETTINGS_Y : this.ghostButton.y;
  }

  get tiles() {
    return this.sections.flatMap((sec) => sec.tiles);
  }

  get allButtons() {
    const sec = this.section;
    if (sec) return [this.backBtn, ...sec.tiles, ...(sec.level ? [] : [this.ghostButton])];
    if (this.list === 'offline') return [this.backBtn, ...this.gridButtons];
    if (this.list === 'live') return [this.backBtn, ...this.liveButtons];
    if (this.list === 'special') return [this.backBtn, ...this.specialButtons, ...this.rivalButtons];
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
      // Your athlete on the track: tap them to change who it is.
      if (!this.list && ev.y >= this.trackTop && ev.y <= this.trackBottom) this.home.show(0);
    }
    this.allButtons.forEach((b) => b.update(dt));
    this.fade = Math.min(1, this.fade + dt * 6);
    this.warnT = Math.max(0, this.warnT - dt);
    this.phase += dt * 5; // your athlete warming up
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
    for (const b of [this.fsButton, this.tuneButton, this.onlineButton, this.profileButton, this.offlineBig, this.liveBig]) b?.draw(ctx);

    // Your athlete, warming up on the track.
    const top = this.trackTop;
    const h = this.trackBottom - top;
    this.drawTrack(ctx, view, top, h);
    const { me } = this;
    const x = view.w / 2;
    const ground = top + h - 30;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(x, ground + 2, 26, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    drawFigure(ctx, x, ground, Math.min(150, h - 46) * heightOf(me.colors), runPose(this.phase, 0.12), me.colors, ground);
    text(ctx, me.name, x, ground + 17, { size: 15, weight: 800, color: '#fff' });
  }

  renderList(ctx, view) {
    this.backBtn.draw(ctx);
    const sec = this.section;
    if (this.list === 'special') this.renderSpecial(ctx, view);
    else if (sec) this.renderSection(ctx, view, sec);
    else if (this.list === 'live') {
      text(ctx, 'LIVE', view.w / 2, 36, { size: 30, color: '#59cd90', shadow: true });
      text(ctx, 'Race people right now: a waiting room first', view.w / 2, 66, { size: 15, weight: 700, color: DIM });
      this.drawTrack(ctx, view, this.trackTop, this.trackBottom - this.trackTop, true);
      this.liveButtons.forEach((b) => b.draw(ctx));
    } else {
      text(ctx, 'VS COMPUTER', view.w / 2, 36, { size: 30, color: '#ffb400', shadow: true });
      this.drawTrack(ctx, view, this.trackTop, this.trackBottom - this.trackTop, true);
      this.gridButtons.forEach((b) => b.draw(ctx));
    }
    this.drawWarning(ctx, view);
  }

  /** Clash Royale style: say what's missing, on a card over the buttons. */
  drawWarning(ctx, view) {
    if (this.warnT <= 0) return;
    ctx.save();
    ctx.globalAlpha *= Math.min(1, this.warnT * 2);
    const pw = Math.min(view.w - 40, 640);
    roundRect(ctx, view.w / 2 - pw / 2, this.warnY - 32, pw, this.warnDetail ? 92 : 64, 16);
    ctx.fillStyle = 'rgba(10,18,36,0.94)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, this.warnMsg, view.w / 2, this.warnY, { size: 22, weight: 800, color: '#fff', shadow: true, maxWidth: pw - 32 });
    if (this.warnDetail) text(ctx, this.warnDetail, view.w / 2, this.warnY + 32, { size: 16, weight: 600, color: 'rgba(255,255,255,0.85)', maxWidth: pw - 32 });
    ctx.restore();
  }

  /** Special Events: the cards, and who you race in them. */
  renderSpecial(ctx, view) {
    text(ctx, 'SPECIAL EVENTS', view.w / 2, 36, { size: 30, color: '#ff8cc6', shadow: true });
    this.drawTrack(ctx, view, this.trackTop, this.trackBottom - this.trackTop, true);
    this.specialButtons.forEach((b) => b.draw(ctx));
    const [a, p] = this.rivalButtons;
    text(ctx, 'RIVALS', (a.x + p.x + p.w) / 2, this.settingsY - 14, { size: 13, weight: 700, color: DIM });
    this.rivalButtons.forEach((b) => b.draw(ctx));
  }

  /** A vs Computer section's page: its name and progress, its cards, and (Training) GHOST. */
  renderSection(ctx, view, sec) {
    text(ctx, sec.title, view.w / 2, 36, { size: 30, color: sec.label, shadow: true });
    const complete = sec.level && sec.done === sec.tiles.length;
    const sub = !sec.level ? 'Just you: no rivals, nothing ticked off' : complete ? '★ Complete' : `${sec.done} / ${sec.tiles.length} beaten`;
    text(ctx, sub, view.w / 2, 66, { size: 15, weight: 700, color: complete ? '#ffd35c' : DIM });
    this.drawTrack(ctx, view, this.trackTop, this.trackBottom - this.trackTop, true);
    sec.tiles.forEach((t) => t.draw(ctx));
    if (sec.level) return;
    text(ctx, 'TRAINING GHOST', this.ghostButton.x + this.ghostButton.w / 2, this.settingsY - 14, { size: 13, weight: 700, color: DIM });
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
    const { me } = this;
    const ppm = 30; // the demo runner keeps its own small scale
    const span = view.w + 120;
    const sx = ((this.demoX * ppm) % span) - 60;
    drawFigure(ctx, sx, top + h - 10, CONFIG.figure.height * ppm * heightOf(me.colors), runPose(this.runPhase ?? 0, 1), me.colors);
  }
}

/** One of the big buttons (here, and the Squad tab's Practice): a big label with a line under it, and a bottom edge so it stands up. */
export class BigButton extends Button {
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

/** "AMATEUR" -> "Amateur". */
function titleCase(s) {
  return s[0].toUpperCase() + s.slice(1).toLowerCase();
}

/** "100m", "100m and Hurdles", "100m, Hurdles and the tournament": cards by name. */
function listOf(tiles) {
  const names = tiles.map((t) => (t.id === 'tournament' ? 'the tournament' : t.name));
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

const TOUR_COLOR = { live: '#1f8a58' };
const SPECIAL_Y = 104; // top of the Special Events cards
const SPECIAL_SETTINGS_Y = 238; // the Special Events RIVALS row
const gapFor = (n) => (n - 1) * 16; // between the Special Events cards
// vs Computer: the sections (level null: Training), in grid order (Special Events comes after).
const SECTIONS = [
  { level: 'amateur', title: 'AMATEUR', name: '🥉 Amateur', color: '#e4352a', label: '#ff7a5c' },
  { level: 'pro', title: 'PRO', name: '🥇 Pro', color: '#7b2fbf', label: '#c08cff', after: 'amateur' }, // locked until all of Amateur is beaten
  { level: null, title: 'TRAINING', name: '🎯 Training', color: '#2d6fa8', label: '#7cc4ff' },
];
const GRID_Y = 66; // top of vs Computer's grid
const GRID_H = 92;
const GRID_GAP = 14;
const TILES_Y = 92; // top of a section page's cards
const TILE_MAX = 132; // a card's width at most
const TILE_GAP = 10;

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
