// Top-level scene transitions in one place:
// menu -> event intro -> event (countdown/play inside) -> result -> retry | menu
// tournament: intro -> event -> standings -> next intro ... -> champion
import { MenuScene } from './scenes/menuScene.js';
import { IntroScene } from './scenes/introScene.js';
import { ResultScene } from './scenes/resultScene.js';
import { LeaderboardScene } from './scenes/leaderboardScene.js';
import { ProfileScene } from './scenes/profileScene.js';
import { CharacterScene } from './scenes/characterScene.js';
import { StandingsScene } from './tournament/standingsScene.js';
import { tournament } from './tournament/tournament.js';
import { openTuning } from './tuning/panel.js';
import { roundMark } from './events/registry.js';

export const flow = {
  menu: (game) => {
    tournament.end(); // leaving to the menu ends a tournament in progress
    game.setScene(new MenuScene());
  },
  // Tournament: the five events in a row, decathlon points, a champion at the end.
  tournament: (game) => {
    tournament.start();
    game.setScene(new IntroScene(tournament.event));
  },
  characters: (game) => game.setScene(new CharacterScene()),
  intro: (game, ev) => game.setScene(new IntroScene(ev)),
  play: (game, ev) => game.setScene(ev.create()),
  results: (game, ev, results, stats) => {
    // Marks count as they're shown: to the hundredth (registry.js roundMark).
    results = results.map((r) => (r.mark == null ? r : { ...r, mark: roundMark(ev, r.mark) }));
    if (stats?.run) stats = { ...stats, run: { ...stats.run, mark: roundMark(ev, stats.run.mark) } };
    game.setScene(
      tournament.active
        ? new StandingsScene(ev, results.filter((r) => !r.ghost), stats) // a ghost is never scored
        : new ResultScene(ev, results, stats),
    );
  },
  leaderboard: (game, board) => {
    tournament.end(); // a Race from the board is a normal race
    game.setScene(new LeaderboardScene(board));
  },
  profile: (game) => game.setScene(new ProfileScene()),
  // Tuning panel overlay; the canvas scene underneath stays as it was.
  tuning: (game) => openTuning(() => game.input.clear()),
};
