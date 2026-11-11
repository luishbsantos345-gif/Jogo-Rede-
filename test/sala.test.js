import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sala } from '../server/sala.js';

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
