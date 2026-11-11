// Entrada do jogo: tela inicial, criação do personagem e conexão com a sala.
import eco from '/config/economia.js';
import { J } from './estado.js';
import { desenharPreview, PALETAS, NOMES_SKIN, spritePersonagem } from './sprites.js';
import { iniciarJogo } from './jogo.js';

J.eco = eco;
const $ = (id) => document.getElementById(id);
const socket = io({ transports: ['websocket', 'polling'] });
J.socket = socket;
window.__jogo = J;
window.socket = socket; // para testes pelo console: socket.emit('acao', {tipo:'renomearLoja', nome:'X'}, console.log)

const LIMITES = { pele: 6, cabeloEstilo: 6, cabeloCor: 6, camisa: 8, calca: 4, acessorio: 4 };
const DESCR_CARGO = {
  gerente: 'Abre/fecha a loja, define preços, renomeia, aprova empréstimos.',
  financeiro: 'Pede e paga empréstimos, acompanha o extrato.',
  compras: 'Compra itens, monta a loja, cuida do estoque.',
  barbeiro: 'Atende os clientes nas cadeiras e sugere produtos.',
};

let skin = carregar('barbearia:skin') || sortearSkin();
let cargoEscolhido = null;
let infoSala = null;
let dirPreview = 0;

function carregar(k) {
  try {
    return JSON.parse(localStorage.getItem(k));
  } catch {
    return null;
  }
}
function guardar(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}
function tokenDaSala(codigo) {
  try {
    return sessionStorage.getItem('barbearia:token:' + codigo);
  } catch {
    return null;
  }
}
function guardarToken(codigo, token) {
  try {
    sessionStorage.setItem('barbearia:token:' + codigo, token);
    sessionStorage.setItem('barbearia:ultimaSala', codigo);
  } catch {}
}
function sortearSkin() {
  const s = {};
  for (const [k, n] of Object.entries(LIMITES)) s[k] = Math.floor(Math.random() * n);
  s.acessorio = Math.random() < 0.5 ? 0 : s.acessorio;
  return s;
}

function mostrarTela(id) {
  for (const t of document.querySelectorAll('.tela')) t.classList.toggle('ativa', t.id === id);
}
function msg(el, texto) {
  $(el).textContent = texto || '';
}

// ------------------------------------------------------------- logo animado
function desenharLogo() {
  const c = $('logoCanvas');
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const t = Date.now() / 300;
  ctx.clearRect(0, 0, c.width, c.height);
  // poste de barbearia girando
  for (let y = 0; y < 34; y++) {
    const fase = Math.floor((y + t * 3) / 3) % 2;
    ctx.fillStyle = fase ? '#d64545' : '#f2f2ee';
    ctx.fillRect(10, 5 + y, 8, 1);
    ctx.fillStyle = fase ? '#3b7dd8' : '#f2f2ee';
    ctx.fillRect(12, 5 + y, 2, 1);
  }
  ctx.fillStyle = '#1a1220';
  ctx.fillRect(9, 3, 10, 2);
  ctx.fillRect(9, 39, 10, 2);
  const q = Math.floor(Date.now() / 160) % 4;
  ctx.drawImage(spritePersonagem({ pele: 2, cabeloEstilo: 2, cabeloCor: 0, camisa: 0, calca: 0, acessorio: 3 }, 0, q), 30, 18);
  ctx.drawImage(spritePersonagem({ pele: 4, cabeloEstilo: 3, cabeloCor: 0, camisa: 1, calca: 1, acessorio: 0 }, 1, (q + 2) % 4), 52, 18);
  ctx.drawImage(spritePersonagem({ pele: 0, cabeloEstilo: 4, cabeloCor: 3, camisa: 4, calca: 2, acessorio: 2 }, 1, (q + 1) % 4), 72, 18);
}
let logoTimer = setInterval(desenharLogo, 120);

// ------------------------------------------------------------- tela inicial
const params = new URLSearchParams(location.search);
if (params.get('sala')) $('inCodigo').value = params.get('sala').toUpperCase();
else {
  try {
    const ult = sessionStorage.getItem('barbearia:ultimaSala');
    if (ult) $('inCodigo').value = ult;
  } catch {}
}

$('btEntrarCodigo').onclick = () => abrirSala($('inCodigo').value.trim().toUpperCase());
$('inCodigo').addEventListener('keydown', (e) => e.key === 'Enter' && $('btEntrarCodigo').click());
$('btCriar').onclick = () => {
  const senha = $('inSenhaCriar').value;
  if (senha.length < 4) return msg('msgInicio', 'A senha do instrutor precisa ter pelo menos 4 caracteres');
  socket.emit('sala:criar', { senha }, (r) => {
    if (!r.ok) return msg('msgInicio', r.erro);
    J.senhaInstrutor = senha;
    abrirSala(r.codigo);
  });
};
$('btObservar').onclick = () => {
  const codigo = $('inCodigoObs').value.trim().toUpperCase();
  const senha = $('inSenhaObs').value;
  socket.emit('sala:observar', { codigo, senha }, (r) => {
    if (!r.ok) return msg('msgInicio', r.erro);
    J.codigo = r.codigo;
    J.observador = true;
    J.instrutor = true;
    J.senhaInstrutor = senha;
    entrarNoJogo();
  });
};

function abrirSala(codigo) {
  if (!/^[A-Z]{5}$/.test(codigo)) return msg('msgInicio', 'O código tem 5 letras');
  const token = tokenDaSala(codigo);
  socket.emit('sala:info', { codigo, token }, (r) => {
    if (!r.ok) return msg('msgInicio', r.erro);
    infoSala = r;
    // já estava nesta sala (recarregou a página): volta direto
    if (r.conhecido && token) return entrar(codigo, { token });
    if (r.lotada) return msg('msgInicio', 'Empresa lotada');
    msg('msgInicio', '');
    montarPersonagem();
    mostrarTela('telaPersonagem');
  });
}

// ------------------------------------------------------------- personagem
function montarPersonagem() {
  $('tituloEmpresa').textContent = infoSala.nome;
  $('codigoGrande').textContent = infoSala.codigo;
  const ultimoNome = carregar('barbearia:nome');
  if (ultimoNome && !$('inNome').value) $('inNome').value = ultimoNome;
  montarOpcoesSkin();
  montarCargos();
}

function montarOpcoesSkin() {
  const div = $('opcoesSkin');
  div.innerHTML = '';
  const linhas = [
    ['pele', 'Pele', PALETAS.pele],
    ['cabeloEstilo', 'Cabelo', null],
    ['cabeloCor', 'Cor do cabelo', PALETAS.cabeloCor],
    ['camisa', 'Camisa', PALETAS.camisa],
    ['calca', 'Calça', PALETAS.calca],
    ['acessorio', 'Acessório', null],
  ];
  for (const [chave, rotulo, cores] of linhas) {
    const l = document.createElement('div');
    l.className = 'opcao';
    l.innerHTML = `<span>${rotulo}</span><div class="amostras"></div>`;
    const am = l.querySelector('.amostras');
    for (let i = 0; i < LIMITES[chave]; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      if (cores) {
        b.className = 'amostra';
        b.style.background = cores[i];
      } else {
        b.className = 'amostra-txt';
        b.textContent = NOMES_SKIN[chave][i];
      }
      b.title = NOMES_SKIN[chave][i];
      if (skin[chave] === i) b.classList.add('sel');
      b.onclick = () => {
        skin[chave] = i;
        guardar('barbearia:skin', skin);
        montarOpcoesSkin();
      };
      am.appendChild(b);
    }
    div.appendChild(l);
  }
}

function montarCargos() {
  const div = $('cargos');
  div.innerHTML = '';
  for (const [id, info] of Object.entries(eco.sala.cargos)) {
    const v = infoSala.vagas[id];
    const cheio = v.ocupadas >= v.max;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cargo' + (cargoEscolhido === id ? ' sel' : '');
    b.disabled = cheio;
    b.innerHTML = `<b>${info.nome}</b><small>${DESCR_CARGO[id]}</small><span class="vagas">${cheio ? 'Sem vaga' : `Vagas: ${v.max - v.ocupadas} de ${v.max}`}</span>`;
    b.onclick = () => {
      cargoEscolhido = id;
      montarCargos();
    };
    div.appendChild(b);
  }
  if (!cargoEscolhido) {
    const livre = Object.keys(eco.sala.cargos).find((c) => infoSala.vagas[c].ocupadas < infoSala.vagas[c].max);
    if (livre) {
      cargoEscolhido = livre;
      montarCargos();
    }
  }
}

setInterval(() => {
  if (!$('telaPersonagem').classList.contains('ativa')) return;
  desenharPreview($('previewCanvas'), skin, dirPreview, Math.floor(Date.now() / 160) % 4, 7);
}, 80);
$('btGirar').onclick = () => (dirPreview = (dirPreview + 1) % 4);
$('btAleatorio').onclick = () => {
  skin = sortearSkin();
  guardar('barbearia:skin', skin);
  montarOpcoesSkin();
};
$('btVoltar').onclick = () => mostrarTela('telaInicial');
$('btEntrarJogo').onclick = () => {
  const nome = $('inNome').value.trim();
  if (nome.length < 2) return msg('msgPers', 'Digite um nome de 2 a 16 caracteres');
  if (!cargoEscolhido) return msg('msgPers', 'Escolha um cargo');
  guardar('barbearia:nome', nome);
  entrar(infoSala.codigo, { nome, skin, cargo: cargoEscolhido });
};
$('inNome').addEventListener('keydown', (e) => e.key === 'Enter' && $('btEntrarJogo').click());

function entrar(codigo, dados) {
  socket.emit('sala:entrar', { codigo, ...dados }, (r) => {
    if (!r.ok) {
      // token antigo inválido: volta para a criação
      if (dados.token) {
        try {
          sessionStorage.removeItem('barbearia:token:' + codigo);
        } catch {}
        return abrirSala(codigo);
      }
      msg('msgPers', r.erro);
      msg('msgInicio', r.erro);
      if (r.erro === 'Empresa lotada') mostrarTela('telaInicial');
      socket.emit('sala:info', { codigo }, (i) => {
        if (i.ok) {
          infoSala = i;
          montarCargos();
        }
      });
      return;
    }
    J.codigo = r.codigo;
    J.meuId = r.jogadorId;
    guardarToken(r.codigo, r.token);
    if (J.senhaInstrutor) socket.emit('instrutor:login', { senha: J.senhaInstrutor }, (x) => (J.instrutor = !!x?.ok));
    entrarNoJogo();
  });
}

function entrarNoJogo() {
  clearInterval(logoTimer);
  mostrarTela('telaJogo');
  iniciarJogo();
  const url = new URL(location.href);
  url.searchParams.set('sala', J.codigo);
  history.replaceState(null, '', url);
}

// reconexão automática (ex.: Wi-Fi caiu ou servidor reiniciou)
socket.on('connect', () => {
  if (!J.codigo) return;
  if (J.observador) {
    socket.emit('sala:observar', { codigo: J.codigo, senha: J.senhaInstrutor }, () => {});
    return;
  }
  const token = tokenDaSala(J.codigo);
  if (token)
    socket.emit('sala:entrar', { codigo: J.codigo, token }, (r) => {
      if (r.ok) {
        J.meuId = r.jogadorId;
        if (J.senhaInstrutor) socket.emit('instrutor:login', { senha: J.senhaInstrutor }, (x) => (J.instrutor = !!x?.ok));
      }
    });
});
