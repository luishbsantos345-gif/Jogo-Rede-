// Exportação CSV no formato que o Excel/LibreOffice em português abre direto:
// separador ";" e BOM UTF-8. Valores de dinheiro como "35,50".
import { formatarDinheiro } from '../shared/dinheiro.js';

function cel(v) {
  const t = String(v ?? '');
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

function montar(cabecalho, linhas) {
  return '﻿' + [cabecalho, ...linhas].map((l) => l.map(cel).join(';')).join('\r\n') + '\r\n';
}

const NOMES_CARGO = { gerente: 'Gerente', financeiro: 'Financeiro', compras: 'Compras/Estoque', barbeiro: 'Barbeiro' };
const din = (v) => formatarDinheiro(v, { simbolo: false });

export function csvLog(estado) {
  return montar(
    ['Dia', 'Hora do jogo', 'Data/hora real', 'Jogador', 'Cargo', 'Ação'],
    estado.log.map((l) => [l.dia, l.hora, new Date(l.real).toLocaleString('pt-BR'), l.quem, NOMES_CARGO[l.cargo] || '', l.acao]),
  );
}

export function csvResumo(estado) {
  return montar(
    ['Dia', 'Dia da semana', 'Faturamento serviços', 'Faturamento produtos', 'Venda de usados', 'Compras', 'Aluguel', 'Energia', 'Salários NPC', 'Juros', 'Multas/mora', 'Custos totais', 'Lucro do dia', 'Clientes atendidos', 'Produtos vendidos', 'Perdidos: fila/espera', 'Perdidos: preço alto', 'Perdidos: falta de item', 'Perdidos: loja fechada', 'Horas aberta', 'Empréstimos recebidos', 'Caixa no fim do dia', 'Dívida', 'Reputação'],
    estado.historico.map((r) => [
      r.dia, r.diaSemana, din(r.receitaServicos), din(r.receitaProdutos), din(r.receitaUsados),
      din(r.custosDetalhe.compras), din(r.custosDetalhe.aluguel), din(r.custosDetalhe.energia), din(r.custosDetalhe.salarios), din(r.custosDetalhe.juros), din(r.custosDetalhe.multas),
      din(r.custos), din(r.lucro), r.atendidos, r.produtosVendidos, r.perdidos.fila, r.perdidos.preco, r.perdidos.falta, r.perdidos.fechada,
      String(r.horasAberta).replace('.', ','), din(r.emprestimosRecebidos), din(r.caixa), din(r.divida), r.reputacao,
    ]),
  );
}

export function csvExtrato(estado) {
  return montar(
    ['Dia', 'Hora', 'Tipo', 'Descrição', 'Valor', 'Saldo', 'Quem'],
    estado.extrato.map((e) => [e.dia, e.hora, e.tipo, e.descricao, din(e.valor), din(e.saldo), e.quem]),
  );
}
