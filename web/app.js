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

const $ = (id) => document.getElementById(id);

const estado = {
  imagemOriginal: null,
  giro: 0,
};

// ===========================================================================
// MELHORIA DE IMAGEM (Fase 2)
// ===========================================================================

const LADO_MAXIMO = 1800; // foto gigante nao le melhor -- so pesa mais

function redesenhar() {
  const img = estado.imagemOriginal;
  if (!img) return;

  const tela = $('tela');
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

  aplicarFiltros(ctx, largura, altura);
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

const imagemTratada = () => $('tela').toDataURL('image/jpeg', 0.9);

$('arquivo').addEventListener('change', (evento) => {
  const arquivo = evento.target.files?.[0];
  if (!arquivo) return;

  const img = new Image();
  img.onload = () => {
    estado.imagemOriginal = img;
    estado.giro = 0;
    $('areaImagem').classList.remove('oculto');
    $('ler').disabled = false;
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
      body: JSON.stringify({ imagem: imagemTratada() }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Falha na leitura.');

    $('texto').value = dados.texto;
    status.className = 'nota-rodape nota-rodape--ok';
    status.textContent = 'Pronto. Confira e corrija o que a IA errou.';
    brinde('Texto extraido da foto', 'ok');
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

function atualizarBotaoSalvar() {
  $('salvar').disabled = $('texto').value.trim() === '';
}
$('texto').addEventListener('input', atualizarBotaoSalvar);

$('salvar').addEventListener('click', async () => {
  const botao = $('salvar');
  botao.dataset.ocupado = 'sim';
  botao.disabled = true;

  try {
    const corpo = {
      titulo: $('titulo').value,
      assunto: $('assunto').value,
      texto: $('texto').value,
    };
    if (estado.imagemOriginal) corpo.imagem = imagemTratada();

    const resposta = await fetch('/api/notas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Falha ao salvar.');

    brinde(`Salva em ${dados.assunto}`, 'ok');
    await carregarAssuntos();
    await carregarNotas();
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

  $('assuntos').innerHTML = assuntos
    .map((a) => `<option value="${escapar(a.nome)}"></option>`)
    .join('');

  const filtro = $('filtro');
  const escolhido = filtro.value;
  filtro.innerHTML = '<option value="">Todos os assuntos</option>'
    + assuntos
      .map((a) => `<option value="${escapar(a.nome)}">${escapar(a.nome)} (${a.quantidade})</option>`)
      .join('');
  filtro.value = escolhido;
}

async function carregarNotas() {
  const assunto = $('filtro').value;
  const url = assunto ? `/api/notas?assunto=${encodeURIComponent(assunto)}` : '/api/notas';
  const notas = await (await fetch(url)).json();

  const lista = $('lista');
  if (notas.length === 0) {
    lista.innerHTML = '<li class="lista__vazia">Nenhuma nota ainda.</li>';
    return;
  }

  lista.innerHTML = notas.map((nota) => `
    <li class="lista__item" data-id="${nota.id}">
      <span class="lista__titulo">${escapar(nota.titulo)}</span>
      <span class="lista__acoes">
        <button type="button" class="botao botao--discreto" data-acao="pdf">PDF</button>
        ${nota.temFoto
          ? '<button type="button" class="botao botao--discreto" data-acao="pdf-foto">+ foto</button>'
          : ''}
        <button type="button" class="botao botao--discreto" data-acao="apagar"
                aria-label="Apagar ${escapar(nota.titulo)}">Apagar</button>
      </span>
      <span class="lista__meta">
        <span class="ficha">${escapar(nota.assunto)}</span>
        <span>${formatarData(nota.criadaEm)}</span>
      </span>
      <p class="lista__previa">${escapar(nota.previa)}</p>
    </li>
  `).join('');
}

$('lista').addEventListener('click', async (evento) => {
  const botao = evento.target.closest('button[data-acao]');
  if (!botao) return;

  const item = botao.closest('li');
  const id = item.dataset.id;
  const titulo = item.querySelector('.lista__titulo').textContent;

  if (botao.dataset.acao === 'pdf') {
    window.open(`/api/notas/${id}/pdf`, '_blank');
    return;
  }
  if (botao.dataset.acao === 'pdf-foto') {
    window.open(`/api/notas/${id}/pdf?foto=1`, '_blank');
    return;
  }
  if (botao.dataset.acao === 'apagar') {
    const confirmado = await abrirFolha({
      titulo: 'Apagar esta nota?',
      texto: `"${titulo}" some para sempre. Nao da pra desfazer.`,
      confirmar: 'Apagar',
    });
    if (!confirmado) return;

    const resposta = await fetch(`/api/notas/${id}`, { method: 'DELETE' });
    if (!resposta.ok) {
      brinde('Nao deu pra apagar', 'erro');
      return;
    }
    brinde('Nota apagada', 'aviso');
    await carregarAssuntos();
    await carregarNotas();
  }
});

$('filtro').addEventListener('change', carregarNotas);

// ===========================================================================
// BORDA DE ROLAGEM
// A camada translucida so ganha sombra quando ha conteudo passando por
// baixo dela. Divisoria permanente e ruido visual.
// ===========================================================================

let rolagemAgendada = false;
addEventListener('scroll', () => {
  if (rolagemAgendada) return;
  rolagemAgendada = true;
  requestAnimationFrame(() => {
    rolagemAgendada = false;
    $('chrome').dataset.rolado = scrollY > 4 ? 'sim' : 'nao';
  });
}, { passive: true });

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
  const estadoServidor = await (await fetch('/api/estado')).json();
  const aviso = $('estado');

  if (estadoServidor.chaveConfigurada) {
    aviso.className = 'etiqueta';
    aviso.textContent = 'Fotografe, leia a letra, gere o PDF.';
  } else {
    aviso.className = 'etiqueta etiqueta--erro';
    aviso.textContent = 'Sem chave da Vision AI: da pra digitar o texto a mao e gerar o PDF, '
      + 'mas a leitura automatica da foto vai falhar.';
  }

  await carregarAssuntos();
  await carregarNotas();
})();
