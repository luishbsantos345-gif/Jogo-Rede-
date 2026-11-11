// Geometria do mapa isométrico, compartilhada entre servidor e navegador.
//
//  Grade 16 × 14 tiles. Eixo x desce para a direita, eixo y desce para a esquerda.
//  Interior da barbearia (lote de 10 × 8): x 3..12, y 2..9
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

export function noInterior(x, y) {
  const i = MAPA.interior;
  return x >= i.x0 && x <= i.x1 && y >= i.y0 && y <= i.y1;
}

export function tipoTile(x, y) {
  if (x < 0 || y < 0 || x >= MAPA.W || y >= MAPA.H) return 'fora';
  if (noInterior(x, y)) return 'interior';
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
export function caminhavelBase(x, y) {
  const t = tipoTile(x, y);
  if (t === 'interior') return true;
  if (t === 'calcada') return true; // postes ficam na beira da rua e não bloqueiam
  return false;
}

/** Pode passar de um tile para o vizinho? Paredes só têm abertura na porta. */
export function passagemLivre(ax, ay, bx, by) {
  const ia = noInterior(ax, ay);
  const ib = noInterior(bx, by);
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
export function aEstrela(inicio, fim, bloqueado = () => false, permitirFimBloqueado = false) {
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
      if (!caminhavelBase(nx, ny)) continue;
      if (!passagemLivre(atual.x, atual.y, nx, ny)) continue;
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
