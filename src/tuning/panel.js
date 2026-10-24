import { GROUPS, PARAMS } from './params.js';
import { DEFAULTS, getParam, setParam, resetParam, resetAll, changes } from './store.js';
import { estimateTime, estimateRivalWin } from './estimate.js';
import { VERSION } from '../version.js';

/**
 * In-game tuning panel: an HTML overlay above the canvas (native sliders are
 * far nicer on a phone than anything drawn on canvas). The Tuning button opens
 * the event list (openTuningPicker); pick an event to play it with a gear
 * (gear.js) that opens this panel with just that event's settings, the game
 * paused underneath. Changes are saved on this device, and "Copy changes" puts
 * a readable summary on the clipboard to paste into a chat.
 */
let root = null;
let onCloseCb = null;
let estimateTimer = 0;

// Show as many decimals as the step has (0.25 -> 2, 0.1 -> 1, 5 -> 0).
const decimals = (p) => (String(Number((p.step * (p.scale ?? 1)).toPrecision(6))).split('.')[1] ?? '').length;
const snap = (p, v) => Number((Math.round(v / p.step) * p.step).toFixed(6));
function fmt(p, v) {
  const shown = (v * (p.scale ?? 1)).toFixed(decimals(p));
  const unit = p.unit ? ` ${p.unit}` : '';
  const kmh = p.kmh ? ` (${(v * 3.6).toFixed(1)} km/h)` : '';
  return `${shown}${unit}${kmh}`;
}
const secs = (t) => (Number.isFinite(t) ? `${t.toFixed(2)}s` : 'never finishes');

/** Open the panel: every setting, or (with `ev`, an event from registry.js) that event's own, then the shared ones. */
export function openTuning(onClose, ev = null) {
  if (!root) build();
  onCloseCb = onClose;
  for (const p of PARAMS) refreshRow(p);
  root.querySelector('.tp-title strong').innerHTML = `${ev ? `Tuning · ${ev.name}` : 'Tuning'} <em class="tp-ver">v${VERSION}</em>`;
  root.querySelector('.tp-title span').textContent = ev ? 'Changes apply straight away (pole and run-up changes from your next attempt) and are saved on this phone.' : 'Changes apply to your next race and are saved on this phone.';
  for (const sec of root.querySelectorAll('.tp-group')) {
    const g = GROUPS[Number(sec.dataset.group)];
    sec.hidden = !!ev && !g.events?.includes(ev.id);
    sec.style.order = ev && g.shared ? 1 : 0; // the event's own settings first
  }
  root.querySelector('.tp-est').hidden = !!ev && ev.id !== 'sprint100' && ev.id !== 'hurdles110';
  root.querySelector('.tp-scroll').scrollTop = 0;
  root.hidden = false;
  // Ignore the rest of the tap that opened the panel (it lands on the overlay).
  root.style.pointerEvents = 'none';
  setTimeout(() => (root.style.pointerEvents = ''), 300);
  scheduleEstimates(0);
}

function close() {
  root.hidden = true;
  onCloseCb?.();
}

function build() {
  injectStyles();
  root = document.createElement('div');
  root.className = 'tp';
  root.hidden = true;
  root.innerHTML = `
    <div class="tp-bar">
      <div class="tp-title">
        <strong>Tuning</strong>
        <span>Changes apply to your next race and are saved on this phone.</span>
      </div>
      <button type="button" class="tp-btn tp-done">Done</button>
    </div>
    <div class="tp-scroll">
      <section class="tp-est" aria-live="polite">
        <h3>With these settings</h3>
        <div class="tp-est-grid">
          <div><span>Casual · 3 hits/s</span><b data-est="3">…</b></div>
          <div><span>Good · 4 hits/s</span><b data-est="4">…</b></div>
          <div><span>Expert · 5 hits/s</span><b data-est="5">…</b></div>
          <div><span>One mistake costs</span><b data-est="miss">…</b></div>
          <div><span>Amateur rivals win in</span><b data-est="rivals">…</b></div>
        </div>
      </section>
      <div class="tp-groups"></div>
      <div class="tp-actions">
        <button type="button" class="tp-btn tp-copy">Copy changes</button>
        <button type="button" class="tp-btn tp-ghost tp-reset-all">Reset all</button>
        <span class="tp-note"></span>
      </div>
      <textarea class="tp-copybox" id="tp-copybox" readonly hidden aria-label="Changes to copy"></textarea>
    </div>`;
  const groups = root.querySelector('.tp-groups');
  for (const [i, g] of GROUPS.entries()) {
    const sec = document.createElement('section');
    sec.className = 'tp-group';
    sec.dataset.group = i;
    sec.innerHTML = `<h3>${g.title}</h3><p class="tp-blurb">${g.blurb}</p><div class="tp-grid"></div>`;
    const grid = sec.querySelector('.tp-grid');
    for (const p of g.params) grid.appendChild(buildRow(p));
    groups.appendChild(sec);
  }
  root.querySelector('.tp-done').addEventListener('click', close);
  root.querySelector('.tp-reset-all').addEventListener('click', () => {
    resetAll();
    for (const p of PARAMS) refreshRow(p);
    note('All settings back to defaults.');
    scheduleEstimates();
  });
  root.querySelector('.tp-copy').addEventListener('click', copyChanges);
  document.body.appendChild(root);
}

function buildRow(p) {
  const id = `tp-${p.path.replace(/\./g, '-')}`;
  const row = document.createElement('div');
  row.className = 'tp-row';
  row.dataset.path = p.path;
  row.innerHTML = `
    <div class="tp-head"><label for="${id}">${p.label}</label><output for="${id}"></output></div>
    <div class="tp-ctl">
      <button type="button" class="tp-step" data-dir="-1" aria-label="Decrease ${p.label}">−</button>
      <input type="range" id="${id}" min="${p.min}" max="${p.max}" step="${p.step}">
      <button type="button" class="tp-step" data-dir="1" aria-label="Increase ${p.label}">+</button>
    </div>
    <div class="tp-foot"><span>${p.help}</span>
      <button type="button" class="tp-reset" aria-label="Reset ${p.label} to default">Default ${fmt(p, DEFAULTS[p.path])} ↺</button>
    </div>`;
  const input = row.querySelector('input');
  input.addEventListener('input', () => update(p, Number(input.value)));
  for (const b of row.querySelectorAll('.tp-step')) {
    b.addEventListener('click', () => update(p, getParam(p.path) + Number(b.dataset.dir) * p.step));
  }
  row.querySelector('.tp-reset').addEventListener('click', () => {
    resetParam(p.path);
    refreshRow(p);
    scheduleEstimates();
  });
  return row;
}

function update(p, value) {
  setParam(p.path, snap(p, Math.min(p.max, Math.max(p.min, value))));
  refreshRow(p);
  scheduleEstimates();
}

function refreshRow(p) {
  const row = root.querySelector(`.tp-row[data-path="${p.path}"]`);
  const v = getParam(p.path);
  row.querySelector('input').value = v;
  row.querySelector('output').textContent = fmt(p, v);
  const changed = v !== DEFAULTS[p.path];
  row.classList.toggle('is-changed', changed);
  row.querySelector('.tp-reset').hidden = !changed;
}

/** Recompute the estimates shortly after the last change (they run real races). */
function scheduleEstimates(delay = 150) {
  clearTimeout(estimateTimer);
  estimateTimer = setTimeout(() => {
    const out = (k, s) => (root.querySelector(`[data-est="${k}"]`).textContent = s);
    for (const rate of [3, 4, 5]) out(rate, secs(estimateTime(rate)));
    const clean = estimateTime(4);
    const withMiss = estimateTime(4, { missAt: 50 });
    out('miss', Number.isFinite(withMiss) ? `+${(withMiss - clean).toFixed(2)}s` : 'the race');
    out('rivals', secs(estimateRivalWin()));
  }, delay);
}

function changesText() {
  const list = changes();
  if (!list.length) return '';
  return [`Track Royale v${VERSION} tuning changes:`, ...list.map(({ param: p, from, to }) => `- ${p.label}: ${fmt(p, from)} → ${fmt(p, to)} (${p.path})`)].join('\n');
}

function copyChanges() {
  const box = root.querySelector('.tp-copybox');
  const text = changesText();
  if (!text) {
    note('Nothing changed yet.');
    box.hidden = true;
    return;
  }
  const showBox = () => {
    box.value = text;
    box.hidden = false;
    box.focus();
    box.select();
    note('Select the text below and copy it.');
  };
  if (!navigator.clipboard?.writeText) return showBox();
  navigator.clipboard.writeText(text).then(() => {
    note('Copied. Paste it into the chat.');
    box.hidden = true;
  }, showBox);
}

/**
 * The Tuning button's first screen: the five events. Picking one calls
 * onPick(ev) (the game plays it with the gear); "All settings" opens the full panel.
 */
let picker = null;
export function openTuningPicker(events, { onPick, onAll, onClose }) {
  if (!root) build();
  picker?.remove();
  picker = document.createElement('div');
  picker.className = 'tp';
  picker.innerHTML = `
    <div class="tp-bar">
      <div class="tp-title"><strong>Tuning <em class="tp-ver">v${VERSION}</em></strong><span>Pick an event to play it. Tap ⚙ in the event to adjust its settings.</span></div>
      <button type="button" class="tp-btn tp-ghost tp-close">Close</button>
    </div>
    <div class="tp-scroll">
      <div class="tp-events"></div>
      <div class="tp-actions"><button type="button" class="tp-btn tp-ghost tp-all">All settings</button></div>
    </div>`;
  const list = picker.querySelector('.tp-events');
  for (const ev of events) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tp-event';
    b.innerHTML = `<b>${ev.name}</b><span>Play ›</span>`;
    b.addEventListener('click', () => done(() => onPick(ev)));
    list.appendChild(b);
  }
  const done = (then) => {
    picker.remove();
    picker = null;
    then?.();
  };
  picker.querySelector('.tp-close').addEventListener('click', () => done(onClose));
  picker.querySelector('.tp-all').addEventListener('click', () => done(onAll));
  // Ignore the rest of the tap that opened it.
  picker.style.pointerEvents = 'none';
  setTimeout(() => picker && (picker.style.pointerEvents = ''), 300);
  document.body.appendChild(picker);
}

function note(msg) {
  root.querySelector('.tp-note').textContent = msg;
}

function injectStyles() {
  const css = `
  .tp { position: fixed; inset: 0; z-index: 10; display: flex; flex-direction: column;
    background: rgba(9, 17, 33, 0.97); color: #eef3ff;
    font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) 0 env(safe-area-inset-left, 0px); }
  .tp[hidden] { display: none; }
  .tp-bar { display: flex; align-items: center; gap: 16px; padding: 10px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.12); }
  .tp-title { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .tp-title strong { font-size: 18px; color: #ffb400; letter-spacing: 0.02em; }
  .tp-title span { font-size: 12px; color: #a9b8d6; }
  .tp-ver { font-style: normal; font-size: 12px; font-weight: 600; color: #a9b8d6; margin-left: 6px; letter-spacing: 0; }
  .tp-scroll { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; touch-action: pan-y;
    padding: 12px 16px calc(24px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; gap: 18px; }
  .tp h3 { margin: 0 0 4px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #ffb400; }
  .tp-blurb { margin: 0 0 10px; color: #a9b8d6; font-size: 12.5px; max-width: 70ch; }
  .tp-est { background: rgba(57, 230, 38, 0.08); border: 1px solid rgba(57, 230, 38, 0.3); border-radius: 12px; padding: 10px 12px; }
  .tp-est-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px 16px; }
  .tp-est-grid div { display: flex; flex-direction: column; }
  .tp-est-grid span { font-size: 12px; color: #a9b8d6; }
  .tp-est-grid b { font-size: 20px; font-variant-numeric: tabular-nums; }
  .tp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 10px; }
  .tp-row { background: rgba(255,255,255,0.05); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
  .tp-row.is-changed { box-shadow: inset 0 0 0 2px rgba(57, 230, 38, 0.55); }
  .tp-head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
  .tp-head label { font-weight: 600; }
  .tp-head output { font-variant-numeric: tabular-nums; font-weight: 700; white-space: nowrap; }
  .tp-row.is-changed output { color: #7dff66; }
  .tp-ctl { display: flex; align-items: center; gap: 10px; }
  .tp-ctl input { flex: 1; min-width: 0; height: 36px; accent-color: #39e626; touch-action: none; }
  .tp-step { width: 40px; height: 40px; flex: none; border-radius: 10px; border: 0; font-size: 22px; line-height: 1;
    background: rgba(255,255,255,0.12); color: #fff; touch-action: manipulation; }
  .tp-foot { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; font-size: 12px; color: #a9b8d6; }
  .tp-reset { flex: none; border: 0; background: none; color: #7dff66; font-size: 12px; padding: 2px 0; text-decoration: underline; }
  .tp-reset[hidden] { display: none; }
  .tp-groups { display: flex; flex-direction: column; gap: 18px; }
  .tp-group[hidden], .tp-est[hidden] { display: none; }
  .tp-events { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
  .tp-event { display: flex; justify-content: space-between; align-items: center; gap: 10px; border: 0; border-radius: 12px;
    padding: 18px 16px; background: rgba(255,255,255,0.08); color: #eef3ff; font: 600 17px system-ui, -apple-system, sans-serif;
    text-align: left; touch-action: manipulation; }
  .tp-event span { color: #7dff66; font-size: 14px; }
  .tp-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .tp-btn { border: 0; border-radius: 10px; padding: 10px 18px; font: 600 15px system-ui, -apple-system, sans-serif;
    background: #39e626; color: #06240b; touch-action: manipulation; }
  .tp-ghost { background: rgba(255,255,255,0.14); color: #fff; }
  .tp-note { color: #a9b8d6; font-size: 13px; }
  .tp-copybox { width: 100%; min-height: 120px; box-sizing: border-box; border-radius: 10px; border: 1px solid rgba(255,255,255,0.2);
    background: #0d1830; color: #eef3ff; font: 12px ui-monospace, Menlo, monospace; padding: 8px;
    -webkit-user-select: text; user-select: text; }
  .tp button:focus-visible, .tp input:focus-visible, .tp textarea:focus-visible { outline: 2px solid #ffb400; outline-offset: 2px; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}
