# 📓 NotaSnap — Digitalizador de Caderno

> Nome de trabalho — ainda não definido oficialmente.

Transforme fotos das suas anotações de caderno em PDFs digitais, organizados e com texto de verdade (não só a imagem).

> ⚠️ **Status: em planejamento / desenvolvimento inicial.**
> Ainda não há versão funcional. Este README descreve a ideia e o plano.

---

## 💡 O que é

Um aplicativo onde você abre a câmera, tira foto de uma anotação escrita à mão, e ele transforma isso num PDF bonito e digitalizado. As notas ficam separadas por **assunto** (Cálculo, Física, Inglês...), e em cada assunto você escolhe o **estilo** visual do resumo (minimalista, tecnológico, infantil, etc).

A ideia nasceu de um hábito simples: gosto de estudar fazendo anotações no caderno, e queria uma forma de digitalizar tudo de forma prática, pesquisável e bem apresentada.

---

## ⚙️ Como funciona

O caminho que a foto percorre até virar PDF:

```
[1] Tirar / escolher a foto da nota
        ↓
[2] Melhorar a imagem (corte, contraste, endireitar)
        ↓
[3] Ler o que está escrito na foto  →  Vision AI
        ↓
[4] Limpar e organizar o texto (títulos, parágrafos)
        ↓
[5] Gerar o PDF final no estilo escolhido
        ↓
[6] Salvar / compartilhar
```

**Ideia-chave:** a IA lê a foto e devolve **texto puro** — só as palavras, sem aparência. Esse texto é o "ingrediente cru". A partir dele, o mesmo conteúdo pode virar vários PDFs diferentes. Ou seja: **lê a caligrafia uma vez, estiliza N vezes.**

---

## 🧠 Por que Vision AI (e não OCR tradicional)

Reconhecer letra manuscrita não é um problema de "programação com regras" — cada caligrafia é diferente, sem padrão fixo. Por isso, precisa de IA que *aprendeu* com exemplos.

Um benchmark de 2026 comparando ferramentas de reconhecimento de letra manuscrita mostrou taxas de erro de **0,9% até 95,4%**:

- ✅ **Vision AI** (Claude, GPT, Google Vision, Azure) → melhores resultados.
- ❌ **OCR clássico (Tesseract)** → péssimo em letra de mão (feito para texto impresso).

Importante: **o projeto não constrói a IA** — apenas *usa* uma já treinada, via chamada de API. Todo o resto (câmera, tratamento de imagem, PDF, telas) é programação comum.

---

## 🛠️ Stack (planejada)

A linguagem quase não afeta a qualidade da leitura — isso acontece na Vision AI. A escolha é feita pela parte que fica do lado do app.

### Protótipo (validar a ideia rápido)
- **Python**
- Imagem: Pillow / OpenCV
- PDF: ReportLab / FPDF
- Leitura: Vision AI (via API)

### App final (celular)
- **Dart / Flutter** — um código para Android e iOS
- Câmera: `camera` / `image_picker`
- PDF: package `pdf`
- Leitura: Vision AI (via HTTP)
- *Alternativa:* JavaScript/TypeScript + React Native

---

---

## ⚠️ Riscos conhecidos

- Letra muito ruim pode confundir a IA → testar cedo.
- Custo da Vision AI (algumas cobram por foto).
- Foto tremida ou mal iluminada estraga o resultado.



*Projeto pessoal em desenvolvimento. 🚧*
