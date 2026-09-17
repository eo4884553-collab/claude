const { Pool } = require('pg');

const connectionString =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  throw new Error(
    'Nenhuma variável de ambiente de banco de dados encontrada (POSTGRES_URL/DATABASE_URL). ' +
    'No Vercel: aba Storage do projeto -> Create Database -> Postgres, e reimplante.'
  );
}

// Neon/Vercel Postgres exige SSL; conexões locais (ex.: testes) não usam.
const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);

let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}

let initPromise = null;
async function ensureSchema() {
  if (!initPromise) {
    initPromise = (async () => {
      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_state (
          id INTEGER PRIMARY KEY DEFAULT 1,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_by TEXT,
          CONSTRAINT single_row CHECK (id = 1)
        );
      `);
    })();
  }
  return initPromise;
}

async function query(text, params) {
  await ensureSchema();
  return getPool().query(text, params);
}

module.exports = { query, ensureSchema, getPool };
