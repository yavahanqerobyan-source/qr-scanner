import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function startServer() {
  const port = randomInt(20000, 45000);
  const environment = { ...process.env, PORT: String(port), HOST: '127.0.0.1' };
  delete environment.DATABASE_URL;
  const child = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Тестовый сервер не запустился вовремя.')), 5000);
    const onData = (chunk) => {
      if (!String(chunk).includes('Сайт:')) return;
      clearTimeout(timer);
      child.stdout.off('data', onData);
      resolve();
    };
    child.stdout.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Тестовый сервер завершился с кодом ${code}.`));
    });
  });
  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

test('server keeps the preview available without a database and hides backend files', async (context) => {
  const { child, baseUrl } = await startServer();
  context.after(() => child.kill());

  const home = await fetch(`${baseUrl}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-security-policy') || '', /default-src 'self'/);

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', database: 'not_configured' });

  for (const pathname of ['/database.mjs', '/migrations/001_initial.sql', '/package-lock.json']) {
    assert.equal((await fetch(`${baseUrl}${pathname}`)).status, 404);
  }

  const withoutConsent = await fetch(`${baseUrl}/api/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ consent: false }),
  });
  assert.equal(withoutConsent.status, 400);
});
