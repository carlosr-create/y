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
const MAX_SESSION_SECONDS = 600;          // the real interview is 10 minutes
const INTERRUPT_MIN = 8, INTERRUPT_MAX = 18;
const FILLERS = ['um', 'uh', 'umm', 'uhh', 'like', 'you know', 'basically', 'actually', 'literally', 'kind of', 'sort of', 'i mean', 'so yeah', 'right'];

let QUESTIONS = [];                        // loaded from questions.json
const session = {
  summary: '', stage: 'pre', mode: 'fixed', seconds: 30, count: 10, voice: true, mic: true,
  plan: [],            // [{id, text, type, voice, limit}]
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
  session.mode = f.get('mode');
  session.seconds = Number(f.get('seconds'));
  session.count = Number(f.get('count'));
  session.voice = f.has('voice');
  session.mic = f.has('mic') && canRecord;
}

function updateEstimate() {
  readForm();
  const per = session.mode === 'fixed' ? session.seconds : (INTERRUPT_MIN + INTERRUPT_MAX) / 2;
  const overhead = session.voice ? 4 : 1;                      // question playback + gap
  const total = session.count * (per + overhead);
  const capped = total > MAX_SESSION_SECONDS;
  const fitted = capped ? Math.max(1, Math.floor(MAX_SESSION_SECONDS / (per + overhead))) : session.count;
  $('#seconds-row').hidden = session.mode !== 'fixed';
  $('#estimate').textContent = capped
    ? `About ${fmtTime(total)} total. The real interview is 10 minutes, so this run stops after ${fitted} questions.`
    : `About ${fmtTime(total)} total. ${session.mode === 'interrupt' ? 'Each answer is cut at a random point between 8 and 18 seconds.' : ''}`;
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
    let v; do { v = VOICE_KEYS[randInt(0, VOICE_KEYS.length - 1)]; } while (v === last && VOICE_KEYS.length > 1);
    last = v;
    const limit = session.mode === 'fixed' ? session.seconds : randInt(INTERRUPT_MIN, INTERRUPT_MAX);
    return { id: q.id, text: q.text, type: q.type, voice: v, limit };
  });
}

summaryEl.addEventListener('input', () => { $('#summary-count').textContent = summaryEl.value.length; });
form.addEventListener('change', updateEstimate);
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  readForm();
  updateEstimate();
  if (!session.summary) { summaryEl.focus(); return; }
  if (session.mic) {
    try { await openMic(); }
    catch (err) { session.mic = false; $('#mic-support').textContent = `Microphone unavailable (${err.name || err}). You can type your answers instead.`; }
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

async function openMic() {
  if (micStream) return micStream;
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return micStream;
}
function closeMic() {
  if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
}

function setTimer(sec, cls, msg) {
  $('#timer-sec').textContent = Math.max(0, Math.ceil(sec));
  const wrap = $('#timer-wrap'); wrap.className = `timer-wrap ${cls || ''}`;
  const m = $('#timer-msg'); m.className = `timer-msg ${cls || ''}`; m.textContent = msg || '';
}

function askQuestion(i) {
  qIndex = i;
  advancing = false;
  const q = session.plan[i];
  $('#q-counter').textContent = `Question ${i + 1} of ${session.plan.length}`;
  $('#q-text').textContent = q.text;
  const av = $('#speaker-avatar'); av.textContent = VOICES[q.voice][0]; av.dataset.voice = q.voice;
  $('#speaker-name').textContent = VOICES[q.voice];
  $('#answer-live').innerHTML = '';
  $('#answer-typed').value = '';
  $('#answer-live').hidden = !session.mic;
  $('#answer-typed').hidden = session.mic;
  $('#mic-state').textContent = session.mic ? '' : 'Typing mode';
  $('#mic-state').className = 'mic-state';
  ringFg.style.strokeDashoffset = 0;
  setTimer(q.limit, 'idle', session.voice ? 'Listen' : '');
  $('#speaker-state').textContent = 'asks'; $('#speaker-state').classList.toggle('speaking', session.voice);

  // Preload the next question's audio while this one plays.
  const next = session.plan[i + 1];
  if (next && session.voice) { const a = new Audio(`audio/${next.voice}/${next.id}.mp3`); a.preload = 'auto'; }

  if (session.voice) {
    currentAudio = new Audio(`audio/${q.voice}/${q.id}.mp3`);
    const start = () => { currentAudio = null; startAnswer(); };
    currentAudio.addEventListener('ended', start, { once: true });
    currentAudio.addEventListener('error', start, { once: true });
    currentAudio.play().catch(start);
  } else {
    startAnswer();
  }
}

function startAnswer() {
  const q = session.plan[qIndex];
  $('#speaker-state').textContent = 'is waiting'; $('#speaker-state').classList.remove('speaking');
  timer = { raf: 0, start: performance.now(), limit: q.limit, running: true, cutOff: false, elapsed: 0 };
  setTimer(q.limit, '', session.mode === 'interrupt' ? 'Answer' : 'Go');
  if (session.mic) startRecording(); else { $('#answer-typed').focus(); }
  tick();
}

function tick() {
  if (!timer.running) return;
  timer.elapsed = (performance.now() - timer.start) / 1000;
  const left = timer.limit - timer.elapsed;
  const frac = Math.min(1, timer.elapsed / timer.limit);
  ringFg.style.strokeDashoffset = RING * frac;
  if (left <= 0) {
    timer.cutOff = true;
    setTimer(0, 'over', session.mode === 'interrupt' ? 'Cut off' : "Time's up");
    finishAnswer(true);
    return;
  }
  if (frac >= 0.75) setTimer(left, 'warn', session.mode === 'interrupt' ? 'Interrupting soon…' : 'Wrap up');
  else setTimer(left, '', session.mode === 'interrupt' ? 'Answer' : 'Go');
  timer.raf = requestAnimationFrame(tick);
}

function startRecording() {
  chunks = []; liveFinal = ''; liveInterim = '';
  try {
    recorder = new MediaRecorder(micStream);
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.start();
    $('#mic-state').textContent = 'Recording'; $('#mic-state').className = 'mic-state on';
  } catch (e) { recorder = null; $('#mic-state').textContent = 'Recorder failed, type instead'; $('#answer-typed').hidden = false; }
  if (SpeechRecognition) {
    try {
      recog = new SpeechRecognition();
      recog.continuous = true; recog.interimResults = true; recog.lang = navigator.language || 'en-US';
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
    $('#answer-live').textContent = 'Live transcript is not supported in this browser. Audio is still recorded; run Whisper in the report.';
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
  timer.running = false; cancelAnimationFrame(timer.raf);
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  const q = session.plan[qIndex];
  const blob = session.mic ? await stopRecording() : null;
  const transcript = session.mic ? (liveFinal + liveInterim).trim() : $('#answer-typed').value.trim();
  session.answers.push({
    n: qIndex + 1, id: q.id, question: q.text, type: q.type, voice: q.voice, limit: q.limit,
    seconds: Math.min(q.limit, Math.round(timer.elapsed * 10) / 10), cutOff: !!cutOff,
    transcript, blob, blobUrl: blob ? URL.createObjectURL(blob) : null,
    source: session.mic ? (SpeechRecognition ? 'live' : 'none') : 'typed',
  });
  const delay = cutOff ? 900 : 250;                         // let the "Cut off" state register
  setTimeout(() => {
    if (qIndex + 1 < session.plan.length) askQuestion(qIndex + 1); else endInterview();
  }, delay);
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

  $('#report-lead').textContent = `${a.length} questions, ${session.mode === 'interrupt' ? 'interruption mode' : session.seconds + ' s per answer'}, ${fmtTime(totalSec)} of talking.`;
  $('#totals').innerHTML = [
    [a.length, 'questions'], [answered, 'answered'], [cut, cut === 1 ? 'cut off' : 'cut-offs'],
    [avg.toFixed(0) + 's', 'avg per answer'], [wpm || '–', 'words / min'], [fillers, 'filler words'],
  ].map(([v, l]) => `<div class="tile"><b>${v}</b><span>${l}</span></div>`).join('');

  $('#answers').innerHTML = a.map((x, i) => `
    <li class="answer" data-i="${i}">
      <div class="answer-head">
        <span class="n">Q${x.n}</span>
        <span>${VOICES[x.voice]} · ${x.type === 'GENERAL' ? 'general' : x.type === 'PRE_LAUNCH' ? 'pre-launch' : 'post-launch'}</span>
        <span>${x.seconds}s of ${x.limit}s</span>
        <span class="badge ${x.cutOff ? 'cut' : 'ok'}">${x.cutOff ? 'cut off' : 'finished'}</span>
      </div>
      <p class="answer-q">${esc(x.question)}</p>
      <textarea data-i="${i}" placeholder="${x.source === 'none' ? 'No live transcript in this browser. Run Whisper above or type what you said.' : 'No words captured. Type what you said.'}">${esc(x.transcript)}</textarea>
      ${x.blobUrl ? `<audio controls preload="none" src="${x.blobUrl}"></audio>` : ''}
      <div class="answer-meta" data-meta="${i}">${metaLine(x)}</div>
    </li>`).join('');

  $('#whisper-block').hidden = !a.some((x) => x.blob);
}

function metaLine(x) {
  const w = words(x.transcript), f = fillerCount(x.transcript);
  const wpm = x.seconds ? Math.round(w / (x.seconds / 60)) : 0;
  return w ? `${w} words · ${wpm} wpm · ${f} filler${f === 1 ? '' : 's'}` : 'no transcript';
}

$('#answers').addEventListener('input', (e) => {
  if (e.target.tagName !== 'TEXTAREA') return;
  const i = Number(e.target.dataset.i);
  session.answers[i].transcript = e.target.value;
  $(`[data-meta="${i}"]`).textContent = metaLine(session.answers[i]);
});

/* Prompt for any chat model: acts as a YC partner and scores the run. */
function partnerPrompt() {
  const a = session.answers;
  const stage = session.stage === 'pre' ? 'pre-launch (no users or revenue yet)' : 'launched (has users or revenue)';
  const qa = a.map((x) => `### Q${x.n}. ${x.question}
Asked by: ${VOICES[x.voice]}. Time used: ${x.seconds}s of ${x.limit}s${x.cutOff ? ' (INTERRUPTED, the partner cut the founder off)' : ''}.
Answer (verbatim transcript): ${x.transcript.trim() ? '"' + x.transcript.trim() + '"' : '(no answer captured)'}`).join('\n\n');

  return `You are a Y Combinator partner who just finished a 10-minute interview with a founder. Interviews are fast, partners interrupt, and they judge clarity, specificity, evidence and honesty, not polish. Be direct, concrete and a little impatient, the way a real partner would be. Do not soften the verdict.

## The company (written by the founder)
${session.summary}

Stage: ${stage}.
Format of this mock: ${session.mode === 'interrupt' ? 'interruption mode, answers cut at a random 8 to 18 seconds' : session.seconds + ' seconds per answer, strict timer'}. ${a.length} questions.

## Transcript
${qa}

## Your job
1. Score every answer from 1 to 10 on each of these, then give one line of feedback per answer:
   - Direct: did the first sentence answer the question?
   - Specific: numbers, names, dates, mechanisms, instead of adjectives.
   - Evidence: is the claim backed by something the founder has actually done or measured?
   - Concise: could it be said in half the words? Interrupted answers that had not reached the point yet score low here.
2. Give the strongest answer and the weakest answer, with the reason.
3. List the 3 things you now doubt most about this company, and the follow-up question you would have asked for each.
4. Rewrite the 3 weakest answers the way a founder who knows their business cold would say them, in under 25 words each, using only facts that appear in the summary or the answers (invent nothing; if a number is missing, say "[give the number]").
5. Overall verdict: a score from 1 to 10 for "would I push to fund this today", one paragraph of reasoning, and the single most important thing to fix before the real interview.

Format the output with the same numbered sections. Keep it under 900 words.`;
}

/* Ready-to-send payload for TypeSafe's Jev scorer (https://api.typesafe.ai/v1/systemone).
   Shape: { model, state, questions }. "noul" questions return a probability 0..1.
   Send it with your own key; the site never holds one. */
function jevPayload() {
  const a = session.answers;
  const state = {
    project_summary: session.summary,
    stage: session.stage === 'pre' ? 'pre-launch' : 'launched',
    format: session.mode === 'interrupt' ? 'interruption mode, 8-18 s per answer' : `${session.seconds} s per answer`,
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
    settings: { stage: session.stage, mode: session.mode, seconds: session.seconds, count: session.plan.length, voice: session.voice, mic: session.mic },
    summary: session.summary,
    answers: session.answers.map(({ blob, blobUrl, ...rest }) => rest),
    partner_prompt: partnerPrompt(),
    jev_payload: jevPayload(),
  };
}

async function copyText(text, label) {
  try { await navigator.clipboard.writeText(text); $('#copy-status').textContent = `${label} copied (${text.length.toLocaleString()} characters).`; }
  catch (_) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); $('#copy-status').textContent = `${label} copied.`; } catch (e) { $('#copy-status').textContent = 'Copy failed. Download the JSON instead.'; }
    ta.remove();
  }
}
$('#copy-prompt').addEventListener('click', () => copyText(partnerPrompt(), 'YC-partner prompt'));
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
let asr = null;
$('#whisper-run').addEventListener('click', async () => {
  const btn = $('#whisper-run'), status = $('#whisper-status');
  btn.disabled = true;
  try {
    if (!asr) {
      status.textContent = 'Loading Whisper (first time downloads about 40 MB)…';
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2');
      env.allowLocalModels = false;
      asr = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', {
        progress_callback: (p) => { if (p.status === 'progress' && p.file) status.textContent = `Downloading ${p.file.split('/').pop()} ${Math.round(p.progress || 0)}%`; },
      });
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const todo = session.answers.filter((x) => x.blob);
    for (let k = 0; k < todo.length; k++) {
      const x = todo[k];
      status.textContent = `Transcribing answer ${x.n} (${k + 1} of ${todo.length})…`;
      const buf = await ctx.decodeAudioData(await x.blob.arrayBuffer());
      const pcm = buf.numberOfChannels > 1 ? mixDown(buf) : buf.getChannelData(0);
      const out = await asr(pcm, { chunk_length_s: 30, stride_length_s: 5 });
      const text = (out && out.text || '').trim();
      if (text) {
        x.transcript = text; x.source = 'whisper';
        const i = session.answers.indexOf(x);
        $(`#answers textarea[data-i="${i}"]`).value = text;
        $(`[data-meta="${i}"]`).textContent = metaLine(x);
      }
    }
    status.textContent = `Done. ${todo.length} answers re-transcribed on this device.`;
    renderTotalsOnly();
  } catch (e) {
    status.textContent = `Whisper failed: ${e.message || e}. The live transcripts are kept.`;
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
  if (!canRecord) { $('#mic-support').textContent = 'This browser cannot record audio. Answers will be typed.'; form.elements.mic.checked = false; form.elements.mic.disabled = true; }
  else if (!SpeechRecognition) { $('#mic-support').textContent = 'Live transcription needs Chrome, Edge or Safari. Here, audio is recorded and you can run Whisper afterwards.'; }
  try {
    const r = await fetch('questions.json'); QUESTIONS = await r.json();
  } catch (e) { $('#start').disabled = true; $('#estimate').textContent = 'Could not load questions.json.'; return; }
  updateEstimate();
  showScreen('setup');
})();
