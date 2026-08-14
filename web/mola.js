// Motor de molas, sem biblioteca externa.
//
// A Apple trocou o trio da fisica (massa/rigidez/amortecimento) por dois
// parametros que um designer consegue pensar:
//
//   damping  -> quanto quica. 1.0 = assenta liso, sem passar do ponto.
//                             < 1.0 passa do ponto e volta. Menor = mais quique.
//   response -> quao rapido chega no alvo, em segundos. NAO e "duracao":
//               mola nao tem duracao fixa, o tempo de assentar sai dos parametros.
//
// Valores que a Apple usa:
//   mover/reposicionar  damping 1.0  response 0.4
//   rotacao             damping 0.8  response 0.4
//   gaveta / folha      damping 0.8  response 0.3
//
// A razao de existir este arquivo em vez de uma transicao CSS: mola e
// interrompivel e sabe de velocidade. Da pra agarrar no meio do voo, ler onde
// o elemento esta AGORA e continuar dali, herdando a velocidade do dedo.

export const PADRAO = { damping: 1.0, response: 0.4 };
export const IMPULSO = { damping: 0.8, response: 0.4 };
export const GAVETA = { damping: 0.8, response: 0.3 };

// Guardado com `?.` para o arquivo poder ser importado tambem fora do
// navegador (nos testes). Fora dele, nao ha preferencia -- assume-se que nao.
const movimentoReduzido = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
  ?? { matches: false };

/**
 * Anima um valor ate `alvo` com fisica de mola.
 *
 * Devolve um controle com `.cancelar()` e `.valor()` -- o valor de
 * apresentacao, o que esta na tela neste instante. E dele que a proxima
 * animacao deve partir quando o usuario interrompe.
 *
 * @param {object} opcoes
 * @param {number} opcoes.de           valor inicial
 * @param {number} opcoes.para         alvo
 * @param {number} [opcoes.velocidade] velocidade inicial, em unidades/segundo
 * @param {number} [opcoes.damping]
 * @param {number} [opcoes.response]
 * @param {(v:number)=>void} opcoes.aoAtualizar  chamado a cada quadro
 * @param {() => void} [opcoes.aoTerminar]
 */
export function animarMola({
  de,
  para,
  velocidade = 0,
  damping = PADRAO.damping,
  response = PADRAO.response,
  aoAtualizar,
  aoTerminar,
}) {
  // Movimento reduzido: sem mola, sem deslocamento. Vai direto ao alvo.
  if (movimentoReduzido.matches) {
    aoAtualizar(para);
    aoTerminar?.();
    return { cancelar() {}, valor: () => para, ativa: () => false };
  }

  const omega = (2 * Math.PI) / response;
  const rigidez = omega * omega;
  const atrito = 2 * damping * omega;

  // Tolerancia proporcional a distancia, pra funcionar tanto em px quanto em
  // valores de 0 a 1.
  const escala = Math.max(1, Math.abs(para - de));
  const tolValor = 0.002 * escala;
  const tolVelocidade = 0.02 * escala;

  let x = de;
  let v = velocidade;
  let quadro = null;
  let anterior = null;
  let viva = true;

  const passo = (agora) => {
    if (!viva) return;
    if (anterior === null) anterior = agora;
    // Limita o dt: se a aba ficou em segundo plano, um dt gigante explode a
    // integracao numerica.
    let dt = Math.min((agora - anterior) / 1000, 1 / 30);
    anterior = agora;

    // Integra em sub-passos fixos: estavel mesmo com response bem curto.
    const SUB = 1 / 240;
    while (dt > 0) {
      const h = Math.min(SUB, dt);
      const aceleracao = -rigidez * (x - para) - atrito * v;
      v += aceleracao * h;
      x += v * h;
      dt -= h;
    }

    if (Math.abs(x - para) < tolValor && Math.abs(v) < tolVelocidade) {
      x = para;
      v = 0;
      viva = false;
      aoAtualizar(x);
      aoTerminar?.();
      return;
    }

    aoAtualizar(x);
    quadro = requestAnimationFrame(passo);
  };

  quadro = requestAnimationFrame(passo);

  return {
    cancelar() {
      viva = false;
      if (quadro !== null) cancelAnimationFrame(quadro);
    },
    valor: () => x,
    velocidade: () => v,
    ativa: () => viva,
  };
}

/**
 * Onde um arremesso vai parar sozinho.
 *
 * Esta e a funcao exata do codigo de exemplo da Apple ("Designing Fluid
 * Interfaces") -- decaimento exponencial. A formula de livro-texto
 * v^2/(2a) NAO e o que eles usam e da uma sensacao diferente.
 *
 * @param {number} velocidade  px por segundo, no momento de soltar
 * @param {number} [decaimento] 0.998 = rolagem normal, 0.99 = mais seco
 */
export function projetar(velocidade, decaimento = 0.998) {
  return (velocidade / 1000) * decaimento / (1 - decaimento);
}

/**
 * Elastico de borda: quanto mais o dedo passa do limite, menos o elemento
 * acompanha. Parada seca parece travamento; resistencia progressiva parece
 * "respondendo, mas nao tem mais nada aqui".
 *
 * @param {number} excesso   quanto passou do limite, em px
 * @param {number} dimensao  tamanho de referencia (altura da folha, p.ex.)
 */
export function elastico(excesso, dimensao, constante = 0.55) {
  return (excesso * dimensao * constante) / (dimensao + constante * Math.abs(excesso));
}

/** Acompanha os ultimos pontos do ponteiro pra saber a velocidade ao soltar. */
export class RastroDeVelocidade {
  constructor(janelaMs = 100) {
    this.janelaMs = janelaMs;
    this.pontos = [];
  }

  registrar(valor, tempo = performance.now()) {
    this.pontos.push({ valor, tempo });
    const corte = tempo - this.janelaMs;
    while (this.pontos.length > 2 && this.pontos[0].tempo < corte) this.pontos.shift();
  }

  /** Velocidade em unidades por segundo. */
  velocidade() {
    if (this.pontos.length < 2) return 0;
    const primeiro = this.pontos[0];
    const ultimo = this.pontos[this.pontos.length - 1];
    const dt = (ultimo.tempo - primeiro.tempo) / 1000;
    if (dt <= 0) return 0;
    return (ultimo.valor - primeiro.valor) / dt;
  }

  limpar() {
    this.pontos = [];
  }
}
