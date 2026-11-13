// Uma Sala = uma empresa (barbearia). Toda a simulação acontece aqui, no servidor.
// O estado persistente fica em `this.s` (serializável em JSON).

import eco from '../config/economia.js';
import { MAPA, aEstrela, caminhavelBase, noInterior, vizinhos, passagemLivre, interiorDoNivel, espelhoDaCadeira, FRENTE } from '../shared/mapa.js';
import { pode, dicaPermissao } from '../shared/permissoes.js';
import { formatarDinheiro } from '../shared/dinheiro.js';
import * as banco from './banco.js';
import * as merc from './mercado.js';
import { validarNome, limparNome, filtrarChat } from './filtro.js';

export const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const MIN_INICIO = eco.tempo.horaInicio * 60;
const MIN_FIM = eco.tempo.horaFim * 60;
const LIMITES_SKIN = { pele: 6, cabeloEstilo: 6, cabeloCor: 6, camisa: 8, calca: 4, acessorio: 4 };
const NOMES_NPC = ['Seu Zé', 'Dona Cida', 'Toninho', 'Marquinhos', 'Rafa', 'Jéssica', 'Beto', 'Lu'];

export function fmtHora(minuto) {
  const m = Math.floor(minuto);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function skinAleatoria(rng = Math.random) {
  const s = {};
  for (const [k, n] of Object.entries(LIMITES_SKIN)) s[k] = Math.floor(rng() * n);
  if (rng() < 0.6) s.acessorio = 0;
  return s;
}

export function validarSkin(skin) {
  const s = {};
  for (const [k, n] of Object.entries(LIMITES_SKIN)) {
    const v = Number(skin?.[k]);
    s[k] = Number.isInteger(v) && v >= 0 && v < n ? v : 0;
  }
  return s;
}

function novoHoje(caixa) {
  return {
    caixaInicio: caixa,
    receitaServicos: 0,
    receitaProdutos: 0,
    receitaUsados: 0,
    custos: { compras: 0, aluguel: 0, energia: 0, salarios: 0, juros: 0, multas: 0 },
    emprestimosRecebidos: 0,
    amortizacoes: 0,
    atendidos: 0,
    produtosVendidos: 0,
    perdidos: { fila: 0, preco: 0, falta: 0, fechada: 0 },
    minutosAberta: 0,
    repInicio: null,
  };
}

function estadoInicial(codigo, senha) {
  const vazio = (obj) => Object.fromEntries(Object.keys(obj).map((k) => [k, 0]));
  const s = {
    versaoFormato: 1,
    codigo,
    senha, // { hash, salt }
    criadaEm: Date.now(),
    config: { diaMinutosReais: eco.tempo.diaMinutosReaisPadrao, velocidade: 1, pausado: false },
    loja: { nome: 'Barbearia Nova', aberta: false, reputacao: eco.reputacaoInicial, caixa: eco.capitalInicial, diasNegativo: 0, falida: false, nivel: 1 },
    tempo: { dia: 1, minuto: MIN_INICIO, fase: 'dia', noiteRestante: 0 },
    precos: {
      servicos: Object.fromEntries(Object.entries(eco.servicos).map(([k, v]) => [k, v.ref])),
      produtos: Object.fromEntries(Object.entries(eco.produtos).filter(([, v]) => v.venda).map(([k, v]) => [k, v.venda])),
    },
    mercado: merc.novoMercado(eco),
    moveis: [],
    proxId: 1,
    ferramentas: Object.fromEntries(Object.keys(eco.ferramentas).map((k) => [k, []])),
    estoque: vazio(eco.produtos),
    exposto: vazio(eco.produtos),
    doses: vazio(eco.produtos),
    emprestimos: [],
    pedidos: [],
    extrato: [],
    log: [],
    chat: [],
    jogadores: {},
    npcs: [],
    clientes: [],
    atendimentos: [],
    hoje: novoHoje(eco.capitalInicial),
    historico: [],
    ultimoResumo: null,
    anuncioDoDia: null,
  };
  s.hoje.repInicio = s.loja.reputacao;
  return s;
}

export class Sala {
  constructor(estado) {
    this.s = estado;
    this.rng = Math.random;
    this.sujo = true;
    this.ouvinte = () => {}; // (tipo, dados) => void — definido pelo servidor
    this.s.loja.nivel ??= 1; // salas salvas antes da ampliação existir
    this.reconstruirOcupacao();
  }

  static criar(codigo, senha) {
    const sala = new Sala(estadoInicial(codigo, senha));
    sala.registrarLog(null, 'Empresa criada');
    return sala;
  }

  // ------------------------------------------------------------------ utilidades
  id() {
    return this.s.proxId++;
  }
  emitir(tipo, dados) {
    try {
      this.ouvinte(tipo, dados);
    } catch (e) {
      console.error(e);
    }
  }
  quando() {
    return { dia: this.s.tempo.dia, hora: fmtHora(this.s.tempo.minuto) };
  }
  diaSemana(dia = this.s.tempo.dia) {
    return (dia - 1) % 7;
  }
  registrarLog(jogador, acao) {
    const q = this.quando();
    this.s.log.push({ ...q, real: Date.now(), quem: jogador ? jogador.nome : 'Sistema', cargo: jogador ? jogador.cargo : '', acao });
    if (this.s.log.length > 3000) this.s.log.splice(0, this.s.log.length - 3000);
    this.sujo = true;
  }
  movimentar(valor, tipo, descricao, jogador = null) {
    this.s.loja.caixa += valor;
    const q = this.quando();
    this.s.extrato.push({ ...q, tipo, descricao, valor, saldo: this.s.loja.caixa, quem: jogador ? jogador.nome : 'Sistema' });
    if (this.s.extrato.length > 1500) this.s.extrato.splice(0, this.s.extrato.length - 1500);
    this.sujo = true;
  }
  anunciar(texto, tom = 'info') {
    this.emitir('anuncio', { texto, tom });
  }
  jogadoresOnline() {
    return Object.values(this.s.jogadores).filter((j) => j.online);
  }
  contarCargo(cargo, excetoId = null) {
    return this.jogadoresOnline().filter((j) => j.cargo === cargo && j.id !== excetoId).length;
  }
  segPorMinutoJogo() {
    return (this.s.config.diaMinutosReais * 60) / (MIN_FIM - MIN_INICIO);
  }

  // ------------------------------------------------------------------ mapa e móveis
  /** Área interna atual (depende do nível de ampliação). */
  get int() {
    return interiorDoNivel(this.s.loja.nivel);
  }
  /** Parâmetros do nível atual (config/economia.js → ampliacao). */
  nivelAtual() {
    return eco.ampliacao[Math.min(eco.ampliacao.length, this.s.loja.nivel || 1) - 1];
  }
  reconstruirOcupacao() {
    this.ocupacao = new Map();
    for (const m of this.s.moveis) if (m.colocado) this.ocupacao.set(m.y * MAPA.W + m.x, m);
  }
  movelEm(x, y) {
    return this.ocupacao.get(y * MAPA.W + x) || null;
  }
  bloqueado = (x, y) => this.ocupacao.has(y * MAPA.W + x);

  colocados(tipo) {
    return this.s.moveis.filter((m) => m.colocado && m.tipo === tipo);
  }
  /** Cadeiras que podem atender: as que têm um espelho à frente, virado para elas. */
  cadeirasAtivas() {
    return this.colocados('cadeira')
      .sort((a, b) => a.id - b.id)
      .filter((c) => espelhoDaCadeira(c, this.s.moveis));
  }
  temFerramenta(tipo) {
    return this.s.ferramentas[tipo]?.some((u) => u > 0) ?? false;
  }
  valorEquipamentos() {
    let v = 0;
    for (const m of this.s.moveis) v += eco.equipamentos[m.tipo].preco;
    for (const [t, lista] of Object.entries(this.s.ferramentas)) {
      const f = eco.ferramentas[t];
      for (const u of lista) v += Math.round((f.preco * u) / f.usos);
    }
    return v;
  }
  dividaTotal() {
    return this.s.emprestimos.filter((e) => !e.quitado).reduce((t, e) => t + banco.saldoDevedor(e), 0);
  }
  creditoBloqueado() {
    return this.s.emprestimos.some((e) => !e.quitado && e.atrasado);
  }
  limiteCredito() {
    if (this.creditoBloqueado()) return 0;
    return banco.limiteCredito(this.s.loja.caixa, this.valorEquipamentos(), this.dividaTotal(), eco.banco);
  }

  /** Checklist para abrir a loja. */
  requisitosAbertura() {
    return [
      { item: '1 cadeira de barbeiro no mapa', ok: this.colocados('cadeira').length > 0 },
      { item: '1 espelho na frente da cadeira, virado para ela', ok: this.cadeirasAtivas().length > 0 },
      { item: '1 tesoura ou máquina de corte', ok: this.temFerramenta('tesoura') || this.temFerramenta('maquina') },
      { item: '1 balcão/caixa no mapa', ok: this.colocados('balcao').length > 0 },
    ];
  }

  /** O serviço pode ser feito com as ferramentas essenciais disponíveis? */
  podeFazer(servico) {
    const sv = eco.servicos[servico];
    return sv.essenciais.every((grupo) => grupo.some((t) => this.temFerramenta(t)));
  }
  faltaParaServico(servico) {
    const sv = eco.servicos[servico];
    const falta = sv.essenciais.filter((grupo) => !grupo.some((t) => this.temFerramenta(t)));
    return falta.map((g) => g.map((t) => eco.ferramentas[t].nome.toLowerCase()).join(' ou ')).join(', ');
  }

  // --------------------------------------------------------------- tick principal
  /** dtReal em segundos reais. */
  tick(dtReal) {
    const s = this.s;
    if (s.loja.falida || s.config.pausado) return;
    if (s.tempo.fase === 'noite') {
      s.tempo.noiteRestante -= dtReal;
      if (s.tempo.noiteRestante <= 0) this.novoDia();
      return;
    }
    const dt = dtReal * s.config.velocidade;
    const minutos = dt / this.segPorMinutoJogo();
    s.tempo.minuto += minutos;
    if (s.loja.aberta) s.hoje.minutosAberta += minutos;

    this.gerarPassantes(dt);
    this.atualizarNpcs();
    for (const j of Object.values(s.jogadores)) andar(j, dt, eco.clientes.velocidadeJogador);
    for (const n of s.npcs) andar(n, dt, eco.clientes.velocidadeJogador * 0.8);
    this.atualizarClientes(dt);
    this.atualizarAtendimentos(dt);

    if (s.tempo.minuto >= MIN_FIM) this.fecharDia();
  }

  // --------------------------------------------------------------- clientes
  gerarPassantes(dt) {
    const s = this.s;
    const hora = Math.floor(s.tempo.minuto / 60);
    const porHora = eco.demanda.passantesPorHora * (eco.demanda.porHora[hora] ?? 0.5) * eco.demanda.diaSemana[this.diaSemana()] * merc.modDemanda(s.mercado) * (1 + this.nivelAtual().bonusDemanda);
    const porSegundo = porHora / (this.segPorMinutoJogo() * 60);
    if (this.rng() < porSegundo * dt) this.criarPassante();
  }

  criarPassante() {
    const s = this.s;
    if (s.clientes.length > 40) return;
    const daEsquerda = this.rng() < 0.5;
    const x0 = daEsquerda ? 0 : MAPA.W - 1;
    const x1 = daEsquerda ? MAPA.W - 1 : 0;
    let r = this.rng();
    let servico = 'corte';
    for (const [k, v] of Object.entries(eco.servicos)) {
      if (r < v.procura) {
        servico = k;
        break;
      }
      r -= v.procura;
    }
    const c = {
      id: this.id(),
      skin: skinAleatoria(this.rng),
      x: x0 + 0.5,
      y: 11.5,
      dir: daEsquerda ? 0 : 2,
      andando: true,
      caminho: [],
      estado: 'passando',
      servico,
      saidaX: x1,
      decidiu: false,
      timer: 0,
      paciencia: 0,
      pacienciaMax: 0,
      humor: null,
    };
    c.caminho = aEstrela({ x: x0, y: 11 }, { x: MAPA.portaFora.x, y: 11 }, undefined, false, this.int) || [];
    s.clientes.push(c);
  }

  precoServico(servico) {
    return this.s.precos.servicos[servico];
  }
  referenciaServico(servico) {
    return Math.round(eco.servicos[servico].ref * merc.modReferencia(this.s.mercado));
  }

  lugaresDeEspera() {
    const lugares = [];
    for (const sofa of this.colocados('sofa')) {
      for (let i = 0; i < eco.demanda.lugaresPorSofa; i++) lugares.push({ tipo: 'sofa', movelId: sofa.id, idx: i, x: sofa.x, y: sofa.y });
    }
    return lugares;
  }

  /** Escolhe onde um cliente novo vai esperar. null = fila cheia. */
  escolherLugar() {
    const s = this.s;
    const esperando = s.clientes.filter((c) => c.lugar);
    const usados = new Set(esperando.map((c) => (c.lugar.tipo === 'sofa' ? `s${c.lugar.movelId}:${c.lugar.idx}` : `p${c.lugar.x},${c.lugar.y}`)));
    for (const l of this.lugaresDeEspera()) if (!usados.has(`s${l.movelId}:${l.idx}`)) return l;
    const emPe = esperando.filter((c) => c.lugar.tipo === 'pe').length;
    if (emPe >= eco.demanda.lugaresEmPe + this.nivelAtual().lugaresEmPeExtra) return null;
    // tiles livres mais próximos da porta (BFS), sem móveis e sem outro cliente
    const inicio = MAPA.porta;
    const fila = [inicio];
    const visto = new Set([`${inicio.x},${inicio.y}`]);
    while (fila.length) {
      const t = fila.shift();
      const livre = !(t.x === inicio.x && t.y === inicio.y) && !this.bloqueado(t.x, t.y) && !usados.has(`p${t.x},${t.y}`) && !this.ehLugarDeTrabalho(t.x, t.y);
      if (livre) return { tipo: 'pe', x: t.x, y: t.y };
      for (const v of vizinhos(t.x, t.y)) {
        const k = `${v.x},${v.y}`;
        if (visto.has(k) || !noInterior(v.x, v.y, this.int) || this.bloqueado(v.x, v.y)) continue;
        visto.add(k);
        fila.push(v);
      }
    }
    return null;
  }

  /** Tiles na frente de cadeiras e do balcão ficam livres para barbeiros e pagamento. */
  ehLugarDeTrabalho(x, y) {
    for (const m of this.s.moveis) {
      if (!m.colocado || (m.tipo !== 'cadeira' && m.tipo !== 'balcao')) continue;
      if (Math.abs(m.x - x) + Math.abs(m.y - y) === 1) return true;
    }
    return false;
  }

  fatoresEntrada(servico) {
    const s = this.s;
    const d = eco.demanda;
    let conforto = 1;
    if (this.colocados('sofa').length) conforto += d.conforto.sofa;
    if (this.colocados('ar').length) conforto += d.conforto.ar;
    if (this.colocados('tv').length) conforto += d.conforto.tv;
    if (s.tempo.minuto >= d.horaNoite * 60 && this.colocados('luminaria').length) conforto += d.luminariaNoite;
    const rep = 0.5 + (s.loja.reputacao / 100) * d.reputacaoPeso;
    const preco = merc.fatorElasticidade(this.precoServico(servico), this.referenciaServico(servico), eco.elasticidade);
    return { conforto, rep, preco };
  }

  decidirEntrada(c) {
    const s = this.s;
    const f = this.fatoresEntrada(c.servico);
    const desejo = eco.demanda.interesseBase * f.rep * f.conforto * Math.max(1, f.preco);
    if (this.rng() >= desejo) return null; // só passou, não estava interessado
    if (!s.loja.aberta) return 'fechada';
    if (!this.podeFazer(c.servico) || this.cadeirasAtivas().length === 0) return 'falta';
    if (f.preco < 1 && this.rng() >= f.preco) {
      const r = this.precoServico(c.servico) / this.referenciaServico(c.servico);
      if (r > 1 + eco.elasticidade.limiteForte) this.mudarReputacao(-eco.elasticidade.perdaRepAcimaLimite);
      return 'preco';
    }
    const lugar = this.escolherLugar();
    if (!lugar) return 'fila';
    c.lugar = lugar;
    return 'entra';
  }

  mudarReputacao(delta) {
    const l = this.s.loja;
    // ganhos ficam mais difíceis quanto maior a reputação (perdas não)
    if (delta > 0) delta *= Math.max(0.15, 1 - l.reputacao / eco.qualidade.repTeto);
    l.reputacao = Math.max(0, Math.min(100, Math.round((l.reputacao + delta) * 100) / 100));
    this.sujo = true;
  }

  caminhar(ent, destino, permitirFimBloqueado = false) {
    const c = aEstrela({ x: Math.floor(ent.x), y: Math.floor(ent.y) }, destino, this.bloqueado, permitirFimBloqueado, this.int);
    ent.caminho = c || [];
    return !!c;
  }

  irEmbora(c, humor = null) {
    if (c.lugar) c.lugar = null;
    c.estado = 'saindo';
    c.humor = humor;
    c.timer = 0;
    const dentro = noInterior(Math.floor(c.x), Math.floor(c.y), this.int);
    const alvo = { x: c.saidaX, y: 11 };
    if (dentro) {
      const ate = aEstrela({ x: Math.floor(c.x), y: Math.floor(c.y) }, MAPA.portaFora, this.bloqueado, true, this.int) || [];
      const resto = aEstrela(MAPA.portaFora, alvo, undefined, false, this.int) || [];
      c.caminho = [...ate, ...resto];
    } else {
      c.caminho = aEstrela({ x: Math.floor(c.x), y: Math.floor(c.y) }, alvo, undefined, false, this.int) || [];
    }
  }

  atualizarClientes(dt) {
    const s = this.s;
    const vel = eco.clientes.velocidade;
    for (const c of s.clientes) {
      andar(c, dt, vel);
      const parado = c.caminho.length === 0;
      switch (c.estado) {
        case 'passando':
          if (parado && !c.decidiu) {
            c.decidiu = true;
            const r = this.decidirEntrada(c);
            if (r === 'entra') {
              c.estado = 'olhando';
              c.timer = 0.8;
              c.dir = 3;
            } else {
              if (r) {
                s.hoje.perdidos[r] += 1;
                c.balao = { fechada: 'fechado', falta: 'falta', preco: 'caro', fila: 'cheio' }[r];
                c.estado = 'olhando';
                c.timer = 1.2;
                c.dir = 3;
                c.vaiEmbora = true;
                this.sujo = true;
              } else {
                c.caminho = aEstrela({ x: Math.floor(c.x), y: 11 }, { x: c.saidaX, y: 11 }, undefined, false, this.int) || [];
                c.estado = 'saindo';
              }
            }
          }
          break;
        case 'olhando':
          c.timer -= dt;
          if (c.timer <= 0) {
            if (c.vaiEmbora) {
              c.vaiEmbora = false;
              this.irEmbora(c, c.balao === 'caro' || c.balao === 'cheio' ? 'irritado' : null);
            } else if (c.lugar && this.lugarAindaValido(c.lugar)) {
              c.estado = 'entrando';
              const ok = this.caminhar(c, { x: c.lugar.x, y: c.lugar.y }, c.lugar.tipo === 'sofa');
              if (!ok) {
                c.lugar = null;
                s.hoje.perdidos.fila += 1;
                this.irEmbora(c);
              }
            } else {
              c.lugar = this.escolherLugar();
              if (!c.lugar) {
                s.hoje.perdidos.fila += 1;
                this.irEmbora(c);
              }
            }
          }
          break;
        case 'entrando':
          if (parado) {
            c.estado = 'fila';
            let pac = eco.clientes.pacienciaMin + this.rng() * (eco.clientes.pacienciaMax - eco.clientes.pacienciaMin);
            if (c.lugar?.tipo === 'sofa') pac *= 1 + eco.clientes.bonusPacienciaSofa;
            if (this.colocados('tv').length) pac *= 1 + eco.clientes.bonusPacienciaTv;
            c.paciencia = c.pacienciaMax = pac;
            c.dir = 1;
            c.chegouEm = Date.now();
            this.sujo = true;
          }
          break;
        case 'fila':
          c.paciencia -= dt;
          if (c.paciencia <= 0) {
            s.hoje.perdidos.fila += 1;
            this.mudarReputacao(-eco.clientes.perdaRepPaciencia);
            c.balao = 'demora';
            this.irEmbora(c, 'irritado');
            this.emitir('som', { som: 'erro' });
          }
          break;
        case 'pagando':
          if (parado) this.clientePaga(c);
          break;
        case 'saindo':
          if (parado) c.remover = true;
          break;
        default:
          break;
      }
    }
    s.clientes = s.clientes.filter((c) => !c.remover);
  }

  lugarAindaValido(l) {
    if (l.tipo === 'sofa') return this.s.moveis.some((m) => m.id === l.movelId && m.colocado);
    return !this.bloqueado(l.x, l.y);
  }

  // --------------------------------------------------------------- atendimento
  tileDeTrabalho(movel, ocupadosPor = new Set()) {
    // o barbeiro fica ao lado da cadeira; se não der, atrás dela (na frente fica o espelho)
    const r = (((movel.rot ?? 0) % 4) + 4) % 4;
    const lado1 = FRENTE[(r + 1) % 4];
    const lado2 = FRENTE[(r + 3) % 4];
    const tras = FRENTE[(r + 2) % 4];
    const frente = FRENTE[r];
    const lista = [lado1, lado2, tras, frente].map(([dx, dy]) => ({ x: movel.x + dx, y: movel.y + dy }));
    for (const t of lista) {
      if (!noInterior(t.x, t.y, this.int) || this.bloqueado(t.x, t.y)) continue;
      if (ocupadosPor.has(`${t.x},${t.y}`)) continue;
      if (aEstrela(MAPA.porta, t, this.bloqueado, false, this.int) === null && !(t.x === MAPA.porta.x && t.y === MAPA.porta.y)) continue;
      return t;
    }
    return null;
  }

  cadeiraLivre(cadeiraId) {
    return !this.s.atendimentos.some((a) => a.cadeiraId === cadeiraId);
  }

  barbeiroOcupado(id) {
    return this.s.atendimentos.some((a) => a.barbeiroId === id);
  }

  iniciarAtendimento(barbeiro, tipoBarbeiro, cliente, cadeira) {
    const s = this.s;
    const tile = this.tileDeTrabalho(cadeira);
    if (!tile) return 'Não há espaço livre ao lado dessa cadeira';
    const fator = tipoBarbeiro === 'npc' ? eco.npc.fatorVelocidade : 1;
    const a = {
      id: this.id(),
      barbeiroId: barbeiro.id,
      tipo: tipoBarbeiro,
      clienteId: cliente.id,
      cadeiraId: cadeira.id,
      servico: cliente.servico,
      progresso: 0,
      duracao: eco.servicos[cliente.servico].duracao / fator,
      iniciado: false,
    };
    s.atendimentos.push(a);
    cliente.lugar = null;
    cliente.estado = 'indoCadeira';
    cliente.atendimentoId = a.id;
    this.caminhar(cliente, { x: cadeira.x, y: cadeira.y }, true);
    this.caminhar(barbeiro, tile);
    barbeiro.trabalhando = a.id;
    this.sujo = true;
    return null;
  }

  atualizarAtendimentos(dt) {
    const s = this.s;
    for (const a of s.atendimentos) {
      const c = s.clientes.find((x) => x.id === a.clienteId);
      const cadeira = s.moveis.find((m) => m.id === a.cadeiraId);
      const barb = a.tipo === 'npc' ? s.npcs.find((n) => n.id === a.barbeiroId) : s.jogadores[a.barbeiroId];
      if (!c || !cadeira || !cadeira.colocado) {
        a.cancelar = true;
        if (c) this.irEmbora(c);
        continue;
      }
      if (!a.iniciado) {
        const clienteChegou = c.caminho.length === 0;
        const barbChegou = !barb || !barb.online && a.tipo !== 'npc' || barb.caminho.length === 0;
        if (clienteChegou) {
          c.estado = 'naCadeira';
          c.dir = (((cadeira.rot ?? 0) % 4) + 4) % 4; // de frente para o espelho
        }
        if (clienteChegou && barbChegou) {
          a.iniciado = true;
          if (barb) barb.dir = direcaoPara(barb, cadeira);
        }
        continue;
      }
      a.progresso += dt;
      if (a.progresso >= a.duracao) this.concluirAtendimento(a, c, barb);
    }
    s.atendimentos = s.atendimentos.filter((a) => {
      if (a.cancelar || a.concluido) {
        const barb = a.tipo === 'npc' ? s.npcs.find((n) => n.id === a.barbeiroId) : s.jogadores[a.barbeiroId];
        if (barb) barb.trabalhando = null;
        return false;
      }
      return true;
    });
  }

  usarFerramenta(tipo) {
    const lista = this.s.ferramentas[tipo];
    if (!lista) return false;
    const i = lista.findIndex((u) => u > 0);
    if (i < 0) return false;
    lista[i] -= 1;
    if (lista[i] <= 0) {
      lista.splice(i, 1);
      this.anunciar(`${eco.ferramentas[tipo].nome} chegou ao fim da vida útil`, 'aviso');
      this.registrarLog(null, `${eco.ferramentas[tipo].nome} quebrou (durabilidade esgotada)`);
    }
    return true;
  }

  usarInsumo(prod) {
    const s = this.s;
    if (s.doses[prod] > 0) {
      s.doses[prod] -= 1;
      return true;
    }
    if (s.estoque[prod] > 0) {
      s.estoque[prod] -= 1;
      s.doses[prod] = eco.produtos[prod].doses - 1;
      return true;
    }
    return false;
  }

  concluirAtendimento(a, c, barb) {
    const s = this.s;
    const sv = eco.servicos[a.servico];
    const q = eco.qualidade;
    let qualidade = 1;
    const faltou = [];
    for (const grupo of sv.essenciais) {
      const t = grupo.find((x) => this.temFerramenta(x));
      if (t) this.usarFerramenta(t);
      else {
        qualidade -= 0.4;
        faltou.push(grupo.join('/'));
      }
    }
    for (const t of sv.opcionais) {
      if (!this.usarFerramenta(t)) {
        qualidade -= q.perdaPorOpcionalFaltando;
        faltou.push(eco.ferramentas[t].nome.toLowerCase());
      }
    }
    for (const p of sv.insumos) {
      if (!this.usarInsumo(p)) {
        qualidade -= q.perdaPorOpcionalFaltando;
        faltou.push(eco.produtos[p].nome.toLowerCase());
      }
    }
    for (const b of sv.bonus) {
      const ok = eco.ferramentas[b] ? this.usarFerramenta(b) : this.usarInsumo(b);
      if (ok) qualidade += q.bonusPorItemBonus;
    }
    if ((a.servico === 'corte' || a.servico === 'corteBarba') && this.colocados('lavatorio').length && this.usarInsumo('shampoo')) {
      qualidade += q.bonusLavagem;
    }
    if (a.tipo === 'npc') qualidade -= q.penalidadeNpc;
    let rep = qualidade >= 1 ? q.repQualidadeAlta : qualidade >= 0.85 ? q.repQualidadeOk : q.repQualidadeRuim;
    if (this.colocados('esterilizador').length) rep += q.repEsterilizador;
    this.mudarReputacao(rep);
    c.qualidade = qualidade;
    c.humor = qualidade >= 0.85 ? 'feliz' : 'irritado';
    if (faltou.length) c.balao = 'ruim';
    a.concluido = true;
    s.hoje.atendidos += 1;
    // vai pagar no caixa
    c.estado = 'pagando';
    c.precoCobrado = this.precoServico(a.servico);
    const balcao = this.colocados('balcao')[0];
    const tile = balcao ? this.tileDeTrabalho(balcao) : null;
    if (!tile || !this.caminhar(c, tile)) c.caminho = [];
    if (barb && a.tipo === 'jogador') {
      this.registrarLog(barb, `atendeu cliente: ${sv.nome} (${formatarDinheiro(c.precoCobrado)})${faltou.length ? ' — faltou ' + faltou.join(', ') : ''}`);
    }
  }

  clientePaga(c) {
    const s = this.s;
    if (c.pagou) return;
    c.pagou = true;
    const valor = c.precoCobrado ?? 0;
    s.hoje.receitaServicos += valor;
    this.movimentar(valor, 'servico', `${eco.servicos[c.servico].nome} — cliente #${c.id}`);
    this.emitir('som', { som: 'moeda' });
    // compra de produto exposto
    const chance = c.sugerido ? eco.clientes.chanceCompraSugerido : eco.clientes.chanceCompraProduto;
    const disponiveis = Object.keys(s.exposto).filter((p) => s.exposto[p] > 0 && s.precos.produtos[p]);
    if (disponiveis.length && this.rng() < chance) {
      const p = disponiveis[Math.floor(this.rng() * disponiveis.length)];
      const preco = s.precos.produtos[p];
      const fator = Math.min(1, merc.fatorElasticidade(preco, eco.produtos[p].venda, eco.elasticidade));
      if (this.rng() < fator) {
        s.exposto[p] -= 1;
        s.hoje.receitaProdutos += preco;
        s.hoje.produtosVendidos += 1;
        this.movimentar(preco, 'produto', `Venda: ${eco.produtos[p].nome}`);
        c.balao = 'comprou';
      }
    }
    this.irEmbora(c, c.humor);
  }

  // --------------------------------------------------------------- barbeiros NPC
  atualizarNpcs() {
    const s = this.s;
    if (!s.loja.aberta) return;
    for (const n of s.npcs) {
      if (n.trabalhando) continue;
      const cliente = s.clientes
        .filter((c) => c.estado === 'fila' && this.podeFazer(c.servico))
        .sort((a, b) => a.paciencia - b.paciencia)[0];
      if (!cliente) continue;
      const cadeira = this.cadeirasAtivas().find((cd) => this.cadeiraLivre(cd.id));
      if (!cadeira) continue;
      this.iniciarAtendimento(n, 'npc', cliente, cadeira);
    }
  }

  // --------------------------------------------------------------- ciclo do dia
  fecharDia() {
    const s = this.s;
    const h = s.hoje;
    s.tempo.minuto = MIN_FIM;
    // conclui atendimentos em andamento e dispensa os clientes
    for (const a of [...s.atendimentos]) {
      const c = s.clientes.find((x) => x.id === a.clienteId);
      const barb = a.tipo === 'npc' ? s.npcs.find((n) => n.id === a.barbeiroId) : s.jogadores[a.barbeiroId];
      if (c && a.iniciado) {
        this.concluirAtendimento(a, c, barb);
        this.clientePaga(c);
      }
      if (barb) barb.trabalhando = null;
    }
    for (const c of s.clientes) if (c.estado === 'pagando' && !c.pagou) this.clientePaga(c);
    s.atendimentos = [];
    s.clientes = [];

    // custos fixos
    const cf = eco.custosFixos;
    const horasAberta = h.minutosAberta / 60;
    const energia = cf.energiaBase + cf.energiaPorAr * this.colocados('ar').length + Math.round(cf.energiaPorHoraAberta * horasAberta);
    const salarios = cf.salarioNpc * s.npcs.length;
    const aluguel = cf.aluguel + this.nivelAtual().aluguelExtra;
    this.movimentar(-aluguel, 'aluguel', s.loja.nivel > 1 ? `Aluguel do dia (salão nível ${s.loja.nivel})` : 'Aluguel do dia');
    h.custos.aluguel += aluguel;
    this.movimentar(-energia, 'energia', `Energia (${horasAberta.toFixed(1).replace('.', ',')} h aberta)`);
    h.custos.energia += energia;
    if (salarios) {
      this.movimentar(-salarios, 'salario', `Salário de ${s.npcs.length} barbeiro(s) NPC`);
      h.custos.salarios += salarios;
    }

    // vencimentos de empréstimos
    for (const e of s.emprestimos) {
      if (e.quitado) continue;
      if (!e.vencimentoProcessado && s.tempo.dia >= e.diaVencimento) {
        e.vencimentoProcessado = true;
        const antes = { j: e.jurosPagos, en: e.encargosPagos };
        const r = banco.processarVencimento(e, s.loja.caixa, eco.banco);
        if (r.debito > 0) {
          this.movimentar(-r.debito, 'banco', `Débito automático do empréstimo #${e.id}`);
          h.custos.juros += e.jurosPagos - antes.j;
          h.custos.multas += e.encargosPagos - antes.en;
          h.amortizacoes += r.debito - (e.jurosPagos - antes.j) - (e.encargosPagos - antes.en);
        }
        if (r.novoAtraso) {
          this.mudarReputacao(-eco.banco.perdaRepAtraso);
          this.registrarLog(null, `Empréstimo #${e.id} em atraso: multa de ${formatarDinheiro(r.multa)}, crédito bloqueado`);
          this.anunciar(`Empréstimo #${e.id} venceu sem pagamento! Multa de ${formatarDinheiro(r.multa)} e juros de mora de 3% ao dia.`, 'erro');
        } else if (e.quitado) {
          this.registrarLog(null, `Empréstimo #${e.id} quitado por débito automático`);
        }
      }
    }

    // falência
    if (s.loja.caixa < 0) s.loja.diasNegativo += 1;
    else s.loja.diasNegativo = 0;

    const resumo = this.montarResumo();
    s.historico.push(resumo);
    s.ultimoResumo = resumo;
    this.registrarLog(null, `Fim do dia ${s.tempo.dia}: lucro ${formatarDinheiro(resumo.lucro)}, caixa ${formatarDinheiro(resumo.caixa)}`);

    if (s.loja.diasNegativo >= eco.banco.diasNegativoFalencia) {
      s.loja.falida = true;
      s.loja.aberta = false;
      resumo.falencia = true;
      this.registrarLog(null, 'FALÊNCIA: caixa negativo por 3 dias seguidos');
    }
    s.tempo.fase = 'noite';
    s.tempo.noiteRestante = eco.tempo.noiteSegundosReais;
    // todos voltam para dentro da loja durante a noite
    for (const j of Object.values(s.jogadores)) j.caminho = [];
    this.emitir('resumo', resumo);
    this.emitir('salvar');
    this.sujo = true;
  }

  montarResumo() {
    const s = this.s;
    const h = s.hoje;
    const custos = Object.values(h.custos).reduce((a, b) => a + b, 0);
    const faturamento = h.receitaServicos + h.receitaProdutos;
    return {
      dia: s.tempo.dia,
      diaSemana: DIAS_SEMANA[this.diaSemana()],
      faturamento,
      receitaServicos: h.receitaServicos,
      receitaProdutos: h.receitaProdutos,
      receitaUsados: h.receitaUsados,
      custos,
      custosDetalhe: { ...h.custos },
      lucro: faturamento + h.receitaUsados - custos,
      atendidos: h.atendidos,
      produtosVendidos: h.produtosVendidos,
      perdidos: { ...h.perdidos },
      caixa: s.loja.caixa,
      divida: this.dividaTotal(),
      reputacao: Math.round(s.loja.reputacao),
      reputacaoVariacao: Math.round((s.loja.reputacao - (h.repInicio ?? s.loja.reputacao)) * 10) / 10,
      horasAberta: Math.round((h.minutosAberta / 60) * 10) / 10,
      emprestimosRecebidos: h.emprestimosRecebidos,
      amortizacoes: h.amortizacoes,
      diasNegativo: s.loja.diasNegativo,
    };
  }

  novoDia() {
    const s = this.s;
    s.tempo.dia += 1;
    s.tempo.minuto = MIN_INICIO;
    s.tempo.fase = 'dia';
    s.tempo.noiteRestante = 0;
    s.ultimoResumo = null;
    s.hoje = novoHoje(s.loja.caixa);
    // plantas
    const plantas = Math.min(this.colocados('planta').length, eco.qualidade.maxPlantas);
    if (plantas) this.mudarReputacao(plantas * eco.qualidade.repPlantaPorDia);
    s.hoje.repInicio = s.loja.reputacao;
    // mercado
    merc.avancarDiaMercado(s.mercado, this.rng, eco.variacao);
    const ev = merc.sortearEvento(s.mercado, s.tempo.dia, this.rng, eco);
    // juros do dia
    for (const e of s.emprestimos) {
      if (e.quitado) continue;
      banco.acumularDia(e, s.tempo.dia, eco.banco);
    }
    s.pedidos = [];
    const nomeDia = DIAS_SEMANA[this.diaSemana()];
    s.anuncioDoDia = ev ? ev.texto : null;
    this.registrarLog(null, `Começou o dia ${s.tempo.dia} (${nomeDia})${ev ? ' — ' + ev.texto : ''}`);
    this.anunciar(`Dia ${s.tempo.dia} — ${nomeDia}${ev ? ': ' + ev.texto : ''}`, ev ? 'evento' : 'info');
    // jogadores voltam para perto da porta
    for (const j of Object.values(s.jogadores)) {
      j.caminho = [];
      j.trabalhando = null;
    }
    for (const n of s.npcs) {
      n.caminho = [];
      n.trabalhando = null;
    }
    this.sujo = true;
  }

  // --------------------------------------------------------------- jogadores
  posicaoInicial() {
    const livres = [];
    const int = this.int;
    for (let y = int.y0; y <= int.y1; y++)
      for (let x = int.x0; x <= int.x1; x++) if (!this.bloqueado(x, y)) livres.push({ x, y });
    const p = livres.length ? livres[Math.floor(this.rng() * livres.length)] : MAPA.porta;
    return { x: p.x + 0.5, y: p.y + 0.5 };
  }

  vagasPorCargo() {
    const vagas = {};
    for (const [c, info] of Object.entries(eco.sala.cargos)) vagas[c] = { ocupadas: this.contarCargo(c), max: info.max };
    return vagas;
  }

  entrar({ token, nome, skin, cargo }) {
    const s = this.s;
    const existente = token ? Object.values(s.jogadores).find((j) => j.token === token) : null;
    if (existente) {
      if (existente.online) existente.conexoes = (existente.conexoes || 1) + 1;
      if (!existente.online && this.jogadoresOnline().length >= eco.sala.maxJogadores) return { erro: 'Empresa lotada' };
      if (!existente.online && this.contarCargo(existente.cargo) >= eco.sala.cargos[existente.cargo].max) {
        const livre = Object.keys(eco.sala.cargos).find((c) => this.contarCargo(c) < eco.sala.cargos[c].max);
        existente.cargo = livre || 'barbeiro';
      }
      existente.online = true;
      existente.conexoes = existente.conexoes || 1;
      this.registrarLog(existente, 'voltou para a empresa');
      this.sujo = true;
      return { jogador: existente };
    }
    if (this.jogadoresOnline().length >= eco.sala.maxJogadores) return { erro: 'Empresa lotada' };
    const nomeLimpo = limparNome(nome);
    const erroNome = validarNome(nomeLimpo, 2, 16);
    if (erroNome) return { erro: erroNome };
    if (this.jogadoresOnline().some((j) => j.nome.toLowerCase() === nomeLimpo.toLowerCase())) return { erro: 'Já existe alguém com esse nome na empresa' };
    if (!eco.sala.cargos[cargo]) return { erro: 'Cargo inválido' };
    if (this.contarCargo(cargo) >= eco.sala.cargos[cargo].max) return { erro: `Não há vaga de ${eco.sala.cargos[cargo].nome}` };
    const id = 'j' + this.id();
    const pos = this.posicaoInicial();
    const j = {
      id,
      token: novoToken(),
      nome: nomeLimpo,
      skin: validarSkin(skin),
      cargo,
      online: true,
      conexoes: 1,
      x: pos.x,
      y: pos.y,
      dir: 1,
      andando: false,
      caminho: [],
      trabalhando: null,
    };
    s.jogadores[id] = j;
    this.registrarLog(j, `entrou na empresa como ${eco.sala.cargos[cargo].nome}`);
    this.sujo = true;
    return { jogador: j };
  }

  sair(jogadorId) {
    const j = this.s.jogadores[jogadorId];
    if (!j) return;
    j.conexoes = Math.max(0, (j.conexoes || 1) - 1);
    if (j.conexoes > 0) return;
    j.online = false;
    j.caminho = [];
    this.registrarLog(j, 'saiu da empresa');
    if (j.cargo === 'gerente') this.anunciar(`${j.nome} (Gerente) saiu. Outro jogador pode assumir o cargo em Equipe.`, 'aviso');
    this.sujo = true;
  }

  // --------------------------------------------------------------- ações (intenções)
  /** Executa uma intenção de um jogador. Retorna { ok, erro?, ...dados }. */
  acao(jogadorId, tipo, d = {}) {
    const j = this.s.jogadores[jogadorId];
    if (!j || !j.online) return { ok: false, erro: 'Jogador não está na empresa' };
    const fn = ACOES[tipo];
    if (!fn) return { ok: false, erro: 'Ação desconhecida' };
    if (!ACOES_CONSULTA.has(tipo) && !pode(j.cargo, tipo) && !ACOES_LIVRES.has(tipo)) return { ok: false, erro: dicaPermissao(tipo) || 'Sem permissão' };
    if (this.s.loja.falida && !['chat', 'mover', 'trocarCargo'].includes(tipo)) return { ok: false, erro: 'A empresa faliu. O instrutor pode reiniciar a sala.' };
    try {
      const r = fn.call(this, j, d || {});
      if (r && r.erro) return { ok: false, erro: r.erro };
      this.sujo = true;
      return { ok: true, ...(r || {}) };
    } catch (e) {
      console.error('Erro na ação', tipo, e);
      return { ok: false, erro: 'Erro interno' };
    }
  }

  // --------------------------------------------------------------- instrutor
  acaoInstrutor(tipo, d = {}) {
    const s = this.s;
    switch (tipo) {
      case 'pausar':
        s.config.pausado = !!d.pausado;
        this.registrarLog(null, s.config.pausado ? 'Instrutor pausou o jogo' : 'Instrutor retomou o jogo');
        this.anunciar(s.config.pausado ? 'Jogo pausado pelo instrutor' : 'Jogo retomado', 'info');
        break;
      case 'velocidade': {
        const v = Number(d.velocidade);
        if (!eco.tempo.velocidades.includes(v)) return { erro: 'Velocidade inválida' };
        s.config.velocidade = v;
        this.registrarLog(null, `Instrutor mudou a velocidade para ${v}×`);
        break;
      }
      case 'duracaoDia': {
        const m = Math.round(Number(d.minutos));
        if (!(m >= eco.tempo.diaMinutosReaisMin && m <= eco.tempo.diaMinutosReaisMax)) return { erro: `Escolha entre ${eco.tempo.diaMinutosReaisMin} e ${eco.tempo.diaMinutosReaisMax} minutos` };
        s.config.diaMinutosReais = m;
        this.registrarLog(null, `Instrutor definiu 1 dia = ${m} minutos reais`);
        break;
      }
      case 'pularNoite':
        if (s.tempo.fase === 'noite') s.tempo.noiteRestante = 0;
        break;
      case 'reiniciar': {
        const novo = estadoInicial(s.codigo, s.senha);
        novo.config = { ...s.config, pausado: false };
        for (const j of Object.values(s.jogadores)) {
          const p = { ...j, caminho: [], trabalhando: null, x: MAPA.porta.x + 0.5, y: MAPA.porta.y + 0.5 };
          novo.jogadores[j.id] = p;
        }
        novo.proxId = s.proxId;
        this.s = novo;
        this.reconstruirOcupacao();
        this.registrarLog(null, 'Instrutor reiniciou a empresa');
        this.anunciar('A empresa foi reiniciada pelo instrutor', 'aviso');
        this.emitir('reiniciada');
        break;
      }
      default:
        return { erro: 'Ação desconhecida' };
    }
    this.sujo = true;
    return { ok: true };
  }

  // --------------------------------------------------------------- snapshots
  snapshotTick() {
    const s = this.s;
    const ents = [];
    for (const j of Object.values(s.jogadores)) {
      if (!j.online) continue;
      ents.push({ i: j.id, k: 'j', x: r2(j.x), y: r2(j.y), d: j.dir, a: j.andando ? 1 : 0, s: j.skin, n: j.nome, c: j.cargo, t: j.trabalhando ? 1 : 0 });
    }
    for (const n of s.npcs) ents.push({ i: 'n' + n.id, k: 'n', x: r2(n.x), y: r2(n.y), d: n.dir, a: n.andando ? 1 : 0, s: n.skin, n: n.nome, c: 'barbeiro', t: n.trabalhando ? 1 : 0 });
    for (const c of s.clientes) {
      const e = { i: 'c' + c.id, k: 'c', x: r2(c.x), y: r2(c.y), d: c.dir, a: c.andando ? 1 : 0, s: c.skin, e: c.estado, sv: c.servico };
      if (c.estado === 'fila') e.p = Math.round((c.paciencia / c.pacienciaMax) * 100) / 100;
      if (c.lugar?.tipo === 'sofa') e.st = c.lugar.idx + 1;
      if (c.humor) e.h = c.humor;
      if (c.balao) e.b = c.balao;
      if (c.sugerido) e.sg = 1;
      ents.push(e);
    }
    const at = s.atendimentos.map((a) => ({ i: a.id, c: 'c' + a.clienteId, cd: a.cadeiraId, b: a.tipo === 'npc' ? 'n' + a.barbeiroId : a.barbeiroId, p: a.iniciado ? Math.min(1, r2(a.progresso / a.duracao)) : 0, sv: a.servico }));
    return {
      t: Date.now(),
      tempo: { dia: s.tempo.dia, minuto: Math.round(s.tempo.minuto * 10) / 10, fase: s.tempo.fase, noite: Math.ceil(s.tempo.noiteRestante) },
      ents,
      at,
    };
  }

  snapshotEstado() {
    const s = this.s;
    const mercado = {};
    for (const [id, it] of Object.entries(s.mercado.itens)) mercado[id] = { base: it.base, atual: it.atual, ontem: it.ontem, hoje: merc.precoCompraHoje(s.mercado, id), historico: it.historico };
    const emprestimos = s.emprestimos.map((e) => ({ ...e, saldo: banco.saldoDevedor(e), quitacao: banco.simularQuitacao(e, eco.banco) }));
    return {
      codigo: s.codigo,
      config: s.config,
      loja: { ...s.loja, reputacao: Math.round(s.loja.reputacao * 10) / 10 },
      tempo: s.tempo,
      diaSemana: this.diaSemana(),
      precos: s.precos,
      referencias: Object.fromEntries(Object.keys(eco.servicos).map((k) => [k, this.referenciaServico(k)])),
      mercado,
      eventos: s.mercado.eventos,
      moveis: s.moveis,
      ferramentas: s.ferramentas,
      estoque: s.estoque,
      exposto: s.exposto,
      doses: s.doses,
      capacidadeExposicao: this.colocados('prateleira').length * 20,
      emprestimos,
      pedidos: s.pedidos,
      divida: this.dividaTotal(),
      limiteCredito: this.limiteCredito(),
      creditoBloqueado: this.creditoBloqueado(),
      patrimonio: s.loja.caixa + Math.floor(this.valorEquipamentos() / 2),
      valorEquipamentos: this.valorEquipamentos(),
      extrato: s.extrato.slice(-300),
      log: s.log.slice(-200),
      chat: s.chat.slice(-100),
      jogadores: Object.values(s.jogadores).map((j) => ({ id: j.id, nome: j.nome, cargo: j.cargo, online: j.online, skin: j.skin })),
      npcs: s.npcs.map((n) => ({ id: n.id, nome: n.nome })),
      requisitos: this.requisitosAbertura(),
      cadeirasAtivas: this.cadeirasAtivas().map((c) => c.id),
      hoje: s.hoje,
      historico: s.historico.slice(-30),
      ultimoResumo: s.ultimoResumo,
      anuncioDoDia: s.anuncioDoDia,
      vagas: this.vagasPorCargo(),
      gerenteOnline: this.contarCargo('gerente') > 0,
      barbeiroOnline: this.contarCargo('barbeiro') > 0,
    };
  }

  serializar() {
    return JSON.stringify(this.s);
  }
}

// ======================================================================= ações
const ACOES_CONSULTA = new Set(['simularEmprestimo', 'simularQuitacao']);
const ACOES_LIVRES = new Set(['mover', 'chat', 'trocarCargo']);

function quantidade(v, max) {
  const n = Math.floor(Number(v));
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
}

const ACOES = {
  mover(j, d) {
    const x = Math.floor(Number(d.x));
    const y = Math.floor(Number(d.y));
    if (j.trabalhando) return { erro: 'Você está atendendo um cliente' };
    if (!caminhavelBase(x, y, this.int) || this.bloqueado(x, y)) return { erro: 'Não dá para ir aí' };
    if (!this.caminhar(j, { x, y })) return { erro: 'Caminho bloqueado' };
  },

  chat(j, d) {
    const texto = filtrarChat(String(d.texto ?? '').trim());
    if (!texto) return { erro: 'Mensagem vazia' };
    this.s.chat.push({ ...this.quando(), quem: j.nome, cargo: j.cargo, texto, real: Date.now() });
    if (this.s.chat.length > 300) this.s.chat.shift();
    this.emitir('chat', { quem: j.nome, cargo: j.cargo, texto });
  },

  trocarCargo(j, d) {
    const cargo = d.cargo;
    if (!eco.sala.cargos[cargo]) return { erro: 'Cargo inválido' };
    if (cargo === j.cargo) return;
    if (this.contarCargo(cargo, j.id) >= eco.sala.cargos[cargo].max) return { erro: `Não há vaga de ${eco.sala.cargos[cargo].nome}` };
    if (j.trabalhando) return { erro: 'Termine o atendimento antes de trocar de cargo' };
    const antigo = j.cargo;
    j.cargo = cargo;
    this.registrarLog(j, `trocou de cargo: ${eco.sala.cargos[antigo].nome} → ${eco.sala.cargos[cargo].nome}`);
  },

  abrirFechar(j, d) {
    const s = this.s;
    const abrir = d.abrir ?? !s.loja.aberta;
    if (abrir) {
      if (s.tempo.fase === 'noite') return { erro: 'É noite. Espere o próximo dia.' };
      const falta = this.requisitosAbertura().filter((r) => !r.ok);
      if (falta.length) return { erro: 'Falta: ' + falta.map((f) => f.item).join(', ') };
      s.loja.aberta = true;
      this.registrarLog(j, 'abriu a loja');
      this.anunciar(`${s.loja.nome} está ABERTA`, 'sucesso');
    } else {
      s.loja.aberta = false;
      for (const c of s.clientes) if (c.estado === 'fila' || c.estado === 'entrando' || c.estado === 'olhando') this.irEmbora(c);
      this.registrarLog(j, 'fechou a loja');
      this.anunciar(`${s.loja.nome} está FECHADA`, 'aviso');
    }
    this.emitir('som', { som: 'sino' });
  },

  renomearLoja(j, d) {
    const nome = limparNome(d.nome);
    const erro = validarNome(nome, 3, 24);
    if (erro) return { erro };
    const antigo = this.s.loja.nome;
    this.s.loja.nome = nome;
    this.registrarLog(j, `renomeou a loja: "${antigo}" → "${nome}"`);
  },

  definirPreco(j, d) {
    const s = this.s;
    const valor = Math.round(Number(d.valor));
    if (!Number.isInteger(valor) || valor < 100 || valor > 100000) return { erro: 'Preço deve ficar entre ʀ$ 1,00 e ʀ$ 1.000,00' };
    if (d.tipo === 'servico' && s.precos.servicos[d.id] !== undefined) {
      const antes = s.precos.servicos[d.id];
      s.precos.servicos[d.id] = valor;
      this.registrarLog(j, `mudou preço de ${eco.servicos[d.id].nome}: ${formatarDinheiro(antes)} → ${formatarDinheiro(valor)}`);
    } else if (d.tipo === 'produto' && s.precos.produtos[d.id] !== undefined) {
      const antes = s.precos.produtos[d.id];
      s.precos.produtos[d.id] = valor;
      this.registrarLog(j, `mudou preço de venda de ${eco.produtos[d.id].nome}: ${formatarDinheiro(antes)} → ${formatarDinheiro(valor)}`);
    } else return { erro: 'Item inválido' };
  },

  comprar(j, d) {
    const s = this.s;
    const item = String(d.item);
    const cat = eco.equipamentos[item] ? 'equipamento' : eco.ferramentas[item] ? 'ferramenta' : eco.produtos[item] ? 'produto' : null;
    if (!cat) return { erro: 'Item inválido' };
    const qtd = quantidade(d.qtd ?? 1, cat === 'produto' ? 100 : 10);
    if (!qtd) return { erro: 'Quantidade inválida' };
    const unit = merc.precoCompraHoje(s.mercado, item);
    const total = unit * qtd;
    if (total > s.loja.caixa) return { erro: `Caixa insuficiente: precisa de ${formatarDinheiro(total)}` };
    const nome = cat === 'equipamento' ? eco.equipamentos[item].nome : cat === 'ferramenta' ? eco.ferramentas[item].nome : eco.produtos[item].nome;
    if (cat === 'equipamento') {
      for (let i = 0; i < qtd; i++) s.moveis.push({ id: this.id(), tipo: item, x: -1, y: -1, rot: 0, colocado: false });
    } else if (cat === 'ferramenta') {
      for (let i = 0; i < qtd; i++) s.ferramentas[item].push(eco.ferramentas[item].usos);
    } else {
      s.estoque[item] += qtd;
    }
    this.movimentar(-total, 'compra', `Compra: ${qtd}× ${nome}`, j);
    s.hoje.custos.compras += total;
    this.registrarLog(j, `comprou ${qtd}× ${nome} por ${formatarDinheiro(total)} (${formatarDinheiro(unit)} cada)`);
    return { total };
  },

  posicionar(j, d) {
    const s = this.s;
    const m = s.moveis.find((x) => x.id === Number(d.movelId));
    if (!m) return { erro: 'Móvel não encontrado' };
    const x = Math.floor(Number(d.x));
    const y = Math.floor(Number(d.y));
    const rot = ((Math.floor(Number(d.rot ?? m.rot)) % 4) + 4) % 4;
    if (this.emUso(m)) return { erro: 'Esse móvel está em uso agora' };
    if (!noInterior(x, y, this.int)) return { erro: 'Coloque dentro da loja' };
    if (m.tipo === 'cadeira' && !m.colocado) {
      const nv = this.nivelAtual();
      if (this.colocados('cadeira').length >= nv.maxCadeiras) {
        const prox = eco.ampliacao[nv.nivel];
        return { erro: `Este salão comporta ${nv.maxCadeiras} cadeiras.${prox ? ' Amplie a barbearia (Loja → Ampliar) para colocar mais.' : ''}` };
      }
    }
    if (x === MAPA.porta.x && y === MAPA.porta.y) return { erro: 'Não bloqueie a porta' };
    const outro = this.movelEm(x, y);
    if (outro && outro.id !== m.id) return { erro: 'Esse lugar já está ocupado' };
    if (this.temGenteEm(x, y, m)) return { erro: 'Tem alguém parado aí' };
    // testa acessibilidade: todos os móveis precisam continuar acessíveis pela porta
    const antes = { x: m.x, y: m.y, rot: m.rot, colocado: m.colocado };
    Object.assign(m, { x, y, rot, colocado: true });
    this.reconstruirOcupacao();
    if (!this.tudoAcessivel()) {
      Object.assign(m, antes);
      this.reconstruirOcupacao();
      return { erro: 'Assim algum móvel ou parte da loja fica sem passagem' };
    }
    const nome = eco.equipamentos[m.tipo].nome;
    if (antes.colocado && (antes.x !== x || antes.y !== y)) this.registrarLog(j, `moveu ${nome}`);
    else if (!antes.colocado) this.registrarLog(j, `posicionou ${nome}`);
    // clientes com caminho podem precisar recalcular
    for (const c of s.clientes) if (c.caminho.some((t) => this.bloqueado(t.x, t.y) && !(t === c.caminho[c.caminho.length - 1]))) this.recalcularCaminho(c);
  },

  guardar(j, d) {
    const m = this.s.moveis.find((x) => x.id === Number(d.movelId));
    if (!m || !m.colocado) return { erro: 'Móvel não está no mapa' };
    if (this.emUso(m)) return { erro: 'Esse móvel está em uso agora' };
    m.colocado = false;
    m.x = m.y = -1;
    this.reconstruirOcupacao();
    this.registrarLog(j, `guardou ${eco.equipamentos[m.tipo].nome} no depósito`);
  },

  venderUsado(j, d) {
    const s = this.s;
    const fatorVenda = eco.venda.usadoFator;
    if (d.movelId !== undefined) {
      const i = s.moveis.findIndex((x) => x.id === Number(d.movelId));
      if (i < 0) return { erro: 'Móvel não encontrado' };
      const m = s.moveis[i];
      if (this.emUso(m)) return { erro: 'Esse móvel está em uso agora' };
      const valor = Math.round(eco.equipamentos[m.tipo].preco * fatorVenda);
      s.moveis.splice(i, 1);
      this.reconstruirOcupacao();
      this.movimentar(valor, 'usado', `Venda de usado: ${eco.equipamentos[m.tipo].nome}`, j);
      s.hoje.receitaUsados += valor;
      this.registrarLog(j, `vendeu ${eco.equipamentos[m.tipo].nome} usado por ${formatarDinheiro(valor)}`);
      if (s.loja.aberta && this.requisitosAbertura().some((r) => !r.ok)) {
        s.loja.aberta = false;
        this.anunciar('A loja fechou: faltam itens obrigatórios', 'aviso');
      }
      return { valor };
    }
    const tipo = String(d.ferramenta);
    const lista = s.ferramentas[tipo];
    const idx = Math.floor(Number(d.indice ?? 0));
    if (!lista || !(idx >= 0 && idx < lista.length)) return { erro: 'Ferramenta não encontrada' };
    const f = eco.ferramentas[tipo];
    const valor = Math.round(f.preco * fatorVenda * (lista[idx] / f.usos));
    lista.splice(idx, 1);
    this.movimentar(valor, 'usado', `Venda de usado: ${f.nome}`, j);
    s.hoje.receitaUsados += valor;
    this.registrarLog(j, `vendeu ${f.nome} usado(a) por ${formatarDinheiro(valor)}`);
    return { valor };
  },

  expor(j, d) {
    const s = this.s;
    const p = String(d.produto);
    if (!eco.produtos[p]?.venda) return { erro: 'Esse item não é vendido ao cliente' };
    const qtd = quantidade(d.qtd ?? 1, 200);
    if (!qtd) return { erro: 'Quantidade inválida' };
    const cap = this.colocados('prateleira').length * 20;
    if (!cap) return { erro: 'Coloque uma prateleira no mapa primeiro' };
    const usado = Object.values(s.exposto).reduce((a, b) => a + b, 0);
    const n = Math.min(qtd, s.estoque[p], cap - usado);
    if (n <= 0) return { erro: s.estoque[p] <= 0 ? 'Sem estoque desse produto' : 'Prateleiras cheias' };
    s.estoque[p] -= n;
    s.exposto[p] += n;
    this.registrarLog(j, `expôs ${n}× ${eco.produtos[p].nome} na prateleira`);
    return { quantidade: n };
  },

  recolher(j, d) {
    const s = this.s;
    const p = String(d.produto);
    const qtd = quantidade(d.qtd ?? 1, 200);
    if (!eco.produtos[p] || !qtd) return { erro: 'Item inválido' };
    const n = Math.min(qtd, s.exposto[p]);
    if (n <= 0) return { erro: 'Nada exposto desse produto' };
    s.exposto[p] -= n;
    s.estoque[p] += n;
    this.registrarLog(j, `recolheu ${n}× ${eco.produtos[p].nome} da prateleira`);
  },

  atender(j, d) {
    const s = this.s;
    if (!s.loja.aberta) return { erro: 'A loja está fechada' };
    if (j.trabalhando) return { erro: 'Você já está atendendo' };
    const cid = Number(String(d.clienteId).replace('c', ''));
    const c = s.clientes.find((x) => x.id === cid);
    if (!c || c.estado !== 'fila') return { erro: 'Esse cliente não está esperando' };
    let cadeira;
    if (d.cadeiraId === undefined || d.cadeiraId === null) cadeira = this.cadeirasAtivas().find((cd) => this.cadeiraLivre(cd.id));
    else cadeira = s.moveis.find((m) => m.id === Number(d.cadeiraId) && m.tipo === 'cadeira' && m.colocado);
    if (!cadeira) return { erro: 'Nenhuma cadeira livre' };
    if (!this.cadeirasAtivas().some((cd) => cd.id === cadeira.id)) return { erro: 'Essa cadeira não tem espelho (cada cadeira precisa de 1 espelho)' };
    if (!this.cadeiraLivre(cadeira.id)) return { erro: 'Cadeira ocupada' };
    if (!this.podeFazer(c.servico)) return { erro: 'Falta ' + this.faltaParaServico(c.servico) };
    const erro = this.iniciarAtendimento(j, 'jogador', c, cadeira);
    if (erro) return { erro };
  },

  sugerirProduto(j, d) {
    const s = this.s;
    const cid = Number(String(d.clienteId).replace('c', ''));
    const c = s.clientes.find((x) => x.id === cid);
    if (!c || !['indoCadeira', 'naCadeira', 'fila'].includes(c.estado)) return { erro: 'Cliente não disponível' };
    if (!Object.values(s.exposto).some((v) => v > 0)) return { erro: 'Não há produtos na prateleira' };
    c.sugerido = true;
    this.registrarLog(j, `sugeriu um produto ao cliente #${c.id}`);
  },

  simularEmprestimo(j, d) {
    const valor = Math.round(Number(d.valor));
    const prazo = Number(d.prazo);
    if (!eco.banco.prazos.includes(prazo)) return { erro: 'Prazo inválido' };
    if (!(valor >= eco.banco.valorMinimo)) return { erro: `Valor mínimo: ${formatarDinheiro(eco.banco.valorMinimo)}` };
    return { simulacao: banco.simularEmprestimo(valor, prazo, this.s.tempo.dia, eco.banco), limite: this.limiteCredito() };
  },

  simularQuitacao(j, d) {
    const e = this.s.emprestimos.find((x) => x.id === Number(d.emprestimoId));
    if (!e) return { erro: 'Empréstimo não encontrado' };
    return { quitacao: banco.simularQuitacao(e, eco.banco) };
  },

  solicitarEmprestimo(j, d) {
    const s = this.s;
    const valor = Math.round(Number(d.valor));
    const prazo = Number(d.prazo);
    if (!eco.banco.prazos.includes(prazo)) return { erro: 'Prazo inválido' };
    if (!(valor >= eco.banco.valorMinimo)) return { erro: `Valor mínimo: ${formatarDinheiro(eco.banco.valorMinimo)}` };
    if (this.creditoBloqueado()) return { erro: 'Crédito bloqueado: há empréstimo em atraso. Quite primeiro.' };
    if (valor > this.limiteCredito()) return { erro: `Acima do limite de crédito (${formatarDinheiro(this.limiteCredito())})` };
    if (s.tempo.fase === 'noite') return { erro: 'O banco está fechado à noite' };
    const pedido = { id: this.id(), valor, prazo, solicitante: j.nome, dia: s.tempo.dia };
    this.registrarLog(j, `solicitou empréstimo de ${formatarDinheiro(valor)} por ${prazo} dias`);
    if (this.contarCargo('gerente') === 0) {
      this.liberarEmprestimo(pedido, j, true);
      return { aprovadoAutomatico: true };
    }
    s.pedidos.push(pedido);
    this.anunciar(`${j.nome} pediu empréstimo de ${formatarDinheiro(valor)}. O Gerente precisa aprovar no Banco.`, 'info');
  },

  aprovarEmprestimo(j, d) {
    const s = this.s;
    const i = s.pedidos.findIndex((p) => p.id === Number(d.pedidoId));
    if (i < 0) return { erro: 'Pedido não encontrado' };
    const pedido = s.pedidos[i];
    if (this.creditoBloqueado()) return { erro: 'Crédito bloqueado por atraso' };
    if (pedido.valor > this.limiteCredito()) return { erro: 'O limite de crédito mudou e não cobre mais esse valor' };
    s.pedidos.splice(i, 1);
    this.liberarEmprestimo(pedido, j, false);
  },

  recusarEmprestimo(j, d) {
    const s = this.s;
    const i = s.pedidos.findIndex((p) => p.id === Number(d.pedidoId));
    if (i < 0) return { erro: 'Pedido não encontrado' };
    const [p] = s.pedidos.splice(i, 1);
    this.registrarLog(j, `recusou o empréstimo de ${formatarDinheiro(p.valor)} pedido por ${p.solicitante}`);
  },

  pagarEmprestimo(j, d) {
    const s = this.s;
    const e = s.emprestimos.find((x) => x.id === Number(d.emprestimoId));
    if (!e || e.quitado) return { erro: 'Empréstimo não encontrado' };
    const saldo = banco.saldoDevedor(e);
    const valor = d.tudo ? saldo : Math.min(saldo, Math.round(Number(d.valor)));
    if (!(valor > 0)) return { erro: 'Valor inválido' };
    if (valor > s.loja.caixa) return { erro: 'Caixa insuficiente' };
    const economia = d.tudo ? banco.simularQuitacao(e, eco.banco).economia : 0;
    const r = banco.pagar(e, valor);
    this.movimentar(-r.usado, 'banco', `Pagamento do empréstimo #${e.id}`, j);
    s.hoje.custos.juros += r.juros;
    s.hoje.custos.multas += r.encargos;
    s.hoje.amortizacoes += r.principal;
    this.registrarLog(j, `pagou ${formatarDinheiro(r.usado)} do empréstimo #${e.id} (juros ${formatarDinheiro(r.juros + r.encargos)}, principal ${formatarDinheiro(r.principal)})${e.quitado ? ' — QUITADO' : ''}`);
    if (e.quitado && economia > 0) this.anunciar(`Empréstimo #${e.id} quitado antes do prazo: economia de ${formatarDinheiro(economia)} em juros!`, 'sucesso');
    return { pago: r, quitado: e.quitado, economia };
  },

  contratarNpc(j) {
    const s = this.s;
    if (this.contarCargo('barbeiro') > 0) return { erro: 'Só é possível contratar NPC quando não há Barbeiro jogador online' };
    if (s.npcs.length >= Math.max(1, this.cadeirasAtivas().length)) return { erro: 'Já há um barbeiro NPC por cadeira' };
    const pos = this.posicaoInicial();
    const usados = new Set(s.npcs.map((n) => n.nome));
    const nome = NOMES_NPC.find((n) => !usados.has(n)) || 'NPC';
    const n = { id: this.id(), nome, skin: { ...skinAleatoria(this.rng), acessorio: 3 }, x: pos.x, y: pos.y, dir: 1, andando: false, caminho: [], trabalhando: null, online: true };
    s.npcs.push(n);
    this.registrarLog(j, `contratou o barbeiro NPC ${nome} (${formatarDinheiro(eco.custosFixos.salarioNpc)}/dia)`);
  },

  ampliarLoja(j) {
    const s = this.s;
    const prox = eco.ampliacao[s.loja.nivel]; // índice = nível atual → próximo nível
    if (!prox) return { erro: 'A barbearia já está no tamanho máximo' };
    if (s.atendimentos.length) return { erro: 'Espere terminar os atendimentos em andamento (a obra mexe nas paredes)' };
    if (prox.preco > s.loja.caixa) return { erro: `Caixa insuficiente: a ampliação custa ${formatarDinheiro(prox.preco)}` };
    this.movimentar(-prox.preco, 'ampliacao', `Ampliação: ${prox.nome}`, j);
    s.hoje.custos.compras += prox.preco;
    s.loja.nivel = prox.nivel;
    this.reconstruirOcupacao();
    this.registrarLog(j, `ampliou a barbearia para ${prox.nome} por ${formatarDinheiro(prox.preco)} (aluguel +${formatarDinheiro(prox.aluguelExtra)}/dia)`);
    this.anunciar(`Barbearia ampliada: ${prox.nome}! Agora cabem ${prox.maxCadeiras} cadeiras.`, 'sucesso');
    this.emitir('som', { som: 'moeda' });
    this.sujo = true;
    return { nivel: prox.nivel };
  },

  demitirNpc(j, d) {
    const s = this.s;
    const i = s.npcs.findIndex((n) => n.id === Number(d.npcId));
    if (i < 0) return { erro: 'NPC não encontrado' };
    if (s.npcs[i].trabalhando) return { erro: 'Espere terminar o atendimento' };
    const [n] = s.npcs.splice(i, 1);
    this.registrarLog(j, `dispensou o barbeiro NPC ${n.nome}`);
  },
};

// métodos auxiliares usados pelas ações
Object.assign(Sala.prototype, {
  emUso(m) {
    const s = this.s;
    if (m.tipo === 'cadeira' && s.atendimentos.some((a) => a.cadeiraId === m.id)) return true;
    if (m.tipo === 'sofa' && s.clientes.some((c) => c.lugar?.movelId === m.id)) return true;
    return false;
  },
  temGenteEm(x, y) {
    const s = this.s;
    const aqui = (e) => Math.floor(e.x) === x && Math.floor(e.y) === y;
    return s.clientes.some(aqui) || s.npcs.some(aqui) || Object.values(s.jogadores).some((j) => j.online && aqui(j));
  },
  tudoAcessivel() {
    // BFS a partir da porta pelos tiles livres; cada móvel precisa ter um vizinho alcançado
    const inicio = MAPA.porta;
    const visto = new Set([`${inicio.x},${inicio.y}`]);
    const fila = [inicio];
    while (fila.length) {
      const t = fila.shift();
      for (const v of vizinhos(t.x, t.y)) {
        const k = `${v.x},${v.y}`;
        if (visto.has(k) || !noInterior(v.x, v.y, this.int) || this.bloqueado(v.x, v.y) || !passagemLivre(t.x, t.y, v.x, v.y, this.int)) continue;
        visto.add(k);
        fila.push(v);
      }
    }
    for (const m of this.s.moveis) {
      if (!m.colocado || m.tipo === 'espelho') continue; // espelho fica encostado; o barbeiro usa pelo lado da cadeira
      if (!vizinhos(m.x, m.y).some((v) => visto.has(`${v.x},${v.y}`))) return false;
    }
    return true;
  },
  recalcularCaminho(c) {
    const fim = c.caminho[c.caminho.length - 1];
    if (!fim) return;
    this.caminhar(c, fim, true);
  },
  liberarEmprestimo(pedido, aprovador, automatico) {
    const s = this.s;
    const e = banco.criarEmprestimo({ id: this.id(), principal: pedido.valor, prazo: pedido.prazo, diaAtual: s.tempo.dia, cfg: eco.banco, solicitante: pedido.solicitante, aprovador: aprovador.nome });
    s.emprestimos.push(e);
    this.movimentar(pedido.valor, 'emprestimo', `Empréstimo #${e.id} recebido (${pedido.prazo} dias)`, aprovador);
    s.hoje.emprestimosRecebidos += pedido.valor;
    this.registrarLog(aprovador, `${automatico ? 'aprovou sozinho (sem Gerente online)' : 'aprovou'} empréstimo #${e.id} de ${formatarDinheiro(pedido.valor)} por ${pedido.prazo} dias — vence no fim do dia ${e.diaVencimento}`);
    this.anunciar(`Empréstimo de ${formatarDinheiro(pedido.valor)} liberado. Vence no fim do dia ${e.diaVencimento}.`, 'sucesso');
  },
});

// ======================================================================= helpers
function r2(v) {
  return Math.round(v * 100) / 100;
}

function novoToken() {
  return Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
}

function direcaoPara(ent, alvo) {
  const dx = alvo.x + 0.5 - ent.x;
  const dy = alvo.y + 0.5 - ent.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 0 : 2;
  return dy >= 0 ? 1 : 3;
}

/** Move a entidade pelo caminho. dir: 0 = +x, 1 = +y, 2 = −x, 3 = −y */
export function andar(ent, dt, vel) {
  ent.andando = false;
  if (!ent.caminho || !ent.caminho.length) return;
  let dist = vel * dt;
  while (dist > 0 && ent.caminho.length) {
    const alvo = ent.caminho[0];
    const tx = alvo.x + 0.5;
    const ty = alvo.y + 0.5;
    const dx = tx - ent.x;
    const dy = ty - ent.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.001) ent.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3;
    if (d <= dist) {
      ent.x = tx;
      ent.y = ty;
      dist -= d;
      ent.caminho.shift();
    } else {
      ent.x += (dx / d) * dist;
      ent.y += (dy / d) * dist;
      dist = 0;
    }
    ent.andando = true;
  }
}
