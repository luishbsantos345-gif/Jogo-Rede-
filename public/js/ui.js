// Interface (HTML por cima do canvas): barras, painéis, fila, construção, resumo do dia.
import { J, acao, acaoInstrutor, eu, meuCargo } from './estado.js';
import { formatarDinheiro, dinheiroPorExtenso, lerDinheiro } from '/shared/dinheiro.js';
import { pode, dicaPermissao } from '/shared/permissoes.js';
import { iconeMovel, iconeCeu, spritePersonagem } from './sprites.js';
import { tocar, alternarMudo, estaMudo } from './som.js';
import * as Jogo from './jogo.js';

const $ = (id) => document.getElementById(id);
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const DIAS_LONGOS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const NOME_CARGO = { gerente: 'Gerente', financeiro: 'Financeiro', compras: 'Compras/Estoque', barbeiro: 'Barbeiro', observador: 'Instrutor' };
const NOME_SERVICO_CURTO = { corte: 'Corte', barba: 'Barba', corteBarba: 'Corte+barba', sobrancelha: 'Sobrancelha', pigmentacao: 'Pigmentação' };
let render;
let painelAberto = null;
let ultimoRender = 0;
let subabaCompras = 'equipamento';
let resumoMostradoDia = 0;
let logVisto = 0;
let chatVisto = 0;
let simTimer = null;

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** Valor em dinheiro com tooltip por extenso. */
const m = (c, cls = '') => `<span class="${cls}" title="${esc(dinheiroPorExtenso(c))}">${formatarDinheiro(c)}</span>`;
const hora = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.floor(min) % 60).padStart(2, '0')}`;
const preco = (c) => formatarDinheiro(c, { simbolo: false });

/** Botão com checagem de permissão (sem permissão: aparência desabilitada + dica). */
function bt(perm, rotulo, dados = '', cls = '') {
  const ok = !perm || pode(meuCargo(), perm);
  if (!ok) return `<button class="bt pequeno ${cls}" aria-disabled="true" style="opacity:.45;filter:grayscale(.6)" data-dica="${esc(dicaPermissao(perm))}" title="${esc(dicaPermissao(perm))}">${rotulo}</button>`;
  return `<button class="bt pequeno ${cls}" ${dados}>${rotulo}</button>`;
}

// ------------------------------------------------------------------ início
export function iniciarUI(ctx) {
  render = ctx.render;
  for (const b of document.querySelectorAll('[data-painel]')) b.onclick = () => abrirJanela(b.dataset.painel);
  $('btFecharJanela').onclick = fecharJanela;
  $('btLog').onclick = () => $('painelLateral').classList.toggle('escondido');
  $('btFecharLateral').onclick = () => $('painelLateral').classList.add('escondido');
  for (const a of document.querySelectorAll('.aba')) a.onclick = () => trocarAba(a.dataset.aba);
  $('formChat').onsubmit = async (e) => {
    e.preventDefault();
    const texto = $('inChat').value.trim();
    if (!texto) return;
    if (J.observador) return toast('Observadores não usam o chat', 'aviso');
    const r = await acao('chat', { texto });
    if (r.ok) $('inChat').value = '';
    else toast(r.erro, 'erro');
  };
  $('btMudo').textContent = estaMudo() ? '✕' : '♪';
  $('btMudo').onclick = () => ($('btMudo').textContent = alternarMudo() ? '✕' : '♪');
  $('btFecharResumo').onclick = () => $('modalResumo').classList.add('escondido');
  $('btConstruir').onclick = () => {
    if (!pode(meuCargo(), 'posicionar')) return toast(dicaPermissao('posicionar'), 'aviso');
    Jogo.alternarConstrucao();
    fecharJanela();
  };
  // cliques dentro das janelas (delegação)
  $('janelaCorpo').addEventListener('click', cliqueJanela);
  $('resumoCorpo').addEventListener('click', cliqueJanela);
  $('acoesBarbeiro').addEventListener('click', cliqueJanela);
  $('acoesMovel').addEventListener('click', cliqueJanela);
  $('janelaCorpo').addEventListener('input', (e) => {
    if (e.target.id === 'bValor' || e.target.id === 'bPrazo') simularEmprestimoDepois();
  });
  $('janelaCorpo').addEventListener('change', (e) => {
    if (e.target.id === 'bPrazo') simularEmprestimoDepois();
  });
  ligarBandeja();
}

export function toast(texto, tom = 'info', ms = 3500) {
  const t = document.createElement('div');
  t.className = 'toast ' + tom;
  t.textContent = texto;
  $('toasts').appendChild(t);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  setTimeout(() => t.remove(), ms);
}

// ------------------------------------------------------------------ recepção de dados
export function aoReceberEstado(e, antes) {
  atualizarHud();
  $('btInstrutor').classList.toggle('escondido', !J.instrutor);
  if (J.observador) $('btConstruir').classList.add('escondido');
  atualizarLateral();
  atualizarFila();
  if (J.construcao.ativo) atualizarConstrucao();
  // anúncio do dia
  const an = $('anuncioDia');
  const eventos = e.eventos || [];
  if (eventos.length) {
    an.classList.remove('escondido');
    an.innerHTML = eventos.map((ev) => `${esc(ev.texto)}${ev.diasRestantes > 1 ? ` (${ev.diasRestantes} dias)` : ''}`).join('<br>');
  } else an.classList.add('escondido');
  // resumo da noite ao entrar no meio da noite
  if (e.tempo.fase === 'noite' && e.ultimoResumo && resumoMostradoDia !== e.ultimoResumo.dia) mostrarResumo(e.ultimoResumo);
  if (e.loja.falida && resumoMostradoDia !== -1) {
    resumoMostradoDia = -1;
    mostrarFalencia();
  }
  // janela aberta: atualiza se o usuário não estiver digitando
  if (painelAberto) {
    const foco = document.activeElement;
    const digitando = foco && $('janela').contains(foco) && (foco.tagName === 'INPUT' || foco.tagName === 'SELECT');
    if (!digitando && performance.now() - ultimoRender > 900) desenharJanela();
  }
}

export function aoReceberTick(t) {
  const tp = t.tempo;
  $('hudDia').textContent = `Dia ${tp.dia} · ${DIAS[(tp.dia - 1) % 7]}`;
  $('hudHora').querySelector('span').textContent = tp.fase === 'noite' ? `Noite (${tp.noite}s)` : hora(tp.minuto);
  const noite = tp.fase === 'noite' || tp.minuto >= 19 * 60;
  if ($('hudCeu').dataset.noite !== String(noite)) {
    $('hudCeu').src = iconeCeu(noite);
    $('hudCeu').dataset.noite = String(noite);
  }
  if (!$('modalResumo').classList.contains('escondido') && tp.fase === 'noite') {
    const c = $('contagemNoite');
    if (c) c.textContent = tp.noite;
  }
  if (tp.fase === 'dia' && !$('modalResumo').classList.contains('escondido') && resumoMostradoDia > 0 && resumoMostradoDia < tp.dia) $('modalResumo').classList.add('escondido');
  atualizarFilaBarras();
}

export function aoReceberEvento(ev) {
  switch (ev.tipo) {
    case 'anuncio':
      toast(ev.texto, ev.tom === 'evento' ? 'evento' : ev.tom, ev.tom === 'evento' ? 7000 : 4000);
      break;
    case 'som':
      tocar(ev.som || 'clique');
      break;
    case 'chat':
      if ($('painelLateral').classList.contains('escondido') || $('abaChat').classList.contains('escondido')) $('chatNovo').classList.remove('escondido');
      break;
    case 'resumo':
      tocar('noite');
      mostrarResumo(ev);
      break;
    case 'reiniciada':
      J.construcao.ativo = false;
      atualizarConstrucao();
      $('modalResumo').classList.add('escondido');
      resumoMostradoDia = 0;
      break;
    default:
      break;
  }
}

// ------------------------------------------------------------------ HUD
function atualizarHud() {
  const e = J.estado;
  $('hudNome').textContent = e.loja.nome;
  $('hudNome').title = e.loja.nome;
  const cx = $('hudCaixa');
  cx.textContent = 'Caixa ' + formatarDinheiro(e.loja.caixa);
  cx.title = dinheiroPorExtenso(e.loja.caixa);
  cx.classList.toggle('negativo', e.loja.caixa < 0);
  $('hudDivida').textContent = 'Dívida ' + formatarDinheiro(e.divida);
  $('hudDivida').title = dinheiroPorExtenso(e.divida);
  $('hudDivida').classList.toggle('negativo', e.creditoBloqueado);
  $('hudRep').textContent = `Reputação ${Math.round(e.loja.reputacao)}`;
  const ab = $('hudAberto');
  ab.textContent = e.loja.falida ? 'FALIDA' : e.loja.aberta ? 'ABERTO' : 'FECHADO';
  ab.className = 'hud-item placa ' + (e.loja.aberta ? 'aberta' : 'fechada');
  $('hudVel').textContent = e.config.pausado ? 'PAUSADO' : `${e.config.velocidade}×`;
  const meu = eu();
  document.title = `${e.loja.nome} — ${meu ? NOME_CARGO[meu.cargo] : 'Instrutor'}`;
}

// ------------------------------------------------------------------ painel lateral
function trocarAba(aba) {
  for (const a of document.querySelectorAll('.aba')) a.classList.toggle('ativa', a.dataset.aba === aba);
  $('abaLog').classList.toggle('escondido', aba !== 'log');
  $('abaChat').classList.toggle('escondido', aba !== 'chat');
  if (aba === 'chat') $('chatNovo').classList.add('escondido');
}

function atualizarLateral() {
  const e = J.estado;
  const ultLog = e.log.length ? e.log[e.log.length - 1].real : 0;
  if (ultLog !== logVisto) {
    logVisto = ultLog;
    const el = $('abaLog');
    const noFim = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
    el.innerHTML = e.log
      .map((l) => `<div class="log-linha"><span class="quando">D${l.dia} ${l.hora}</span> <b>${esc(l.quem)}</b>${l.cargo ? ` <small>(${NOME_CARGO[l.cargo]})</small>` : ''}: ${esc(l.acao)}</div>`)
      .join('');
    if (noFim) el.scrollTop = el.scrollHeight;
  }
  const ultChat = e.chat.length ? e.chat[e.chat.length - 1].real : 0;
  if (ultChat !== chatVisto) {
    chatVisto = ultChat;
    const el = $('mensagensChat');
    el.innerHTML = e.chat.map((c) => `<div class="chat-linha"><span class="quando">${c.hora}</span> <b>${esc(c.quem)}</b>: ${esc(c.texto)}</div>`).join('');
    el.scrollTop = el.scrollHeight;
  }
}

// ------------------------------------------------------------------ fila do barbeiro
function clientesNaFila() {
  return [...J.interp.values()].map((i) => i.dados).filter((d) => d.k === 'c' && d.e === 'fila').sort((a, b) => (a.p ?? 1) - (b.p ?? 1));
}

export function atualizarFila() {
  const e = J.estado;
  if (!e) return;
  const fila = clientesNaFila();
  const painel = $('painelFila');
  const mostra = e.loja.aberta || fila.length;
  painel.classList.toggle('escondido', !mostra);
  if (!mostra) return;
  const lista = $('listaFila');
  if (!fila.length) lista.innerHTML = '<div style="padding:8px">Ninguém esperando.</div>';
  else
    lista.innerHTML = fila
      .map((c) => `<button class="item-fila ${J.selecionado === c.i ? 'sel' : ''}" data-cliente="${c.i}"><b>${NOME_SERVICO_CURTO[c.sv] || c.sv}</b><span class="pac"><i data-pac="${c.i}"></i></span></button>`)
      .join('');
  for (const b of lista.querySelectorAll('[data-cliente]'))
    b.onclick = () => {
      if (!pode(meuCargo(), 'atender')) return toast(dicaPermissao('atender'), 'aviso');
      J.selecionado = J.selecionado === b.dataset.cliente ? null : b.dataset.cliente;
      tocar('clique');
      atualizarFila();
    };
  atualizarFilaBarras();
  // ações do barbeiro
  const ac = $('acoesBarbeiro');
  const souBarbeiro = meuCargo() === 'barbeiro';
  const meuAt = J.tick?.at.find((a) => a.b === J.meuId);
  let html = '';
  if (souBarbeiro && meuAt) {
    html += `<div class="dica">Atendendo: ${NOME_SERVICO_CURTO[meuAt.sv]}</div>`;
    html += bt('sugerirProduto', 'Sugerir produto', `data-a="sugerir" data-cliente="${meuAt.c}"`);
  } else if (souBarbeiro && J.selecionado) {
    html += `<button class="bt pequeno verde" data-a="atenderLivre">Atender na cadeira livre</button><div class="dica">ou clique numa cadeira no mapa</div>`;
  } else if (souBarbeiro && fila.length) {
    html += '<div class="dica">Clique num cliente para atender.</div>';
  } else if (!e.barbeiroOnline && e.npcs.length === 0 && fila.length) {
    html += '<div class="dica">Sem barbeiro online! O Gerente pode contratar um NPC em Equipe.</div>';
  }
  ac.innerHTML = html;
}

function atualizarFilaBarras() {
  for (const i of document.querySelectorAll('[data-pac]')) {
    const d = J.interp.get(i.dataset.pac)?.dados;
    if (!d) continue;
    const p = d.p ?? 1;
    i.style.width = Math.round(p * 100) + '%';
    i.style.background = p > 0.5 ? '#2fa84f' : p > 0.25 ? '#f2c230' : '#c0392b';
  }
  const fila = clientesNaFila();
  const ids = [...document.querySelectorAll('#listaFila [data-cliente]')].map((b) => b.dataset.cliente).join();
  if (ids !== fila.map((c) => c.i).join()) atualizarFila();
}

// ------------------------------------------------------------------ construção
function ligarBandeja() {
  const bandeja = $('itensBandeja');
  let arrastando = false;
  bandeja.addEventListener('pointerdown', (e) => {
    const it = e.target.closest('[data-tipo]');
    if (!it) return;
    e.preventDefault();
    const est = J.estado;
    const m = est.moveis.find((x) => !x.colocado && x.tipo === it.dataset.tipo);
    if (!m) return;
    Jogo.carregarMovel(m.id, m.tipo, 0, false);
    arrastando = true;
    atualizarConstrucao();
  });
  // no toque o navegador "prende" o ponteiro no item da bandeja: acompanhamos pela janela
  window.addEventListener('pointermove', (e) => {
    if (J.construcao.carregando && arrastando) Jogo.atualizarFantasma(e.clientX, e.clientY);
  });
  window.addEventListener('pointerup', (e) => {
    if (!arrastando) return;
    arrastando = false;
    if (!J.construcao.carregando) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    // soltou em cima do mapa: coloca. Soltou na bandeja: fica selecionado (modo tocar-e-tocar)
    if (el && el.id === 'tela') Jogo.soltarSobreCanvas(e.clientX, e.clientY);
  });
}

export function atualizarConstrucao() {
  const c = J.construcao;
  $('bandejaConstrucao').classList.toggle('escondido', !c.ativo);
  $('btConstruir').classList.toggle('ativo', c.ativo);
  if (!c.ativo || !J.estado) return;
  const est = J.estado;
  const grupos = {};
  for (const mv of est.moveis) if (!mv.colocado) grupos[mv.tipo] = (grupos[mv.tipo] || 0) + 1;
  const tipos = Object.keys(grupos);
  $('itensBandeja').innerHTML = tipos.length
    ? tipos.map((t) => `<div class="item-bandeja ${c.carregando?.tipo === t && !c.movendoId ? 'sel' : ''}" data-tipo="${t}"><img src="${iconeMovel(t)}" alt="">${esc(J.eco.equipamentos[t].nome)} ×${grupos[t]}</div>`).join('')
    : '<div class="dica" style="padding:8px">Nada no depósito. Compre móveis em Compras, ou clique num móvel do mapa para movê-lo.</div>';
  const ac = $('acoesMovel');
  if (c.carregando) {
    const dicaPar = { cadeira: ' O quadrado azul mostra onde vai o espelho. Gire (R) para mudar o lado.', espelho: ' Coloque no quadrado azul, na frente da cadeira, com o vidro virado para ela.' }[c.carregando.tipo] || '';
    ac.innerHTML = `<span>Escolha um lugar na loja para <b>${esc(J.eco.equipamentos[c.carregando.tipo].nome)}</b>.${dicaPar}</span><button class="bt pequeno" data-a="girar">Girar (R)</button><button class="bt pequeno" data-a="cancelarCarregar">Cancelar</button>`;
    return;
  }
  const sel = est.moveis.find((x) => x.id === c.selecionadoMovel);
  if (sel) {
    const valor = Math.round(J.eco.equipamentos[sel.tipo].preco * J.eco.venda.usadoFator);
    ac.innerHTML = `<b>${esc(J.eco.equipamentos[sel.tipo].nome)}</b>
      <button class="bt pequeno" data-a="moverMovel" data-id="${sel.id}">Mover</button>
      <button class="bt pequeno" data-a="girar">Girar (R)</button>
      <button class="bt pequeno" data-a="guardar" data-id="${sel.id}">Guardar</button>
      <button class="bt pequeno vermelho" data-a="venderMovel" data-id="${sel.id}">Vender usado (${formatarDinheiro(valor)})</button>
      <button class="bt pequeno" data-a="sairConstrucao">Sair do modo construção</button>`;
  } else ac.innerHTML = `<span class="dica">Clique num móvel do mapa para mover, girar, guardar ou vender.</span><button class="bt pequeno" data-a="sairConstrucao">Sair do modo construção</button>`;
}

// ------------------------------------------------------------------ janelas
const TITULOS = { loja: 'Loja', compras: 'Compras', estoque: 'Estoque', banco: 'Banco', equipe: 'Equipe', instrutor: 'Painel do instrutor' };

export function abrirJanela(nome) {
  if (painelAberto === nome) return fecharJanela();
  painelAberto = nome;
  for (const b of document.querySelectorAll('[data-painel]')) b.classList.toggle('ativo', b.dataset.painel === nome);
  $('janela').classList.remove('escondido');
  $('janelaTitulo').textContent = TITULOS[nome];
  $('janelaCorpo').scrollTop = 0;
  desenharJanela();
  if (nome === 'banco') simularEmprestimoDepois();
}

export function fecharJanela() {
  painelAberto = null;
  $('janela').classList.add('escondido');
  for (const b of document.querySelectorAll('[data-painel]')) b.classList.remove('ativo');
}

function desenharJanela() {
  if (!J.estado || !painelAberto) return;
  ultimoRender = performance.now();
  const corpo = $('janelaCorpo');
  const rolagem = corpo.scrollTop;
  const fn = { loja: painelLoja, compras: painelCompras, estoque: painelEstoque, banco: painelBanco, equipe: painelEquipe, instrutor: painelInstrutor }[painelAberto];
  // preserva o que foi digitado em campos sem foco
  const valores = {};
  for (const i of corpo.querySelectorAll('input[id], select[id]')) valores[i.id] = i.value;
  corpo.innerHTML = fn(J.estado);
  for (const [id, v] of Object.entries(valores)) {
    const i = document.getElementById(id);
    if (i && i.dataset.manter !== 'nao') i.value = v;
  }
  corpo.scrollTop = rolagem;
  for (const c of corpo.querySelectorAll('canvas[data-hist]')) desenharSparkline(c, JSON.parse(c.dataset.hist));
  for (const c of corpo.querySelectorAll('canvas[data-skin]')) {
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(spritePersonagem(JSON.parse(c.dataset.skin), 0, 0), 0, 0, 28, 44);
  }
  if (painelAberto === 'banco' && ultimaSimulacao) mostrarSimulacao(ultimaSimulacao);
}

function desenharSparkline(c, hist) {
  const ctx = c.getContext('2d');
  const w = c.width;
  const h = c.height;
  ctx.clearRect(0, 0, w, h);
  if (hist.length < 2) {
    ctx.fillStyle = '#8d8d96';
    ctx.fillRect(0, h / 2, w, 1);
    return;
  }
  const min = Math.min(...hist);
  const max = Math.max(...hist);
  const pts = hist.map((v, i) => [Math.round((i / (hist.length - 1)) * (w - 3)) + 1, Math.round(h - 2 - ((v - min) / (max - min || 1)) * (h - 4))]);
  ctx.fillStyle = '#3b7dd8';
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 0; k <= n; k++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), 1, 1);
  }
  const [lx, ly] = pts[pts.length - 1];
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(lx - 1, ly - 1, 3, 3);
}

function seta(item) {
  if (item.atual > item.ontem) return '<span class="sobe" title="Mais caro que ontem">↑</span>';
  if (item.atual < item.ontem) return '<span class="desce" title="Mais barato que ontem">↓</span>';
  return '<span title="Igual a ontem">=</span>';
}

// ---------------------------------------------------------------- painel: Loja
function painelLoja(e) {
  const eco = J.eco;
  const h = e.hoje;
  const perdidos = h.perdidos.fila + h.perdidos.preco + h.perdidos.falta + h.perdidos.fechada;
  let html = `<div class="cards">
    <div class="card"><div class="rot">Caixa</div><div class="val">${m(e.loja.caixa)}</div></div>
    <div class="card"><div class="rot">Faturamento hoje</div><div class="val">${m(h.receitaServicos + h.receitaProdutos)}</div></div>
    <div class="card"><div class="rot">Atendidos / perdidos hoje</div><div class="val">${h.atendidos} / ${perdidos}</div></div>
    <div class="card"><div class="rot">Reputação</div><div class="val">${Math.round(e.loja.reputacao)} / 100</div></div>
  </div>`;
  html += `<h3>Nome e funcionamento</h3>
    <div class="linha"><input id="pNome" maxlength="24" value="${esc(e.loja.nome)}">${bt('renomearLoja', 'Renomear', 'data-a="renomear"')}</div>
    <div class="linha" style="margin-top:8px">A loja está <b class="${e.loja.aberta ? 'ok' : 'ruim'}">${e.loja.aberta ? 'ABERTA' : 'FECHADA'}</b>
    ${e.loja.aberta ? bt('abrirFechar', 'Fechar loja', 'data-a="fechar"', 'vermelho') : bt('abrirFechar', 'Abrir loja', 'data-a="abrir"', 'verde')}</div>
    <ul class="checklist">${e.requisitos.map((r) => `<li class="${r.ok ? 'ok' : 'ruim'}">${r.ok ? '✔' : '✘'} ${esc(r.item)}</li>`).join('')}</ul>
    <p class="dica">Loja fechada não recebe clientes, mas paga aluguel e energia. Cada cadeira só funciona com um espelho <b>na frente dela, virado para ela</b> (no modo Construir, o quadrado azul mostra onde vai o espelho).</p>`;
  html += painelAmpliacao(e);
  html += `<h3>Preços dos serviços</h3><table><tr><th>Serviço</th><th class="num">Tempo</th><th class="num">Referência</th><th>Seu preço (ʀ$)</th><th>Efeito na procura</th><th></th></tr>`;
  for (const [id, s] of Object.entries(eco.servicos)) {
    const ref = e.referencias[id];
    const p = e.precos.servicos[id];
    html += `<tr><td>${esc(s.nome)}</td><td class="num">${s.duracao}s</td><td class="num">${m(ref)}</td>
      <td><input id="ps_${id}" inputmode="decimal" value="${preco(p)}"></td><td>${efeitoPreco(p, ref)}</td>
      <td>${bt('definirPreco', 'Salvar', `data-a="preco" data-tipo="servico" data-id="${id}"`)}</td></tr>`;
  }
  html += `</table><p class="dica">Até 10% acima da referência: sem efeito. De 10% a 40% acima: menos clientes. Acima de 40%: 80% desistem e a reputação cai. Abaixo da referência: mais clientes, margem menor.</p>`;
  html += `<h3>Preços de venda dos produtos</h3><table><tr><th>Produto</th><th class="num">Custo hoje</th><th class="num">Sugerido</th><th>Seu preço (ʀ$)</th><th class="num">Margem</th><th></th></tr>`;
  for (const [id, p] of Object.entries(eco.produtos)) {
    if (!p.venda) continue;
    const pv = e.precos.produtos[id];
    const custo = e.mercado[id].hoje;
    const margem = pv - custo;
    html += `<tr><td>${esc(p.nome)}</td><td class="num">${m(custo)}</td><td class="num">${m(p.venda)}</td>
      <td><input id="pp_${id}" inputmode="decimal" value="${preco(pv)}"></td>
      <td class="num ${margem > 0 ? 'ok' : 'ruim'}">${m(margem)}</td>
      <td>${bt('definirPreco', 'Salvar', `data-a="preco" data-tipo="produto" data-id="${id}"`)}</td></tr>`;
  }
  html += `</table>`;
  html += `<h3>Clientes perdidos hoje</h3><table>
    <tr><td>Fila longa / demora</td><td class="num">${h.perdidos.fila}</td></tr>
    <tr><td>Preço alto</td><td class="num">${h.perdidos.preco}</td></tr>
    <tr><td>Falta de produto/equipamento</td><td class="num">${h.perdidos.falta}</td></tr>
    <tr><td>Loja fechada</td><td class="num">${h.perdidos.fechada}</td></tr></table>`;
  if (e.historico.length) {
    html += `<h3>Últimos dias</h3><table><tr><th>Dia</th><th class="num">Faturamento</th><th class="num">Custos</th><th class="num">Lucro</th><th class="num">Atendidos</th><th class="num">Caixa</th></tr>`;
    for (const r of e.historico.slice(-7).reverse())
      html += `<tr><td>${r.dia} (${r.diaSemana.slice(0, 3)})</td><td class="num">${m(r.faturamento)}</td><td class="num">${m(r.custos)}</td><td class="num ${r.lucro >= 0 ? 'ok' : 'ruim'}">${m(r.lucro)}</td><td class="num">${r.atendidos}</td><td class="num">${m(r.caixa)}</td></tr>`;
    html += `</table>`;
  }
  return html;
}

function painelAmpliacao(e) {
  const niveis = J.eco.ampliacao;
  const nivel = e.loja.nivel || 1;
  const atual = niveis[nivel - 1];
  const prox = niveis[nivel];
  const cadeiras = e.moveis.filter((x) => x.colocado && x.tipo === 'cadeira').length;
  const aluguelHoje = J.eco.custosFixos.aluguel + atual.aluguelExtra;
  let html = `<h3>Tamanho da barbearia</h3>
    <div class="cards">
      <div class="card"><div class="rot">Salão atual</div><div class="val">${esc(atual.nome)}</div></div>
      <div class="card"><div class="rot">Cadeiras no mapa</div><div class="val">${cadeiras} / ${atual.maxCadeiras}</div></div>
      <div class="card"><div class="rot">Aluguel por dia</div><div class="val">${m(aluguelHoje)}</div></div>
    </div>`;
  if (!prox) return html + `<p class="dica">A barbearia já está no tamanho máximo.</p>`;
  const falta = Math.max(0, prox.preco - e.loja.caixa);
  html += `<table>
    <tr><th></th><th>Agora</th><th>Depois de ampliar</th></tr>
    <tr><td>Área</td><td>${esc(atual.nome)}</td><td>${esc(prox.nome)}</td></tr>
    <tr><td>Cadeiras que cabem</td><td class="num">${atual.maxCadeiras}</td><td class="num">${prox.maxCadeiras}</td></tr>
    <tr><td>Clientes esperando em pé</td><td class="num">${J.eco.demanda.lugaresEmPe + atual.lugaresEmPeExtra}</td><td class="num">${J.eco.demanda.lugaresEmPe + prox.lugaresEmPeExtra}</td></tr>
    <tr><td>Movimento na calçada</td><td class="num">+${Math.round(atual.bonusDemanda * 100)}%</td><td class="num">+${Math.round(prox.bonusDemanda * 100)}%</td></tr>
    <tr><td>Aluguel por dia</td><td class="num">${m(aluguelHoje)}</td><td class="num">${m(J.eco.custosFixos.aluguel + prox.aluguelExtra)}</td></tr>
  </table>
  <div class="linha" style="margin-top:8px">${bt('ampliarLoja', `Ampliar agora por ${formatarDinheiro(prox.preco)}`, 'data-a="ampliar"', 'verde')}
    ${falta ? `<span class="ruim">Faltam ${m(falta)} no caixa</span>` : ''}</div>
  <p class="dica">A obra é paga à vista e o aluguel sobe para sempre. Vale a pena quando a loja perde clientes por fila cheia
    e a equipe tem barbeiros para as cadeiras novas. Faça a conta: em quantos dias o lucro extra paga a obra? As cadeiras e espelhos novos são comprados à parte.</p>`;
  return html;
}

function efeitoPreco(p, ref) {
  const r = p / ref - 1;
  const pct = Math.round(r * 100);
  const txt = `${pct > 0 ? '+' : ''}${pct}%`;
  if (r < 0) return `<span class="desce">${txt}: mais clientes</span>`;
  if (r <= 0.1) return `<span>${txt}: normal</span>`;
  if (r <= 0.4) return `<span class="sobe">${txt}: menos clientes</span>`;
  return `<span class="sobe">${txt}: clientes fogem!</span>`;
}

// ---------------------------------------------------------------- painel: Compras
function painelCompras(e) {
  const eco = J.eco;
  const cats = { equipamento: ['Equipamentos e móveis', eco.equipamentos], ferramenta: ['Ferramentas', eco.ferramentas], produto: ['Produtos e insumos', eco.produtos] };
  let html = `<div class="linha" style="justify-content:space-between"><div class="subabas">${Object.entries(cats).map(([k, [n]]) => `<button class="bt pequeno ${subabaCompras === k ? 'sel' : ''}" data-a="subaba" data-aba="${k}">${n}</button>`).join('')}</div><div>Caixa: <b>${m(e.loja.caixa)}</b></div></div>`;
  const [, lista] = cats[subabaCompras];
  html += `<table><tr><th>Item</th><th>${subabaCompras === 'ferramenta' ? 'Durabilidade' : subabaCompras === 'produto' ? 'Uso' : 'Função'}</th><th class="num">Preço hoje</th><th>7 dias</th><th>Qtd</th><th></th></tr>`;
  for (const [id, it] of Object.entries(lista)) {
    const mk = e.mercado[id];
    const vsBase = Math.round((mk.hoje / mk.base - 1) * 100);
    const info = subabaCompras === 'ferramenta' ? `${it.usos} usos` : subabaCompras === 'produto' ? (it.venda ? `revenda (sug. ${formatarDinheiro(it.venda)}) · ${it.doses} usos` : `insumo · ${it.doses} usos`) : esc(it.funcao);
    const icone = subabaCompras === 'equipamento' ? `<img class="icone-item" src="${iconeMovel(id)}" alt=""> ` : '';
    const promo = mk.hoje !== mk.atual ? ` <span class="tag">${mk.hoje < mk.atual ? 'promoção' : 'alta'}</span>` : '';
    html += `<tr><td>${icone}${esc(it.nome)}${promo}</td><td><small>${info}</small></td>
      <td class="num">${seta(mk)} ${m(mk.hoje)}<br><small class="${vsBase > 0 ? 'sobe' : vsBase < 0 ? 'desce' : ''}">${vsBase > 0 ? '+' : ''}${vsBase}% do base</small></td>
      <td><canvas class="sparkline" width="70" height="22" data-hist="${esc(JSON.stringify(mk.historico))}" title="Histórico de preço (7 dias)"></canvas></td>
      <td><input id="q_${id}" type="number" min="1" max="${subabaCompras === 'produto' ? 100 : 10}" value="1" style="width:64px"></td>
      <td>${bt('comprar', 'Comprar', `data-a="comprar" data-item="${id}"`, 'verde')}</td></tr>`;
  }
  html += `</table>`;
  html += `<p class="dica">Os preços mudam todo dia (entre 70% e 140% do preço base). ↑ = mais caro que ontem, ↓ = mais barato. Móveis comprados vão para o depósito: use <b>Construir</b> para colocá-los na loja.</p>`;
  return html;
}

// ---------------------------------------------------------------- painel: Estoque
function painelEstoque(e) {
  const eco = J.eco;
  let html = `<h3>Móveis e equipamentos</h3>`;
  if (!e.moveis.length) html += `<p class="dica">Nenhum móvel ainda. Compre em Compras.</p>`;
  else {
    html += `<table><tr><th>Item</th><th>Onde</th><th></th><th></th></tr>`;
    for (const mv of e.moveis) {
      const valor = Math.round(eco.equipamentos[mv.tipo].preco * eco.venda.usadoFator);
      html += `<tr><td><img class="icone-item" src="${iconeMovel(mv.tipo)}" alt=""> ${esc(eco.equipamentos[mv.tipo].nome)}</td>
        <td>${mv.colocado ? 'Na loja' : '<b>Depósito</b>'}</td>
        <td>${mv.colocado ? bt('guardar', 'Guardar', `data-a="guardar" data-id="${mv.id}"`) : bt('posicionar', 'Colocar', `data-a="colocar" data-id="${mv.id}"`)}</td>
        <td>${bt('venderUsado', `Vender ${formatarDinheiro(valor)}`, `data-a="venderMovel" data-id="${mv.id}"`, 'vermelho')}</td></tr>`;
    }
    html += `</table>`;
  }
  html += `<h3>Ferramentas</h3><table><tr><th>Ferramenta</th><th>Durabilidade</th><th></th></tr>`;
  let algumaFerr = false;
  for (const [t, lista] of Object.entries(e.ferramentas)) {
    const f = eco.ferramentas[t];
    lista.forEach((u, i) => {
      algumaFerr = true;
      const valor = Math.round(f.preco * eco.venda.usadoFator * (u / f.usos));
      const pct = Math.round((u / f.usos) * 100);
      html += `<tr><td>${esc(f.nome)}</td><td><span class="durab"><i style="width:${pct}%;background:${pct > 30 ? '#2fa84f' : '#c0392b'}"></i></span> ${u}/${f.usos} usos</td>
        <td>${bt('venderUsado', `Vender ${formatarDinheiro(valor)}`, `data-a="venderFerramenta" data-tipo="${t}" data-i="${i}"`, 'vermelho')}</td></tr>`;
    });
  }
  if (!algumaFerr) html += `<tr><td colspan="3" class="dica">Nenhuma ferramenta. Sem tesoura ou máquina não dá para abrir.</td></tr>`;
  html += `</table><p class="dica">Usado vale 50% do preço base, proporcional à durabilidade que resta.</p>`;
  const usado = Object.values(e.exposto).reduce((a, b) => a + b, 0);
  html += `<h3>Produtos e insumos</h3><p>Prateleiras: <b>${usado} / ${e.capacidadeExposicao}</b> unidades expostas ${e.capacidadeExposicao ? '' : '(coloque uma prateleira na loja para vender produtos)'}</p>
    <table><tr><th>Produto</th><th class="num">Estoque</th><th class="num">Na prateleira</th><th class="num">Doses abertas</th><th>Qtd</th><th></th></tr>`;
  for (const [id, p] of Object.entries(eco.produtos)) {
    html += `<tr><td>${esc(p.nome)}${p.venda ? '' : ' <small>(insumo)</small>'}</td><td class="num">${e.estoque[id]}</td><td class="num">${p.venda ? e.exposto[id] : '—'}</td><td class="num">${e.doses[id]}</td>
      <td>${p.venda ? `<input id="ex_${id}" type="number" min="1" value="5" style="width:60px">` : ''}</td>
      <td>${p.venda ? bt('expor', 'Expor', `data-a="expor" data-id="${id}"`) + ' ' + bt('recolher', 'Recolher', `data-a="recolher" data-id="${id}"`) : ''}</td></tr>`;
  }
  html += `</table><p class="dica">Serviços gastam doses: corte com lavatório usa shampoo; barba usa lâminas. Clientes compram só o que está na prateleira.</p>`;
  return html;
}

// ---------------------------------------------------------------- painel: Banco
let ultimaSimulacao = null;
function painelBanco(e) {
  const eco = J.eco;
  const podeVerExtrato = pode(meuCargo(), 'verExtrato') || J.instrutor;
  let html = `<div class="cards">
    <div class="card"><div class="rot">Caixa</div><div class="val">${m(e.loja.caixa)}</div></div>
    <div class="card"><div class="rot">Patrimônio (caixa + 50% equip.)</div><div class="val">${m(e.patrimonio)}</div></div>
    <div class="card"><div class="rot">Dívida total</div><div class="val">${m(e.divida)}</div></div>
    <div class="card"><div class="rot">Limite disponível</div><div class="val">${m(e.limiteCredito)}</div></div>
  </div>`;
  if (e.creditoBloqueado) html += `<div class="alerta"><b>Crédito bloqueado:</b> há empréstimo em atraso. Quite para voltar a pegar empréstimos.</div>`;
  if (e.loja.diasNegativo > 0) html += `<div class="alerta"><b>Atenção:</b> caixa negativo há ${e.loja.diasNegativo} dia(s). Com 3 dias seguidos a empresa vai à falência!</div>`;
  html += `<h3>Pedir empréstimo</h3>
    <div class="linha"><label style="flex:1">Valor (ʀ$)<input id="bValor" inputmode="decimal" value="1.000,00"></label>
    <label style="flex:1">Prazo<select id="bPrazo">${eco.banco.prazos.map((p) => `<option value="${p}" ${p === 7 ? 'selected' : ''}>${p} dias</option>`).join('')}</select></label></div>
    <div id="simulacao" class="aviso">Calculando…</div>
    <p class="dica">Juros simples de ${(eco.banco.jurosDiarioBp / 100).toLocaleString('pt-BR')}% ao dia sobre o valor emprestado. ${e.gerenteOnline ? 'O Gerente precisa aprovar.' : 'Sem Gerente online: o Financeiro aprova sozinho.'}</p>
    ${bt('solicitarEmprestimo', 'Pedir empréstimo', 'data-a="pedirEmprestimo"', 'azul')}`;
  if (e.pedidos.length) {
    html += `<h3>Pedidos aguardando o Gerente</h3><table><tr><th>Pedido por</th><th class="num">Valor</th><th class="num">Prazo</th><th></th></tr>`;
    for (const p of e.pedidos)
      html += `<tr><td>${esc(p.solicitante)}</td><td class="num">${m(p.valor)}</td><td class="num">${p.prazo} dias</td>
        <td>${bt('aprovarEmprestimo', 'Aprovar', `data-a="aprovar" data-id="${p.id}"`, 'verde')} ${bt('recusarEmprestimo', 'Recusar', `data-a="recusar" data-id="${p.id}"`, 'vermelho')}</td></tr>`;
    html += `</table>`;
  }
  const abertos = e.emprestimos.filter((x) => !x.quitado);
  html += `<h3>Empréstimos em aberto</h3>`;
  if (!abertos.length) html += `<p class="dica">Nenhum.</p>`;
  for (const x of abertos) {
    const q = x.quitacao;
    html += `<div class="card" style="margin-bottom:8px">
      <div class="linha" style="justify-content:space-between"><b>#${x.id} — ${m(x.principal)} por ${x.prazo} dias</b>${x.atrasado ? '<span class="tag" style="background:#ffd6d0">EM ATRASO</span>' : `<span class="tag">vence no fim do dia ${x.diaVencimento}</span>`}</div>
      <table>
        <tr><td>Pego no dia</td><td class="num">${x.diaInicio} (por ${esc(x.solicitante)}, aprovado por ${esc(x.aprovador)})</td></tr>
        <tr><td>Dias de juros contados</td><td class="num">${x.diasCorridos}</td></tr>
        <tr><td>Principal que falta</td><td class="num">${m(x.principalRestante)}</td></tr>
        <tr><td>Juros acumulados (não pagos)</td><td class="num">${m(x.jurosDevidos)}</td></tr>
        ${x.encargosDevidos ? `<tr><td>Multa + mora</td><td class="num ruim">${m(x.encargosDevidos)}</td></tr>` : ''}
        <tr><td><b>Para quitar hoje</b></td><td class="num"><b>${m(x.saldo)}</b></td></tr>
        <tr><td>Se pagar só no vencimento</td><td class="num">${m(x.principal + q.jurosContratados)}</td></tr>
      </table>
      ${q.economia > 0 ? `<div class="destaque">Quitando hoje você paga <b>${m(q.jurosAteAgora)}</b> de juros (${q.diasCorridos} dia(s)) em vez de <b>${m(q.jurosContratados)}</b>: economia de <b>${m(q.economia)}</b>.</div>` : ''}
      <div class="linha">${bt('pagarEmprestimo', `Quitar ${formatarDinheiro(x.saldo)}`, `data-a="quitar" data-id="${x.id}"`, 'verde')}
        <input id="pp${x.id}" inputmode="decimal" placeholder="Valor parcial" style="max-width:150px">${bt('pagarEmprestimo', 'Pagar parte', `data-a="pagarParte" data-id="${x.id}"`)}</div>
      <p class="dica">Pagamento parcial abate primeiro multa/juros e depois o principal.</p></div>`;
  }
  const quitados = e.emprestimos.filter((x) => x.quitado);
  if (quitados.length) html += `<p class="dica">${quitados.length} empréstimo(s) já quitado(s). Juros pagos no total: ${m(quitados.reduce((a, x) => a + x.jurosPagos + x.encargosPagos, 0))}.</p>`;
  html += `<h3>Extrato</h3>`;
  if (!podeVerExtrato) html += `<p class="dica">${esc(dicaPermissao('verExtrato'))} completo. Últimas 5 operações:</p>`;
  const linhas = podeVerExtrato ? e.extrato.slice().reverse() : e.extrato.slice(-5).reverse();
  html += `<table><tr><th>Quando</th><th>Descrição</th><th>Quem</th><th class="num">Valor</th><th class="num">Saldo</th></tr>`;
  for (const l of linhas.slice(0, 200)) html += `<tr><td>D${l.dia} ${l.hora}</td><td>${esc(l.descricao)}</td><td>${esc(l.quem)}</td><td class="num ${l.valor >= 0 ? 'ok' : 'ruim'}">${m(l.valor)}</td><td class="num">${m(l.saldo)}</td></tr>`;
  html += `</table>`;
  return html;
}

function simularEmprestimoDepois() {
  clearTimeout(simTimer);
  simTimer = setTimeout(async () => {
    const valor = lerDinheiro($('bValor')?.value);
    const prazo = Number($('bPrazo')?.value);
    if (!$('simulacao')) return;
    if (valor === null) return ($('simulacao').textContent = 'Digite um valor, ex.: 1.000,00');
    if (J.observador) return ($('simulacao').textContent = 'Simulação disponível para jogadores.');
    const r = await acao('simularEmprestimo', { valor, prazo });
    if (!r.ok) {
      ultimaSimulacao = null;
      $('simulacao').textContent = r.erro;
      return;
    }
    ultimaSimulacao = r;
    mostrarSimulacao(r);
  }, 250);
}

function mostrarSimulacao(r) {
  const el = $('simulacao');
  if (!el) return;
  const s = r.simulacao;
  const acima = s.recebe > r.limite;
  el.innerHTML = `<table>
    <tr><td>Você recebe agora</td><td class="num"><b>${m(s.recebe)}</b></td></tr>
    <tr><td>Juros por dia</td><td class="num">${m(s.jurosPorDia)}</td></tr>
    <tr><td>Juros totais (${s.prazo} dias)</td><td class="num">${m(s.jurosTotais)}</td></tr>
    <tr><td>Total a pagar</td><td class="num"><b>${m(s.total)}</b></td></tr>
    <tr><td>Vencimento</td><td class="num">fim do dia ${s.diaVencimento}</td></tr>
  </table>${acima ? `<div class="ruim">Acima do limite disponível (${formatarDinheiro(r.limite)})</div>` : ''}
  <small>Quitando antes, você paga só os dias corridos (mínimo 1 dia).</small>`;
}

// ---------------------------------------------------------------- painel: Equipe
function painelEquipe(e) {
  const eco = J.eco;
  let html = `<h3>Jogadores (${e.jogadores.filter((j) => j.online).length} / ${eco.sala.maxJogadores} online)</h3><table>`;
  for (const j of e.jogadores.filter((x) => x.online))
    html += `<tr><td><canvas width="28" height="44" class="mini-pers" data-skin="${esc(JSON.stringify(j.skin))}"></canvas></td><td><b>${esc(j.nome)}</b>${j.id === J.meuId ? ' (você)' : ''}</td><td>${NOME_CARGO[j.cargo]}</td></tr>`;
  html += `</table>`;
  const off = e.jogadores.filter((x) => !x.online);
  if (off.length) html += `<p class="dica">Fora da sala: ${off.map((j) => esc(j.nome)).join(', ')}</p>`;
  if (!J.observador) {
    html += `<h3>Trocar de cargo</h3><div class="linha">`;
    for (const [id, c] of Object.entries(eco.sala.cargos)) {
      const v = e.vagas[id];
      const atual = meuCargo() === id;
      html += `<button class="bt pequeno ${atual ? 'amarelo' : ''}" data-a="cargo" data-cargo="${id}" ${atual || v.ocupadas >= v.max ? 'disabled' : ''}>${c.nome} (${v.ocupadas}/${v.max})</button>`;
    }
    html += `</div><p class="dica">Se o Gerente sair, qualquer jogador pode assumir o cargo aqui.</p>`;
  }
  html += `<h3>Barbeiros NPC</h3><p class="dica">Atendem sozinhos, mas são ${Math.round((1 / eco.npc.fatorVelocidade - 1) * 100)}% mais lentos e custam ${m(eco.custosFixos.salarioNpc)} por dia. Só podem ser contratados sem Barbeiro jogador online.</p>`;
  for (const n of e.npcs) html += `<div class="linha">${esc(n.nome)} ${bt('demitirNpc', 'Dispensar', `data-a="demitir" data-id="${n.id}"`, 'vermelho')}</div>`;
  html += bt('contratarNpc', `Contratar barbeiro NPC (${formatarDinheiro(eco.custosFixos.salarioNpc)}/dia)`, 'data-a="contratar"', 'verde');
  if (!J.instrutor) {
    html += `<h3>Instrutor</h3><div class="linha"><input id="inSenhaInstr" type="password" placeholder="Senha do instrutor" data-manter="nao"><button class="bt pequeno" data-a="loginInstrutor">Entrar como instrutor</button></div>`;
  }
  return html;
}

// ---------------------------------------------------------------- painel: Instrutor
function painelInstrutor(e) {
  const eco = J.eco;
  if (!J.instrutor) return '<p>Faça login como instrutor no painel Equipe.</p>';
  const s = encodeURIComponent(J.senhaInstrutor || '');
  const base = `/api/salas/${e.codigo}`;
  let html = `<div class="cards">
    <div class="card"><div class="rot">Código da empresa</div><div class="val" style="font-family:var(--titulo);letter-spacing:4px">${e.codigo}</div></div>
    <div class="card"><div class="rot">Link para os alunos</div><div style="word-break:break-all"><b>${esc(location.origin)}/?sala=${e.codigo}</b></div></div>
  </div>
  <h3>Tempo</h3>
  <div class="linha">${e.config.pausado ? '<button class="bt verde" data-a="i_pausar" data-v="0">▶ Retomar</button>' : '<button class="bt amarelo" data-a="i_pausar" data-v="1">❚❚ Pausar</button>'}
    ${eco.tempo.velocidades.map((v) => `<button class="bt ${e.config.velocidade === v ? 'amarelo' : ''}" data-a="i_vel" data-v="${v}">${v}×</button>`).join('')}
    ${e.tempo.fase === 'noite' ? '<button class="bt" data-a="i_pularNoite">Pular noite</button>' : ''}</div>
  <div class="linha" style="margin-top:8px"><label>Duração de 1 dia (minutos reais)
    <select id="iDuracao">${Array.from({ length: eco.tempo.diaMinutosReaisMax - eco.tempo.diaMinutosReaisMin + 1 }, (_, i) => i + eco.tempo.diaMinutosReaisMin).map((n) => `<option ${n === e.config.diaMinutosReais ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <button class="bt" data-a="i_duracao">Aplicar</button></div>
  <h3>Relatórios (CSV para Excel/LibreOffice)</h3>
  <div class="linha">
    <a class="bt" href="${base}/log.csv?senha=${s}" download>Log de ações</a>
    <a class="bt" href="${base}/resumo.csv?senha=${s}" download>Resumo diário</a>
    <a class="bt" href="${base}/extrato.csv?senha=${s}" download>Extrato</a>
  </div>
  <h3>Reiniciar</h3>
  <p class="dica">Apaga todo o progresso da empresa (dinheiro, móveis, dias). Os jogadores continuam na sala.</p>
  <button class="bt vermelho" data-a="i_reiniciar">Reiniciar empresa</button>`;
  if (e.historico.length) {
    html += `<h3>Histórico</h3><table><tr><th>Dia</th><th class="num">Faturamento</th><th class="num">Lucro</th><th class="num">Atendidos</th><th class="num">Perdidos</th><th class="num">Caixa</th><th class="num">Dívida</th><th class="num">Rep.</th></tr>`;
    for (const r of e.historico.slice().reverse()) {
      const p = r.perdidos.fila + r.perdidos.preco + r.perdidos.falta + r.perdidos.fechada;
      html += `<tr><td>${r.dia}</td><td class="num">${m(r.faturamento)}</td><td class="num ${r.lucro >= 0 ? 'ok' : 'ruim'}">${m(r.lucro)}</td><td class="num">${r.atendidos}</td><td class="num">${p}</td><td class="num">${m(r.caixa)}</td><td class="num">${m(r.divida)}</td><td class="num">${r.reputacao}</td></tr>`;
    }
    html += `</table>`;
  }
  return html;
}

// ---------------------------------------------------------------- resumo do dia
function mostrarResumo(r) {
  resumoMostradoDia = r.dia;
  const perdidos = r.perdidos.fila + r.perdidos.preco + r.perdidos.falta + r.perdidos.fechada;
  const cd = r.custosDetalhe;
  $('resumoTitulo').textContent = `Fim do dia ${r.dia} — ${r.diaSemana}`;
  $('resumoCorpo').innerHTML = `
    <div class="cards">
      <div class="card"><div class="rot">Faturamento</div><div class="val">${m(r.faturamento)}</div></div>
      <div class="card"><div class="rot">Custos</div><div class="val">${m(r.custos)}</div></div>
      <div class="card"><div class="rot">Lucro do dia</div><div class="val ${r.lucro >= 0 ? 'ok' : 'ruim'}">${m(r.lucro)}</div></div>
      <div class="card"><div class="rot">Saldo em caixa</div><div class="val ${r.caixa >= 0 ? '' : 'ruim'}">${m(r.caixa)}</div></div>
      <div class="card"><div class="rot">Dívida</div><div class="val">${m(r.divida)}</div></div>
      <div class="card"><div class="rot">Reputação</div><div class="val">${r.reputacao} <small>(${r.reputacaoVariacao >= 0 ? '+' : ''}${String(r.reputacaoVariacao).replace('.', ',')})</small></div></div>
    </div>
    <h3>Clientes</h3>
    <table><tr><td>Atendidos</td><td class="num"><b>${r.atendidos}</b></td></tr>
      <tr><td>Perdidos</td><td class="num"><b>${perdidos}</b></td></tr>
      <tr><td>&nbsp;&nbsp;fila longa / demora</td><td class="num">${r.perdidos.fila}</td></tr>
      <tr><td>&nbsp;&nbsp;preço alto</td><td class="num">${r.perdidos.preco}</td></tr>
      <tr><td>&nbsp;&nbsp;falta de produto/equipamento</td><td class="num">${r.perdidos.falta}</td></tr>
      <tr><td>&nbsp;&nbsp;loja fechada</td><td class="num">${r.perdidos.fechada}</td></tr>
      <tr><td>Produtos vendidos</td><td class="num">${r.produtosVendidos}</td></tr></table>
    <h3>Dinheiro</h3>
    <table><tr><td>Serviços</td><td class="num ok">${m(r.receitaServicos)}</td></tr>
      <tr><td>Produtos</td><td class="num ok">${m(r.receitaProdutos)}</td></tr>
      ${r.receitaUsados ? `<tr><td>Venda de usados</td><td class="num ok">${m(r.receitaUsados)}</td></tr>` : ''}
      <tr><td>Compras</td><td class="num ruim">${m(-cd.compras)}</td></tr>
      <tr><td>Aluguel</td><td class="num ruim">${m(-cd.aluguel)}</td></tr>
      <tr><td>Energia (${String(r.horasAberta).replace('.', ',')} h aberta)</td><td class="num ruim">${m(-cd.energia)}</td></tr>
      ${cd.salarios ? `<tr><td>Salários NPC</td><td class="num ruim">${m(-cd.salarios)}</td></tr>` : ''}
      ${cd.juros ? `<tr><td>Juros pagos</td><td class="num ruim">${m(-cd.juros)}</td></tr>` : ''}
      ${cd.multas ? `<tr><td>Multa e mora</td><td class="num ruim">${m(-cd.multas)}</td></tr>` : ''}
      ${r.emprestimosRecebidos ? `<tr><td>Empréstimos recebidos (não é lucro)</td><td class="num">${m(r.emprestimosRecebidos)}</td></tr>` : ''}
      ${r.amortizacoes ? `<tr><td>Principal devolvido ao banco (não é custo)</td><td class="num">${m(-r.amortizacoes)}</td></tr>` : ''}
    </table>
    ${r.diasNegativo ? `<div class="alerta">Caixa negativo há ${r.diasNegativo} dia(s) seguidos. No 3º dia a empresa vai à falência.</div>` : ''}
    ${r.falencia ? '<div class="alerta"><b>A EMPRESA FALIU.</b> O instrutor pode reiniciar a sala.</div>' : `<p>Próximo dia em <b id="contagemNoite">${J.tick?.tempo.noite ?? 30}</b> s.</p>`}`;
  $('modalResumo').classList.remove('escondido');
}

function mostrarFalencia() {
  const e = J.estado;
  const r = e.ultimoResumo || e.historico[e.historico.length - 1];
  if (r) mostrarResumo({ ...r, falencia: true });
  $('resumoTitulo').textContent = 'Relatório final — FALÊNCIA';
  let html = `<div class="alerta"><b>A empresa ficou 3 dias seguidos com caixa negativo e faliu.</b></div><h3>Todos os dias</h3><table><tr><th>Dia</th><th class="num">Faturamento</th><th class="num">Custos</th><th class="num">Lucro</th><th class="num">Caixa</th><th class="num">Dívida</th></tr>`;
  for (const d of e.historico) html += `<tr><td>${d.dia}</td><td class="num">${m(d.faturamento)}</td><td class="num">${m(d.custos)}</td><td class="num ${d.lucro >= 0 ? 'ok' : 'ruim'}">${m(d.lucro)}</td><td class="num">${m(d.caixa)}</td><td class="num">${m(d.divida)}</td></tr>`;
  html += `</table>${J.instrutor ? '<button class="bt vermelho" data-a="i_reiniciar">Reiniciar empresa</button>' : '<p>Peça ao instrutor para reiniciar a empresa.</p>'}`;
  $('resumoCorpo').insertAdjacentHTML('afterbegin', html);
  $('modalResumo').classList.remove('escondido');
}

// ---------------------------------------------------------------- cliques
async function cliqueJanela(ev) {
  const b = ev.target.closest('button, a');
  if (!b) return;
  if (b.getAttribute('aria-disabled') === 'true') {
    toast(b.dataset.dica || 'Sem permissão', 'aviso');
    tocar('erro');
    return;
  }
  const a = b.dataset.a;
  if (!a) return;
  const id = b.dataset.id;
  const executar = async (tipo, dados, sucesso) => {
    const r = await acao(tipo, dados);
    if (!r.ok) {
      toast(r.erro, 'erro');
      tocar('erro');
    } else {
      tocar('clique');
      if (sucesso) toast(typeof sucesso === 'function' ? sucesso(r) : sucesso, 'sucesso');
    }
    return r;
  };
  const instr = async (tipo, dados = {}) => {
    const r = await acaoInstrutor(tipo, dados);
    if (!r.ok) toast(r.erro, 'erro');
  };
  switch (a) {
    case 'renomear':
      await executar('renomearLoja', { nome: $('pNome').value }, 'Nome alterado');
      break;
    case 'ampliar': {
      const prox = J.eco.ampliacao[(J.estado?.loja.nivel || 1)];
      if (!prox) break;
      if (!confirm(`Ampliar para "${prox.nome}" por ${formatarDinheiro(prox.preco)}?\nO aluguel sobe ${formatarDinheiro(prox.aluguelExtra)} por dia.`)) break;
      await executar('ampliarLoja', {});
      break;
    }
    case 'abrir':
      await executar('abrirFechar', { abrir: true });
      break;
    case 'fechar':
      await executar('abrirFechar', { abrir: false });
      break;
    case 'preco': {
      const campo = $((b.dataset.tipo === 'servico' ? 'ps_' : 'pp_') + b.dataset.id);
      const valor = lerDinheiro(campo.value);
      if (valor === null) return toast('Preço inválido. Use o formato 35,00', 'erro');
      await executar('definirPreco', { tipo: b.dataset.tipo, id: b.dataset.id, valor }, 'Preço salvo');
      break;
    }
    case 'subaba':
      subabaCompras = b.dataset.aba;
      desenharJanela();
      break;
    case 'comprar': {
      const qtd = Number($('q_' + b.dataset.item).value);
      await executar('comprar', { item: b.dataset.item, qtd }, (r) => `Compra feita: ${formatarDinheiro(r.total)}`);
      break;
    }
    case 'guardar':
      await executar('guardar', { movelId: Number(id) });
      J.construcao.selecionadoMovel = null;
      atualizarConstrucao();
      break;
    case 'colocar': {
      const mv = J.estado.moveis.find((x) => x.id === Number(id));
      fecharJanela();
      Jogo.alternarConstrucao(true);
      Jogo.carregarMovel(mv.id, mv.tipo, 0, false);
      atualizarConstrucao();
      toast('Toque/clique num lugar da loja para colocar', 'info');
      break;
    }
    case 'moverMovel': {
      const mv = J.estado.moveis.find((x) => x.id === Number(id));
      if (mv) Jogo.carregarMovel(mv.id, mv.tipo, mv.rot, true);
      atualizarConstrucao();
      break;
    }
    case 'girar':
      await Jogo.girar();
      atualizarConstrucao();
      break;
    case 'cancelarCarregar':
      Jogo.cancelarCarregar();
      break;
    case 'sairConstrucao':
      Jogo.alternarConstrucao(false);
      break;
    case 'venderMovel': {
      const mv = J.estado.moveis.find((x) => x.id === Number(id));
      if (!mv || !confirm(`Vender ${J.eco.equipamentos[mv.tipo].nome} usado?`)) return;
      await executar('venderUsado', { movelId: Number(id) }, (r) => `Vendido por ${formatarDinheiro(r.valor)}`);
      J.construcao.selecionadoMovel = null;
      atualizarConstrucao();
      break;
    }
    case 'venderFerramenta':
      if (!confirm('Vender esta ferramenta usada?')) return;
      await executar('venderUsado', { ferramenta: b.dataset.tipo, indice: Number(b.dataset.i) }, (r) => `Vendido por ${formatarDinheiro(r.valor)}`);
      break;
    case 'expor':
      await executar('expor', { produto: id, qtd: Number($('ex_' + id).value) }, (r) => `${r.quantidade} unidade(s) na prateleira`);
      break;
    case 'recolher':
      await executar('recolher', { produto: id, qtd: Number($('ex_' + id).value) });
      break;
    case 'pedirEmprestimo': {
      const valor = lerDinheiro($('bValor').value);
      if (valor === null) return toast('Valor inválido', 'erro');
      await executar('solicitarEmprestimo', { valor, prazo: Number($('bPrazo').value) }, (r) => (r.aprovadoAutomatico ? 'Empréstimo liberado' : 'Pedido enviado ao Gerente'));
      break;
    }
    case 'aprovar':
      await executar('aprovarEmprestimo', { pedidoId: Number(id) });
      break;
    case 'recusar':
      await executar('recusarEmprestimo', { pedidoId: Number(id) });
      break;
    case 'quitar':
      await executar('pagarEmprestimo', { emprestimoId: Number(id), tudo: true }, (r) => (r.economia > 0 ? `Quitado! Economia de ${formatarDinheiro(r.economia)} em juros` : 'Empréstimo quitado'));
      break;
    case 'pagarParte': {
      const valor = lerDinheiro($('pp' + id).value);
      if (!valor) return toast('Digite o valor a pagar', 'erro');
      await executar('pagarEmprestimo', { emprestimoId: Number(id), valor }, (r) => `Pago: juros ${formatarDinheiro(r.pago.juros + r.pago.encargos)}, principal ${formatarDinheiro(r.pago.principal)}`);
      $('pp' + id).value = '';
      break;
    }
    case 'cargo':
      await executar('trocarCargo', { cargo: b.dataset.cargo }, 'Cargo alterado');
      break;
    case 'contratar':
      await executar('contratarNpc', {}, 'Barbeiro NPC contratado');
      break;
    case 'demitir':
      await executar('demitirNpc', { npcId: Number(id) });
      break;
    case 'loginInstrutor': {
      const senha = $('inSenhaInstr').value;
      J.socket.emit('instrutor:login', { senha }, (r) => {
        if (!r.ok) return toast(r.erro, 'erro');
        J.instrutor = true;
        J.senhaInstrutor = senha;
        $('btInstrutor').classList.remove('escondido');
        toast('Painel do instrutor liberado', 'sucesso');
        abrirJanela('instrutor');
      });
      break;
    }
    case 'atenderLivre':
      await Jogo.atender(null);
      break;
    case 'sugerir':
      await executar('sugerirProduto', { clienteId: b.dataset.cliente }, 'Produto sugerido ao cliente');
      break;
    case 'i_pausar':
      await instr('pausar', { pausado: b.dataset.v === '1' });
      break;
    case 'i_vel':
      await instr('velocidade', { velocidade: Number(b.dataset.v) });
      break;
    case 'i_duracao':
      await instr('duracaoDia', { minutos: Number($('iDuracao').value) });
      break;
    case 'i_pularNoite':
      await instr('pularNoite');
      break;
    case 'i_reiniciar':
      if (!confirm('Reiniciar a empresa do zero? Todo o progresso será perdido.')) return;
      await instr('reiniciar');
      break;
    default:
      break;
  }
  if (painelAberto) setTimeout(desenharJanela, 120);
}
