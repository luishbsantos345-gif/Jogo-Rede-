import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatarDinheiro, dinheiroPorExtenso, lerDinheiro, aplicarBp } from '../shared/dinheiro.js';

test('formatarDinheiro: formato ʀ$ com milhar e 2 casas', () => {
  assert.equal(formatarDinheiro(3550), 'ʀ$ 35,50');
  assert.equal(formatarDinheiro(0), 'ʀ$ 0,00');
  assert.equal(formatarDinheiro(5), 'ʀ$ 0,05');
  assert.equal(formatarDinheiro(300000), 'ʀ$ 3.000,00');
  assert.equal(formatarDinheiro(123456789), 'ʀ$ 1.234.567,89');
  assert.equal(formatarDinheiro(-10550), '-ʀ$ 105,50');
  assert.equal(formatarDinheiro(3550, { simbolo: false }), '35,50');
});

test('formatarDinheiro: nunca mostra mais de 2 casas nem erro de ponto flutuante', () => {
  for (let i = -5000; i <= 500000; i += 37) {
    const t = formatarDinheiro(i);
    assert.match(t, /^-?ʀ\$ \d{1,3}(\.\d{3})*,\d{2}$/);
  }
  // valores não inteiros (nunca deveriam acontecer) são arredondados
  assert.equal(formatarDinheiro(0.1 + 0.2), 'ʀ$ 0,00');
  assert.equal(formatarDinheiro(1234.6), 'ʀ$ 12,35');
});

test('dinheiroPorExtenso', () => {
  assert.equal(dinheiroPorExtenso(3550), '35 redes e 50 cidadãos');
  assert.equal(dinheiroPorExtenso(100), '1 rede');
  assert.equal(dinheiroPorExtenso(1), '1 cidadão');
  assert.equal(dinheiroPorExtenso(101), '1 rede e 1 cidadão');
  assert.equal(dinheiroPorExtenso(0), '0 redes');
  assert.equal(dinheiroPorExtenso(-250), 'menos 2 redes e 50 cidadãos');
});

test('lerDinheiro: aceita formatos brasileiros', () => {
  assert.equal(lerDinheiro('35,50'), 3550);
  assert.equal(lerDinheiro('1.000,00'), 100000);
  assert.equal(lerDinheiro('ʀ$ 12,5'), 1250);
  assert.equal(lerDinheiro('35.5'), 3550);
  assert.equal(lerDinheiro('40'), 4000);
  assert.equal(lerDinheiro('abc'), null);
  assert.equal(lerDinheiro('1,234'), null);
});

test('aplicarBp: percentuais sempre em inteiros', () => {
  assert.equal(aplicarBp(100000, 150), 1500); // 1,5% de ʀ$ 1.000,00
  assert.equal(aplicarBp(33333, 150), 500);
  assert.ok(Number.isInteger(aplicarBp(12345, 333)));
});
