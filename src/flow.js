// Top-level scene transitions in one place:
// home (Lineup | Play | Squad tabs) -> event intro -> event (countdown/play inside) -> result -> retry | menu
// tournament: intro -> event -> standings -> next intro ... -> champion
// live: waiting room -> event (or a tournament's events) with the others in it
import { HomeScene } from './scenes/homeScene.js';
import { IntroScene } from './scenes/introScene.js';
import { ResultScene } from './scenes/resultScene.js';
import { LeaderboardScene } from './scenes/leaderboardScene.js';
import { ProfileScene } from './scenes/profileScene.js';
import { LobbyScene } from './scenes/lobbyScene.js';
import { StandingsScene } from './tournament/standingsScene.js';
import { tournament } from './tournament/tournament.js';
import { openTuning } from './tuning/panel.js';
import { roundMark, EVENTS } from './events/registry.js';
import { ORDER, tourModeOf } from './tournament/tournament.js';
import { startLive, endLive, currentLive } from './online/live.js';
import { resetScars } from './brawl/wounds.js';
import { getCampaign, setCampaign, markBeaten } from './core/storage.js';

export const flow = {
  // The home screen, on its Play tab (or `tab`: homeScene.js TABS).
  menu: (game, tab = 'play') => {
    resetScars(); // the late hits' wounds heal
    endLive(); // and leaves a live room
    tournament.end(); // leaving to the menu ends a tournament in progress
    game.setScene(new HomeScene(tab));
  },
  // Tournament: the five events in a row, decathlon points, a champion at the end.
  // `mode`: 'solo' (one athlete) or 'team' (your lineup).
  tournament: (game, mode) => {
    resetScars();
    endLive();
    tournament.start(mode);
    game.setScene(new IntroScene(tournament.event));
  },
  intro: (game, ev) => game.setScene(new IntroScene(ev)),
  play: (game, ev) => {
    const scene = ev.create();
    if (tournament.live) scene.live = tournament.live; // a live tournament's next event
    else endLive(); // playing on your own after a live event
    game.setScene(scene);
  },
  results: (game, ev, results, stats) => {
    // Marks count as they're shown: to the hundredth (registry.js roundMark).
    results = results.map((r) => (r.mark == null ? r : { ...r, mark: roundMark(ev, r.mark) }));
    if (stats?.run) stats = { ...stats, run: { ...stats.run, mark: roundMark(ev, stats.run.mark) } };
    // A live event played to the end: going on from here isn't leaving early (a tournament's is at the end).
    if (stats?.live && !tournament.active && currentLive()) currentLive().done = true;
    // A campaign event won (first place, ghosts aside) is ticked off.
    const winner = results.find((r) => !r.ghost);
    if (getCampaign() && !stats?.live && winner?.isPlayer && winner.status === 'ok') markBeaten(getCampaign(), ev.id);
    // The event carries on under the results with its late hits (brawl/aftermath.js).
    const backdrop = game.scene?.lateRender ? game.scene : null;
    if (backdrop) backdrop.handedOver = true; // it stays open until the results scene leaves it
    game.setScene(
      tournament.active
        ? new StandingsScene(ev, results.filter((r) => !r.ghost), stats, backdrop) // a ghost is never scored
        : new ResultScene(ev, results, stats, backdrop),
    );
  },
  leaderboard: (game, board) => {
    setCampaign(null); // a Race from the board is training
    endLive();
    tournament.end(); // a Race from the board is a normal race
    game.setScene(new LeaderboardScene(board));
  },
  // Your profile; Back returns to the home screen's `tab`.
  profile: (game, tab = 'play') => game.setScene(new ProfileScene(null, tab)),
  // Live: the waiting room for an event or the tournament (`kind`), then play with everyone in it (online/live.js).
  live: (game, kind) => {
    setCampaign(null);
    endLive();
    tournament.end();
    game.setScene(new LobbyScene(kind));
  },
  // The waiting room has closed: `info` = { kind, room, uid, name, players, startAt, setLen }.
  liveStart: (game, info) => {
    resetScars();
    const mode = tourModeOf(info.kind);
    const first = mode ? ORDER[0] : info.kind;
    const session = startLive(info, first);
    if (mode) tournament.start(mode, session);
    const scene = EVENTS.find((e) => e.id === first).create();
    scene.live = session;
    game.setScene(scene);
  },
  // Tuning panel overlay; the canvas scene underneath stays as it was.
  tuning: (game) => openTuning(() => game.input.clear()),
};
