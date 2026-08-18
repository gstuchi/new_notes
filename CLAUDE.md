# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado atual

Protótipo em Node rodando: Fases 1–5 do plano de pé (leitura via Vision AI, melhoria de imagem no navegador, PDF, assuntos, interface). Fase 6 (estilos) não começou.

Já é repositório git (`main`, remoto `github.com/gstuchi/new_notes`). O `lista_de_tarefas.txt` ainda traz `[ ] Criar repositorio no GitHub` na Fase 0 — item vencido, marcar na próxima passada.

Ler `lista_de_tarefas.txt` antes de mexer: é o registro de progresso (`[x]`) e das decisões já tomadas.

## Comandos

```bash
npm install     # só na primeira vez
npm start       # sobe o servidor em http://localhost:3000
npm test        # 31 testes, não chamam a API paga
```

Rodar um teste sozinho: os testes são um script único (`testes/teste.js`) sem runner — `await teste(nome, fn)` em sequência, tudo no topo do módulo. Para isolar um caso, comente as outras chamadas `await teste(...)` ou rode `node -e` importando direto de `lib/`. O teste deixa um PDF de olho humano em `testes/saida/exemplo.pdf`.

Os testes de armazenamento escrevem no `dados/notas.json` **de verdade** (não há banco de teste): criam nota no assunto `ZZ-Teste-Automatizado` e apagam no fim, conferindo que a contagem voltou ao que era. Teste novo de armazenamento tem que limpar o que criou.

Não há lint configurado. Node >= 20, ESM (`"type": "module"`).

## Mapa do código

- `servidor.js` — servidor HTTP sem framework, rotas da API, carrega `.env` na mão. Escuta só em `127.0.0.1`. Limite de corpo 25 MB.
- `lib/vision.js` — única chamada à Vision AI; devolve texto editável, tipo da página e estrutura visual. Dois provedores atrás da mesma função, ver seção abaixo.
- `lib/pdf.js` — gerador de PDF 1.4 escrito à mão (fontes base-14 Helvetica, WinAnsi). Sem dependência externa. Embute a foto original como `DCTDecode` sem decodificar o JPEG.
- `lib/armazenamento.js` — notas em `dados/notas.json`, fotos em `dados/imagens/`. `dados/` está no `.gitignore` — o estado local nunca é versionado.
- `web/app.js` — navegação Pastas → Notas → Editor, busca local, edição, melhoria de imagem via canvas e folha arrastável
- `web/mola.js` — motor de molas próprio (integração rAF), projeção de momento e elástico de borda. Sem dependência.
- `web/autenticacao.js` + `web/entrada.js` + `login.html` + `cadastro.html` — **mockup de login**, ver seção abaixo.

Única dependência: `@anthropic-ai/sdk`.

**Servir arquivo novo em `web/`:** a rota estática casa só `/^\/[\w.-]+$/` — pasta plana, um nível. Subpasta (`web/img/logo.png`) dá 404 até `rotear()` mudar.

### Rotas da API (todas em `rotear()`, `servidor.js`)

| Rota | Método | O que faz |
| --- | --- | --- |
| `/api/estado` | GET | `{ chaveConfigurada, provedor, modelo }` — a interface usa pra avisar que a leitura vai falhar |
| `/api/ler` | POST | `{ imagem, formato }` → `{ tipo, texto, estrutura, incertezas }`. Única rota que gasta dinheiro |
| `/api/assuntos` | GET | lista de assuntos com contagem |
| `/api/notas` | GET/POST | listagem (só prévia de 160 caracteres, filtro `?assunto=`) e criação |
| `/api/notas/:id` | GET/PUT/DELETE | nota inteira |
| `/api/notas/:id/pdf` | GET | PDF; `?foto=1` anexa a foto e `?formato=mapa` inclui o mapa visual |
| `/api/notas/:id/foto` | GET | JPEG original |

## Vision AI: dois provedores, uma função

`analisarAnotacao(base64, tipoMime, formato) -> análise` é a entrada principal. `lerCaligrafia()` permanece como compatibilidade para consumidores que precisam apenas da string. Por baixo:

- **Gemini** (`fetch` direto, sem SDK) se houver `GEMINI_API_KEY`; **Anthropic** (`@anthropic-ai/sdk`) se houver `ANTHROPIC_API_KEY`. Com as duas, Gemini ganha (tem cota gratuita). `PROVEDOR_VISION=gemini|anthropic` força na mão.
- Modelos padrão: `gemini-3.6-flash` / `claude-opus-5`. `MODELO_VISION` sobrescreve os dois.
- **Nada de constante no topo do módulo lendo `process.env`.** O `servidor.js` carrega o `.env` *depois* de importar `vision.js` — `provedor()`, `modelo()` e `chaveConfigurada()` são funções justamente por isso. Constante de topo enxerga ambiente vazio.
- Erros carregam `erro.codigo`: `SEM_CHAVE`, `CHAVE_INVALIDA`, `RECUSA`, `INCOMPLETO`, `VAZIO`, `API`. O servidor traduz só `SEM_CHAVE` em 503; qualquer outro vira 502.
- Trocar/adicionar provedor não toca em mais nada — não vazar detalhe de provedor pra fora deste arquivo.

## Login é mockup, não autenticação

`web/autenticacao.js` guarda usuário e sessão no `localStorage`, **senha em texto legível**, sem servidor de contas. Não protege nada: `/api/notas` continua aberto pra quem digitar a URL. Existe só pra demonstração contar a história inteira (cadastrei → entrei → app abriu) e pra marcar onde a autenticação real entra quando virar app Flutter.

Regras ao mexer:

- Não tratar como base de auth de verdade nem construir permissão em cima disso.
- Não é fase do plano — é anotação livre no `lista_de_tarefas.txt`, não item de Fase.
- Guarda de tela é `exigirSessao()` no topo do módulo, com `location.replace` (não `href`) pra tela protegida não ficar no histórico.
- Toda página com guarda precisa também do `pageshow` com `evento.persisted`: o bfcache restaura a página sem re-executar o módulo, e sem isso o botão "voltar" mostra a tela de login já logado. Já está em `app.js` e `entrada.js` — copiar o padrão em página nova.

## Design da interface

A interface segue a skill `apple-design` (`.claude/skills/apple-design/SKILL.md`; `.agents/skills/` tem cópia igual, para outros agentes). Regras que valem ao mexer no `web/`:

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

**Separação conteúdo x aparência.** A Vision AI devolve texto editável e uma estrutura semântica para páginas não lineares. O texto continua sendo a fonte revisável; a estrutura preserva relações como os ramos de mapas mentais. Ambos são persistidos separados da renderização. Consequência prática: ler a caligrafia uma vez, estilizar N vezes — nunca acoplar a chamada da Vision AI à geração do PDF, nem re-chamar a API para trocar de estilo.

**ASSUNTOS são organização pura, não IA.** Pastas/agrupamento é código comum. Não usar modelo para classificar assunto.

**Vision AI, não OCR clássico.** Tesseract e OCR tradicional são ruins em letra de mão e foram descartados como opção principal. A leitura acontece fora do nosso código — a linguagem escolhida não afeta a qualidade do reconhecimento.

**Ordem de construção é regra, não sugestão.** Estilos (Fase 6) vêm depois de tudo funcionar feio. Não antecipar trabalho de estilo/tema/UI bonita enquanto Fases 1–5 não estiverem de pé.

## Stack

**Protótipo (atual): Node + JavaScript.** Desvio deliberado da Opção A (Python) do plano: não há Python instalado na máquina e o Node já estava. O papel é o mesmo — validar a ideia rápido. Servidor HTTP nativo, sem framework; interface em HTML/JS puro no navegador.

**App (próximo passo): Flutter/Dart**, conforme o plano. Alternativa aceita: React Native (TS). Java e C foram avaliados e descartados.

## Convenções

- Documentação e comentários em português. **Código sem acentuação** (identificadores, comentários, strings de erro do servidor) — os arquivos `.md` de documentação usam acento normal.
- O `lista_de_tarefas.txt` usa texto sem acentuação — manter esse arquivo como está ao editá-lo.
- Ao concluir itens do plano, marcar `[x]` em `lista_de_tarefas.txt` em vez de manter uma lista paralela.
- Chave da Vision AI vai em variável de ambiente / `.env` fora do controle de versão desde o primeiro protótipo (custo por foto é risco listado no plano).
- Sem chave o app abre e funciona inteiro (digitar texto, salvar, assunto, PDF); só `/api/ler` falha, com 503 e código `SEM_CHAVE`. Não quebrar essa propriedade.

## Documentação: qual arquivo vale

- `LEIAME.md` — **atualizado**, descreve o protótipo que existe hoje (inclusive os dois provedores). É a referência.
- `.env.example` — **atualizado**: `GEMINI_API_KEY` (gratuito) primeiro, `ANTHROPIC_API_KEY`, `PROVEDOR_VISION`, `MODELO_VISION`.
- `README.md` — **desatualizado**: diz "ainda não há versão funcional" e anuncia stack Python. Ficou de antes do protótipo. Ao mexer em doc, atualizar este ou apontar pro `LEIAME.md`.
