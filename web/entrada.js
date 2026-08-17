// Comportamento das telas de entrada (login e cadastro).
//
// Um arquivo so para as duas paginas: ele olha qual formulario existe na tela
// e liga so o que for daquela. Quem guarda usuario e sessao e autenticacao.js
// -- e isso e mockup, ver o aviso no topo daquele arquivo.
//
// O erro nao pisca com transicao CSS: sacode com mola (mola.js). Transicao nao
// da pra interromper no meio, e mola e o que o resto do app usa pra movimento.

import { cadastrar, entrar, abrirSessao, pularSeLogado } from './autenticacao.js';
import { animarMola } from './mola.js';

const $ = (id) => document.getElementById(id);

// Quem ja esta logado nao precisa ver esta tela.
pularSeLogado();

// O navegador guarda a pagina inteira ao sair dela (bfcache): ao voltar, ele
// restaura tudo do jeito que estava e NAO roda o modulo de novo. Sem isto,
// quem entrasse e apertasse "voltar" veria a tela de login outra vez, ja
// logado. O pageshow com persisted=true e o unico aviso que chega nessa hora.
window.addEventListener('pageshow', (evento) => {
  if (evento.persisted) pularSeLogado();
});

// ===========================================================================
// ERRO
// ===========================================================================

let sacudida = null;

/** Mostra a mensagem, sacode o cartao uma vez e devolve o foco ao campo. */
function mostrarErro(mensagem, campoParaFocar) {
  const erro = $('erro');
  erro.textContent = mensagem;
  erro.hidden = false;

  const cartao = $('cartao');

  // Interrompe a sacudida anterior antes de comecar outra: dois erros seguidos
  // nao podem virar duas molas brigando pelo mesmo transform.
  sacudida?.cancelar();
  cartao.style.transform = 'translateX(0px)';

  // Alvo 0 com velocidade inicial: a mola sai do lugar e volta sozinha.
  // Damping baixo de proposito -- aqui o quique E a mensagem.
  // animarMola ja respeita prefers-reduced-motion: com movimento reduzido, o
  // texto do erro aparece e o cartao fica parado.
  sacudida = animarMola({
    de: 0,
    para: 0,
    velocidade: 380,
    damping: 0.32,
    response: 0.2,
    aoAtualizar: (x) => { cartao.style.transform = `translateX(${x}px)`; },
    aoTerminar: () => { cartao.style.transform = ''; },
  });

  campoParaFocar?.focus();
}

function limparErro() {
  const erro = $('erro');
  erro.hidden = true;
  erro.textContent = '';
}

/** Sucesso: abre a sessao e vai pro app sem deixar a tela de entrada no historico. */
function entrarNoApp(usuario) {
  abrirSessao(usuario);
  location.replace('/');
}

// ===========================================================================
// LOGIN
// ===========================================================================

const formEntrar = $('formEntrar');

if (formEntrar) {
  formEntrar.addEventListener('submit', (evento) => {
    evento.preventDefault();
    limparErro();

    const email = $('email').value;
    const senha = $('senha').value;

    if (!email.trim()) return mostrarErro('Falta o e-mail.', $('email'));
    if (!senha) return mostrarErro('Falta a senha.', $('senha'));

    const resultado = entrar({ email, senha });
    if (!resultado.ok) return mostrarErro(resultado.erro, $('senha'));

    entrarNoApp(resultado.usuario);
  });
}

// ===========================================================================
// CADASTRO
// ===========================================================================

const formCadastrar = $('formCadastrar');

if (formCadastrar) {
  formCadastrar.addEventListener('submit', (evento) => {
    evento.preventDefault();
    limparErro();

    const nome = $('nome').value;
    const email = $('email').value;
    const senha = $('senha').value;
    const confirmar = $('confirmar').value;

    if (!nome.trim()) return mostrarErro('Falta o nome.', $('nome'));
    if (!email.trim()) return mostrarErro('Falta o e-mail.', $('email'));
    if (!senha) return mostrarErro('Falta a senha.', $('senha'));
    if (senha !== confirmar) {
      $('confirmar').value = '';
      return mostrarErro('As duas senhas estao diferentes.', $('confirmar'));
    }

    const resultado = cadastrar({ nome, email, senha });
    if (!resultado.ok) return mostrarErro(resultado.erro, $('email'));

    entrarNoApp(resultado.usuario);
  });
}

// Comecou a corrigir? O erro antigo sai de cena.
document.querySelectorAll('input').forEach((campo) => {
  campo.addEventListener('input', () => {
    if (!$('erro').hidden) limparErro();
  });
});
