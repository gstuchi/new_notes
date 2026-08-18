// Testes do que da pra testar sem chamar a API paga:
// gerador de PDF, quebra de linha, leitura de JPEG e armazenamento.
//
// Rodar:  npm test

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { gerarPdf, quebrarLinhas, larguraTexto, dimensoesJpeg, mapaDoTexto } from '../lib/pdf.js';
import { projetar, elastico, RastroDeVelocidade } from '../web/mola.js';
import {
  listarNotas, salvarNota, buscarNota, atualizarNota, apagarNota, listarAssuntos, lerImagem,
} from '../lib/armazenamento.js';
import {
  textoDaResposta, analisarResposta, provedor, modelo, chaveConfigurada, lerCaligrafia,
} from '../lib/vision.js';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SAIDA = path.join(RAIZ, 'testes', 'saida');

let passaram = 0;
let falharam = 0;

async function teste(nome, fn) {
  try {
    await fn();
    passaram++;
    console.log(`  ok   ${nome}`);
  } catch (erro) {
    falharam++;
    console.log(`  FALHA ${nome}`);
    console.log(`        ${erro.message}`);
  }
}

/**
 * Valida a estrutura do PDF: cabecalho, tabela xref com deslocamentos
 * corretos e o rodape. Se o xref apontar errado, leitor nenhum abre.
 */
function validarPdf(pdf) {
  const texto = pdf.toString('latin1');
  assert.ok(texto.startsWith('%PDF-1.4'), 'nao comeca com %PDF-1.4');
  assert.ok(texto.trimEnd().endsWith('%%EOF'), 'nao termina com %%EOF');

  const posStartxref = texto.lastIndexOf('startxref');
  assert.ok(posStartxref !== -1, 'sem startxref');
  const inicioXref = Number(texto.slice(posStartxref + 9).trim().split(/\s/)[0]);
  assert.ok(texto.startsWith('xref', inicioXref), 'startxref nao aponta pra tabela xref');

  const cabecalho = /^xref\s+0\s+(\d+)\s+/.exec(texto.slice(inicioXref));
  assert.ok(cabecalho, 'cabecalho do xref invalido');
  const total = Number(cabecalho[1]);

  // Cada entrada tem exatamente 20 bytes; a primeira (objeto 0) e a livre.
  const inicioEntradas = inicioXref + cabecalho[0].length;
  for (let numero = 1; numero < total; numero++) {
    const entrada = texto.slice(inicioEntradas + numero * 20, inicioEntradas + numero * 20 + 20);
    const deslocamento = Number(entrada.slice(0, 10));
    assert.ok(
      texto.startsWith(`${numero} 0 obj`, deslocamento),
      `xref do objeto ${numero} aponta para ${deslocamento}, onde nao ha "${numero} 0 obj"`,
    );
  }
  return total - 1; // quantidade de objetos
}

/** Monta um JPEG sintetico so com SOI + SOF0, pra testar o parser. */
function jpegFalso(largura, altura, componentes = 3) {
  const sof = Buffer.alloc(2 + 2 + 6 + componentes * 3);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(sof.length - 2, 2);
  sof.writeUInt8(8, 4); // precisao
  sof.writeUInt16BE(altura, 5);
  sof.writeUInt16BE(largura, 7);
  sof.writeUInt8(componentes, 9);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, Buffer.from([0xff, 0xd9])]);
}

console.log('\nTestes do Notas -> PDF\n');

// --- quebra de linha e largura ---------------------------------------------

await teste('largura de texto cresce com o tamanho da fonte', () => {
  assert.ok(larguraTexto('Calculo', 22) > larguraTexto('Calculo', 11));
});

await teste('acento nao muda a largura da letra base', () => {
  assert.equal(larguraTexto('a', 11), larguraTexto('a', 11));
  assert.equal(larguraTexto('ç', 11), larguraTexto('c', 11));
});

await teste('quebra respeita a largura maxima', () => {
  const texto = 'A derivada de uma funcao mede a taxa de variacao instantanea dessa funcao '
    + 'em relacao a sua variavel independente, e e a base do calculo diferencial.';
  const largura = 300;
  const linhas = quebrarLinhas(texto, largura, 11);
  assert.ok(linhas.length > 1, 'deveria ter quebrado em varias linhas');
  for (const linha of linhas) {
    assert.ok(
      larguraTexto(linha, 11) <= largura,
      `linha passou da largura: "${linha}" (${larguraTexto(linha, 11).toFixed(1)}pt)`,
    );
  }
  assert.equal(linhas.join(' ').replace(/\s+/g, ' '), texto.replace(/\s+/g, ' '));
});

await teste('palavra gigante e cortada em vez de estourar a linha', () => {
  const linhas = quebrarLinhas('X'.repeat(300), 200, 11);
  assert.ok(linhas.length > 1);
  for (const linha of linhas) assert.ok(larguraTexto(linha, 11) <= 200);
});

await teste('texto vazio devolve uma linha vazia', () => {
  assert.deepEqual(quebrarLinhas('', 300, 11), ['']);
});

// --- leitura de JPEG --------------------------------------------------------

await teste('le largura e altura de um JPEG', () => {
  const dims = dimensoesJpeg(jpegFalso(1600, 1200));
  assert.deepEqual(dims, { largura: 1600, altura: 1200, componentes: 3 });
});

await teste('devolve null para buffer que nao e JPEG', () => {
  assert.equal(dimensoesJpeg(Buffer.from('isto nao e uma imagem')), null);
});

// --- fisica das molas (web/mola.js) -----------------------------------------

await teste('projecao de momento cresce com a velocidade e respeita o sinal', () => {
  assert.ok(projetar(1000) > projetar(500), 'arremesso mais forte deve ir mais longe');
  assert.ok(projetar(-800) < 0, 'arremesso pra tras projeta pra tras');
  assert.equal(projetar(0), 0, 'parado nao projeta nada');
});

await teste('projecao usa decaimento exponencial, nao a formula de livro-texto', () => {
  // Formula da Apple: (v/1000) * d / (1 - d). Com d = 0.998 -> v * 0.499
  assert.ok(Math.abs(projetar(1000) - 499) < 0.5, `esperava ~499, veio ${projetar(1000)}`);
  // Decaimento menor = para mais perto.
  assert.ok(projetar(1000, 0.99) < projetar(1000, 0.998));
});

await teste('elastico resiste mais quanto mais se puxa', () => {
  const dimensao = 400;
  const pouco = elastico(20, dimensao);
  const muito = elastico(200, dimensao);

  assert.ok(pouco < 20, 'ja deve ceder menos que o dedo andou');
  assert.ok(muito < 200, 'quanto mais longe, menos acompanha');
  // A razao "acompanhou / puxou" precisa cair conforme se puxa mais.
  assert.ok(muito / 200 < pouco / 20, 'a resistencia tem que ser progressiva');
  assert.equal(elastico(0, dimensao), 0);
});

await teste('elastico nunca ultrapassa o limite duro', () => {
  const dimensao = 400;
  for (const excesso of [10, 100, 1000, 100000]) {
    assert.ok(
      elastico(excesso, dimensao) < dimensao,
      `com excesso ${excesso} passou da dimensao`,
    );
  }
});

await teste('rastro de velocidade mede px por segundo', () => {
  const rastro = new RastroDeVelocidade();
  rastro.registrar(0, 1000);
  rastro.registrar(50, 1050);
  rastro.registrar(100, 1100);
  // 100 px em 0,1 s = 1000 px/s
  assert.ok(Math.abs(rastro.velocidade() - 1000) < 1, `veio ${rastro.velocidade()}`);
});

await teste('rastro sem pontos suficientes devolve zero', () => {
  const rastro = new RastroDeVelocidade();
  assert.equal(rastro.velocidade(), 0);
  rastro.registrar(10, 1000);
  assert.equal(rastro.velocidade(), 0);
});

await teste('rastro esquece pontos antigos (so a janela recente conta)', () => {
  const rastro = new RastroDeVelocidade(100);
  rastro.registrar(0, 0);          // bem antigo: parado
  rastro.registrar(0, 500);
  rastro.registrar(0, 1000);
  rastro.registrar(60, 1060);      // acelerou agora
  assert.ok(rastro.velocidade() > 500, `dedo acelerou, veio ${rastro.velocidade()}`);
});

// --- geracao de PDF ---------------------------------------------------------

await fs.mkdir(SAIDA, { recursive: true });

await teste('PDF de uma nota curta tem estrutura valida', () => {
  const pdf = gerarPdf({
    titulo: 'Derivadas - aula 3',
    assunto: 'Calculo',
    texto: 'A derivada mede a taxa de variacao.\n\nRegra do produto: (fg)’ = f’g + fg’',
    criadaEm: '2026-08-14T12:00:00.000Z',
  });
  validarPdf(pdf);
  assert.ok(pdf.length > 500, 'PDF suspeito de tao pequeno');
});

await teste('acentuacao do portugues sobrevive no PDF', () => {
  const pdf = gerarPdf({
    titulo: 'Revisão de Física',
    assunto: 'Física',
    texto: 'Ação e reação. Não é só inércia — também há atrito, tensão e coeficientes.',
    criadaEm: new Date().toISOString(),
  });
  validarPdf(pdf);
  const texto = pdf.toString('latin1');
  // Em WinAnsi, "ç" é o byte 0xE7 e "ã" é 0xE3.
  assert.ok(texto.includes('\xe7'), 'nao achou o byte do "c cedilha"');
  assert.ok(texto.includes('\xe3'), 'nao achou o byte do "a til"');
});

await teste('parenteses e barra invertida sao escapados', () => {
  const pdf = gerarPdf({
    titulo: 'Escapes (teste)',
    assunto: 'Testes',
    texto: 'f(x) = (a\\b) e nada quebra',
    criadaEm: new Date().toISOString(),
  });
  validarPdf(pdf);
});

await teste('texto longo vira varias paginas', () => {
  const paragrafo = 'Esta e uma frase de teste que se repete para forcar a paginacao do documento. ';
  const pdf = gerarPdf({
    titulo: 'Nota longa',
    assunto: 'Testes',
    texto: paragrafo.repeat(400),
    criadaEm: new Date().toISOString(),
  });
  validarPdf(pdf);
  const contagem = /\/Count (\d+)/.exec(pdf.toString('latin1'));
  assert.ok(contagem, 'sem /Count no objeto Pages');
  assert.ok(Number(contagem[1]) > 1, `esperava mais de 1 pagina, veio ${contagem[1]}`);
});

await teste('PDF com a foto original embute o JPEG', () => {
  const foto = jpegFalso(1200, 1600);
  const pdf = gerarPdf(
    { titulo: 'Com foto', assunto: 'Testes', texto: 'texto', criadaEm: new Date().toISOString() },
    { foto },
  );
  validarPdf(pdf);
  const texto = pdf.toString('latin1');
  assert.ok(texto.includes('/DCTDecode'), 'imagem nao foi embutida como DCTDecode');
  assert.ok(texto.includes('/Width 1200'), 'largura da imagem errada');
  assert.ok(texto.includes('/Height 1600'), 'altura da imagem errada');
  assert.ok(pdf.includes(foto), 'os bytes do JPEG nao estao dentro do PDF');
});

await teste('foto invalida nao derruba a geracao', () => {
  const pdf = gerarPdf(
    { titulo: 'Foto ruim', assunto: 'Testes', texto: 'texto', criadaEm: new Date().toISOString() },
    { foto: Buffer.from('nao sou jpeg') },
  );
  validarPdf(pdf);
});

await teste('nota sem titulo/assunto ainda gera PDF', () => {
  validarPdf(gerarPdf({ texto: 'so texto' }));
});

await teste('mapa mental editado e reconstruido a partir do texto', () => {
  const mapa = mapaDoTexto('# Claude\n\n## Configuracao\n- CLAUDE.md\n- Regras\n\n## Sessao\n- Plan mode');
  assert.equal(mapa.temaCentral, 'Claude');
  assert.equal(mapa.ramos.length, 2);
  assert.deepEqual(mapa.ramos[0].itens, ['CLAUDE.md', 'Regras']);
});

await teste('PDF visual de mapa mental tem pagina paisagem e conexoes', () => {
  const pdf = gerarPdf({
    titulo: 'Claude',
    assunto: 'Ferramentas',
    tipo: 'mapa_mental',
    texto: '# Claude\n\n## Configuracao\n- CLAUDE.md\n- Regras\n\n## Sessao\n- Plan mode',
  }, { modo: 'mapa' });
  validarPdf(pdf);
  const conteudo = pdf.toString('latin1');
  assert.ok(conteudo.includes('/MediaBox [0 0 841.89 595.28]'));
  assert.ok(conteudo.includes(' l S'), 'mapa sem linhas de conexao');
  assert.ok(conteudo.includes('0 g BT'), 'texto do mapa nao volta para preto');
});

// Guarda um PDF de verdade pra inspecao manual.
await fs.writeFile(
  path.join(SAIDA, 'exemplo.pdf'),
  gerarPdf(
    {
      titulo: 'Derivadas - aula 3',
      assunto: 'Cálculo',
      texto: 'A derivada mede a taxa de variação instantânea de uma função.\n\n'
        + 'Regra do produto: (f·g)’ = f’·g + f·g’\n'
        + 'Regra da cadeia: (f∘g)’(x) = f’(g(x))·g’(x)\n\n'
        + 'Exercício: derive h(x) = (3x² + 1)⁵ usando a regra da cadeia.',
      criadaEm: new Date().toISOString(),
    },
    { foto: jpegFalso(1200, 1600) },
  ),
);

await fs.writeFile(
  path.join(SAIDA, 'mapa-exemplo.pdf'),
  gerarPdf({
    titulo: 'Claude Code',
    assunto: 'Ferramentas',
    tipo: 'mapa_mental',
    texto: '# Claude e ferramentas\n\n'
      + '## Arquivos\n- CLAUDE.md\n- .claude/rules\n- memory.md: memoria automatica\n\n'
      + '## Contexto da sessao\n- Plan mode: planeja antes de agir\n'
      + '- Permissoes: o que pode fazer sozinho\n- ~/.claude: preferencias',
    criadaEm: new Date().toISOString(),
  }, { modo: 'mapa' }),
);

// --- armazenamento ----------------------------------------------------------

await teste('salva, busca, atualiza, lista por assunto e apaga', async () => {
  const antes = (await listarNotas()).length;

  const nota = await salvarNota({
    titulo: 'Nota de teste',
    assunto: 'ZZ-Teste-Automatizado',
    texto: 'conteudo original',
    tipo: 'mapa_mental',
    estrutura: { temaCentral: 'Teste', ramos: [] },
    incertezas: ['um trecho'],
    imagemBase64: jpegFalso(100, 100).toString('base64'),
  });
  assert.ok(nota.id, 'nota salva sem id');
  assert.equal(nota.assunto, 'ZZ-Teste-Automatizado');
  assert.equal(nota.tipo, 'mapa_mental');
  assert.deepEqual(nota.incertezas, ['um trecho']);

  const lida = await buscarNota(nota.id);
  assert.equal(lida.texto, 'conteudo original');

  const fotoAtualizada = jpegFalso(240, 180);
  await atualizarNota(nota.id, {
    texto: 'conteudo corrigido',
    imagemBase64: fotoAtualizada.toString('base64'),
  });
  assert.equal((await buscarNota(nota.id)).texto, 'conteudo corrigido');
  assert.deepEqual(await lerImagem(await buscarNota(nota.id)), fotoAtualizada);

  const assuntos = await listarAssuntos();
  assert.ok(assuntos.some((a) => a.nome === 'ZZ-Teste-Automatizado'));

  assert.equal(await apagarNota(nota.id), true);
  assert.equal(await buscarNota(nota.id), null);
  assert.equal((await listarNotas()).length, antes, 'sobrou lixo do teste');
});

await teste('campos vazios recebem valores padrao', async () => {
  const nota = await salvarNota({ titulo: '  ', assunto: '', texto: 'x' });
  assert.equal(nota.titulo, 'Sem titulo');
  assert.equal(nota.assunto, 'Sem assunto');
  await apagarNota(nota.id);
});

// --- escolha do provedor de Vision AI (lib/vision.js) -----------------------
// Nada aqui toca a rede: so a decisao de QUEM atende e a leitura da resposta.

const VARIAVEIS = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'PROVEDOR_VISION', 'MODELO_VISION'];

/** Roda fn com o ambiente trocado e devolve tudo como estava depois. */
function comAmbiente(valores, fn) {
  const antes = {};
  for (const nome of VARIAVEIS) {
    antes[nome] = process.env[nome];
    delete process.env[nome];
  }
  try {
    for (const [nome, valor] of Object.entries(valores)) process.env[nome] = valor;
    return fn();
  } finally {
    for (const nome of VARIAVEIS) {
      if (antes[nome] === undefined) delete process.env[nome];
      else process.env[nome] = antes[nome];
    }
  }
}

await teste('sem chave nenhuma nao ha provedor', () => {
  comAmbiente({}, () => {
    assert.equal(provedor(), null);
    assert.equal(modelo(), null);
    assert.equal(chaveConfigurada(), false);
  });
});

await teste('cada chave escolhe seu provedor, e com as duas o Gemini ganha', () => {
  comAmbiente({ GEMINI_API_KEY: 'x' }, () => assert.equal(provedor(), 'gemini'));
  comAmbiente({ ANTHROPIC_API_KEY: 'x' }, () => assert.equal(provedor(), 'anthropic'));
  comAmbiente({ GEMINI_API_KEY: 'x', ANTHROPIC_API_KEY: 'y' }, () => {
    assert.equal(provedor(), 'gemini', 'o gratuito tem que atender primeiro');
  });
});

await teste('PROVEDOR_VISION manda mais que a ordem das chaves', () => {
  comAmbiente({ GEMINI_API_KEY: 'x', ANTHROPIC_API_KEY: 'y', PROVEDOR_VISION: 'anthropic' }, () => {
    assert.equal(provedor(), 'anthropic');
  });
  // Valor sem sentido nao pode virar provedor: cai na ordem normal.
  comAmbiente({ GEMINI_API_KEY: 'x', PROVEDOR_VISION: 'nada-disso' }, () => {
    assert.equal(provedor(), 'gemini');
  });
});

await teste('modelo padrao vem do provedor, e MODELO_VISION sobrescreve', () => {
  comAmbiente({ GEMINI_API_KEY: 'x' }, () => assert.equal(modelo(), 'gemini-3.6-flash'));
  comAmbiente({ ANTHROPIC_API_KEY: 'x' }, () => assert.equal(modelo(), 'claude-opus-5'));
  comAmbiente({ GEMINI_API_KEY: 'x', MODELO_VISION: 'outro-modelo' }, () => {
    assert.equal(modelo(), 'outro-modelo');
  });
});

await teste('sem chave, lerCaligrafia falha com codigo SEM_CHAVE (nao chama a rede)', async () => {
  await comAmbiente({}, async () => {
    await assert.rejects(
      () => lerCaligrafia('AAAA', 'image/jpeg'),
      (erro) => erro.codigo === 'SEM_CHAVE',
    );
  });
});

await teste('resposta do Gemini: output_text e o caminho normal', () => {
  assert.equal(textoDaResposta({ output_text: '  Derivadas\n\nRegra da cadeia  ' }),
    'Derivadas\n\nRegra da cadeia');
});

await teste('resposta do Gemini: sem output_text, junta os blocos dos passos', () => {
  const resposta = {
    output_text: '',
    steps: [
      { type: 'model_output', content: [{ type: 'text', text: 'primeira linha' }] },
      { type: 'model_output', content: [{ type: 'text', text: 'segunda linha' }, { type: 'image' }] },
    ],
  };
  assert.equal(textoDaResposta(resposta), 'primeira linha\nsegunda linha');
});

await teste('resposta vazia ou estranha vira string vazia, nunca excecao', () => {
  assert.equal(textoDaResposta(null), '');
  assert.equal(textoDaResposta('texto solto'), '');
  assert.equal(textoDaResposta({}), '');
  assert.equal(textoDaResposta({ steps: 'nao e lista' }), '');
});

await teste('analise estruturada transforma mapa mental em texto editavel', () => {
  const analise = analisarResposta(JSON.stringify({
    tipo: 'mapa_mental',
    tituloSugerido: 'Claude',
    texto: 'nao deve ganhar da estrutura',
    estrutura: {
      temaCentral: 'Claude e ferramentas',
      ramos: [{
        titulo: 'Sessao',
        itens: ['Plan mode', 'Permissoes'],
        posicao: 'direita',
        ordem: 1,
      }],
    },
    incertezas: ['seta da direita'],
  }));
  assert.equal(analise.tipo, 'mapa_mental');
  assert.ok(analise.texto.includes('## Sessao'));
  assert.ok(analise.texto.includes('- Plan mode'));
  assert.equal(analise.estrutura.ramos[0].posicao, 'direita');
  assert.deepEqual(analise.incertezas, ['seta da direita']);
});

await teste('analise invalida falha sem transformar lixo em nota', () => {
  assert.throws(
    () => analisarResposta('isso nao e json'),
    (erro) => erro.codigo === 'RESPOSTA_INVALIDA',
  );
});

// --- resultado --------------------------------------------------------------

console.log(`\n  ${passaram} passaram, ${falharam} falharam`);
console.log(`  PDF de exemplo: testes/saida/exemplo.pdf\n`);
process.exit(falharam > 0 ? 1 : 0);
