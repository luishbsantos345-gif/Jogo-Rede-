// ============================================================================
//  PARÂMETROS DE BALANCEAMENTO DO JOGO
//  Ajuste aqui sem mexer no resto do código. Reinicie o servidor depois.
//
//  REGRA DE OURO: todo valor de dinheiro está em CIDADÃOS (inteiro).
//  1 rede (ʀ$ 1,00) = 100 cidadãos.  Ex.: 3500 = ʀ$ 35,00
//  Percentuais de banco estão em "pontos-base" (bp): 150 bp = 1,5%.
//  Tempos marcados como "seg" são segundos reais na velocidade 1×.
// ============================================================================

const economia = {
  capitalInicial: 300000, // ʀ$ 3.000,00
  reputacaoInicial: 50, // 0 a 100

  tempo: {
    diaMinutosReaisPadrao: 10, // 1 dia de jogo = 10 minutos reais
    diaMinutosReaisMin: 5,
    diaMinutosReaisMax: 20,
    horaInicio: 7, // relógio começa 07:00
    horaFim: 21, // às 21:00 o dia acaba
    noiteSegundosReais: 30, // duração da noite (resumo do dia); não acelera
    tickHz: 10, // ticks do servidor por segundo
    salvarACadaSegundos: 30,
    velocidades: [1, 2, 4],
  },

  sala: {
    maxJogadores: 10,
    cargos: {
      gerente: { nome: 'Gerente', min: 0, max: 1, icone: 'G' },
      financeiro: { nome: 'Financeiro', min: 0, max: 2, icone: 'F' },
      compras: { nome: 'Compras/Estoque', min: 0, max: 2, icone: 'C' },
      barbeiro: { nome: 'Barbeiro', min: 0, max: 6, icone: 'B' },
    },
  },

  // 7.1 Equipamentos e móveis (ocupam 1 tile no mapa)
  equipamentos: {
    cadeira: { nome: 'Cadeira de barbeiro', preco: 80000, funcao: '1 atendimento simultâneo' },
    espelho: { nome: 'Espelho de bancada', preco: 15000, funcao: 'Obrigatório por cadeira' },
    lavatorio: { nome: 'Lavatório', preco: 60000, funcao: 'Habilita lavagem (+qualidade, gasta shampoo)' },
    balcao: { nome: 'Balcão/caixa', preco: 35000, funcao: 'Obrigatório para abrir' },
    prateleira: { nome: 'Prateleira de produtos', preco: 20000, funcao: 'Expõe até 20 unidades' },
    sofa: { nome: 'Sofá de espera', preco: 30000, funcao: '2 lugares, +paciência' },
    ar: { nome: 'Ar-condicionado', preco: 120000, funcao: '+chance de entrada, +conta de luz' },
    tv: { nome: 'TV', preco: 45000, funcao: '+paciência' },
    esterilizador: { nome: 'Esterilizador', preco: 25000, funcao: '+reputação por atendimento' },
    luminaria: { nome: 'Luminária/letreiro', preco: 18000, funcao: '+chance de entrada à noite' },
    planta: { nome: 'Planta decorativa', preco: 6000, funcao: '+reputação pequena por dia' },
  },

  // 7.2 Ferramentas (inventário, durabilidade em usos)
  ferramentas: {
    tesoura: { nome: 'Tesoura', preco: 6000, usos: 150 },
    maquina: { nome: 'Máquina de corte', preco: 18000, usos: 300 },
    navalha: { nome: 'Navalha', preco: 4000, usos: 200 },
    borrifador: { nome: 'Borrifador', preco: 1200, usos: 100 },
    pentes: { nome: 'Kit de pentes', preco: 1500, usos: 120 },
    secador: { nome: 'Secador', preco: 12000, usos: 250 },
    capa: { nome: 'Capa de corte', preco: 2500, usos: 80 },
    toalhas: { nome: 'Pacote de toalhas (10)', preco: 3000, usos: 60 },
  },

  // 7.3 Insumos e produtos (compra / venda sugerida). venda null = só insumo.
  // doses: quantas utilizações em serviço cada unidade rende.
  produtos: {
    shampoo: { nome: 'Shampoo', compra: 1800, venda: 3500, doses: 10 },
    condicionador: { nome: 'Condicionador', compra: 2000, venda: 3800, doses: 10 },
    pomada: { nome: 'Pomada modeladora', compra: 1500, venda: 3200, doses: 15 },
    oleo: { nome: 'Óleo para barba', compra: 2200, venda: 4500, doses: 15 },
    gel: { nome: 'Gel fixador', compra: 900, venda: 2000, doses: 15 },
    locao: { nome: 'Loção pós-barba', compra: 1600, venda: 3000, doses: 15 },
    laminas: { nome: 'Pacote de lâminas (10)', compra: 1200, venda: null, doses: 10 },
    talco: { nome: 'Talco', compra: 700, venda: null, doses: 20 },
  },

  // 7.4 Serviços. ref = preço de referência do mercado. duracao em seg.
  // essenciais: precisa de PELO MENOS UMA ferramenta de cada grupo, senão não faz.
  // opcionais: ferramentas/insumos que, se faltarem, baixam a qualidade.
  servicos: {
    corte: {
      nome: 'Corte', ref: 3500, duracao: 25, procura: 0.45,
      essenciais: [['tesoura', 'maquina']],
      opcionais: ['borrifador', 'capa'], insumos: [], bonus: ['pentes', 'secador', 'talco'],
    },
    barba: {
      nome: 'Barba', ref: 2500, duracao: 20, procura: 0.15,
      essenciais: [['navalha']],
      opcionais: ['toalhas'], insumos: ['laminas'], bonus: ['locao'],
    },
    corteBarba: {
      nome: 'Corte + barba', ref: 5500, duracao: 40, procura: 0.2,
      essenciais: [['tesoura', 'maquina'], ['navalha']],
      opcionais: ['borrifador', 'capa', 'toalhas'], insumos: ['laminas'], bonus: ['pentes', 'secador', 'talco', 'locao'],
    },
    sobrancelha: {
      nome: 'Sobrancelha', ref: 1500, duracao: 10, procura: 0.1,
      essenciais: [['navalha']], opcionais: [], insumos: [], bonus: [],
    },
    pigmentacao: {
      nome: 'Pigmentação', ref: 4000, duracao: 30, procura: 0.1,
      essenciais: [['maquina']], opcionais: ['toalhas'], insumos: [], bonus: [],
    },
  },

  qualidade: {
    perdaPorOpcionalFaltando: 0.15,
    bonusLavagem: 0.1, // corte com lavatório + shampoo
    bonusPorItemBonus: 0.03,
    penalidadeNpc: 0.1,
    repQualidadeAlta: 0.35, // qualidade >= 1.0
    repQualidadeOk: 0.1, // qualidade >= 0.85
    repQualidadeRuim: -0.8, // abaixo disso (ex.: faltou borrifador E capa)
    repEsterilizador: 0.1, // por atendimento, se houver esterilizador
    repTeto: 125, // ganhos de reputação são multiplicados por (1 − rep/125): subir fica mais difícil
    repPlantaPorDia: 0.5, // por planta, máx. 3 plantas
    maxPlantas: 3,
  },

  // 7.5 Custos fixos diários (cobrados no fechamento do dia, mesmo fechado)
  custosFixos: {
    aluguel: 8000,
    energiaBase: 1500,
    energiaPorAr: 1000,
    energiaPorHoraAberta: 300,
    salarioNpc: 9000,
  },

  // Ampliação da barbearia (o Gerente compra, um nível por vez). Índice 0 = nível 1 (inicial).
  // A área de cada nível fica em shared/mapa.js (NIVEIS_INTERIOR).
  ampliacao: [
    { nivel: 1, nome: 'Salão original (10×8)', preco: 0, aluguelExtra: 0, maxCadeiras: 3, lugaresEmPeExtra: 0, bonusDemanda: 0 },
    { nivel: 2, nome: 'Anexo lateral (13×8)', preco: 200000, aluguelExtra: 2500, maxCadeiras: 5, lugaresEmPeExtra: 2, bonusDemanda: 0.1 },
    { nivel: 3, nome: 'Salão dos fundos (13×10)', preco: 350000, aluguelExtra: 4000, maxCadeiras: 7, lugaresEmPeExtra: 4, bonusDemanda: 0.2 },
  ],

  npc: {
    fatorVelocidade: 0.7, // NPC leva duração / 0.7
    maxPorCadeira: 1,
  },

  // 7.6 Variação de preços
  variacao: {
    passoMax: 0.08, // ±8% por dia
    fatorMin: 0.7, // nunca abaixo de 70% do base
    fatorMax: 1.4, // nunca acima de 140% do base
    historicoDias: 7,
    intervaloEventos: [2, 3], // um evento a cada 2–3 dias
  },

  eventos: [
    { id: 'promo', texto: 'Fornecedor em promoção: {item} −25% hoje', tipo: 'precoItem', mod: 0.75, dias: 1, itens: ['shampoo', 'condicionador', 'pomada', 'oleo', 'gel', 'locao'] },
    { id: 'faltaLaminas', texto: 'Falta de lâminas no mercado: +40%', tipo: 'precoItem', mod: 1.4, dias: 2, itens: ['laminas'] },
    { id: 'feriado', texto: 'Feriado: +50% de clientes', tipo: 'demanda', mod: 1.5, dias: 1 },
    { id: 'chuva', texto: 'Chuva forte: −30% de clientes', tipo: 'demanda', mod: 0.7, dias: 1 },
    { id: 'concorrente', texto: 'Concorrente abriu na rua: preço de referência dos serviços cai 10% por 3 dias', tipo: 'referencia', mod: 0.9, dias: 3 },
  ],

  elasticidade: {
    toleranciaAcima: 0.1, // até +10% da referência: sem efeito
    limiteForte: 0.4, // entre +10% e +40%: queda proporcional
    quedaMaxima: 0.8, // acima de +40%: chance cai 80%
    bonusMaxAbaixo: 0.3, // abaixo da referência: até +30% de chance
    perdaRepAcimaLimite: 1, // reputação perdida por cliente perdido acima de +40%
  },

  banco: {
    jurosDiarioBp: 150, // 1,5% ao dia (juros simples)
    multaAtrasoBp: 1000, // 10% sobre o saldo no vencimento
    moraDiariaBp: 300, // 3% ao dia sobre o saldo em atraso
    prazos: [3, 7, 14, 21],
    fatorLimite: 2, // limite = 2 × patrimônio − dívidas
    limiteMinimo: 50000, // ʀ$ 500,00
    valorMinimo: 10000, // menor empréstimo: ʀ$ 100,00
    perdaRepAtraso: 5,
    diasNegativoFalencia: 3,
  },

  demanda: {
    passantesPorHora: 11, // pedestres por hora de jogo na calçada (base)
    interesseBase: 0.3, // chance de um pedestre querer cortar o cabelo
    diaSemana: [0.85, 1, 1, 1, 1.4, 1.4, 0.7], // seg, ter, qua, qui, sex, sáb, dom
    // multiplicador por hora do dia (índice = hora). Picos 11–13 e 17–19.
    porHora: { 7: 0.5, 8: 0.7, 9: 0.9, 10: 1, 11: 1.6, 12: 1.6, 13: 1.3, 14: 0.9, 15: 0.9, 16: 1, 17: 1.6, 18: 1.6, 19: 1.2, 20: 0.7 },
    conforto: { sofa: 0.05, ar: 0.15, tv: 0.05 }, // bônus na chance de entrada
    luminariaNoite: 0.15, // bônus após as 18h com luminária
    horaNoite: 18,
    reputacaoPeso: 1, // fator = 0.5 + rep/100
    lugaresEmPe: 3, // clientes que esperam em pé além do sofá
    lugaresPorSofa: 2,
  },

  clientes: {
    pacienciaMin: 60,
    pacienciaMax: 120,
    bonusPacienciaSofa: 0.3,
    bonusPacienciaTv: 0.2,
    perdaRepPaciencia: 1, // reputação perdida quando um cliente desiste de esperar
    chanceCompraProduto: 0.25,
    chanceCompraSugerido: 0.6, // se o barbeiro sugerir um produto
    velocidade: 2.2, // tiles por segundo
    velocidadeJogador: 3,
  },

  venda: {
    usadoFator: 0.5, // devolve 50% do preço base
  },
};

export default economia;
