# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado atual

Protótipo em Node rodando: Fases 1–5 do plano de pé (leitura via Vision AI, melhoria de imagem no navegador, PDF, assuntos, interface). Não é repositório git ainda. Fase 6 (estilos) não começou.

Ler `lista_de_tarefas.txt` antes de mexer: é o registro de progresso (`[x]`) e das decisões já tomadas.

## Comandos

```bash
npm install     # só na primeira vez
npm start       # sobe o servidor em http://localhost:3000
npm test        # 16 testes, não chamam a API paga
```

Rodar um teste sozinho: os testes são um script único (`testes/teste.js`) sem runner. Para isolar um caso, comente as outras chamadas `await teste(...)` ou rode `node -e` importando direto de `lib/`.

Não há lint configurado.

## Mapa do código

- `servidor.js` — servidor HTTP sem framework, rotas da API, carrega `.env` na mão
- `lib/vision.js` — única chamada à Vision AI; devolve **texto puro** e nada mais
- `lib/pdf.js` — gerador de PDF 1.4 escrito à mão (fontes base-14 Helvetica, WinAnsi). Sem dependência externa. Embute a foto original como `DCTDecode` sem decodificar o JPEG.
- `lib/armazenamento.js` — notas em `dados/notas.json`, fotos em `dados/imagens/`
- `web/app.js` — melhoria de imagem via canvas (giro, contraste, brilho, P&B) antes de enviar
- `web/mola.js` — motor de molas próprio (integração rAF), projeção de momento e elástico de borda. Sem dependência.

Única dependência: `@anthropic-ai/sdk`.

## Design da interface

A interface segue a skill `apple-design` (`.agents/skills/apple-design/SKILL.md`). Regras que valem ao mexer no `web/`:

- **Nada de transição CSS em coisa que o dedo controla.** Transição não é interrompível. Onde há gesto, usar `web/mola.js`. Transição CSS só para cor e feedback de pressão.
- **Animar sempre do valor de apresentação**, nunca do alvo. Ao interromper, ler onde o elemento está *agora* (`animacao.valor()`) e partir dali.
- **Ao soltar, entregar a velocidade** do dedo para a mola, e decidir o destino pela **projeção** do arremesso (`projetar()`), não pelo ponto onde soltou.
- **Molas:** `damping 1.0` por padrão (sem quique). Quique (`0.8`) só quando o gesto trouxe impulso. Constantes prontas em `mola.js`: `PADRAO`, `IMPULSO`, `GAVETA`.
- **Tracking é específico do tamanho.** Título grande fecha (negativo), corpo perto de zero, texto miúdo abre. Nunca um `letter-spacing` só.
- **Espaçamento em `rem`**, nunca px fixo — o layout tem que crescer junto com o tamanho de texto do sistema.
- **Três media queries de acessibilidade** são obrigatórias em componente novo: `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast`.

Isso vale para a **interface (Fase 5)**. Os **estilos de PDF continuam sendo Fase 6** e não começaram — `lib/pdf.js` segue propositalmente feio.

## O projeto

App "Notas -> PDF": usuário fotografa anotações manuscritas de caderno; o app extrai o texto real (não só a imagem) e gera um PDF organizado. Notas ficam agrupadas por ASSUNTO (Cálculo, Física, Inglês...) e cada assunto pode usar um ESTILO visual de PDF diferente.

Pipeline: foto → melhoria de imagem (corte/contraste/endireitar) → leitura da letra (Vision AI) → limpeza/estruturação do texto → geração do PDF → salvar/compartilhar.

## Decisões de arquitetura já tomadas (respeitar)

**Separação texto x aparência.** A Vision AI devolve TEXTO PURO, sem formatação. Esse texto é o dado canônico e deve ser persistido separado da renderização. Estilos são templates de PDF aplicados sobre esse texto. Consequência prática: ler a caligrafia uma vez, estilizar N vezes — nunca acoplar a chamada da Vision AI à geração do PDF, nem re-chamar a API para trocar de estilo.

**ASSUNTOS são organização pura, não IA.** Pastas/agrupamento é código comum. Não usar modelo para classificar assunto.

**Vision AI, não OCR clássico.** Tesseract e OCR tradicional são ruins em letra de mão e foram descartados como opção principal. A leitura acontece fora do nosso código — a linguagem escolhida não afeta a qualidade do reconhecimento.

**Ordem de construção é regra, não sugestão.** Estilos (Fase 6) vêm depois de tudo funcionar feio. Não antecipar trabalho de estilo/tema/UI bonita enquanto Fases 1–5 não estiverem de pé.

## Stack

**Protótipo (atual): Node + JavaScript.** Desvio deliberado da Opção A (Python) do plano: não há Python instalado na máquina e o Node já estava. O papel é o mesmo — validar a ideia rápido. Servidor HTTP nativo, sem framework; interface em HTML/JS puro no navegador.

**App (próximo passo): Flutter/Dart**, conforme o plano. Alternativa aceita: React Native (TS). Java e C foram avaliados e descartados.

## Convenções

- Documentação e comentários em português. O `lista_de_tarefas.txt` usa texto sem acentuação — manter esse arquivo como está ao editá-lo.
- Ao concluir itens do plano, marcar `[x]` em `lista_de_tarefas.txt` em vez de manter uma lista paralela.
- Chave da Vision AI vai em variável de ambiente / `.env` fora do controle de versão desde o primeiro protótipo (custo por foto é risco listado no plano).
