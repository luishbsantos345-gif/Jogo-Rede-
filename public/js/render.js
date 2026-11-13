// Renderização do mapa isométrico num canvas de baixa resolução, ampliado sem borrar.
import { MAPA, isoParaTela, telaParaIso, tipoTile, interiorDoNivel, espelhoDaCadeira, tileAFrente } from '/shared/mapa.js';
import { spritePersonagem, spriteMovel, spriteCarro, spritePoste, MOVEL_ANCORA, poligono, linha, caixa, projetor, escurecer, clarear, contornar, CONTORNO } from './sprites.js';
import { desenharTexto, larguraTexto, textoCanvas } from './fonte.js';

const CORES_CARGO = { gerente: '#f2c230', financeiro: '#3fa34d', compras: '#3b7dd8', barbeiro: '#d64545' };
const LETRA_CARGO = { gerente: 'G', financeiro: 'F', compras: 'C', barbeiro: 'B' };
const ICONE_SERVICO = { corte: 'C', barba: 'B', corteBarba: 'CB', sobrancelha: 'S', pigmentacao: 'P' };
const BALOES = { fechado: 'FECHADO', falta: 'FALTA ITEM', caro: 'CARO!', cheio: 'CHEIO', demora: 'DEMOROU!', ruim: 'HUMM...', comprou: '+$' };

// origem do mundo: deslocamento para que todas as coordenadas fiquem positivas no fundo
const ORIGEM = { x: 14 * 16 + 8, y: 90 };
const FUNDO_W = (MAPA.W + MAPA.H) * 16 + 16;
const FUNDO_H = (MAPA.W + MAPA.H) * 8 + 110;

export class Render {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.buffer = document.createElement('canvas');
    this.bctx = this.buffer.getContext('2d');
    this.zoomNivel = 0;
    this.escala = 3;
    this.cam = { x: 40, y: 150 }; // ponto do mundo no centro da tela (px do fundo)
    this.fundo = null;
    this.carros = [];
    this.proxCarro = 2;
    this.redimensionar();
  }

  redimensionar() {
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(window.innerWidth * dpr);
    const H = Math.round(window.innerHeight * dpr);
    this.canvas.width = W;
    this.canvas.height = H;
    this.dpr = dpr;
    const base = Math.max(1, Math.floor(Math.min(W / 480, H / 270)));
    this.escala = base + this.zoomNivel;
    this.buffer.width = Math.ceil(W / this.escala);
    this.buffer.height = Math.ceil(H / this.escala);
  }

  zoom(delta) {
    const n = Math.max(0, Math.min(2, this.zoomNivel + delta));
    if (n === this.zoomNivel) return;
    this.zoomNivel = n;
    this.redimensionar();
  }

  /** Pan em pixels CSS. */
  mover(dxCss, dyCss) {
    const f = this.dpr / this.escala;
    this.cam.x -= dxCss * f;
    this.cam.y -= dyCss * f;
    this.cam.x = Math.max(-40, Math.min(FUNDO_W + 40, this.cam.x));
    this.cam.y = Math.max(0, Math.min(FUNDO_H, this.cam.y));
  }

  offset() {
    return { x: Math.round(this.buffer.width / 2 - this.cam.x), y: Math.round(this.buffer.height / 2 - this.cam.y) };
  }

  /** Converte coordenada (tile fracionário) para pixel do buffer. */
  tela(x, y, z = 0) {
    const o = this.offset();
    const p = isoParaTela(x, y);
    return { x: p.sx + ORIGEM.x + o.x, y: p.sy + ORIGEM.y + o.y - z };
  }

  /** Clique (px CSS) → coordenada fracionária de tile. */
  cliqueParaTile(cssX, cssY) {
    const bx = (cssX * this.dpr) / this.escala;
    const by = (cssY * this.dpr) / this.escala;
    const o = this.offset();
    return telaParaIso(bx - o.x - ORIGEM.x, by - o.y - ORIGEM.y);
  }
  cliqueParaBuffer(cssX, cssY) {
    return { x: (cssX * this.dpr) / this.escala, y: (cssY * this.dpr) / this.escala };
  }

  // ---------------------------------------------------------------- fundo estático
  gerarFundo(nivel = 1) {
    const int = interiorDoNivel(nivel);
    this.nivelFundo = nivel;
    this.int = int;
    const c = document.createElement('canvas');
    c.width = FUNDO_W;
    c.height = FUNDO_H;
    const ctx = c.getContext('2d');
    const P = projetor(ORIGEM.x, ORIGEM.y); // P(u,v,z) em tiles do mapa
    // chão
    for (let y = 0; y < MAPA.H; y++)
      for (let x = 0; x < MAPA.W; x++) {
        const t = tipoTile(x, y, int);
        let cor;
        if (t === 'interior') cor = (x + y) % 2 ? '#e9dcc1' : '#d8c6a5';
        else if (t === 'calcada') cor = (x + y) % 2 ? '#bdbdc4' : '#b0b0b8';
        else if (t === 'rua') cor = '#41414b';
        else if (t === 'jardim') cor = (x * 7 + y * 3) % 5 ? '#6db35a' : '#64a853';
        else cor = '#8d8d96';
        poligono(ctx, [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], cor);
        if (t === 'calcada') {
          const a = P(x, y + 1);
          const b = P(x + 1, y + 1);
          linha(ctx, a[0], a[1], b[0], b[1], '#9a9aa3');
        }
        if (t === 'jardim' && (x * 13 + y * 7) % 4 === 0) {
          const p = P(x + 0.5, y + 0.5);
          ctx.fillStyle = ['#ffd75e', '#ff8fb1', '#ffffff'][(x + y) % 3];
          ctx.fillRect(p[0], p[1], 1, 1);
          ctx.fillRect(p[0] + 5, p[1] + 2, 1, 1);
        }
      }
    // meio-fio e faixa da rua
    for (let x = 0; x < MAPA.W; x++) {
      const a = P(x, 12);
      const b = P(x + 1, 12);
      linha(ctx, a[0], a[1], b[0], b[1], '#e6e6ea');
      if (x % 2 === 0) {
        const m1 = P(x + 0.2, 13);
        const m2 = P(x + 0.8, 13);
        linha(ctx, m1[0], m1[1], m2[0], m2[1], '#f2c230');
      }
    }
    // prédios ao fundo (y 0..2)
    const fundos = [
      [0, 5, 52, '#b45f4d'],
      [5, 10, 44, '#c9a46a'],
      [10, 16, 58, '#7b8fa6'],
    ];
    for (let [x0, x1, h, cor] of fundos) {
      // no salão dos fundos (nível 3) a loja ocupa y 0..1: só sobra o prédio à esquerda dela
      if (int.y0 < 2) x1 = Math.min(x1, int.x0 - 0.15);
      if (x1 - x0 < 0.5) continue;
      caixa(ctx, P, x0, 0, x1, 1.9, 0, h, cor, { topo: escurecer(cor, 0.6) });
      for (let x = x0 + 0.3; x < x1 - 0.3; x += 0.9)
        for (let z = 14; z < h - 6; z += 13) {
          const q = [P(x, 1.9, z), P(x + 0.5, 1.9, z), P(x + 0.5, 1.9, z + 7), P(x, 1.9, z + 7)];
          poligono(ctx, q, '#3d4a63');
        }
    }
    // prédio vizinho à esquerda (x 0..3)
    caixa(ctx, P, 0, 2, 2.9, 10, 0, 64, '#9c6b98', { topo: '#6d4a6a' });
    for (let v = 2.4; v < 9.6; v += 1.2)
      for (let z = 30; z < 58; z += 13) poligono(ctx, [P(2.9, v, z), P(2.9, v + 0.6, z), P(2.9, v + 0.6, z + 8), P(2.9, v, z + 8)], '#3d4a63');
    for (let u = 0.3; u < 2.6; u += 0.9)
      for (let z = 22; z < 58; z += 13) poligono(ctx, [P(u, 10, z), P(u + 0.5, 10, z), P(u + 0.5, 10, z + 8), P(u, 10, z + 8)], '#3d4a63');
    poligono(ctx, [P(1, 10, 0), P(1.8, 10, 0), P(1.8, 10, 14), P(1, 10, 14)], '#5a3a26');
    caixa(ctx, P, 0, 9.6, 2.9, 10.25, 15, 18, '#e74c3c', { arestas: false });
    // paredes de trás da barbearia (altas)
    const parede = '#87b9c9';
    const xa = int.x0;
    const xb = int.x1 + 1;
    const ya = int.y0;
    caixa(ctx, P, xa, ya - 0.15, xb, ya, 0, 28, parede, { esq: '#9fd0de', topo: '#5d8c9b' });
    caixa(ctx, P, xa - 0.15, ya, xa, 10, 0, 28, parede, { dir: '#7fb0c0', topo: '#5d8c9b' });
    // rodapé
    poligono(ctx, [P(xa, ya, 0), P(xb, ya, 0), P(xb, ya, 5), P(xa, ya, 5)], '#5f8f9e');
    poligono(ctx, [P(xa, ya, 0), P(xa, 10, 0), P(xa, 10, 5), P(xa, ya, 5)], '#557f8d');
    // listras de barbearia (poste giratório pintado) e quadros
    for (const v of [4, 8]) {
      const z0 = 8;
      for (let i = 0; i < 5; i++) poligono(ctx, [P(3, v, z0 + i * 3), P(3, v + 0.3, z0 + i * 3), P(3, v + 0.3, z0 + i * 3 + 2), P(3, v, z0 + i * 3 + 2)], i % 2 ? '#d64545' : '#f2f2ee');
    }
    const quadros = xb > 13 ? [5, 9.5, 13] : [5, 9.5];
    quadros.forEach((u, k) => {
      poligono(ctx, [P(u, ya, 10), P(u + 1.2, ya, 10), P(u + 1.2, ya, 21), P(u, ya, 21)], '#6e472e');
      poligono(ctx, [P(u + 0.1, ya, 11), P(u + 1.1, ya, 11), P(u + 1.1, ya, 20), P(u + 0.1, ya, 20)], ['#f2c230', '#3fa34d', '#3b7dd8'][k]);
    });
    if (int.x1 >= 13) {
      this.fundo = c;
      return; // o jardim virou parte da loja (nível 2+)
    }
    // jardim: cerca viva e árvore
    caixa(ctx, P, 13.1, 2, 13.4, 10, 0, 5, '#2d7d3a');
    caixa(ctx, P, 14.6, 2.6, 15, 3.0, 0, 18, '#6e472e');
    caixa(ctx, P, 14.1, 2.1, 15.5, 3.5, 18, 34, '#3fa34d', { topo: '#56c063' });
    // banco no jardim
    caixa(ctx, P, 14.1, 6.2, 14.9, 8.2, 3, 5, '#a0522d');
    caixa(ctx, P, 14.2, 6.3, 14.3, 6.4, 0, 3, '#3c3c46');
    caixa(ctx, P, 14.2, 8.0, 14.3, 8.1, 0, 3, '#3c3c46');
    this.fundo = c;
  }

  // ---------------------------------------------------------------- carros (só visual)
  atualizarCarros(dt) {
    this.proxCarro -= dt;
    if (this.proxCarro <= 0) {
      this.proxCarro = 4 + Math.random() * 9;
      const sentido = Math.random() < 0.5 ? 1 : -1;
      const cores = ['#d64545', '#3b7dd8', '#f2c230', '#eef1f4', '#3a3a44', '#3fa34d', '#ee7d2b'];
      this.carros.push({ u: sentido > 0 ? -3 : MAPA.W + 1, v: sentido > 0 ? 13 : 12, sentido, vel: 3 + Math.random() * 2, cor: cores[Math.floor(Math.random() * cores.length)] });
    }
    for (const c of this.carros) c.u += c.sentido * c.vel * dt;
    this.carros = this.carros.filter((c) => c.u > -4 && c.u < MAPA.W + 3);
  }

  // ---------------------------------------------------------------- quadro
  /**
   * cena = { estado, ents (posições interpoladas), atendimentos, minuto, fase,
   *          selecionado, construcao: {ativo, fantasma, selecionadoMovel}, hover, agora }
   */
  desenhar(cena) {
    const b = this.bctx;
    const nivel = cena.estado?.loja.nivel || 1;
    if (!this.fundo || this.nivelFundo !== nivel) this.gerarFundo(nivel);
    b.imageSmoothingEnabled = false;
    b.fillStyle = corCeu(cena.minuto, cena.fase);
    b.fillRect(0, 0, this.buffer.width, this.buffer.height);
    const o = this.offset();
    b.drawImage(this.fundo, o.x, o.y);

    const est = cena.estado;
    const lista = [];
    const P = projetor(ORIGEM.x + o.x, ORIGEM.y + o.y);

    // grade do modo construção (sobre o piso)
    if (cena.construcao?.ativo) this.desenharGrade(b, P, cena);

    // móveis
    const ocupacaoPrateleira = est ? Object.values(est.exposto).reduce((a, v) => a + v, 0) : 0;
    const capacidade = est?.capacidadeExposicao || 0;
    for (const m of est?.moveis || []) {
      if (!m.colocado) continue;
      if (cena.construcao?.movendoId === m.id) continue;
      let variante = 0;
      if (m.tipo === 'prateleira' && capacidade) variante = Math.min(3, Math.ceil((ocupacaoPrateleira / capacidade) * 3));
      const spr = spriteMovel(m.tipo, m.rot, variante);
      const p = P(m.x, m.y);
      const sel = cena.construcao?.ativo && cena.construcao.selecionadoMovel === m.id;
      const ativa = m.tipo !== 'cadeira' || est.cadeirasAtivas.includes(m.id);
      lista.push({ k: m.x + m.y + 1, f: () => {
        b.drawImage(spr, p[0] - MOVEL_ANCORA.x, p[1] - MOVEL_ANCORA.y);
        if (sel) this.contornoSelecao(b, P, m.x, m.y, '#ffe066');
        if (!ativa) { const c = textoCanvas('SEM ESPELHO', '#ffb3b3'); b.drawImage(c, p[0] - (c.width >> 1), p[1] - 30); }
      } });
    }
    // fantasma do modo construção
    const fan = cena.construcao?.fantasma;
    if (fan && fan.x >= 0) {
      const spr = spriteMovel(fan.tipo, fan.rot, 0);
      const p = P(fan.x, fan.y);
      lista.push({ k: fan.x + fan.y + 1.05, f: () => {
        b.globalAlpha = 0.65;
        b.drawImage(spr, p[0] - MOVEL_ANCORA.x, p[1] - MOVEL_ANCORA.y);
        b.globalAlpha = 1;
        this.contornoSelecao(b, P, fan.x, fan.y, fan.valido ? '#7dff8a' : '#ff5a5a');
      } });
    }

    // paredes frontais baixas com vitrine, porta e placas
    const i = this.int;
    const xb = i.x1 + 1;
    for (let x = i.x0; x <= i.x1; x++) lista.push({ k: x + 10.5, f: () => this.paredeFrente(b, P, x, est) });
    for (let y = i.y0; y <= i.y1; y++) lista.push({ k: xb + y + 0.5, f: () => this.paredeLado(b, P, y, xb) });
    lista.push({ k: xb + 10 + 0.2, f: () => caixa(b, P, xb - 0.12, 9.88, xb + 0.02, 10.02, 0, 28, '#5d8c9b') });
    lista.push({ k: i.x0 + 10 + 0.2, f: () => caixa(b, P, i.x0 - 0.05, 9.88, i.x0 + 0.1, 10.02, 0, 28, '#5d8c9b') });
    lista.push({ k: 7 + 10.6, f: () => this.letreiro(b, P, est) });
    lista.push({ k: MAPA.porta.x + 2 + 10.6, f: () => this.placaAberto(b, P, est) });

    // postes
    const poste = spritePoste();
    for (const pt of MAPA.postes) {
      const p = P(pt.x + 0.5, pt.y + 0.45);
      lista.push({ k: pt.x + pt.y + 0.95, f: () => b.drawImage(poste, p[0] - 12, p[1] - 48 - 8) });
    }
    // carros
    for (const c of this.carros) {
      const spr = spriteCarro(c.cor, c.sentido);
      const p = P(c.u, c.v);
      lista.push({ k: c.u + 1 + c.v + 0.5, f: () => b.drawImage(spr, p[0] - 36, p[1] - 22) });
    }

    // personagens
    const sobre = [];
    for (const e of cena.ents) {
      const p = P(e.x, e.y);
      const sentado = e.e === 'naCadeira' || (e.e === 'fila' && e.st);
      let px = p[0];
      let py = p[1];
      if (e.st && e.e === 'fila') px += e.st === 1 ? -4 : 4;
      const quadro = e.a ? Math.floor(cena.agora / 140 + (e.fase || 0)) % 4 : 0;
      const spr = spritePersonagem(e.s, e.d ?? 0, quadro, sentado);
      const yy = py - 21 + (sentado ? -5 : 0);
      lista.push({ k: e.x + e.y + 0.01, f: () => {
        b.fillStyle = 'rgba(0,0,0,0.22)';
        b.fillRect(px - 4, py - 1, 9, 2);
        b.drawImage(spr, px - 7, yy);
        if (cena.selecionado === e.i) this.marcador(b, px, yy - 3);
      } });
      sobre.push({ e, px, py: yy });
    }

    lista.sort((a, c) => a.k - c.k);
    for (const d of lista) d.f();

    // barras e etiquetas por cima de tudo
    for (const { e, px, py } of sobre) this.etiquetas(b, e, px, py, cena);
    for (const a of cena.atendimentos || []) {
      const cad = est?.moveis.find((m) => m.id === a.cd);
      if (!cad || !a.p) continue;
      const p = P(cad.x + 0.5, cad.y + 0.5);
      barra(b, p[0] - 8, p[1] - 38, 16, a.p, '#5ae07a');
    }

    // iluminação
    this.iluminar(b, P, cena, est);

    // copia para a tela
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buffer, 0, 0, this.buffer.width * this.escala, this.buffer.height * this.escala);
  }

  desenharGrade(b, P, cena) {
    const i = this.int;
    b.globalAlpha = 0.5;
    for (let x = i.x0; x <= i.x1 + 1; x++) {
      const a = P(x, i.y0);
      const c = P(x, i.y1 + 1);
      linha(b, a[0], a[1], c[0], c[1], '#ffffff');
    }
    for (let y = i.y0; y <= i.y1 + 1; y++) {
      const a = P(i.x0, y);
      const c = P(i.x1 + 1, y);
      linha(b, a[0], a[1], c[0], c[1], '#ffffff');
    }
    b.globalAlpha = 1;
    const pt = MAPA.porta;
    poligono(b, [P(pt.x, pt.y), P(pt.x + 1, pt.y), P(pt.x + 1, pt.y + 1), P(pt.x, pt.y + 1)], 'rgba(255,90,90,0.35)');
    // onde vai o espelho de cada cadeira sem par (inclusive a que está sendo carregada)
    const moveis = cena.estado?.moveis || [];
    const alvos = moveis.filter((m) => m.colocado && m.tipo === 'cadeira' && cena.construcao.movendoId !== m.id && !espelhoDaCadeira(m, moveis));
    const fan = cena.construcao.fantasma;
    if (fan && fan.x >= 0 && fan.tipo === 'cadeira') alvos.push({ x: fan.x, y: fan.y, rot: fan.rot });
    for (const cad of alvos) {
      const f = tileAFrente(cad);
      if (f.x < i.x0 || f.x > i.x1 || f.y < i.y0 || f.y > i.y1) continue;
      poligono(b, [P(f.x + 0.2, f.y + 0.2), P(f.x + 0.8, f.y + 0.2), P(f.x + 0.8, f.y + 0.8), P(f.x + 0.2, f.y + 0.8)], 'rgba(120,210,255,0.45)');
      this.contornoSelecao(b, P, f.x, f.y, '#7fd0ff');
    }
  }

  contornoSelecao(b, P, x, y, cor) {
    const q = [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)];
    for (let k = 0; k < 4; k++) linha(b, q[k][0], q[k][1], q[(k + 1) % 4][0], q[(k + 1) % 4][1], cor);
  }

  paredeFrente(b, P, x, est) {
    const porta = x === MAPA.porta.x;
    if (porta) {
      caixa(b, P, x, 9.9, x + 0.08, 10, 0, 20, '#5d8c9b');
      caixa(b, P, x + 0.92, 9.9, x + 1, 10, 0, 20, '#5d8c9b');
      caixa(b, P, x, 9.9, x + 1, 10, 18, 21, '#5d8c9b');
      return;
    }
    caixa(b, P, x, 9.9, x + 1, 10, 0, 5, '#b4685a', { esq: '#9c5a4e', topo: '#d08a7c' });
    // vidro da vitrine (translúcido)
    b.globalAlpha = 0.28;
    poligono(b, [P(x, 10, 5), P(x + 1, 10, 5), P(x + 1, 10, 20), P(x, 10, 20)], '#bfe6ff');
    b.globalAlpha = 0.6;
    const r1 = P(x + 0.2, 10, 17);
    const r2 = P(x + 0.45, 10, 9);
    linha(b, r1[0], r1[1], r2[0], r2[1], '#ffffff');
    b.globalAlpha = 1;
    const t1 = P(x, 10, 20);
    const t2 = P(x + 1, 10, 20);
    linha(b, t1[0], t1[1], t2[0], t2[1], '#5d8c9b');
  }

  placaAberto(b, P, est) {
    if (!est) return;
    const x = MAPA.porta.x + 1;
    const aberta = est.loja.aberta;
    const c = textoCanvas(aberta ? 'ABERTO' : 'FECHADO', '#ffffff', null);
    const p = P(x + 0.35, 10, 15);
    const w = c.width + 4;
    b.fillStyle = CONTORNO;
    b.fillRect(p[0] - 1, p[1] - 1, w + 2, 9);
    b.fillStyle = aberta ? '#2fa84f' : '#c0392b';
    b.fillRect(p[0], p[1], w, 7);
    b.drawImage(c, p[0] + 2, p[1] + 1);
  }

  paredeLado(b, P, y, xb) {
    caixa(b, P, xb - 0.1, y, xb, y + 1, 0, 6, '#b4685a', { dir: '#c47a6b', topo: '#d08a7c' });
  }

  letreiro(b, P, est) {
    const nome = (est?.loja.nome || 'Barbearia').toUpperCase();
    const c = textoCanvas(nome, '#fff6d8', '#5a3a26');
    const p = P(7.5, 10, 30);
    const w = c.width + 8;
    const x = Math.round(p[0] - w / 2);
    const y = Math.round(p[1] - 6);
    b.fillStyle = CONTORNO;
    b.fillRect(x - 1, y - 1, w + 2, 13);
    b.fillStyle = '#7d3f22';
    b.fillRect(x, y, w, 11);
    b.fillStyle = '#a0522d';
    b.fillRect(x, y, w, 1);
    b.drawImage(c, x + 4, y + 3);
    // suportes
    b.fillStyle = CONTORNO;
    b.fillRect(x + 3, y + 12, 1, 3);
    b.fillRect(x + w - 4, y + 12, 1, 3);
  }

  marcador(b, x, y) {
    b.fillStyle = '#ffe066';
    b.fillRect(x - 2, y - 4, 5, 1);
    b.fillRect(x - 1, y - 3, 3, 1);
    b.fillRect(x, y - 2, 1, 1);
  }

  etiquetas(b, e, px, py, cena) {
    if (e.k === 'j' || e.k === 'n') {
      const nome = e.n || '';
      const corCargo = CORES_CARGO[e.c] || '#fff';
      const t = textoCanvas(nome, e.i === cena.meuId ? '#ffe066' : '#ffffff');
      const w = t.width + 9;
      const x = Math.round(px - w / 2);
      const y = py - 8;
      b.fillStyle = 'rgba(26,18,32,0.75)';
      b.fillRect(x, y, w, 7);
      b.fillStyle = corCargo;
      b.fillRect(x + 1, y + 1, 5, 5);
      const l = textoCanvas(e.k === 'n' ? 'N' : LETRA_CARGO[e.c] || '?', CONTORNO, null);
      b.drawImage(l, x + 2, y + 1);
      b.drawImage(t, x + 8, y + 1);
      return;
    }
    // clientes
    if (e.e === 'fila' && typeof e.p === 'number') {
      const cor = e.p > 0.5 ? '#5ae07a' : e.p > 0.25 ? '#f2c230' : '#e74c3c';
      barra(b, px - 6, py - 4, 12, e.p, cor);
      const ic = textoCanvas(ICONE_SERVICO[e.sv] || '?', '#ffffff');
      b.drawImage(ic, px - (ic.width >> 1), py - 11);
    }
    const balao = e.b && BALOES[e.b];
    if (balao && (e.e === 'saindo' || e.e === 'olhando' || e.e === 'pagando')) {
      const t = textoCanvas(balao, CONTORNO, null);
      const w = t.width + 4;
      const x = Math.round(px - w / 2);
      const y = py - 10;
      b.fillStyle = CONTORNO;
      b.fillRect(x - 1, y - 1, w + 2, 9);
      b.fillStyle = e.b === 'comprou' ? '#c8ffd0' : '#ffffff';
      b.fillRect(x, y, w, 7);
      b.fillRect(px, y + 7, 1, 2);
      b.drawImage(t, x + 2, y + 1);
    } else if (e.h === 'irritado' && e.e === 'saindo') {
      const t = textoCanvas('!', '#e74c3c');
      b.drawImage(t, px - 1, py - 8);
    } else if (e.h === 'feliz' && e.e === 'saindo') {
      b.fillStyle = '#ff6b9a';
      b.fillRect(px - 1, py - 7, 1, 1);
      b.fillRect(px + 1, py - 7, 1, 1);
      b.fillRect(px - 1, py - 6, 3, 1);
      b.fillRect(px, py - 5, 1, 1);
    }
  }

  iluminar(b, P, cena, est) {
    const { cor, escuridao } = luz(cena.minuto, cena.fase);
    if (!cor) return;
    b.save();
    b.globalCompositeOperation = 'multiply';
    b.fillStyle = cor;
    b.fillRect(0, 0, this.buffer.width, this.buffer.height);
    b.restore();
    if (escuridao < 0.15) return;
    // luzes (aditivas, em degraus para manter o visual pixelado)
    b.save();
    b.globalCompositeOperation = 'lighter';
    const brilho = (x, y, raio, rgb, forca) => {
      for (let k = 3; k >= 1; k--) {
        b.fillStyle = `rgba(${rgb},${(forca * escuridao * 0.18).toFixed(3)})`;
        const r = raio * (k / 3);
        b.beginPath();
        b.ellipse(Math.round(x), Math.round(y), Math.round(r), Math.round(r / 2), 0, 0, Math.PI * 2);
        b.fill();
      }
    };
    for (const pt of MAPA.postes) {
      const p = P(pt.x + 0.5, pt.y + 0.45);
      brilho(p[0], p[1], 34, '255,214,140', 1.2);
      brilho(p[0], p[1] - 42, 6, '255,240,200', 1.5);
    }
    const interiorLigado = est?.loja.aberta || cena.fase === 'noite';
    if (interiorLigado) {
      const int = this.int || MAPA.interior;
      const c = P((int.x0 + int.x1 + 1) / 2, (int.y0 + int.y1 + 1) / 2);
      brilho(c[0], c[1], 120, '255,226,170', est?.loja.aberta ? 1.0 : 0.5);
      const f = P(7.5, 10, 30);
      brilho(f[0], f[1], 26, '255,200,120', 0.9);
    }
    for (const m of est?.moveis || []) {
      if (!m.colocado || m.tipo !== 'luminaria') continue;
      const p = P(m.x + 0.5, m.y + 0.5);
      brilho(p[0], p[1], 40, '255,215,94', 1.3);
      brilho(p[0], p[1] - 27, 6, '255,240,200', 1.6);
    }
    // janelas acesas dos prédios
    for (let k = 0; k < 6; k++) {
      if ((this.int?.y0 ?? 2) < 2 && 1 + k * 2.5 > (this.int?.x0 ?? 3)) continue; // prédios que viraram loja
      const p = P(1 + k * 2.5, 1.9, 26);
      brilho(p[0], p[1], 5, '255,220,150', 0.8);
    }
    for (const c of this.carros) {
      const p = P(c.u + (c.sentido > 0 ? 2.2 : -0.2), c.v + 0.5);
      brilho(p[0], p[1], 14, '255,240,190', 0.9);
    }
    b.restore();
  }

  /** Qual entidade está sob o clique (px CSS)? Retorna id ou null. */
  entidadeEm(cssX, cssY, ents) {
    const pb = this.cliqueParaBuffer(cssX, cssY);
    const o = this.offset();
    const P = projetor(ORIGEM.x + o.x, ORIGEM.y + o.y);
    let melhor = null;
    for (const e of ents) {
      const p = P(e.x, e.y);
      const sentado = e.e === 'naCadeira' || (e.e === 'fila' && e.st);
      let px = p[0];
      if (e.st && e.e === 'fila') px += e.st === 1 ? -4 : 4;
      const top = p[1] - 22 + (sentado ? -5 : 0);
      if (pb.x >= px - 7 && pb.x <= px + 7 && pb.y >= top - 2 && pb.y <= p[1] + 1) {
        const prof = e.x + e.y;
        if (!melhor || prof > melhor.prof) melhor = { id: e.i, prof };
      }
    }
    return melhor?.id ?? null;
  }

  /** Móvel sob o clique, testando o sprite (não só o tile). */
  movelEm(cssX, cssY, moveis) {
    const pb = this.cliqueParaBuffer(cssX, cssY);
    const o = this.offset();
    const P = projetor(ORIGEM.x + o.x, ORIGEM.y + o.y);
    let melhor = null;
    for (const m of moveis) {
      if (!m.colocado) continue;
      const p = P(m.x, m.y);
      const spr = spriteMovel(m.tipo, m.rot, 0);
      const sx = Math.floor(pb.x - (p[0] - MOVEL_ANCORA.x));
      const sy = Math.floor(pb.y - (p[1] - MOVEL_ANCORA.y));
      if (sx < 0 || sy < 0 || sx >= spr.width || sy >= spr.height) continue;
      const a = spr.getContext('2d').getImageData(sx, sy, 1, 1).data[3];
      if (a > 0 && (!melhor || m.x + m.y > melhor.x + melhor.y)) melhor = m;
    }
    return melhor;
  }

  centralizarLoja() {
    const int = this.int || MAPA.interior;
    const p = isoParaTela((int.x0 + int.x1 + 1) / 2, (int.y0 + int.y1 + 1) / 2);
    this.cam.x = p.sx + ORIGEM.x;
    this.cam.y = p.sy + ORIGEM.y - 10;
  }
}

function barra(b, x, y, w, frac, cor) {
  b.fillStyle = CONTORNO;
  b.fillRect(x - 1, y - 1, w + 2, 4);
  b.fillStyle = '#4a4a55';
  b.fillRect(x, y, w, 2);
  b.fillStyle = cor;
  b.fillRect(x, y, Math.max(0, Math.round(w * Math.min(1, frac))), 2);
}

function lerpCor(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

/** Cor de multiplicação conforme a hora (amanhecer, dia, entardecer, noite). */
export function luz(minuto, fase) {
  const branco = [255, 255, 255];
  const aman = [255, 218, 186];
  const tarde = [255, 200, 166];
  const anoit = [120, 124, 196];
  const noite = [72, 82, 150];
  let c;
  if (fase === 'noite') c = noite;
  else if (minuto < 480) c = lerpCor(aman, branco, (minuto - 420) / 60);
  else if (minuto < 1020) c = branco;
  else if (minuto < 1140) c = lerpCor(branco, tarde, (minuto - 1020) / 120);
  else c = lerpCor(tarde, anoit, Math.min(1, (minuto - 1140) / 120));
  const escuridao = 1 - (c[0] + c[1] + c[2]) / 765;
  if (c[0] === 255 && c[1] === 255 && c[2] === 255) return { cor: null, escuridao: 0 };
  return { cor: `rgb(${c[0]},${c[1]},${c[2]})`, escuridao: Math.min(1, escuridao * 2.2) };
}

function corCeu(minuto, fase) {
  if (fase === 'noite' || minuto > 1200) return '#1d2340';
  if (minuto < 480) return '#f6b98a';
  if (minuto > 1080) return '#e88a6a';
  return '#9fd3ee';
}

export { CORES_CARGO, LETRA_CARGO, ICONE_SERVICO };
