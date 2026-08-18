// Servidor local do app "Notas -> PDF".
// Serve a interface web e expoe a API. Roda so na sua maquina.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { analisarAnotacao, chaveConfigurada, provedor, modelo } from './lib/vision.js';
import { gerarPdf } from './lib/pdf.js';
import {
  listarNotas, buscarNota, salvarNota, atualizarNota,
  apagarNota, lerImagem, listarAssuntos,
} from './lib/armazenamento.js';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PASTA_WEB = path.join(RAIZ, 'web');
const PORTA = Number(process.env.PORTA) || 3000;
const LIMITE_CORPO = 25 * 1024 * 1024; // 25 MB

// --- .env simples (sem dependencia) ----------------------------------------
export async function carregarEnv() {
  try {
    const bruto = await fs.readFile(path.join(RAIZ, '.env'), 'utf8');
    for (const linha of bruto.split(/\r?\n/)) {
      const limpa = linha.trim();
      if (!limpa || limpa.startsWith('#')) continue;
      const igual = limpa.indexOf('=');
      if (igual === -1) continue;
      const chave = limpa.slice(0, igual).trim();
      let valor = limpa.slice(igual + 1).trim();
      if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
        valor = valor.slice(1, -1);
      }
      if (!(chave in process.env)) process.env[chave] = valor;
    }
  } catch (erro) {
    if (erro.code !== 'ENOENT') throw erro;
  }
}

// --- utilidades HTTP --------------------------------------------------------
function responderJson(res, status, dados) {
  const corpo = JSON.stringify(dados);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(corpo),
  });
  res.end(corpo);
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const pedacos = [];
    let total = 0;
    req.on('data', (pedaco) => {
      total += pedaco.length;
      if (total > LIMITE_CORPO) {
        reject(Object.assign(new Error('Corpo da requisicao grande demais.'), { status: 413 }));
        req.destroy();
        return;
      }
      pedacos.push(pedaco);
    });
    req.on('end', () => {
      if (pedacos.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(pedacos).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('JSON invalido.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

async function servirEstatico(res, nomeArquivo) {
  const alvo = path.join(PASTA_WEB, nomeArquivo);
  // Nunca deixar sair da pasta web.
  if (!path.resolve(alvo).startsWith(path.resolve(PASTA_WEB) + path.sep)) {
    return responderJson(res, 403, { erro: 'Caminho invalido.' });
  }
  try {
    const conteudo = await fs.readFile(alvo);
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(alvo)] || 'application/octet-stream' });
    res.end(conteudo);
  } catch {
    responderJson(res, 404, { erro: 'Nao encontrado.' });
  }
}

/** Aceita tanto "data:image/jpeg;base64,XXXX" quanto o base64 puro. */
function separarDataUrl(valor) {
  const casamento = /^data:([^;,]+);base64,(.*)$/s.exec(valor || '');
  if (casamento) return { tipoMime: casamento[1], base64: casamento[2] };
  return { tipoMime: 'image/jpeg', base64: valor || '' };
}

// --- rotas ------------------------------------------------------------------
export async function rotear(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const caminho = url.pathname;
  const metodo = req.method;

  if (caminho === '/' && metodo === 'GET') return servirEstatico(res, 'index.html');
  // Qualquer arquivo direto da pasta web/ (app.js, mola.js, estilo.css...).
  // servirEstatico ja barra tentativa de sair da pasta.
  if (metodo === 'GET' && !caminho.startsWith('/api/') && /^\/[\w.-]+$/.test(caminho)) {
    return servirEstatico(res, caminho.slice(1));
  }

  if (caminho === '/api/estado' && metodo === 'GET') {
    return responderJson(res, 200, {
      chaveConfigurada: chaveConfigurada(),
      provedor: provedor(),
      modelo: modelo(),
    });
  }

  // Analisa a foto e preserva texto, tipo e relacoes visuais.
  if (caminho === '/api/ler' && metodo === 'POST') {
    const corpo = await lerCorpo(req);
    const { tipoMime, base64 } = separarDataUrl(corpo.imagem);
    if (!base64) return responderJson(res, 400, { erro: 'Nenhuma imagem enviada.' });
    try {
      const analise = await analisarAnotacao(base64, tipoMime, corpo.formato);
      return responderJson(res, 200, analise);
    } catch (erro) {
      const status = erro.codigo === 'SEM_CHAVE' ? 503 : 502;
      return responderJson(res, status, { erro: erro.message, codigo: erro.codigo || null });
    }
  }

  // Fase 4: assuntos.
  if (caminho === '/api/assuntos' && metodo === 'GET') {
    return responderJson(res, 200, await listarAssuntos());
  }

  if (caminho === '/api/notas' && metodo === 'GET') {
    const assunto = url.searchParams.get('assunto');
    const notas = await listarNotas();
    const filtradas = assunto ? notas.filter((n) => n.assunto === assunto) : notas;
    // Nao mandar o texto inteiro na listagem; so um resumo.
    return responderJson(res, 200, filtradas.map((n) => ({
      id: n.id,
      titulo: n.titulo,
      assunto: n.assunto,
      criadaEm: n.criadaEm,
      temFoto: Boolean(n.arquivoImagem),
      tipo: n.tipo || 'texto',
      previa: n.texto.slice(0, 160),
    })));
  }

  if (caminho === '/api/notas' && metodo === 'POST') {
    const corpo = await lerCorpo(req);
    if (!corpo.texto || !String(corpo.texto).trim()) {
      return responderJson(res, 400, { erro: 'A nota precisa de texto.' });
    }
    const { base64 } = separarDataUrl(corpo.imagem);
    const nota = await salvarNota({
      titulo: corpo.titulo,
      assunto: corpo.assunto,
      texto: corpo.texto,
      tipo: corpo.tipo,
      estrutura: corpo.estrutura,
      incertezas: corpo.incertezas,
      imagemBase64: base64 || null,
    });
    return responderJson(res, 201, nota);
  }

  const casamentoNota = /^\/api\/notas\/([\w-]+)$/.exec(caminho);
  if (casamentoNota) {
    const id = casamentoNota[1];
    if (metodo === 'GET') {
      const nota = await buscarNota(id);
      return nota
        ? responderJson(res, 200, nota)
        : responderJson(res, 404, { erro: 'Nota nao encontrada.' });
    }
    if (metodo === 'PUT') {
      const corpo = await lerCorpo(req);
      const { base64 } = separarDataUrl(corpo.imagem);
      const nota = await atualizarNota(id, {
        ...corpo,
        imagemBase64: base64 || undefined,
      });
      return nota
        ? responderJson(res, 200, nota)
        : responderJson(res, 404, { erro: 'Nota nao encontrada.' });
    }
    if (metodo === 'DELETE') {
      const apagou = await apagarNota(id);
      return apagou
        ? responderJson(res, 200, { ok: true })
        : responderJson(res, 404, { erro: 'Nota nao encontrada.' });
    }
  }

  // Fase 3: gerar o PDF.
  const casamentoPdf = /^\/api\/notas\/([\w-]+)\/pdf$/.exec(caminho);
  if (casamentoPdf && metodo === 'GET') {
    const nota = await buscarNota(casamentoPdf[1]);
    if (!nota) return responderJson(res, 404, { erro: 'Nota nao encontrada.' });

    const comFoto = url.searchParams.get('foto') === '1';
    const foto = comFoto ? await lerImagem(nota) : null;
    const modo = url.searchParams.get('formato') === 'mapa' ? 'mapa' : 'resumo';
    const pdf = gerarPdf(nota, { foto, modo });

    const nomeArquivo = `${nota.assunto} - ${nota.titulo}`
      .replace(/[^\p{L}\p{N} .-]/gu, '_')
      .slice(0, 80);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': pdf.length,
      'Content-Disposition': `attachment; filename="${nomeArquivo}.pdf"`,
    });
    return res.end(pdf);
  }

  const casamentoFoto = /^\/api\/notas\/([\w-]+)\/foto$/.exec(caminho);
  if (casamentoFoto && metodo === 'GET') {
    const nota = await buscarNota(casamentoFoto[1]);
    const foto = nota ? await lerImagem(nota) : null;
    if (!foto) return responderJson(res, 404, { erro: 'Sem foto.' });
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': foto.length });
    return res.end(foto);
  }

  return responderJson(res, 404, { erro: 'Rota nao encontrada.' });
}

// --- sobe o servidor somente no desenvolvimento local ----------------------
const executadoDiretamente = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (executadoDiretamente) {
  await carregarEnv();
  const servidor = http.createServer((req, res) => {
    rotear(req, res).catch((erro) => {
      console.error(erro);
      if (!res.headersSent) {
        responderJson(res, erro.status || 500, { erro: erro.message || 'Erro interno.' });
      }
    });
  });

  servidor.listen(PORTA, '127.0.0.1', () => {
    console.log('');
    console.log('  Notas -> PDF rodando em  http://localhost:' + PORTA);
    console.log('  Vision AI: ' + (chaveConfigurada()
      ? 'chave configurada (' + (process.env.MODELO_VISION || 'claude-opus-5') + ')'
      : 'SEM CHAVE -- da pra usar o app, mas a leitura da foto vai falhar.'));
    console.log('  Para parar: Ctrl+C');
    console.log('');
  });
}
