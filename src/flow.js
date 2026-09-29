// Top-level scene transitions in one place:
// menu -> event intro -> event (countdown/play inside) -> result -> retry | menu
import { MenuScene } from './scenes/menuScene.js';
import { IntroScene } from './scenes/introScene.js';
import { ResultScene } from './scenes/resultScene.js';
import { LeaderboardScene } from './scenes/leaderboardScene.js';
import { openTuning } from './tuning/panel.js';

export const flow = {
  menu: (game) => game.setScene(new MenuScene()),
  intro: (game, ev) => game.setScene(new IntroScene(ev)),
  play: (game, ev) => game.setScene(ev.create()),
  results: (game, ev, results, stats) => game.setScene(new ResultScene(ev, results, stats)),
  leaderboard: (game, ev) => game.setScene(new LeaderboardScene(ev)),
  // Tuning panel overlay; the canvas scene underneath stays as it was.
  tuning: (game) => openTuning(() => game.input.clear()),
};
