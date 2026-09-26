import { Game } from './core/game.js';
import { MenuScene } from './scenes/menuScene.js';

const game = new Game(document.getElementById('game'));
game.start(new MenuScene());

// Handy from the desktop devtools console.
window.game = game;
