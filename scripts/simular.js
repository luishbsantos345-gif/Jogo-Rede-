// Simulador de balanceamento: joga vários dias com "robôs" e mostra o resultado.
// Uso: npm run simular            (estratégias razoável, 1 barbeiro e descuidada)
//      node scripts/simular.js 10 (número de dias)
import { Sala } from '../server/sala.js';
import { formatarDinheiro as f } from '../shared/dinheiro.js';

const DIAS = Number(process.argv[2]) || 7;

function rngSemente(s) {
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function montar(sala, c, itens, posicoes) {
  for (const [item, qtd] of itens) {
    const r = sala.acao(c.id, 'comprar', { item, qtd });
    if (!r.ok) console.log('  (não comprou', item, '-', r.erro + ')');
  }
  const usados = {};
  for (const m of sala.s.moveis) {
    if (m.colocado) continue;
    const lista = posicoes[m.tipo] || [];
    const i = (usados[m.tipo] = (usados[m.tipo] || 0) + 1) - 1;
    if (!lista[i]) continue;
    // se alguém estiver parado no lugar, tenta os vizinhos
    for (const [dx, dy] of [[0, 0], [0, 1], [1, 0], [-1, 0], [0, -1], [1, 1]]) {
      if (sala.acao(c.id, 'posicionar', { movelId: m.id, x: lista[i][0] + dx, y: lista[i][1] + dy, rot: 0 }).ok) break;
    }
  }
}

const POS = {
  cadeira: [[5, 4], [8, 4], [11, 4]],
  espelho: [[5, 3], [8, 3], [11, 3]],
  balcao: [[11, 8]],
  sofa: [[4, 8], [4, 6]],
  prateleira: [[12, 6]],
  planta: [[12, 2], [3, 2]],
  lavatorio: [[10, 6]],
  ar: [[3, 4]],
  tv: [[3, 6]],
  esterilizador: [[6, 6]],
  luminaria: [[9, 9]],
};

function estrategia(nome, semente, cfg) {
  const sala = Sala.criar('SIMUL', { hash: 'x', salt: 'y' });
  sala.rng = rngSemente(semente);
  const g = sala.entrar({ nome: 'Gerente', skin: {}, cargo: 'gerente' }).jogador;
  const c = sala.entrar({ nome: 'Compras', skin: {}, cargo: 'compras' }).jogador;
  const fin = sala.entrar({ nome: 'Financeiro', skin: {}, cargo: 'financeiro' }).jogador;
  const barbeiros = Array.from({ length: cfg.barbeiros }, (_, i) => sala.entrar({ nome: 'Barb ' + i, skin: {}, cargo: 'barbeiro' }).jogador);
  if (cfg.emprestimo) {
    sala.acao(fin.id, 'solicitarEmprestimo', cfg.emprestimo);
    sala.acao(g.id, 'aprovarEmprestimo', { pedidoId: sala.s.pedidos[0]?.id });
  }
  montar(sala, c, cfg.compras, POS);
  for (let i = 0; i < (cfg.npcs || 0); i++) sala.acao(g.id, 'contratarNpc', {});
  for (const [tipo, id, fator] of cfg.precos || []) {
    const base = tipo === 'servico' ? sala.s.precos.servicos[id] : sala.s.precos.produtos[id];
    sala.acao(g.id, 'definirPreco', { tipo, id, valor: Math.round(base * fator) });
  }
  const linhas = [];
  let reacao = 0;
  for (let dia = 1; dia <= DIAS && !sala.s.loja.falida; dia++) {
    if (!sala.s.loja.aberta) {
      const r = sala.acao(g.id, 'abrirFechar', { abrir: true });
      if (!r.ok && dia === 1) console.log('  não abriu:', r.erro);
    }
    if (cfg.manutencao) cfg.manutencao(sala, c, fin);
    while (sala.s.tempo.fase === 'dia') {
      sala.tick(0.25);
      reacao -= 0.25;
      if (reacao <= 0) {
        reacao = cfg.reacao; // segundos que um aluno leva para reagir
        for (const b of barbeiros) {
          if (b.trabalhando) continue;
          const cl = sala.s.clientes.filter((x) => x.estado === 'fila').sort((a, z) => a.paciencia - z.paciencia)[0];
          if (cl) sala.acao(b.id, 'atender', { clienteId: cl.id });
        }
      }
    }
    const r = sala.s.ultimoResumo;
    linhas.push(r);
    sala.tick(31); // noite
  }
  let acumulado = 0;
  console.log(`\n=== ${nome} (semente ${semente}) ===`);
  console.log('Dia  Fatur.        Custos        Lucro         Acumulado     Caixa         Atend Perd  Rep');
  for (const r of linhas) {
    acumulado += r.lucro;
    const p = r.perdidos.fila + r.perdidos.preco + r.perdidos.falta + r.perdidos.fechada;
    console.log(`${String(r.dia).padEnd(4)} ${f(r.faturamento).padEnd(13)} ${f(r.custos).padEnd(13)} ${f(r.lucro).padEnd(13)} ${f(acumulado).padEnd(13)} ${f(r.caixa).padEnd(13)} ${String(r.atendidos).padEnd(5)} ${String(p).padEnd(5)} ${r.reputacao}${r.falencia ? '  FALÊNCIA' : ''}`);
  }
  return { linhas, sala };
}

function reabastecer(sala, c) {
  for (const t of ['tesoura', 'navalha', 'borrifador', 'capa', 'toalhas']) {
    const usos = sala.s.ferramentas[t].reduce((a, b) => a + b, 0);
    if (usos < 30) sala.acao(c.id, 'comprar', { item: t, qtd: 1 });
  }
  if (sala.s.estoque.laminas < 2) sala.acao(c.id, 'comprar', { item: 'laminas', qtd: 3 });
  if (sala.s.estoque.shampoo < 2 && sala.colocados('lavatorio').length) sala.acao(c.id, 'comprar', { item: 'shampoo', qtd: 3 });
  for (const p of ['pomada', 'oleo']) {
    if (sala.s.exposto[p] + sala.s.estoque[p] < 3) sala.acao(c.id, 'comprar', { item: p, qtd: 4 });
    sala.acao(c.id, 'expor', { produto: p, qtd: 10 });
  }
}

const BASICO = [
  ['cadeira', 1], ['espelho', 1], ['balcao', 1], ['tesoura', 1], ['maquina', 1], ['navalha', 1],
  ['borrifador', 1], ['capa', 1], ['toalhas', 1], ['laminas', 2],
];

for (const semente of [1, 2, 3]) {
  // Razoável: 2 barbeiros, 2 cadeiras, sofá, prateleira, preços de referência
  estrategia('RAZOÁVEL — 2 cadeiras, 2 barbeiros', semente, {
    barbeiros: 2,
    reacao: 3,
    compras: [...BASICO, ['cadeira', 1], ['espelho', 1], ['sofa', 1], ['prateleira', 1], ['pomada', 4], ['oleo', 4]],
    manutencao: (s, c) => reabastecer(s, c),
  });
}
estrategia('RAZOÁVEL — 1 cadeira, 1 barbeiro', 1, {
  barbeiros: 1,
  reacao: 3,
  compras: [...BASICO, ['sofa', 1]],
  manutencao: (s, c) => reabastecer(s, c),
});
estrategia('DESCUIDADA — empréstimo, luxo, 3 NPCs, preços +50%, sem repor', 1, {
  barbeiros: 0,
  reacao: 8,
  npcs: 3,
  emprestimo: { valor: 400000, prazo: 3 },
  compras: [...BASICO, ['ar', 1], ['tv', 1], ['lavatorio', 1], ['esterilizador', 1], ['luminaria', 1], ['sofa', 2], ['cadeira', 2], ['espelho', 2]],
  precos: [['servico', 'corte', 1.5], ['servico', 'barba', 1.5], ['servico', 'corteBarba', 1.5], ['servico', 'sobrancelha', 1.5], ['servico', 'pigmentacao', 1.5]],
});
