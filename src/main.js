import { Game } from './core/game.js';
import { HomeScene } from './scenes/homeScene.js';
import { ProfileScene } from './scenes/profileScene.js';
import { OnboardingScene } from './scenes/onboarding.js';
import { loadOverrides } from './tuning/store.js';
import { canTune, isOnboarded } from './core/storage.js';
import { finishGoogleSignIn } from './online/firebase.js';
import { CHARACTERS } from './athletes/roster.js';
import { preloadSprites } from './athletes/sprites.js';
import { takeInviteLink } from './online/squads.js';
import { openInvite } from './scenes/inviteScreen.js';
import { loadFonts } from './core/ui.js';

// Apply any settings saved from the in-game tuning panel before the first race.
// Only the owner tunes; everyone else plays the shipped numbers (settings a
// tester saved before the panel was hidden are ignored).
if (canTune()) loadOverrides();
preloadSprites(CHARACTERS);

// Opened from a squad invite: the invite screen, over the Squad tab.
const invite = takeInviteLink();

// Back from Google's sign-in page: finish signing in on the Profile screen.
const signingIn = finishGoogleSignIn();

// The menus' fonts, before the first frame, so the canvas never draws (and measures) the fallback.
await loadFonts();

const game = new Game(document.getElementById('game'));
if (!isOnboarded()) {
  // A new player (or the first time since it came in): set up first, sign-in, username and athlete.
  // Back from Google's sign-in mid-setup lands here too; an invite waits until you're done.
  game.start(new OnboardingScene(signingIn, invite));
} else {
  game.start(signingIn ? new ProfileScene(signingIn) : new HomeScene(invite ? 'squad' : 'play'));
  if (invite && !signingIn) openInvite(game, invite);
}

// Handy from the desktop devtools console.
window.game = game;
