# 🎤 Y · the YC mock interview, out loud

> Four YC-style partners fire real interview questions at you, out loud, on a
> timer that cuts you off mid-sentence. Your answers are written down on your
> device and turned into a scoring prompt. Free, no account, nothing leaves
> your browser.

### 👉 Try it now: **[yc-stt.vercel.app](https://yc-stt.vercel.app)**

Works on a laptop or a phone. Headphones and the mic on give you the real thing.

## Why I built this

I'm prepping for YC. Reading questions off a page is not the interview. The
real one is 10 minutes, the partners interrupt you, and you never get to finish
the answer you rehearsed. I wanted that pressure, out loud, with a record I
could score afterwards. So I built it: no API keys, no paid plan, no sign-up.
Free forever. If it helps you get in, tell me.

## How it works

1. ⚙️ **Setup.** One line about your company, your industry (it picks the three
   partners who grill you), your stage, how strict the timer is, how many
   questions, voice on, mic on.
2. 🗣️ **Interview.** One question at a time, asked out loud by one of four
   voices. In interrupt mode the cut comes at a random moment, the way it
   does in the room. Space ends an answer early, Esc ends the interview.
   Your answers are recorded and transcribed live, on your device.
3. 📊 **Report.** Every answer with seconds used, words per minute, filler
   words, the transcript (editable) and playback. Then two buttons:
   - **Copy partner-panel prompt**: three YC partners matched to your
     industry react to every answer in character, score it, rewrite it and
     vote. Paste it into any chat model.
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

The audio was generated once with [Fish Audio](https://fish.audio) (four
voices, one emotion tag per question) and committed, so the site never needs
a TTS key.

## 🇲🇽 En español

Y es un simulador gratis de la entrevista de 10 minutos de Y Combinator.
Cuatro voces te hacen las preguntas reales en voz alta, con un cronómetro
que te corta a la mitad, como en la sala. Tus respuestas se transcriben en
tu dispositivo (nada sale de tu navegador) y al final tienes un reporte y un
prompt listo para que tres partners de YC, elegidos según tu industria,
califiquen cada respuesta. Sin cuenta, sin claves, sin costo.
**[Pruébalo aquí](https://yc-stt.vercel.app).**
