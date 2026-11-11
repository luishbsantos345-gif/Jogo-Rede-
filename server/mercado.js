// Preços de compra com passeio aleatório diário e eventos de mercado.

export function passoPreco(atual, base, rng, cfg) {
  const variacao = (rng() * 2 - 1) * cfg.passoMax; // −8% a +8%
  const min = Math.ceil(base * cfg.fatorMin);
  const max = Math.floor(base * cfg.fatorMax);
  const novo = Math.round(atual * (1 + variacao));
  return Math.min(max, Math.max(min, novo));
}

/** Lista de todos os itens compráveis com seu preço base. */
export function catalogoCompra(eco) {
  const itens = {};
  for (const [id, e] of Object.entries(eco.equipamentos)) itens[id] = { cat: 'equipamento', nome: e.nome, base: e.preco };
  for (const [id, f] of Object.entries(eco.ferramentas)) itens[id] = { cat: 'ferramenta', nome: f.nome, base: f.preco };
  for (const [id, p] of Object.entries(eco.produtos)) itens[id] = { cat: 'produto', nome: p.nome, base: p.compra };
  return itens;
}

export function novoMercado(eco) {
  const itens = {};
  for (const [id, it] of Object.entries(catalogoCompra(eco))) {
    itens[id] = { base: it.base, atual: it.base, ontem: it.base, historico: [it.base] };
  }
  return { itens, eventos: [], proximoEventoDia: 2 };
}

export function avancarDiaMercado(mercado, rng, cfg) {
  for (const it of Object.values(mercado.itens)) {
    it.ontem = it.atual;
    it.atual = passoPreco(it.atual, it.base, rng, cfg);
    it.historico.push(it.atual);
    while (it.historico.length > cfg.historicoDias) it.historico.shift();
  }
}

/** Decrementa eventos ativos e, se for o dia, sorteia um novo. Retorna o evento novo ou null. */
export function sortearEvento(mercado, dia, rng, eco) {
  mercado.eventos = mercado.eventos
    .map((e) => ({ ...e, diasRestantes: e.diasRestantes - 1 }))
    .filter((e) => e.diasRestantes > 0);
  if (dia < mercado.proximoEventoDia) return null;
  const [a, b] = eco.variacao.intervaloEventos;
  mercado.proximoEventoDia = dia + a + Math.floor(rng() * (b - a + 1));
  const modelo = eco.eventos[Math.floor(rng() * eco.eventos.length)];
  const ev = { id: modelo.id, tipo: modelo.tipo, mod: modelo.mod, diasRestantes: modelo.dias, texto: modelo.texto };
  if (modelo.itens) {
    ev.item = modelo.itens[Math.floor(rng() * modelo.itens.length)];
    ev.texto = modelo.texto.replace('{item}', eco.produtos[ev.item]?.nome?.toLowerCase() ?? ev.item);
  }
  mercado.eventos.push(ev);
  return ev;
}

/** Preço de compra de hoje (preço atual × eventos de preço do item). */
export function precoCompraHoje(mercado, id) {
  const it = mercado.itens[id];
  if (!it) return null;
  let mod = 1;
  for (const e of mercado.eventos) if (e.tipo === 'precoItem' && e.item === id) mod *= e.mod;
  return Math.round(it.atual * mod);
}

export function modDemanda(mercado) {
  return mercado.eventos.filter((e) => e.tipo === 'demanda').reduce((m, e) => m * e.mod, 1);
}

export function modReferencia(mercado) {
  return mercado.eventos.filter((e) => e.tipo === 'referencia').reduce((m, e) => m * e.mod, 1);
}

/**
 * Fator de elasticidade-preço sobre a chance de entrada.
 * > 1 quando o preço está abaixo da referência (até +30%).
 */
export function fatorElasticidade(preco, referencia, cfg) {
  if (referencia <= 0) return 1;
  const r = preco / referencia;
  if (r < 1) return 1 + Math.min(cfg.bonusMaxAbaixo, (1 - r) * cfg.bonusMaxAbaixo / 0.3);
  const acima = r - 1;
  if (acima <= cfg.toleranciaAcima) return 1;
  if (acima <= cfg.limiteForte) {
    const t = (acima - cfg.toleranciaAcima) / (cfg.limiteForte - cfg.toleranciaAcima);
    return 1 - t * cfg.quedaMaxima;
  }
  return 1 - cfg.quedaMaxima;
}
