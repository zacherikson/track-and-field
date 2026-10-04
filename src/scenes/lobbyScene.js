import { Button, text, roundRect } from '../core/ui.js';
import { CHARACTERS } from '../athletes/roster.js';
import { eventById } from '../events/registry.js';
import { Lobby, MAX_PLAYERS, CLOSE_BEFORE, serverNow } from '../online/live.js';
import { flow } from '../flow.js';
import { TOURNAMENT_KIND, liveAthletes } from '../tournament/tournament.js';

/**
 * The waiting room for a live event or tournament (`kind`: an event id or a
 * tournament's, online/live.js). You join as soon as you arrive; once someone
 * else is here a countdown starts, more players can still join (up to
 * MAX_PLAYERS), and everyone goes to the event together.
 *
 * With `squad` ({ key, name }) it's that squad's practice room: only its
 * members see it (on their Squad tab, where they tap Join), and leaving goes
 * back there.
 */
export class LobbyScene {
  constructor(kind, squad = null) {
    this.kind = kind;
    this.squad = squad;
    this.title = kind === TOURNAMENT_KIND ? 'Tournament' : eventById(kind).name;
  }

  enter() {
    this.backBtn = new Button({ label: 'Leave', w: 160, h: 50, color: 'rgba(255,255,255,0.18)', onTap: () => this.leave() });
    this.retryBtn = new Button({ label: 'Try again', w: 180, h: 50, onTap: () => this.join() });
    this.view = null;
    this.age = 0;
    this.layout(this.game.view);
    this.join();
  }

  join() {
    this.state = 'joining';
    this.lobby?.close(false);
    this.lobby = new Lobby(this.kind, (v) => this.onLobby(v), liveAthletes(), this.squad);
    this.lobby.join().catch((err) => {
      console.warn('waiting room unavailable', err);
      if (this.game.scene === this) this.state = 'error';
    });
  }

  /** Back to where you came from: the Squad tab for a practice, else Play. */
  leave() {
    flow.menu(this.game, this.squad ? 'squad' : 'play');
  }

  onLobby(v) {
    if (this.game.scene !== this) return;
    this.view = v;
    this.state = 'waiting';
  }

  exit() {
    // Going to the event keeps your place; anything else leaves the room.
    this.lobby?.close(!this.racing);
  }

  layout(view) {
    Object.assign(this.backBtn, { x: view.w / 2 - 80, y: 440 });
    Object.assign(this.retryBtn, { x: view.w / 2 - 90, y: 300 });
  }

  onResize(view) {
    this.layout(view);
  }

  buttons() {
    return this.state === 'error' ? [this.backBtn, this.retryBtn] : [this.backBtn];
  }

  update(dt, t) {
    this.age += dt;
    for (const e of this.game.input.consume(t + dt)) {
      if (e.type === 'down') this.buttons().some((b) => b.tap(e.x, e.y));
      else if (e.code === 'Escape') this.leave();
    }
    this.buttons().forEach((b) => b.update(dt));
    // The room has closed with you in it: to the event.
    const v = this.view;
    const me = v?.players.find((p) => p.me);
    if (v?.startAt != null && me && v.players.length > 1 && serverNow() >= v.startAt - CLOSE_BEFORE) {
      this.racing = true;
      flow.liveStart(this.game, { kind: this.kind, room: v.room, uid: v.uid, name: me.name, players: v.players, startAt: v.startAt, setLen: v.setLen, squad: this.squad });
    } else if (v && !me && this.state === 'waiting') {
      this.join(); // dropped from the room (went quiet too long): back in
    }
  }

  render(ctx, view) {
    ctx.fillStyle = '#12203a';
    ctx.fillRect(0, 0, view.w, view.h);
    text(ctx, `${this.squad ? '⚔ PRACTICE' : 'LIVE'} · ${this.title.toUpperCase()}`, view.w / 2, 40, { size: 28, color: '#ffb400', shadow: true });
    if (this.squad) text(ctx, `${this.squad.name} only`, view.w / 2, 66, { size: 14, weight: 700, color: 'rgba(255,255,255,0.6)' });
    const w = Math.min(520, view.w - 40);
    const x0 = view.w / 2 - w / 2;
    roundRect(ctx, x0, 80, w, 340, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();

    const line = (s, y, o = {}) => text(ctx, s, view.w / 2, y, { size: 18, weight: 500, color: 'rgba(255,255,255,0.8)', maxWidth: w - 30, ...o });
    if (this.state === 'error') {
      line('Can’t reach the waiting room right now.', 240);
      this.buttons().forEach((b) => b.draw(ctx));
      return;
    }
    if (this.state === 'joining' || !this.view) {
      line(`Joining the waiting room${'.'.repeat(1 + (Math.floor(this.age * 3) % 3))}`, 250);
      return this.backBtn.draw(ctx);
    }

    const v = this.view;
    const left = v.startAt == null ? null : Math.max(0, Math.ceil((v.startAt - CLOSE_BEFORE - serverNow()) / 1000));
    if (left == null) line(this.squad ? 'Waiting for a squadmate to join…' : 'Waiting for another player to join…', 118, { size: 20, color: '#fff' });
    else line(`Starts in ${left}`, 118, { size: 30, color: '#59cd90', weight: 800 });
    line(`${v.players.length} of ${MAX_PLAYERS} players`, 150, { size: 15, color: 'rgba(255,255,255,0.55)' });

    v.players.forEach((p, i) => {
      const y = 196 + i * 44;
      if (p.me) {
        roundRect(ctx, x0 + 16, y - 18, w - 32, 36, 10);
        ctx.fillStyle = 'rgba(255,180,0,0.18)';
        ctx.fill();
      }
      const colors = (CHARACTERS.find((c) => c.id === p.athlete) ?? CHARACTERS[0]).colors;
      ctx.fillStyle = colors.shirt;
      ctx.beginPath();
      ctx.arc(x0 + 40, y, 8, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, p.me ? `${p.name} (you)` : p.name, x0 + 60, y, { size: 18, align: 'left', weight: p.me ? 800 : 600, maxWidth: w - 100 });
    });
    // A gentle pulse while it's just you.
    if (v.players.length < 2) {
      const k = 0.5 + 0.5 * Math.sin(this.age * 3);
      const tip = this.squad ? `Your squadmates see it on their Squad tab: they tap Join` : `Tell a friend to tap ${this.title} in the Online row`;
      line(tip, 390, { size: 15, color: `rgba(255,255,255,${(0.35 + 0.3 * k).toFixed(2)})` });
    }
    this.backBtn.draw(ctx);
  }
}
