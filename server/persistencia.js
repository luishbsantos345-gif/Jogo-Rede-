// Salva e carrega o estado das salas em data/salas/<codigo>.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PASTA_SALAS = process.env.PASTA_DADOS ? path.resolve(process.env.PASTA_DADOS) : path.join(raiz, 'data', 'salas');

export function garantirPasta() {
  fs.mkdirSync(PASTA_SALAS, { recursive: true });
}

/** Escrita atômica: grava em arquivo temporário e renomeia. */
export function salvarSala(sala) {
  garantirPasta();
  const destino = path.join(PASTA_SALAS, `${sala.s.codigo}.json`);
  const tmp = destino + '.tmp';
  fs.writeFileSync(tmp, sala.serializar());
  fs.renameSync(tmp, destino);
}

export function carregarTodas() {
  garantirPasta();
  const estados = [];
  for (const arq of fs.readdirSync(PASTA_SALAS)) {
    if (!/^[A-Z]{5}\.json$/.test(arq)) continue;
    try {
      estados.push(JSON.parse(fs.readFileSync(path.join(PASTA_SALAS, arq), 'utf8')));
    } catch (e) {
      console.error(`Não consegui ler ${arq}:`, e.message);
    }
  }
  return estados;
}
