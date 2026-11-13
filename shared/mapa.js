// Geometria do mapa isométrico, compartilhada entre servidor e navegador.
//
//  Grade 16 × 14 tiles. Eixo x desce para a direita, eixo y desce para a esquerda.
//  Interior da barbearia no nível 1 (lote de 10 × 8): x 3..12, y 2..9
//  Nível 2 anexa o jardim da direita (x até 15). Nível 3 anexa os fundos (y desde 0).
//  Porta: entre (7,9) dentro e (7,10) na calçada
//  Calçada: y 10..11   Rua: y 12..13
//  Prédio vizinho à esquerda: x 0..2 (y 2..9). Jardim à direita: x 13..15. Prédios ao fundo: y 0..1

export const MAPA = {
  W: 16,
  H: 14,
  interior: { x0: 3, y0: 2, x1: 12, y1: 9 },
  porta: { x: 7, y: 9 },
  portaFora: { x: 7, y: 10 },
  calcada: [10, 11],
  rua: [12, 13],
  postes: [{ x: 1, y: 11 }, { x: 14, y: 11 }],
  tileW: 32,
  tileH: 16,
};

/** Área interna de cada nível de ampliação (índice = nível). */
export const NIVEIS_INTERIOR = [
  null,
  { x0: 3, y0: 2, x1: 12, y1: 9 }, // 1: salão original (10 × 8)
  { x0: 3, y0: 2, x1: 15, y1: 9 }, // 2: anexo lateral, onde era o jardim (13 × 8)
  { x0: 3, y0: 0, x1: 15, y1: 9 }, // 3: salão dos fundos (13 × 10)
];

export function interiorDoNivel(nivel = 1) {
  return NIVEIS_INTERIOR[Math.max(1, Math.min(NIVEIS_INTERIOR.length - 1, Math.floor(nivel) || 1))];
}

/** Todas as funções abaixo aceitam o interior atual (int); sem ele, usam o do nível 1. */
export function noInterior(x, y, int = MAPA.interior) {
  const i = int;
  return x >= i.x0 && x <= i.x1 && y >= i.y0 && y <= i.y1;
}

export function tipoTile(x, y, int = MAPA.interior) {
  if (x < 0 || y < 0 || x >= MAPA.W || y >= MAPA.H) return 'fora';
  if (noInterior(x, y, int)) return 'interior';
  if (y === 10 || y === 11) return 'calcada';
  if (y >= 12) return 'rua';
  if (x <= 2 && y >= 2 && y <= 9) return 'predio';
  if (x >= 13 && y >= 2 && y <= 9) return 'jardim'; // lado direito baixo, para não esconder a loja
  return 'fundos'; // prédios atrás da loja (y 0..1)
}

export function ehPoste(x, y) {
  return MAPA.postes.some((p) => p.x === x && p.y === y);
}

/** Pode-se andar neste tile (sem considerar móveis)? */
export function caminhavelBase(x, y, int = MAPA.interior) {
  const t = tipoTile(x, y, int);
  if (t === 'interior') return true;
  if (t === 'calcada') return true; // postes ficam na beira da rua e não bloqueiam
  return false;
}

/** Pode passar de um tile para o vizinho? Paredes só têm abertura na porta. */
export function passagemLivre(ax, ay, bx, by, int = MAPA.interior) {
  const ia = noInterior(ax, ay, int);
  const ib = noInterior(bx, by, int);
  if (ia === ib) return true;
  const p = MAPA.porta;
  const f = MAPA.portaFora;
  return (ax === p.x && ay === p.y && bx === f.x && by === f.y) || (bx === p.x && by === p.y && ax === f.x && ay === f.y);
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * A* simples em grade 4-vizinhos.
 * bloqueado(x,y) diz se o tile está ocupado (móvel). O tile final pode ser
 * bloqueado (ex.: cadeira) se permitirFimBloqueado = true.
 * Retorna lista de tiles [{x,y}, ...] sem o inicial, ou null.
 */
export function aEstrela(inicio, fim, bloqueado = () => false, permitirFimBloqueado = false, int = MAPA.interior) {
  const sx = Math.floor(inicio.x);
  const sy = Math.floor(inicio.y);
  const ex = fim.x;
  const ey = fim.y;
  if (sx === ex && sy === ey) return [];
  const chave = (x, y) => y * MAPA.W + x;
  const aberto = new Map();
  const g = new Map();
  const veio = new Map();
  const h = (x, y) => Math.abs(x - ex) + Math.abs(y - ey);
  aberto.set(chave(sx, sy), { x: sx, y: sy, f: h(sx, sy) });
  g.set(chave(sx, sy), 0);
  const fechado = new Set();
  let guarda = 0;
  while (aberto.size && guarda++ < 4000) {
    let atual = null;
    for (const n of aberto.values()) if (!atual || n.f < atual.f) atual = n;
    const ka = chave(atual.x, atual.y);
    aberto.delete(ka);
    if (atual.x === ex && atual.y === ey) {
      const caminho = [];
      let k = ka;
      while (k !== chave(sx, sy)) {
        caminho.push({ x: k % MAPA.W, y: Math.floor(k / MAPA.W) });
        k = veio.get(k);
      }
      return caminho.reverse();
    }
    fechado.add(ka);
    for (const [dx, dy] of DIRS) {
      const nx = atual.x + dx;
      const ny = atual.y + dy;
      const kn = chave(nx, ny);
      if (fechado.has(kn)) continue;
      if (!caminhavelBase(nx, ny, int)) continue;
      if (!passagemLivre(atual.x, atual.y, nx, ny, int)) continue;
      const ehFim = nx === ex && ny === ey;
      if (bloqueado(nx, ny) && !(ehFim && permitirFimBloqueado)) continue;
      const ng = g.get(ka) + 1;
      if (ng < (g.get(kn) ?? Infinity)) {
        g.set(kn, ng);
        veio.set(kn, ka);
        aberto.set(kn, { x: nx, y: ny, f: ng + h(nx, ny) });
      }
    }
  }
  return null;
}

export function vizinhos(x, y) {
  return DIRS.map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
}

// ---- Para onde o móvel está virado ----
// rot 0 = +x, 1 = +y, 2 = −x, 3 = −y (mesma convenção da direção dos personagens).
// A cadeira "olha" para a frente (o cliente senta de frente para esse lado);
// o espelho tem o vidro voltado para a frente.
export const FRENTE = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** Tile logo à frente de um móvel. */
export function tileAFrente(m) {
  const [dx, dy] = FRENTE[((m.rot ?? 0) % 4 + 4) % 4];
  return { x: m.x + dx, y: m.y + dy };
}

/**
 * Espelho que atende esta cadeira: fica no tile à frente da cadeira
 * e com o vidro virado para ela (rotação oposta). Retorna o móvel ou null.
 */
export function espelhoDaCadeira(cadeira, moveis) {
  if (!cadeira?.colocado) return null;
  const f = tileAFrente(cadeira);
  const rotOposta = (((cadeira.rot ?? 0) + 2) % 4 + 4) % 4;
  return moveis.find((m) => m.colocado && m.tipo === 'espelho' && m.x === f.x && m.y === f.y && (((m.rot ?? 0) % 4) + 4) % 4 === rotOposta) || null;
}

// ---- Projeção isométrica (pixels do mundo) ----
/** Canto superior do losango do tile (x,y) — ou de qualquer ponto fracionário. */
export function isoParaTela(x, y) {
  return { sx: (x - y) * (MAPA.tileW / 2), sy: (x + y) * (MAPA.tileH / 2) };
}

/** Inverso: pixel do mundo → coordenada fracionária de tile. */
export function telaParaIso(sx, sy) {
  const a = sx / (MAPA.tileW / 2);
  const b = sy / (MAPA.tileH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
