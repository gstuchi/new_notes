// Gerador de PDF sem dependencias externas.
// Escreve um PDF 1.4 na mao, usando as fontes base-14 (Helvetica), que ja
// existem em qualquer leitor de PDF -- por isso nao precisamos embutir fonte.
// A codificacao usada e WinAnsi (Windows-1252), que cobre todos os acentos
// do portugues.
//
// Fase 3 do plano: "PDF feio mesmo, so pra funcionar". Nada de estilos aqui.

// ---------------------------------------------------------------------------
// Larguras das fontes (unidades de 1/1000 do tamanho da fonte), tabela AFM.
// ---------------------------------------------------------------------------

const LARGURAS_NORMAL = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const LARGURAS_NEGRITO = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

// Letras acentuadas tem a mesma largura da letra base em Helvetica.
const BASE_ACENTUADA = {
  'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
  'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
  'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
  'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
  'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
  'ç': 'c', 'ñ': 'n', 'ý': 'y', 'ÿ': 'y',
  'Á': 'A', 'À': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A',
  'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
  'Í': 'I', 'Ì': 'I', 'Î': 'I', 'Ï': 'I',
  'Ó': 'O', 'Ò': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O',
  'Ú': 'U', 'Ù': 'U', 'Û': 'U', 'Ü': 'U',
  'Ç': 'C', 'Ñ': 'N', 'Ý': 'Y',
  'º': 'o', 'ª': 'a',
};

// Caracteres que o texto costuma trazer e que existem no WinAnsi, mas fora do
// Latin-1 puro. Mapa: caractere Unicode -> byte WinAnsi.
const WINANSI_ESPECIAIS = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84,
  '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88,
  '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94,
  '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98,
  '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c,
};

const LARGURAS_ESPECIAIS = {
  '‘': 222, '’': 222, '“': 333, '”': 333,
  '–': 556, '—': 1000, '…': 1000, '•': 350,
};

/** Largura de um caractere, em unidades de 1/1000 do tamanho da fonte. */
function larguraCaractere(ch, negrito) {
  const tabela = negrito ? LARGURAS_NEGRITO : LARGURAS_NORMAL;
  const codigo = ch.charCodeAt(0);
  if (codigo >= 32 && codigo <= 126) return tabela[codigo - 32];
  if (BASE_ACENTUADA[ch]) {
    const base = BASE_ACENTUADA[ch].charCodeAt(0);
    return tabela[base - 32];
  }
  if (LARGURAS_ESPECIAIS[ch] !== undefined) return LARGURAS_ESPECIAIS[ch];
  return tabela['n'.charCodeAt(0) - 32];
}

/** Largura de um texto inteiro, em pontos, para um tamanho de fonte. */
export function larguraTexto(texto, tamanho, negrito = false) {
  let total = 0;
  for (const ch of texto) total += larguraCaractere(ch, negrito);
  return (total * tamanho) / 1000;
}

// ---------------------------------------------------------------------------
// Codificacao de string para dentro do PDF
// ---------------------------------------------------------------------------

/** Converte um caractere Unicode para o byte correspondente em WinAnsi. */
function byteWinAnsi(ch) {
  if (WINANSI_ESPECIAIS[ch] !== undefined) return WINANSI_ESPECIAIS[ch];
  const codigo = ch.charCodeAt(0);
  if (codigo <= 0xff) return codigo;
  // Caractere que o WinAnsi nao tem: tenta a letra base sem acento.
  const base = BASE_ACENTUADA[ch];
  if (base) return base.charCodeAt(0);
  return 0x3f; // '?'
}

/** Monta o literal de string do PDF: "(texto escapado)" em bytes WinAnsi. */
function stringPdf(texto) {
  const bytes = [0x28]; // '('
  for (const ch of texto) {
    const b = byteWinAnsi(ch);
    if (b === 0x28 || b === 0x29 || b === 0x5c) bytes.push(0x5c); // ( ) \
    bytes.push(b);
  }
  bytes.push(0x29); // ')'
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------------------
// Quebra de linha
// ---------------------------------------------------------------------------

/**
 * Quebra um paragrafo em linhas que cabem em `larguraMax` pontos.
 * Palavras maiores que a linha inteira sao cortadas por caractere.
 */
export function quebrarLinhas(paragrafo, larguraMax, tamanho, negrito = false) {
  const linhas = [];
  let linha = '';

  const empurrar = () => {
    if (linha.length > 0) linhas.push(linha);
    linha = '';
  };

  for (const palavra of paragrafo.split(/\s+/)) {
    if (palavra === '') continue;
    const candidata = linha === '' ? palavra : `${linha} ${palavra}`;
    if (larguraTexto(candidata, tamanho, negrito) <= larguraMax) {
      linha = candidata;
      continue;
    }
    empurrar();
    // Palavra sozinha maior que a linha: corta por caractere.
    if (larguraTexto(palavra, tamanho, negrito) > larguraMax) {
      let pedaco = '';
      for (const ch of palavra) {
        if (larguraTexto(pedaco + ch, tamanho, negrito) > larguraMax) {
          linhas.push(pedaco);
          pedaco = ch;
        } else {
          pedaco += ch;
        }
      }
      linha = pedaco;
    } else {
      linha = palavra;
    }
  }
  empurrar();
  return linhas.length > 0 ? linhas : [''];
}

// ---------------------------------------------------------------------------
// Leitura das dimensoes de um JPEG (para embutir a foto original)
// ---------------------------------------------------------------------------

/**
 * Le largura/altura/componentes de um JPEG.
 * Retorna null se o buffer nao for um JPEG que saibamos ler.
 */
export function dimensoesJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let i = 2;
  while (i < buffer.length - 1) {
    if (buffer[i] !== 0xff) { i++; continue; }
    const marcador = buffer[i + 1];
    // Marcadores sem payload.
    if (marcador === 0xd8 || marcador === 0xd9 || (marcador >= 0xd0 && marcador <= 0xd7) || marcador === 0x01) {
      i += 2;
      continue;
    }
    if (i + 4 > buffer.length) return null;
    const tamanho = buffer.readUInt16BE(i + 2);
    // SOF0..SOF15, exceto os marcadores DHT(c4), JPGA(c8) e DAC(cc).
    const ehSof = marcador >= 0xc0 && marcador <= 0xcf
      && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc;
    if (ehSof) {
      if (i + 9 > buffer.length) return null;
      return {
        altura: buffer.readUInt16BE(i + 5),
        largura: buffer.readUInt16BE(i + 7),
        componentes: buffer[i + 9],
      };
    }
    i += 2 + tamanho;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Montagem do documento
// ---------------------------------------------------------------------------

const A4 = { largura: 595.28, altura: 841.89 };
const MARGEM = 56; // ~2 cm

class Documento {
  constructor() {
    this.objetos = []; // objetos[i] = Buffer com o corpo do objeto (i+1 e o numero)
  }

  novoObjeto(corpo) {
    this.objetos.push(Buffer.isBuffer(corpo) ? corpo : Buffer.from(corpo, 'latin1'));
    return this.objetos.length; // numero do objeto (1-based)
  }

  serializar(numeroRaiz) {
    const partes = [];
    let deslocamento = 0;
    const escrever = (buf) => {
      const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, 'latin1');
      partes.push(b);
      deslocamento += b.length;
    };

    escrever('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');

    const posicoes = [];
    for (let i = 0; i < this.objetos.length; i++) {
      posicoes.push(deslocamento);
      escrever(`${i + 1} 0 obj\n`);
      escrever(this.objetos[i]);
      escrever('\nendobj\n');
    }

    const inicioXref = deslocamento;
    escrever(`xref\n0 ${this.objetos.length + 1}\n`);
    escrever('0000000000 65535 f \n');
    for (const pos of posicoes) {
      escrever(`${String(pos).padStart(10, '0')} 00000 n \n`);
    }
    escrever(`trailer\n<< /Size ${this.objetos.length + 1} /Root ${numeroRaiz} 0 R >>\n`);
    escrever(`startxref\n${inicioXref}\n%%EOF\n`);

    return Buffer.concat(partes);
  }
}

function fluxo(dicionarioSemLength, dados) {
  const corpo = Buffer.isBuffer(dados) ? dados : Buffer.from(dados, 'latin1');
  return Buffer.concat([
    Buffer.from(`<< ${dicionarioSemLength} /Length ${corpo.length} >>\nstream\n`, 'latin1'),
    corpo,
    Buffer.from('\nendstream', 'latin1'),
  ]);
}

/** Reconstroi um mapa a partir do texto editavel; usa a estrutura da IA como fallback. */
export function mapaDoTexto(texto, estrutura = {}) {
  const mapa = { temaCentral: '', ramos: [] };
  const ramosEstruturados = Array.isArray(estrutura?.ramos) ? estrutura.ramos : [];
  let ramoAtual = null;
  for (const linhaBruta of String(texto || '').split(/\r?\n/)) {
    const linha = linhaBruta.trim();
    if (linha.startsWith('# ')) {
      mapa.temaCentral = linha.slice(2).trim();
    } else if (linha.startsWith('## ')) {
      ramoAtual = { titulo: linha.slice(3).trim(), itens: [] };
      if (ramoAtual.titulo) mapa.ramos.push(ramoAtual);
    } else if (linha.startsWith('- ') && ramoAtual) {
      const item = linha.slice(2).trim();
      if (!/^liga(?:c|ç)[aã]o:\s*(linha|seta|tra(?:c|ç)o)$/i.test(item)) {
        ramoAtual.itens.push(item);
      }
    }
  }

  if (!mapa.temaCentral) mapa.temaCentral = String(estrutura?.temaCentral || '').trim();
  if (mapa.ramos.length === 0) {
    mapa.ramos = ramosEstruturados
      .map((ramo) => ({
        titulo: String(ramo?.titulo || '').trim(),
        itens: (Array.isArray(ramo?.itens) ? ramo.itens : [])
          .map((item) => String(item || '').trim())
          .filter(Boolean),
        posicao: String(ramo?.posicao || ''),
        ordem: Number(ramo?.ordem) || 0,
      }))
      .filter((ramo) => ramo.titulo);
  } else {
    mapa.ramos = mapa.ramos.map((ramo) => {
      const original = ramosEstruturados.find(
        (item) => String(item?.titulo || '').trim().toLocaleLowerCase('pt-BR')
          === ramo.titulo.toLocaleLowerCase('pt-BR'),
      );
      return {
        ...ramo,
        posicao: String(original?.posicao || ''),
        ordem: Number(original?.ordem) || 0,
      };
    });
  }
  return mapa;
}

function comandoTexto(texto, x, y, tamanho, negrito = false) {
  return Buffer.concat([
    Buffer.from(`0 g BT ${negrito ? '/F2' : '/F1'} ${tamanho} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td `, 'latin1'),
    stringPdf(texto),
    Buffer.from(' Tj ET\n', 'latin1'),
  ]);
}

function paginasDeMapa(doc, nota, numeroPaginas, fonteNormal, fonteNegrito) {
  const mapa = mapaDoTexto(nota.texto, nota.estrutura);
  if (!mapa.temaCentral || mapa.ramos.length === 0) return [];

  const largura = A4.altura;
  const altura = A4.largura;
  const margem = 34;
  const larguraRamo = 220;
  const alturaRamo = 142;
  const larguraCentro = 190;
  const alturaCentro = 68;
  const xCentro = (largura - larguraCentro) / 2;
  const yCentro = (altura - alturaCentro) / 2;
  const paginas = [];

  for (let inicio = 0; inicio < mapa.ramos.length; inicio += 6) {
    const ramos = mapa.ramos.slice(inicio, inicio + 6);
    const grupos = { esquerda: [], direita: [], acima: [], abaixo: [] };
    ramos.forEach((ramo, indice) => {
      const posicao = Object.hasOwn(grupos, ramo.posicao)
        ? ramo.posicao
        : (indice % 2 === 0 ? 'esquerda' : 'direita');
      grupos[posicao].push(ramo);
    });
    for (const grupo of Object.values(grupos)) {
      grupo.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    }
    const caixas = [];

    for (const posicao of ['esquerda', 'direita']) {
      const grupo = grupos[posicao];
      grupo.forEach((ramo, indice) => {
        const intervalo = grupo.length === 1
          ? 0
          : (altura - margem * 2 - alturaRamo) / (grupo.length - 1);
        caixas.push({
          ramo,
          posicao,
          x: posicao === 'esquerda' ? margem : largura - margem - larguraRamo,
          y: altura - margem - alturaRamo - indice * intervalo,
        });
      });
    }
    for (const posicao of ['acima', 'abaixo']) {
      const grupo = grupos[posicao];
      grupo.forEach((ramo, indice) => {
        const intervalo = larguraRamo + 20;
        caixas.push({
          ramo,
          posicao,
          x: (largura - (grupo.length * larguraRamo + (grupo.length - 1) * 20)) / 2
            + indice * intervalo,
          y: posicao === 'acima' ? altura - margem - alturaRamo : margem,
        });
      });
    }

    const comandos = [];
    // Conexoes primeiro, para passarem por baixo das caixas.
    comandos.push(Buffer.from('0.64 G 1.2 w\n', 'latin1'));
    for (const caixa of caixas) {
      const horizontal = caixa.posicao === 'esquerda' || caixa.posicao === 'direita';
      const x1 = horizontal
        ? (caixa.posicao === 'esquerda' ? xCentro : xCentro + larguraCentro)
        : xCentro + larguraCentro / 2;
      const x2 = horizontal
        ? (caixa.posicao === 'esquerda' ? caixa.x + larguraRamo : caixa.x)
        : caixa.x + larguraRamo / 2;
      const y1 = horizontal
        ? yCentro + alturaCentro / 2
        : (caixa.posicao === 'acima' ? yCentro + alturaCentro : yCentro);
      const y2 = horizontal
        ? caixa.y + alturaRamo / 2
        : (caixa.posicao === 'acima' ? caixa.y : caixa.y + alturaRamo);
      comandos.push(Buffer.from(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`, 'latin1'));
    }

    // Tema central.
    comandos.push(Buffer.from(`0.88 0.94 1 rg ${xCentro} ${yCentro} ${larguraCentro} ${alturaCentro} re f `
      + `0.28 0.52 0.82 RG ${xCentro} ${yCentro} ${larguraCentro} ${alturaCentro} re S\n`, 'latin1'));
    const linhasCentro = quebrarLinhas(mapa.temaCentral, larguraCentro - 20, 13, true).slice(0, 3);
    linhasCentro.forEach((linha, indice) => {
      const x = xCentro + (larguraCentro - larguraTexto(linha, 13, true)) / 2;
      const y = yCentro + alturaCentro / 2 + 7 - indice * 16;
      comandos.push(comandoTexto(linha, x, y, 13, true));
    });

    for (const caixa of caixas) {
      comandos.push(Buffer.from(`0.97 g ${caixa.x} ${caixa.y.toFixed(2)} ${larguraRamo} ${alturaRamo} re f `
        + `0.72 G ${caixa.x} ${caixa.y.toFixed(2)} ${larguraRamo} ${alturaRamo} re S\n`, 'latin1'));
      let y = caixa.y + alturaRamo - 19;
      for (const linha of quebrarLinhas(caixa.ramo.titulo, larguraRamo - 20, 11, true).slice(0, 2)) {
        comandos.push(comandoTexto(linha, caixa.x + 10, y, 11, true));
        y -= 14;
      }
      y -= 3;
      const linhasItens = [];
      for (const item of caixa.ramo.itens) {
        const linhas = quebrarLinhas(`- ${item}`, larguraRamo - 20, 8.5);
        linhasItens.push(...linhas);
      }
      const cabem = Math.max(1, Math.floor((y - caixa.y - 9) / 11));
      const visiveis = linhasItens.slice(0, cabem);
      if (linhasItens.length > cabem) visiveis[visiveis.length - 1] = '...';
      for (const linha of visiveis) {
        comandos.push(comandoTexto(linha, caixa.x + 10, y, 8.5));
        y -= 11;
      }
    }

    const conteudo = doc.novoObjeto(fluxo('', Buffer.concat(comandos)));
    paginas.push(doc.novoObjeto(
      `<< /Type /Page /Parent ${numeroPaginas} 0 R /MediaBox [0 0 ${largura} ${altura}] `
      + `/Resources << /Font << /F1 ${fonteNormal} 0 R /F2 ${fonteNegrito} 0 R >> >> `
      + `/Contents ${conteudo} 0 R >>`,
    ));
  }
  return paginas;
}

/**
 * Gera o PDF de uma nota.
 *
 * @param {object} nota           { titulo, assunto, texto, criadaEm }
 * @param {object} [opcoes]
 * @param {Buffer} [opcoes.foto]  JPEG da foto original (opcional)
 * @returns {Buffer} bytes do PDF
 */
export function gerarPdf(nota, opcoes = {}) {
  const doc = new Documento();

  const fonteNormal = doc.novoObjeto(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  const fonteNegrito = doc.novoObjeto(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );

  const larguraUtil = A4.largura - MARGEM * 2;

  // --- monta o conteudo em "blocos" antes de paginar --------------------
  const TAM_TITULO = 20;
  const TAM_META = 9;
  const TAM_CORPO = 11;
  const ENTRELINHA = 15.5;

  const blocos = [];
  for (const linha of quebrarLinhas(nota.titulo || 'Sem titulo', larguraUtil, TAM_TITULO, true)) {
    blocos.push({ texto: linha, tamanho: TAM_TITULO, negrito: true, altura: 26 });
  }
  const data = formatarData(nota.criadaEm);
  blocos.push({
    texto: `${nota.assunto || 'Sem assunto'}  |  ${data}`,
    tamanho: TAM_META,
    negrito: false,
    altura: 24,
  });

  const paragrafos = String(nota.texto || '').split(/\n/);
  for (const paragrafo of paragrafos) {
    if (nota.tipo === 'mapa_mental'
      && /^-\s*liga(?:c|ç)[aã]o:\s*(linha|seta|tra(?:c|ç)o)\s*$/i.test(paragrafo.trim())) {
      continue;
    }
    if (paragrafo.trim() === '') {
      blocos.push({ texto: '', tamanho: TAM_CORPO, negrito: false, altura: ENTRELINHA * 0.6 });
      continue;
    }
    const ehTema = nota.tipo === 'mapa_mental' && paragrafo.startsWith('# ');
    const ehRamo = nota.tipo === 'mapa_mental' && paragrafo.startsWith('## ');
    const ehItem = nota.tipo === 'mapa_mental' && paragrafo.startsWith('- ');
    const texto = ehTema ? paragrafo.slice(2) : ehRamo ? paragrafo.slice(3) : paragrafo;
    const tamanho = ehTema ? 16 : ehRamo ? 13 : TAM_CORPO;
    const negrito = ehTema || ehRamo;
    const recuo = ehItem ? 14 : 0;
    const altura = ehTema ? 24 : ehRamo ? 21 : ENTRELINHA;
    for (const linha of quebrarLinhas(texto, larguraUtil - recuo, tamanho, negrito)) {
      blocos.push({ texto: linha, tamanho, negrito, altura, x: MARGEM + recuo });
    }
  }

  // --- distribui os blocos entre paginas --------------------------------
  const paginasTexto = [];
  let atual = [];
  let y = A4.altura - MARGEM;
  for (const bloco of blocos) {
    if (y - bloco.altura < MARGEM) {
      paginasTexto.push(atual);
      atual = [];
      y = A4.altura - MARGEM;
    }
    y -= bloco.altura;
    atual.push({ ...bloco, y });
  }
  paginasTexto.push(atual);

  // --- cria os objetos de pagina ----------------------------------------
  const numeroPaginas = doc.novoObjeto('placeholder'); // preenchido no fim
  const paginas = opcoes.modo === 'mapa' && nota.tipo === 'mapa_mental'
    ? paginasDeMapa(doc, nota, numeroPaginas, fonteNormal, fonteNegrito)
    : [];

  for (const blocosDaPagina of paginasTexto) {
    const comandos = [];
    for (const bloco of blocosDaPagina) {
      if (bloco.texto === '') continue;
      const fonte = bloco.negrito ? '/F2' : '/F1';
      comandos.push(
        Buffer.from(`BT ${fonte} ${bloco.tamanho} Tf ${bloco.x || MARGEM} ${bloco.y.toFixed(2)} Td `, 'latin1'),
        stringPdf(bloco.texto),
        Buffer.from(' Tj ET\n', 'latin1'),
      );
    }
    const conteudo = doc.novoObjeto(fluxo('', Buffer.concat(comandos)));
    paginas.push(
      doc.novoObjeto(
        `<< /Type /Page /Parent ${numeroPaginas} 0 R /MediaBox [0 0 ${A4.largura} ${A4.altura}] `
        + `/Resources << /Font << /F1 ${fonteNormal} 0 R /F2 ${fonteNegrito} 0 R >> >> `
        + `/Contents ${conteudo} 0 R >>`,
      ),
    );
  }

  // --- pagina extra com a foto original (opcional) ----------------------
  const foto = opcoes.foto;
  const dims = foto ? dimensoesJpeg(foto) : null;
  if (foto && dims) {
    const espacoCor = dims.componentes === 1 ? '/DeviceGray' : '/DeviceRGB';
    const imagem = doc.novoObjeto(
      fluxo(
        `/Type /XObject /Subtype /Image /Width ${dims.largura} /Height ${dims.altura} `
        + `${dims.componentes === 4 ? '/ColorSpace /DeviceCMYK /Decode [1 0 1 0]' : `/ColorSpace ${espacoCor}`} `
        + '/BitsPerComponent 8 /Filter /DCTDecode',
        foto,
      ),
    );

    const alturaTitulo = 30;
    const dispLargura = larguraUtil;
    const dispAltura = A4.altura - MARGEM * 2 - alturaTitulo;
    const escala = Math.min(dispLargura / dims.largura, dispAltura / dims.altura);
    const l = dims.largura * escala;
    const a = dims.altura * escala;
    const x = (A4.largura - l) / 2;
    const yImg = MARGEM + (dispAltura - a) / 2;

    const comandos = Buffer.concat([
      Buffer.from(`BT /F2 12 Tf ${MARGEM} ${A4.altura - MARGEM} Td `, 'latin1'),
      stringPdf('Foto original'),
      Buffer.from(' Tj ET\n', 'latin1'),
      Buffer.from(`q ${l.toFixed(2)} 0 0 ${a.toFixed(2)} ${x.toFixed(2)} ${yImg.toFixed(2)} cm /Im1 Do Q\n`, 'latin1'),
    ]);
    const conteudo = doc.novoObjeto(fluxo('', comandos));
    paginas.push(
      doc.novoObjeto(
        `<< /Type /Page /Parent ${numeroPaginas} 0 R /MediaBox [0 0 ${A4.largura} ${A4.altura}] `
        + `/Resources << /Font << /F2 ${fonteNegrito} 0 R >> /XObject << /Im1 ${imagem} 0 R >> >> `
        + `/Contents ${conteudo} 0 R >>`,
      ),
    );
  }

  doc.objetos[numeroPaginas - 1] = Buffer.from(
    `<< /Type /Pages /Kids [${paginas.map((n) => `${n} 0 R`).join(' ')}] /Count ${paginas.length} >>`,
    'latin1',
  );

  const raiz = doc.novoObjeto(`<< /Type /Catalog /Pages ${numeroPaginas} 0 R >>`);
  return doc.serializar(raiz);
}

function formatarData(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const dois = (n) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;
}
