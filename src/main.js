import { Game } from './core/game.js';
import { MenuScene } from './scenes/menuScene.js';
import { loadOverrides } from './tuning/store.js';

// Apply any settings saved from the in-game tuning panel before the first race.
loadOverrides();

const game = new Game(document.getElementById('game'));
game.start(new MenuScene());

// Handy from the desktop devtools console.
window.game = game;
