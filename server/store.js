'use strict';

const fs = require('fs');
const path = require('path');
const { buildSeed } = require('./seed');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

function ensureDb() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const seed = buildSeed();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf8');
  }
}

function load() {
  ensureDb();
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  return JSON.parse(raw);
}

function save(state) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf8');
  return state;
}

// Fila simples para serializar escritas (evita corrida entre requisições concorrentes).
// Encadeada com .catch() para não "envenenar" a fila: uma mutação que falha (ex.:
// erro de validação 400) não pode travar todas as requisições seguintes.
let queue = Promise.resolve();
function mutate(fn) {
  const run = queue.catch(() => {}).then(async () => {
    const state = load();
    const result = await fn(state);
    save(state);
    return result !== undefined ? result : state;
  });
  queue = run.catch(() => {});
  return run;
}

function resetToSeed() {
  const seed = buildSeed();
  save(seed);
  return seed;
}

module.exports = { load, save, mutate, resetToSeed, DB_FILE };
