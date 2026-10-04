// Top-level scene transitions in one place:
// home (Athlete | Play | Squad tabs) -> event intro -> event (countdown/play inside) -> result -> retry | menu
// tournament: intro -> event -> standings -> next intro ... -> champion
// live: waiting room -> event (or a tournament's events) with the others in it (a squad's practice too)
// meet: sign-up -> lobby -> intro -> event -> meet standings -> next intro ... -> relay -> final standings
import { HomeScene } from './scenes/homeScene.js';
import { IntroScene } from './scenes/introScene.js';
import { ResultScene } from './scenes/resultScene.js';
import { LeaderboardScene } from './scenes/leaderboardScene.js';
import { ProfileScene } from './scenes/profileScene.js';
import { LobbyScene } from './scenes/lobbyScene.js';
import { StandingsScene } from './tournament/standingsScene.js';
import { MeetScene } from './meet/meetScene.js';
import { MeetStandingsScene } from './meet/meetStandingsScene.js';
import { meet } from './meet/meet.js';
import { tournament } from './tournament/tournament.js';
import { openTuning } from './tuning/panel.js';
import { roundMark, eventById } from './events/registry.js';
import { ORDER, TOURNAMENT_KIND } from './tournament/tournament.js';
import { startLive, endLive, currentLive } from './online/live.js';
import { resetScars } from './brawl/wounds.js';
import { getCampaign, setCampaign, markBeaten, canTune } from './core/storage.js';

export const flow = {
  // The home screen, on its Play tab (or `tab`: homeScene.js TABS).
  menu: (game, tab = 'play') => {
    resetScars(); // the late hits' wounds heal
    endLive(); // and leaves a live room
    meet.end(); // or a squad meet
    tournament.end(); // leaving to the menu ends a tournament in progress
    game.setScene(new HomeScene(tab));
  },
  // Tournament: the five events in a row, decathlon points, a champion at the end.
  tournament: (game) => {
    resetScars();
    endLive();
    tournament.start();
    game.setScene(new IntroScene(tournament.event));
  },
  intro: (game, ev) => game.setScene(new IntroScene(ev)),
  play: (game, ev) => {
    const scene = ev.create();
    if (meet.active) scene.live = meet.session; // a squad meet's next event
    else if (tournament.live) scene.live = tournament.live; // a live tournament's next event
    else endLive(); // playing on your own after a live event
    game.setScene(scene);
  },
  results: (game, ev, results, stats) => {
    // Marks count as they're shown: to the hundredth (registry.js roundMark).
    results = results.map((r) => (r.mark == null ? r : { ...r, mark: roundMark(ev, r.mark) }));
    if (stats?.run) stats = { ...stats, run: { ...stats.run, mark: roundMark(ev, stats.run.mark) } };
    // A live event played to the end: going on from here isn't leaving early (a tournament's is at the end).
    if (stats?.live && !tournament.active && currentLive()) currentLive().done = true;
    // A squad's practice: Race again goes back to its waiting room, Menu to the Squad tab.
    if (stats?.live && currentLive()?.squad) stats = { ...stats, squad: currentLive().squad };
    // A campaign event won (first place, ghosts aside) is ticked off.
    const winner = results.find((r) => !r.ghost);
    if (getCampaign() && !stats?.live && winner?.isPlayer && winner.status === 'ok') markBeaten(getCampaign(), ev.id);
    // The event carries on under the results with its late hits (brawl/aftermath.js).
    const backdrop = game.scene?.lateRender ? game.scene : null;
    if (backdrop) backdrop.handedOver = true; // it stays open until the results scene leaves it
    game.setScene(
      meet.active
        ? new MeetStandingsScene(ev, results, stats, backdrop)
        : tournament.active
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
  // `squad` ({ key, name }): that squad's practice room, which only its members see (Squad tab).
  live: (game, kind, squad = null) => {
    setCampaign(null);
    endLive();
    tournament.end();
    game.setScene(new LobbyScene(kind, squad));
  },
  // The waiting room has closed: `info` = { kind, room, uid, name, players, startAt, setLen, squad }.
  liveStart: (game, info) => {
    resetScars();
    const tour = info.kind === TOURNAMENT_KIND;
    const first = tour ? ORDER[0] : info.kind;
    const session = startLive(info, first);
    if (tour) tournament.start(session);
    const scene = eventById(first).create();
    scene.live = session;
    game.setScene(scene);
  },
  // A squad meet (docs/meets.md): `squad` ({ key, name }) signs you up for its meet.
  meet: (game, squad) => {
    setCampaign(null);
    endLive();
    tournament.end();
    meet.end();
    game.setScene(new MeetScene(squad));
  },
  // The meet's event `i` (meet/rules.js MEET_ORDER): its title card, which counts down to it.
  // Not in it (you dropped out of it): waiting for the next.
  meetEvent: (game, i) => {
    resetScars();
    meet.index = i;
    if (meet.session) meet.session.step = i;
    if (!meet.inEvent(i)) return game.setScene(new MeetScene(null, { waiting: true }));
    game.setScene(new IntroScene(eventById(meet.eventId(i))));
  },
  // Tuning panel overlay; the canvas scene underneath stays as it was.
  tuning: (game) => canTune() && openTuning(() => game.input.clear()), // the owner's only
};
