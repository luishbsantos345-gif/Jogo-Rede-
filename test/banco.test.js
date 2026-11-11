import { test } from 'node:test';
import assert from 'node:assert/strict';
import eco from '../config/economia.js';
import * as banco from '../server/banco.js';

const cfg = { ...eco.banco, jurosDiarioBp: 150, multaAtrasoBp: 1000, moraDiariaBp: 300 };

function novo(principal = 100000, prazo = 7, dia = 1) {
  return banco.criarEmprestimo({ id: 1, principal, prazo, diaAtual: dia, cfg, solicitante: 'A', aprovador: 'B' });
}

test('simulação: ʀ$ 1.000,00 por 7 dias → juros ʀ$ 105,00, total ʀ$ 1.105,00', () => {
  const s = banco.simularEmprestimo(100000, 7, 1, cfg);
  assert.equal(s.jurosTotais, 10500);
  assert.equal(s.total, 110500);
  assert.equal(s.jurosPorDia, 1500);
  assert.equal(s.diaVencimento, 7);
});

test('juros simples: acumulam sobre o principal, não sobre juros', () => {
  const e = novo();
  for (let d = 2; d <= 7; d++) banco.acumularDia(e, d, cfg);
  assert.equal(e.jurosDevidos, 10500);
  assert.equal(banco.saldoDevedor(e), 110500);
  // depois do vencimento não acumula juros normais
  banco.acumularDia(e, 8, cfg);
  assert.equal(e.jurosDevidos, 10500);
});

test('quitação antecipada: pego no dia 1, quitado no dia 3 → exatamente ʀ$ 45,00 de juros', () => {
  const e = novo(100000, 7, 1);
  banco.acumularDia(e, 2, cfg);
  banco.acumularDia(e, 3, cfg);
  const q = banco.simularQuitacao(e, cfg);
  assert.equal(q.devido, 104500);
  assert.equal(q.jurosAteAgora, 4500);
  assert.equal(q.economia, 6000); // 105,00 − 45,00
  const r = banco.pagar(e, q.devido);
  assert.equal(r.juros, 4500);
  assert.equal(r.principal, 100000);
  assert.equal(e.quitado, true);
  assert.equal(e.jurosPagos, 4500);
});

test('quitação no mesmo dia cobra o mínimo de 1 dia', () => {
  const e = novo(100000, 14, 5);
  assert.equal(banco.saldoDevedor(e), 101500);
});

test('pagamento parcial abate juros primeiro, depois principal', () => {
  const e = novo(100000, 7, 1);
  banco.acumularDia(e, 2, cfg); // juros devidos = 30,00
  const r = banco.pagar(e, 5000); // paga ʀ$ 50,00
  assert.equal(r.juros, 3000);
  assert.equal(r.principal, 2000);
  assert.equal(e.principalRestante, 98000);
  // juros seguintes são sobre o principal restante
  banco.acumularDia(e, 3, cfg);
  assert.equal(e.jurosDevidos, 1470);
});

test('atraso: banco debita o caixa, aplica multa de 10% e mora de 3% ao dia', () => {
  const e = novo(100000, 3, 1);
  banco.acumularDia(e, 2, cfg);
  banco.acumularDia(e, 3, cfg); // saldo 1.045,00 no vencimento (fim do dia 3)
  const r = banco.processarVencimento(e, 40000, cfg); // só há ʀ$ 400,00 no caixa
  assert.equal(r.debito, 40000);
  // pagou 45,00 de juros e 355,00 de principal; resta 645,00
  assert.equal(e.principalRestante, 64500);
  assert.equal(r.multa, 6450);
  assert.equal(r.novoAtraso, true);
  assert.equal(e.atrasado, true);
  assert.equal(banco.saldoDevedor(e), 70950);
  const m = banco.acumularDia(e, 4, cfg);
  assert.equal(m.mora, Math.round(70950 * 0.03));
  assert.equal(banco.saldoDevedor(e), 70950 + 2129);
  // multa não é aplicada duas vezes
  const r2 = banco.processarVencimento(e, 0, cfg);
  assert.equal(r2.multa, 0);
});

test('vencimento com caixa suficiente quita sem multa', () => {
  const e = novo(50000, 3, 1);
  banco.acumularDia(e, 2, cfg);
  banco.acumularDia(e, 3, cfg);
  const r = banco.processarVencimento(e, 999999, cfg);
  assert.equal(r.debito, 52250);
  assert.equal(r.multa, 0);
  assert.equal(e.quitado, true);
});

test('caixa negativo não é debitado', () => {
  const e = novo(50000, 3, 1);
  const r = banco.processarVencimento(e, -10000, cfg);
  assert.equal(r.debito, 0);
  assert.equal(e.atrasado, true);
});

test('limite de crédito: 2× patrimônio − dívidas, piso de ʀ$ 500,00', () => {
  assert.equal(banco.limiteCredito(300000, 0, 0, cfg), 600000);
  assert.equal(banco.limiteCredito(100000, 200000, 0, cfg), 400000); // 2 × (1000 + 1000)
  assert.equal(banco.limiteCredito(100000, 0, 150000, cfg), 50000);
  assert.equal(banco.limiteCredito(0, 0, 0, cfg), 50000);
  assert.equal(banco.limiteCredito(0, 0, 80000, cfg), 0);
});

test('todos os valores do banco são inteiros', () => {
  const e = novo(123457, 21, 1);
  for (let d = 2; d <= 25; d++) {
    if (d === 22) banco.processarVencimento(e, 1001, cfg);
    banco.acumularDia(e, d, cfg);
    banco.pagar(e, 777);
    for (const v of [e.principalRestante, e.jurosDevidos, e.encargosDevidos, e.jurosPagos]) assert.ok(Number.isInteger(v));
  }
});
