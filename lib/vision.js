// Leitura da caligrafia via Vision AI.
//
// A IA devolve uma analise estruturada. O campo `texto` continua sendo o dado
// canonico e editavel; `estrutura` preserva relacoes visuais como os ramos de
// um mapa mental.
//
// Dois provedores atendidos pela mesma funcao. Quem manda e a chave que existir
// no ambiente: GEMINI_API_KEY -> Gemini, ANTHROPIC_API_KEY -> Anthropic. Com as
// duas, Gemini ganha (e o que tem cota gratuita). PROVEDOR_VISION forca um dos
// dois quando quiser decidir na mao.
//
// Trocar de provedor nao toca em mais nada do projeto: quem chama daqui de fora
// `lerCaligrafia` continua existindo para compatibilidade com chamadas antigas.

import Anthropic from '@anthropic-ai/sdk';

const MODELO_PADRAO = {
  gemini: 'gemini-3.6-flash',
  anthropic: 'claude-opus-5',
};

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

const FORMATOS = new Set(['automatico', 'texto', 'mapa_mental']);

function instrucao(formato) {
  const pedido = FORMATOS.has(formato) ? formato : 'automatico';
  return `Voce recebe a foto de uma pagina de caderno escrita a mao.

Analise a pagina inteira, inclusive posicao, caixas, setas e linhas. O formato solicitado e "${pedido}".
Se for automatico, classifique como texto, lista, mapa_mental, tabela ou misto.

Devolva SOMENTE um objeto JSON valido, sem markdown, neste formato:
{
  "tipo": "texto|lista|mapa_mental|tabela|misto",
  "tituloSugerido": "titulo curto ou string vazia",
  "texto": "transcricao fiel e editavel",
  "estrutura": {
    "temaCentral": "somente para mapa mental",
    "ramos": [{
      "titulo": "...",
      "itens": ["..."],
      "posicao": "esquerda|direita|acima|abaixo",
      "ordem": 1,
      "rotuloConexao": "somente palavras escritas sobre a conexao, ou string vazia"
    }]
  },
  "incertezas": ["trechos ou relacoes que nao foi possivel confirmar"]
}

Regras obrigatorias:
- Em "tipo", escolha exatamente um valor: texto, lista, mapa_mental, tabela ou misto.
- Nao invente, complete, corrija, resuma nem explique o conteudo.
- Mantenha a acentuacao e a grafia visivel, mesmo quando parecer errada.
- Use [ilegivel] para palavra ilegivel e registre a localizacao em incertezas.
- Preserve a hierarquia indicada por tamanho, proximidade, caixas, setas e linhas.
- Em mapa mental, o tema central e o bloco do qual sai o maior numero de conexoes; nao e o titulo da pagina nem necessariamente o maior texto.
- Siga cada linha a partir do tema central ate o bloco em que ela termina. Cada bloco diretamente conectado e um ramo.
- Registre a posicao original de cada ramo e use ordem de cima para baixo ou da esquerda para a direita.
- Um texto menor dentro do mesmo contorno pertence a itens; nao o transforme em outro ramo.
- Nao transforme proximidade em relacao se nao houver uma linha ou seta ligando os blocos.
- Linha e seta sao formas graficas, nao conteudo. Nunca escreva "linha", "seta" ou "Ligacao" no texto.
- Preencha rotuloConexao apenas quando houver palavras realmente escritas sobre a linha ou seta.
- Para mapa mental, formate texto como: primeira linha "# tema", depois cada ramo como "## ramo" e seus itens como "- item".
- Para tabela, preserve colunas com texto separado por " | ".
- Se nao houver texto legivel, use "[sem texto legivel]" e estrutura vazia.`;
}

function limparJson(texto) {
  const limpo = String(texto || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const inicio = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  return inicio === -1 || fim === -1 ? limpo : limpo.slice(inicio, fim + 1);
}

function textoDoMapa(estrutura) {
  const tema = String(estrutura?.temaCentral || '').trim() || '[tema central ilegivel]';
  const linhas = [`# ${tema}`];
  for (const ramo of Array.isArray(estrutura?.ramos) ? estrutura.ramos : []) {
    const titulo = String(ramo?.titulo || '').trim();
    if (!titulo) continue;
    linhas.push('', `## ${titulo}`);
    for (const item of Array.isArray(ramo.itens) ? ramo.itens : []) {
      const valor = String(item || '').trim();
      if (valor) linhas.push(`- ${valor}`);
    }
  }
  return linhas.join('\n');
}

/** Converte e valida a resposta JSON da IA sem depender de rede. */
export function analisarResposta(textoBruto, formatoSolicitado = 'automatico') {
  let bruto;
  try {
    bruto = JSON.parse(limparJson(textoBruto));
  } catch {
    const erro = new Error('A IA devolveu uma resposta que nao esta em JSON valido. Tente ler a foto novamente.');
    erro.codigo = 'RESPOSTA_INVALIDA';
    throw erro;
  }

  const tipos = new Set(['texto', 'lista', 'mapa_mental', 'tabela', 'misto']);
  let tipo = tipos.has(bruto?.tipo) ? bruto.tipo : 'texto';
  if (formatoSolicitado === 'texto') tipo = 'texto';
  if (formatoSolicitado === 'mapa_mental') tipo = 'mapa_mental';

  const estrutura = bruto?.estrutura && typeof bruto.estrutura === 'object'
    ? { ...bruto.estrutura }
    : {};
  if (Array.isArray(estrutura.ramos)) {
    const posicoes = new Set(['esquerda', 'direita', 'acima', 'abaixo']);
    estrutura.ramos = estrutura.ramos.map((ramo, indice) => ({
      titulo: String(ramo?.titulo || '').trim(),
      itens: Array.isArray(ramo?.itens)
        ? ramo.itens.map((item) => String(item || '').trim()).filter(Boolean)
        : [],
      posicao: posicoes.has(ramo?.posicao) ? ramo.posicao : '',
      ordem: Number.isFinite(Number(ramo?.ordem)) ? Number(ramo.ordem) : indice + 1,
      rotuloConexao: String(ramo?.rotuloConexao || '').trim(),
    })).filter((ramo) => ramo.titulo);
  }
  const texto = tipo === 'mapa_mental' && estrutura.temaCentral
    ? textoDoMapa(estrutura)
    : String(bruto?.texto || '').trim();

  return {
    tipo,
    tituloSugerido: String(bruto?.tituloSugerido || '').trim(),
    texto: texto || '[sem texto legivel]',
    estrutura,
    incertezas: Array.isArray(bruto?.incertezas)
      ? bruto.incertezas.map((item) => String(item)).filter(Boolean)
      : [],
  };
}

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

async function lerComGemini(imagemBase64, tipoMime, formato) {
  const resposta = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      model: modelo(),
      input: [
        { type: 'text', text: instrucao(formato) },
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

async function lerComAnthropic(imagemBase64, tipoMime, formato) {
  const resposta = await cliente().messages.create({
    model: modelo(),
    max_tokens: 16000,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: tipoMime, data: imagemBase64 } },
          { type: 'text', text: instrucao(formato) },
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
 * Le a caligrafia de uma foto e devolve apenas o texto, para compatibilidade.
 *
 * @param {string} imagemBase64  bytes da imagem em base64 (sem o prefixo data:)
 * @param {string} tipoMime      ex.: 'image/jpeg'
 * @returns {Promise<string>}
 */
export async function lerCaligrafia(imagemBase64, tipoMime = 'image/jpeg') {
  const analise = await analisarAnotacao(imagemBase64, tipoMime, 'texto');
  return analise.texto;
}

/**
 * Analisa a pagina e preserva seu tipo e suas relacoes visuais.
 *
 * @param {string} imagemBase64
 * @param {string} tipoMime
 * @param {'automatico'|'texto'|'mapa_mental'} formato
 */
export async function analisarAnotacao(
  imagemBase64,
  tipoMime = 'image/jpeg',
  formato = 'automatico',
) {
  const atual = provedor();
  if (!atual || !chaveConfigurada()) throw erroSemChave();

  const pedido = FORMATOS.has(formato) ? formato : 'automatico';
  const resposta = atual === 'gemini'
    ? await lerComGemini(imagemBase64, tipoMime, pedido)
    : await lerComAnthropic(imagemBase64, tipoMime, pedido);

  if (!resposta) {
    const erro = new Error('A Vision AI nao devolveu texto nenhum.');
    erro.codigo = 'VAZIO';
    throw erro;
  }
  return analisarResposta(resposta, pedido);
}
