// Estado compartilhado do lado do navegador (só para exibir — quem manda é o servidor).
export const J = {
  socket: null,
  codigo: null,
  meuId: null,
  observador: false,
  instrutor: false,
  senhaInstrutor: null,
  estado: null, // último 'estado' completo
  tick: null, // último 'tick'
  ultimoTick: 0,
  interp: new Map(), // id → entidade interpolada
  selecionado: null, // cliente selecionado pelo barbeiro
  construcao: { ativo: false, carregando: null, fantasma: null, selecionadoMovel: null, movendoId: null },
  eco: null, // config/economia.js
};

export function eu() {
  return J.estado?.jogadores.find((j) => j.id === J.meuId) || null;
}
export function meuCargo() {
  return eu()?.cargo || (J.observador ? 'observador' : null);
}

/** Envia uma intenção ao servidor e devolve a resposta. */
export function acao(tipo, dados = {}) {
  return new Promise((res) => {
    if (!J.socket) return res({ ok: false, erro: 'Sem conexão' });
    J.socket.timeout(5000).emit('acao', { tipo, ...dados }, (err, r) => res(err ? { ok: false, erro: 'O servidor não respondeu' } : r));
  });
}

export function acaoInstrutor(tipo, dados = {}) {
  return new Promise((res) => {
    J.socket.timeout(5000).emit('instrutor', { tipo, ...dados }, (err, r) => res(err ? { ok: false, erro: 'O servidor não respondeu' } : r));
  });
}
