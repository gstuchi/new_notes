// Interface do app.
//
// Duas coisas acontecem aqui:
//   1. A melhoria da imagem (Fase 2), no canvas do navegador.
//   2. O comportamento no estilo Apple: resposta no apertar, molas
//      interrompiveis, entrega de velocidade e projecao de momento.
//
// Nada de gesto usa transicao CSS: transicao nao da pra agarrar no meio do
// voo. Onde o dedo participa, quem manda e o motor de molas (mola.js).

import { animarMola, projetar, elastico, RastroDeVelocidade, GAVETA, PADRAO } from './mola.js';
import { exigirSessao, encerrarSessao, primeiroNome } from './autenticacao.js';

const $ = (id) => document.getElementById(id);

// Guarda de tela (mockup): sem sessao, exigirSessao ja mandou a pagina pro
// login. Aqui so travamos o modulo para nada mais ser montado enquanto a
// troca de pagina acontece -- uma promessa que nunca resolve para o resto do
// arquivo nunca rodar, e sem erro vermelho no console.
const usuario = exigirSessao();
if (!usuario) await new Promise(() => {});

// Mesma guarda para a volta pelo bfcache: o navegador restaura a pagina sem
// rodar o modulo, entao quem saiu e apertou "voltar" veria o app de novo.
window.addEventListener('pageshow', (evento) => {
  if (evento.persisted) exigirSessao();
});

const estado = {
  imagemOriginal: null,
  giro: 0,
  analise: null,
  assuntoAtual: '',
  notas: [],
  editandoId: null,
  telaAtual: 'telaPastas',
};

// ===========================================================================
// MELHORIA DE IMAGEM (Fase 2)
// ===========================================================================

const LADO_MAXIMO = 1800; // mantem o JSON com base64 dentro do limite das funcoes da Vercel

function desenharEm(tela, comFiltros = true) {
  const img = estado.imagemOriginal;
  if (!img) return null;

  const ctx = tela.getContext('2d', { willReadFrequently: true });

  const trocaLados = estado.giro % 180 !== 0;
  let largura = trocaLados ? img.naturalHeight : img.naturalWidth;
  let altura = trocaLados ? img.naturalWidth : img.naturalHeight;

  const escala = Math.min(1, LADO_MAXIMO / Math.max(largura, altura));
  largura = Math.round(largura * escala);
  altura = Math.round(altura * escala);

  tela.width = largura;
  tela.height = altura;

  ctx.save();
  ctx.translate(largura / 2, altura / 2);
  ctx.rotate((estado.giro * Math.PI) / 180);
  const l = trocaLados ? altura : largura;
  const a = trocaLados ? largura : altura;
  ctx.drawImage(img, -l / 2, -a / 2, l, a);
  ctx.restore();

  if (comFiltros) aplicarFiltros(ctx, largura, altura);
  return tela;
}

function redesenhar() {
  desenharEm($('tela'));
}

function aplicarFiltros(ctx, largura, altura) {
  const contraste = Number($('contraste').value);
  const brilho = Number($('brilho').value);
  const pretoBranco = $('pretoBranco').checked;

  const dados = ctx.getImageData(0, 0, largura, altura);
  const p = dados.data;

  for (let i = 0; i < p.length; i += 4) {
    let r = p[i];
    let g = p[i + 1];
    let b = p[i + 2];

    if (pretoBranco) {
      const cinza = 0.299 * r + 0.587 * g + 0.114 * b;
      r = g = b = cinza;
    }
    r = (r - 128) * contraste + 128 + brilho;
    g = (g - 128) * contraste + 128 + brilho;
    b = (b - 128) * contraste + 128 + brilho;

    p[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    p[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    p[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  ctx.putImageData(dados, 0, 0);
}

const imagemTratada = () => $('tela').toDataURL('image/jpeg', 0.86);

// A IA recebe a versao ajustada; o anexo guarda uma copia sem filtros para
// que nenhum traco apagado pelo contraste se perca definitivamente.
function imagemSemFiltros() {
  const tela = document.createElement('canvas');
  desenharEm(tela, false);
  return tela.toDataURL('image/jpeg', 0.86);
}

$('arquivo').addEventListener('change', (evento) => {
  const arquivo = evento.target.files?.[0];
  if (!arquivo) return;

  const img = new Image();
  img.onload = () => {
    estado.imagemOriginal = img;
    estado.giro = 0;
    estado.analise = null;
    $('resultadoAnalise').classList.add('oculto');
    $('areaImagem').classList.remove('oculto');
    $('ler').disabled = false;
    $('statusEditor').textContent = 'Foto pronta para leitura';
    redesenhar();
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(arquivo);
});

$('girar').addEventListener('click', () => {
  estado.giro = (estado.giro + 90) % 360;
  redesenhar();
});

// Os controles atualizam a imagem 1:1 enquanto o dedo se move -- nao so
// quando solta. Retorno continuo DURANTE o gesto, nao no fim dele.
for (const id of ['contraste', 'brilho', 'pretoBranco']) {
  $(id).addEventListener('input', redesenhar);
}

// ===========================================================================
// BRINDES (avisos que aparecem e somem)
// ===========================================================================

const DESLOCAMENTO_BRINDE = 28;

function brinde(mensagem, tipo = 'ok', duracaoMs = 3200) {
  const el = document.createElement('div');
  el.className = `brinde brinde--${tipo}`;
  el.innerHTML = `<span class="brinde__ponto"></span><span></span>`;
  el.lastElementChild.textContent = mensagem;
  $('brindes').append(el);

  const posicionar = (v) => {
    el.style.transform = `translate3d(0, ${v}px, 0)`;
    // Opacidade acompanha a posicao: chega e sai como uma coisa so.
    el.style.opacity = String(1 - Math.abs(v) / DESLOCAMENTO_BRINDE);
  };
  posicionar(DESLOCAMENTO_BRINDE);

  // Entrou por baixo; vai sair por baixo. Caminho simetrico.
  animarMola({ de: DESLOCAMENTO_BRINDE, para: 0, ...PADRAO, aoAtualizar: posicionar });

  setTimeout(() => {
    animarMola({
      de: 0,
      para: DESLOCAMENTO_BRINDE,
      damping: 1.0,
      response: 0.3,
      aoAtualizar: posicionar,
      aoTerminar: () => el.remove(),
    });
  }, duracaoMs);
}

// ===========================================================================
// FOLHA DE ACAO
//
// Confirmacao so para acao destrutiva e irreversivel -- apagar nota e
// exatamente esse caso. Usar dialogo pra tudo ensina a pessoa a clicar no
// automatico, e ai ele nao protege mais nada.
//
// Da pra arrastar pra dispensar. E aqui que a skill inteira aparece junto:
// rastreio 1:1, elastico na borda, projecao de momento, entrega de
// velocidade e interrupcao no meio do voo.
// ===========================================================================

const folha = {
  raiz: $('folha'),
  veu: $('veu'),
  painel: $('painel'),
  animacao: null,
  y: 0,
  altura: 0,
  resolver: null,
  aberta: false,
};

function pintarFolha(y) {
  folha.y = y;
  folha.painel.style.transform = `translate3d(0, ${y}px, 0)`;
  const progresso = folha.altura > 0 ? 1 - y / folha.altura : 0;
  folha.veu.style.opacity = String(Math.max(0, Math.min(1, progresso)));
}

function abrirFolha({ titulo, texto, confirmar }) {
  $('folhaTitulo').textContent = titulo;
  $('folhaTexto').textContent = texto;
  $('folhaConfirmar').textContent = confirmar;

  folha.raiz.hidden = false;
  folha.aberta = true;
  folha.altura = folha.painel.offsetHeight;

  pintarFolha(folha.altura);
  folha.animacao?.cancelar();
  folha.animacao = animarMola({
    de: folha.altura,
    para: 0,
    ...GAVETA,
    aoAtualizar: pintarFolha,
  });

  $('folhaCancelar').focus({ preventScroll: true });
  return new Promise((resolve) => { folha.resolver = resolve; });
}

function fecharFolha(resultado, velocidade = 0) {
  if (!folha.aberta) return;
  folha.aberta = false;

  folha.animacao?.cancelar();
  folha.animacao = animarMola({
    de: folha.y,
    para: folha.altura,
    velocidade,               // continua exatamente na velocidade do dedo
    ...GAVETA,
    aoAtualizar: pintarFolha,
    aoTerminar: () => { folha.raiz.hidden = true; },
  });

  folha.resolver?.(resultado);
  folha.resolver = null;
}

$('folhaCancelar').addEventListener('click', () => fecharFolha(false));
$('folhaConfirmar').addEventListener('click', () => fecharFolha(true));
folha.veu.addEventListener('click', () => fecharFolha(false));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && folha.aberta) fecharFolha(false);
});

// --- arrastar para dispensar ------------------------------------------------

const LIMIAR_ARRASTO = 10;   // histerese: so vira arrasto depois de 10px
const VELOCIDADE_DISPENSA = 550;

let gesto = null;

folha.painel.addEventListener('pointerdown', (evento) => {
  if (evento.button !== 0) return;
  gesto = {
    id: evento.pointerId,
    inicioY: evento.clientY,
    // Onde o painel esta AGORA na tela. Se havia mola rodando, e daqui que a
    // proxima animacao parte -- pegar o valor de destino causaria um pulo.
    baseY: folha.animacao?.ativa() ? folha.animacao.valor() : folha.y,
    arrastando: false,
    rastro: new RastroDeVelocidade(),
  };
});

folha.painel.addEventListener('pointermove', (evento) => {
  if (!gesto || evento.pointerId !== gesto.id) return;

  const delta = evento.clientY - gesto.inicioY;

  if (!gesto.arrastando) {
    if (Math.abs(delta) < LIMIAR_ARRASTO) return;   // ainda pode ser um toque
    gesto.arrastando = true;
    folha.painel.setPointerCapture(gesto.id);       // segue o dedo mesmo fora do painel
    folha.animacao?.cancelar();                     // agarrou no meio do voo
  }

  let y = gesto.baseY + delta;
  // Pra cima nao ha pra onde ir: resiste progressivamente em vez de travar.
  if (y < 0) y = -elastico(-y, folha.altura);

  gesto.rastro.registrar(y);
  pintarFolha(y);
});

function encerrarGesto(evento) {
  if (!gesto || evento.pointerId !== gesto.id) return;
  const arrastou = gesto.arrastando;
  const velocidade = gesto.rastro.velocidade();
  const y = folha.y;
  gesto = null;
  if (!arrastou) return;   // foi toque, nao arrasto -- deixa o clique passar

  // Nao decide pelo ponto onde soltou: decide por onde o arremesso IA parar.
  const destinoProjetado = y + projetar(velocidade);
  const dispensar = destinoProjetado > folha.altura * 0.4
    || velocidade > VELOCIDADE_DISPENSA;

  if (dispensar) {
    fecharFolha(false, velocidade);
  } else {
    folha.animacao?.cancelar();
    folha.animacao = animarMola({
      de: y,
      para: 0,
      velocidade,
      ...GAVETA,
      aoAtualizar: pintarFolha,
    });
  }
}

folha.painel.addEventListener('pointerup', encerrarGesto);
folha.painel.addEventListener('pointercancel', encerrarGesto);

// ===========================================================================
// LEITURA DA CALIGRAFIA (Fase 1)
// ===========================================================================

$('ler').addEventListener('click', async () => {
  const botao = $('ler');
  const status = $('statusLeitura');

  botao.dataset.ocupado = 'sim';
  botao.disabled = true;
  botao.querySelector('.botao__rotulo').textContent = 'Lendo a foto...';
  status.className = 'nota-rodape';
  status.textContent = 'Pode levar alguns segundos.';

  try {
    const resposta = await fetch('/api/ler', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imagem: imagemTratada(),
        formato: $('formatoLeitura').value,
      }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Falha na leitura.');

    $('texto').value = dados.texto;
    estado.analise = dados;
    if (!$('titulo').value.trim() && dados.tituloSugerido) {
      $('titulo').value = dados.tituloSugerido;
    }
    const nomesTipo = {
      texto: 'Texto',
      lista: 'Lista',
      mapa_mental: 'Mapa mental',
      tabela: 'Tabela',
      misto: 'Conteudo misto',
    };
    $('tipoDetectado').textContent = nomesTipo[dados.tipo] || 'Texto';
    $('incertezas').textContent = dados.incertezas?.length
      ? `Confira: ${dados.incertezas.join('; ')}`
      : 'Nenhum trecho incerto foi sinalizado pela IA.';
    $('resultadoAnalise').classList.remove('oculto');
    status.className = 'nota-rodape nota-rodape--ok';
    status.textContent = 'Pronto. Confira e corrija o que a IA errou.';
    $('statusEditor').textContent = dados.tipo === 'mapa_mental' ? 'Mapa mental reconhecido' : 'Texto reconhecido';
    brinde('Pagina analisada', 'ok');
    atualizarBotaoSalvar();
    $('texto').focus({ preventScroll: true });
  } catch (erro) {
    status.className = 'nota-rodape nota-rodape--erro';
    status.textContent = erro.message;
    brinde('Nao deu pra ler a foto', 'erro');
  } finally {
    delete botao.dataset.ocupado;
    botao.disabled = false;
    botao.querySelector('.botao__rotulo').textContent = 'Ler a letra da foto';
  }
});

// ===========================================================================
// SALVAR (Fase 3/4)
// ===========================================================================

function fotografiaDoEditor() {
  return JSON.stringify({
    titulo: $('titulo').value,
    assunto: $('assunto').value,
    texto: $('texto').value,
  });
}

function atualizarBotaoSalvar() {
  $('salvar').disabled = $('texto').value.trim() === '';
  if (estado.editorInicial && fotografiaDoEditor() !== estado.editorInicial) {
    $('statusEditor').textContent = 'Alteracoes nao salvas';
  }
}
for (const id of ['texto', 'titulo', 'assunto']) $(id).addEventListener('input', atualizarBotaoSalvar);

$('salvar').addEventListener('click', async () => {
  const botao = $('salvar');
  botao.dataset.ocupado = 'sim';
  botao.disabled = true;

  try {
    const corpo = {
      titulo: $('titulo').value,
      assunto: $('assunto').value,
      texto: $('texto').value,
      tipo: estado.analise?.tipo
        || ($('formatoLeitura').value === 'mapa_mental' ? 'mapa_mental' : 'texto'),
      estrutura: estado.analise?.estrutura || {},
      incertezas: estado.analise?.incertezas || [],
    };
    if (estado.imagemOriginal) corpo.imagem = imagemSemFiltros();

    const url = estado.editandoId ? `/api/notas/${estado.editandoId}` : '/api/notas';
    const resposta = await fetch(url, {
      method: estado.editandoId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Falha ao salvar.');

    brinde(`Salva em ${dados.assunto}`, 'ok');
    estado.editandoId = dados.id;
    estado.assuntoAtual = dados.assunto;
    estado.editorInicial = fotografiaDoEditor();
    await carregarAssuntos();
    await carregarNotas();
    navegar('telaNotas', -1);
  } catch (erro) {
    brinde(erro.message, 'erro');
  } finally {
    delete botao.dataset.ocupado;
    atualizarBotaoSalvar();
  }
});

// ===========================================================================
// ASSUNTOS E LISTA
// ===========================================================================

async function carregarAssuntos() {
  const assuntos = await (await fetch('/api/assuntos')).json();
  estado.assuntos = assuntos;

  $('assuntos').innerHTML = assuntos
    .map((a) => `<option value="${escapar(a.nome)}"></option>`)
    .join('');

  renderizarPastas();
}

function renderizarPastas() {
  const termo = $('buscaPastas').value.trim().toLocaleLowerCase('pt-BR');
  const assuntos = (estado.assuntos || []).filter(
    (item) => !termo || item.nome.toLocaleLowerCase('pt-BR').includes(termo),
  );
  const total = (estado.assuntos || []).reduce((soma, item) => soma + item.quantidade, 0);
  const todas = termo && !'todas as notas'.includes(termo) ? [] : [{ nome: '', quantidade: total }];
  const itens = [...todas, ...assuntos];

  $('totalPastas').textContent = `${estado.assuntos?.length || 0} pastas`;
  $('pastas').innerHTML = itens.length ? itens.map((item) => `
    <li class="pasta-item">
      <button type="button" class="pasta-botao" data-assunto="${escapar(item.nome)}">
        <span class="icone-pasta" aria-hidden="true">
          <svg viewBox="0 0 24 20"><path d="M2 5.5h7l2-2h4l2 2h5v12.5H2z"/></svg>
        </span>
        <span class="pasta-nome">${item.nome ? escapar(item.nome) : 'Todas as notas'}</span>
        <span class="pasta-quantidade">${item.quantidade}</span>
        <span class="pasta-seta" aria-hidden="true">›</span>
      </button>
    </li>
  `).join('') : '<li class="lista-vazia">Nenhuma pasta encontrada.</li>';
}

function nomeDoGrupo(iso) {
  const data = new Date(iso);
  const agora = new Date();
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const inicioData = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const dias = Math.floor((inicioHoje - inicioData) / 86400000);
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  if (dias < 7) return 'Ultimos 7 dias';
  if (dias < 30) return 'Ultimos 30 dias';
  return data.toLocaleDateString('pt-BR', { month: 'long', year: data.getFullYear() === agora.getFullYear() ? undefined : 'numeric' });
}

function renderizarNotas() {
  const termo = $('busca').value.trim().toLocaleLowerCase('pt-BR');
  const notas = estado.notas.filter((nota) => {
    const busca = `${nota.titulo} ${nota.previa} ${nota.assunto}`.toLocaleLowerCase('pt-BR');
    return !termo || busca.includes(termo);
  });
  $('contagemNotas').textContent = `${notas.length} ${notas.length === 1 ? 'nota' : 'notas'}`;
  if (notas.length === 0) {
    $('lista').innerHTML = '<div class="cartao-lista lista-vazia">Nenhuma nota encontrada.</div>';
    return;
  }

  const grupos = new Map();
  for (const nota of notas) {
    const nome = nomeDoGrupo(nota.criadaEm);
    if (!grupos.has(nome)) grupos.set(nome, []);
    grupos.get(nome).push(nota);
  }
  $('lista').innerHTML = [...grupos.entries()].map(([nome, itens]) => `
    <section class="grupo-data">
      <h2>${escapar(nome)}</h2>
      <ul class="cartao-lista">
        ${itens.map((nota) => `
          <li class="nota-item">
            <button type="button" class="nota-botao" data-id="${nota.id}">
              <span class="nota-titulo">${escapar(nota.titulo)}</span>
              ${nota.tipo === 'mapa_mental' ? '<span class="nota-tipo">Mapa</span>' : ''}
              <p class="nota-previa">${escapar(nota.previa || 'Nota sem previa')}</p>
            </button>
          </li>
        `).join('')}
      </ul>
    </section>
  `).join('');
}

async function carregarNotas() {
  const url = estado.assuntoAtual
    ? `/api/notas?assunto=${encodeURIComponent(estado.assuntoAtual)}`
    : '/api/notas';
  estado.notas = await (await fetch(url)).json();
  $('tituloPasta').textContent = estado.assuntoAtual || 'Todas as notas';
  $('caminhoPasta').textContent = 'Pastas';
  renderizarNotas();
}

// ===========================================================================
// NAVEGACAO ENTRE PASTAS, NOTAS E EDITOR
// ===========================================================================

function navegar(id, direcao = 1) {
  if (estado.telaAtual === id) return;
  const anterior = $(estado.telaAtual);
  const proxima = $(id);
  proxima.hidden = false;
  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduzido && typeof proxima.animate === 'function') {
    proxima.classList.add('tela--entrando');
    proxima.animate(
      [{ transform: `translateX(${direcao * 14}%)`, opacity: 0.5 }, { transform: 'translateX(0)', opacity: 1 }],
      { duration: 300, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
    ).finished.finally(() => proxima.classList.remove('tela--entrando'));
    anterior.animate(
      [{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${direcao * -7}%)`, opacity: 0.25 }],
      { duration: 240, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
    ).finished.finally(() => { anterior.hidden = true; });
  } else {
    anterior.hidden = true;
  }
  estado.telaAtual = id;
  proxima.scrollTo({ top: 0, behavior: 'auto' });
}

function limparEditor() {
  estado.editandoId = null;
  estado.imagemOriginal = null;
  estado.analise = null;
  $('titulo').value = '';
  $('assunto').value = estado.assuntoAtual;
  $('texto').value = '';
  $('arquivo').value = '';
  $('areaImagem').classList.add('oculto');
  $('resultadoAnalise').classList.add('oculto');
  $('menuNota').hidden = true;
  $('maisEditor').disabled = true;
  $('dataEditor').textContent = new Date().toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
  $('statusEditor').textContent = 'Nova nota';
  estado.editorInicial = fotografiaDoEditor();
  atualizarBotaoSalvar();
}

function abrirEditorNovo() {
  estado.origemEditor = estado.telaAtual;
  limparEditor();
  navegar('telaEditor', 1);
  setTimeout(() => $('texto').focus({ preventScroll: true }), 220);
}

async function abrirNota(id) {
  const resposta = await fetch(`/api/notas/${id}`);
  const nota = await resposta.json();
  if (!resposta.ok) return brinde(nota.erro || 'Nao deu pra abrir a nota', 'erro');
  estado.origemEditor = estado.telaAtual;
  estado.editandoId = nota.id;
  estado.imagemOriginal = null;
  estado.analise = {
    tipo: nota.tipo || 'texto',
    estrutura: nota.estrutura || {},
    incertezas: nota.incertezas || [],
  };
  $('titulo').value = nota.titulo;
  $('assunto').value = nota.assunto;
  $('texto').value = nota.texto;
  $('areaImagem').classList.add('oculto');
  $('resultadoAnalise').classList.add('oculto');
  $('menuNota').hidden = true;
  $('maisEditor').disabled = false;
  $('dataEditor').textContent = new Date(nota.criadaEm).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
  $('statusEditor').textContent = nota.tipo === 'mapa_mental' ? 'Mapa mental' : 'Nota salva';
  estado.editorInicial = fotografiaDoEditor();
  atualizarBotaoSalvar();
  navegar('telaEditor', 1);
}

async function sairDoEditor() {
  if (estado.editorInicial !== fotografiaDoEditor()) {
    const descartar = await abrirFolha({
      titulo: 'Descartar alteracoes?',
      texto: 'As mudancas feitas nesta nota ainda nao foram salvas.',
      confirmar: 'Descartar',
    });
    if (!descartar) return;
  }
  navegar(estado.origemEditor || 'telaNotas', -1);
}

$('pastas').addEventListener('click', async (evento) => {
  const botao = evento.target.closest('[data-assunto]');
  if (!botao) return;
  estado.assuntoAtual = botao.dataset.assunto;
  await carregarNotas();
  navegar('telaNotas', 1);
});
$('lista').addEventListener('click', (evento) => {
  const botao = evento.target.closest('[data-id]');
  if (botao) abrirNota(botao.dataset.id);
});
$('voltarPastas').addEventListener('click', () => navegar('telaPastas', -1));
$('voltarEditor').addEventListener('click', sairDoEditor);
$('novaNota').addEventListener('click', abrirEditorNovo);
$('novaNotaPasta').addEventListener('click', () => {
  estado.assuntoAtual = '';
  abrirEditorNovo();
});
$('buscaPastas').addEventListener('input', renderizarPastas);
$('busca').addEventListener('input', renderizarNotas);
$('maisNotas').addEventListener('click', () => brinde(`${estado.notas.length} notas nesta pasta`, 'aviso'));
$('mostrarFormato').addEventListener('click', () => {
  brinde('Mapa: # tema, ## ramo e - item', 'aviso', 4200);
});

$('maisEditor').addEventListener('click', () => {
  if (!estado.editandoId) return;
  $('menuNota').hidden = !$('menuNota').hidden;
  const nota = estado.notas.find((item) => item.id === estado.editandoId);
  $('menuNota').querySelector('[data-menu="mapa"]').hidden = nota?.tipo !== 'mapa_mental';
  $('menuNota').querySelector('[data-menu="foto"]').hidden = !nota?.temFoto;
});
$('menuNota').addEventListener('click', async (evento) => {
  const acao = evento.target.closest('[data-menu]')?.dataset.menu;
  if (!acao || !estado.editandoId) return;
  $('menuNota').hidden = true;
  if (acao === 'pdf') return window.open(`/api/notas/${estado.editandoId}/pdf`, '_blank');
  if (acao === 'mapa') return window.open(`/api/notas/${estado.editandoId}/pdf?formato=mapa`, '_blank');
  if (acao === 'foto') return window.open(`/api/notas/${estado.editandoId}/pdf?foto=1`, '_blank');
  if (acao === 'apagar') {
    const confirmado = await abrirFolha({
      titulo: 'Apagar esta nota?',
      texto: `"${$('titulo').value}" some para sempre. Nao da pra desfazer.`,
      confirmar: 'Apagar',
    });
    if (!confirmado) return;
    const resposta = await fetch(`/api/notas/${estado.editandoId}`, { method: 'DELETE' });
    if (!resposta.ok) return brinde('Nao deu pra apagar', 'erro');
    brinde('Nota apagada', 'aviso');
    await carregarAssuntos();
    await carregarNotas();
    navegar('telaNotas', -1);
  }
});

// ===========================================================================
// UTILIDADES
// ===========================================================================

function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function formatarData(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ===========================================================================
// INICIO
// ===========================================================================

(async () => {
  $('saudacao').textContent = `Ola, ${primeiroNome(usuario.nome) || usuario.email}.`;
  $('sair').addEventListener('click', () => {
    encerrarSessao();
    location.replace('/login.html');
  });

  const estadoServidor = await (await fetch('/api/estado')).json();
  const aviso = $('estado');

  if (estadoServidor.chaveConfigurada) {
    aviso.className = 'etiqueta';
    // Dizer QUEM esta lendo: com duas chaves no .env o Gemini atende, e a conta
    // chega no lugar errado se voce achar que era a outra.
    const quem = estadoServidor.provedor === 'gemini' ? 'Gemini' : 'Anthropic';
    aviso.textContent = `Fotografe, leia a letra, gere o PDF. Lendo com ${quem}`
      + (estadoServidor.modelo ? ` (${estadoServidor.modelo}).` : '.');
  } else {
    aviso.className = 'etiqueta etiqueta--erro';
    aviso.textContent = 'Sem chave da Vision AI: da pra digitar o texto a mao e gerar o PDF, '
      + 'mas a leitura automatica da foto vai falhar.';
  }

  await carregarAssuntos();
  await carregarNotas();
})();
