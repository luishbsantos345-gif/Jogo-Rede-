// Sons curtos gerados na hora (Web Audio). Botão de mudo salvo no navegador.
let ctx = null;
let mudo = false;
try {
  mudo = localStorage.getItem('barbearia:mudo') === '1';
} catch {}

export function estaMudo() {
  return mudo;
}
export function alternarMudo() {
  mudo = !mudo;
  try {
    localStorage.setItem('barbearia:mudo', mudo ? '1' : '0');
  } catch {}
  return mudo;
}

function tom(freq, dur, tipo = 'square', vol = 0.06, atraso = 0) {
  if (mudo) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime + atraso;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch {}
}

const SONS = {
  moeda: () => { tom(988, 0.07); tom(1319, 0.12, 'square', 0.05, 0.07); },
  sino: () => { tom(1568, 0.25, 'triangle', 0.08); tom(2093, 0.3, 'triangle', 0.05, 0.05); },
  erro: () => { tom(196, 0.15, 'sawtooth', 0.05); tom(147, 0.2, 'sawtooth', 0.05, 0.12); },
  clique: () => tom(660, 0.04, 'square', 0.03),
  noite: () => { tom(523, 0.2, 'triangle', 0.06); tom(392, 0.3, 'triangle', 0.06, 0.18); tom(262, 0.4, 'triangle', 0.06, 0.4); },
  dia: () => { tom(392, 0.15, 'triangle', 0.06); tom(523, 0.15, 'triangle', 0.06, 0.15); tom(659, 0.3, 'triangle', 0.06, 0.3); },
};

export function tocar(nome) {
  SONS[nome]?.();
}
