# 🎤 Y · una entrevista simulada de YC que de verdad simula una entrevista de YC

**Léelo en:** [English](README.md) · [Português](README.pt.md) · [हिन्दी](README.hi.md)

> Cuatro voces distintas te hacen las preguntas reales de YC en voz alta, como
> si un equipo de YC te estuviera entrevistando. El tiempo es aleatorio y te
> cortan, como en la sala. Todo lo que dices queda escrito en tu dispositivo y
> se convierte en un prompt compacto que te califica. Gratis, sin cuenta, nada
> sale de tu navegador.

### 👉 Pruébalo: **[yc-stt.vercel.app](https://yc-stt.vercel.app)**

Laptop o teléfono. Con audífonos y micrófono es la experiencia real.

## Por qué lo hice

Me estoy preparando para YC. Leer preguntas de una página no sirve. La
entrevista real dura 10 minutos, te interrumpen y nunca terminas la respuesta
que ensayaste. Quería eso, en voz alta, con mis respuestas escritas para poder
recibir feedback de cada una. Así que lo hice: muy estructurado, simple, fácil
de leer y seguir. Sin API keys, sin plan de pago, sin registro. Gratis para
siempre. Se aceptan comentarios, úsalo y dime si te gusta.

## Cómo funciona

1. ⚙️ **Preparación.** Escribe la frase de una línea de tu empresa, elige tu
   industria (eso define los tres partners de YC que te van a apretar), tu
   etapa, qué tan estricto es el tiempo, cuántas preguntas, voz encendida,
   micrófono encendido.
2. 🗣️ **Entrevista.** Una pregunta a la vez, dicha en voz alta por un partner
   al azar (en español: Rodrigo, Pablo, Carmen e Isabela, voces nativas). El
   corte llega en un momento aleatorio, no sabes cuándo. Espacio termina una
   respuesta antes, Esc termina la entrevista. Tus respuestas se graban y se
   transcriben en vivo, en tu dispositivo.
3. 📊 **Reporte.** Cada respuesta con los segundos usados, palabras por minuto,
   muletillas, la transcripción (puedes editarla) y la reproducción. Luego dos
   botones:
   - **Copiar prompt del panel de partners**: tres partners de YC elegidos
     según tu industria reaccionan a cada respuesta en su estilo, la
     califican, la reescriben y votan. Pégalo en cualquier modelo de chat y
     léelo antes de enviarlo.
   - **Copiar payload de Jev**: un cuerpo JSON listo para el evaluador Jev de
     TypeSafe, envíalo con tu propia key.
   - También: descargar el JSON, imprimir, repetir. Whisper opcional en tu
     dispositivo (unos 40 MB, solo si lo pides) para una transcripción más
     limpia.

🌎 **Inglés, español, portugués e hindi.** Cambia el idioma en la cabecera:
cambian las preguntas, los textos y las interrupciones, los partners hablan con
voces nativas de ese idioma (cuatro en español, dos en portugués, dos en hindi),
la transcripción corre en ese idioma y el prompt de calificación le pide a la
IA que responda en él.

## 🔒 Qué sale de tu dispositivo

Nada. Archivos estáticos, sin servidor, sin cuenta, sin analítica, sin llamadas
a IA en tiempo de ejecución. El audio y las transcripciones viven en la pestaña
y desaparecen al cerrarla, salvo que descargues el JSON.

## Créditos

No está afiliado a Y Combinator. Las preguntas vienen de
[yci.vercel.app](https://yci.vercel.app/) de Ali Elroby, que inspiró este
proyecto (misma idea de tiempo e interrupciones, aquí con voz y registro
escrito). El panel de partners es una simulación de práctica en el estilo de
los partners, no son sus palabras.

## Córrelo en tu máquina

```
git clone https://github.com/carlosr-create/y && cd y
python3 -m http.server 8080
```

Abre http://localhost:8080. El micrófono necesita `localhost` o HTTPS.

```
index.html       las tres pantallas (preparación, entrevista, reporte)
style.css        CSS plano, funciona en ancho de teléfono
app.js           toda la lógica, secciones numeradas 1-4
questions.json   73 preguntas {id, text, type}
partners.json    20 partners de YC y el panel de 3 por industria
i18n/            es, pt, hi: textos, preguntas, frases de corte, voces y nombres de partners
audio/           1,032 mp3 en 4 idiomas, uno por pregunta y voz, más los cortes
```

Por cierto, el audio se generó una sola vez con [Fish Audio](https://fish.audio)
(cuatro voces en inglés y voces nativas por idioma, una etiqueta de emoción por
pregunta) y se subió al repo, así que el sitio nunca necesita una key de TTS.
