// =========================================================================
// MOCKUP DE LOGIN -- NAO E AUTENTICACAO DE VERDADE.
//
// Tudo aqui vive no localStorage do navegador: os usuarios e a sessao.
// A senha e guardada em texto legivel. Qualquer pessoa abre o DevTools e le.
// Nao ha servidor, nao ha banco de dados, nao ha token, nao ha protecao
// nenhuma sobre /api/* -- as notas continuam abertas para quem digitar a URL.
//
// Isto existe so para a DEMONSTRACAO contar a historia inteira
// ("me cadastrei -> entrei -> o app abriu") e para marcar o lugar onde a
// autenticacao de verdade entra quando o projeto virar app em Flutter.
//
// NADA DESTE ARQUIVO PODE IR PARA PRODUCAO.
// =========================================================================

const CHAVE_USUARIOS = 'notas.mockup.usuarios';
const CHAVE_SESSAO = 'notas.mockup.sessao';

// --- leitura e escrita crua -------------------------------------------------
// O localStorage pode estar bloqueado (aba anonima, cookies desligados) ou
// com lixo dentro. Em qualquer um dos casos, seguimos com a lista vazia em vez
// de derrubar a tela.

function lerJson(chave, padrao) {
  try {
    const bruto = localStorage.getItem(chave);
    if (!bruto) return padrao;
    return JSON.parse(bruto);
  } catch {
    return padrao;
  }
}

function gravarJson(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

/** Todos os usuarios cadastrados neste navegador. */
export function listarUsuarios() {
  const lista = lerJson(CHAVE_USUARIOS, []);
  return Array.isArray(lista) ? lista : [];
}

export function salvarUsuarios(lista) {
  return gravarJson(CHAVE_USUARIOS, lista);
}

/** E-mail sem espaco nas pontas e tudo minusculo -- e a chave de busca. */
function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function novoId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);
}

// --- cadastro e entrada -----------------------------------------------------

/**
 * Cria a conta. Devolve { ok: true, usuario } ou { ok: false, erro }.
 */
export function cadastrar({ nome, email, senha }) {
  const nomeLimpo = String(nome || '').trim();
  const emailLimpo = normalizarEmail(email);

  if (!nomeLimpo) return { ok: false, erro: 'Falta o nome.' };
  if (!emailLimpo) return { ok: false, erro: 'Falta o e-mail.' };
  if (!senha) return { ok: false, erro: 'Falta a senha.' };

  const usuarios = listarUsuarios();
  if (usuarios.some((u) => u.email === emailLimpo)) {
    return { ok: false, erro: 'Esse e-mail ja tem conta.' };
  }

  const usuario = {
    id: novoId(),
    nome: nomeLimpo,
    email: emailLimpo,
    senha,                       // texto puro: e mockup, ver aviso do topo
    criadoEm: new Date().toISOString(),
  };

  usuarios.push(usuario);
  if (!salvarUsuarios(usuarios)) {
    return { ok: false, erro: 'Nao deu pra guardar aqui no navegador.' };
  }
  return { ok: true, usuario };
}

/**
 * Confere e-mail e senha. Devolve { ok: true, usuario } ou { ok: false, erro }.
 * O erro e o mesmo para e-mail inexistente e senha errada -- nao interessa
 * dizer qual dos dois falhou.
 */
export function entrar({ email, senha }) {
  const emailLimpo = normalizarEmail(email);
  const usuario = listarUsuarios().find((u) => u.email === emailLimpo);

  if (!usuario || usuario.senha !== senha) {
    return { ok: false, erro: 'E-mail ou senha nao conferem.' };
  }
  return { ok: true, usuario };
}

// --- sessao -----------------------------------------------------------------

/** Quem esta logado agora, ou null. A sessao guarda so nome e e-mail. */
export function sessao() {
  const dados = lerJson(CHAVE_SESSAO, null);
  return dados && dados.email ? dados : null;
}

export function abrirSessao(usuario) {
  return gravarJson(CHAVE_SESSAO, { nome: usuario.nome, email: usuario.email });
}

export function encerrarSessao() {
  try {
    localStorage.removeItem(CHAVE_SESSAO);
  } catch {
    /* nada a fazer: sem localStorage nao ha sessao pra apagar */
  }
}

/**
 * Guarda de tela: chame no comeco de uma pagina que so faz sentido logado.
 * Sem sessao, manda pro login e devolve null.
 *
 * Usa location.replace, nao href: assim a tela protegida nao fica no historico
 * e o botao "voltar" do navegador nao devolve pra ela.
 */
export function exigirSessao() {
  const atual = sessao();
  if (!atual) {
    location.replace('/login.html');
    return null;
  }
  return atual;
}

/** O contrario: numa tela de entrada, quem ja esta logado vai direto pro app. */
export function pularSeLogado() {
  if (sessao()) {
    location.replace('/');
    return true;
  }
  return false;
}

/** "Giovani Stuchi" -> "Giovani". Para a saudacao do cabecalho. */
export function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}
