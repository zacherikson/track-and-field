import { getMusicOn, getSoundOn, setMusicOn as saveMusicOn, setSoundOn as saveSoundOn } from './storage.js';

/**
 * The game's sound: music in the menus, the stadium crowd during an event, and
 * one-off cues (the starting gun, a cheer, applause, a groan).
 *
 * Each sound is either a recording (RECORDINGS, files in audio/) or made right
 * here with the Web Audio API (noise shaped into a crowd, a short synth loop
 * for the music). A recording that won't load falls back to the made sound.
 *
 * HOW IT FITS IN
 *   - Game.setScene calls scene(): a scene with an event (`scene.ev`) is in the
 *     stadium (the crowd), anything else is a menu (the music). A scene with
 *     results gets applause as it opens.
 *   - Each event's setState calls onState(): the crowd goes quiet at SET, the
 *     gun fires at GO, a cheer at the line or the landing, a groan at a foul.
 *   - The 100m and hurdles call heat() as the race goes: the crowd gets louder
 *     the nearer you are to the line.
 *
 * PHONES: nothing can play until the player touches the screen (iOS and
 * Chrome both insist), so init() listens for the first touch, click or key
 * and starts the sound then. The audio session is 'ambient' where the browser
 * lets us say so: the ring/silent switch mutes the game, and music the player
 * is already playing keeps going under it.
 *
 * Safe to import in Node (the tests): with no AudioContext every call does nothing.
 */

// A recording to play instead of the made sound: a path from the site root (e.g. 'audio/crowd.m4a'), or null.
// crowd.m4a and cheer.m4a: "Crowd Cheering in Stadium" by vishiv (Pixabay, free to use): its first 7 s, and its swell (8.3-14.3 s, faded in and out).
export const RECORDINGS = { music: null, crowd: 'audio/crowd.m4a', gun: null, cheer: 'audio/cheer.m4a', applause: null, groan: null };

// A recorded loop that doesn't join up by itself: its last this-many seconds are faded into its start.
const SEAM = { crowd: 1 };

// How loud each part plays, at most (0..1).
const LEVEL = { music: 0.3, crowd: 0.55, cues: 0.8 };

// Every sound, made or recorded, is levelled to these first, so they sit right against each other:
// a loop by its average loudness (RMS), a one-off by its loudest moment (the loudest 50 ms).
const LOUDNESS = { music: 0.15, crowd: 0.13, gun: 0.4, cheer: 0.2, applause: 0.2, groan: 0.15 };

// The crowd's level (0..1 of LEVEL.crowd) through an event.
const CROWD = { idle: 0.45, hush: 0.1, race: 0.6, peak: 1 };

let ctx = null; // the AudioContext, made on the first touch
let bus = null; // { music, crowd, cues }: a gain each, into the master
const buffers = {}; // name -> AudioBuffer, once made or loaded
let making = null; // the promise making them
let mood = 'menu'; // 'menu' (music) | 'stadium' (the crowd)
let crowdLevel = 0; // what the crowd is heading for now (0..1)
let lastHeat = -1;
const loops = {}; // 'music' | 'crowd' -> { src, gain, stopTimer }

const canPlay = () => typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);

/** Starts making the sounds and waits for the first touch. Call once, at boot. */
export function init() {
  if (!canPlay()) return;
  for (const type of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(type, unlock, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.visibilityState === 'hidden') ctx.suspend();
    else ctx.resume();
  });
  // Made in the background (an offline render each), a moment after the first frame.
  setTimeout(() => prepare(), 400);
}

/** Every touch: make the AudioContext the first time, and wake it if the phone put it to sleep. */
function unlock() {
  if (!ctx) {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'ambient';
    } catch {
      /* not settable here */
    }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.connect(ctx.destination);
    bus = { music: ctx.createGain(), crowd: ctx.createGain(), cues: ctx.createGain() };
    for (const g of Object.values(bus)) g.connect(master);
    applySettings(0);
    prepare().then(() => applyMood());
  }
  if (ctx.state !== 'running') ctx.resume();
}

function prepare() {
  if (!canPlay()) return Promise.resolve();
  // One at a time (the music first: the menus want it soonest), a frame apart, so the game never stalls for long.
  making ??= (async () => {
    for (const [name, make] of Object.entries(MAKERS)) {
      try {
        let buf = null;
        if (RECORDINGS[name]) {
          buf = await load(RECORDINGS[name]).catch((e) => console.warn(`recording "${name}" not loaded, making it instead`, e));
          if (buf && SEAM[name]) buf = loopable(buf, SEAM[name]);
        }
        buffers[name] = level(buf ?? (await make()), LOUDNESS[name], name === 'music' || name === 'crowd');
      } catch (e) {
        console.warn(`sound "${name}" not made`, e);
      }
      applyMood(); // play it as soon as it's here
      await new Promise((r) => setTimeout(r, 30));
    }
  })();
  return making;
}

async function load(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const data = await res.arrayBuffer();
  // Any context can decode; an offline one works before the first touch.
  const dc = ctx ?? new OfflineAudioContext(2, 1, SR);
  return dc.decodeAudioData(data);
}

// ---------------------------------------------------------------- what the game calls

/** A new scene: music in the menus, the crowd in the stadium, applause for results. */
export function scene(sc) {
  mood = sc?.ev ? 'stadium' : 'menu';
  if (mood === 'stadium' && crowdLevel === 0) crowdLevel = CROWD.idle;
  if (mood === 'menu') crowdLevel = 0;
  lastHeat = -1;
  applyMood();
  if (sc?.results) cue('applause', 0.7);
}

/** An event changed state (`mark`: its result so far, if it has one: a foul, a failed vault or a race out of time groans). */
export function onState(state, mark = null) {
  const bad = !!(mark?.foul || mark?.fail);
  switch (state) {
    case 'ready':
    case 'waiting':
      return crowd(CROWD.idle, 1.2);
    case 'set':
    case 'count':
      return crowd(CROWD.hush, 0.5); // the hush before the gun
    case 'race':
    case 'ride':
      cue('gun', 0.6);
      return crowd(CROWD.race, 0.3);
    case 'run':
      return crowd(CROWD.race, 1.5); // the run-up: building
    case 'throw':
    case 'air':
    case 'vault':
      return crowd(0.85, 0.4);
    case 'finished':
      cue(bad ? 'groan' : 'cheer');
      return crowd(CROWD.race, 2.5);
    case 'landed':
      cue(bad ? 'groan' : 'cheer');
      return crowd(CROWD.idle, 3);
    case 'overrun':
    case 'balk':
      cue('groan');
      return crowd(CROWD.idle, 3);
    case 'mark':
      return crowd(CROWD.idle, 2);
  }
}

/** How exciting the race is now, 0..1 (how near the line): the crowd follows. */
export function heat(k) {
  k = Math.max(0, Math.min(1, k));
  if (Math.abs(k - lastHeat) < 0.04) return;
  lastHeat = k;
  crowd(CROWD.race + (CROWD.peak - CROWD.race) * k * k, 0.4);
}

/** Plays a one-off sound (`vol` 0..1). */
export function cue(name, vol = 1) {
  if (!ctx || !buffers[name] || ctx.state !== 'running') return;
  const src = ctx.createBufferSource();
  src.buffer = buffers[name];
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(bus.cues);
  src.start();
}

export const musicOn = () => getMusicOn();
export const soundOn = () => getSoundOn();

export function setMusicOn(on) {
  saveMusicOn(on);
  applySettings();
}

export function setSoundOn(on) {
  saveSoundOn(on);
  applySettings();
}

// ---------------------------------------------------------------- playing

function applySettings(secs = 0.3) {
  if (!ctx) return;
  const now = ctx.currentTime;
  const set = (g, v) => g.gain.setTargetAtTime(v, now, Math.max(0.001, secs / 3));
  set(bus.music, getMusicOn() ? LEVEL.music : 0);
  set(bus.crowd, getSoundOn() ? LEVEL.crowd : 0);
  set(bus.cues, getSoundOn() ? LEVEL.cues : 0);
}

function applyMood() {
  if (!ctx) return;
  fadeLoop('music', 'music', mood === 'menu' ? 1 : 0, mood === 'menu' ? 1.5 : 0.8);
  fadeLoop('crowd', 'crowd', mood === 'stadium' ? crowdLevel : 0, 1);
}

/** The crowd heads for `level` (0..1) over about `secs`. */
function crowd(level, secs) {
  if (mood !== 'stadium') return;
  crowdLevel = level;
  fadeLoop('crowd', 'crowd', level, secs);
}

/** A looping sound (started if it isn't playing) heads for `level`; one faded right out stops. */
function fadeLoop(name, busName, level, secs) {
  if (!ctx || !buffers[name]) return;
  let l = loops[name];
  if (!l && level > 0) {
    const src = ctx.createBufferSource();
    src.buffer = buffers[name];
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(bus[busName]);
    src.start(0, name === 'crowd' ? Math.random() * buffers[name].duration : 0);
    l = loops[name] = { src, gain, stopTimer: null };
  }
  if (!l) return;
  clearTimeout(l.stopTimer);
  l.gain.gain.setTargetAtTime(level, ctx.currentTime, Math.max(0.01, secs / 3));
  if (level === 0) {
    l.stopTimer = setTimeout(() => {
      l.src.stop();
      if (loops[name] === l) delete loops[name];
    }, secs * 2000 + 200);
  }
}

// ---------------------------------------------------------------- making the sounds

/** Scales `buf` (in place) to `target` loudness: its average RMS if `loop`, else its loudest 50 ms. Never past clipping. */
function level(buf, target, loop) {
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const win = 2048;
  let total = 0;
  let loudest = 0;
  let peak = 0;
  for (let i0 = 0; i0 < buf.length; i0 += win) {
    let sum = 0;
    const n = Math.min(win, buf.length - i0);
    for (const d of chans) {
      for (let i = i0; i < i0 + n; i++) {
        sum += d[i] * d[i];
        peak = Math.max(peak, Math.abs(d[i]));
      }
    }
    total += sum;
    loudest = Math.max(loudest, Math.sqrt(sum / (n * chans.length)));
  }
  const now = loop ? Math.sqrt(total / (buf.length * chans.length)) : loudest;
  if (!now) return buf;
  const k = Math.min(target / now, 0.98 / peak);
  for (const d of chans) for (let i = 0; i < d.length; i++) d[i] *= k;
  return buf;
}

const SR = 44100;
const rnd = (a, b) => a + Math.random() * (b - a);
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

const MAKERS = { music: makeMusic, crowd: makeCrowd, gun: makeGun, cheer: makeCheer, applause: makeApplause, groan: makeGroan };

/** Renders `secs` of stereo sound: `build(oc, out)` wires it up. */
function render(secs, build) {
  const oc = new OfflineAudioContext(2, Math.ceil(secs * SR), SR);
  build(oc, oc.destination);
  return oc.startRendering();
}

/** `secs` of noise: white, or pink (softer, more like a crowd). */
function noise(oc, secs, pink = false) {
  const buf = oc.createBuffer(1, Math.ceil(secs * SR), SR);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (!pink) {
      d[i] = w;
      continue;
    }
    // Paul Kellet's cheap pink filter.
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
  }
  return buf;
}

function source(oc, buf, loop = true) {
  const s = oc.createBufferSource();
  s.buffer = buf;
  s.loop = loop;
  return s;
}

/** A room: decaying stereo noise as the impulse response (`secs` long). */
function room(oc, secs, decay = 3) {
  const len = Math.ceil(secs * SR);
  const ir = oc.createBuffer(2, len, SR);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  const conv = oc.createConvolver();
  conv.buffer = ir;
  return conv;
}

/** `out` plus a reverb send of `wet`: returns the node to feed. */
function withRoom(oc, out, secs, wet) {
  const input = oc.createGain();
  const r = room(oc, secs);
  const send = oc.createGain();
  send.gain.value = wet;
  input.connect(out);
  input.connect(send).connect(r).connect(out);
  return input;
}

/** The last `fade` s mixed into the start and cut off: the ends join without a seam. */
function loopable(buf, fade) {
  const n = Math.floor(fade * buf.sampleRate);
  const len = buf.length - n;
  const out = new AudioBuffer({ length: len, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const a = buf.getChannelData(c);
    const o = out.getChannelData(c);
    o.set(a.subarray(0, len));
    for (let i = 0; i < n; i++) {
      const k = i / n;
      o[i] = a[i] * Math.sqrt(k) + a[len + i] * Math.sqrt(1 - k);
    }
  }
  return out;
}

/**
 * Many voices talking at once: noise through a vowel-ish band per voice, each
 * opening and closing like syllables. `rate` > 1 is livelier (shouting);
 * `env(t)` scales them all over time (a cheer's swell).
 */
function voices(oc, out, { secs, n, lo, hi, rate = 1, level, env = () => 1, glide = 0 }) {
  const buf = noise(oc, 3);
  for (let i = 0; i < n; i++) {
    const src = source(oc, buf);
    const bp = oc.createBiquadFilter();
    bp.type = 'bandpass';
    const f0 = lo * (hi / lo) ** Math.random();
    bp.frequency.value = f0;
    bp.Q.value = rnd(2, 6);
    const g = oc.createGain();
    g.gain.value = 0;
    const pan = oc.createStereoPanner();
    pan.pan.value = rnd(-0.9, 0.9);
    src.connect(bp).connect(g).connect(pan).connect(out);
    src.start(0, rnd(0, 2.9));
    let t = rnd(0, 0.4);
    while (t < secs) {
      const len = rnd(0.08, 0.32) / rate;
      g.gain.setTargetAtTime(level * rnd(0.3, 1) * env(t), t, len * 0.25);
      g.gain.setTargetAtTime(level * 0.04 * env(t), t + len, len * 0.3);
      bp.frequency.setTargetAtTime(f0 * rnd(0.8, 1.25) * (1 - glide * (t / secs)), t, len * 0.5);
      t += len + rnd(0, 0.15) / rate;
    }
  }
}

/** The stadium: a wash of far-off noise and a crowd talking, ~20 s, looping. */
async function makeCrowd() {
  const secs = 22;
  const buf = await render(secs, (oc, dest) => {
    const out = withRoom(oc, dest, 2.5, 0.5);
    const wash = source(oc, noise(oc, 4, true));
    const lp = oc.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = oc.createGain();
    g.gain.value = 0.5;
    wash.connect(lp).connect(g).connect(out);
    wash.start();
    voices(oc, out, { secs, n: 22, lo: 350, hi: 2600, level: 0.22 });
  });
  return loopable(buf, 2);
}

/** A cheer: the crowd jumps up, shouting, then dies away (~4 s). */
function makeCheer() {
  const secs = 4.5;
  const env = (t) => (t < 0.25 ? t / 0.25 : t < 1.2 ? 1 : Math.max(0, 1 - (t - 1.2) / 3));
  return render(secs, (oc, dest) => {
    const out = withRoom(oc, dest, 2.5, 0.45);
    const wash = source(oc, noise(oc, 4, true));
    const lp = oc.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, 0);
    lp.frequency.linearRampToValueAtTime(3200, 0.3);
    lp.frequency.linearRampToValueAtTime(1500, secs);
    const g = oc.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(0.9, 0.25);
    g.gain.setValueAtTime(0.9, 1.2);
    g.gain.linearRampToValueAtTime(0, secs);
    wash.connect(lp).connect(g).connect(out);
    wash.start();
    voices(oc, out, { secs, n: 34, lo: 600, hi: 3500, rate: 2.2, level: 0.3, env });
    // A few "woo"s over the top.
    for (let i = 0; i < 4; i++) {
      const t0 = rnd(0.1, 0.9);
      const o = oc.createOscillator();
      const f = rnd(900, 1500);
      o.frequency.setValueAtTime(f, t0);
      o.frequency.exponentialRampToValueAtTime(f * 1.6, t0 + 0.25);
      o.frequency.exponentialRampToValueAtTime(f * 1.2, t0 + 0.9);
      const og = oc.createGain();
      og.gain.setValueAtTime(0, t0);
      og.gain.linearRampToValueAtTime(0.04, t0 + 0.1);
      og.gain.linearRampToValueAtTime(0, t0 + 0.9);
      const pan = oc.createStereoPanner();
      pan.pan.value = rnd(-0.7, 0.7);
      o.connect(og).connect(pan).connect(out);
      o.start(t0);
      o.stop(t0 + 1);
    }
  });
}

/** Applause: a few hundred claps, quickly building, then thinning out (~4 s). */
function makeApplause() {
  const secs = 4.5;
  // The claps are written straight into a buffer (cheaper than a node each), then put in the stadium.
  const len = Math.ceil(secs * SR);
  const dry = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: SR });
  const L = dry.getChannelData(0);
  const R = dry.getChannelData(1);
  const people = 60;
  for (let p = 0; p < people; p++) {
    const pan = Math.random();
    const gap = rnd(0.16, 0.26); // each person claps at their own pace
    const tone = rnd(0.3, 0.8); // and their own sound (a one-pole high-pass)
    const loud = rnd(0.3, 1);
    const stop = rnd(1.8, 4.2);
    for (let t = rnd(0, 0.35); t < stop; t += gap * rnd(0.9, 1.1)) {
      const fade = t < 0.3 ? t / 0.3 : Math.max(0, 1 - (t - 1.5) / (stop - 1.5)) ** 0.7;
      const amp = 0.12 * loud * (t > 1.5 ? fade : Math.min(1, fade));
      const i0 = Math.floor(t * SR);
      let prev = 0;
      for (let i = 0; i < 0.03 * SR && i0 + i < len; i++) {
        const w = (Math.random() * 2 - 1) * Math.exp(-i / (0.005 * SR));
        const s = w - tone * prev;
        prev = w;
        L[i0 + i] += s * amp * (1 - pan);
        R[i0 + i] += s * amp * pan;
      }
    }
  }
  return render(secs + 1, (oc, dest) => {
    const out = withRoom(oc, dest, 1.8, 0.4);
    const src = source(oc, dry, false);
    const bp = oc.createBiquadFilter();
    bp.type = 'peaking';
    bp.frequency.value = 1800;
    bp.gain.value = 4;
    src.connect(bp).connect(out);
    src.start();
  });
}

/** "Awww": voices sliding down through an "aw" sound (~2.5 s). */
function makeGroan() {
  const secs = 3;
  return render(secs, (oc, dest) => {
    const out = withRoom(oc, dest, 2.2, 0.5);
    // Two vowel bands, the "aw".
    const vowel = oc.createGain();
    for (const [f, q, g] of [[650, 5, 1], [1050, 6, 0.6]]) {
      const bp = oc.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const bg = oc.createGain();
      bg.gain.value = g;
      vowel.connect(bp).connect(bg).connect(out);
    }
    const env = oc.createGain();
    env.gain.setValueAtTime(0, 0);
    env.gain.linearRampToValueAtTime(0.5, 0.35);
    env.gain.setValueAtTime(0.5, 0.9);
    env.gain.linearRampToValueAtTime(0, 2.6);
    env.connect(vowel);
    for (let i = 0; i < 24; i++) {
      const o = oc.createOscillator();
      o.type = 'sawtooth';
      const f = rnd(130, 270);
      o.frequency.setValueAtTime(f, 0);
      o.frequency.exponentialRampToValueAtTime(f * rnd(0.72, 0.85), 2.4);
      const og = oc.createGain();
      og.gain.value = 0.05;
      o.connect(og).connect(env);
      o.start(rnd(0, 0.15));
      o.stop(secs);
    }
    voices(oc, out, { secs: 2.5, n: 12, lo: 400, hi: 1200, rate: 0.7, level: 0.12, glide: 0.3, env: (t) => Math.max(0, 1 - t / 2.5) });
  });
}

/** The starting gun: a crack, a thump, and the stands throwing it back. */
function makeGun() {
  const secs = 2.2;
  return render(secs, (oc, dest) => {
    const out = withRoom(oc, dest, 1.8, 0.55);
    // One echo off the far stand.
    const echo = oc.createDelay(1);
    echo.delayTime.value = 0.3;
    const eg = oc.createGain();
    eg.gain.value = 0.22;
    out.connect(echo).connect(eg).connect(dest);
    // Soft-clipped, like a real bang overloading a little.
    const clip = oc.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(3 * ((i / (curve.length - 1)) * 2 - 1));
    clip.curve = curve;
    clip.connect(out);
    const crack = source(oc, noise(oc, 0.4), false);
    const hp = oc.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 350;
    const cg = oc.createGain();
    cg.gain.setValueAtTime(1, 0);
    cg.gain.setTargetAtTime(0, 0.004, 0.025);
    crack.connect(hp).connect(cg).connect(clip);
    crack.start();
    const thump = oc.createOscillator();
    thump.frequency.setValueAtTime(160, 0);
    thump.frequency.exponentialRampToValueAtTime(45, 0.1);
    const tg = oc.createGain();
    tg.gain.setValueAtTime(0.9, 0);
    tg.gain.setTargetAtTime(0, 0.01, 0.05);
    thump.connect(tg).connect(clip);
    thump.start();
    thump.stop(0.4);
  });
}

// ---------------------------------------------------------------- the menu music

// A bright 8-bar loop in D major: D Bm G A, twice. 116 bpm, in 16th-note steps.
const BPM = 116;
const STEP = 60 / BPM / 4;
const BARS = 8;
const CHORDS = [
  [62, 66, 69], // D
  [59, 62, 66], // Bm
  [55, 59, 62], // G
  [57, 61, 64], // A
];
const ROOTS = [38, 35, 43, 45]; // the bass's D, B, G, A
const BASS = [0, 0, 12, 0, 0, 7, 12, 7]; // its 8th notes, semitones over the root
// The tune: [step, midi note, steps long] for each bar.
const TUNE = [
  [[0, 74, 2], [2, 73, 2], [4, 74, 2], [6, 69, 4], [12, 66, 2], [14, 69, 2]],
  [[0, 71, 3], [3, 69, 1], [4, 71, 2], [6, 74, 4], [12, 73, 2], [14, 71, 2]],
  [[0, 67, 2], [2, 69, 2], [4, 71, 2], [6, 74, 2], [8, 76, 4], [14, 74, 2]],
  [[0, 73, 4], [4, 69, 2], [6, 71, 2], [8, 73, 6]],
  [[0, 74, 2], [2, 73, 2], [4, 74, 2], [6, 69, 4], [12, 66, 2], [14, 69, 2]],
  [[0, 71, 3], [3, 69, 1], [4, 71, 2], [6, 74, 4], [12, 76, 2], [14, 78, 2]],
  [[0, 79, 2], [2, 78, 2], [4, 76, 2], [6, 74, 2], [8, 76, 4], [14, 74, 2]],
  [[0, 76, 2], [2, 74, 2], [4, 73, 2], [6, 71, 2], [8, 69, 4], [12, 73, 2], [14, 76, 2]],
];

/** The menu music: the loop played twice and the second time kept, so the echoes carry over the seam. */
async function makeMusic() {
  const loopSecs = BARS * 16 * STEP;
  const buf = await render(loopSecs * 2 + 0.5, (oc, dest) => {
    const out = oc.createGain();
    out.gain.value = 0.9;
    out.connect(dest);
    const hiss = noise(oc, 1);
    // The tune's echo: dotted 8th, a little to one side.
    const echo = oc.createDelay(1);
    echo.delayTime.value = STEP * 3;
    const fb = oc.createGain();
    fb.gain.value = 0.28;
    const ep = oc.createStereoPanner();
    ep.pan.value = 0.35;
    echo.connect(fb).connect(echo);
    echo.connect(ep).connect(out);
    for (let rep = 0; rep < 2; rep++) {
      for (let bar = 0; bar < BARS; bar++) {
        const t0 = (rep * BARS + bar) * 16 * STEP;
        const c = bar % 4;
        // Drums: four on the floor, a clap on 2 and 4, 8th-note hats (an open one closing every other bar).
        for (const s of [0, 4, 8, 12]) kick(oc, out, t0 + s * STEP);
        for (const s of [4, 12]) clap(oc, out, hiss, t0 + s * STEP);
        for (let s = 0; s < 16; s += 2) hat(oc, out, hiss, t0 + s * STEP, s % 4 === 2 ? 0.09 : 0.05, bar % 2 && s === 14 ? 0.18 : 0.035);
        // Bass.
        BASS.forEach((o, i) => tone(oc, out, 'square', midiHz(ROOTS[c] + o), t0 + i * 2 * STEP, STEP * 1.6, 0.11, 700));
        // Chords: soft stabs on the off-beats.
        for (const s of [2, 6, 10, 14]) for (const m of CHORDS[c]) tone(oc, out, 'sawtooth', midiHz(m), t0 + s * STEP, STEP * 1.2, 0.028, 2200);
        // The tune, with its echo.
        for (const [s, m, n] of TUNE[bar]) {
          const g = tone(oc, out, 'square', midiHz(m), t0 + s * STEP, STEP * n * 0.92, 0.06, 3200);
          g.connect(echo);
        }
      }
    }
  });
  // Keep the second time round.
  const start = Math.round(loopSecs * SR);
  const len = Math.round(loopSecs * SR);
  const out = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: SR });
  for (let c = 0; c < 2; c++) out.getChannelData(c).set(buf.getChannelData(c).subarray(start, start + len));
  return out;
}

/** One note: an oscillator through a low-pass, with a quick attack and release. Returns its gain (to send on). */
function tone(oc, out, type, hz, t, dur, vol, cutoff) {
  const o = oc.createOscillator();
  o.type = type;
  o.frequency.value = hz;
  const lp = oc.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;
  const g = oc.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.006);
  g.gain.setValueAtTime(vol, t + dur);
  g.gain.linearRampToValueAtTime(0, t + dur + 0.06);
  o.connect(lp).connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.1);
  return g;
}

function kick(oc, out, t) {
  const o = oc.createOscillator();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
  const g = oc.createGain();
  g.gain.setValueAtTime(0.55, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.3);
}

function clap(oc, out, hiss, t) {
  const s = source(oc, hiss, false);
  const bp = oc.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1700;
  bp.Q.value = 0.9;
  const g = oc.createGain();
  g.gain.setValueAtTime(0.28, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  s.connect(bp).connect(g).connect(out);
  s.start(t, Math.random() * 0.5);
  s.stop(t + 0.2);
}

function hat(oc, out, hiss, t, vol, decay) {
  const s = source(oc, hiss, false);
  const hp = oc.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7500;
  const g = oc.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay * 3);
  s.connect(hp).connect(g).connect(out);
  s.start(t, Math.random() * 0.5);
  s.stop(t + decay * 3 + 0.02);
}
