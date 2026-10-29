/* Y · YC mock interview. Vanilla JS, no build step, no network calls except
   loading questions.json, the mp3 files and (only if you ask) the Whisper model.
   Structure:
     1. State and helpers
     2. Setup screen
     3. Interview screen (timer, voice, recording, transcript)
     4. Report screen (totals, prompts, Whisper, export)                      */

'use strict';

/* ───────────────────────── 1. State and helpers ───────────────────────── */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const VOICES = { ethan: 'Ethan', adrian: 'Adrian', sarah: 'Sarah', hannah: 'Hannah' };
const VOICE_KEYS = Object.keys(VOICES);
/* Partners on the panel for the current language: all four in English; the non-English voice sets are smaller (i18n json "voices"). */
function activeVoices() { const v = I18N && Array.isArray(I18N.voices) ? I18N.voices.filter((k) => VOICES[k]) : []; return v.length ? v : VOICE_KEYS; }
/* Partner name shown for a voice slot: the i18n json "names" map when the language has its own voices, else the English name. */
function vname(k) { return (I18N && I18N.names && I18N.names[k]) || VOICES[k]; }
const MAX_SESSION_SECONDS = 600;          // the real interview is 10 minutes
const INTERRUPT_MIN = 4, INTERRUPT_MAX = 45;
// How long a partner lets an answer run before cutting in, in seconds. Weighted so most
// cuts land early, a few are brutal, a few let you run: you never know which one is coming.
const CUT_BANDS = [[15, 4, 7], [55, 8, 16], [25, 18, 30], [5, 30, 45]];   // [weight %, lo, hi]
const INTERRUPT_MEAN = CUT_BANDS.reduce((s, [w, lo, hi]) => s + w / 100 * (lo + hi) / 2, 0);
const GAP_MIN = 200, GAP_MAX = 1500;      // ms before the next partner speaks
function drawCut() {
  let r = Math.random() * 100;
  for (const [w, lo, hi] of CUT_BANDS) { if (r < w) return lo + Math.random() * (hi - lo); r -= w; }
  return INTERRUPT_MIN;
}
// Some questions need a real explanation, some want one number. Time scales with that.
const LONG = new Set(['g3','g6','g9','g14','g18','g24','g30','g34','g38','g42','g45','g47','g50','g51','g53','g56','post5','post7','post10','post13']);
const SHORT = new Set(['g7','g8','g10','g13','g16','g31','g52','post1','post3','post4','post6','post8','post12','post14']);
const WEIGHT = { long: 1.5, normal: 1, short: 0.7 };
const kindOf = (id) => LONG.has(id) ? 'long' : SHORT.has(id) ? 'short' : 'normal';
let CUTS = { lines: {}, interrupt: [], timeup: [], files: {} };   // loaded from audio/cuts.json

/* ───────────────────────── Language ─────────────────────────
   EN is built into the HTML and this file. ES, PT and HI come from i18n/<lang>.json:
   {prompt_lang, ui: {data-i18n keys}, rt: {runtime strings below}, questions: {id: text}, cuts: {key: line}}.
   Audio for those lives in audio/<lang>/<voice>/; when a clip is missing the browser's own voice reads the text. */
const LANGS = { en: 'en-US', es: 'es-MX', pt: 'pt-BR', hi: 'hi-IN' };
const WHISPER_LANG = { es: 'spanish', pt: 'portuguese', hi: 'hindi' };
let LANG = 'en', I18N = null, QUESTIONS_EN = [], EN_DOM = null;
const RT = {   // runtime strings, English; translations in i18n/<lang>.json "rt"
  'rt.listen': 'Listen', 'rt.asks': 'asks', 'rt.waiting': 'is waiting', 'rt.answer': 'Answer', 'rt.go': 'Go',
  'rt.interrupted': 'Interrupted', 'rt.wrapup': 'Wrap up', 'rt.recording': 'Recording', 'rt.recfail': 'Recorder failed, type instead',
  'rt.cutsin': '{name} cuts in', 'rt.time': '{name}: time',
  'rt.est.capped': 'About {total} total. The real interview is 10 minutes, so this run stops after {n} questions.',
  'rt.est.open': 'About {total} total.', 'rt.est.interrupt': 'No clock on screen. A partner cuts in at an unannounced moment, 4 to 45 seconds, most often before 16.',
  'rt.lead': '{n} questions, {mode}, {time} of talking.', 'rt.lead.interrupt': 'partners interrupting', 'rt.lead.fixed': '{s} s per answer',
  'rt.t.questions': 'questions', 'rt.t.answered': 'answered', 'rt.t.cut1': 'cut off', 'rt.t.cutn': 'cut-offs', 'rt.t.avg': 'avg per answer', 'rt.t.wpm': 'words / min', 'rt.t.fillers': 'filler words',
  'rt.general': 'general', 'rt.pre': 'pre-launch', 'rt.post': 'post-launch', 'rt.deep': ' · deep', 'rt.quick': ' · quick', 'rt.cutoff': 'cut off', 'rt.finished': 'finished',
  'rt.ph.none': 'No live transcript in this browser. Run Whisper above or type what you said.', 'rt.ph.empty': 'No words captured. Type what you said.',
  'rt.meta': '{w} words · {wpm} wpm · {f} fillers', 'rt.meta.none': 'no transcript',
  'rt.copied': 'Copied', 'rt.copyprompt': 'Copy partner-panel prompt', 'rt.copystatus': '{label} copied ({n} characters).', 'rt.copyfail': 'Copy failed. Download the JSON instead.',
  'rt.wh.load': 'Loading Whisper (first time downloads about 40 MB)…', 'rt.wh.dl': 'Downloading {file} {pct}%', 'rt.wh.run': 'Transcribing answer {n} ({k} of {total})…',
  'rt.wh.done': 'Done. {n} answers re-transcribed on this device.', 'rt.wh.fail': 'Whisper failed: {err}. The live transcripts are kept.',
  'rt.mic.unavail': 'Microphone unavailable ({err}). You can type your answers instead.', 'rt.mic.norec': 'This browser cannot record audio. Answers will be typed.',
  'rt.mic.nolive': 'Live transcription needs Chrome, Edge or Safari. Here, audio is recorded and you can run Whisper afterwards.',
  'rt.live.unsupported': 'Live transcript is not supported in this browser. Audio is still recorded; run Whisper in the report.',
  'rt.noquestions': 'Could not load questions.json.',
};
function t(key, vars) {
  let str = (I18N && ((I18N.rt && I18N.rt[key]) || (I18N.ui && I18N.ui[key]))) || RT[key] || key;
  if (vars) for (const k in vars) str = str.split(`{${k}}`).join(String(vars[k]));
  return str;
}
function detectLang() {
  try { const saved = localStorage.getItem('y-lang'); if (saved && LANGS[saved]) return saved; } catch (_) {}
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return LANGS[nav] ? nav : 'en';
}
function snapshotEnglish() {   // so switching back to EN restores the built-in text
  EN_DOM = { html: {}, after: {}, ph: {} };
  $$('[data-i18n]').forEach((el) => { EN_DOM.html[el.dataset.i18n] = el.innerHTML; });
  $$('[data-i18n-after]').forEach((el) => { let h = '', n = el.nextElementSibling; while (n && n.tagName === 'SPAN') { h += n.outerHTML; n = n.nextElementSibling; } EN_DOM.after[el.dataset.i18nAfter] = h; });
  $$('[data-i18n-ph]').forEach((el) => { EN_DOM.ph[el.dataset.i18nPh] = el.placeholder; });
}
async function applyLang(lang) {
  if (!EN_DOM) snapshotEnglish();
  LANG = LANGS[lang] ? lang : 'en';
  I18N = null;
  if (LANG !== 'en') {
    try { I18N = await (await fetch(`i18n/${LANG}.json`)).json(); } catch (_) { LANG = 'en'; }
  }
  try { localStorage.setItem('y-lang', LANG); } catch (_) {}
  document.documentElement.lang = LANG;
  const ui = (I18N && I18N.ui) || {};
  $$('[data-i18n]').forEach((el) => { const k = el.dataset.i18n; el.innerHTML = ui[k] || EN_DOM.html[k]; });
  $$('[data-i18n-after]').forEach((el) => {
    const k = el.dataset.i18nAfter; let n = el.nextElementSibling;
    while (n && n.tagName === 'SPAN') { const gone = n; n = n.nextElementSibling; gone.remove(); }
    el.insertAdjacentHTML('afterend', ui[k] || EN_DOM.after[k]);
  });
  $$('[data-i18n-ph]').forEach((el) => { const k = el.dataset.i18nPh; el.placeholder = ui[k] || EN_DOM.ph[k]; });
  $$('#lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === LANG)));
  const tr = (I18N && I18N.questions) || {};
  QUESTIONS = QUESTIONS_EN.map((q) => ({ ...q, text: tr[q.id] || q.text }));
  if (typeof updateEstimate === 'function' && QUESTIONS.length) updateEstimate();
}
function cutLine(key) { return (I18N && I18N.cuts && I18N.cuts[key]) || CUTS.lines[key]; }
function audioPath(voice, id) { return LANG === 'en' ? `audio/${voice}/${id}.mp3` : `audio/${LANG}/${voice}/${id}.mp3`; }
/* A clip is missing (non-English sets are generated over time): the browser reads the text in that language. */
function speakFallback(text, done) {
  if (!('speechSynthesis' in window) || !text) { done(); return; }
  try {
    const u = new SpeechSynthesisUtterance(text); u.lang = LANGS[LANG]; u.rate = 1.05;
    const v = speechSynthesis.getVoices().find((x) => x.lang.replace('_', '-').toLowerCase().startsWith(LANG)); if (v) u.voice = v;
    let ended = false; const end = () => { if (ended) return; ended = true; setBars(''); done(); };
    u.onstart = () => setBars('speaking'); u.onend = end; u.onerror = end;
    speechSynthesis.cancel(); speechSynthesis.speak(u); setTimeout(end, 15000);
  } catch (_) { done(); }
}
let PARTNERS = null;                           // loaded from partners.json
const FILLERS = ['um', 'uh', 'umm', 'uhh', 'like', 'you know', 'basically', 'actually', 'literally', 'kind of', 'sort of', 'i mean', 'so yeah', 'right'];

let QUESTIONS = [];                        // loaded from questions.json
const session = {
  summary: '', stage: 'pre', industry: 'other', mode: 'interrupt', seconds: 30, count: 10, voice: true, mic: true,
  plan: [],            // [{id, text, type, voice, limit, kind}]
  answers: [],         // [{id, question, type, voice, limit, seconds, cutOff, transcript, blob, blobUrl, source}]
  startedAt: null, endedAt: null,
};

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const words = (t) => (t.trim().match(/\S+/g) || []).length;
function fillerCount(t) {
  const low = ` ${t.toLowerCase().replace(/[^a-z' ]+/g, ' ')} `;
  return FILLERS.reduce((n, f) => n + (low.match(new RegExp(`\\s${f}\\s`, 'g')) || []).length, 0);
}

function showScreen(name) {
  $$('.screen').forEach((s) => { s.hidden = s.dataset.screen !== name; });
  const order = ['setup', 'interview', 'report'];
  $$('.step').forEach((el) => {
    const i = order.indexOf(el.dataset.step), cur = order.indexOf(name);
    el.classList.toggle('active', i === cur);
    el.classList.toggle('done', i < cur);
  });
  $$('#lang button').forEach((b) => { b.disabled = name === 'interview'; });
  window.scrollTo({ top: 0 });
}

/* ───────────────────────── 2. Setup screen ───────────────────────── */

const form = $('#setup-form');
const summaryEl = $('#summary');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

function readForm() {
  const f = new FormData(form);
  session.summary = (f.get('summary') || '').trim();
  session.stage = f.get('stage');
  session.industry = f.get('industry') || 'other';
  session.mode = f.get('mode');
  session.seconds = Number(f.get('seconds'));
  session.count = Number(f.get('count'));
  session.voice = f.has('voice');
  session.mic = f.has('mic') && canRecord;
}

function updateEstimate() {
  readForm();
  const per = (session.mode === 'fixed' ? session.seconds : INTERRUPT_MEAN) * 1.05; // a few long ones
  const overhead = session.voice ? 5 : 2;                      // question playback, cut-in, gap
  const total = session.count * (per + overhead);
  const capped = total > MAX_SESSION_SECONDS;
  const fitted = capped ? Math.max(1, Math.floor(MAX_SESSION_SECONDS / (per + overhead))) : session.count;
  $('#seconds-row').hidden = session.mode !== 'fixed';
  $('#estimate').textContent = capped
    ? t('rt.est.capped', { total: fmtTime(total), n: fitted })
    : `${t('rt.est.open', { total: fmtTime(total) })} ${session.mode === 'interrupt' ? t('rt.est.interrupt') : ''}`;
  session.count = fitted;
}

function buildPlan() {
  const pool = QUESTIONS.filter((q) => q.type === 'GENERAL' || q.type === (session.stage === 'pre' ? 'PRE_LAUNCH' : 'POST_LAUNCH'));
  const stageQs = shuffle(pool.filter((q) => q.type !== 'GENERAL'));
  const general = shuffle(pool.filter((q) => q.type === 'GENERAL'));
  // Lead with one stage-specific question, then mix. Keeps every run different.
  const picked = shuffle([...stageQs.slice(0, 2), ...general]).slice(0, session.count);
  let last = null;
  session.plan = picked.map((q) => {
    const keys = activeVoices();
    let v; do { v = keys[randInt(0, keys.length - 1)]; } while (v === last && keys.length > 1);
    last = v;
    const kind = kindOf(q.id), w = WEIGHT[kind];
    const limit = session.mode === 'fixed' ? Math.max(6, Math.round(session.seconds * w)) : Math.max(4, Math.round(drawCut() * w));
    return { id: q.id, text: q.text, type: q.type, voice: v, limit, kind };
  });
}

form.addEventListener('change', updateEstimate);
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  readForm();
  ensureAudioCtx();                                           // created on a user gesture: iOS needs that
  updateEstimate();
  if (!session.summary) { summaryEl.focus(); return; }
  if (session.mic) {
    try { await openMic(); }
    catch (err) { session.mic = false; $('#mic-support').textContent = t('rt.mic.unavail', { err: err.name || err }); }
  }
  buildPlan();
  session.answers = [];
  session.startedAt = new Date();
  showScreen('interview');
  askQuestion(0);
});

/* ───────────────────────── 3. Interview screen ───────────────────────── */

const ringFg = $('#ring-fg');
const RING = 2 * Math.PI * 52;
let qIndex = -1;
let timer = { raf: 0, start: 0, limit: 0, running: false, cutOff: false, elapsed: 0 };
let currentAudio = null;
let micStream = null, recorder = null, chunks = [], recog = null, liveFinal = '', liveInterim = '';
let advancing = false;

/* Audio bars: orange with the partner's voice, green with the microphone. */
let audioCtx = null, voiceAnalyser = null, micAnalyser = null, barsMode = '', barsRaf = 0;
const barEls = () => $$('#bars i');
function ensureAudioCtx() {
  if (audioCtx) return audioCtx;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { audioCtx = null; }
  return audioCtx;
}
function attachVoice(audioEl) {
  const ctx = ensureAudioCtx(); if (!ctx) return;
  try {
    const src = ctx.createMediaElementSource(audioEl);
    voiceAnalyser = ctx.createAnalyser(); voiceAnalyser.fftSize = 64;
    src.connect(voiceAnalyser); voiceAnalyser.connect(ctx.destination);
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch (_) { voiceAnalyser = null; }
}
function attachMic(stream) {
  const ctx = ensureAudioCtx(); if (!ctx || micAnalyser) return;
  try {
    const src = ctx.createMediaStreamSource(stream);
    micAnalyser = ctx.createAnalyser(); micAnalyser.fftSize = 64;
    src.connect(micAnalyser);                                  // not to destination: no feedback
  } catch (_) { micAnalyser = null; }
}
function setBars(mode) {                                       // 'speaking' | 'listening' | ''
  barsMode = mode;
  $('#bars').className = `bars ${mode}`;
  cancelAnimationFrame(barsRaf);
  if (!mode) { barEls().forEach((b) => { b.style.height = '4px'; }); return; }
  const an = mode === 'speaking' ? voiceAnalyser : micAnalyser;
  const data = an ? new Uint8Array(an.frequencyBinCount) : null;
  let t = 0;
  const loop = () => {
    const bars = barEls();
    if (an) { an.getByteFrequencyData(data); }
    bars.forEach((b, i) => {
      let v;
      if (an) { const idx = Math.min(data.length - 1, 1 + Math.floor(i * (data.length - 2) / bars.length)); v = data[idx] / 255; }
      else { v = 0.25 + 0.35 * Math.abs(Math.sin(t / 7 + i)); }   // no analyser: gentle fake motion
      b.style.height = `${4 + Math.round(v * 24)}px`;
    });
    t++;
    barsRaf = requestAnimationFrame(loop);
  };
  loop();
}

async function openMic() {
  if (micStream) return micStream;
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  attachMic(micStream);
  return micStream;
}
function closeMic() {
  if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; micAnalyser = null; }
  setBars('');
}

function setTimer(sec, cls, msg) {
  $('#timer-sec').textContent = Math.max(0, cls === 'live' || cls === 'over' ? Math.floor(sec) : Math.ceil(sec));
  const wrap = $('#timer-wrap'); wrap.className = `timer-wrap ${cls || ''}`;
  const m = $('#timer-msg'); m.className = `timer-msg ${cls || ''}`; m.textContent = msg || '';
}

function askQuestion(i) {
  qIndex = i;
  advancing = false;
  const q = session.plan[i];
  $('#q-counter').textContent = `Q ${String(i + 1).padStart(2, '0')} / ${session.plan.length}`;
  $('#q-kind').textContent = session.mode === 'interrupt' ? '' : q.kind === 'long' ? 'deep question · more time' : q.kind === 'short' ? 'quick one · less time' : '';
  $('#cutin').hidden = true; $('#stage-card').classList.remove('flash');
  $('#q-text').textContent = q.text;
  const av = $('#speaker-avatar'); av.textContent = vname(q.voice)[0]; av.dataset.voice = q.voice;
  $('#speaker-name').textContent = vname(q.voice);
  $('#answer-live').innerHTML = '';
  $('#answer-typed').value = '';
  $('#answer-live').hidden = !session.mic;
  $('#answer-typed').hidden = session.mic;
  $('#mic-state').textContent = session.mic ? '' : 'Typing mode';
  $('#mic-state').className = 'mic-state';
  ringFg.style.strokeDashoffset = 0;
  setTimer(session.mode === 'interrupt' ? 0 : q.limit, 'idle', session.voice ? t('rt.listen') : '');
  $('#speaker-state').textContent = t('rt.asks'); $('#speaker-state').classList.toggle('speaking', session.voice);

  // Preload the next question's audio while this one plays.
  const next = session.plan[i + 1];
  if (next && session.voice) { const a = new Audio(audioPath(next.voice, next.id)); a.preload = 'auto'; }

  setBars('');
  if (session.voice) {
    currentAudio = new Audio(audioPath(q.voice, q.id));
    attachVoice(currentAudio);
    currentAudio.addEventListener('playing', () => setBars('speaking'), { once: true });
    const start = () => { currentAudio = null; startAnswer(); };
    currentAudio.addEventListener('ended', start, { once: true });
    currentAudio.addEventListener('error', () => { currentAudio = null; speakFallback(q.text, start); }, { once: true });
    currentAudio.play().catch(() => { if (currentAudio) { currentAudio = null; speakFallback(q.text, start); } });
  } else {
    startAnswer();
  }
}

function startAnswer() {
  const q = session.plan[qIndex];
  $('#speaker-state').textContent = t('rt.waiting'); $('#speaker-state').classList.remove('speaking');
  timer = { raf: 0, start: performance.now(), limit: q.limit, running: true, cutOff: false, elapsed: 0 };
  setTimer(session.mode === 'interrupt' ? 0 : q.limit, '', session.mode === 'interrupt' ? t('rt.answer') : t('rt.go'));
  if (session.mic) { startRecording(); setBars('listening'); } else { setBars(''); $('#answer-typed').focus(); }
  tick();
}

function tick() {
  if (!timer.running) return;
  timer.elapsed = (performance.now() - timer.start) / 1000;
  const left = timer.limit - timer.elapsed;
  const frac = Math.min(1, timer.elapsed / timer.limit);
  if (session.mode === 'interrupt') {
    // A real room has no clock: a stopwatch counts up, the ring just spins, no warning before the cut.
    ringFg.style.strokeDashoffset = RING * (1 - (timer.elapsed % 10) / 10);
    if (left <= 0) { timer.cutOff = true; setTimer(timer.elapsed, 'over', t('rt.interrupted')); finishAnswer(true); return; }
    setTimer(timer.elapsed, 'live', t('rt.answer'));
    timer.raf = requestAnimationFrame(tick);
    return;
  }
  ringFg.style.strokeDashoffset = RING * frac;
  if (left <= 0) {
    timer.cutOff = true;
    setTimer(0, 'over', "Time's up");
    finishAnswer(true);
    return;
  }
  if (frac >= 0.75) setTimer(left, 'warn', t('rt.wrapup'));
  else setTimer(left, '', t('rt.go'));
  timer.raf = requestAnimationFrame(tick);
}

function startRecording() {
  chunks = []; liveFinal = ''; liveInterim = '';
  try {
    recorder = new MediaRecorder(micStream);
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.start();
    $('#mic-state').textContent = t('rt.recording'); $('#mic-state').className = 'mic-state on';
  } catch (e) { recorder = null; $('#mic-state').textContent = t('rt.recfail'); $('#answer-typed').hidden = false; }
  if (SpeechRecognition) {
    try {
      recog = new SpeechRecognition();
      recog.continuous = true; recog.interimResults = true; recog.lang = LANGS[LANG] || navigator.language || 'en-US';
      recog.onresult = (e) => {
        liveInterim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) liveFinal += r[0].transcript + ' '; else liveInterim += r[0].transcript;
        }
        $('#answer-live').innerHTML = `${esc(liveFinal)}<span class="interim">${esc(liveInterim)}</span>`;
      };
      recog.onend = () => { if (timer.running && recog) { try { recog.start(); } catch (_) {} } };  // Chrome stops after silence; keep going
      recog.start();
    } catch (e) { recog = null; }
  } else {
    $('#answer-live').textContent = t('rt.live.unsupported');
  }
}

function stopRecording() {
  return new Promise((resolve) => {
    if (recog) { const r = recog; recog = null; r.onend = null; try { r.stop(); } catch (_) {} }
    if (!recorder || recorder.state === 'inactive') { recorder = null; resolve(null); return; }
    recorder.onstop = () => { const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }); recorder = null; resolve(blob); };
    recorder.stop();
  });
}

async function finishAnswer(cutOff) {
  if (!timer.running || advancing) return;
  advancing = true;
  timer.running = false; cancelAnimationFrame(timer.raf); setBars('');
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  const q = session.plan[qIndex];
  const blob = session.mic ? await stopRecording() : null;
  const transcript = session.mic ? (liveFinal + liveInterim).trim() : $('#answer-typed').value.trim();
  session.answers.push({
    n: qIndex + 1, id: q.id, question: q.text, type: q.type, voice: q.voice, limit: q.limit,
    seconds: Math.min(q.limit, Math.round(timer.elapsed * 10) / 10), cutOff: !!cutOff, kind: q.kind,
    transcript, blob, blobUrl: blob ? URL.createObjectURL(blob) : null,
    source: session.mic ? (SpeechRecognition ? 'live' : 'none') : 'typed',
  });
  const goOn = () => { if (qIndex + 1 < session.plan.length) askQuestion(qIndex + 1); else endInterview(); };
  if (cutOff) playCutIn(q, goOn); else setTimeout(goOn, session.mode === 'interrupt' ? randInt(GAP_MIN, GAP_MAX) : 250);
}

/* A partner cuts in: red flash, their name on screen, and usually a line in their voice if sound is on.
   Some interruptions have no line at all: the next partner just starts their question. */
const SILENT_CUT_SHARE = 0.3;                 // share of interruptions with no spoken line
let lastCutKey = '';
function pickCut(pool, fallback) {
  const keys = (pool && pool.length ? pool : [fallback]).filter((k) => k !== lastCutKey);
  lastCutKey = keys[randInt(0, keys.length - 1)] || fallback;
  return lastCutKey;
}
function playCutIn(q, done) {
  const next = session.plan[qIndex + 1];
  const interrupt = session.mode === 'interrupt';
  // Interruptions come from another partner (the next one to speak); "time's up" from the same one.
  const others = activeVoices().filter((v) => v !== q.voice);
  let voice = interrupt ? (next ? next.voice : (others[randInt(0, others.length - 1)] || q.voice)) : q.voice;
  const silent = interrupt && !!next && Math.random() < SILENT_CUT_SHARE;
  const key = silent ? '' : interrupt ? pickCut(CUTS.interrupt, 'cut1') : pickCut(CUTS.timeup, 'timeup');
  $('#stage-card').classList.add('flash');
  const av = $('#cutin-avatar'); av.textContent = vname(voice)[0]; av.dataset.voice = voice;
  $('#cutin-name').textContent = t(interrupt ? 'rt.cutsin' : 'rt.time', { name: vname(voice) });
  $('#cutin-line').textContent = silent ? '' : `“${cutLine(key) || (interrupt ? 'Okay, let me stop you there.' : 'Okay, time. Next one.')}”`;
  $('#cutin').hidden = false;
  if (navigator.vibrate) { try { navigator.vibrate(interrupt ? [60, 40, 60] : 80); } catch (_) {} }
  let finished = false;
  const finish = () => { if (finished) return; finished = true; done(); };
  if (silent) {
    // No line: the next question starts almost at once, the badge stays on a moment so you see who cut in.
    setTimeout(() => { finish(); $('#cutin').hidden = false; setTimeout(() => { $('#cutin').hidden = true; }, 1600); }, randInt(150, 400));
    return;
  }
  setTimeout(() => { if (!session.voice) finish(); }, 2000);
  if (session.voice) {
    const a = new Audio(audioPath(voice, key));
    attachVoice(a); a.addEventListener('playing', () => setBars('speaking'), { once: true });
    a.addEventListener('ended', () => { setBars(''); setTimeout(finish, interrupt ? randInt(GAP_MIN, GAP_MAX) : 350); }, { once: true });
    let fell = false; const fallback = () => { if (fell) return; fell = true; speakFallback(cutLine(key), () => setTimeout(finish, 300)); };
    a.addEventListener('error', fallback, { once: true });
    a.play().catch(fallback);
    setTimeout(finish, LANG === 'en' ? 4000 : 8000);                                 // safety: never hang on a stuck clip
  }
}

function endInterview() {
  timer.running = false; cancelAnimationFrame(timer.raf);
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  stopRecording();
  closeMic();
  session.endedAt = new Date();
  renderReport();
  showScreen('report');
}

$('#next').addEventListener('click', () => finishAnswer(false));
$('#end-early').addEventListener('click', async () => {
  if (timer.running) { advancing = true; timer.running = false; cancelAnimationFrame(timer.raf); await stopRecording(); }
  if (session.answers.length === 0) { closeMic(); showScreen('setup'); return; }
  endInterview();
});
$('#answer-typed').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finishAnswer(false); }
});
document.addEventListener('keydown', (e) => {
  if ($('#screen-interview').hidden) return;
  const inText = e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT');
  if (e.key === 'Escape') { e.preventDefault(); $('#end-early').click(); return; }
  if (inText) return;
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    if (timer.running) finishAnswer(false);
    else if (currentAudio) { currentAudio.pause(); currentAudio.dispatchEvent(new Event('ended')); } // skip the spoken question
  }
});

/* ───────────────────────── 4. Report screen ───────────────────────── */

function renderReport() {
  const a = session.answers;
  const answered = a.filter((x) => words(x.transcript) > 0).length;
  const cut = a.filter((x) => x.cutOff).length;
  const totalSec = a.reduce((s, x) => s + x.seconds, 0);
  const avg = a.length ? totalSec / a.length : 0;
  const allWords = a.reduce((s, x) => s + words(x.transcript), 0);
  const fillers = a.reduce((s, x) => s + fillerCount(x.transcript), 0);
  const wpm = totalSec ? Math.round(allWords / (totalSec / 60)) : 0;

  $('#report-lead').textContent = t('rt.lead', { n: a.length, mode: session.mode === 'interrupt' ? t('rt.lead.interrupt') : t('rt.lead.fixed', { s: session.seconds }), time: fmtTime(totalSec) });
  $('#totals').innerHTML = [
    [a.length, t('rt.t.questions')], [answered, t('rt.t.answered')], [cut, cut === 1 ? t('rt.t.cut1') : t('rt.t.cutn')],
    [avg.toFixed(0) + 's', t('rt.t.avg')], [wpm || '–', t('rt.t.wpm')], [fillers, t('rt.t.fillers')],
  ].map(([v, l]) => `<div class="tile"><b>${v}</b><span>${l}</span></div>`).join('');

  $('#answers').innerHTML = a.map((x, i) => `
    <li class="answer" data-i="${i}">
      <div class="answer-head">
        <span class="n">Q${x.n}</span>
        <span>${vname(x.voice)} · ${x.type === 'GENERAL' ? t('rt.general') : x.type === 'PRE_LAUNCH' ? t('rt.pre') : t('rt.post')}</span>
        <span>${x.seconds}s / ${x.limit}s${x.kind === 'long' ? t('rt.deep') : x.kind === 'short' ? t('rt.quick') : ''}</span>
        <span class="badge ${x.cutOff ? 'cut' : 'ok'}">${x.cutOff ? t('rt.cutoff') : t('rt.finished')}</span>
      </div>
      <p class="answer-q">${esc(x.question)}</p>
      <textarea data-i="${i}" placeholder="${x.source === 'none' ? t('rt.ph.none') : t('rt.ph.empty')}">${esc(x.transcript)}</textarea>
      ${x.blobUrl ? `<audio controls preload="none" src="${x.blobUrl}"></audio>` : ''}
      <div class="answer-meta" data-meta="${i}">${metaLine(x)}</div>
    </li>`).join('');

  $('#whisper-block').hidden = !a.some((x) => x.blob);
  const panel = panelFor(session.industry);
  $('#panel').innerHTML = panel.length ? panel.map((p) => `<div class="pcard"><div class="pt">On your panel</div><b>${esc(p.name)}</b>${esc(p.title)}<p>${esc(p.lens[0])}</p></div>`).join('') : '';
  refreshPromptPreview();
}
function refreshPromptPreview() { $('#prompt-text').textContent = partnerPrompt(); }

function metaLine(x) {
  const w = words(x.transcript), f = fillerCount(x.transcript);
  const wpm = x.seconds ? Math.round(w / (x.seconds / 60)) : 0;
  return w ? t('rt.meta', { w, wpm, f }) : t('rt.meta.none');
}

$('#answers').addEventListener('input', (e) => {
  if (e.target.tagName !== 'TEXTAREA') return;
  const i = Number(e.target.dataset.i);
  session.answers[i].transcript = e.target.value;
  $(`[data-meta="${i}"]`).textContent = metaLine(session.answers[i]);
  clearTimeout(refreshPromptPreview.t); refreshPromptPreview.t = setTimeout(refreshPromptPreview, 300);
});

/* The three simulated partners for this run, matched to the industry. */
function panelFor(industry) {
  if (!PARTNERS) return [];
  const ind = PARTNERS.industries[industry] || PARTNERS.industries.other;
  return ind.panel.map((k) => PARTNERS.partners[k]).filter(Boolean);
}
function industryLabel(industry) {
  return PARTNERS && PARTNERS.industries[industry] ? PARTNERS.industries[industry].label : 'not specified';
}

/* Prompt for any chat model: a three-partner YC panel scores the run, question by question. */
function partnerPrompt() {
  const panel = panelFor(session.industry);
  const base = panel.length === 3 ? panelPrompt(panel) : genericPrompt();
  if (LANG === 'en' || !I18N || !I18N.prompt_lang) return base;
  return `${base}\n\nLANGUAGE: the founder answered in ${I18N.prompt_lang}. Write the entire evaluation in ${I18N.prompt_lang}, same structure, same section titles translated.`;
}

function stageLine() {
  return session.stage === 'pre'
    ? 'pre-launch: no users or revenue yet. The bar: a working prototype or a clear plan to have one in weeks, specific customer conversations with names and numbers, and founders who know the first customer by name.'
    : 'launched: has users or revenue. The bar: real numbers (users, revenue, retention, growth per week), what changed since launch, and why growth will continue without buying it.';
}
function formatLine() {
  return session.mode === 'interrupt'
    ? 'no clock on screen; a partner cut in at an unannounced moment between 4 and 45 seconds (most often before 16). Interruptions are normal in the real room and are not a penalty by themselves: what matters is whether the point was out before the cut.'
    : session.seconds + ' seconds per answer, strict timer, scaled by question depth.';
}
function transcriptBlock() {
  return session.answers.map((x) => `### Q${x.n}. ${x.question}
Asked by ${vname(x.voice)}. Time used: ${x.seconds}s${x.cutOff ? ', INTERRUPTED (a partner cut in)' : ', finished on their own'}.
Founder (verbatim transcript): ${x.transcript.trim() ? '"' + x.transcript.trim() + '"' : '(no answer captured)'}`).join('\n\n');
}
function industryBlock() {
  const ind = PARTNERS && (PARTNERS.industries[session.industry] || PARTNERS.industries.other);
  if (!ind || !ind.bar) return `Industry: ${industryLabel(session.industry)}.`;
  return `Industry: ${ind.label}.
What YC looks for here: ${ind.bar}
Numbers partners expect to hear: ${ind.metrics}
Red flags in this industry: ${ind.redflags}
Questions this panel almost always asks: ${ind.killer.map((q, i) => `(${i + 1}) ${q}`).join(' ')}`;
}

const HOW_YC_JUDGES = `## How a YC interview is judged
The real interview is 10 minutes, usually two or three partners, rapid questions, frequent interruptions. Partners are not judging the pitch; they are testing whether the founders know their business cold. They form a view in the first two or three answers and spend the rest confirming or overturning it. They decide on:
- Founders: clear thinkers, fast, honest, with a specific insight about their customer that outsiders do not have. "I do not know yet, here is how I will find out" beats a confident guess.
- Customer and demand: a named first customer, evidence people want this (used it, paid, came back), not market size.
- Product and progress: what exists today, what shipped recently, speed since the application.
- Why now and why you: what changed in the world, what you understand that others do not.
- Honesty: an overclaim caught once poisons every other answer.
A good answer gives the point in the first sentence, then one number or one concrete example, then stops. Context first, point later, is the most common failure, and the reason founders get cut off.`;

const CALIBRATION = `Score calibration (apply it strictly):
- 1-3: no answer, evasive, pure context, or an overclaim with nothing behind it.
- 4-5: on topic but generic; no number, no name, no example; the partner would have to ask again.
- 6-7: direct and specific; at least one real number, name or mechanism; a partner could move on.
- 8-10: direct, specific and backed by something done or measured; it teaches the panel something; it survived the interruption because the point came first.`;

function panelPrompt(panel) {
  const names = panel.map((p) => p.name);
  const first = (n) => n.split(' ')[0];
  const cards = panel.map((p, i) => `### Partner ${i + 1}: ${p.name}, ${p.title}
Background: ${p.bg}
Style in the room: ${p.style || 'direct, concrete, impatient with fog.'}
What ${first(p.name)} pushes on:
${p.lens.map((l) => '- ' + l).join('\n')}
What wins ${first(p.name)}: ${p.yes || 'specificity and evidence.'}
What makes ${first(p.name)} pass: ${p.no || 'vagueness and overclaims.'}`).join('\n\n');

  return `You are simulating a Y Combinator interview panel. Three partners just finished a 10-minute interview with a founder and are debriefing, then writing feedback the founder will read. The personas are built from the partners' public backgrounds and the themes they have written about; this is a practice simulation in their style, not their words or opinions. Stay in character. Be direct, concrete and a little impatient, the way partners are in the room. Do not soften verdicts. Do not invent facts about the company: use only the one-liner and the transcript, and say when a fact is missing.

${HOW_YC_JUDGES}

## The company
One-liner, written by the founder: "${session.summary}"
Stage: ${stageLine()}
${industryBlock()}
Format of this mock: ${formatLine()} ${session.answers.length} questions were asked.

## The panel
${cards}

## Transcript
${transcriptBlock()}

## Your job
Write the output in these sections, with the same numbering. Quote the founder's own words when you judge them.

0. **The one-liner, heard by the panel.** One line each from ${names[0]}, ${names[1]} and ${names[2]}: what they assume the company is from that sentence alone, and what is missing (customer, problem, mechanism, proof). Then "Say instead:" a one-liner rewrite under 20 words, using only facts the founder gave.

1. **Question by question.** For every question, in order:
   - One line from each partner, in their own voice, starting with the partner's first name: what landed, what was missing, and the follow-up they would have fired back.
   - A score from 1 to 10 (one score, agreed by the panel) with the single word that explains it (for example: vague, specific, evasive, strong, interrupted, no-answer).
   - "Say instead:" a rewrite under 25 words, point first, using only facts from the one-liner or the answers. If a number is missing write "[give the number]".
   ${CALIBRATION}
   An interrupted answer scores on what was said before the cut. Missing answers score 1.

2. **Each partner's verdict.** One short paragraph per partner, in character: what they now believe about this company, the one thing they would need to see to say yes, and their vote: FUND, PASS or NEED MORE.

3. **The debrief.** Three to six lines of the partners talking to each other: where they agree, where they disagree, and the decision the panel reaches.

4. **Scorecard.** Four scores from 1 to 10 for the whole interview: Direct (first sentence answers the question), Specific (numbers, names, dates, mechanisms), Evidence (claims backed by things done or measured), Concise (half the words would do). Then an overall "would we fund this today" score from 1 to 10, with one sentence of reason.

5. **The questions you did not get.** From "Questions this panel almost always asks" and the partners' lenses, the two or three questions this founder was not asked and must be ready for, each with what a strong answer would contain.

6. **Before the real interview.** The three fixes that matter most, in order, each tied to a question number or to the one-liner.

Keep the whole thing under 1600 words. Plain text with the headings above, no tables.`;
}

/* Fallback when partners.json did not load: one anonymous partner. */
function genericPrompt() {
  return `You are a Y Combinator partner who just finished a 10-minute interview with a founder. Be direct, concrete and a little impatient, the way a real partner would be. Do not soften the verdict. Do not invent facts about the company: use only the one-liner and the transcript.

${HOW_YC_JUDGES}

## The company
One-liner, written by the founder: "${session.summary}"
Stage: ${stageLine()}
${industryBlock()}
Format of this mock: ${formatLine()} ${session.answers.length} questions were asked.

## Transcript
${transcriptBlock()}

## Your job
0. **The one-liner.** What you assume the company is from that sentence, what is missing, and a rewrite under 20 words.
1. **Question by question.** For each: your reaction in one line (what landed, what was missing, the follow-up you would fire back), a score from 1 to 10 with one word of reason, and "Say instead:" a rewrite under 25 words, point first, using only facts the founder gave ("[give the number]" where one is missing).
   ${CALIBRATION}
   An interrupted answer scores on what was said before the cut. Missing answers score 1.
2. **Scorecard.** Direct, Specific, Evidence, Concise, each 1 to 10, then "would I fund this today" 1 to 10 with one sentence.
3. **The questions you did not get.** Two or three the founder must be ready for, with what a strong answer contains.
4. **Before the real interview.** The three fixes that matter most, in order, tied to question numbers.

Keep it under 1200 words. Plain text, no tables.`;
}

function jevPayload() {
  const a = session.answers;
  const state = {
    project_summary: session.summary,
    stage: session.stage === 'pre' ? 'pre-launch' : 'launched',
    industry: industryLabel(session.industry),
    format: session.mode === 'interrupt' ? 'partners interrupt at an unannounced moment, 4-45 s per answer scaled by question depth, no clock shown' : `${session.seconds} s per answer scaled by question depth`,
    answers: a.map((x) => ({ n: x.n, question: x.question, answer: x.transcript.trim(), seconds_used: x.seconds, seconds_allowed: x.limit, cut_off: x.cutOff })),
  };
  const questions = {};
  a.forEach((x) => {
    const k = `a${x.n}`, ref = `answers[${x.n - 1}].answer`;
    questions[`${k}_direct`] = { type: 'noul', instructions: `Does ${ref} answer the question "${x.question}" in its first sentence?`,
      criteria: { true: 'The first sentence is the answer, not context or a preamble', false: 'The answer starts with background, a story, or restates the question' } };
    questions[`${k}_specific`] = { type: 'noul', instructions: `Does ${ref} contain concrete numbers, names, dates or mechanisms?`,
      criteria: { true: 'At least one specific fact a listener could check or picture', false: 'Only adjectives, intentions or generalities' } };
    questions[`${k}_evidence`] = { type: 'noul', instructions: `Does ${ref} back its claim with something the founder has done, built or measured, consistent with project_summary?`,
      criteria: { true: 'Cites real actions, results or data', false: 'Asserts without evidence, or contradicts the summary' } };
    questions[`${k}_concise`] = { type: 'noul', instructions: `Could ${ref} be said in half the words without losing the point?`,
      criteria: { true: 'Padding, repetition or hedging', false: 'Every sentence carries information' } };
  });
  questions.overall_knows_business = { type: 'noul', instructions: 'Across all answers, does the founder show deep command of their customers, numbers and product?',
    criteria: { true: 'Consistent, specific, confident answers that connect to each other', false: 'Vague, contradictory or memorized-sounding answers' } };
  questions.overall_fundable = { type: 'noul', instructions: 'Would a YC partner, after this interview, push to fund this company today?',
    criteria: { true: 'Clear problem, credible founder, evidence of progress, big market', false: 'Unclear what is sold, to whom, or why it will work' } };
  questions.overall_overclaim = { type: 'noul', instructions: 'Do the answers promise more than a young company could deliver, or use hype words?',
    criteria: { true: 'Revolutionize, disrupt, AI-powered, best in the world, no competition', false: 'Plain, bounded claims' } };
  return { model: 'jev-latest', state, questions };
}

function exportJson() {
  return {
    tool: 'Y mock interview', version: 1, started_at: session.startedAt, ended_at: session.endedAt,
    settings: { stage: session.stage, industry: session.industry, panel: panelFor(session.industry).map((p) => p.name), mode: session.mode, seconds: session.seconds, count: session.plan.length, voice: session.voice, mic: session.mic },
    summary: session.summary,
    answers: session.answers.map(({ blob, blobUrl, ...rest }) => rest),
    partner_prompt: partnerPrompt(),
    jev_payload: jevPayload(),
  };
}

async function copyText(text, label) {
  try { await navigator.clipboard.writeText(text); $('#copy-status').textContent = t('rt.copystatus', { label, n: text.length.toLocaleString() }); }
  catch (_) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); $('#copy-status').textContent = `${label} copied.`; } catch (e) { $('#copy-status').textContent = t('rt.copyfail'); }
    ta.remove();
  }
}
$('#copy-prompt').addEventListener('click', () => copyText(partnerPrompt(), 'Partner-panel prompt'));
$('#copy-prompt-2').addEventListener('click', () => { copyText(partnerPrompt(), 'Partner-panel prompt'); $('#copy-prompt-2').textContent = t('rt.copied'); setTimeout(() => { $('#copy-prompt-2').textContent = (I18N && I18N.ui && I18N.ui['rep.copy2']) || t('rt.copyprompt'); }, 1500); });
$('#copy-jev').addEventListener('click', () => copyText(JSON.stringify(jevPayload(), null, 2), 'Jev payload'));
$('#download-json').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(exportJson(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `y-mock-interview-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#print').addEventListener('click', () => window.print());
$('#again').addEventListener('click', () => {
  session.answers.forEach((x) => x.blobUrl && URL.revokeObjectURL(x.blobUrl));
  session.answers = []; $('#copy-status').textContent = '';
  showScreen('setup');
});

/* On-device Whisper (transformers.js). Loaded only when the user clicks. */
let asr = null, asrModel = '';
$('#whisper-run').addEventListener('click', async () => {
  const btn = $('#whisper-run'), status = $('#whisper-status');
  btn.disabled = true;
  try {
    const model = LANG === 'en' ? 'onnx-community/whisper-tiny.en' : 'onnx-community/whisper-tiny';
    if (!asr || asrModel !== model) {
      status.textContent = t('rt.wh.load');
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2');
      env.allowLocalModels = false;
      asr = await pipeline('automatic-speech-recognition', model, {
        progress_callback: (p) => { if (p.status === 'progress' && p.file) status.textContent = t('rt.wh.dl', { file: p.file.split('/').pop(), pct: Math.round(p.progress || 0) }); },
      });
      asrModel = model;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const todo = session.answers.filter((x) => x.blob);
    for (let k = 0; k < todo.length; k++) {
      const x = todo[k];
      status.textContent = t('rt.wh.run', { n: x.n, k: k + 1, total: todo.length });
      const buf = await ctx.decodeAudioData(await x.blob.arrayBuffer());
      const pcm = buf.numberOfChannels > 1 ? mixDown(buf) : buf.getChannelData(0);
      const out = await asr(pcm, LANG === 'en' ? { chunk_length_s: 30, stride_length_s: 5 } : { chunk_length_s: 30, stride_length_s: 5, language: WHISPER_LANG[LANG], task: 'transcribe' });
      const text = (out && out.text || '').trim();
      if (text) {
        x.transcript = text; x.source = 'whisper';
        const i = session.answers.indexOf(x);
        $(`#answers textarea[data-i="${i}"]`).value = text;
        $(`[data-meta="${i}"]`).textContent = metaLine(x);
      }
    }
    status.textContent = t('rt.wh.done', { n: todo.length });
    renderTotalsOnly();
  } catch (e) {
    status.textContent = t('rt.wh.fail', { err: e.message || e });
  } finally { btn.disabled = false; }
});
function mixDown(buf) {
  const n = buf.length, out = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / buf.numberOfChannels; }
  return out;
}
function renderTotalsOnly() { renderReport(); }   // session.answers already holds the edits

/* ───────────────────────── Boot ───────────────────────── */

(async function boot() {
  if (!canRecord) { $('#mic-support').textContent = t('rt.mic.norec'); form.elements.mic.checked = false; form.elements.mic.disabled = true; }
  else if (!SpeechRecognition) { $('#mic-support').textContent = t('rt.mic.nolive'); }
  // Interruption mode is the default: that is the real room.
  try {
    const r = await fetch('questions.json'); QUESTIONS_EN = await r.json(); QUESTIONS = QUESTIONS_EN;
  } catch (e) { $('#start').disabled = true; $('#estimate').textContent = t('rt.noquestions'); return; }
  try { CUTS = await (await fetch('audio/cuts.json')).json(); } catch (_) {}
  try { PARTNERS = await (await fetch('partners.json')).json(); } catch (_) {}
  await applyLang(detectLang());
  $$('#lang button').forEach((b) => b.addEventListener('click', () => { if (b.dataset.lang !== LANG) applyLang(b.dataset.lang).then(() => { if (!$('#screen-report').hidden) renderReport(); }); }));
  window.Y = { partnerPrompt, jevPayload, exportJson, session };   // for tests and curious people
  updateEstimate();
  showScreen('setup');
})();
