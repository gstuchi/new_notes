# Notas → PDF

Você fotografa uma anotação manuscrita, o app lê a letra e transforma em um PDF
com **texto de verdade** (dá pra copiar, buscar, editar), organizado por assunto.

Este é o protótipo da Fase 1–5 do [lista_de_tarefas.txt](lista_de_tarefas.txt).
Ele roda como um site na sua própria máquina — nada vai pra internet além da
foto que você manda pra Vision AI ler.

---

## Como rodar

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo (você já tem o 24).

```bash
npm install     # só na primeira vez
npm start
```

Depois abra **http://localhost:3000** no navegador.

Para parar o servidor: `Ctrl+C` na janela do terminal.

---

## A chave da Vision AI

Sem chave o app abre e funciona — você consegue digitar o texto à mão, salvar,
organizar por assunto e gerar PDF. **Só a leitura automática da foto não funciona.**

Dá pra usar **Gemini** (tem cota gratuita) ou **Anthropic** (paga por foto).
Basta uma das duas chaves.

**Caminho recomendado — Gemini, de graça:**

1. Pegue uma chave em https://aistudio.google.com/apikey (login com conta Google)
2. Copie o arquivo `.env.example` para `.env`
3. Coloque sua chave lá dentro:

```
GEMINI_API_KEY=AIza...
```

4. Reinicie o servidor (`Ctrl+C` e `npm start` de novo)

Com Anthropic é igual, trocando a linha por `ANTHROPIC_API_KEY=sk-ant-...`
(chave em https://console.anthropic.com).

Se as duas chaves estiverem no `.env`, **o Gemini atende** — é o que tem cota
grátis. Para decidir na mão, ponha `PROVEDOR_VISION=gemini` ou `=anthropic`.
Assim que o app abre, a linha embaixo do título diz quem está lendo.

O `.env` está no `.gitignore` — ele nunca vai pro GitHub.

> **Custo:** o Gemini tem cota grátis por dia, e estourando a cota ele recusa em
> vez de cobrar. Já a Anthropic cobra por foto lida — alguns centavos cada. Esse
> era um dos riscos anotados no plano — vale acompanhar.

---

## Como usar

1. **Pastas** — abra um assunto existente ou toque no botão laranja para criar uma nota.
2. **Editor** — escreva normalmente ou use o clipe para escolher/tirar uma foto.
3. **Leitura** — ajuste a imagem, escolha automático, texto ou mapa mental e toque em `Ler a foto com IA`.
4. **Revisão** — corrija o texto, informe título e pasta e conclua no botão laranja.
5. **Ações** — abra uma nota e use `…` para gerar PDF, mapa visual, PDF com foto ou apagar.

---

## Testar

```bash
npm test
```

35 testes cobrem o gerador de PDF (estrutura, acentos, quebra de linha,
paginação, foto embutida), a física das molas da interface, o armazenamento e a
escolha do provedor de Vision AI. Eles **não** chamam a API paga.

O teste também deixa um PDF de exemplo em `testes/saida/exemplo.pdf` para você
abrir e conferir com o olho.

---

## Onde ficam as coisas

```
servidor.js              o servidor e as rotas da API
lib/vision.js            chama a Vision AI e devolve texto + estrutura da página
lib/pdf.js               gerador de PDF escrito na mão, sem biblioteca externa
lib/armazenamento.js     salva/lê as notas e as fotos
web/index.html           a estrutura da tela
web/estilo.css           o sistema de design (cores, tipografia, materiais)
web/app.js               a lógica da interface
web/mola.js              motor de molas, escrito na mão
testes/teste.js          os testes
dados/                   suas notas (criado sozinho, fora do controle de versão)
```

### O design

A interface segue o jeito da Apple de fazer interface, a partir das palestras
de design deles (WWDC). Em uma frase: **a tela parece viva quando o movimento
começa de onde a coisa está agora, herda a velocidade do seu dedo, e pode ser
agarrado e revertido a qualquer instante.**

Na prática, dentro do app:

- Botão reage no **apertar**, não no soltar.
- A folha de "Apagar esta nota?" pode ser **arrastada pra baixo** pra dispensar.
  Ela gruda no dedo 1:1, resiste feito elástico se você puxar pra cima, e ao
  soltar decide pra onde ir pela **projeção do arremesso** — não pelo ponto
  onde você soltou. Se você agarrar ela no meio da animação, ela obedece na hora.
- Barra do topo é **vidro translúcido**, com o conteúdo rolando por baixo.
  A sombra só aparece quando existe conteúdo passando embaixo dela.
- **Tema claro e escuro** automáticos, seguindo o sistema.
- Respeita **reduzir movimento**, **reduzir transparência** e **aumentar
  contraste** nos ajustes de acessibilidade do seu aparelho.

Nada disso usa biblioteca: o motor de molas está em `web/mola.js`, em ~130 linhas.

### A regra de ouro do projeto

`lib/vision.js` devolve **só texto**. Ele não sabe o que é PDF, nem estilo, nem
assunto. O texto é o dado principal e fica guardado separado da imagem.

Consequência prática: **a letra é lida uma vez, e o PDF pode ser gerado mil
vezes** — trocar de estilo (Fase 6) nunca vai custar outra chamada de IA.

---

## O que ainda não existe

- **Estilos de PDF** (minimalista, tecnológico, infantil) — Fase 6. Por enquanto
  o PDF é um só, feio e funcional, como o plano manda.
- **Corte automático / endireitar** a foto — só tem giro manual por enquanto.
- **App de celular** (Flutter) — Fase seguinte. Este protótipo existe para
  validar a ideia antes disso.
- **Busca dentro das notas** e **exportar .docx** — Fase 7.
