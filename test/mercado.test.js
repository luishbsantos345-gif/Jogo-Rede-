import { test } from 'node:test';
import assert from 'node:assert/strict';
import eco from '../config/economia.js';
import * as merc from '../server/mercado.js';

function rngSemente(s = 42) {
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

test('passeio aleatório: cada passo varia no máximo ±8% e fica entre 70% e 140% do base', () => {
  const cfg = eco.variacao;
  const rng = rngSemente(7);
  for (const base of [700, 1200, 1800, 15000, 80000, 120000]) {
    let atual = base;
    for (let i = 0; i < 5000; i++) {
      const novo = merc.passoPreco(atual, base, rng, cfg);
      assert.ok(Number.isInteger(novo), 'preço inteiro');
      assert.ok(novo >= Math.ceil(base * 0.7) && novo <= Math.floor(base * 1.4), `dentro dos limites: ${novo}`);
      const limitado = novo === Math.ceil(base * 0.7) || novo === Math.floor(base * 1.4);
      if (!limitado) assert.ok(Math.abs(novo / atual - 1) <= 0.08 + 1 / atual, `passo de ${atual} para ${novo}`);
      atual = novo;
    }
  }
});

test('passeio aleatório: extremos do rng respeitam os limites', () => {
  const cfg = eco.variacao;
  assert.equal(merc.passoPreco(10000, 10000, () => 0.9999999, cfg), 10800);
  assert.equal(merc.passoPreco(10000, 10000, () => 0, cfg), 9200);
  assert.equal(merc.passoPreco(13900, 10000, () => 0.9999999, cfg), 14000);
  assert.equal(merc.passoPreco(7100, 10000, () => 0, cfg), 7000);
});

test('mercado: histórico guarda no máximo 7 dias', () => {
  const m = merc.novoMercado(eco);
  const rng = rngSemente(3);
  for (let d = 0; d < 20; d++) merc.avancarDiaMercado(m, rng, eco.variacao);
  for (const it of Object.values(m.itens)) {
    assert.equal(it.historico.length, 7);
    assert.equal(it.historico[6], it.atual);
  }
});

test('eventos: acontecem a cada 2–3 dias', () => {
  const m = merc.novoMercado(eco);
  const rng = rngSemente(11);
  const dias = [];
  for (let d = 2; d < 60; d++) if (merc.sortearEvento(m, d, rng, eco)) dias.push(d);
  for (let i = 1; i < dias.length; i++) assert.ok(dias[i] - dias[i - 1] >= 2 && dias[i] - dias[i - 1] <= 3);
});

test('evento de promoção reduz o preço de compra do item em 25%', () => {
  const m = merc.novoMercado(eco);
  m.eventos.push({ id: 'promo', tipo: 'precoItem', item: 'shampoo', mod: 0.75, diasRestantes: 1 });
  assert.equal(merc.precoCompraHoje(m, 'shampoo'), 1350);
  assert.equal(merc.precoCompraHoje(m, 'gel'), 900);
});

test('elasticidade-preço', () => {
  const cfg = eco.elasticidade;
  assert.equal(merc.fatorElasticidade(3500, 3500, cfg), 1);
  assert.equal(merc.fatorElasticidade(3849, 3500, cfg), 1); // logo abaixo de +10%
  assert.ok(Math.abs(merc.fatorElasticidade(3850, 3500, cfg) - 1) < 1e-9); // +10%
  assert.ok(Math.abs(merc.fatorElasticidade(4375, 3500, cfg) - 0.6) < 1e-9); // +25% → metade do caminho
  assert.ok(Math.abs(merc.fatorElasticidade(4900, 3500, cfg) - 0.2) < 1e-9); // +40%
  assert.ok(Math.abs(merc.fatorElasticidade(7000, 3500, cfg) - 0.2) < 1e-9); // acima de 40%: −80%
  assert.ok(Math.abs(merc.fatorElasticidade(2450, 3500, cfg) - 1.3) < 1e-9); // −30% → +30%
  assert.ok(Math.abs(merc.fatorElasticidade(1000, 3500, cfg) - 1.3) < 1e-9); // bônus limitado a +30%
});
