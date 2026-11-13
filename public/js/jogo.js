// Laço do jogo no navegador: recebe estado, interpola, desenha e envia intenções.
import { J, acao, meuCargo } from './estado.js';
import { Render } from './render.js';
import { noInterior, MAPA, caminhavelBase, interiorDoNivel } from '/shared/mapa.js';
import { pode, dicaPermissao } from '/shared/permissoes.js';
import { iconeMovel } from './sprites.js';
import * as UI from './ui.js';
import { tocar } from './som.js';

const interiorAtual = () => interiorDoNivel(J.estado?.loja.nivel || 1);

const $ = (id) => document.getElementById(id);
let render;
let iniciado = false;

export function iniciarJogo() {
  if (iniciado) return;
  iniciado = true;
  render = new Render($('tela'));
  render.centralizarLoja();
  window.addEventListener('resize', () => render.redimensionar());
  UI.iniciarUI({ render });
  ligarRede();
  ligarEntrada();
  let ultimo = performance.now();
  const quadro = (agora) => {
    const dt = Math.min(0.1, (agora - ultimo) / 1000);
    ultimo = agora;
    if (J.tick && J.tick.tempo.fase === 'dia' && !J.estado?.config.pausado) render.atualizarCarros(dt * (J.estado?.config.velocidade || 1));
    desenharQuadro(agora);
    requestAnimationFrame(quadro);
  };
  requestAnimationFrame(quadro);
}

// ------------------------------------------------------------------ rede
function ligarRede() {
  const s = J.socket;
  s.on('estado', (e) => {
    const antes = J.estado;
    J.estado = e;
    UI.aoReceberEstado(e, antes);
  });
  s.on('tick', (t) => {
    const agora = performance.now();
    const vistos = new Set();
    for (const e of t.ents) {
      vistos.add(e.i);
      const atual = J.interp.get(e.i);
      if (atual) {
        const p = posicao(atual, agora);
        atual.x0 = p.x;
        atual.y0 = p.y;
        atual.x1 = e.x;
        atual.y1 = e.y;
        atual.t0 = agora;
        atual.t1 = agora + 110;
        Object.assign(atual.dados, e);
      } else {
        J.interp.set(e.i, { x0: e.x, y0: e.y, x1: e.x, y1: e.y, t0: agora, t1: agora, dados: { ...e, fase: Math.random() * 4 } });
      }
    }
    for (const id of J.interp.keys()) if (!vistos.has(id)) J.interp.delete(id);
    const faseAntes = J.tick?.tempo.fase;
    J.tick = t;
    J.ultimoTick = agora;
    if (faseAntes === 'noite' && t.tempo.fase === 'dia') tocar('dia');
    if (J.selecionado && !J.interp.get(J.selecionado)) J.selecionado = null;
    UI.aoReceberTick(t);
  });
  s.on('evento', (ev) => UI.aoReceberEvento(ev));
  s.on('disconnect', () => UI.toast('Conexão perdida. Tentando reconectar...', 'erro'));
  s.on('connect', () => iniciado && UI.toast('Conectado', 'sucesso'));
}

function posicao(it, agora) {
  const f = it.t1 > it.t0 ? Math.min(1, Math.max(0, (agora - it.t0) / (it.t1 - it.t0))) : 1;
  return { x: it.x0 + (it.x1 - it.x0) * f, y: it.y0 + (it.y1 - it.y0) * f };
}

function entsInterpoladas(agora) {
  const lista = [];
  for (const it of J.interp.values()) {
    const p = posicao(it, agora);
    lista.push({ ...it.dados, x: p.x, y: p.y });
  }
  return lista;
}

let entsCache = [];
function desenharQuadro(agora) {
  entsCache = entsInterpoladas(agora);
  render.desenhar({
    estado: J.estado,
    ents: entsCache,
    atendimentos: J.tick?.at || [],
    minuto: J.tick?.tempo.minuto ?? 420,
    fase: J.tick?.tempo.fase ?? 'dia',
    selecionado: J.selecionado,
    construcao: J.construcao,
    meuId: J.meuId,
    agora,
  });
}

// ------------------------------------------------------------------ entrada
function ligarEntrada() {
  const cv = $('tela');
  const ponteiros = new Map();
  let arrasto = null;
  let pinca = null;

  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ponteiros.size === 2) {
      const [a, b] = [...ponteiros.values()];
      pinca = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      arrasto = null;
      return;
    }
    arrasto = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moveu: false };
  });
  cv.addEventListener('pointermove', (e) => {
    if (J.construcao.carregando) atualizarFantasma(e.clientX, e.clientY);
    if (!ponteiros.has(e.pointerId)) return;
    ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinca && ponteiros.size === 2) {
      const [a, b] = [...ponteiros.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d / pinca.d > 1.35) {
        render.zoom(1);
        pinca.d = d;
      } else if (d / pinca.d < 0.74) {
        render.zoom(-1);
        pinca.d = d;
      }
      return;
    }
    if (!arrasto) return;
    const dx = e.clientX - arrasto.x;
    const dy = e.clientY - arrasto.y;
    if (!arrasto.moveu && Math.hypot(e.clientX - arrasto.x0, e.clientY - arrasto.y0) > 8) arrasto.moveu = true;
    if (arrasto.moveu && !J.construcao.carregando) render.mover(dx, dy);
    arrasto.x = e.clientX;
    arrasto.y = e.clientY;
  });
  const fim = (e) => {
    ponteiros.delete(e.pointerId);
    if (ponteiros.size < 2) pinca = null;
    if (arrasto && !arrasto.moveu && e.type === 'pointerup') clique(e.clientX, e.clientY);
    else if (arrasto && J.construcao.carregando && e.type === 'pointerup') clique(e.clientX, e.clientY);
    arrasto = null;
  };
  cv.addEventListener('pointerup', fim);
  cv.addEventListener('pointercancel', fim);
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    render.zoom(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  $('btZoomMais').onclick = () => render.zoom(1);
  $('btZoomMenos').onclick = () => render.zoom(-1);

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if ((e.key === 'r' || e.key === 'R') && J.construcao.ativo) girar();
    if (e.key === 'Escape') {
      if (J.construcao.carregando) cancelarCarregar();
      else UI.fecharJanela();
    }
  });
}

function tileDoClique(x, y) {
  const t = render.cliqueParaTile(x, y);
  return { x: Math.floor(t.x), y: Math.floor(t.y) };
}

async function clique(cx, cy) {
  if (J.observador) return;
  const est = J.estado;
  if (!est) return;
  // ---- modo construção
  if (J.construcao.ativo) {
    if (J.construcao.carregando) {
      const t = tileDoClique(cx, cy);
      const c = J.construcao.carregando;
      const r = await acao('posicionar', { movelId: c.movelId, x: t.x, y: t.y, rot: c.rot });
      if (!r.ok) {
        UI.toast(r.erro, 'erro');
        tocar('erro');
        return;
      }
      tocar('clique');
      J.construcao.selecionadoMovel = c.movelId;
      cancelarCarregar();
      UI.atualizarConstrucao();
      return;
    }
    const m = render.movelEm(cx, cy, est.moveis);
    J.construcao.selecionadoMovel = m ? m.id : null;
    UI.atualizarConstrucao();
    return;
  }
  // ---- clique num personagem
  const id = render.entidadeEm(cx, cy, entsCache);
  const ent = id ? entsCache.find((e) => e.i === id) : null;
  if (ent && ent.k === 'c' && ent.e === 'fila') {
    if (!pode(meuCargo(), 'atender')) {
      UI.toast(dicaPermissao('atender'), 'aviso');
      return;
    }
    J.selecionado = J.selecionado === id ? null : id;
    tocar('clique');
    UI.atualizarFila();
    if (J.selecionado) UI.toast('Agora clique numa cadeira livre (ou use o botão na fila)', 'info', 2200);
    return;
  }
  // ---- clique numa cadeira com cliente selecionado
  const m = render.movelEm(cx, cy, est.moveis);
  if (J.selecionado && m && m.tipo === 'cadeira') {
    await atender(m.id);
    return;
  }
  // ---- andar
  const t = tileDoClique(cx, cy);
  if (!caminhavelBase(t.x, t.y, interiorAtual())) return;
  const r = await acao('mover', t);
  if (!r.ok && r.erro !== 'Não dá para ir aí') UI.toast(r.erro, 'aviso', 1500);
}

export async function atender(cadeiraId = null) {
  if (!J.selecionado) return;
  const r = await acao('atender', { clienteId: J.selecionado, cadeiraId });
  if (!r.ok) {
    UI.toast(r.erro, 'erro');
    tocar('erro');
    return;
  }
  tocar('clique');
  J.selecionado = null;
  UI.atualizarFila();
}

// ------------------------------------------------------------------ construção
export function alternarConstrucao(ativo) {
  J.construcao.ativo = ativo ?? !J.construcao.ativo;
  if (!J.construcao.ativo) {
    cancelarCarregar();
    J.construcao.selecionadoMovel = null;
  }
  UI.atualizarConstrucao();
}

export function carregarMovel(movelId, tipo, rot = 0, movendo = false) {
  J.construcao.carregando = { movelId, tipo, rot };
  J.construcao.movendoId = movendo ? movelId : null;
  J.construcao.fantasma = { x: -1, y: -1, tipo, rot, valido: false };
}

export function cancelarCarregar() {
  J.construcao.carregando = null;
  J.construcao.fantasma = null;
  J.construcao.movendoId = null;
  UI.atualizarConstrucao();
}

export function atualizarFantasma(cx, cy) {
  const c = J.construcao.carregando;
  if (!c) return;
  const t = tileDoClique(cx, cy);
  const est = J.estado;
  const ocupado = est.moveis.some((m) => m.colocado && m.id !== c.movelId && m.x === t.x && m.y === t.y);
  const porta = t.x === MAPA.porta.x && t.y === MAPA.porta.y;
  J.construcao.fantasma = { x: t.x, y: t.y, tipo: c.tipo, rot: c.rot, valido: noInterior(t.x, t.y, interiorAtual()) && !ocupado && !porta };
}

export async function girar() {
  if (J.construcao.carregando) {
    J.construcao.carregando.rot = (J.construcao.carregando.rot + 1) % 4;
    if (J.construcao.fantasma) J.construcao.fantasma.rot = J.construcao.carregando.rot;
    return;
  }
  const m = J.estado?.moveis.find((x) => x.id === J.construcao.selecionadoMovel);
  if (!m) return;
  const r = await acao('posicionar', { movelId: m.id, x: m.x, y: m.y, rot: (m.rot + 1) % 4 });
  if (!r.ok) UI.toast(r.erro, 'erro');
}

/** Soltar item arrastado da bandeja em cima do canvas. */
export function soltarSobreCanvas(cx, cy) {
  const el = document.elementFromPoint(cx, cy);
  if (el && el.id === 'tela') clique(cx, cy);
}

export { iconeMovel };
