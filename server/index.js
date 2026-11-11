// Servidor: Express (arquivos estáticos + CSV) e Socket.IO (jogo em tempo real).
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import eco from '../config/economia.js';
import { Sala } from './sala.js';
import { salvarSala, carregarTodas, PASTA_SALAS } from './persistencia.js';
import { csvLog, csvResumo, csvExtrato } from './csv.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;

const app = express();
const servidor = http.createServer(app);
const io = new Server(servidor, { pingInterval: 10000, pingTimeout: 8000 });

app.use(express.static(path.join(raiz, 'public')));
app.use('/shared', express.static(path.join(raiz, 'shared')));
app.use('/config', express.static(path.join(raiz, 'config')));

/** @type {Map<string, Sala>} */
const salas = new Map();

// ------------------------------------------------------------------ senha do instrutor
function hashSenha(senha, salt = crypto.randomBytes(8).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(senha), salt, 32).toString('hex') };
}
function conferirSenha(sala, senha) {
  if (!sala.s.senha) return false;
  const h = crypto.scryptSync(String(senha ?? ''), sala.s.senha.salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(sala.s.senha.hash));
}

function novoCodigo() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I e O para não confundir
  let c;
  do c = Array.from({ length: 5 }, () => letras[Math.floor(Math.random() * letras.length)]).join('');
  while (salas.has(c));
  return c;
}

function prepararSala(sala) {
  const codigo = sala.s.codigo;
  sala.ouvinte = (tipo, dados) => {
    if (tipo === 'salvar') return salvarComSeguranca(sala);
    if (tipo === 'reiniciada') salvarComSeguranca(sala);
    io.to(codigo).emit('evento', { tipo, ...(dados || {}) });
  };
  sala.ultimoEstado = 0;
  salas.set(codigo, sala);
}

function salvarComSeguranca(sala) {
  try {
    salvarSala(sala);
  } catch (e) {
    console.error('Falha ao salvar sala', sala.s.codigo, e.message);
  }
}

// carrega salas salvas: a partida continua de onde parou
for (const estado of carregarTodas()) {
  for (const j of Object.values(estado.jogadores || {})) {
    j.online = false;
    j.conexoes = 0;
  }
  prepararSala(new Sala(estado));
}
if (salas.size) console.log(`Recuperadas ${salas.size} sala(s) de ${PASTA_SALAS}`);

// ------------------------------------------------------------------ HTTP: exportações
function exigirInstrutor(req, res) {
  const sala = salas.get(String(req.params.codigo).toUpperCase());
  if (!sala) return res.status(404).send('Sala não encontrada'), null;
  if (!conferirSenha(sala, req.query.senha)) return res.status(403).send('Senha do instrutor incorreta'), null;
  return sala;
}
function enviarCsv(res, nome, conteudo) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  res.send(conteudo);
}
app.get('/api/salas/:codigo/log.csv', (req, res) => {
  const sala = exigirInstrutor(req, res);
  if (sala) enviarCsv(res, `log-${sala.s.codigo}.csv`, csvLog(sala.s));
});
app.get('/api/salas/:codigo/resumo.csv', (req, res) => {
  const sala = exigirInstrutor(req, res);
  if (sala) enviarCsv(res, `resumo-diario-${sala.s.codigo}.csv`, csvResumo(sala.s));
});
app.get('/api/salas/:codigo/extrato.csv', (req, res) => {
  const sala = exigirInstrutor(req, res);
  if (sala) enviarCsv(res, `extrato-${sala.s.codigo}.csv`, csvExtrato(sala.s));
});
app.get('/api/saude', (req, res) => res.json({ ok: true, salas: salas.size }));

// ------------------------------------------------------------------ Socket.IO
const resp = (cb, dados) => typeof cb === 'function' && cb(dados);

io.on('connection', (socket) => {
  socket.data = {};

  socket.on('sala:criar', (d = {}, cb) => {
    const senha = String(d.senha ?? '');
    if (senha.length < 4 || senha.length > 30) return resp(cb, { ok: false, erro: 'A senha do instrutor precisa ter de 4 a 30 caracteres' });
    const codigo = novoCodigo();
    const sala = Sala.criar(codigo, hashSenha(senha));
    prepararSala(sala);
    salvarComSeguranca(sala);
    console.log(`Sala ${codigo} criada`);
    resp(cb, { ok: true, codigo });
  });

  socket.on('sala:info', (d = {}, cb) => {
    const sala = salas.get(String(d.codigo ?? '').toUpperCase());
    if (!sala) return resp(cb, { ok: false, erro: 'Empresa não encontrada. Confira o código.' });
    const online = sala.jogadoresOnline().length;
    let conhecido = null;
    if (d.token) {
      const j = Object.values(sala.s.jogadores).find((x) => x.token === d.token);
      if (j) conhecido = { nome: j.nome, cargo: j.cargo, skin: j.skin };
    }
    resp(cb, { ok: true, codigo: sala.s.codigo, nome: sala.s.loja.nome, online, max: eco.sala.maxJogadores, lotada: online >= eco.sala.maxJogadores, vagas: sala.vagasPorCargo(), conhecido });
  });

  socket.on('sala:entrar', (d = {}, cb) => {
    if (socket.data.codigo) return resp(cb, { ok: false, erro: 'Você já está numa empresa' });
    const sala = salas.get(String(d.codigo ?? '').toUpperCase());
    if (!sala) return resp(cb, { ok: false, erro: 'Empresa não encontrada' });
    const r = sala.entrar({ token: d.token, nome: d.nome, skin: d.skin, cargo: d.cargo });
    if (r.erro) return resp(cb, { ok: false, erro: r.erro });
    socket.data.codigo = sala.s.codigo;
    socket.data.jogadorId = r.jogador.id;
    socket.join(sala.s.codigo);
    resp(cb, { ok: true, jogadorId: r.jogador.id, token: r.jogador.token, codigo: sala.s.codigo });
    socket.emit('estado', sala.snapshotEstado());
    sala.sujo = true;
  });

  socket.on('sala:observar', (d = {}, cb) => {
    if (socket.data.codigo) return resp(cb, { ok: false, erro: 'Você já está numa empresa' });
    const sala = salas.get(String(d.codigo ?? '').toUpperCase());
    if (!sala) return resp(cb, { ok: false, erro: 'Empresa não encontrada' });
    if (!conferirSenha(sala, d.senha)) return resp(cb, { ok: false, erro: 'Senha do instrutor incorreta' });
    socket.data.codigo = sala.s.codigo;
    socket.data.instrutor = true;
    socket.join(sala.s.codigo);
    resp(cb, { ok: true, codigo: sala.s.codigo, observador: true });
    socket.emit('estado', sala.snapshotEstado());
  });

  socket.on('instrutor:login', (d = {}, cb) => {
    const sala = salas.get(socket.data.codigo);
    if (!sala) return resp(cb, { ok: false, erro: 'Entre numa empresa primeiro' });
    if (!conferirSenha(sala, d.senha)) return resp(cb, { ok: false, erro: 'Senha incorreta' });
    socket.data.instrutor = true;
    resp(cb, { ok: true });
  });

  socket.on('instrutor', (d = {}, cb) => {
    const sala = salas.get(socket.data.codigo);
    if (!sala || !socket.data.instrutor) return resp(cb, { ok: false, erro: 'Só o instrutor pode fazer isso' });
    const r = sala.acaoInstrutor(String(d.tipo), d);
    resp(cb, r.erro ? { ok: false, erro: r.erro } : { ok: true });
  });

  socket.on('acao', (d = {}, cb) => {
    const sala = salas.get(socket.data.codigo);
    if (!sala || !socket.data.jogadorId) return resp(cb, { ok: false, erro: 'Entre numa empresa primeiro' });
    if (typeof d !== 'object' || d === null) return resp(cb, { ok: false, erro: 'Pedido inválido' });
    resp(cb, sala.acao(socket.data.jogadorId, String(d.tipo), d));
  });

  socket.on('ping:medir', (t, cb) => resp(cb, t));

  socket.on('disconnect', () => {
    const sala = salas.get(socket.data.codigo);
    if (sala && socket.data.jogadorId) sala.sair(socket.data.jogadorId);
  });
});

// ------------------------------------------------------------------ laço do jogo (10 Hz)
const INTERVALO = 1000 / eco.tempo.tickHz;
let ultimo = performance.now();
let ultimoSalvamento = Date.now();

setInterval(() => {
  const agora = performance.now();
  const dt = Math.min(0.5, (agora - ultimo) / 1000);
  ultimo = agora;
  for (const sala of salas.values()) {
    const conectados = io.sockets.adapter.rooms.get(sala.s.codigo)?.size ?? 0;
    if (conectados === 0) continue; // sem ninguém conectado o tempo não passa
    sala.tick(dt);
    io.to(sala.s.codigo).volatile.emit('tick', sala.snapshotTick());
    const t = Date.now();
    if (sala.sujo && t - sala.ultimoEstado >= 250) {
      sala.sujo = false;
      sala.ultimoEstado = t;
      io.to(sala.s.codigo).emit('estado', sala.snapshotEstado());
    }
    sala.ativaDesdeSalvamento = true;
  }
  if (Date.now() - ultimoSalvamento >= eco.tempo.salvarACadaSegundos * 1000) {
    ultimoSalvamento = Date.now();
    for (const sala of salas.values()) {
      if (!sala.ativaDesdeSalvamento) continue;
      sala.ativaDesdeSalvamento = false;
      salvarComSeguranca(sala);
    }
  }
}, INTERVALO);

function salvarTudoESair() {
  console.log('\nSalvando salas antes de sair...');
  for (const sala of salas.values()) salvarComSeguranca(sala);
  process.exit(0);
}
process.on('SIGINT', salvarTudoESair);
process.on('SIGTERM', salvarTudoESair);

servidor.listen(PORT, () => {
  console.log(`\n  Barbearia rodando!  Neste computador: http://localhost:${PORT}`);
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const r of lista || []) if (r.family === 'IPv4' && !r.internal) console.log(`  Alunos na rede local:  http://${r.address}:${PORT}`);
  }
  console.log('');
});
