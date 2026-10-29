# 🎤 Y · a YC mock interview that actually mocks a YC interview

> Four different voices ask you the real YC questions out loud, as if a YC
> team was interviewing you. The timer is random and they cut you off, like
> in the room. Everything you say gets written down on your device and turned
> into a tight prompt that scores you. Free, no account, nothing leaves your
> browser.

### 👉 Try it: **[yc-stt.vercel.app](https://yc-stt.vercel.app)**

Laptop or phone. Headphones and mic on is the real thing.

## Why I built this

I'm prepping for YC. Reading questions off a page is not it. The real
interview is 10 minutes, they interrupt you, and you never get to finish the
answer you rehearsed. I wanted that, out loud, with my answers written down so
I could get feedback on every single one. So I made it: extremely structured,
simple, easy to read and follow. No API keys, no paid plan, no sign-up. Free
forever. Feedback accepted, please use it and let me know if you like it.

## How it works

1. ⚙️ **Setup.** Add your company one-liner, pick your industry (it picks the
   three YC partners that grill you), your stage, how strict the timer is, how
   many questions, voice on, mic on.
2. 🗣️ **Interview.** One question at a time, asked out loud by a random
   speaker (2 male, 2 female voices). The cut comes at a random moment, you
   don't know when. Space ends an answer early, Esc ends the interview. Your
   answers are recorded and written down live, on your device.
3. 📊 **Report.** Every answer with seconds used, words per minute, filler
   words, the transcript (you can edit it) and playback. Then two buttons:
   - **Copy partner-panel prompt**: three YC partners matched to your industry
     react to every answer in character, score it, rewrite it and vote. Paste
     it into any chat model and read it before you send it.
   - **Copy Jev payload**: a ready JSON body for TypeSafe's Jev scorer, send
     it with your own key.
   - Also: download the JSON, print, go again. Optional on-device Whisper
     (about 40 MB, only if you click) for a cleaner transcript.

## 🔒 What leaves your device

Nothing. Static files, no server, no account, no analytics, no AI call at
runtime. Audio and transcripts live in the tab and disappear when you close
it, unless you download the JSON.

## Credits

Not affiliated with Y Combinator. The questions come from
[yci.vercel.app](https://yci.vercel.app/) by Ali Elroby, which inspired this
project (same timer and interruption idea, here with voice and a written
record). The partner panel is a practice simulation in the partners' style,
not their words.

## Run it locally

```
git clone https://github.com/carlosr-create/y && cd y
python3 -m http.server 8080
```

Open http://localhost:8080. The microphone needs `localhost` or HTTPS.

```
index.html       the three screens (setup, interview, report)
style.css        plain CSS, works at phone width
app.js           all the logic, sections numbered 1-4
questions.json   73 questions {id, text, type}
partners.json    20 YC partners and the 3-partner panel per industry
audio/           308 mp3 files, one per question and voice, plus the cut-ins
```

Btw the audio was generated once with [Fish Audio](https://fish.audio) (four
voices, one emotion tag per question) and committed, so the site never needs
a TTS key.
