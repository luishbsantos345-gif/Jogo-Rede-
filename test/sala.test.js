import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sala } from '../server/sala.js';
import eco from '../config/economia.js';

function salaCom(...cargos) {
  const sala = Sala.criar('TESTE', { hash: 'x', salt: 'y' });
  const js = cargos.map((c, i) => sala.entrar({ nome: `Jog ${i}`, skin: {}, cargo: c }).jogador);
  return { sala, js };
}

function passarDia(sala) {
  // avança até o fim do dia e a noite inteira
  for (let i = 0; i < 200000 && sala.s.tempo.fase === 'dia'; i++) sala.tick(0.5);
  sala.tick(31);
}

test('permissões: barbeiro não pode pedir empréstimo nem renomear', () => {
  const { sala, js } = salaCom('barbeiro');
  const [b] = js;
  assert.equal(sala.acao(b.id, 'solicitarEmprestimo', { valor: 100000, prazo: 7 }).ok, false);
  assert.equal(sala.acao(b.id, 'renomearLoja', { nome: 'Outro nome' }).ok, false);
  assert.equal(sala.acao(b.id, 'comprar', { item: 'tesoura', qtd: 1 }).ok, false);
  assert.equal(sala.s.loja.nome, 'Barbearia Nova');
  assert.equal(sala.s.emprestimos.length, 0);
});

test('máximo de 10 jogadores: o 11º recebe "Empresa lotada"', () => {
  const sala = Sala.criar('LOTAD', { hash: 'x', salt: 'y' });
  const cargos = ['gerente', 'financeiro', 'financeiro', 'compras', 'compras', 'barbeiro', 'barbeiro', 'barbeiro', 'barbeiro', 'barbeiro'];
  cargos.forEach((c, i) => assert.ok(sala.entrar({ nome: `Aluno ${i}`, skin: {}, cargo: c }).jogador));
  const r = sala.entrar({ nome: 'Aluno 11', skin: {}, cargo: 'barbeiro' });
  assert.equal(r.erro, 'Empresa lotada');
});

test('vagas por cargo são respeitadas e o cargo de gerente fica livre quando ele sai', () => {
  const { sala, js } = salaCom('gerente');
  assert.match(sala.entrar({ nome: 'Outro', skin: {}, cargo: 'gerente' }).erro, /vaga/);
  sala.sair(js[0].id);
  assert.ok(sala.entrar({ nome: 'Outro', skin: {}, cargo: 'gerente' }).jogador);
});

test('nome com palavrão é recusado', () => {
  const sala = Sala.criar('FILTR', { hash: 'x', salt: 'y' });
  assert.ok(sala.entrar({ nome: 'p0rra', skin: {}, cargo: 'barbeiro' }).erro);
  assert.ok(sala.entrar({ nome: 'X', skin: {}, cargo: 'barbeiro' }).erro);
});

test('empréstimo de ʀ$ 1.000,00 por 7 dias quitado no dia 3 cobra ʀ$ 45,00 de juros (fluxo completo)', () => {
  const { sala, js } = salaCom('financeiro');
  const [f] = js;
  const caixa0 = sala.s.loja.caixa;
  const r = sala.acao(f.id, 'solicitarEmprestimo', { valor: 100000, prazo: 7 });
  assert.ok(r.ok && r.aprovadoAutomatico, 'sem gerente, o financeiro aprova sozinho');
  assert.equal(sala.s.loja.caixa, caixa0 + 100000);
  passarDia(sala);
  passarDia(sala);
  assert.equal(sala.s.tempo.dia, 3);
  const e = sala.s.emprestimos[0];
  const antes = sala.s.loja.caixa;
  const p = sala.acao(f.id, 'pagarEmprestimo', { emprestimoId: e.id, tudo: true });
  assert.ok(p.ok);
  assert.equal(p.pago.juros, 4500);
  assert.equal(antes - sala.s.loja.caixa, 104500);
  assert.equal(p.economia, 6000);
});

test('empréstimo com gerente online precisa de aprovação', () => {
  const { sala, js } = salaCom('gerente', 'financeiro');
  const [g, f] = js;
  sala.acao(f.id, 'solicitarEmprestimo', { valor: 50000, prazo: 3 });
  assert.equal(sala.s.emprestimos.length, 0);
  assert.equal(sala.s.pedidos.length, 1);
  assert.equal(sala.acao(f.id, 'aprovarEmprestimo', { pedidoId: sala.s.pedidos[0].id }).ok, false);
  assert.ok(sala.acao(g.id, 'aprovarEmprestimo', { pedidoId: sala.s.pedidos[0].id }).ok);
  assert.equal(sala.s.emprestimos.length, 1);
});

test('atraso bloqueia crédito e derruba a reputação; 3 dias negativos = falência', () => {
  const { sala, js } = salaCom('financeiro', 'compras');
  const [f, c] = js;
  sala.acao(f.id, 'solicitarEmprestimo', { valor: 500000, prazo: 3 });
  // gasta todo o caixa em equipamentos
  while (sala.acao(c.id, 'comprar', { item: 'ar', qtd: 1 }).ok);
  while (sala.acao(c.id, 'comprar', { item: 'planta', qtd: 1 }).ok);
  while (sala.acao(c.id, 'comprar', { item: 'gel', qtd: 1 }).ok);
  const rep0 = sala.s.loja.reputacao;
  passarDia(sala);
  passarDia(sala);
  passarDia(sala); // vence no fim do dia 3
  const e = sala.s.emprestimos[0];
  assert.equal(e.atrasado, true);
  assert.ok(sala.creditoBloqueado());
  assert.ok(sala.s.loja.reputacao <= rep0 - 5);
  assert.equal(sala.acao(f.id, 'solicitarEmprestimo', { valor: 10000, prazo: 3 }).ok, false);
  assert.equal(sala.s.loja.falida, true, 'caixa negativo por 3 dias seguidos');
});

test('persistência: serializar e recarregar mantém o estado', () => {
  const { sala, js } = salaCom('compras', 'gerente');
  const [c, g] = js;
  sala.acao(c.id, 'comprar', { item: 'cadeira', qtd: 1 });
  sala.acao(g.id, 'renomearLoja', { nome: 'Corte Fino' });
  for (let i = 0; i < 300; i++) sala.tick(0.1);
  const copia = new Sala(JSON.parse(sala.serializar()));
  assert.equal(copia.s.loja.nome, 'Corte Fino');
  assert.equal(copia.s.loja.caixa, sala.s.loja.caixa);
  assert.equal(copia.s.tempo.minuto, sala.s.tempo.minuto);
  assert.equal(copia.s.moveis.length, 1);
  assert.deepEqual(copia.snapshotEstado().mercado, sala.snapshotEstado().mercado);
});

test('não abre sem os itens obrigatórios', () => {
  const { sala, js } = salaCom('gerente');
  const r = sala.acao(js[0].id, 'abrirFechar', { abrir: true });
  assert.equal(r.ok, false);
  assert.match(r.erro, /cadeira/);
});

// ---------------------------------------------------------------- espelho e ampliação
function comprarEColocar(sala, c, tipo, x, y, rot) {
  for (const j of Object.values(sala.s.jogadores)) Object.assign(j, { x: 7.5, y: 10.5, caminho: [] });
  assert.ok(sala.acao(c.id, 'comprar', { item: tipo, qtd: 1 }).ok);
  const m = sala.s.moveis.find((x) => x.tipo === tipo && !x.colocado);
  return { m, r: sala.acao(c.id, 'posicionar', { movelId: m.id, x, y, rot }) };
}

test('cadeira só funciona com o espelho à frente e virado para ela', () => {
  const { sala, js } = salaCom('compras');
  const [c] = js;
  // cadeira em (6,5) virada para −y (rot 3): o espelho precisa estar em (6,4) com o vidro para +y (rot 1)
  const cad = comprarEColocar(sala, c, 'cadeira', 6, 5, 3);
  assert.ok(cad.r.ok);
  const esp = comprarEColocar(sala, c, 'espelho', 6, 4, 0); // lugar certo, virado errado
  assert.ok(esp.r.ok);
  assert.equal(sala.cadeirasAtivas().length, 0);
  assert.equal(sala.requisitosAbertura()[1].ok, false);
  assert.ok(sala.acao(c.id, 'posicionar', { movelId: esp.m.id, x: 7, y: 5, rot: 2 }).ok); // ao lado: não vale
  assert.equal(sala.cadeirasAtivas().length, 0);
  assert.ok(sala.acao(c.id, 'posicionar', { movelId: esp.m.id, x: 6, y: 4, rot: 1 }).ok); // na frente, virado para a cadeira
  assert.deepEqual(sala.cadeirasAtivas().map((x) => x.id), [cad.m.id]);
  assert.equal(sala.requisitosAbertura()[1].ok, true);
  // girar a cadeira desfaz o par
  assert.ok(sala.acao(c.id, 'posicionar', { movelId: cad.m.id, x: 6, y: 5, rot: 0 }).ok);
  assert.equal(sala.cadeirasAtivas().length, 0);
});

test('o cliente senta de frente para o espelho e o barbeiro fica ao lado', () => {
  const { sala } = salaCom('compras');
  const cadeira = { x: 6, y: 5, rot: 3, colocado: true };
  const t = sala.tileDeTrabalho(cadeira);
  assert.ok((t.x === 5 || t.x === 7) && t.y === 5, `barbeiro ao lado, recebeu ${JSON.stringify(t)}`);
});

test('ampliação: só o Gerente, cobra a obra, aumenta a área, o aluguel e o limite de cadeiras', () => {
  const { sala, js } = salaCom('gerente', 'compras', 'barbeiro');
  const [g, c, b] = js;
  sala.s.loja.caixa = 2000000;
  assert.equal(sala.acao(b.id, 'ampliarLoja').ok, false);
  assert.equal(sala.acao(c.id, 'ampliarLoja').ok, false);
  // antes de ampliar, o jardim (x 13..15) não faz parte da loja
  assert.match(comprarEColocar(sala, c, 'planta', 14, 4, 0).r.erro, /dentro da loja/);
  // nível 1: no máximo 3 cadeiras
  for (const x of [4, 6, 8]) assert.ok(comprarEColocar(sala, c, 'cadeira', x, 5, 3).r.ok);
  assert.match(comprarEColocar(sala, c, 'cadeira', 10, 5, 3).r.erro, /comporta 3 cadeiras/);

  const caixa0 = sala.s.loja.caixa;
  const r = sala.acao(g.id, 'ampliarLoja');
  assert.ok(r.ok, r.erro);
  assert.equal(sala.s.loja.nivel, 2);
  assert.equal(sala.s.loja.caixa, caixa0 - eco.ampliacao[1].preco);
  assert.ok(sala.acao(c.id, 'posicionar', { movelId: sala.s.moveis.find((m) => m.tipo === 'planta').id, x: 14, y: 4, rot: 0 }).ok);
  assert.ok(sala.acao(c.id, 'posicionar', { movelId: sala.s.moveis.find((m) => m.tipo === 'cadeira' && !m.colocado).id, x: 10, y: 5, rot: 3 }).ok);

  // aluguel do dia inclui o extra do nível 2
  passarDia(sala);
  const aluguel = sala.s.extrato.filter((e) => e.tipo === 'aluguel').at(-1);
  assert.equal(-aluguel.valor, eco.custosFixos.aluguel + eco.ampliacao[1].aluguelExtra);

  assert.ok(sala.acao(g.id, 'ampliarLoja').ok);
  assert.equal(sala.s.loja.nivel, 3);
  assert.match(sala.acao(g.id, 'ampliarLoja').erro, /tamanho máximo/);
  // persistência mantém o nível
  assert.equal(new Sala(JSON.parse(sala.serializar())).s.loja.nivel, 3);
});

test('ampliação: sem caixa suficiente não faz a obra', () => {
  const { sala, js } = salaCom('gerente');
  sala.s.loja.caixa = eco.ampliacao[1].preco - 1;
  const r = sala.acao(js[0].id, 'ampliarLoja');
  assert.equal(r.ok, false);
  assert.match(r.erro, /Caixa insuficiente/);
  assert.equal(sala.s.loja.nivel, 1);
});
