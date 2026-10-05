import { Button, text, roundRect } from '../../core/ui.js';
import { cleanName, getPlayerName } from '../../core/storage.js';
import { cachedSquad, loadMySquad, topSquads, searchSquads, createSquad, joinSquad, leaveSquad, kickFromSquad, SQUAD_MAX, inviteLink, getInvite, setInvite, squadInfo } from '../../online/squads.js';
import { prewarmSDK } from '../../online/firebase.js';
import { MAX_PLAYERS, FIELD } from '../../online/live.js';
import { EVENTS, eventById } from '../../events/registry.js';
import { TOURNAMENT_KIND } from '../../tournament/tournament.js';
import { flow } from '../../flow.js';
import { openInvite } from '../inviteScreen.js';
import { Conn, meetServer } from '../../online/net.js';
import { BigButton } from './playPanel.js';

const WARN = '#ffb35c';
const OK = '#59cd90';
const DIM = 'rgba(255,255,255,0.6)';
const PLAIN = 'rgba(255,255,255,0.15)';

const GOLD = '#ffb400';

/**
 * The home screen's right tab: your squad (online/squads.js). In one: its name
 * and members, Invite (a link to send a friend) and Leave; its leader can tap
 * a member to kick them out. Not in one: start a
 * squad, or find one and join it; a squad you've been invited to comes first.
 *
 * PRACTICE (in a squad), like a Clash Royale friendly battle: the big ⚔
 * Practice button opens the events to pick from (the five, the 4x100m relay,
 * the tournament), and picking one opens a live waiting room only your squad
 * sees (online/live.js, squadlobby/). While it's open it's on every member's
 * Squad tab, next to the button, with Join.
 *
 * MEET (in a squad): squads against squads on the meet server (docs/meets.md).
 * The 🏟 Meet button signs you up (meet/meetScene.js); the first four make the
 * squad's team. While this tab shows, it follows the squad's sign-up (its
 * SquadHub), so the button says who's signed up and whether a meet is on.
 */
export class SquadPanel {
  constructor(home) {
    this.home = home;
    this.game = home.game;
  }

  enter() {
    this.mine = cachedSquad(); // undefined until loaded
    this.loadError = null;
    this.list = { title: 'BIGGEST SQUADS', q: null, rows: null, error: null };
    this.status = null; // { text, color, profile } (profile: offer the Profile button)
    this.busy = false;
    this.loadedAt = -Infinity;
    this.createBtn = new Button({ label: '＋ Start a squad', w: 210, h: 44, size: 19, onTap: () => this.create() });
    this.findBtn = new Button({ label: '🔍 Find by name', w: 200, h: 44, size: 19, color: '#3a6fd8', onTap: () => this.find() });
    this.topBtn = new Button({ label: 'Biggest', w: 120, h: 44, size: 19, color: PLAIN, onTap: () => this.loadList(null) });
    this.profileBtn = new Button({ label: '👤 Pick a username', w: 220, h: 44, size: 19, color: PLAIN, onTap: () => flow.profile(this.game, 'squad') });
    this.retryBtn = new Button({ label: 'Try again', w: 160, h: 44, size: 19, color: PLAIN, onTap: () => this.refresh() });
    this.leaveBtn = new Button({ label: 'Leave', w: 110, h: 40, size: 18, color: PLAIN, onTap: () => this.leave() });
    this.inviteBtn = new Button({ label: '📨 Invite', w: 140, h: 40, size: 18, color: '#2bb673', onTap: () => this.share() });
    this.joinBtns = [];
    // The squad you've been invited to, offered at the top: { key, name, size }.
    this.invite = null;
    this.inviteJoinBtn = new Button({ label: 'Join', w: 84, h: 32, size: 17, color: '#2bb673', onTap: () => this.invite && openInvite(this.game, { key: this.invite.key }) });
    this.dismissBtn = new Button({ label: '✕', w: 36, h: 32, size: 16, color: PLAIN, onTap: () => this.dropInvite() });
    // Practice: the big button, the events it offers, and your squadmates' open rooms.
    this.practiceBtn = new BigButton({ label: '⚔ Practice', sub: 'Race your squad live', color: '#d98a00', onTap: () => this.openPicker() });
    this.picking = false;
    this.pickBtns = PRACTICE_KINDS.map(
      (k) => new Button({ label: k.label, sub: k.sub, w: 160, h: 70, size: 20, color: k.color, onTap: () => this.practice(k.kind) }),
    );
    this.cancelBtn = new Button({ label: 'Cancel', w: 140, h: 44, size: 19, color: PLAIN, onTap: () => this.back() });
    // Meet: the button, and the squad's sign-up as its SquadHub has it ({ forming, meet }).
    this.meetBtn = new BigButton({ label: '🏟 Meet', sub: 'Squads vs squads', color: '#2f6fd8', onTap: () => this.goMeet() });
    this.meetView = null;
    this.meetWatch = null; // { key, conn }
    this.rooms = []; // open practice rooms, from the squad's hub on the meet server (watchMeet)
    this.roomBoxes = [];
    this.roomBtns = [];
    this.refresh();
    this.loadInvite();
    if (this.home.panels[this.home.tab] === this) prewarmSDK(); // the game opened on this tab
  }

  /**
   * Coming to this tab: catch up with your squad (someone may have joined),
   * and start loading the Firebase SDK, which every button here needs and
   * nothing else on the home screen does.
   */
  onShow() {
    prewarmSDK();
    if (performance.now() - this.loadedAt > 10000) this.refresh();
  }

  refresh() {
    this.loadError = null;
    this.loadedAt = performance.now();
    loadMySquad()
      .then((squad) => {
        const was = this.mine;
        this.mine = squad;
        if (was && !squad && !this.busy) this.status = { text: `You’re no longer in ${was.name}.`, color: WARN }; // kicked out
        if (squad && squad.key === this.invite?.key) this.dropInvite(); // in it already
        if (!squad && !this.list.rows) this.loadList(this.list.q);
      })
      .catch((e) => {
        this.loadError = loadMessage(e);
      })
      .finally(() => this.relayout());
  }

  exit() {
    this.watchMeet(null);
  }

  /**
   * Follows squad `key`'s hub on the meet server (null: stops), while the
   * Squad tab shows: its meet sign-up, for the Meet button's line, and its
   * open Practice rooms.
   */
  watchMeet(key) {
    if (key === (this.meetWatch?.key ?? null)) return;
    this.meetWatch?.conn.close();
    this.meetWatch = null;
    this.meetView = null;
    this.rooms = [];
    this.relayout();
    if (!key || !meetServer()) return;
    const conn = new Conn(
      `/squad/${encodeURIComponent(key)}`,
      {
        message: (m) => {
          if (m.t === 'squad') this.meetView = m;
          else if (m.t === 'rooms') {
            this.rooms = (m.rooms ?? []).map((r) => ({ ...r, players: r.players.map((p) => ({ ...p, me: p.uid === conn.uid })), mine: r.players.some((p) => p.uid === conn.uid) }));
            this.relayout();
          }
        },
      },
      { squadName: this.mine?.name },
    );
    this.meetWatch = { key, conn };
  }

  /** The Meet button: sign up for the squad's meet (or back into it). */
  goMeet() {
    const s = this.mine;
    if (!s || this.busy) return;
    if (!meetServer()) {
      this.status = { text: 'Meets aren’t open yet: the meet server isn’t set up.', color: WARN };
      return;
    }
    flow.meet(this.game, { key: s.key, name: s.name });
  }

  /** What the Meet button says under its name: the sign-up, or the squad's meet. */
  meetLine() {
    const v = this.meetView;
    if (!meetServer()) return 'Coming soon';
    if (!v) return 'Squads vs squads';
    if (v.meet) {
      if (v.meet.phase === 'lobby') return v.meet.open > 0 ? `In a lobby · ${v.meet.open} place${v.meet.open > 1 ? 's' : ''} open` : `${v.meet.names.join(', ')} in a lobby`;
      return `Meet on: ${v.meet.names.join(', ')}`;
    }
    if (v.forming.length) return `${v.forming.map((f) => f.name).join(', ')} · ${v.forming.length}/4 · Join!`;
    return 'Squads vs squads · 4 a squad';
  }

  /** Practice: the events to pick from. */
  openPicker() {
    if (!this.mine || this.busy) return;
    this.picking = true;
    this.status = null;
    this.relayout();
  }

  /** A step back (Esc): closes the event picker. True if it was open. */
  back() {
    if (!this.picking) return false;
    this.picking = false;
    return true;
  }

  /** Starts, or joins, your squad's practice room for `kind` (an event, or the tournament's). */
  practice(kind) {
    const s = this.mine;
    if (!s) return;
    this.picking = false;
    flow.live(this.game, kind, { key: s.key, name: s.name });
  }

  /** The squad you've been invited to (an invite link: squads.js takeInviteLink), if any. */
  loadInvite() {
    const key = getInvite();
    if (!key) return;
    squadInfo(key)
      .then((info) => {
        if (getInvite() !== key) return; // dealt with since
        if (!info) {
          setInvite(null);
          this.status = { text: 'The squad you were invited to has closed.', color: WARN };
        } else if (this.mine?.key === key) setInvite(null);
        else this.invite = info;
      })
      .catch(() => {}) // offered next time
      .finally(() => this.relayout());
  }

  /** Forgets the invite (joined a squad, or turned it down). */
  dropInvite() {
    setInvite(null);
    this.invite = null;
    this.relayout();
  }

  /**
   * Invite: the phone's share sheet (Messages, WhatsApp...) with a link to the
   * game that offers your squad; where there's no share sheet, the link copied.
   */
  async share() {
    const s = this.mine;
    if (!s || this.busy) return;
    const url = inviteLink(s, getPlayerName());
    const message = `Join my squad ${s.name} in Track Royale!`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Track Royale', text: message, url });
        this.status = { text: 'Invite shared. The link takes them straight to your squad.', color: OK };
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return; // closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(`${message} ${url}`);
      this.status = { text: 'Invite link copied. Paste it to a friend.', color: OK };
    } catch {
      this.ask('Copy this link and send it to a friend:', url);
    }
  }

  /** The squads to join: the biggest, or those whose name starts with `q`. */
  loadList(q) {
    this.list = { title: q ? `NAMES STARTING “${q.toUpperCase()}”` : 'BIGGEST SQUADS', q, rows: null, error: null };
    this.joinBtns = [];
    (q ? searchSquads(q) : topSquads())
      .then((rows) => {
        if (this.list.q !== q) return; // another list was asked for since
        this.list.rows = rows;
        this.joinBtns = rows.map(
          (r) => new Button({ label: r.size >= SQUAD_MAX ? 'Full' : 'Join', w: 84, h: 32, size: 17, enabled: r.size < SQUAD_MAX, color: '#2bb673', onTap: () => this.join(r) }),
        );
      })
      .catch((e) => {
        if (this.list.q === q) this.list.error = loadMessage(e);
      })
      .finally(() => this.relayout());
  }

  ask(question, typed = '') {
    const answer = window.prompt(question, typed);
    this.game.input.clear(); // the dialog swallowed the rest of that tap
    return answer;
  }

  find() {
    if (this.busy) return;
    const typed = this.ask('Find a squad: type the start of its name');
    if (typed == null) return;
    const q = typed.replace(/\s+/g, ' ').trim().slice(0, 16);
    this.loadList(q || null);
  }

  create() {
    if (this.busy) return;
    const typed = this.ask('Name your squad (up to 16 letters or numbers)');
    if (typed == null) return;
    const name = cleanName(typed);
    if (!name) {
      this.status = { text: "Use letters and numbers (spaces and _ . ' - are fine inside)", color: WARN };
      return;
    }
    this.act(`Starting ${name}…`, () => createSquad(name), name);
  }

  join(row) {
    if (this.busy) return;
    const run = () =>
      joinSquad(row.key).catch((e) => {
        if (e?.code === 'gone' && this.invite?.key === row.key) this.dropInvite();
        throw e;
      });
    this.act(`Joining ${row.name}…`, run, row.name);
  }

  leave() {
    if (this.busy || !this.mine) return;
    const last = this.mine.members.length === 1;
    const sure = window.confirm(`Leave ${this.mine.name}?${last ? ' You’re the last one in it, so it closes.' : ''}`);
    this.game.input.clear();
    if (!sure) return;
    this.act('Leaving…', () => leaveSquad(), this.mine.name, `You left ${this.mine.name}.`);
  }

  /** The leader only: kick `m` out of the squad, once you've said you're sure. */
  kick(m) {
    if (this.busy || !this.mine) return;
    const sure = window.confirm(`Kick ${m.name} out of ${this.mine.name}? They can join again later.`);
    this.game.input.clear();
    if (!sure) return;
    const was = this.mine;
    // Off the list as you tap, rather than a round trip later; back on it if the server says no.
    this.mine = { ...was, members: was.members.filter((x) => x.uid !== m.uid), size: was.size - 1 };
    const kick = () =>
      kickFromSquad(m.uid).catch((e) => {
        this.mine = was;
        throw e;
      });
    this.act(`Kicking out ${m.name}…`, kick, was.name, `${m.name} is out of the squad.`);
  }

  /** You're the leader of the squad you're in. */
  get leading() {
    return !!this.mine?.members.some((m) => m.me && m.leader);
  }

  /** Runs a squad change, showing how it went (`done`: what to say when it worked, if not a welcome). */
  act(doing, run, name, done = null) {
    this.busy = true;
    this.status = { text: doing, color: 'rgba(255,255,255,0.7)' };
    run()
      .then((squad) => {
        this.mine = squad;
        if (squad) this.dropInvite(); // in a squad now
        this.status = done ? { text: done, color: OK } : squad ? { text: `Welcome to ${squad.name}!`, color: OK } : null;
        if (!squad) this.loadList(this.list.q);
      })
      .catch((e) => {
        this.status = actMessage(e, name);
        if (e?.code === 'in-squad') this.refresh();
        if (e?.code === 'gone' || e?.code === 'full') this.loadList(this.list.q);
      })
      .finally(() => {
        this.busy = false;
        this.relayout();
      });
  }

  relayout() {
    if (this.view) this.layout(this.view, this.bottom);
  }

  /** `bottom`: the top of the tab bar. */
  layout(view, bottom) {
    this.view = view;
    this.bottom = bottom;
    const margin = 20 + Math.max(view.safe.l, view.safe.r);
    this.contentW = Math.min(880, view.w - margin * 2);
    this.x0 = (view.w - this.contentW) / 2;
    if (this.mine) {
      this.inviteBtn.x = 14 + view.safe.l;
      this.leaveBtn.x = view.w - 14 - view.safe.r - this.leaveBtn.w;
      this.inviteBtn.y = this.leaveBtn.y = 14 + view.safe.t;
      this.layoutPractice(view, bottom);
      return;
    }
    // Not in a squad: the buttons in a row, then the list in one or two columns.
    const btns = this.buttonRow();
    const gap = 12;
    let x = view.w / 2 - (btns.reduce((s, b) => s + b.w, 0) + gap * (btns.length - 1)) / 2;
    for (const b of btns) {
      Object.assign(b, { x, y: 82 });
      x += b.w + gap;
    }
    const cols = this.contentW >= 700 ? 2 : 1;
    const colGap = 16;
    const rowW = (this.contentW - colGap * (cols - 1)) / cols;
    // The squad you've been invited to, across the top, then the rest.
    this.inviteBox = this.invite ? { x: this.x0, y: LIST_Y, w: this.contentW, h: ROW_H } : null;
    if (this.inviteBox) {
      const k = this.inviteBox;
      Object.assign(this.dismissBtn, { x: k.x + k.w - this.dismissBtn.w - 6, y: k.y + 6 });
      Object.assign(this.inviteJoinBtn, { x: this.dismissBtn.x - 84 - 8, y: k.y + 6 });
    }
    this.listY = LIST_Y + (this.invite ? ROW_H + 38 : 0);
    const perCol = Math.max(1, Math.floor((bottom - 8 - this.listY + ROW_GAP) / (ROW_H + ROW_GAP)));
    this.rowBoxes = (this.list.rows ?? []).slice(0, perCol * cols).map((r, i) => ({
      r,
      x: this.x0 + Math.floor(i / perCol) * (rowW + colGap),
      y: this.listY + (i % perCol) * (ROW_H + ROW_GAP),
      w: rowW,
      h: ROW_H,
    }));
    this.rowBoxes.forEach((k, i) => Object.assign(this.joinBtns[i], { x: k.x + k.w - 84 - 6, y: k.y + 6 }));
  }

  /**
   * Practice along the bottom: the big button, then your squadmates' open
   * rooms beside it, as many as fit. And the event picker over everything.
   */
  layoutPractice(view, bottom) {
    this.practiceY = bottom - 30 - PRACTICE_H;
    const bigW = Math.min(240, Math.max(170, this.contentW * 0.25));
    Object.assign(this.meetBtn, { x: this.x0, y: this.practiceY, w: bigW, h: PRACTICE_H });
    const b = this.practiceBtn;
    Object.assign(b, { x: this.x0 + bigW + 12, y: this.practiceY, w: bigW, h: PRACTICE_H });
    const gap = 12;
    const left = b.x + b.w + 16;
    const w = Math.min(280, this.contentW - (left - this.x0));
    const fits = Math.max(1, Math.floor((this.x0 + this.contentW - left + gap) / (w + gap)));
    this.roomBoxes = this.rooms.slice(0, fits).map((r, i) => ({ r, x: left + i * (w + gap), y: this.practiceY, w, h: PRACTICE_H }));
    this.roomBtns = this.roomBoxes.map(
      (k) =>
        new Button({
          label: k.r.full && !k.r.mine ? 'Full' : 'Join',
          w: 76,
          h: 36,
          size: 18,
          color: '#2bb673',
          enabled: !k.r.full || k.r.mine,
          x: k.x + k.w - 76 - 10,
          y: k.y + (k.h - 36) / 2,
          onTap: () => this.practice(k.r.kind),
        }),
    );
    // The picker: a card over the tab, four events to a row.
    const cw = Math.min(this.contentW, 760);
    const cols = 4;
    const bw = (cw - 40 - (cols - 1) * 12) / cols;
    this.pickCard = { x: view.w / 2 - cw / 2, y: 64, w: cw, h: 332 };
    const rows = Math.ceil(this.pickBtns.length / cols);
    this.pickBtns.forEach((btn, i) => {
      const row = Math.floor(i / cols);
      const inRow = row < rows - 1 ? cols : this.pickBtns.length - row * cols;
      const rx = view.w / 2 - (inRow * bw + (inRow - 1) * 12) / 2;
      Object.assign(btn, { w: bw, x: rx + (i % cols) * (bw + 12), y: this.pickCard.y + 84 + row * (btn.h + 12) });
    });
    Object.assign(this.cancelBtn, { x: view.w / 2 - this.cancelBtn.w / 2, y: this.pickCard.y + this.pickCard.h - this.cancelBtn.h - 14 });
  }

  /** The buttons along the top when you're not in a squad. */
  buttonRow() {
    if (this.loadError) return [this.retryBtn];
    return [this.createBtn, this.findBtn, ...(this.list.q ? [this.topBtn] : []), ...(this.status?.profile ? [this.profileBtn] : [])];
  }

  get buttons() {
    if (this.mine && this.picking) return [...this.pickBtns, this.cancelBtn];
    if (this.mine) return [this.inviteBtn, this.leaveBtn, this.meetBtn, this.practiceBtn, ...this.roomBtns];
    if (this.mine === undefined && !this.loadError) return [];
    if (this.loadError) return this.buttonRow();
    return [...this.buttonRow(), ...(this.inviteBox ? [this.inviteJoinBtn, this.dismissBtn] : []), ...this.joinBtns.slice(0, this.rowBoxes?.length ?? 0)];
  }

  /** `events`: this tab's taps (the home screen has sorted out swipes). */
  update(dt, events) {
    const showing = this.mine && this.home.panels[this.home.tab] === this ? this.mine.key : null;
    this.watchMeet(showing);
    this.meetBtn.sub = this.meetLine();
    if (!this.mine) this.picking = false;
    const btns = this.buttons;
    for (const e of events) {
      if (e.type !== 'down') continue;
      if (btns.some((b) => b.tap(e.x, e.y))) {
        if (this.game.scene !== this.home) return;
        continue;
      }
      // A tap off the picker's card closes it.
      if (this.picking) {
        const k = this.pickCard;
        if (!(e.x >= k.x && e.x <= k.x + k.w && e.y >= k.y && e.y <= k.y + k.h)) this.back();
        continue;
      }
      // The leader taps a member to kick them out.
      const hit = this.leading && this.memberGrid(this.mine).boxes.find((k) => !k.m.me && e.x >= k.x && e.x <= k.x + k.w && e.y >= k.y && e.y <= k.y + k.h);
      if (hit) this.kick(hit.m);
    }
    for (const b of [this.createBtn, this.findBtn, this.topBtn, this.profileBtn, this.retryBtn, this.leaveBtn, this.inviteBtn, this.inviteJoinBtn, this.dismissBtn, this.meetBtn, this.practiceBtn, this.cancelBtn, ...this.pickBtns, ...this.roomBtns, ...this.joinBtns]) b.update(dt);
    const busy = this.busy;
    for (const b of [this.createBtn, this.findBtn, this.topBtn, this.leaveBtn, this.inviteBtn, this.dismissBtn, this.meetBtn, this.practiceBtn]) b.enabled = !busy;
    this.age = (this.age ?? 0) + dt;
    const full = this.invite?.size >= SQUAD_MAX;
    this.inviteJoinBtn.label = full ? 'Full' : 'Join';
    this.inviteJoinBtn.enabled = !busy && !full;
    this.joinBtns.forEach((b, i) => (b.enabled = !busy && this.list.rows?.[i]?.size < SQUAD_MAX));
  }

  render(ctx, view) {
    if (this.mine) return this.renderSquad(ctx, view, this.mine);
    text(ctx, 'SQUADS', view.w / 2, 34, { size: 30, color: '#ffb400', shadow: true });
    if (this.status) text(ctx, this.status.text, view.w / 2, 62, { size: 15, weight: 600, color: this.status.color, maxWidth: view.w - 40 });
    if (this.mine === undefined && !this.loadError) {
      text(ctx, 'Loading…', view.w / 2, 200, { size: 18, weight: 600, color: DIM });
      return;
    }
    this.buttonRow().forEach((b) => b.draw(ctx));
    if (this.loadError) {
      text(ctx, this.loadError, view.w / 2, 200, { size: 18, weight: 600, color: WARN, maxWidth: view.w - 40 });
      return;
    }
    if (this.inviteBox) {
      const k = this.inviteBox;
      text(ctx, 'YOU’RE INVITED', k.x, k.y - 14, { size: 13, weight: 800, align: 'left', color: '#ffd35c' });
      roundRect(ctx, k.x, k.y, k.w, k.h, 10);
      ctx.fillStyle = 'rgba(255,180,0,0.18)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffb400';
      ctx.stroke();
      text(ctx, `📨 ${this.invite.name}`, k.x + 14, k.y + k.h / 2, { size: 18, align: 'left', color: '#ffd35c', maxWidth: k.w - 260 });
      text(ctx, `👥 ${this.invite.size}/${SQUAD_MAX}`, this.inviteJoinBtn.x - 14, k.y + k.h / 2, { size: 14, weight: 600, align: 'right', color: DIM });
      this.inviteJoinBtn.draw(ctx);
      this.dismissBtn.draw(ctx);
    }
    text(ctx, this.list.title, this.x0, this.listY - 14, { size: 13, weight: 700, align: 'left', color: DIM, maxWidth: this.contentW });
    const { rows, error } = this.list;
    const msg = error ?? (!rows ? 'Loading…' : !rows.length ? (this.list.q ? 'No squads by that name yet. Start it yourself!' : 'No squads yet. Start the first one!') : null);
    if (msg) text(ctx, msg, view.w / 2, this.listY + 40, { size: 17, weight: 600, color: error ? WARN : DIM, maxWidth: view.w - 40 });
    this.rowBoxes?.forEach((k, i) => {
      roundRect(ctx, k.x, k.y, k.w, k.h, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fill();
      text(ctx, k.r.name, k.x + 14, k.y + k.h / 2, { size: 18, align: 'left', maxWidth: k.w - 190 });
      text(ctx, `👥 ${k.r.size}/${SQUAD_MAX}`, k.x + k.w - 100, k.y + k.h / 2, { size: 14, weight: 600, align: 'right', color: DIM });
      this.joinBtns[i].draw(ctx);
    });
  }

  renderSquad(ctx, view, s) {
    text(ctx, s.name, view.w / 2, 40, { size: 34, color: '#ffb400', shadow: true, maxWidth: view.w - 2 * (Math.max(this.inviteBtn.w, this.leaveBtn.w) + 40) });
    const leader = s.members.find((m) => m.leader);
    text(ctx, `${s.size}/${SQUAD_MAX} members${leader ? ` · led by ${leader.name}` : ''}`, view.w / 2, 72, { size: 15, weight: 600, color: DIM, maxWidth: view.w - 40 });
    this.inviteBtn.draw(ctx);
    this.leaveBtn.draw(ctx);

    const leading = this.leading;
    const { boxes, more } = this.memberGrid(s);
    boxes.forEach(({ m, x, y, w, h }) => {
      roundRect(ctx, x, y, w, h, 10);
      ctx.fillStyle = m.me ? 'rgba(255,180,0,0.18)' : 'rgba(255,255,255,0.07)';
      ctx.fill();
      if (m.me) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffb400';
        ctx.stroke();
      }
      const kickable = leading && !m.me;
      text(ctx, `${m.leader ? '👑 ' : ''}${m.name}${m.me ? ' (you)' : ''}`, x + 12, y + h / 2, { size: 16, weight: m.me ? 800 : 600, align: 'left', color: m.me ? '#ffd35c' : '#fff', maxWidth: w - (kickable ? 44 : 20) });
      if (kickable) text(ctx, '✕', x + w - 18, y + h / 2, { size: 15, color: DIM });
    });
    if (more) text(ctx, `+${more.n} more`, more.x + 12, more.y + more.h / 2, { size: 16, align: 'left', color: DIM });
    this.renderPractice(ctx, view);
    const elsewhere = this.invite && this.invite.key !== s.key ? { text: `You’re invited to ${this.invite.name}. Leave ${s.name} to join it.`, color: WARN } : null;
    const hint = this.status ?? elsewhere;
    if (hint) text(ctx, hint.text, view.w / 2, this.bottom - 16, { size: 14, weight: 500, color: hint.color, maxWidth: view.w - 40 });
    if (this.picking) this.renderPicker(ctx, view);
  }

  /** The Practice button and, beside it, the rooms your squadmates have open. */
  renderPractice(ctx, view) {
    this.meetBtn.draw(ctx);
    this.practiceBtn.draw(ctx);
    if (!this.roomBoxes.length) return;
    const pulse = 0.55 + 0.45 * Math.sin(this.age * 4);
    this.roomBoxes.forEach((k, i) => {
      const r = k.r;
      roundRect(ctx, k.x, k.y, k.w, k.h, 12);
      ctx.fillStyle = 'rgba(255,180,0,0.16)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = r.full && !r.mine ? 'rgba(255,180,0,0.4)' : `rgba(255,180,0,${pulse.toFixed(2)})`;
      ctx.stroke();
      const tw = k.w - 76 - 30;
      const who = r.mine ? 'You’re in' : r.players.length > 1 ? `${r.host} +${r.players.length - 1}` : r.host;
      text(ctx, `⚔ ${who}`, k.x + 12, k.y + 24, { size: 17, align: 'left', color: '#ffd35c', maxWidth: tw });
      text(ctx, `${kindName(r.kind)} · ${r.players.length}/${MAX_PLAYERS}`, k.x + 12, k.y + 50, { size: 14, weight: 600, align: 'left', color: 'rgba(255,255,255,0.8)', maxWidth: tw });
      this.roomBtns[i].draw(ctx);
    });
    const more = this.rooms.length - this.roomBoxes.length;
    if (more > 0) text(ctx, `+${more} more`, this.x0 + this.contentW, this.practiceY - 10, { size: 13, weight: 700, align: 'right', color: DIM });
  }

  /** Practice's events, over the tab. */
  renderPicker(ctx, view) {
    ctx.fillStyle = 'rgba(4,8,20,0.72)';
    ctx.fillRect(0, 0, view.w, this.bottom);
    const k = this.pickCard;
    roundRect(ctx, k.x, k.y, k.w, k.h, 18);
    ctx.fillStyle = 'rgba(14,26,52,0.98)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = GOLD;
    ctx.stroke();
    text(ctx, '⚔ PRACTICE', view.w / 2, k.y + 30, { size: 26, color: GOLD, shadow: true });
    this.pickBtns.forEach((b) => b.draw(ctx));
    this.cancelBtn.draw(ctx);
  }

  /**
   * Where the members go, longest-standing first, in as many columns as fit:
   * { boxes: [{ m, x, y, w, h }], more } (`more`: the "+N more" box, when they don't all fit).
   */
  memberGrid(s) {
    const top = 96;
    const gap = 8;
    const h = 40;
    const cols = Math.max(1, Math.min(5, Math.floor((this.contentW + gap) / (180 + gap))));
    const w = (this.contentW - gap * (cols - 1)) / cols;
    const rows = Math.max(1, Math.floor((this.practiceY - 12 - top + gap) / (h + gap))); // above Practice
    const fits = cols * rows;
    const shown = s.members.length > fits ? s.members.slice(0, fits - 1) : s.members;
    const at = (i) => ({ x: this.x0 + (i % cols) * (w + gap), y: top + Math.floor(i / cols) * (h + gap), w, h });
    const boxes = shown.map((m, i) => ({ m, ...at(i) }));
    const more = shown.length < s.members.length ? { n: s.members.length - shown.length, ...at(shown.length) } : null;
    return { boxes, more };
  }
}

const LIST_Y = 160; // top of the list of squads
const ROW_H = 44;
const ROW_GAP = 8;
const PRACTICE_H = 72; // the Practice button and the open rooms beside it

/** What Practice offers: the five events, the 4x100m relay, and the tournament (no `kind`: Solo or Team, as the Play tab has it). */
const PRACTICE_KINDS = [
  ...EVENTS.map((ev) => ({ kind: ev.id, label: ev.name, sub: FIELD.has(ev.id) ? 'Three rounds' : 'Race', color: '#2bb673' })),
  { kind: 'relay4x100', label: '4×100m Relay', sub: 'Your squad vs a computer squad', color: '#c2337a' },
  { kind: TOURNAMENT_KIND, label: '🏆 Tournament', sub: '5 events', color: '#1f8a58' },
];

/** A practice room's event, by name. */
function kindName(kind) {
  return kind === TOURNAMENT_KIND ? 'Tournament' : (eventById(kind)?.name ?? kind);
}

/** What to say when a squad or the list can't be loaded. */
function loadMessage(e) {
  return e?.status === 403 ? 'Squads aren’t open yet.' : 'Couldn’t reach the server. Check your connection.';
}

/** What to say when starting, joining or leaving a squad didn't work. */
function actMessage(e, name) {
  switch (e?.code ?? e?.message) {
    case 'no-name':
      return { text: 'Pick a username first: your squad shows it.', color: WARN, profile: true };
    case 'in-squad':
      return { text: 'You’re in a squad already.', color: WARN };
    case 'taken':
      return { text: `There’s already a squad called “${name}”. Find it by name to join it.`, color: WARN };
    case 'gone':
      return { text: `${name} has closed.`, color: WARN };
    case 'full':
      return { text: `${name} is full.`, color: WARN };
    case 'not-leader':
      return { text: 'Only the squad’s leader can do that.', color: WARN };
    case 'permission-denied':
      return { text: 'The server didn’t allow that. Squads may not be open yet.', color: WARN };
    default:
      return { text: 'Couldn’t reach the server. Try again.', color: WARN };
  }
}
