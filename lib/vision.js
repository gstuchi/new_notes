// Leitura da caligrafia via Vision AI (Anthropic).
//
// Regra de arquitetura do projeto: esta funcao devolve TEXTO PURO e nada mais.
// Ela NAO sabe o que e PDF, nem estilo, nem assunto. O texto e o dado canonico;
// a aparencia vem depois, em cima desse texto.

import Anthropic from '@anthropic-ai/sdk';

const MODELO = process.env.MODELO_VISION || 'claude-opus-5';

const INSTRUCAO = `Voce recebe a foto de uma pagina de caderno escrita a mao.

Transcreva EXATAMENTE o que esta escrito, em texto puro.

Regras:
- Devolva SOMENTE a transcricao. Sem comentarios, sem "aqui esta o texto", sem markdown.
- Preserve as quebras de linha e a separacao entre paragrafos do original.
- Mantenha a acentuacao correta do portugues.
- Se uma palavra estiver ilegivel, escreva [ilegivel] no lugar dela.
- Nao corrija, nao resuma e nao reescreva o conteudo.
- Se a foto nao tiver nenhum texto legivel, devolva uma linha unica: [sem texto legivel]`;

let clienteCache = null;

function cliente() {
  if (!process.env.ANTHROPIC_API_KEY) {
    const erro = new Error(
      'ANTHROPIC_API_KEY nao configurada. Copie .env.example para .env e coloque sua chave.',
    );
    erro.codigo = 'SEM_CHAVE';
    throw erro;
  }
  if (!clienteCache) clienteCache = new Anthropic();
  return clienteCache;
}

/** true se da pra chamar a Vision AI agora. */
export function chaveConfigurada() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Le a caligrafia de uma foto e devolve o texto puro.
 *
 * @param {string} imagemBase64  bytes da imagem em base64 (sem o prefixo data:)
 * @param {string} tipoMime      ex.: 'image/jpeg'
 * @returns {Promise<string>}
 */
export async function lerCaligrafia(imagemBase64, tipoMime = 'image/jpeg') {
  const resposta = await cliente().messages.create({
    model: MODELO,
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

  const texto = resposta.content
    .filter((bloco) => bloco.type === 'text')
    .map((bloco) => bloco.text)
    .join('\n')
    .trim();

  if (!texto) {
    const erro = new Error('A Vision AI nao devolveu texto nenhum.');
    erro.codigo = 'VAZIO';
    throw erro;
  }
  return texto;
}
