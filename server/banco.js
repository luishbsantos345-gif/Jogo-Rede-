// Banco: empréstimos com juros simples diários. Funções puras (testáveis).
// Convenção de contagem de dias: o dia em que o empréstimo é feito já conta
// como 1º dia. Um empréstimo de 7 dias feito no dia 1 vence no fim do dia 7.
// Quitar no dia 3 (do jogo, tendo pego no dia 1) = 3 dias de juros.

import { aplicarBp } from '../shared/dinheiro.js';

export function simularEmprestimo(principal, prazo, diaAtual, cfg) {
  const jurosDia = aplicarBp(principal, cfg.jurosDiarioBp);
  const jurosTotais = jurosDia * prazo;
  return {
    recebe: principal,
    jurosPorDia: jurosDia,
    jurosTotais,
    total: principal + jurosTotais,
    diaVencimento: diaAtual + prazo - 1,
    prazo,
  };
}

export function criarEmprestimo({ id, principal, prazo, diaAtual, cfg, solicitante, aprovador }) {
  const e = {
    id,
    principal,
    prazo,
    diaInicio: diaAtual,
    diaVencimento: diaAtual + prazo - 1,
    principalRestante: principal,
    jurosDevidos: 0, // juros já incorridos e ainda não pagos
    encargosDevidos: 0, // multa + mora ainda não pagos
    jurosPagos: 0,
    encargosPagos: 0,
    diasCorridos: 0,
    atrasado: false,
    quitado: false,
    solicitante,
    aprovador,
  };
  acumularDia(e, diaAtual, cfg); // o dia da contratação já conta (mínimo de 1 dia)
  return e;
}

export function saldoDevedor(e) {
  return e.principalRestante + e.jurosDevidos + e.encargosDevidos;
}

/** Chamado uma vez por dia (no dia da contratação e a cada amanhecer). */
export function acumularDia(e, diaAtual, cfg) {
  if (e.quitado) return { juros: 0, mora: 0 };
  if (e.atrasado) {
    const mora = aplicarBp(saldoDevedor(e), cfg.moraDiariaBp);
    e.encargosDevidos += mora;
    return { juros: 0, mora };
  }
  if (diaAtual > e.diaVencimento) return { juros: 0, mora: 0 };
  const juros = aplicarBp(e.principalRestante, cfg.jurosDiarioBp);
  e.jurosDevidos += juros;
  e.diasCorridos += 1;
  return { juros, mora: 0 };
}

/**
 * Paga até `valor`. Abate primeiro encargos (multa/mora), depois juros, depois principal.
 * Retorna quanto foi efetivamente usado em cada parte.
 */
export function pagar(e, valor) {
  let resta = Math.max(0, Math.floor(valor));
  const pEnc = Math.min(resta, e.encargosDevidos);
  e.encargosDevidos -= pEnc;
  e.encargosPagos += pEnc;
  resta -= pEnc;
  const pJur = Math.min(resta, e.jurosDevidos);
  e.jurosDevidos -= pJur;
  e.jurosPagos += pJur;
  resta -= pJur;
  const pPri = Math.min(resta, e.principalRestante);
  e.principalRestante -= pPri;
  resta -= pPri;
  if (saldoDevedor(e) === 0) e.quitado = true;
  return { encargos: pEnc, juros: pJur, principal: pPri, usado: pEnc + pJur + pPri, sobra: resta };
}

/** Quanto custa quitar agora e quanto se economiza em relação a pagar no vencimento. */
export function simularQuitacao(e, cfg) {
  const devido = saldoDevedor(e);
  const jurosContratados = aplicarBp(e.principal, cfg.jurosDiarioBp) * e.prazo;
  const jurosAteAgora = e.jurosPagos + e.jurosDevidos;
  const economia = e.atrasado ? 0 : Math.max(0, jurosContratados - jurosAteAgora);
  return { devido, jurosAteAgora, jurosContratados, economia, diasCorridos: e.diasCorridos };
}

/**
 * Executado no fechamento do dia de vencimento (ou depois, se em atraso).
 * O banco debita o que houver em caixa. Se sobrar saldo, aplica multa uma vez.
 */
export function processarVencimento(e, caixa, cfg) {
  if (e.quitado) return { debito: 0, multa: 0, novoAtraso: false };
  const debito = Math.min(Math.max(0, caixa), saldoDevedor(e));
  pagar(e, debito);
  let multa = 0;
  let novoAtraso = false;
  if (!e.quitado && !e.atrasado) {
    multa = aplicarBp(saldoDevedor(e), cfg.multaAtrasoBp);
    e.encargosDevidos += multa;
    e.atrasado = true;
    novoAtraso = true;
  }
  return { debito, multa, novoAtraso };
}

export function limiteCredito(caixa, valorEquipamentos, dividas, cfg) {
  const patrimonio = caixa + Math.floor(valorEquipamentos / 2);
  const bruto = Math.max(cfg.limiteMinimo, cfg.fatorLimite * patrimonio);
  return Math.max(0, bruto - dividas);
}
