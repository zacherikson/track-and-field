import { Game } from './core/game.js';
import { MenuScene } from './scenes/menuScene.js';
import { ProfileScene } from './scenes/profileScene.js';
import { loadOverrides } from './tuning/store.js';
import { finishGoogleSignIn } from './online/firebase.js';

// Apply any settings saved from the in-game tuning panel before the first race.
loadOverrides();

// Back from Google's sign-in page: finish signing in on the Profile screen.
const signingIn = finishGoogleSignIn();

const game = new Game(document.getElementById('game'));
game.start(signingIn ? new ProfileScene(signingIn) : new MenuScene());

// Handy from the desktop devtools console.
window.game = game;
