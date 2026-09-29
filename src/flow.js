// Top-level scene transitions in one place:
// menu -> event intro -> event (countdown/play inside) -> result -> retry | menu
// tournament: intro -> event -> standings -> next intro ... -> champion
// live: waiting room -> event (or a tournament's events) with the others in it
import { MenuScene } from './scenes/menuScene.js';
import { IntroScene } from './scenes/introScene.js';
import { ResultScene } from './scenes/resultScene.js';
import { LeaderboardScene } from './scenes/leaderboardScene.js';
import { ProfileScene } from './scenes/profileScene.js';
import { LobbyScene } from './scenes/lobbyScene.js';
import { CharacterScene } from './scenes/characterScene.js';
import { StandingsScene } from './tournament/standingsScene.js';
import { tournament } from './tournament/tournament.js';
import { openTuning } from './tuning/panel.js';
import { roundMark, EVENTS } from './events/registry.js';
import { ORDER } from './tournament/tournament.js';
import { startLive, endLive, currentLive } from './online/live.js';

export const flow = {
  menu: (game) => {
    endLive(); // and leaves a live room
    tournament.end(); // leaving to the menu ends a tournament in progress
    game.setScene(new MenuScene());
  },
  // Tournament: the five events in a row, decathlon points, a champion at the end.
  tournament: (game) => {
    endLive();
    tournament.start();
    game.setScene(new IntroScene(tournament.event));
  },
  characters: (game) => game.setScene(new CharacterScene()),
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
    game.setScene(
      tournament.active
        ? new StandingsScene(ev, results.filter((r) => !r.ghost), stats) // a ghost is never scored
        : new ResultScene(ev, results, stats),
    );
  },
  leaderboard: (game, board) => {
    endLive();
    tournament.end(); // a Race from the board is a normal race
    game.setScene(new LeaderboardScene(board));
  },
  profile: (game) => game.setScene(new ProfileScene()),
  // Live: the waiting room for an event or the tournament (`kind`), then play with everyone in it (online/live.js).
  live: (game, kind) => {
    endLive();
    tournament.end();
    game.setScene(new LobbyScene(kind));
  },
  // The waiting room has closed: `info` = { kind, room, uid, name, players, startAt, setLen }.
  liveStart: (game, info) => {
    const first = info.kind === 'tournament' ? ORDER[0] : info.kind;
    const session = startLive(info, first);
    if (info.kind === 'tournament') tournament.start(session);
    const scene = EVENTS.find((e) => e.id === first).create();
    scene.live = session;
    game.setScene(scene);
  },
  // Tuning panel overlay; the canvas scene underneath stays as it was.
  tuning: (game) => openTuning(() => game.input.clear()),
};
