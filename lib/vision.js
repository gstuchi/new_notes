// Leitura da caligrafia via Vision AI.
//
// Regra de arquitetura do projeto: esta funcao devolve TEXTO PURO e nada mais.
// Ela NAO sabe o que e PDF, nem estilo, nem assunto. O texto e o dado canonico;
// a aparencia vem depois, em cima desse texto.
//
// Dois provedores atendidos pela mesma funcao. Quem manda e a chave que existir
// no ambiente: GEMINI_API_KEY -> Gemini, ANTHROPIC_API_KEY -> Anthropic. Com as
// duas, Gemini ganha (e o que tem cota gratuita). PROVEDOR_VISION forca um dos
// dois quando quiser decidir na mao.
//
// Trocar de provedor nao toca em mais nada do projeto: quem chama daqui de fora
// so conhece lerCaligrafia(base64, tipoMime) -> string.

import Anthropic from '@anthropic-ai/sdk';

const MODELO_PADRAO = {
  gemini: 'gemini-3.6-flash',
  anthropic: 'claude-opus-5',
};

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

const INSTRUCAO = `Voce recebe a foto de uma pagina de caderno escrita a mao.

Transcreva EXATAMENTE o que esta escrito, em texto puro.

Regras:
- Devolva SOMENTE a transcricao. Sem comentarios, sem "aqui esta o texto", sem markdown.
- Preserve as quebras de linha e a separacao entre paragrafos do original.
- Mantenha a acentuacao correta do portugues.
- Se uma palavra estiver ilegivel, escreva [ilegivel] no lugar dela.
- Nao corrija, nao resuma e nao reescreva o conteudo.
- Se a foto nao tiver nenhum texto legivel, devolva uma linha unica: [sem texto legivel]`;

// --- quem atende agora ------------------------------------------------------
// Tudo aqui e lido em TEMPO DE CHAMADA, nunca no topo do modulo. O servidor
// carrega o .env depois de importar este arquivo (import roda antes do corpo de
// quem importa), entao uma constante de topo enxergaria o ambiente ainda vazio.

/** 'gemini', 'anthropic' ou null se nao ha chave nenhuma. */
export function provedor() {
  const forcado = (process.env.PROVEDOR_VISION || '').trim().toLowerCase();
  if (forcado === 'gemini' || forcado === 'anthropic') return forcado;
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

/** Modelo em uso, do .env ou o padrao do provedor. */
export function modelo() {
  const atual = provedor();
  if (!atual) return null;
  return process.env.MODELO_VISION || MODELO_PADRAO[atual];
}

/** true se da pra chamar a Vision AI agora. */
export function chaveConfigurada() {
  const atual = provedor();
  if (atual === 'gemini') return Boolean(process.env.GEMINI_API_KEY);
  if (atual === 'anthropic') return Boolean(process.env.ANTHROPIC_API_KEY);
  return false;
}

function erroSemChave() {
  const erro = new Error(
    'Nenhuma chave de Vision AI configurada. Copie .env.example para .env e '
    + 'coloque GEMINI_API_KEY (gratuito) ou ANTHROPIC_API_KEY.',
  );
  erro.codigo = 'SEM_CHAVE';
  return erro;
}

// --- Gemini -----------------------------------------------------------------

/**
 * Acha o texto na resposta do Gemini.
 *
 * Exportada porque e a unica parte da conversa com o Gemini que da pra testar
 * sem gastar cota: recebe o JSON ja pronto e devolve a string.
 *
 * Os dois caminhos existem de verdade:
 *
 * - output_text: atalho que os SDKs oficiais (Python/JS) montam sozinhos.
 *   Chamando por HTTP na mao, como aqui, ele NAO vem -- conferido em
 *   17/08/2026, resposta 200 sem o campo.
 * - steps[].content[]: a forma longa, essa sim sempre presente. E o caminho
 *   que roda de fato no nosso codigo.
 *
 * Ficam os dois porque o atalho e barato de checar e some se um dia a API
 * passar a mandar o campo.
 */
export function textoDaResposta(resposta) {
  if (!resposta || typeof resposta !== 'object') return '';

  if (typeof resposta.output_text === 'string' && resposta.output_text.trim()) {
    return resposta.output_text.trim();
  }

  const passos = Array.isArray(resposta.steps) ? resposta.steps : [];
  const pedacos = [];
  for (const passo of passos) {
    const blocos = Array.isArray(passo?.content) ? passo.content : [];
    for (const bloco of blocos) {
      if (bloco?.type === 'text' && typeof bloco.text === 'string') pedacos.push(bloco.text);
    }
  }
  return pedacos.join('\n').trim();
}

/** Mensagem de erro legivel a partir do corpo devolvido pela API. */
function erroDoGemini(status, corpo) {
  const detalhe = corpo?.error?.message
    || (Array.isArray(corpo?.errors) && corpo.errors[0]?.message)
    || JSON.stringify(corpo).slice(0, 300);
  const erro = new Error(`Gemini respondeu ${status}: ${detalhe}`);
  erro.codigo = status === 401 || status === 403 ? 'CHAVE_INVALIDA' : 'API';
  return erro;
}

async function lerComGemini(imagemBase64, tipoMime) {
  const resposta = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      model: modelo(),
      input: [
        { type: 'text', text: INSTRUCAO },
        { type: 'image', data: imagemBase64, mime_type: tipoMime },
      ],
    }),
  });

  // Erro de HTTP nao vira excecao no fetch -- tem que olhar o ok na mao.
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw erroDoGemini(resposta.status, corpo);

  if (corpo.status && corpo.status !== 'completed') {
    const erro = new Error(`O Gemini nao terminou a leitura (status: ${corpo.status}).`);
    erro.codigo = corpo.status === 'failed' ? 'RECUSA' : 'INCOMPLETO';
    throw erro;
  }

  return textoDaResposta(corpo);
}

// --- Anthropic --------------------------------------------------------------

let clienteCache = null;

function cliente() {
  if (!clienteCache) clienteCache = new Anthropic();
  return clienteCache;
}

async function lerComAnthropic(imagemBase64, tipoMime) {
  const resposta = await cliente().messages.create({
    model: modelo(),
    max_tokens: 16000,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: tipoMime, data: imagemBase64 } },
          { type: 'text', text: INSTRUCAO },
        ],
      },
    ],
  });

  if (resposta.stop_reason === 'refusal') {
    const erro = new Error('O modelo recusou processar esta imagem.');
    erro.codigo = 'RECUSA';
    throw erro;
  }

  return resposta.content
    .filter((bloco) => bloco.type === 'text')
    .map((bloco) => bloco.text)
    .join('\n')
    .trim();
}

// --- porta de entrada -------------------------------------------------------

/**
 * Le a caligrafia de uma foto e devolve o texto puro.
 *
 * @param {string} imagemBase64  bytes da imagem em base64 (sem o prefixo data:)
 * @param {string} tipoMime      ex.: 'image/jpeg'
 * @returns {Promise<string>}
 */
export async function lerCaligrafia(imagemBase64, tipoMime = 'image/jpeg') {
  const atual = provedor();
  if (!atual || !chaveConfigurada()) throw erroSemChave();

  const texto = atual === 'gemini'
    ? await lerComGemini(imagemBase64, tipoMime)
    : await lerComAnthropic(imagemBase64, tipoMime);

  if (!texto) {
    const erro = new Error('A Vision AI nao devolveu texto nenhum.');
    erro.codigo = 'VAZIO';
    throw erro;
  }
  return texto;
}
