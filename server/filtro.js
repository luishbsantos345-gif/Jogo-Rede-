// Filtro simples de palavrões em português (nomes, nome da loja e chat).
// Não é perfeito: é uma barreira básica para uso em sala de aula.

const PROIBIDAS = [
  'porra', 'caralho', 'merda', 'bosta', 'puta', 'puto', 'putaria', 'foder', 'foda', 'fodase', 'fdp',
  'buceta', 'boceta', 'xoxota', 'piroca', 'pica', 'rola', 'cacete', 'cu', 'cuzao', 'arrombado', 'arrombada',
  'viado', 'viadinho', 'bicha', 'sapatao', 'traveco', 'vagabunda', 'vagabundo', 'vadia', 'piranha',
  'corno', 'otario', 'otaria', 'babaca', 'idiota', 'imbecil', 'retardado', 'retardada', 'mongol',
  'desgraca', 'desgracado', 'desgracada', 'escroto', 'escrota', 'punheta', 'siririca', 'pau no cu',
  'vsf', 'vtnc', 'pqp', 'krl', 'crl', 'prr', 'tnc', 'macaco', 'nazista', 'hitler',
];

function normalizar(t) {
  return String(t)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[@4]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't');
}

/** Palavras do texto normalizadas, e também o texto todo sem espaços/pontuação. */
function contemPalavrao(texto) {
  const n = normalizar(texto);
  const palavras = n.split(/[^a-z]+/).filter(Boolean);
  const colado = palavras.join('');
  for (const p of PROIBIDAS) {
    if (p.includes(' ')) {
      if (n.includes(p)) return true;
      continue;
    }
    if (palavras.includes(p)) return true;
    // palavras longas também são procuradas "coladas" (ex.: "p.o.r.r.a")
    if (p.length >= 5 && colado.includes(p)) return true;
  }
  return false;
}

/** Valida um nome. Retorna null se ok, ou a mensagem de erro. */
export function validarNome(nome, min, max) {
  const t = String(nome ?? '').trim().replace(/\s+/g, ' ');
  if (t.length < min || t.length > max) return `O nome precisa ter de ${min} a ${max} caracteres`;
  if (!/^[\p{L}\p{N} ._'-]+$/u.test(t)) return 'Use só letras, números, espaço e . _ \' -';
  if (contemPalavrao(t)) return 'Esse nome não é permitido';
  return null;
}

export function limparNome(nome) {
  return String(nome ?? '').trim().replace(/\s+/g, ' ');
}

/** Troca palavrões do chat por asteriscos. */
export function filtrarChat(texto) {
  return String(texto ?? '')
    .slice(0, 200)
    .split(/(\s+)/)
    .map((parte) => (/\S/.test(parte) && contemPalavrao(parte) ? '*'.repeat(parte.length) : parte))
    .join('');
}

export { contemPalavrao };
