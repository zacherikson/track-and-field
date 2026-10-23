import { setPlayerName, cleanName } from '../core/storage.js';
import { connectSDK, claimedUsername, setUsername } from '../online/firebase.js';
import { loadMySquad, loadSquad, joinSquad, leaveSquad, setInvite, SQUAD_MAX } from '../online/squads.js';
import { flow } from '../flow.js';
import { ICONS } from '../core/icons.js';

/**
 * The invite screen: what a squad invite link opens (online/squads.js
 * inviteLink). Who invited you, to which squad and who's in it; your
 * username (pick one, or keep yours); one Join button, which saves the name
 * and joins; then "You're in". An HTML card over the game (a real text box
 * for the name is much nicer on a phone than anything drawn on canvas), like
 * the tuning panel. Styled like the canvas menus (core/ui.js PAL, the two
 * fonts, cut corners, hard lips), with the icons inline as SVG.
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
    const kicker = (words) => `<p class="inv-kicker">${icon('invite')}<span>${words}</span></p>`;
    const btn = (act, label, kind = '') => `<button type="button" class="inv-btn ${kind}" data-act="${act}"${this.busy ? ' disabled' : ''}>${label}</button>`;
    let html;
    switch (this.step) {
      case 'loading':
        html = card(`${kicker(this.from ? `${esc(this.from)} invited you` : 'You’re invited')}<p class="inv-dim">Opening your invite…</p>`);
        break;
      case 'offline':
        html = card(`${kicker('You’re invited')}<p class="inv-dim">Couldn’t load your invite. Check your connection.</p><div class="inv-row">${btn('later', 'Not now', 'inv-plain')}${btn('retry', 'Try again', 'inv-go')}</div>`);
        break;
      case 'gone':
        html = card(`${kicker('You were invited')}<p class="inv-title">${esc(s?.name ?? 'That squad')} has closed</p><p class="inv-dim">You can start your own squad, or find another, on the Squad tab.</p><div class="inv-row">${btn('go', 'Go to the game', 'inv-go')}</div>`);
        break;
      case 'already':
        html = card(`${kicker(this.from ? `${esc(this.from)} invited you` : 'You’re invited')}<p class="inv-title">You’re already in ${esc(s.name)}</p>${members(s)}<div class="inv-row">${btn('go', 'Let’s go', 'inv-go')}</div>`);
        break;
      case 'done':
        html = card(`<p class="inv-big">${icon('check')}</p><p class="inv-title">You’re in ${esc(s.name)}!</p>${members(s)}<div class="inv-row">${btn('go', 'Let’s go', 'inv-go')}</div>`);
        break;
      default: {
        const full = s.size >= SQUAD_MAX;
        const value = typed ?? this.claimed ?? '';
        html = card(`
          ${kicker(this.from ? `${esc(this.from)} invited you to join` : 'You’re invited to join')}
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
  const names = s.members.map((m) => `${m.leader ? icon('captain') : ''}${esc(m.name)}`);
  const shown = names.slice(0, 4).join(', ');
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

/** A core/icons.js icon as inline SVG, in the text's colour. */
const icon = (id) => `<svg class="inv-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="${ICONS[id]}"/></svg>`;

let styled = false;
function injectStyles() {
  if (styled) return;
  styled = true;
  const css = document.createElement('style');
  // PAL in core/ui.js: ink #26224F (lip #17143A), ink2 #3A3577, cream #F5EAD0 (lip #E2D2AE), muted #7A6E55,
  // gold #F2B632, live green #2E8B57 (lip #1F6640). Cut corners and hard lips, no blur, no gradients.
  const cut = (c) => `clip-path: polygon(${c}px 0, calc(100% - ${c}px) 0, 100% ${c}px, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, ${c}px 100%, 0 calc(100% - ${c}px), 0 ${c}px);`;
  css.textContent = `
    .inv { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center;
      padding: max(12px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
      box-sizing: border-box; overflow-y: auto; touch-action: pan-y; background: rgba(23, 20, 58, 0.86);
      font-family: "Barlow Semi Condensed", "Arial Narrow", system-ui, sans-serif; font-weight: 600; color: #26224F; }
    .inv-card { width: 100%; max-width: 460px; margin: auto; box-sizing: border-box; padding: 0 22px 24px; text-align: center;
      background: #F5EAD0; box-shadow: inset 0 -7px 0 #E2D2AE; ${cut(10)} }
    .inv-card p { margin: 0; }
    .inv-icon { width: 1.15em; height: 1.15em; fill: currentColor; vertical-align: -0.2em; margin-right: 0.3em; }
    .inv-kicker { display: flex; align-items: center; justify-content: center; margin: 0 -22px 12px !important; padding: 9px 16px;
      background: #26224F; color: #F5EAD0; font: 900 19px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif;
      letter-spacing: 1.5px; text-transform: uppercase; }
    .inv-kicker .inv-icon { color: #F2B632; }
    .inv-title { margin: 4px 0 2px !important; font: 900 38px/1.05 "Big Shoulders Display", "Arial Narrow", Impact, sans-serif;
      letter-spacing: 1.5px; text-transform: uppercase; color: #26224F; overflow-wrap: anywhere; }
    .inv-big { margin-top: 18px !important; font-size: 56px; line-height: 1; color: #2E8B57; }
    .inv-big .inv-icon { margin: 0; }
    .inv-dim { font-size: 16px; color: #7A6E55; margin-top: 6px !important; }
    .inv-dim .inv-icon { width: 1em; height: 1em; margin-right: 0.15em; color: #26224F; }
    .inv-label { display: block; margin: 14px 0 6px; font: 900 17px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif;
      letter-spacing: 1.5px; text-transform: uppercase; color: #26224F; text-align: left; }
    .inv input { width: 100%; box-sizing: border-box; padding: 10px 12px; font: 700 20px "Barlow Semi Condensed", "Arial Narrow", system-ui, sans-serif;
      color: #26224F; background: #FBF3DF; border: 2px solid #E2D2AE; border-radius: 0; outline: none; ${cut(5)}
      -webkit-user-select: text; user-select: text; touch-action: manipulation; }
    .inv input:focus { border-color: #F2B632; }
    .inv-note { min-height: 18px; margin-top: 6px !important; font-size: 15px; color: #7A6E55; text-align: left; }
    .inv-warn { color: #B9542A; font-weight: 700; }
    .inv-row { display: flex; gap: 10px; margin-top: 16px; }
    .inv-btn { flex: 1; min-height: 52px; padding: 0 14px 5px; border: 0; border-radius: 0; cursor: pointer; touch-action: manipulation;
      font: 900 21px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif; letter-spacing: 1px; text-transform: uppercase;
      color: #F5EAD0; ${cut(6)} }
    .inv-btn:active { padding-bottom: 0; padding-top: 4px; box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.25) !important; }
    .inv-go { flex: 2; background: #2E8B57; box-shadow: inset 0 -5px 0 #1F6640; }
    .inv-plain { background: #3A3577; box-shadow: inset 0 -5px 0 #17143A; }
    .inv-btn:disabled { opacity: 0.6; }
  `;
  document.head.append(css);
}
