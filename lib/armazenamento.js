// Guarda as notas em disco.
//
// ASSUNTOS sao organizacao pura -- pasta/campo comum, nenhuma IA envolvida.
// O texto extraido fica separado da imagem: e o dado canonico do projeto,
// e pode ser re-estilizado N vezes sem chamar a Vision AI de novo.

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PASTA_DADOS = path.join(RAIZ, 'dados');
const PASTA_IMAGENS = path.join(PASTA_DADOS, 'imagens');
const ARQUIVO_NOTAS = path.join(PASTA_DADOS, 'notas.json');

async function garantirPastas() {
  await fs.mkdir(PASTA_IMAGENS, { recursive: true });
}

/** Le todas as notas. Devolve [] se ainda nao existe nada. */
export async function listarNotas() {
  try {
    const bruto = await fs.readFile(ARQUIVO_NOTAS, 'utf8');
    const notas = JSON.parse(bruto);
    return Array.isArray(notas) ? notas : [];
  } catch (erro) {
    if (erro.code === 'ENOENT') return [];
    throw erro;
  }
}

async function gravarNotas(notas) {
  await garantirPastas();
  await fs.writeFile(ARQUIVO_NOTAS, JSON.stringify(notas, null, 2), 'utf8');
}

export async function buscarNota(id) {
  const notas = await listarNotas();
  return notas.find((n) => n.id === id) || null;
}

/**
 * Salva uma nota nova.
 *
 * @param {object} dados
 * @param {string} dados.titulo
 * @param {string} dados.assunto
 * @param {string} dados.texto        transcricao editavel devolvida pela Vision AI
 * @param {string} [dados.tipo]       texto, lista, mapa_mental, tabela ou misto
 * @param {object} [dados.estrutura]  relacoes visuais detectadas
 * @param {string[]} [dados.incertezas]
 * @param {string} [dados.imagemBase64]  foto original, para guardar junto
 */
export async function salvarNota({
  titulo,
  assunto,
  texto,
  tipo = 'texto',
  estrutura = {},
  incertezas = [],
  imagemBase64,
}) {
  await garantirPastas();

  const id = crypto.randomUUID();
  let arquivoImagem = null;

  if (imagemBase64) {
    arquivoImagem = `${id}.jpg`;
    await fs.writeFile(path.join(PASTA_IMAGENS, arquivoImagem), Buffer.from(imagemBase64, 'base64'));
  }

  const nota = {
    id,
    titulo: (titulo || '').trim() || 'Sem titulo',
    assunto: (assunto || '').trim() || 'Sem assunto',
    texto: texto || '',
    tipo,
    estrutura,
    incertezas,
    arquivoImagem,
    criadaEm: new Date().toISOString(),
  };

  const notas = await listarNotas();
  notas.unshift(nota);
  await gravarNotas(notas);
  return nota;
}

/** Atualiza titulo, assunto e/ou texto de uma nota existente. */
export async function atualizarNota(id, campos) {
  const notas = await listarNotas();
  const indice = notas.findIndex((n) => n.id === id);
  if (indice === -1) return null;

  const nota = notas[indice];
  if (campos.titulo !== undefined) nota.titulo = String(campos.titulo).trim() || 'Sem titulo';
  if (campos.assunto !== undefined) nota.assunto = String(campos.assunto).trim() || 'Sem assunto';
  if (campos.texto !== undefined) nota.texto = String(campos.texto);
  if (campos.tipo !== undefined) nota.tipo = String(campos.tipo);
  if (campos.estrutura !== undefined) nota.estrutura = campos.estrutura || {};
  if (campos.incertezas !== undefined) {
    nota.incertezas = Array.isArray(campos.incertezas) ? campos.incertezas : [];
  }
  if (campos.imagemBase64) {
    nota.arquivoImagem ||= `${nota.id}.jpg`;
    await garantirPastas();
    await fs.writeFile(
      path.join(PASTA_IMAGENS, nota.arquivoImagem),
      Buffer.from(campos.imagemBase64, 'base64'),
    );
  }
  nota.atualizadaEm = new Date().toISOString();

  notas[indice] = nota;
  await gravarNotas(notas);
  return nota;
}

export async function apagarNota(id) {
  const notas = await listarNotas();
  const nota = notas.find((n) => n.id === id);
  if (!nota) return false;

  if (nota.arquivoImagem) {
    await fs.rm(path.join(PASTA_IMAGENS, nota.arquivoImagem), { force: true });
  }
  await gravarNotas(notas.filter((n) => n.id !== id));
  return true;
}

/** Bytes da foto original de uma nota, ou null. */
export async function lerImagem(nota) {
  if (!nota?.arquivoImagem) return null;
  try {
    return await fs.readFile(path.join(PASTA_IMAGENS, nota.arquivoImagem));
  } catch (erro) {
    if (erro.code === 'ENOENT') return null;
    throw erro;
  }
}

/** Lista de assuntos existentes, com a contagem de notas de cada um. */
export async function listarAssuntos() {
  const notas = await listarNotas();
  const contagem = new Map();
  for (const nota of notas) {
    contagem.set(nota.assunto, (contagem.get(nota.assunto) || 0) + 1);
  }
  return [...contagem.entries()]
    .map(([nome, quantidade]) => ({ nome, quantidade }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
