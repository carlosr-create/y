# 🎤 Y · uma entrevista simulada da YC que simula de verdade uma entrevista da YC

**Leia em:** [English](README.md) · [Español](README.es.md) · [हिन्दी](README.hi.md)

> Quatro vozes diferentes fazem as perguntas reais da YC em voz alta, como se
> uma equipe da YC estivesse te entrevistando. O tempo é aleatório e eles te
> cortam, como na sala. Tudo o que você diz fica escrito no seu dispositivo e
> vira um prompt enxuto que te avalia. Grátis, sem conta, nada sai do seu
> navegador.

### 👉 Experimente: **[yc-stt.vercel.app](https://yc-stt.vercel.app)**

Notebook ou celular. Com fone e microfone é a experiência real.

## Por que eu fiz isso

Estou me preparando para a YC. Ler perguntas numa página não resolve. A
entrevista real dura 10 minutos, eles interrompem e você nunca termina a
resposta que ensaiou. Eu queria isso, em voz alta, com as minhas respostas
escritas para receber feedback de cada uma. Então fiz: muito estruturado,
simples, fácil de ler e seguir. Sem API keys, sem plano pago, sem cadastro.
Grátis para sempre. Feedback é bem-vindo, use e me diga se gostou.

## Como funciona

1. ⚙️ **Preparação.** Escreva a frase de uma linha da sua empresa, escolha o
   seu setor (isso define os três partners da YC que vão te apertar), o seu
   estágio, o quão rígido é o tempo, quantas perguntas, voz ligada, microfone
   ligado.
2. 🗣️ **Entrevista.** Uma pergunta de cada vez, feita em voz alta por um
   partner aleatório (em português: André e Letícia, vozes nativas). O corte
   vem num momento aleatório, você não sabe quando. Espaço encerra uma resposta
   antes, Esc encerra a entrevista. Suas respostas são gravadas e transcritas
   ao vivo, no seu dispositivo.
3. 📊 **Relatório.** Cada resposta com os segundos usados, palavras por minuto,
   vícios de linguagem, a transcrição (você pode editar) e a reprodução. Depois
   dois botões:
   - **Copiar prompt do painel de partners**: três partners da YC escolhidos
     pelo seu setor reagem a cada resposta no estilo deles, avaliam, reescrevem
     e votam. Cole em qualquer modelo de chat e leia antes de enviar.
   - **Copiar payload do Jev**: um corpo JSON pronto para o avaliador Jev da
     TypeSafe, envie com a sua própria key.
   - Também: baixar o JSON, imprimir, fazer de novo. Whisper opcional no seu
     dispositivo (uns 40 MB, só se você clicar) para uma transcrição mais
     limpa.

🌎 **Inglês, espanhol, português e hindi.** Troque o idioma no cabeçalho:
mudam as perguntas, os textos e as interrupções, os partners falam com vozes
nativas daquele idioma (quatro em espanhol, duas em português, duas em hindi),
a transcrição roda naquele idioma e o prompt de avaliação pede que a IA
responda nele.

## 🔒 O que sai do seu dispositivo

Nada. Arquivos estáticos, sem servidor, sem conta, sem analytics, sem chamada
de IA em tempo de execução. Áudio e transcrições vivem na aba e somem quando
você fecha, a menos que baixe o JSON.

## Créditos

Não é afiliado à Y Combinator. As perguntas vêm de
[yci.vercel.app](https://yci.vercel.app/) de Ali Elroby, que inspirou este
projeto (mesma ideia de tempo e interrupção, aqui com voz e registro escrito).
O painel de partners é uma simulação de treino no estilo dos partners, não são
as palavras deles.

## Rode na sua máquina

```
git clone https://github.com/carlosr-create/y && cd y
python3 -m http.server 8080
```

Abra http://localhost:8080. O microfone precisa de `localhost` ou HTTPS.

```
index.html       as três telas (preparação, entrevista, relatório)
style.css        CSS puro, funciona em largura de celular
app.js           toda a lógica, seções numeradas 1-4
questions.json   73 perguntas {id, text, type}
partners.json    20 partners da YC e o painel de 3 por setor
i18n/            es, pt, hi: textos, perguntas, falas de corte, vozes e nomes dos partners
audio/           1.032 mp3 em 4 idiomas, um por pergunta e voz, mais os cortes
```

Aliás, o áudio foi gerado uma única vez com [Fish Audio](https://fish.audio)
(quatro vozes em inglês e vozes nativas por idioma, uma tag de emoção por
pergunta) e commitado, então o site nunca precisa de uma key de TTS.
