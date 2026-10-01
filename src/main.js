import { Game } from './core/game.js';
import { HomeScene } from './scenes/homeScene.js';
import { ProfileScene } from './scenes/profileScene.js';
import { loadOverrides } from './tuning/store.js';
import { finishGoogleSignIn } from './online/firebase.js';
import { CHARACTERS } from './athletes/roster.js';
import { preloadSprites } from './athletes/sprites.js';
import { takeInviteLink } from './online/squads.js';
import { openInvite } from './scenes/inviteScreen.js';

// Apply any settings saved from the in-game tuning panel before the first race.
loadOverrides();
preloadSprites(CHARACTERS);

// Opened from a squad invite: the invite screen, over the Squad tab.
const invite = takeInviteLink();

// Back from Google's sign-in page: finish signing in on the Profile screen.
const signingIn = finishGoogleSignIn();

const game = new Game(document.getElementById('game'));
game.start(signingIn ? new ProfileScene(signingIn) : new HomeScene(invite ? 'squad' : 'play'));
if (invite && !signingIn) openInvite(game, invite);

// Handy from the desktop devtools console.
window.game = game;
