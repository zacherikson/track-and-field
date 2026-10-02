import { CONFIG } from '../../config.js';
import { Button, text, roundRect } from '../../core/ui.js';
import { drawFigure, runPose } from '../../athletes/stickFigure.js';
import { EVENTS, SPECIAL_EVENTS, TOURNAMENT_BOARDS, formatMark } from '../../events/registry.js';
import { getRelayLevel, setRelayLevel } from '../../events/relay4x100.js';
import { canTune, getBest, getGhostOn, setGhostOn, getPlayerName, getTourMode, setTourMode, setCampaign, getBeaten, takeFreshBeaten } from '../../core/storage.js';
import { lineupAthlete, lineupSlotEmpty, heightOf } from '../../athletes/roster.js';
import { TOUR_KINDS } from '../../tournament/tournament.js';
import { flow } from '../../flow.js';
import { syncBests } from '../../online/bests.js';
import { EventTile } from './eventTile.js';

const SHORT = { sprint100: '100m', longjump: 'Long jump', hurdles110: 'Hurdles', polevault: 'Pole vault', javelin: 'Javelin' };
const DIM = 'rgba(255,255,255,0.6)';
const PLAIN = 'rgba(255,255,255,0.15)';

// The list you were on (null: the big buttons), kept for the session so
// Menu after a race comes back to it.
let lastList = null;

/**
 * The home screen's middle tab: where you play. Three big buttons, vs Computer,
 * Live and Special Events, over your lineup standing on the track; each opens its list.
 * Tuning (the owner only, storage.js canTune), Leaderboard and Profile along the top.
 *
 * vs Computer is three rows of cards, the five events then the tournament:
 * - Amateur and Pro, a mini campaign each: win an event (in any order) and its
 *   card is stamped BEATEN!; beat all five and the tournament opens; win that too.
 *   Pro stays locked until all of Amateur (tournament too) is beaten.
 * - Training: play anything on your own, no rivals (your ghost if GHOST is on), nothing ticked off.
 *   Campaigns never have a ghost.
 * Live is the tournament and the five events against other people.
 * Special Events is what doesn't fit the five (the 4x100m relay), always
 * against computer rivals at the level its RIVALS toggle says.
 */
export class PlayPanel {
  constructor(home) {
    this.home = home;
    this.game = home.game;
  }

  enter() {
    this.list = lastList; // null | 'offline' | 'live' | 'special'
    this.fade = 1; // 0 -> 1 as a list (or the buttons) come in
    this.phase = 0;
    this.demoX = 0;
    // The two big buttons.
    this.offlineBig = new BigButton({ label: '🤖 vs Computer', sub: 'Tournament + 5 events', color: '#e4572e', onTap: () => this.open('offline') });
    this.liveBig = new BigButton({ label: '🌐 Live', sub: 'Race people right now', color: '#1f8a58', onTap: () => this.open('live') });
    this.specialBig = new BigButton({ label: '⭐ Special Events', sub: '4×100m Relay', color: '#c2337a', onTap: () => this.open('special') });
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
            setRelayLevel(level);
            this.styleRivals();
          },
        }),
    );
    this.styleRivals();
    // A team tournament needs every lineup slot filled (Lineup tab); trying one without says so.
    this.warnT = 0;
    this.fillBtn = new Button({ label: 'Fill your lineup ›', w: 230, h: 42, size: 19, color: '#3a6fd8', onTap: () => this.home.show(0) });
    this.backBtn = new Button({ label: '‹ Back', w: 120, h: 44, size: 20, color: PLAIN, onTap: () => this.back() });
    // Tournament: all five events in a row, decathlon scoring; solo or team (the TOURNAMENT toggle).
    this.mode = getTourMode();
    // vs Computer: a row of cards per section, the five events then the tournament.
    this.sections = SECTIONS.map((spec) => {
      const sec = { ...spec };
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
        new EventTile({ id: 'tournament', name: 'Tournament', color: sec.level ? sec.color : TOUR_COLOR.offline, onTap: () => this.campaignTournament(sec) }),
      ];
      return sec;
    });
    this.training = this.sections.find((sec) => !sec.level);
    this.tourButton = this.training.tiles.at(-1);
    this.buttons = this.training.tiles.slice(0, -1);
    this.styleSections(takeFreshBeaten());
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
    this.styleModes();
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
    if (this.teamBlocked) this.warn('You need a full lineup for a Team tournament!', true);
    else go();
  }

  /** A section's tournament card: Training's, or a campaign's once its five events are beaten. */
  campaignTournament(sec) {
    if (this.refuse(sec, 'tournament')) return;
    this.tournament(() => {
      setCampaign(sec.level);
      flow.tournament(this.game, this.mode);
    });
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
      if (left.length) return { title: `🔒 ${titleCase(sec.title)} is locked`, detail: `Beat the rest of ${titleCase(prev.title)} first: ${listOf(left)}.` };
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
    if (lock) this.warn(lock.title, false, lock.detail);
    return !!lock;
  }

  /** A line over the track for a few seconds; `fill`: with the Fill your lineup button; `detail`: a second, smaller line. */
  warn(msg, fill = false, detail = '') {
    this.warnMsg = msg;
    this.warnFill = fill;
    this.warnDetail = detail;
    this.warnT = detail ? 5 : 4;
  }

  /** Opens a list: 'offline' (vs Computer), 'live' or 'special'. */
  open(list) {
    this.list = lastList = list;
    this.fade = 0;
    this.warnT = 0;
    // A card beaten since you were last here thumps its stamp down as the list comes in.
    for (const sec of this.sections) for (const t of sec.tiles) if (t.stampAge != null) t.stampAge = 0;
    this.relayout();
  }

  /** Back from a list to the big buttons. True if there was a list to leave (Esc). */
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

  /** The Best lines under the Training and Special Events cards, from your saved bests. */
  showBests() {
    this.styleModes();
    EVENTS.forEach((ev, i) => {
      this.buttons[i].sub = ev.available ? `Best ${formatMark(ev, getBest(ev.id))}` : 'Coming soon';
    });
    SPECIAL_EVENTS.forEach((ev, i) => {
      this.specialButtons[i].sub = ev.available ? `Best ${formatMark(ev, getBest(ev.id))}` : 'Coming soon';
    });
  }

  styleRivals() {
    const level = getRelayLevel();
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
    this.offlineBig.sub = `Amateur ${done('amateur')}/6 · Pro ${pro.locked ? '🔒' : `${done('pro')}/6`} · Training`;
  }

  styleModes() {
    for (const b of this.modeButtons) b.color = (b.label === 'Team') === (this.mode === 'team') ? '#e4572e' : PLAIN;
    const name = this.mode === 'team' ? 'Team' : 'Solo';
    const best = getBest(TOURNAMENT_BOARDS[this.mode].id);
    const blocked = this.teamBlocked;
    this.tourButton.sub = blocked ? 'Lineup not full' : best == null ? name : `${name} · ${best}`;
    this.liveButtons[0].sub = blocked ? 'Team · Lineup not full' : `Live · ${name}`;
    // Greyed out (but still tappable, to say why) while it can't start.
    this.tourButton.color = blocked ? 'rgba(201,138,0,0.4)' : TOUR_COLOR.offline;
    for (const sec of this.sections) if (sec.level) sec.tiles.at(-1).sub = blocked && !sec.tiles.at(-1).locked ? 'Lineup not full' : name;
    this.liveButtons[0].color = blocked ? 'rgba(31,138,88,0.45)' : TOUR_COLOR.live;
    if (!blocked && this.warnFill) this.warnT = 0;
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

    // The three big buttons, side by side.
    const bigs = [this.offlineBig, this.liveBig, this.specialBig];
    const bigGap = 18;
    const bw = Math.min(300, (view.w - margin * 2 - bigGap * 2) / 3);
    bigs.forEach((b, i) => Object.assign(b, { w: bw, h: 108, x: view.w / 2 - (bw * 3 + bigGap * 2) / 2 + i * (bw + bigGap), y: 150 }));

    // Special Events: the cards in a row, the RIVALS toggle under them.
    const sw = Math.min(300, (view.w - margin * 2 - gapFor(this.specialButtons.length)) / this.specialButtons.length);
    const sx = view.w / 2 - (sw * this.specialButtons.length + gapFor(this.specialButtons.length)) / 2;
    this.specialButtons.forEach((b, i) => Object.assign(b, { w: sw, h: 96, x: sx + i * (sw + 16), y: SPECIAL_Y }));
    this.rivalButtons.forEach((b, i) => Object.assign(b, { x: view.w / 2 - b.w - 4 + i * (b.w + 8), y: SPECIAL_SETTINGS_Y }));

    // Live: the tournament and the five events, three to a row.
    const gap = 12;
    const w = Math.min(260, (view.w - margin * 2 - gap * 2) / 3);
    const x0 = (view.w - (w * 3 + gap * 2)) / 2;
    this.liveButtons.forEach((b, i) => Object.assign(b, { w, h: 66, x: x0 + (i % 3) * (w + gap), y: LIST_Y + Math.floor(i / 3) * (66 + gap) }));
    // vs Computer: a row of six cards per section, its name to the left.
    const n = 6;
    const labelW = Math.min(120, Math.floor((view.w - margin * 2) * 0.16));
    const tw = Math.min(TILE_H + 30, (view.w - margin * 2 - labelW - 10 - (n - 1) * TILE_GAP) / n);
    const rowW = labelW + 10 + n * tw + (n - 1) * TILE_GAP;
    const rx = (view.w - rowW) / 2;
    this.sections.forEach((sec, r) => {
      sec.y = SECTION_Y + r * (TILE_H + 12);
      sec.labelX = rx + labelW / 2;
      sec.tiles.forEach((t, i) => Object.assign(t, { w: tw, h: TILE_H, x: rx + labelW + 10 + i * (tw + TILE_GAP), y: sec.y }));
    });
    // Its settings: TOURNAMENT (both), and GHOST (vs Computer, for Training).
    const [mw, gw, sp] = [90, 110, 48];
    this.modeButtons.forEach((b) => (b.w = mw));
    this.ghostButton.w = gw;
    const row = mw * 2 + 8 + sp + gw;
    this.settingsX = { offline: view.w / 2 - row / 2, live: view.w / 2 - (mw * 2 + 8) / 2 };
    Object.assign(this.ghostButton, { x: this.settingsX.offline + row - gw, y: OFFLINE_SETTINGS_Y });
    this.placeModes();

    // The track along the bottom: your lineup on the buttons screen, a runner under a list.
    this.trackTop = this.list ? this.settingsY + 44 + 14 : 286;
    this.trackBottom = bottom - 6;
    // The warning line (and Fill your lineup): over the track, or on vs Computer (its track is short) a card over the cards.
    this.warnY = this.list === 'offline' ? POPUP_Y : this.trackTop + 28;
    Object.assign(this.fillBtn, { x: view.w / 2 - this.fillBtn.w / 2, y: this.list === 'offline' ? POPUP_Y + 26 : Math.min(this.trackTop + 58, this.trackBottom - this.fillBtn.h - 6) });
    this.view = view;
    this.bottom = bottom;
  }

  /** The Solo / Team toggle sits in a different place in each list. */
  placeModes() {
    const x = this.settingsX?.[this.list ?? 'offline'] ?? 0;
    this.modeButtons.forEach((b, i) => Object.assign(b, { x: x + i * (b.w + 8), y: this.settingsY }));
  }

  /** Top of the open list's settings row. */
  get settingsY() {
    return this.list === 'live' ? SETTINGS_Y : this.list === 'special' ? SPECIAL_SETTINGS_Y : OFFLINE_SETTINGS_Y;
  }

  get tiles() {
    return this.sections.flatMap((sec) => sec.tiles);
  }

  get allButtons() {
    const fill = this.warnT > 0 && this.warnFill ? [this.fillBtn] : [];
    if (this.list === 'offline') return [...fill, this.backBtn, ...this.tiles, ...this.modeButtons, this.ghostButton];
    if (this.list === 'live') return [...fill, this.backBtn, ...this.liveButtons, ...this.modeButtons];
    if (this.list === 'special') return [this.backBtn, ...this.specialButtons, ...this.rivalButtons];
    return [this.fsButton, this.tuneButton, this.onlineButton, this.profileButton, this.offlineBig, this.liveBig, this.specialBig].filter(Boolean);
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
    for (const b of [this.fsButton, this.tuneButton, this.onlineButton, this.profileButton, this.offlineBig, this.liveBig, this.specialBig]) b?.draw(ctx);

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
    if (this.list === 'special') return this.renderSpecial(ctx, view);
    const offline = this.list === 'offline';
    this.backBtn.draw(ctx);
    text(ctx, offline ? 'VS COMPUTER' : 'LIVE', view.w / 2, 36, { size: 30, color: offline ? '#ffb400' : '#59cd90', shadow: true });
    if (!offline) {
      text(ctx, 'Race people right now: a waiting room first, then everyone goes together.', view.w / 2, 72, { size: 15, weight: 500, color: 'rgba(255,255,255,0.8)', maxWidth: view.w - 40 });
    }
    this.drawTrack(ctx, view, this.trackTop, this.trackBottom - this.trackTop, true);
    if (offline) this.renderSections(ctx);
    else this.liveButtons.forEach((b) => b.draw(ctx));
    if (this.warnT > 0) {
      // Clash Royale style: say what's missing, right over the track.
      ctx.save();
      ctx.globalAlpha *= Math.min(1, this.warnT * 2);
      const pw = Math.min(view.w - 40, 640);
      if (offline) {
        roundRect(ctx, view.w / 2 - pw / 2, this.warnY - 32, pw, this.warnFill ? 108 : this.warnDetail ? 92 : 64, 16);
        ctx.fillStyle = 'rgba(10,18,36,0.94)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      text(ctx, this.warnMsg, view.w / 2, this.warnY, { size: 22, weight: 800, color: '#fff', shadow: true, maxWidth: pw - 32 });
      if (this.warnDetail) text(ctx, this.warnDetail, view.w / 2, this.warnY + 32, { size: 16, weight: 600, color: 'rgba(255,255,255,0.85)', maxWidth: pw - 32 });
      if (this.warnFill) this.fillBtn.draw(ctx);
      ctx.restore();
    }
    const ly = this.settingsY - 14;
    const label = (s, a, b) => text(ctx, s, (a.x + b.x + b.w) / 2, ly, { size: 13, weight: 700, color: DIM });
    const [m0, m1] = this.modeButtons;
    label('TOURNAMENT', m0, m1);
    this.modeButtons.forEach((b) => b.draw(ctx));
    if (!offline) return;
    label('TRAINING GHOST', this.ghostButton, this.ghostButton);
    this.ghostButton.draw(ctx);
  }

  /** Special Events: the cards, and who you race in them. */
  renderSpecial(ctx, view) {
    this.backBtn.draw(ctx);
    text(ctx, 'SPECIAL EVENTS', view.w / 2, 36, { size: 30, color: '#ff8cc6', shadow: true });
    text(ctx, 'One-offs against the computer. Nothing to tick off, just your best.', view.w / 2, 72, { size: 15, weight: 500, color: 'rgba(255,255,255,0.8)', maxWidth: view.w - 40 });
    this.drawTrack(ctx, view, this.trackTop, this.trackBottom - this.trackTop, true);
    this.specialButtons.forEach((b) => b.draw(ctx));
    const [a, p] = this.rivalButtons;
    text(ctx, 'RIVALS', (a.x + p.x + p.w) / 2, this.settingsY - 14, { size: 13, weight: 700, color: DIM });
    this.rivalButtons.forEach((b) => b.draw(ctx));
  }

  /** vs Computer: each section's name and progress, then its cards. */
  renderSections(ctx) {
    for (const sec of this.sections) {
      const cy = sec.y + TILE_H / 2;
      const complete = sec.level && sec.done === sec.tiles.length;
      text(ctx, sec.title, sec.labelX, cy - 10, { size: 20, weight: 900, color: sec.locked ? DIM : sec.label, shadow: true, maxWidth: 116 });
      const sub = !sec.level ? 'Just you' : sec.locked ? `🔒 Beat ${titleCase(sec.after)}` : complete ? '★ Complete' : `${sec.done} / ${sec.tiles.length} beaten`;
      text(ctx, sub, sec.labelX, cy + 14, { size: 13, weight: 700, color: complete ? '#ffd35c' : DIM, maxWidth: 116 });
      sec.tiles.forEach((t) => t.draw(ctx));
    }
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

/** "AMATEUR" -> "Amateur". */
function titleCase(s) {
  return s[0].toUpperCase() + s.slice(1).toLowerCase();
}

/** "100m", "100m and Hurdles", "100m, Hurdles and the tournament": cards by name. */
function listOf(tiles) {
  const names = tiles.map((t) => (t.id === 'tournament' ? 'the tournament' : t.name));
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** "Juno", or "Juno, Okoro and Chan": everyone in your lineup, once each. */
function starring(lineup) {
  const names = [...new Set(lineup.map(({ c }) => c.name))];
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

const TOUR_COLOR = { offline: '#c98a00', live: '#1f8a58' };
const LIST_Y = 100; // top of the Live list's first row of buttons
const SETTINGS_Y = 270; // the Live list's settings row
const SPECIAL_Y = 104; // top of the Special Events cards
const SPECIAL_SETTINGS_Y = 238; // the Special Events RIVALS row
const gapFor = (n) => (n - 1) * 16; // between the Special Events cards
// vs Computer: the sections (level null: Training), top to bottom.
const SECTIONS = [
  { level: 'amateur', title: 'AMATEUR', color: '#e4352a', label: '#ff7a5c' },
  { level: 'pro', title: 'PRO', color: '#7b2fbf', label: '#c08cff', after: 'amateur' }, // locked until all of Amateur is beaten
  { level: null, title: 'TRAINING', color: '#2d6fa8', label: '#7cc4ff' },
];
const SECTION_Y = 66; // top of the first row of cards
const TILE_H = 82;
const TILE_GAP = 8;
const OFFLINE_SETTINGS_Y = SECTION_Y + 3 * (TILE_H + 12) + 16; // the vs Computer settings row
const POPUP_Y = SECTION_Y + 1.5 * (TILE_H + 12) - 22; // vs Computer: the warning card's line

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
