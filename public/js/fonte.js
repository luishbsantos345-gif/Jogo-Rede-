// Fonte bitmap 3×5 desenhada pixel a pixel (para textos dentro do canvas).
const G = {
  "A": '.#.#.#####.##.#',
  "B": '##.#.###.#.###.',
  "C": '.###..#..#...##',
  "D": '##.#.##.##.###.',
  "E": '####..##.#..###',
  "F": '####..##.#..#..',
  "G": '.###..#.##.#.##',
  "H": '#.##.#####.##.#',
  "I": '###.#..#..#.###',
  "J": '..#..#..##.#.#.',
  "K": '#.##.###.#.##.#',
  "L": '#..#..#..#..###',
  "M": '#.########.##.#',
  "N": '##.#.##.##.##.#',
  "O": '.#.#.##.##.#.#.',
  "P": '##.#.###.#..#..',
  "Q": '.#.#.##.###..##',
  "R": '##.#.###.#.##.#',
  "S": '.###...#...###.',
  "T": '###.#..#..#..#.',
  "U": '#.##.##.##.####',
  "V": '#.##.##.##.#.#.',
  "W": '#.##.########.#',
  "X": '#.##.#.#.#.##.#',
  "Y": '#.##.#.#..#..#.',
  "Z": '###..#.#.#..###',
  "0": '####.##.##.####',
  "1": '.#.##..#..#.###',
  "2": '##...#.#.#..###',
  "3": '##...#.#...###.',
  "4": '#.##.####..#..#',
  "5": '####..##...###.',
  "6": '.###..####.####',
  "7": '###..#.#..#..#.',
  "8": '####.#####.####',
  "9": '####.####..###.',
  " ": '...............',
  ".": '.............#.',
  ",": '..........#.#..',
  "!": '.#..#..#.....#.',
  "?": '##...#.#.....#.',
  "-": '......###......',
  ":": '....#.....#....',
  "/": '..#..#.#.#..#..',
  "$": '.####..#..####.',
  "'": '.#..#..........',
  "&": '.#.#.#.#.#.#.##',
  "+": '....#.###.#....',
  "_": '............###',
  "%": '#.#..#.#.#..#.#',
  "(": '.#.#..#..#...#.',
  ")": '.#...#..#..#.#.',
  "*": '...#.#.#.#.#...',
  "#": '#.#####.#####.#',
  "<": '..#.#.#...#...#',
  ">": '#...#...#.#.#..',
  "=": '...###...###...',
};

function normalizar(t) {
  return String(t).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/Ç/g, 'C');
}

export function larguraTexto(texto) {
  const t = normalizar(texto);
  return t.length ? t.length * 4 - 1 : 0;
}

const cache = new Map();

/** Retorna um canvas com o texto desenhado (com sombra opcional). */
export function textoCanvas(texto, cor = '#fff', sombra = '#1a1220') {
  const chave = texto + '|' + cor + '|' + sombra;
  let c = cache.get(chave);
  if (c) return c;
  const t = normalizar(texto);
  const w = Math.max(1, larguraTexto(t) + (sombra ? 1 : 0));
  const h = 5 + (sombra ? 1 : 0);
  c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const pinta = (dx, dy, col) => {
    ctx.fillStyle = col;
    for (let i = 0; i < t.length; i++) {
      const g = G[t[i]] || G['?'];
      for (let p = 0; p < 15; p++) if (g[p] === '#') ctx.fillRect(i * 4 + (p % 3) + dx, Math.floor(p / 3) + dy, 1, 1);
    }
  };
  if (sombra) pinta(1, 1, sombra);
  pinta(0, 0, cor);
  if (cache.size > 800) cache.clear();
  cache.set(chave, c);
  return c;
}

export function desenharTexto(ctx, texto, x, y, cor, sombra) {
  const c = textoCanvas(texto, cor, sombra);
  ctx.drawImage(c, Math.round(x), Math.round(y));
  return c.width;
}
