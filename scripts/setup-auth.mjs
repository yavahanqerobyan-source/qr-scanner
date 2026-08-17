import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../auth-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env');

function readPrompt(prompt, { hidden = false } = {}) {
  if (!process.stdin.isTTY) throw new Error('Запустите настройку в интерактивном терминале.');
  return new Promise((resolve, reject) => {
    let value = '';
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off('data', onData);
      process.stdout.write('\n');
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          finish();
          reject(new Error('Настройка отменена.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          if (value) {
            value = value.slice(0, -1);
            if (!hidden) process.stdout.write('\b \b');
          }
        } else if (character >= ' ') {
          value += character;
          if (!hidden) process.stdout.write(character);
        }
      }
    };
    process.stdin.on('data', onData);
  });
}

function envValue(value) {
  return JSON.stringify(String(value));
}

if (existsSync(ENV_PATH)) {
  const current = await readFile(ENV_PATH, 'utf8');
  if (current.trim()) {
    console.error('Файл .env уже существует. Для безопасности настройка не будет его перезаписывать.');
    console.error('Переименуйте существующий файл и запустите команду снова.');
    process.exit(1);
  }
}

try {
  console.log('Безопасная настройка входа в панель мастерской');
  console.log('Значения сохранятся только в локальном .env, который исключён из Git.\n');

  const adminEmail = (await readPrompt('Разрешённый email администратора: ')).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw new Error('Введите корректный email.');
  const password = await readPrompt('Пароль для входа (не отображается): ', { hidden: true });
  const passwordAgain = await readPrompt('Повторите пароль: ', { hidden: true });
  if (password !== passwordAgain) throw new Error('Пароли не совпадают.');
  if (password.length < 6) throw new Error('Пароль должен содержать не менее 6 символов.');
  if (password.length < 12) console.warn('Рекомендация: перед публикацией замените пароль на более длинный — от 12 символов.');

  const smtpUserAnswer = (await readPrompt(`SMTP-логин [${adminEmail}]: `)).trim();
  const smtpUser = smtpUserAnswer || adminEmail;
  const smtpPass = await readPrompt('Пароль приложения Яндекс Почты (не обычный пароль): ', { hidden: true });
  if (!smtpPass) throw new Error('Пароль приложения не может быть пустым.');

  const passwordHash = await hashPassword(password);
  const contents = [
    '# Создано scripts/setup-auth.mjs. Не публикуйте этот файл.',
    'NODE_ENV="development"',
    'HOST="127.0.0.1"',
    'PORT="4173"',
    `ADMIN_EMAIL=${envValue(adminEmail)}`,
    `ADMIN_PASSWORD_HASH=${envValue(passwordHash)}`,
    `SESSION_SECRET=${envValue(randomBytes(48).toString('base64url'))}`,
    `OTP_SECRET=${envValue(randomBytes(48).toString('base64url'))}`,
    `EVIDENCE_HASH_SECRET=${envValue(randomBytes(48).toString('base64url'))}`,
    `PII_ENCRYPTION_KEY=${envValue(randomBytes(32).toString('base64url'))}`,
    'DATABASE_URL=""',
    'DATABASE_SSL="true"',
    'DATABASE_SSL_REJECT_UNAUTHORIZED="true"',
    'DATABASE_POOL_MAX="10"',
    'TRUST_PROXY="false"',
    'SMTP_HOST="smtp.yandex.ru"',
    'SMTP_PORT="465"',
    `SMTP_USER=${envValue(smtpUser)}`,
    `SMTP_PASS=${envValue(smtpPass)}`,
    `SMTP_FROM=${envValue(smtpUser)}`,
    '',
  ].join('\n');
  await writeFile(ENV_PATH, contents, { encoding: 'utf8', flag: 'wx' });
  console.log('\nГотово. Запустите сайт командой: node server.mjs');
} catch (error) {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
}
