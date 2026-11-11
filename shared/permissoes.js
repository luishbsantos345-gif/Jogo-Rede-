// Quem pode fazer o quê. O SERVIDOR valida tudo com esta tabela;
// o navegador usa a mesma tabela apenas para desabilitar botões e mostrar dicas.

export const PERMISSOES = {
  abrirFechar: ['gerente'],
  renomearLoja: ['gerente'],
  definirPreco: ['gerente'],
  aprovarEmprestimo: ['gerente'],
  recusarEmprestimo: ['gerente'],
  contratarNpc: ['gerente'],
  demitirNpc: ['gerente'],

  solicitarEmprestimo: ['financeiro'],
  pagarEmprestimo: ['financeiro'],
  verExtrato: ['financeiro', 'gerente'],

  comprar: ['compras'],
  posicionar: ['compras'],
  guardar: ['compras'],
  venderUsado: ['compras'],
  expor: ['compras'],
  recolher: ['compras'],

  atender: ['barbeiro'],
  sugerirProduto: ['barbeiro'],

  mover: '*',
  chat: '*',
  trocarCargo: '*',
};

const NOMES = {
  gerente: 'o Gerente',
  financeiro: 'o Financeiro',
  compras: 'Compras/Estoque',
  barbeiro: 'o Barbeiro',
};

export function pode(cargo, acao) {
  const p = PERMISSOES[acao];
  if (!p) return false;
  if (p === '*') return true;
  return p.includes(cargo);
}

export function dicaPermissao(acao) {
  const p = PERMISSOES[acao];
  if (!p || p === '*') return '';
  return 'Só ' + p.map((c) => NOMES[c]).join(' ou ') + ' pode fazer isso';
}
