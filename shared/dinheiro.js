// Moeda do jogo: rede (ʀ$). Subunidade: cidadão. 1 rede = 100 cidadãos.
// Todo o projeto guarda dinheiro em CIDADÃOS (número inteiro).
// Este arquivo é usado pelo servidor e pelo navegador.

export const SIMBOLO = 'ʀ$';

function inteiro(cidadaos) {
  const n = Number(cidadaos);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

/** Formata cidadãos como "ʀ$ 1.234,50". Única função de formatação do projeto. */
export function formatarDinheiro(cidadaos, opcoes = {}) {
  const { simbolo = true } = opcoes;
  const c = inteiro(cidadaos);
  const negativo = c < 0;
  const abs = Math.abs(c);
  const redes = Math.floor(abs / 100);
  const resto = abs % 100;
  const redesTxt = String(redes).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const valor = `${redesTxt},${String(resto).padStart(2, '0')}`;
  return `${negativo ? '-' : ''}${simbolo ? SIMBOLO + ' ' : ''}${valor}`;
}

/** "35 redes e 50 cidadãos" — usado em tooltips. */
export function dinheiroPorExtenso(cidadaos) {
  const c = inteiro(cidadaos);
  const negativo = c < 0;
  const abs = Math.abs(c);
  const redes = Math.floor(abs / 100);
  const resto = abs % 100;
  const partes = [];
  if (redes > 0 || resto === 0) partes.push(`${redes.toLocaleString('pt-BR')} ${redes === 1 ? 'rede' : 'redes'}`);
  if (resto > 0) partes.push(`${resto} ${resto === 1 ? 'cidadão' : 'cidadãos'}`);
  return (negativo ? 'menos ' : '') + partes.join(' e ');
}

/** Converte texto digitado ("35,50", "35.5", "1.234,00") em cidadãos. Retorna null se inválido. */
export function lerDinheiro(texto) {
  if (typeof texto === 'number') return Number.isFinite(texto) ? Math.round(texto * 100) : null;
  let t = String(texto ?? '').trim().replace(/ʀ\$|R\$|\s/gi, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  const [int, dec = ''] = t.replace('-', '').split('.');
  const valor = Number(int) * 100 + Number((dec + '00').slice(0, 2));
  return t.startsWith('-') ? -valor : valor;
}

/** Multiplica um valor em cidadãos por um percentual em pontos-base, arredondando para inteiro. */
export function aplicarBp(cidadaos, bp) {
  return Math.round((inteiro(cidadaos) * bp) / 10000);
}
