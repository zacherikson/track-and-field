import { Button, text, slab, chamfer, titlePlate, PAL } from '../core/ui.js';
import { drawIcon } from '../core/icons.js';
import { olympic } from '../render/posterScenery.js';
import { CHARACTERS } from '../athletes/roster.js';
import { eventById } from '../events/registry.js';
import { Lobby, MAX_PLAYERS, CLOSE_BEFORE, serverNow } from '../online/live.js';
import { flow } from '../flow.js';
import { TOURNAMENT_KIND, liveAthletes } from '../tournament/tournament.js';

/**
 * The waiting room for a live event or tournament (`kind`: an event id or a
 * tournament's, online/live.js). You join as soon as you arrive; once someone
 * else is here a half-minute countdown starts, more players can still join (up
 * to MAX_PLAYERS), and everyone goes to the event together: when it runs out,
 * or as soon as every player has tapped I'm ready.
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
    this.backBtn = new Button({ label: 'Leave', icon: 'back', w: 160, h: 54, color: PAL.ink2, lip: PAL.inkShade, onTap: () => this.leave() });
    this.retryBtn = new Button({ label: 'Try again', w: 180, h: 54, color: PAL.orange, lip: PAL.orangeShade, onTap: () => this.join() });
    this.readyBtn = new Button({ label: 'I’m ready', w: 200, h: 54, color: PAL.liveGreen, lip: PAL.liveShade, onTap: () => this.toggleReady() });
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

  /** I'm ready, or not after all (tapped again). The server's word is what's shown. */
  toggleReady() {
    const me = this.view?.players.find((p) => p.me);
    if (me) this.lobby?.ready(!me.ready);
  }

  /** The I'm ready button shows once someone else is here to play. */
  canReady() {
    return this.state === 'waiting' && this.view?.startAt != null && !this.view.closed && this.view.players.length > 1;
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
    // Leave on its own in the middle, or beside I'm ready.
    const pair = this.canReady();
    Object.assign(this.backBtn, { x: pair ? view.w / 2 - 190 : view.w / 2 - 80, y: 436 });
    Object.assign(this.readyBtn, { x: view.w / 2 - 10, y: 436 });
    Object.assign(this.retryBtn, { x: view.w / 2 - 90, y: 300 });
  }

  onResize(view) {
    this.layout(view);
  }

  buttons() {
    if (this.state === 'error') return [this.backBtn, this.retryBtn];
    return this.canReady() ? [this.backBtn, this.readyBtn] : [this.backBtn];
  }

  update(dt, t) {
    this.age += dt;
    for (const e of this.game.input.consume(t + dt)) {
      if (e.type === 'down') this.buttons().some((b) => b.tap(e.x, e.y));
      else if (e.code === 'Escape') this.leave();
      else if ((e.code === 'Enter' || e.code === 'Space') && this.canReady()) this.toggleReady();
    }
    this.layout(this.game.view);
    const me0 = this.view?.players.find((p) => p.me);
    // Ready: gold with a check (tap again to take it back).
    this.readyBtn.label = me0?.ready ? 'Ready' : 'I’m ready';
    this.readyBtn.icon = me0?.ready ? 'check' : null;
    this.readyBtn.color = me0?.ready ? PAL.gold : PAL.liveGreen;
    this.readyBtn.lip = me0?.ready ? PAL.goldShade : PAL.liveShade;
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
    // Live's venue: the stadium at night; the room on a cream card in front of it.
    olympic(ctx, 0, 0, view.w, view.h, { trackH: 130, night: true });
    titlePlate(ctx, view, `${this.squad ? 'PRACTICE' : 'LIVE'} · ${this.title.toUpperCase()}`, this.squad ? `${this.squad.name} only` : '', { face: PAL.gold, ink: PAL.ink });
    const w = Math.min(520, view.w - 40);
    const x0 = view.w / 2 - w / 2;
    const top = 96;
    const h = 326;
    slab(ctx, x0, top, w, h, { face: PAL.cream, lip: PAL.creamShade, lipH: 6, c: 8 });

    const line = (s, y, o = {}) => text(ctx, s, view.w / 2, y, { size: 19, font: 'body', weight: 600, color: PAL.muted, maxWidth: w - 30, ...o });
    if (this.state === 'error') {
      line('Can’t reach the waiting room right now.', 250);
      this.buttons().forEach((b) => b.draw(ctx));
      return;
    }
    if (this.state === 'joining' || !this.view) {
      line(`Joining the waiting room${'.'.repeat(1 + (Math.floor(this.age * 3) % 3))}`, 258);
      return this.backBtn.draw(ctx);
    }

    const v = this.view;
    const left = v.startAt == null ? null : Math.max(0, Math.ceil((v.startAt - CLOSE_BEFORE - serverNow()) / 1000));
    const readyN = v.players.filter((p) => p.ready).length;
    const allReady = v.players.length > 1 && readyN === v.players.length;
    const big = { size: 40, font: 'display', track: 2, color: PAL.liveShade };
    if (left == null) line(this.squad ? 'Waiting for a squadmate to join…' : 'Waiting for another player to join…', top + 38, { size: 22, weight: 800, color: PAL.ink });
    else if (allReady) line('EVERYONE’S READY!', top + 38, big);
    else line(`STARTS IN ${left}`, top + 38, big);
    const sub = left == null ? `${v.players.length} of ${MAX_PLAYERS} players` : `${v.players.length} of ${MAX_PLAYERS} players · ${readyN} ready · starts when everyone is`;
    line(sub, top + 72, { size: 16 });

    // The players, one row each (yours gold).
    v.players.forEach((p, i) => {
      const y = top + 116 + i * 44;
      const rx = x0 + 16;
      const rw = w - 32;
      ctx.fillStyle = p.me ? PAL.gold : i % 2 ? PAL.cream : '#EFE2C3';
      chamfer(ctx, rx, y - 19, rw, 38, 4);
      ctx.fill();
      const colors = (CHARACTERS.find((c) => c.id === p.athlete) ?? CHARACTERS[0]).colors;
      ctx.fillStyle = colors.shirt;
      chamfer(ctx, rx + 12, y - 9, 18, 18, 3);
      ctx.fill();
      text(ctx, p.me ? `${p.name} (you)` : p.name, rx + 42, y + 1, { size: 19, font: 'body', align: 'left', weight: p.me ? 800 : 700, color: PAL.ink, maxWidth: rw - 160 });
      if (p.ready) {
        text(ctx, 'READY', rx + rw - 14, y + 1, { size: 20, font: 'display', align: 'right', track: 1, color: p.me ? PAL.ink : PAL.liveShade });
        drawIcon(ctx, 'check', rx + rw - 82, y, 20, p.me ? PAL.ink : PAL.liveShade);
      }
    });
    // A gentle pulse while it's just you.
    if (v.players.length < 2) {
      const k = 0.5 + 0.5 * Math.sin(this.age * 3);
      const tip = this.squad ? `Your squadmates see it on their Squad tab: they tap Join` : `Tell a friend to tap ${this.title} in the Live row`;
      line(tip, top + h - 34, { size: 16, color: `rgba(122,110,85,${(0.55 + 0.45 * k).toFixed(2)})` });
    }
    this.buttons().forEach((b) => b.draw(ctx));
  }
}
