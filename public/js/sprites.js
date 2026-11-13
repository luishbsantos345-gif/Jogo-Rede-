// Todos os gráficos são gerados aqui, proceduralmente, pixel a pixel.
// Nenhuma imagem externa é usada.

export const CONTORNO = '#1a1220';

export const PALETAS = {
  pele: ['#f6d3b3', '#eab88f', '#c98e62', '#a8693f', '#7a4a2a', '#4f2f1c'],
  cabeloCor: ['#2a1d14', '#6b3e1f', '#e0b84a', '#b5482a', '#c4c4c8', '#3a6fd8'],
  camisa: ['#d64545', '#3b7dd8', '#3fa34d', '#f2c230', '#8e44ad', '#ee7d2b', '#f2f2ee', '#3a3a44'],
  calca: ['#34507a', '#2b2b33', '#b8a17a', '#7d7f86'],
};
export const NOMES_SKIN = {
  pele: ['Tom 1', 'Tom 2', 'Tom 3', 'Tom 4', 'Tom 5', 'Tom 6'],
  cabeloEstilo: ['Curto', 'Raspado', 'Topete', 'Crespo volumoso', 'Longo', 'Moicano'],
  cabeloCor: ['Preto', 'Castanho', 'Loiro', 'Ruivo', 'Grisalho', 'Azul'],
  camisa: ['Vermelha', 'Azul', 'Verde', 'Amarela', 'Roxa', 'Laranja', 'Branca', 'Preta'],
  calca: ['Jeans', 'Preta', 'Cáqui', 'Cinza'],
  acessorio: ['Nenhum', 'Boné', 'Óculos', 'Avental'],
};

// ------------------------------------------------------------- utilidades de cor
function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function escurecer(h, f = 0.75) {
  const [r, g, b] = hexRgb(h);
  return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
}
export function clarear(h, f = 0.25) {
  const [r, g, b] = hexRgb(h);
  return `rgb(${Math.round(r + (255 - r) * f)},${Math.round(g + (255 - g) * f)},${Math.round(b + (255 - b) * f)})`;
}

function novoCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Adiciona contorno escuro de 1 px em volta da silhueta. */
export function contornar(canvas, cor = CONTORNO) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const a = img.data;
  const [r, g, b] = hexRgb(cor);
  const opaco = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 127;
  const marcar = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (a[i + 3] > 127) {
        a[i + 3] = 255;
        continue;
      }
      a[i + 3] = 0;
      if (opaco(x - 1, y) || opaco(x + 1, y) || opaco(x, y - 1) || opaco(x, y + 1)) marcar.push(i);
    }
  for (const i of marcar) {
    a[i] = r;
    a[i + 1] = g;
    a[i + 2] = b;
    a[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ------------------------------------------------------------- rasterização nítida
/** Preenche polígono convexo sem antisserrilhado. */
export function poligono(ctx, pts, cor) {
  ctx.fillStyle = cor;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  for (let y = Math.floor(minY); y < Math.ceil(maxY); y++) {
    const yc = y + 0.5;
    let xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    const x0 = Math.round(xs[0]);
    const x1 = Math.round(xs[xs.length - 1]);
    if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, 1);
  }
}

/** Linha de 1 px (Bresenham). */
export function linha(ctx, x0, y0, x1, y1, cor) {
  ctx.fillStyle = cor;
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 2000; guard++) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Projeção dentro de um sprite: (u,v) em tiles a partir do canto (ox,oy), z em px. */
export function projetor(ox, oy) {
  return (u, v, z = 0) => [ox + (u - v) * 16, oy + (u + v) * 8 - z];
}

/**
 * Gira um retângulo do tile (u,v em 0..1) r quartos de volta em torno do centro.
 * Um quarto de volta leva a direção +x para +y (mesma convenção de rot dos móveis).
 */
function girarRet(u0, v0, u1, v1, r) {
  let pts = [[u0, v0], [u1, v1]];
  for (let k = 0; k < r; k++) pts = pts.map(([u, v]) => [1 - v, u]);
  return [Math.min(pts[0][0], pts[1][0]), Math.min(pts[0][1], pts[1][1]), Math.max(pts[0][0], pts[1][0]), Math.max(pts[0][1], pts[1][1])];
}

/**
 * Caixa isométrica com 3 faces visíveis (topo, face +x, face +y).
 * Se o projetor tiver P.rot (móvel girado), a caixa é girada e cada face visível
 * recebe a cor do "material" do lado original (ex.: o vidro do espelho só aparece
 * quando está virado para a câmera).
 */
export function caixa(ctx, P, u0, v0, u1, v1, z0, z1, cor, opts = {}) {
  const topo = opts.topo || clarear(cor, 0.18);
  let dir = opts.dir || cor; // face +x (direita)
  let esq = opts.esq || escurecer(cor, 0.78); // face +y (esquerda)
  const r = P.rot || 0;
  if (r) {
    [u0, v0, u1, v1] = girarRet(u0, v0, u1, v1, r);
    // material de cada lado original: 0 = +x, 1 = +y, 2 = −x, 3 = −y
    const material = [opts.dir, opts.esq, opts.dirTras, opts.esqTras];
    dir = material[(4 - r) % 4] || cor;
    esq = material[(5 - r) % 4] || escurecer(cor, 0.78);
  }
  poligono(ctx, [P(u1, v0, z0), P(u1, v1, z0), P(u1, v1, z1), P(u1, v0, z1)], dir);
  poligono(ctx, [P(u0, v1, z0), P(u1, v1, z0), P(u1, v1, z1), P(u0, v1, z1)], esq);
  poligono(ctx, [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], topo);
  if (opts.arestas !== false) {
    const c = opts.corAresta || escurecer(cor, 0.55);
    const a = P(u1, v1, z1);
    const b = P(u1, v1, z0);
    linha(ctx, a[0], a[1], b[0], b[1] - 1, c);
  }
}

// ------------------------------------------------------------- personagens
const cachePers = new Map();

/**
 * Gera o sprite 14×22 de um personagem.
 * dir: 0 = frente-direita, 1 = frente-esquerda, 2 = costas-esquerda, 3 = costas-direita
 * quadro: 0..3 (caminhada).  sentado: pernas dobradas.
 */
export function spritePersonagem(skin, dir = 0, quadro = 0, sentado = false) {
  const chave = `${skin.pele}${skin.cabeloEstilo}${skin.cabeloCor}${skin.camisa}${skin.calca}${skin.acessorio}|${dir}|${quadro}|${sentado ? 1 : 0}`;
  let c = cachePers.get(chave);
  if (c) return c;
  c = novoCanvas(14, 22);
  const ctx = c.getContext('2d');
  const frente = dir === 0 || dir === 1;
  const pele = PALETAS.pele[skin.pele] || PALETAS.pele[0];
  const peleS = escurecer(pele, 0.82);
  const cab = PALETAS.cabeloCor[skin.cabeloCor] || PALETAS.cabeloCor[0];
  const cabL = clarear(cab, 0.25);
  const cam = PALETAS.camisa[skin.camisa] || PALETAS.camisa[0];
  const camS = escurecer(cam, 0.75);
  const cal = PALETAS.calca[skin.calca] || PALETAS.calca[0];
  const calS = escurecer(cal, 0.75);
  const sapato = '#3b2a20';
  const px = (x, y, cor, w = 1, h = 1) => {
    ctx.fillStyle = cor;
    ctx.fillRect(x + 1, y + 1, w, h);
  };
  const bob = quadro === 1 || quadro === 3 ? 0 : 0;

  // pernas
  if (sentado) {
    px(3, 14, cal, 6, 2);
    px(8, 14, calS, 2, 2);
    px(8, 16, cal, 2, 1);
    px(8, 17, sapato, 3, 1);
  } else {
    const levantaE = quadro === 1 ? 1 : 0;
    const levantaD = quadro === 3 ? 1 : 0;
    px(3, 14, cal, 3, 4 - levantaE);
    px(3, 18 - levantaE, sapato, 3, 1);
    px(6, 14, calS, 3, 4 - levantaD);
    px(6, 18 - levantaD, sapato, 3, 1);
    px(3, 14, escurecer(cal, 0.6), 6, 1);
  }
  // tronco
  px(3, 8 + bob, cam, 6, 6);
  px(8, 8 + bob, camS, 1, 6);
  px(3, 13 + bob, escurecer(cam, 0.6), 6, 1); // cinto/barra
  // braços
  const bracoFrente = quadro === 1 ? -1 : quadro === 3 ? 1 : 0;
  px(2, 9 + bob + bracoFrente, cam, 1, 3);
  px(2, 12 + bob + bracoFrente, pele, 1, 1);
  px(9, 9 + bob - bracoFrente, camS, 1, 3);
  px(9, 12 + bob - bracoFrente, peleS, 1, 1);
  // pescoço e cabeça
  px(5, 7 + bob, peleS, 2, 1);
  px(3, 2 + bob, pele, 6, 5);
  px(8, 2 + bob, peleS, 1, 5);
  if (frente) {
    px(5, 4 + bob, CONTORNO);
    px(7, 4 + bob, CONTORNO);
    px(6, 6 + bob, escurecer(pele, 0.7));
  }
  // avental
  if (skin.acessorio === 3) {
    if (frente) {
      px(4, 9 + bob, '#f1ede2', 4, 6);
      px(4, 8 + bob, '#f1ede2', 1, 1);
      px(7, 8 + bob, '#f1ede2', 1, 1);
      px(5, 11 + bob, '#cfc8b4', 2, 1);
    } else {
      px(3, 11 + bob, '#f1ede2', 6, 1);
    }
  }
  // cabelo
  const est = skin.cabeloEstilo;
  const y = bob;
  if (frente) {
    if (est === 0) {
      px(3, 1 + y, cab, 6, 2);
      px(3, 3 + y, cab, 1, 2);
      px(4, 1 + y, cabL, 3, 1);
    } else if (est === 1) {
      px(3, 2 + y, escurecer(cab, 0.9), 6, 1);
      px(3, 3 + y, escurecer(cab, 0.9), 1, 1);
    } else if (est === 2) {
      px(5, 0 + y, cab, 4, 1);
      px(3, 1 + y, cab, 6, 2);
      px(3, 3 + y, cab, 1, 1);
      px(6, 0 + y, cabL, 2, 1);
    } else if (est === 3) {
      px(3, -1 + y, cab, 6, 1);
      px(2, 0 + y, cab, 8, 3);
      px(2, 3 + y, cab, 1, 3);
      px(9, 3 + y, cab, 1, 2);
      px(4, 0 + y, cabL, 3, 1);
    } else if (est === 4) {
      px(3, 1 + y, cab, 6, 2);
      px(2, 2 + y, cab, 1, 8);
      px(3, 3 + y, cab, 1, 5);
      px(9, 2 + y, cab, 1, 6);
      px(4, 1 + y, cabL, 3, 1);
    } else if (est === 5) {
      px(5, -1 + y, cab, 2, 3);
      px(4, 2 + y, escurecer(cab, 0.85), 4, 1);
    }
  } else {
    if (est === 1) px(3, 2 + y, escurecer(cab, 0.9), 6, 2);
    else if (est === 5) {
      px(3, 2 + y, pele, 6, 5);
      px(5, -1 + y, cab, 2, 7);
    } else if (est === 3) {
      px(3, -1 + y, cab, 6, 1);
      px(2, 0 + y, cab, 8, 6);
    } else if (est === 4) {
      px(3, 1 + y, cab, 6, 6);
      px(2, 2 + y, cab, 8, 7);
    } else {
      px(3, 1 + y, cab, 6, 5);
      if (est === 2) px(5, 0 + y, cab, 4, 1);
    }
    px(4, 2 + y, cabL, 2, 1);
  }
  // boné / óculos
  if (skin.acessorio === 1) {
    const bone = '#c0392b';
    px(3, 0 + y, bone, 6, 3);
    px(4, 0 + y, clarear(bone, 0.3), 3, 1);
    if (frente) px(7, 3 + y, escurecer(bone, 0.7), 4, 1);
    else px(2, 3 + y, escurecer(bone, 0.7), 2, 1);
  } else if (skin.acessorio === 2 && frente) {
    px(4, 4 + y, CONTORNO, 5, 1);
    px(5, 4 + y, '#7fd0ff');
    px(7, 4 + y, '#7fd0ff');
  }
  contornar(c);
  // frente-esquerda e costas-esquerda são espelhados
  if (dir === 1 || dir === 2) {
    const m = novoCanvas(14, 22);
    const mc = m.getContext('2d');
    mc.translate(14, 0);
    mc.scale(-1, 1);
    mc.drawImage(c, 0, 0);
    c = m;
  }
  if (cachePers.size > 3000) cachePers.clear();
  cachePers.set(chave, c);
  return c;
}

// ------------------------------------------------------------- móveis
// Canvas 44×52; o canto superior do losango do tile fica em (22, 30).
export const MOVEL_ANCORA = { x: 22, y: 30, w: 44, h: 52 };
const cacheMoveis = new Map();

const DESENHOS = {
  cadeira(ctx, P) {
    caixa(ctx, P, 0.32, 0.32, 0.68, 0.68, 0, 2, '#4a4a55');
    caixa(ctx, P, 0.44, 0.44, 0.56, 0.56, 2, 6, '#9aa0aa');
    caixa(ctx, P, 0.2, 0.22, 0.8, 0.78, 6, 10, '#c0392b');
    caixa(ctx, P, 0.62, 0.3, 0.92, 0.7, 2, 4, '#2c2c34'); // apoio de pés
    caixa(ctx, P, 0.25, 0.12, 0.72, 0.22, 10, 12, '#2c2c34');
    caixa(ctx, P, 0.25, 0.78, 0.72, 0.88, 10, 12, '#2c2c34');
    caixa(ctx, P, 0.14, 0.22, 0.3, 0.78, 10, 20, '#a93226');
    caixa(ctx, P, 0.14, 0.36, 0.28, 0.64, 20, 23, '#2c2c34');
  },
  espelho(ctx, P) {
    caixa(ctx, P, 0.05, 0.05, 0.42, 0.95, 0, 11, '#8a5a3b');
    caixa(ctx, P, 0.05, 0.08, 0.14, 0.92, 11, 28, '#d9b45a', { dir: '#a8dcf2' });
    caixa(ctx, P, 0.12, 0.2, 0.36, 0.3, 11, 13, '#e8e8f0');
    caixa(ctx, P, 0.15, 0.6, 0.3, 0.7, 11, 15, '#3fa34d');
  },
  lavatorio(ctx, P) {
    caixa(ctx, P, 0.1, 0.18, 0.75, 0.82, 0, 12, '#e8ecef');
    caixa(ctx, P, 0.28, 0.3, 0.68, 0.7, 12, 13, '#93a3ae');
    caixa(ctx, P, 0.12, 0.44, 0.22, 0.56, 12, 18, '#c0c6cc');
    caixa(ctx, P, 0.12, 0.44, 0.34, 0.56, 18, 19, '#c0c6cc');
    caixa(ctx, P, 0.72, 0.25, 0.95, 0.75, 0, 7, '#2c2c34');
  },
  balcao(ctx, P) {
    caixa(ctx, P, 0.1, 0.0, 0.8, 1.0, 0, 13, '#a0522d', { topo: '#cf8a55' });
    caixa(ctx, P, 0.8, 0.0, 0.84, 1.0, 2, 11, '#7d3f22');
    caixa(ctx, P, 0.25, 0.5, 0.55, 0.85, 13, 19, '#3c3c46', { topo: '#5ae0c8' });
    caixa(ctx, P, 0.3, 0.12, 0.5, 0.35, 13, 15, '#f2c230');
  },
  prateleira(ctx, P, variante = 0) {
    caixa(ctx, P, 0.05, 0.05, 0.42, 0.95, 0, 27, '#8a5a3b', { dir: '#6e472e' });
    const cores = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22'];
    const porPrateleira = [0, 2, 4, 6][variante] ?? 0;
    for (const [k, z] of [[0, 3], [1, 11], [2, 19]].entries()) {
      caixa(ctx, P, 0.42, 0.05, 0.46, 0.95, z[1] - 1, z[1], '#5a3a26', { arestas: false });
      for (let i = 0; i < porPrateleira; i++) {
        const v = 0.12 + i * 0.13;
        caixa(ctx, P, 0.3, v, 0.4, v + 0.08, z[1], z[1] + 5, cores[(i + k * 2) % cores.length], { arestas: false });
      }
    }
  },
  sofa(ctx, P) {
    caixa(ctx, P, 0.15, 0.0, 0.88, 1.0, 0, 7, '#2a7f8f');
    caixa(ctx, P, 0.08, 0.0, 0.3, 1.0, 7, 16, '#226a78');
    caixa(ctx, P, 0.3, 0.0, 0.88, 0.12, 7, 11, '#226a78');
    caixa(ctx, P, 0.3, 0.88, 0.88, 1.0, 7, 11, '#226a78');
    caixa(ctx, P, 0.3, 0.14, 0.86, 0.48, 7, 9, '#3aa0b2');
    caixa(ctx, P, 0.3, 0.52, 0.86, 0.86, 7, 9, '#3aa0b2');
  },
  ar(ctx, P) {
    caixa(ctx, P, 0.28, 0.28, 0.72, 0.72, 0, 22, '#eef1f4');
    for (let z = 5; z <= 17; z += 3) caixa(ctx, P, 0.72, 0.34, 0.74, 0.66, z, z + 1, '#9aa7b0', { arestas: false });
    caixa(ctx, P, 0.5, 0.36, 0.7, 0.46, 22, 23, '#5bd3ff', { arestas: false });
  },
  tv(ctx, P) {
    caixa(ctx, P, 0.25, 0.15, 0.7, 0.85, 0, 8, '#5a3a26');
    caixa(ctx, P, 0.38, 0.02, 0.48, 0.98, 8, 24, '#1d1d24', { dir: '#2d6fb0' });
    caixa(ctx, P, 0.47, 0.2, 0.49, 0.5, 14, 20, '#7fd0ff', { arestas: false });
  },
  esterilizador(ctx, P) {
    caixa(ctx, P, 0.2, 0.2, 0.8, 0.8, 0, 11, '#9aa0aa');
    caixa(ctx, P, 0.28, 0.28, 0.72, 0.72, 11, 18, '#f4f6f8', { dir: '#5bd3ff' });
  },
  luminaria(ctx, P) {
    caixa(ctx, P, 0.35, 0.35, 0.65, 0.65, 0, 2, '#2c2c34');
    caixa(ctx, P, 0.46, 0.46, 0.54, 0.54, 2, 24, '#3c3c46');
    caixa(ctx, P, 0.3, 0.3, 0.7, 0.7, 24, 30, '#ffd75e', { topo: '#fff1b0' });
  },
  planta(ctx, P) {
    caixa(ctx, P, 0.3, 0.3, 0.7, 0.7, 0, 8, '#c0643c');
    caixa(ctx, P, 0.33, 0.33, 0.67, 0.67, 8, 9, '#5a3a26');
    const f = [
      [0.38, 0.38, 9, 18, '#2d7d3a'],
      [0.22, 0.42, 12, 20, '#3fa34d'],
      [0.5, 0.25, 13, 22, '#3fa34d'],
      [0.48, 0.52, 16, 25, '#56c063'],
      [0.3, 0.3, 19, 26, '#2d7d3a'],
    ];
    for (const [u, v, z0, z1, c] of f) caixa(ctx, P, u, v, u + 0.24, v + 0.24, z0, z1, c);
  },
};

/**
 * Sprite de móvel. rot 0..3 = virado para +x, +y, −x, −y (o desenho é girado de verdade,
 * então a cadeira de costas mostra o encosto e o espelho de costas mostra a moldura).
 * variante: nível de produtos (prateleira).
 */
export function spriteMovel(tipo, rot = 0, variante = 0) {
  const r = (((rot ?? 0) % 4) + 4) % 4;
  const chave = `${tipo}|${r}|${variante}`;
  let c = cacheMoveis.get(chave);
  if (c) return c;
  c = novoCanvas(MOVEL_ANCORA.w, MOVEL_ANCORA.h);
  const ctx = c.getContext('2d');
  const P = projetor(MOVEL_ANCORA.x, MOVEL_ANCORA.y);
  P.rot = r;
  (DESENHOS[tipo] || DESENHOS.planta)(ctx, P, variante);
  contornar(c);
  cacheMoveis.set(chave, c);
  return c;
}

/** Ícone pequeno (para listas da interface), como dataURL. */
const cacheIcones = new Map();
export function iconeMovel(tipo) {
  if (cacheIcones.has(tipo)) return cacheIcones.get(tipo);
  const s = spriteMovel(tipo, 0, 2);
  const url = s.toDataURL();
  cacheIcones.set(tipo, url);
  return url;
}

// ------------------------------------------------------------- outros
const cacheCarros = new Map();
export function spriteCarro(cor, sentido) {
  const chave = cor + sentido;
  if (cacheCarros.has(chave)) return cacheCarros.get(chave);
  const c = novoCanvas(76, 52);
  const ctx = c.getContext('2d');
  // carro andando ao longo do eixo x, ocupa 2 tiles (u 0..2)
  const P = projetor(36, 22);
  caixa(ctx, P, 0.15, 0.2, 1.85, 0.8, 2, 9, cor);
  caixa(ctx, P, 0.6, 0.25, 1.4, 0.75, 9, 15, escurecer(cor, 0.9), { dir: '#9fd8f0', esq: '#7fb8d0' });
  caixa(ctx, P, 0.3, 0.15, 0.55, 0.22, 0, 4, '#1d1d24');
  caixa(ctx, P, 1.45, 0.15, 1.7, 0.22, 0, 4, '#1d1d24');
  caixa(ctx, P, 0.3, 0.78, 0.55, 0.85, 0, 4, '#1d1d24');
  caixa(ctx, P, 1.45, 0.78, 1.7, 0.85, 0, 4, '#1d1d24');
  const farol = sentido > 0 ? 1.85 : 0.15;
  caixa(ctx, P, farol - 0.02, 0.25, farol + 0.02, 0.4, 5, 7, '#fff3b0', { arestas: false });
  caixa(ctx, P, farol - 0.02, 0.6, farol + 0.02, 0.75, 5, 7, '#fff3b0', { arestas: false });
  contornar(c);
  cacheCarros.set(chave, c);
  return c;
}

let poste = null;
export function spritePoste() {
  if (poste) return poste;
  const c = novoCanvas(24, 60);
  const ctx = c.getContext('2d');
  const P = projetor(12, 48);
  caixa(ctx, P, 0.35, 0.35, 0.65, 0.65, 0, 3, '#3c3c46');
  caixa(ctx, P, 0.45, 0.45, 0.55, 0.55, 3, 44, '#4a4a55');
  caixa(ctx, P, 0.3, 0.3, 0.7, 0.7, 44, 47, '#2c2c34');
  caixa(ctx, P, 0.36, 0.36, 0.64, 0.64, 40, 44, '#fff1b0', { arestas: false });
  contornar(c);
  poste = c;
  return c;
}

/** Ícone de sol ou lua 9×9 (dataURL). */
export function iconeCeu(noite) {
  const c = novoCanvas(9, 9);
  const ctx = c.getContext('2d');
  if (!noite) {
    ctx.fillStyle = '#ffcf3a';
    ctx.fillRect(2, 2, 5, 5);
    ctx.fillRect(4, 0, 1, 9);
    ctx.fillRect(0, 4, 9, 1);
    ctx.fillStyle = '#fff1a0';
    ctx.fillRect(3, 3, 2, 2);
  } else {
    ctx.fillStyle = '#e8ecff';
    ctx.fillRect(3, 1, 4, 7);
    ctx.fillRect(2, 2, 1, 5);
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.clearRect(5, 2, 3, 5);
  }
  return c.toDataURL();
}

/** Pré-visualização ampliada de um personagem num canvas qualquer. */
export function desenharPreview(canvas, skin, dir, quadro, escala = 6) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const s = spritePersonagem(skin, dir, quadro);
  const x = Math.floor((canvas.width - 14 * escala) / 2);
  const y = Math.floor((canvas.height - 22 * escala) / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + 3 * escala, y + 20 * escala, 8 * escala, escala);
  ctx.drawImage(s, x, y, 14 * escala, 22 * escala);
}
