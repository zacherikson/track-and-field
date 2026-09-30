import { CONFIG } from '../config.js';
import { Button, text } from '../core/ui.js';
import { drawFigure, runPose } from '../athletes/stickFigure.js';
import { EVENTS, TOURNAMENT_BOARDS, formatMark } from '../events/registry.js';
import { getBest, getDifficulty, setDifficulty, getGhostOn, setGhostOn, getPlayerName, getTourMode, setTourMode } from '../core/storage.js';
import { lineupAthlete, heightOf } from '../athletes/roster.js';
import { TOUR_KINDS } from '../tournament/tournament.js';
import { flow } from '../flow.js';
import { chooseGhost } from '../online/ghost.js';
import { syncBests } from '../online/bests.js';

export class MenuScene {
  enter() {
    chooseGhost(null); // back at the menu: events race your own best again
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
    // Your lineup: who does each event (and your solo athlete).
    this.lineup = EVENTS.map((ev) => lineupAthlete(ev.id));
    this.me = this.lineup[0]; // the menu's demo runner: your 100m runner
    this.athleteButton = new Button({ label: '', w: 180, h: 44, color: 'rgba(255,255,255,0.15)', onTap: () => flow.lineup(this.game) });
    this.tuneButton = new Button({ label: '⚙ Tuning', w: 132, h: 44, color: 'rgba(255,255,255,0.15)', onTap: () => flow.tuning(this.game) });
    this.onlineButton = new Button({ label: '🌐 Leaderboard', w: 196, h: 44, color: 'rgba(255,255,255,0.15)', onTap: () => flow.leaderboard(this.game) });
    // Your profile (username for the online leaderboard), top right.
    this.profileButton = new Button({ label: `👤 ${getPlayerName()}`, w: 190, h: 44, color: 'rgba(255,255,255,0.15)', onTap: () => flow.profile(this.game) });
    this.fsButton = document.fullscreenEnabled
      ? new Button({ label: '⛶', w: 48, h: 44, color: 'rgba(255,255,255,0.15)', onTap: () => toggleFullscreen() })
      : null;
    this.layout(this.game.view);
    // Your bests come from the online boards: catch up with them, then show them.
    syncBests()
      .then((changed) => changed && this.game.scene === this && this.showBests())
      .catch(() => {});
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

  onResize(view) {
    this.layout(view);
  }

  layout(view) {
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
    // Bottom row: LINEUP, TOURNAMENT, RIVALS, GHOST.
    // Narrower on a narrow (4:3) screen.
    const k = Math.min(1, (view.w - 32) / (180 + 90 * 2 + 130 * 2 + 110 + 8 * 2 + 32 * 3));
    const [aw, mw, lw, gw, sp] = [180, 90, 130, 110, 32].map((w) => Math.floor(w * k));
    this.athleteButton.w = aw;
    this.modeButtons.forEach((b) => (b.w = mw));
    this.levelButtons.forEach((b) => (b.w = lw));
    this.ghostButton.w = gw;
    const row = aw + sp + mw * 2 + 8 + sp + lw * 2 + 8 + sp + gw;
    const x0 = view.w / 2 - row / 2;
    this.athleteButton.x = x0;
    this.athleteButton.y = SETTINGS_Y;
    this.modeButtons.forEach((b, i) => {
      b.x = x0 + aw + sp + i * (mw + 8);
      b.y = SETTINGS_Y;
    });
    const lx = x0 + aw + sp + mw * 2 + 8 + sp;
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
  }

  update(dt, t) {
    for (const ev of this.game.input.consume(t + dt)) {
      if (ev.type !== 'down') continue;
      if (this.fsButton?.tap(ev.x, ev.y)) continue;
      if (this.tuneButton.tap(ev.x, ev.y)) continue;
      if (this.onlineButton.tap(ev.x, ev.y)) return;
      if (this.liveButtons.some((b) => b.tap(ev.x, ev.y))) return;
      if (this.profileButton.tap(ev.x, ev.y)) return;
      if (this.levelButtons.some((b) => b.tap(ev.x, ev.y))) continue;
      if (this.modeButtons.some((b) => b.tap(ev.x, ev.y))) continue;
      if (this.ghostButton.tap(ev.x, ev.y)) continue;
      if (this.athleteButton.tap(ev.x, ev.y)) return;
      if (this.tourButton.tap(ev.x, ev.y)) return;
      for (const b of this.buttons) if (b.tap(ev.x, ev.y)) break;
    }
    this.buttons.forEach((b) => b.update(dt));
    this.tourButton.update(dt);
    this.fsButton?.update(dt);
    this.profileButton.update(dt);
    this.tuneButton.update(dt);
    this.onlineButton.update(dt);
    this.liveButtons.forEach((b) => b.update(dt));
    this.levelButtons.forEach((b) => b.update(dt));
    this.modeButtons.forEach((b) => b.update(dt));
    this.ghostButton.update(dt);
    this.athleteButton.update(dt);

    // Demo runner loops across the bottom of the screen.
    const speed = 9;
    this.demoX += speed * dt;
    this.phase += ((speed * dt) / (CONFIG.runner.strideBase + CONFIG.runner.stridePerMps * speed)) * Math.PI * 2;
  }

  render(ctx, view) {
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, '#0d1830');
    g.addColorStop(1, '#1d3a66');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);

    text(ctx, 'TRACK ROYALE', view.w / 2, 90, { size: 52, color: '#ffb400', shadow: true });
    text(ctx, `Five events. Two thumbs. Starring ${starring(this.lineup)}.`, view.w / 2, 131, { size: 16, weight: 500, color: 'rgba(255,255,255,0.8)', maxWidth: view.w - 40 });
    const label = (s, y) => text(ctx, s, this.tourButton.x, y, { size: 13, weight: 700, align: 'left', color: 'rgba(255,255,255,0.6)' });
    label('OFFLINE · VS THE COMPUTER', ROW_Y[0] - 11);
    label('ONLINE · LIVE VS PEOPLE', ROW_Y[1] - 11);
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
    const ab = this.athleteButton;
    text(ctx, 'LINEUP', ab.x + ab.w / 2, ly, { size: 13, weight: 700, color: 'rgba(255,255,255,0.6)' });
    ab.draw(ctx);
    // A kit color chip per event, then the label.
    const inset = ab.pressT > 0 ? 3 : 0;
    this.lineup.forEach((c, i) => {
      ctx.fillStyle = c.colors.shirt;
      ctx.beginPath();
      ctx.arc(ab.x + inset + 20 + i * 12, ab.y + ab.h / 2, 5, 0, Math.PI * 2);
      ctx.fill();
    });
    text(ctx, 'Lineup  ›', ab.x + inset + 82, ab.y + ab.h / 2, { size: 20, align: 'left', maxWidth: ab.w - 90 });

    // Track strip + demo runner.
    const trackY = 470;
    ctx.fillStyle = '#b8452c';
    ctx.fillRect(0, trackY - 40, view.w, 70);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(0, trackY - 40, view.w, 2);
    ctx.fillRect(0, trackY + 28, view.w, 2);
    const ppm = 38; // the menu's little demo runner keeps its own small scale
    const span = view.w + 120;
    const sx = ((this.demoX * ppm) % span) - 60;
    drawFigure(ctx, sx, trackY + 10, CONFIG.figure.height * ppm * heightOf(this.me.colors), runPose(this.phase, 1), this.me.colors);
  }
}

/** "Juno", or "Juno, Okoro and Chan": everyone in your lineup, once each. */
function starring(lineup) {
  const names = [...new Set(lineup.map((c) => c.name))];
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

const ROW_Y = [168, 256]; // tops of the OFFLINE and ONLINE rows
const SETTINGS_Y = 350; // the lineup / tournament / rivals / ghost row

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
