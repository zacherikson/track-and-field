// Top-level scene transitions in one place:
// menu -> event intro -> event (countdown/play inside) -> result -> retry | menu
import { MenuScene } from './scenes/menuScene.js';
import { IntroScene } from './scenes/introScene.js';
import { ResultScene } from './scenes/resultScene.js';

export const flow = {
  menu: (game) => game.setScene(new MenuScene()),
  intro: (game, ev) => game.setScene(new IntroScene(ev)),
  play: (game, ev) => game.setScene(ev.create()),
  results: (game, ev, results) => game.setScene(new ResultScene(ev, results)),
};
