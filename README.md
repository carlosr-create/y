# Y · YC mock interview

Free practice for the 10-minute Y Combinator interview. Open the site, describe
your company, pick a timer, and four voices ask you real interview questions
out loud. Your answers are recorded and written down on your device. At the
end you get a report and two copy-ready prompts that score the run.

**Live:** https://yc-stt.vercel.app

Not affiliated with Y Combinator. Questions come from
[yci.vercel.app](https://yci.vercel.app/) by Ali Elroby, which inspired this
project (same timer and interruption idea, but with voice and a written record).

## How it works

1. **Setup.** Company one-liner, industry (picks your simulated partner panel), stage (pre-launch skips metric questions),
   interviewer (strict timer of 20/30/45/60 s, or interruption mode that cuts
   you at a random 8 to 18 s), 6/10/15 questions capped at 10 minutes, voice
   on/off, microphone on/off.
2. **Interview.** One question at a time, shown as text and played from an
   mp3 by one of four voices picked at random (Ethan, Adrian, Sarah, Hannah).
   The countdown ring starts when the voice stops. Time scales with the
   question (deep 1.5x, quick facts 0.7x). Warning at 75%. When time runs
   out another partner's voice cuts in and the card flashes red. Space or
   Enter ends an answer early, Esc ends the interview. With the mic on, each
   answer is recorded (MediaRecorder) and transcribed live (Web Speech API).
   With the mic off, you type.
3. **Report.** Per answer: speaker, seconds used, cut-off, editable
   transcript, playback, words per minute and filler count. Totals. Buttons:
   - **Copy partner-panel prompt.** Three YC partners matched to your
     industry (from `partners.json`: the roster on ycombinator.com/people
     and the Winter 2027 RFS themes) react to every answer in character,
     score it, rewrite it, vote, and debrief. A practice simulation in
     their style, not their words. Paste it into any chat model.
   - **Copy Jev payload.** A ready JSON body for TypeSafe's Jev scorer
     (`POST https://api.typesafe.ai/v1/systemone`, `model: "jev-latest"`),
     with four `noul` questions per answer plus three overall ones. Send it
     with your own key:
     ```
     curl -s https://api.typesafe.ai/v1/systemone \
       -H "Authorization: Bearer $TYPESAFE_KEY" -H "Content-Type: application/json" \
       -d @jev-payload.json
     ```
   - **Download JSON**, **Print**, **Go again**.
   - Optional: **on-device Whisper** (transformers.js, `whisper-tiny.en`,
     about 40 MB, downloaded only when you click) re-transcribes the
     recordings in the browser for a cleaner text.

## What leaves your device

Nothing. The site is static files. There is no server, no account, no
analytics and no AI call at runtime. Audio and transcripts live in the tab and
disappear when you close it, unless you download the JSON. The Whisper model
is fetched from a CDN only if you ask for it.

## Files

```
index.html       the three screens (setup, interview, report)
style.css        plain CSS, dark theme, works at phone width
app.js           all logic, ~400 lines, sections numbered 1-4
questions.json   73 questions {id, text, type}: 57 GENERAL, 2 PRE_LAUNCH, 14 POST_LAUNCH
partners.json    20 YC partners (name, title, background, what they push on) and the 3-partner panel per industry
audio/           308 mp3 files: audio/<voice>/<id>.mp3 per question, cut1-3 and timeup per voice, manifest.json, cuts.json
```

The audio was generated once with [Fish Audio](https://fish.audio) (model
s2.1-pro, four "Fish Official" voices, emotion tag per question) and committed,
so the site never needs a TTS key.

## Run locally

Any static server works:

```
python3 -m http.server 8080
```

Then open http://localhost:8080. The microphone needs `localhost` or HTTPS.

## Deploy

Static site, no build step. On Vercel: import the repo, framework "Other",
output directory `.`. Or from the folder: `vercel --prod`.

## License

MIT. Questions credited to yci.vercel.app.
