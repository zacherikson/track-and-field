import { setPlayerName, cleanName } from '../core/storage.js';
import { connectSDK, claimedUsername, setUsername } from '../online/firebase.js';
import { loadMySquad, loadSquad, joinSquad, leaveSquad, setInvite, SQUAD_MAX } from '../online/squads.js';
import { flow } from '../flow.js';

/**
 * The invite screen: what a squad invite link opens (online/squads.js
 * inviteLink). Who invited you, to which squad and who's in it; your
 * username (pick one, or keep yours); one Join button, which saves the name
 * and joins; then "You're in". An HTML card over the game (a real text box
 * for the name is much nicer on a phone than anything drawn on canvas), like
 * the tuning panel.
 *
 * Not now leaves the invite on the Squad tab, to join from there later.
 */
let screen = null;

/** Opens the invite screen over the game for `invite` ({ key, from }: squads.js takeInviteLink). */
export function openInvite(game, invite) {
  screen?.close();
  screen = new InviteScreen(game, invite);
}

class InviteScreen {
  constructor(game, { key, from }) {
    Object.assign(this, { game, key, from });
    this.step = 'loading'; // loading | invite | done | already | gone | offline
    this.squad = null; // the squad you're invited to (squads.js loadSquad)
    this.mine = null; // the squad you're in now, if any
    this.claimed = null; // your username, if you've picked one
    this.error = null;
    this.busy = false;
    injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'inv';
    this.root.addEventListener('keydown', (e) => {
      e.stopPropagation(); // typing a name doesn't steer the game underneath
      if (e.key === 'Enter' && this.step === 'invite') this.join();
      if (e.key === 'Escape') this.finish();
    });
    this.root.addEventListener('click', (e) => this.onClick(e));
    document.body.append(this.root);
    connectSDK().catch(() => {}); // signs in meanwhile, so Join doesn't wait for it
    this.load();
  }

  load() {
    this.step = 'loading';
    this.render();
    Promise.all([loadSquad(this.key), loadMySquad().catch(() => null), claimedUsername().catch(() => null)])
      .then(([squad, mine, claimed]) => {
        Object.assign(this, { squad, mine, claimed });
        if (!squad) {
          setInvite(null);
          this.step = 'gone';
        } else if (mine?.key === squad.key) {
          setInvite(null);
          this.step = 'already';
        } else this.step = 'invite';
      })
      .catch(() => {
        this.step = 'offline';
      })
      .finally(() => this.render());
  }

  onClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'join') this.join();
    else if (act === 'retry') this.load();
    else if (act === 'go' || act === 'later') this.finish();
  }

  /** Saves your username if it's new, leaves the squad you're in (if any), joins this one. */
  async join() {
    if (this.busy) return;
    const input = this.root.querySelector('input');
    const name = cleanName(input?.value);
    if (!name) {
      this.error = input?.value.trim() ? "Use letters and numbers (spaces and _ . ' - are fine inside)." : 'Pick a username first.';
      this.render();
      input?.focus();
      return;
    }
    this.busy = true;
    this.error = null;
    this.render();
    try {
      if (name !== this.claimed) {
        await setUsername(name);
        setPlayerName(name);
        this.claimed = name;
      }
      if (this.mine) {
        await leaveSquad();
        this.mine = null;
      }
      this.squad = (await joinSquad(this.key)) ?? this.squad;
      setInvite(null);
      this.step = 'done';
    } catch (e) {
      this.error = joinError(e, name, this.squad.name);
      if (e?.code === 'gone') this.step = 'gone';
    } finally {
      this.busy = false;
      this.render();
    }
  }

  /** Off to the game, on the Squad tab (with your squad, or the invite still there to join later). */
  finish() {
    this.close();
    flow.menu(this.game, 'squad');
  }

  close() {
    this.root.remove();
    this.game.input.clear();
    if (screen === this) screen = null;
  }

  render() {
    const typed = this.root.querySelector('input')?.value;
    const s = this.squad;
    const card = (body) => `<div class="inv-card">${body}</div>`;
    const btn = (act, label, kind = '') => `<button type="button" class="inv-btn ${kind}" data-act="${act}"${this.busy ? ' disabled' : ''}>${label}</button>`;
    let html;
    switch (this.step) {
      case 'loading':
        html = card(`<p class="inv-kicker">📨 ${this.from ? `${esc(this.from)} invited you` : 'You’re invited'}</p><p class="inv-dim">Opening your invite…</p>`);
        break;
      case 'offline':
        html = card(`<p class="inv-kicker">📨 You’re invited</p><p class="inv-dim">Couldn’t load your invite. Check your connection.</p><div class="inv-row">${btn('later', 'Not now', 'inv-plain')}${btn('retry', 'Try again', 'inv-go')}</div>`);
        break;
      case 'gone':
        html = card(`<p class="inv-kicker">📨 You were invited</p><p class="inv-title">${esc(s?.name ?? 'That squad')} has closed</p><p class="inv-dim">You can start your own squad, or find another, on the Squad tab.</p><div class="inv-row">${btn('go', 'Go to the game', 'inv-go')}</div>`);
        break;
      case 'already':
        html = card(`<p class="inv-kicker">📨 ${this.from ? `${esc(this.from)} invited you` : 'You’re invited'}</p><p class="inv-title">You’re already in ${esc(s.name)}</p>${members(s)}<div class="inv-row">${btn('go', 'Let’s go', 'inv-go')}</div>`);
        break;
      case 'done':
        html = card(`<p class="inv-big">🎉</p><p class="inv-title">You’re in ${esc(s.name)}!</p>${members(s)}<div class="inv-row">${btn('go', 'Let’s go', 'inv-go')}</div>`);
        break;
      default: {
        const full = s.size >= SQUAD_MAX;
        const value = typed ?? this.claimed ?? '';
        html = card(`
          <p class="inv-kicker">📨 ${this.from ? `${esc(this.from)} invited you to join` : 'You’re invited to join'}</p>
          <p class="inv-title">${esc(s.name)}</p>
          ${members(s)}
          <label class="inv-label" for="inv-name">${this.claimed ? 'Your username' : 'Pick a username'}</label>
          <input id="inv-name" type="text" maxlength="16" autocomplete="nickname" autocapitalize="words" spellcheck="false" enterkeyhint="go"
            placeholder="Your name in the squad" value="${esc(value)}"${this.busy ? ' disabled' : ''}>
          <p class="inv-note">${this.error ? `<span class="inv-warn">${esc(this.error)}</span>` : full ? `<span class="inv-warn">${esc(s.name)} is full.</span>` : this.mine ? `You’ll leave ${esc(this.mine.name)} to join.` : 'This is how your squad sees you.'}</p>
          <div class="inv-row">${btn('later', 'Not now', 'inv-plain')}${full ? '' : btn('join', this.busy ? 'Joining…' : `Join ${esc(s.name)}`, 'inv-go')}</div>`);
      }
    }
    const focused = document.activeElement?.id === 'inv-name';
    this.root.innerHTML = html;
    if (focused) this.root.querySelector('input')?.focus();
  }
}

/** "12/30 members: Zach, Bolt, Flo Jo and 9 more". */
function members(s) {
  const names = s.members.map((m) => `${m.leader ? '👑 ' : ''}${m.name}`);
  const shown = names.slice(0, 4).map(esc).join(', ');
  const rest = names.length > 4 ? ` and ${names.length - 4} more` : '';
  return `<p class="inv-dim">${s.size}/${SQUAD_MAX} members: ${shown}${rest}</p>`;
}

/** What to say when joining didn't work. */
function joinError(e, name, squad) {
  switch (e?.code ?? e?.message) {
    case 'taken':
      return `“${name}” is taken. Try another name.`;
    case 'full':
      return `${squad} is full.`;
    case 'gone':
      return `${squad} has closed.`;
    case 'permission-denied':
      return 'The server didn’t allow that. Try another name.';
    default:
      return 'Couldn’t reach the server. Check your connection and try again.';
  }
}

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let styled = false;
function injectStyles() {
  if (styled) return;
  styled = true;
  const css = document.createElement('style');
  css.textContent = `
    .inv { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center;
      padding: max(12px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
      box-sizing: border-box; overflow-y: auto; touch-action: pan-y; background: rgba(6, 12, 28, 0.82);
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #fff; }
    .inv-card { width: 100%; max-width: 460px; margin: auto; box-sizing: border-box; padding: 16px 22px 18px; text-align: center;
      background: linear-gradient(#1d3a66, #12203a); border: 2px solid #ffb400; border-radius: 18px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5); }
    .inv-card p { margin: 0; }
    .inv-kicker { font-size: 13px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #ffd35c; }
    .inv-title { margin: 4px 0 2px !important; font-size: 30px; font-weight: 800; color: #ffb400; text-shadow: 2px 3px 0 rgba(0, 0, 0, 0.45); overflow-wrap: anywhere; }
    .inv-big { font-size: 34px; line-height: 1.1; }
    .inv-dim { font-size: 14px; color: rgba(255, 255, 255, 0.7); margin-top: 4px !important; }
    .inv-label { display: block; margin: 12px 0 6px; font-size: 13px; font-weight: 700; color: rgba(255, 255, 255, 0.7); text-align: left; }
    .inv input { width: 100%; box-sizing: border-box; padding: 10px 12px; font: 600 18px system-ui, -apple-system, sans-serif; color: #fff;
      background: rgba(255, 255, 255, 0.1); border: 2px solid rgba(255, 255, 255, 0.25); border-radius: 12px; outline: none;
      -webkit-user-select: text; user-select: text; touch-action: manipulation; }
    .inv input:focus { border-color: #ffb400; }
    .inv-note { min-height: 18px; margin-top: 6px !important; font-size: 13px; color: rgba(255, 255, 255, 0.6); text-align: left; }
    .inv-warn { color: #ffb35c; font-weight: 600; }
    .inv-row { display: flex; gap: 10px; margin-top: 14px; }
    .inv-btn { flex: 1; min-height: 48px; padding: 0 14px; border: 0; border-radius: 14px; font: 800 18px system-ui, -apple-system, sans-serif;
      color: #fff; cursor: pointer; touch-action: manipulation; }
    .inv-go { flex: 2; background: #2bb673; }
    .inv-plain { background: rgba(255, 255, 255, 0.15); }
    .inv-btn:disabled { opacity: 0.6; }
  `;
  document.head.append(css);
}
