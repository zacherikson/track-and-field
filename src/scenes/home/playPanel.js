import { CONFIG } from '../../config.js';
import { Button, text, chamfer, slab, PAL, FONT_BODY, FONT_DISPLAY } from '../../core/ui.js';
import { drawIcon } from '../../core/icons.js';
import { pinebrook, westfield, olympic, track, bands, wordmark } from '../../render/posterScenery.js';
import { VENUES } from '../../render/venues.js';
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

// When the menu last fetched your progress from your account (see enter()).
let lastPull = -Infinity;
const PULL_EVERY = 60000; // ms

// The list you were on (null: the big buttons), kept for the session so
// Menu after a race comes back to it.
let lastList = null;

/**
 * The home screen's middle tab: where you play. Two big buttons, vs Computer
 * and Live, over your athlete warming up on the track; each opens its list.
 * Tuning (the owner only, storage.js canTune), Leaderboard, How to play and Profile along the top.
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
    this.offlineBig = new BigButton({ label: 'vs Computer', sub: 'Tournament + 5 events', icon: 'vscomputer', color: PAL.orange, lip: PAL.orangeShade, onTap: () => this.open('offline') });
    this.liveBig = new BigButton({ label: 'Live', sub: 'Race people right now', icon: 'live', color: PAL.liveGreen, lip: PAL.liveShade, onTap: () => this.open('live') });
    // Special Events: a card each, and who you race (remembered for the session).
    this.specialButtons = SPECIAL_EVENTS.map(
      (ev) =>
        new BigButton({
          label: ev.name,
          sub: `Best ${formatMark(ev, getBest(ev.id))}`,
          icon: ev.id,
          color: PAL.magenta,
          lip: PAL.magentaShade,
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
          w: level === 'pro' ? 88 : 100,
          h: 48,
          size: 19,
          onTap: () => {
            setSpecialLevel(level);
            this.styleRivals();
          },
        }),
    );
    this.styleRivals();
    this.warnT = 0; // a locked card tapped: why, over the track
    this.backBtn = new Button({ label: 'Back', icon: 'back', look: 'chip', w: 112, h: 46, onTap: () => this.back() });
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
              lip: sec.lip,
              enabled: ev.available,
              onTap: () => {
                if (this.refuse(sec, ev.id)) return;
                setCampaign(sec.level);
                flow.intro(this.game, ev);
              },
            }),
        ),
        // A campaign ends in its tournament (Training is the five events on their own).
        ...(sec.level ? [new EventTile({ id: 'tournament', name: 'Tournament', color: PAL.gold, lip: PAL.goldShade, onTap: () => this.campaignTournament(sec) })] : []),
      ];
      return sec;
    });
    this.training = this.sections.find((sec) => !sec.level);
    this.buttons = this.training.tiles;
    // vs Computer's grid: a big button for each section, and Special Events.
    this.gridButtons = [
      ...this.sections.map((sec) => Object.assign(new VenueCard({ label: sec.name, place: VENUES[sec.key].name, venue: sec.vignette, color: sec.color, lip: sec.lip, onTap: () => this.openSection(sec) }), { key: sec.key })),
      Object.assign(new VenueCard({ label: 'Special Events', sub: 'Relay · Time Trial', icon: 'special', venue: specialVignette, color: PAL.magenta, lip: PAL.magentaShade, onTap: () => this.open('special') }), { key: 'special' }),
    ];
    this.styleSections(takeFreshBeaten());
    // Live: the same six cards as a campaign's, against other people (a waiting room first, online/live.js).
    this.liveButtons = [
      ...EVENTS.map((ev) => new EventTile({ id: ev.id, name: SHORT[ev.id] ?? ev.name, color: PAL.liveGreen, lip: PAL.liveShade, enabled: ev.available, onTap: () => flow.live(this.game, ev.id) })),
      new EventTile({ id: 'tournament', name: 'Tournament', color: PAL.gold, lip: PAL.goldShade, onTap: () => flow.live(this.game, TOURNAMENT_KIND) }),
    ];
    // Your ghost (Training only): race your best attempt in every event (remembered on this device).
    this.ghostButton = new Button({
      label: '',
      w: 68,
      h: 46,
      onTap: () => {
        setGhostOn(!getGhostOn());
        this.styleGhost();
      },
    });
    this.styleGhost();
    this.onShow();
    // The top bar's chips: ink slabs with an icon.
    const chip = (o) => new Button({ look: 'chip', h: 46, ...o });
    this.tuneButton = canTune() ? chip({ label: 'Tuning', icon: 'tuning', w: 132, onTap: () => flow.tuning(this.game) }) : null;
    this.onlineButton = chip({ label: 'Leaderboard', icon: 'leaderboard', w: 176, onTap: () => flow.leaderboard(this.game) });
    this.helpButton = chip({ label: 'How to play', icon: 'howto', w: 172, onTap: () => flow.tutorial(this.game) });
    // Your profile (username for the online leaderboard), top right.
    this.profileButton = chip({ label: getPlayerName(), icon: 'profile', w: 200, onTap: () => flow.profile(this.game) });
    this.fsButton = document.fullscreenEnabled ? chip({ label: '', icon: 'fullscreen', w: 48, onTap: () => toggleFullscreen() }) : null;
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
      if (left.length) return { title: `${titleCase(sec.title)} is locked`, detail: `Beat the rest of ${titleCase(prev.title)} first: ${rest}.` };
    }
    if (sec.level && id === 'tournament') {
      const beaten = getBeaten(sec.level);
      const left = sec.tiles.filter((t) => t.id !== 'tournament' && !beaten[t.id]);
      if (left.length) return { title: 'Tournament locked', detail: `Beat ${listOf(left)} in ${titleCase(sec.title)} to unlock it.` };
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
    for (const b of this.rivalButtons) {
      const on = (b.label === 'Pro') === (level === 'pro');
      b.color = on ? PAL.cream : PAL.ink2; // a segmented control: the one picked is cream
      b.lip = on ? PAL.creamShade : PAL.inkShade;
    }
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
    this.offlineBig.sub = `Amateur ${done('amateur')}/6 · Pro ${pro.locked ? 'locked' : `${done('pro')}/6`} · Training · Special`;
    for (const b of this.gridButtons) {
      const sec = this.sections.find((x) => x.key === b.key);
      if (!sec) continue;
      const complete = sec.level && sec.done === sec.tiles.length;
      b.sub = !sec.level ? 'Just you (and your ghost)' : sec.locked ? `Beat ${titleCase(sec.after)} first` : complete ? '★ Complete' : `${sec.done} / ${sec.tiles.length} beaten`;
      b.locked = sec.locked;
    }
  }

  styleGhost() {
    const on = getGhostOn();
    this.ghostButton.label = on ? 'On' : 'Off';
    this.ghostButton.color = on ? PAL.gold : PAL.cream;
    this.ghostButton.lip = on ? PAL.goldShade : PAL.creamShade;
  }

  /** `bottom`: the top of the tab bar. */
  layout(view, bottom) {
    const margin = 24 + Math.max(view.safe.l, view.safe.r);
    const top = 12 + view.safe.t;

    // Top bar: Tuning, Leaderboard ... Profile, fullscreen (the buttons); Back (a list).
    if (this.tuneButton) this.tuneButton.x = 14 + view.safe.l;
    this.onlineButton.x = this.tuneButton ? this.tuneButton.x + this.tuneButton.w + 10 : 14 + view.safe.l;
    this.backBtn.x = 14 + view.safe.l;
    if (this.fsButton) this.fsButton.x = view.w - 48 - 14 - view.safe.r;
    this.profileButton.x = (this.fsButton ? this.fsButton.x - 10 : view.w - 14 - view.safe.r) - this.profileButton.w;
    // How to play, next to the Leaderboard: just ❓ where the words won't fit.
    const helpX = this.onlineButton.x + this.onlineButton.w + 8;
    const roomy = helpX + 172 + 10 <= this.profileButton.x;
    Object.assign(this.helpButton, { x: helpX, w: roomy ? 172 : 48, label: roomy ? 'How to play' : '' });
    for (const b of [this.tuneButton, this.onlineButton, this.helpButton, this.backBtn, this.fsButton, this.profileButton]) if (b) b.y = top;

    // The two big buttons, side by side.
    const bigs = [this.offlineBig, this.liveBig];
    const bigGap = 22;
    const bw = Math.min(372, (view.w - margin * 2 - bigGap) / 2);
    bigs.forEach((b, i) => Object.assign(b, { w: bw, h: 116, x: view.w / 2 - (bw * 2 + bigGap) / 2 + i * (bw + bigGap), y: 150 }));

    // vs Computer: its four venue cards, two by two.
    const gw = Math.min(380, (view.w - margin * 2 - GRID_GAP) / 2);
    this.gridButtons.forEach((b, i) => Object.assign(b, { w: gw, h: GRID_H, x: view.w / 2 - gw - GRID_GAP / 2 + (i % 2) * (gw + GRID_GAP), y: GRID_Y + Math.floor(i / 2) * (GRID_H + GRID_GAP) }));

    // Special Events: the cards in a row, the RIVALS toggle under them.
    const sw = Math.min(330, (view.w - margin * 2 - gapFor(this.specialButtons.length)) / this.specialButtons.length);
    const sx = view.w / 2 - (sw * this.specialButtons.length + gapFor(this.specialButtons.length)) / 2;
    this.specialButtons.forEach((b, i) => Object.assign(b, { w: sw, h: 112, x: sx + i * (sw + 18), y: SPECIAL_Y }));
    // RIVALS on an ink plate, the two choices side by side after it.
    Object.assign(this.rivalButtons[0], { x: view.w / 2 - 56, y: SPECIAL_SETTINGS_Y });
    Object.assign(this.rivalButtons[1], { x: view.w / 2 + 50, y: SPECIAL_SETTINGS_Y });

    // A vs Computer section's page, and Live: six cards in a row (each the same).
    const n = 6;
    const tw = Math.min(TILE_MAX, (view.w - margin * 2 - (n - 1) * TILE_GAP) / n);
    this.tileH = Math.round(tw);
    for (const row of [...this.sections.map((sec) => sec.tiles), this.liveButtons]) {
      const rx = (view.w - (row.length * tw + (row.length - 1) * TILE_GAP)) / 2; // Training's five, centred
      row.forEach((t, i) => Object.assign(t, { w: tw, h: this.tileH, x: rx + i * (tw + TILE_GAP), y: TILES_Y }));
    }
    // Its setting: GHOST (Training), a cream OFF / ON slab on an ink plate.
    Object.assign(this.ghostButton, { x: view.w / 2 + 22, y: Math.max(TILES_Y + this.tileH + 24, GHOST_Y) });

    // The track along the bottom: your athlete on the buttons screen, a runner under a list.
    const sec = this.section;
    this.trackTop = !this.list
      ? 300 // Pinebrook's track, under the big buttons
      : Math.max(LIST_TRACK, (this.list === 'training' ? this.ghostButton.y + 60 : TILES_Y + this.tileH + 22)); // the venue's track, under the cards
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
    return [this.fsButton, this.tuneButton, this.onlineButton, this.helpButton, this.profileButton, this.offlineBig, this.liveBig].filter(Boolean);
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
    // Each page stands in its venue, the track along the bottom (it stays put as the buttons fade in).
    this.drawBackdrop(ctx, view);
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
    wordmark(ctx, view.w / 2, 94, 58);
    for (const b of [this.fsButton, this.tuneButton, this.onlineButton, this.helpButton, this.profileButton, this.offlineBig, this.liveBig]) b?.draw(ctx);

    // Your athlete, warming up on the track, their name on an ink tag.
    const { me } = this;
    const x = view.w / 2;
    const ground = this.bottom - 40;
    ctx.fillStyle = 'rgba(38,34,79,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, ground + 2, 26, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    drawFigure(ctx, x, ground, Math.min(124, ground - this.trackTop - 10) * heightOf(me.colors), runPose(this.phase, 0.12), me.colors, ground);
    nameTag(ctx, me.name, x, ground + 18);
  }

  /**
   * The page's scenery, the track along the bottom: Pinebrook Park behind the
   * big buttons and Training, Westfield High behind Amateur, Olympic Stadium
   * behind Pro and Special Events (and at night behind Live); vs Computer's
   * grid on plain ink bands.
   */
  drawBackdrop(ctx, view) {
    const h = this.bottom;
    const trackH = h - this.trackTop;
    const list = this.list;
    if (!list) return pinebrook(ctx, 0, 0, view.w, h, { trackH, clouds: CLOUDS });
    if (list === 'offline') {
      bands(ctx, 0, 0, view.w, this.trackTop - 30, [PAL.ink, PAL.ink2]);
      return track(ctx, 0, this.trackTop, view.w, trackH, { face: PAL.brick });
    }
    if (list === 'amateur') return westfield(ctx, 0, 0, view.w, h, { trackH });
    if (list === 'training') return pinebrook(ctx, 0, 0, view.w, h, { trackH, clouds: TRAINING_CLOUDS });
    olympic(ctx, 0, 0, view.w, h, { trackH, night: list === 'live' });
  }

  renderList(ctx, view) {
    this.backBtn.draw(ctx);
    const sec = this.section;
    if (this.list === 'special') this.renderSpecial(ctx, view);
    else if (sec) this.renderSection(ctx, view, sec);
    else if (this.list === 'live') {
      titlePlate(ctx, view, 'LIVE', 'Race people right now: a waiting room first');
      this.liveButtons.forEach((b) => b.draw(ctx));
    } else {
      titlePlate(ctx, view, 'VS COMPUTER');
      this.gridButtons.forEach((b) => b.draw(ctx));
    }
    this.drawRunner(ctx, view);
    this.drawWarning(ctx, view);
  }

  /** Clash Royale style: say what's missing, on an ink card over the buttons, with a lock. */
  drawWarning(ctx, view) {
    if (this.warnT <= 0) return;
    ctx.save();
    ctx.globalAlpha *= Math.min(1, this.warnT * 2);
    const pw = Math.min(view.w - 40, 640);
    const ph = this.warnDetail ? 92 : 64;
    slab(ctx, view.w / 2 - pw / 2, this.warnY - 32, pw, ph + 6, { face: PAL.ink, lip: PAL.inkShade, lipH: 6, c: 8 });
    ctx.font = `900 26px ${FONT_DISPLAY}`;
    ctx.letterSpacing = '1px';
    const tw = Math.min(pw - 80, ctx.measureText(this.warnMsg.toUpperCase()).width);
    ctx.letterSpacing = '0px';
    drawIcon(ctx, 'lock', view.w / 2 - tw / 2 - 18, this.warnY, 26, PAL.gold);
    text(ctx, this.warnMsg.toUpperCase(), view.w / 2 + 16, this.warnY + 1, { size: 26, font: 'display', track: 1, color: PAL.cream, maxWidth: pw - 80 });
    if (this.warnDetail) text(ctx, this.warnDetail, view.w / 2, this.warnY + 32, { size: 17, font: 'body', weight: 600, color: 'rgba(245,234,208,0.85)', maxWidth: pw - 32 });
    ctx.restore();
  }

  /** Special Events: the cards, and who you race in them (RIVALS, on an ink plate). */
  renderSpecial(ctx, view) {
    titlePlate(ctx, view, 'SPECIAL EVENTS');
    this.specialButtons.forEach((b) => b.draw(ctx));
    const ry = this.settingsY;
    ctx.fillStyle = PAL.ink;
    chamfer(ctx, view.w / 2 - 150, ry - 8, 300, 66, 6);
    ctx.fill();
    text(ctx, 'RIVALS', view.w / 2 - 100, ry + 23, { size: 20, font: 'display', track: 2, color: PAL.cream });
    this.rivalButtons.forEach((b) => b.draw(ctx));
  }

  /** A vs Computer section's page: its name, venue and progress, its cards, and (Training) GHOST. */
  renderSection(ctx, view, sec) {
    const complete = sec.level && sec.done === sec.tiles.length;
    const status = !sec.level ? 'Just you: no rivals, nothing ticked off' : complete ? '★ Complete' : `${sec.done} / ${sec.tiles.length} beaten`;
    titlePlate(ctx, view, sec.title, `${VENUES[sec.key].name} · ${status}`);
    sec.tiles.forEach((t) => t.draw(ctx));
    if (sec.level) return;
    const g = this.ghostButton;
    ctx.fillStyle = PAL.ink;
    chamfer(ctx, g.x - 120, g.y - 6, 196, 58, 6);
    ctx.fill();
    text(ctx, 'TRAINING GHOST', g.x - 60, g.y + 21, { size: 18, font: 'display', track: 1, color: PAL.cream, maxWidth: 100 });
    g.draw(ctx);
  }

  /** Your athlete running along the page's track. */
  drawRunner(ctx, view) {
    const top = this.trackTop;
    const h = this.trackBottom - top;
    if (h < 30) return;
    const { me } = this;
    const ppm = 30; // the demo runner keeps its own small scale
    const span = view.w + 120;
    const sx = ((this.demoX * ppm) % span) - 60;
    const ground = top + h - 14;
    ctx.fillStyle = 'rgba(38,34,79,0.35)';
    ctx.beginPath();
    ctx.ellipse(sx, ground + 2, 18, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    drawFigure(ctx, sx, ground, Math.min(74, h - 24) * heightOf(me.colors), runPose(this.runPhase ?? 0, 1), me.colors, ground);
  }
}

/**
 * A page's title: display type on a skewed ink banner with a gold wedge
 * behind it, and an optional `sub` line on a cream pill under it.
 */
function titlePlate(ctx, view, title, sub = '', y = 34) {
  const cx = view.w / 2;
  ctx.font = `900 34px ${FONT_DISPLAY}`;
  ctx.letterSpacing = '2px';
  const w = ctx.measureText(title).width + 44;
  ctx.letterSpacing = '0px';
  ctx.fillStyle = PAL.gold;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 - 16, y - 18);
  ctx.lineTo(cx + w / 2 + 16, y - 18);
  ctx.lineTo(cx + w / 2 + 4, y + 18);
  ctx.lineTo(cx - w / 2 - 4, y + 18);
  ctx.fill();
  ctx.fillStyle = PAL.ink;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, y - 22);
  ctx.lineTo(cx + w / 2, y - 22);
  ctx.lineTo(cx + w / 2 - 8, y + 22);
  ctx.lineTo(cx - w / 2 - 8, y + 22);
  ctx.fill();
  text(ctx, title, cx - 4, y + 1, { size: 34, font: 'display', track: 2, color: PAL.cream });
  if (!sub) return;
  ctx.font = `700 16px ${FONT_BODY}`;
  const sw = Math.min(view.w - 40, ctx.measureText(sub).width + 24);
  ctx.fillStyle = PAL.cream;
  chamfer(ctx, cx - sw / 2, y + 26, sw, 24, 3);
  ctx.fill();
  text(ctx, sub, cx, y + 38.5, { size: 16, font: 'body', weight: 700, color: PAL.ink, maxWidth: sw - 16 });
}

/**
 * A vs Computer card: a slab with a vignette of its venue at the left
 * (`venue(ctx, x, y, w, h)`; an `icon` on a plate over it, for Special
 * Events), then its label, the venue's `place` name in gold and the `sub`
 * status line. `locked`: a lock badge in the corner (it still says why when tapped).
 */
class VenueCard extends Button {
  constructor(opts) {
    super(opts);
    this.place = opts.place ?? '';
    this.venue = opts.venue;
    this.locked = false;
  }

  draw(ctx) {
    const { face, lip, ink } = this.paint();
    const lipH = 6;
    const pressed = this.pressT > 0;
    const { x, w, h } = this;
    slab(ctx, x, this.y, w, h, { face, lip, lipH, c: 8, pressed });
    const y = this.y + (pressed ? lipH - 1 : 0);
    const fh = h - lipH;
    const vw = Math.min(150, Math.round(w * 0.4));
    ctx.save();
    chamfer(ctx, x, y, vw, fh, 8);
    ctx.clip();
    this.venue(ctx, x, y, vw, fh);
    ctx.restore();
    ctx.fillStyle = lip;
    ctx.fillRect(x + vw, y, 4, fh);
    if (this.icon) {
      ctx.fillStyle = lip;
      chamfer(ctx, x + vw / 2 - 34, y + fh / 2 - 34, 68, 68, 5);
      ctx.fill();
      drawIcon(ctx, this.icon, x + vw / 2, y + fh / 2, 46, ink);
    }
    const tx = x + vw + 20;
    const mw = x + w - 14 - tx - (this.locked ? 34 : 0);
    text(ctx, this.label.toUpperCase(), tx, y + fh * 0.32, { size: Math.min(40, Math.round(fh * 0.36)), font: 'display', align: 'left', track: 1, color: ink, maxWidth: mw });
    if (this.place) text(ctx, this.place.toUpperCase(), tx + 1, y + fh * 0.6, { size: 18, font: 'display', align: 'left', track: 1.5, color: PAL.gold, maxWidth: mw });
    text(ctx, this.sub, tx, y + fh * (this.place ? 0.82 : 0.68), { size: 17, font: 'body', weight: 700, align: 'left', color: 'rgba(245,234,208,0.9)', maxWidth: x + w - 14 - tx });
    if (this.locked) {
      ctx.fillStyle = PAL.ink;
      chamfer(ctx, x + w - 40, y + 8, 32, 32, 4);
      ctx.fill();
      drawIcon(ctx, 'lock', x + w - 24, y + 24, 22, PAL.cream);
    }
  }
}

/** Special Events' vignette: magenta stripes. */
function specialVignette(ctx, x, y, w, h) {
  ctx.fillStyle = PAL.magentaShade;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PAL.magenta;
  for (let i = -2; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * 30, y + h);
    ctx.lineTo(x + i * 30 + 14, y + h);
    ctx.lineTo(x + i * 30 + 64, y);
    ctx.lineTo(x + i * 30 + 50, y);
    ctx.fill();
  }
}

/**
 * One of the big buttons (here, and the Squad tab's Practice and Meet): a slab
 * with its icon on a darker plate at the left, the label in display type and
 * the sub line under it (wrapped onto two lines at a " · " if it won't fit).
 */
export class BigButton extends Button {
  draw(ctx) {
    const { face, lip, ink } = this.paint();
    const lipH = 6;
    const pressed = this.pressT > 0;
    const { x, w, h } = this;
    slab(ctx, x, this.y, w, h, { face, lip, lipH, c: 8, pressed });
    const y = this.y + (pressed ? lipH - 1 : 0);
    const fh = h - lipH;
    let tx = x + 18;
    if (this.icon) {
      const pw = Math.min(84, fh - 24);
      ctx.fillStyle = lip;
      chamfer(ctx, x + 12, y + (fh - pw) / 2, pw, pw, 5);
      ctx.fill();
      drawIcon(ctx, this.icon, x + 12 + pw / 2, y + fh / 2, pw * 0.62, ink);
      tx = x + pw + 28;
    }
    const mw = x + w - 12 - tx;
    ctx.font = `600 17px ${FONT_BODY}`;
    let lines = [];
    if (this.sub) {
      if (ctx.measureText(this.sub).width <= mw) lines = [this.sub];
      else {
        const parts = this.sub.split(' · ');
        const k = Math.ceil(parts.length / 2);
        lines = [parts.slice(0, k).join(' · '), parts.slice(k).join(' · ')].filter(Boolean);
      }
    }
    const two = lines.length > 1;
    const size = Math.min(40, Math.round(fh * 0.36));
    text(ctx, this.label.toUpperCase(), tx, y + fh * (two ? 0.34 : lines.length ? 0.4 : 0.52), { size, font: 'display', align: 'left', track: 1, color: ink, maxWidth: mw });
    const subInk = ink === PAL.cream ? 'rgba(245,234,208,0.85)' : ink;
    lines.forEach((l, i) => text(ctx, l, tx, y + fh * (two ? 0.66 : 0.74) + i * 20, { size: 17, font: 'body', weight: 600, align: 'left', color: subInk, maxWidth: mw }));
  }
}

/** Your athlete's name on an ink tag. */
function nameTag(ctx, name, x, y) {
  ctx.font = `900 20px ${FONT_DISPLAY}`;
  ctx.letterSpacing = '1px';
  const w = ctx.measureText(name.toUpperCase()).width + 22;
  ctx.letterSpacing = '0px';
  ctx.fillStyle = PAL.ink;
  chamfer(ctx, x - w / 2, y - 13, w, 26, 4);
  ctx.fill();
  text(ctx, name.toUpperCase(), x, y + 1, { size: 20, font: 'display', track: 1, color: PAL.cream });
}

/** Pinebrook's clouds behind the big buttons: [x, y, size] as shares of the backdrop. */
const CLOUDS = [
  [0.07, 0.36, 0.075],
  [0.9, 0.3, 0.085],
  [0.62, 0.075, 0.05],
];
const TRAINING_CLOUDS = [
  [0.07, 0.42, 0.07],
  [0.93, 0.4, 0.075],
];

/** "AMATEUR" -> "Amateur". */
function titleCase(s) {
  return s[0].toUpperCase() + s.slice(1).toLowerCase();
}

/** "100m", "100m and Hurdles", "100m, Hurdles and the tournament": cards by name. */
function listOf(tiles) {
  const names = tiles.map((t) => (t.id === 'tournament' ? 'the tournament' : t.name));
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

const SPECIAL_Y = 92; // top of the Special Events cards
const SPECIAL_SETTINGS_Y = 240; // the Special Events RIVALS row
const gapFor = (n) => (n - 1) * 18; // between the Special Events cards
// vs Computer: the sections (level null: Training), in grid order (Special Events comes after).
const SECTIONS = [
  { level: 'amateur', title: 'AMATEUR', name: 'Amateur', color: PAL.brick, lip: PAL.brickShade, vignette: (c, x, y, w, h) => westfield(c, x - 60, y - 10, w + 120, h + 30, { trackH: 22 }) },
  { level: 'pro', title: 'PRO', name: 'Pro', color: PAL.blue, lip: PAL.blueShade, after: 'amateur', vignette: (c, x, y, w, h) => olympic(c, x - 30, y - 6, w + 60, h + 12, { trackH: 16 }) }, // locked until all of Amateur is beaten
  { level: null, title: 'TRAINING', name: 'Training', color: PAL.deep, lip: PAL.deeper, vignette: (c, x, y, w, h) => pinebrook(c, x - 40, y, w + 80, h + 16, { trackH: 22, clouds: [[0.5, 0.18, 0.12]] }) },
];
const GRID_Y = 92; // top of vs Computer's grid
const GRID_H = 118;
const GRID_GAP = 18;
const TILES_Y = 96; // top of a section page's cards
const TILE_MAX = 132; // a card's width at most
const TILE_GAP = 12;
const GHOST_Y = 252; // Training's GHOST row
const LIST_TRACK = 330; // where a page's track starts

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
