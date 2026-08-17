import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env');

function loadDotEnv(source) {
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

try { loadDotEnv(await readFile(ENV_PATH, 'utf8')); } catch {}

const { databaseEnabled, pool } = await import('../database.mjs');
if (!databaseEnabled) throw new Error('Укажите DATABASE_URL в .env или переменных окружения Timeweb.');

await pool.query(`create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())`);
const files = (await readdir(path.join(ROOT, 'migrations'))).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();

for (const file of files) {
  const exists = await pool.query('select 1 from schema_migrations where version = $1', [file]);
  if (exists.rowCount) continue;
  const sql = await readFile(path.join(ROOT, 'migrations', file), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('insert into schema_migrations (version) values ($1)', [file]);
    await client.query('commit');
    console.log(`Применена миграция: ${file}`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

await pool.end();
console.log('Схема базы данных актуальна.');

