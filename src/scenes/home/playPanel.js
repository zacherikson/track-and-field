import { CONFIG } from '../../config.js';
import { Button, text } from '../../core/ui.js';
import { drawFigure, runPose } from '../../athletes/stickFigure.js';
import { EVENTS, TOURNAMENT_BOARDS, formatMark } from '../../events/registry.js';
import { getBest, getDifficulty, setDifficulty, getGhostOn, setGhostOn, getPlayerName, getTourMode, setTourMode } from '../../core/storage.js';
import { lineupAthlete, heightOf } from '../../athletes/roster.js';
import { TOUR_KINDS } from '../../tournament/tournament.js';
import { flow } from '../../flow.js';
import { syncBests } from '../../online/bests.js';

/**
 * The home screen's middle tab: where you play. The events offline (against
 * the computer) and online (live against people), the tournament, and the
 * settings for them; Tuning, Leaderboard and Profile along the top.
 */
export class PlayPanel {
  constructor(home) {
    this.home = home;
    this.game = home.game;
  }

  enter() {
    this.demoX = 0;
    this.phase = 0;
    // Tournament: all five events in a row, decathlon scoring; solo or team (the TOURNAMENT toggle).
    this.mode = getTourMode();
    this.tourButton = new Button({ label: '🏆 Tournament', color: '#c98a00', onTap: () => flow.tournament(this.game, this.mode) });
    this.buttons = EVENTS.map(
      (ev) =>
        new Button({
          label: ev.name,
          sub: ev.available ? `Best ${formatMark(ev, getBest(ev.id))}` : 'Coming soon',
          enabled: ev.available,
          onTap: () => flow.intro(this.game, ev),
        }),
    );
    // Online: the same, live against other people (a waiting room first, online/live.js).
    this.liveButtons = [
      new Button({ label: '🏆 Tournament', color: '#1f8a58', onTap: () => flow.live(this.game, TOUR_KINDS[this.mode]) }),
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
    // Rival difficulty: a two-way toggle, remembered on this device.
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
    this.styleLevels();
    this.styleModes();
    // Your ghost: race your best attempt in every event (remembered on this device).
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
    this.tuneButton = new Button({ label: '⚙ Tuning', w: 132, h: 44, color: 'rgba(255,255,255,0.15)', onTap: () => flow.tuning(this.game) });
    this.onlineButton = new Button({ label: '🌐 Leaderboard', w: 196, h: 44, color: 'rgba(255,255,255,0.15)', onTap: () => flow.leaderboard(this.game) });
    // Your profile (username for the online leaderboard), top right.
    this.profileButton = new Button({ label: `👤 ${getPlayerName()}`, w: 190, h: 44, color: 'rgba(255,255,255,0.15)', onTap: () => flow.profile(this.game) });
    this.fsButton = document.fullscreenEnabled
      ? new Button({ label: '⛶', w: 48, h: 44, color: 'rgba(255,255,255,0.15)', onTap: () => toggleFullscreen() })
      : null;
    // Your bests come from the online boards: catch up with them, then show them.
    syncBests()
      .then((changed) => changed && this.game.scene === this.home && this.showBests())
      .catch(() => {});
  }

  /** Coming to this tab: your lineup may have changed on the Lineup tab. */
  onShow() {
    this.lineup = EVENTS.map((ev) => lineupAthlete(ev.id));
    this.me = this.lineup[0]; // the demo runner: your 100m runner
  }

  /** The Best lines under the buttons, from your saved bests. */
  showBests() {
    this.styleModes();
    EVENTS.forEach((ev, i) => {
      if (ev.available) this.buttons[i].sub = `Best ${formatMark(ev, getBest(ev.id))}`;
    });
  }

  styleLevels() {
    for (const b of this.levelButtons) {
      const on = (b.label === 'Pro') === (this.level === 'pro');
      b.color = on ? '#e4572e' : 'rgba(255,255,255,0.15)';
    }
  }

  styleModes() {
    for (const b of this.modeButtons) b.color = (b.label === 'Team') === (this.mode === 'team') ? '#e4572e' : 'rgba(255,255,255,0.15)';
    const name = this.mode === 'team' ? 'Team' : 'Solo';
    const best = getBest(TOURNAMENT_BOARDS[this.mode].id);
    this.tourButton.sub = best == null ? `${name} · all 5` : `${name} · Best ${best}`;
    this.liveButtons[0].sub = `Live · ${name}`;
  }

  styleGhost() {
    const on = getGhostOn();
    this.ghostButton.label = on ? 'On' : 'Off';
    this.ghostButton.color = on ? '#e4572e' : 'rgba(255,255,255,0.15)';
  }

  /** `bottom`: the top of the tab bar. */
  layout(view, bottom) {
    // Two rows of events: OFFLINE (against the computer) and ONLINE (live against people).
    const rows = [[this.tourButton, ...this.buttons], this.liveButtons];
    const n = rows[0].length;
    const margin = 24 + Math.max(view.safe.l, view.safe.r);
    const gap = 12;
    const w = Math.min(180, (view.w - margin * 2 - gap * (n - 1)) / n);
    const total = w * n + gap * (n - 1);
    rows.forEach((row, r) =>
      row.forEach((b, i) => {
        b.w = w;
        b.h = 60;
        b.x = (view.w - total) / 2 + i * (w + gap);
        b.y = ROW_Y[r];
      }),
    );
    // Settings row: TOURNAMENT, RIVALS, GHOST. Narrower on a narrow (4:3) screen.
    const k = Math.min(1, (view.w - 32) / (90 * 2 + 130 * 2 + 110 + 8 * 2 + 32 * 2));
    const [mw, lw, gw, sp] = [90, 130, 110, 32].map((w) => Math.floor(w * k));
    this.modeButtons.forEach((b) => (b.w = mw));
    this.levelButtons.forEach((b) => (b.w = lw));
    this.ghostButton.w = gw;
    const row = mw * 2 + 8 + sp + lw * 2 + 8 + sp + gw;
    const x0 = view.w / 2 - row / 2;
    this.modeButtons.forEach((b, i) => {
      b.x = x0 + i * (mw + 8);
      b.y = SETTINGS_Y;
    });
    const lx = x0 + mw * 2 + 8 + sp;
    this.levelButtons.forEach((b, i) => {
      b.x = lx + i * (lw + 8);
      b.y = SETTINGS_Y;
    });
    this.ghostButton.x = x0 + row - gw;
    this.ghostButton.y = SETTINGS_Y;
    this.tuneButton.x = 14 + view.safe.l;
    this.tuneButton.y = 14 + view.safe.t;
    this.onlineButton.x = this.tuneButton.x + this.tuneButton.w + 10;
    this.onlineButton.y = this.tuneButton.y;
    if (this.fsButton) {
      this.fsButton.x = view.w - 48 - 14 - view.safe.r;
      this.fsButton.y = 14 + view.safe.t;
    }
    this.profileButton.x = (this.fsButton ? this.fsButton.x - 10 : view.w - 14 - view.safe.r) - this.profileButton.w;
    this.profileButton.y = 14 + view.safe.t;
    // The demo runner's strip of track, between the settings and the tab bar.
    this.trackTop = SETTINGS_Y + 44 + 16;
    this.trackBottom = bottom - 6;
  }

  get allButtons() {
    return [this.fsButton, this.tuneButton, this.onlineButton, this.profileButton, ...this.liveButtons, ...this.levelButtons, ...this.modeButtons, this.ghostButton, this.tourButton, ...this.buttons].filter(Boolean);
  }

  /** `events`: this tab's taps (the home screen has sorted out swipes). */
  update(dt, events) {
    for (const ev of events) {
      if (ev.type !== 'down') continue;
      if (this.allButtons.some((b) => b.tap(ev.x, ev.y)) && this.game.scene !== this.home) return; // off to another screen
    }
    this.allButtons.forEach((b) => b.update(dt));

    // Demo runner loops along the strip of track.
    const speed = 9;
    this.demoX += speed * dt;
    this.phase += ((speed * dt) / (CONFIG.runner.strideBase + CONFIG.runner.stridePerMps * speed)) * Math.PI * 2;
  }

  render(ctx, view) {
    text(ctx, 'TRACK ROYALE', view.w / 2, 84, { size: 44, color: '#ffb400', shadow: true });
    text(ctx, `Five events. Two thumbs. Starring ${starring(this.lineup)}.`, view.w / 2, 118, { size: 15, weight: 500, color: 'rgba(255,255,255,0.8)', maxWidth: view.w - 40 });
    const label = (s, y) => text(ctx, s, this.tourButton.x, y, { size: 13, weight: 700, align: 'left', color: 'rgba(255,255,255,0.6)' });
    label('OFFLINE · VS THE COMPUTER', ROW_Y[0] - 11);
    label('ONLINE · LIVE VS PEOPLE', ROW_Y[1] - 11);

    // Strip of track + demo runner, behind the buttons.
    const top = this.trackTop;
    const h = this.trackBottom - top;
    if (h >= 30) {
      ctx.fillStyle = '#b8452c';
      ctx.fillRect(0, top, view.w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(0, top, view.w, 2);
      ctx.fillRect(0, top + h - 2, view.w, 2);
      const ppm = 30; // the demo runner keeps its own small scale
      const span = view.w + 120;
      const sx = ((this.demoX * ppm) % span) - 60;
      drawFigure(ctx, sx, top + h - 10, CONFIG.figure.height * ppm * heightOf(this.me.colors), runPose(this.phase, 1), this.me.colors);
    }

    this.tourButton.draw(ctx);
    this.buttons.forEach((b) => b.draw(ctx));
    this.liveButtons.forEach((b) => b.draw(ctx));
    this.fsButton?.draw(ctx);
    this.profileButton.draw(ctx);
    this.tuneButton.draw(ctx);
    this.onlineButton.draw(ctx);
    const lb = this.levelButtons;
    const ly = SETTINGS_Y - 14;
    text(ctx, 'RIVALS', (lb[0].x + lb[1].x + lb[1].w) / 2, ly, { size: 13, weight: 700, color: 'rgba(255,255,255,0.6)' });
    lb.forEach((b) => b.draw(ctx));
    const mb = this.modeButtons;
    text(ctx, 'TOURNAMENT', (mb[0].x + mb[1].x + mb[1].w) / 2, ly, { size: 13, weight: 700, color: 'rgba(255,255,255,0.6)' });
    mb.forEach((b) => b.draw(ctx));
    const gb = this.ghostButton;
    text(ctx, 'GHOST', gb.x + gb.w / 2, ly, { size: 13, weight: 700, color: 'rgba(255,255,255,0.6)' });
    gb.draw(ctx);
  }
}

/** "Juno", or "Juno, Okoro and Chan": everyone in your lineup, once each. */
function starring(lineup) {
  const names = [...new Set(lineup.map((c) => c.name))];
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

const ROW_Y = [152, 234]; // tops of the OFFLINE and ONLINE rows
const SETTINGS_Y = 334; // the tournament / rivals / ghost row

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
