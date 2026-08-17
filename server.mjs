import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { digestOtp, SlidingWindowLimiter, verifyOtp, verifyPassword } from './auth-core.mjs';
import { sendOtpMail } from './smtp-client.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(ROOT, '.env');
const OTP_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SESSION_COOKIE = 'julia_admin_session';
const MAX_BODY_BYTES = 8 * 1024;

function loadDotEnv(source) {
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

if (existsSync(ENV_PATH)) loadDotEnv(await readFile(ENV_PATH, 'utf8'));

const PORT = Number(process.env.PORT || 4173);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const HOST = String(process.env.HOST || (IS_PRODUCTION ? '0.0.0.0' : '127.0.0.1'));

const config = {
  adminEmail: String(process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  passwordHash: String(process.env.ADMIN_PASSWORD_HASH || '').trim(),
  sessionSecret: String(process.env.SESSION_SECRET || '').trim(),
  otpSecret: String(process.env.OTP_SECRET || '').trim(),
  smtp: {
    host: String(process.env.SMTP_HOST || 'smtp.yandex.ru').trim(),
    port: Number(process.env.SMTP_PORT || 465),
    user: String(process.env.SMTP_USER || '').trim(),
    pass: String(process.env.SMTP_PASS || '').trim(),
    from: String(process.env.SMTP_FROM || process.env.SMTP_USER || '').trim(),
  },
};

const challenges = new Map();
const sessions = new Map();
const loginLimiter = new SlidingWindowLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });
const loginIpLimiter = new SlidingWindowLimiter({ limit: 20, windowMs: 15 * 60 * 1000 });
const otpLimiter = new SlidingWindowLimiter({ limit: 8, windowMs: 15 * 60 * 1000 });
const otpIpLimiter = new SlidingWindowLimiter({ limit: 24, windowMs: 15 * 60 * 1000 });

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.pdf', 'application/pdf'],
]);

const DENIED_FILES = new Set([
  '.env', '.env.example', '.gitignore', 'package.json', 'server.mjs', 'auth-core.mjs', 'smtp-client.mjs', 'README.md',
]);

function securityHeaders(pathname) {
  const headers = {
    'Content-Security-Policy': "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' https://www.googletagmanager.com https://mc.yandex.ru; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://mc.yandex.ru; font-src 'self'; connect-src 'self' https://www.google-analytics.com https://mc.yandex.ru",
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
  if (pathname.startsWith('/admin')) headers['Cache-Control'] = 'no-store';
  return headers;
}

function json(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, { ...securityHeaders('/admin'), 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders });
  response.end(JSON.stringify(payload));
}

function redirect(response, location) {
  response.writeHead(303, { ...securityHeaders(location), Location: location, 'Cache-Control': 'no-store' });
  response.end();
}

function getClientIp(request) {
  return request.socket.remoteAddress || 'unknown';
}

function parseCookies(request) {
  return Object.fromEntries(String(request.headers.cookie || '').split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return index > 0 ? [part.slice(0, index), decodeURIComponent(part.slice(index + 1))] : [part, ''];
  }));
}

function getSession(request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const key = createHmac('sha256', config.sessionSecret).update(token).digest('base64url');
  const session = sessions.get(key);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(key);
    return null;
  }
  return { key, ...session };
}

function createSessionCookie(token) {
  const secure = IS_PRODUCTION ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`;
}

function clearSessionCookie() {
  const secure = IS_PRODUCTION ? '; Secure' : '';
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`;
}

function verifySameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

async function readJsonBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Слишком большой запрос.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Некорректный запрос.'), { status: 400 });
  }
}

function isConfigured() {
  return Boolean(
    config.adminEmail && config.passwordHash && config.sessionSecret.length >= 32 && config.otpSecret.length >= 32
      && config.smtp.host && config.smtp.port && config.smtp.user && config.smtp.pass && config.smtp.from,
  );
}

async function requestLoginCode(request, response) {
  if (!isConfigured()) {
    return json(response, 503, { error: 'Вход ещё не настроен на сервере.' });
  }
  const body = await readJsonBody(request);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const clientIp = getClientIp(request);
  const ipLimit = loginIpLimiter.consume(clientIp);
  if (!ipLimit.allowed) {
    return json(response, 429, { error: 'Слишком много попыток. Попробуйте позже.' }, { 'Retry-After': String(Math.ceil(ipLimit.retryAfterMs / 1000)) });
  }
  const limiterKey = `${clientIp}:${email.slice(0, 128)}`;
  const limit = loginLimiter.consume(limiterKey);
  if (!limit.allowed) {
    return json(response, 429, { error: 'Слишком много попыток. Попробуйте позже.' }, { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) });
  }

  const passwordMatches = await verifyPassword(password, config.passwordHash);
  if (email !== config.adminEmail || !passwordMatches) {
    return json(response, 401, { error: 'Не удалось подтвердить данные для входа.' });
  }

  const challengeId = randomBytes(24).toString('base64url');
  const code = String(randomInt(100000, 1000000));
  await sendOtpMail({ ...config.smtp, to: config.adminEmail, code });
  challenges.set(challengeId, {
    email: config.adminEmail,
    digest: digestOtp(code, challengeId, config.otpSecret),
    expiresAt: Date.now() + OTP_TTL_MS,
    attemptsLeft: 6,
  });
  loginLimiter.reset(limiterKey);
  return json(response, 200, { challengeId, expiresIn: OTP_TTL_MS / 1000 });
}

async function confirmLoginCode(request, response) {
  const body = await readJsonBody(request);
  const challengeId = String(body.challengeId || '');
  const code = String(body.code || '').replace(/\D/g, '').slice(0, 6);
  const clientIp = getClientIp(request);
  const ipLimit = otpIpLimiter.consume(clientIp);
  if (!ipLimit.allowed) {
    return json(response, 429, { error: 'Слишком много попыток. Запросите новый код позже.' }, { 'Retry-After': String(Math.ceil(ipLimit.retryAfterMs / 1000)) });
  }
  const limitKey = `${clientIp}:${challengeId.slice(0, 64)}`;
  const limit = otpLimiter.consume(limitKey);
  if (!limit.allowed) {
    return json(response, 429, { error: 'Слишком много попыток. Запросите новый код позже.' }, { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) });
  }

  const challenge = challenges.get(challengeId);
  if (!challenge || challenge.expiresAt <= Date.now() || challenge.attemptsLeft <= 0) {
    challenges.delete(challengeId);
    return json(response, 401, { error: 'Код недействителен или срок его действия истёк.' });
  }
  challenge.attemptsLeft -= 1;
  if (!verifyOtp(code, challengeId, config.otpSecret, challenge.digest)) {
    if (challenge.attemptsLeft <= 0) challenges.delete(challengeId);
    return json(response, 401, { error: 'Код недействителен или срок его действия истёк.' });
  }

  challenges.delete(challengeId);
  otpLimiter.reset(limitKey);
  const token = randomBytes(32).toString('base64url');
  const sessionKey = createHmac('sha256', config.sessionSecret).update(token).digest('base64url');
  sessions.set(sessionKey, { email: challenge.email, expiresAt: Date.now() + SESSION_TTL_MS });
  return json(response, 200, { ok: true }, { 'Set-Cookie': createSessionCookie(token) });
}

function logout(request, response) {
  const session = getSession(request);
  if (session) sessions.delete(session.key);
  return json(response, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
}

async function serveStatic(request, response, pathname) {
  let route = pathname;
  if (route === '/') route = '/index.html';
  if (route === '/shop') route = '/shop.html';
  if (route === '/admin') route = '/admin.html';
  if (route === '/admin-login') route = '/admin-login.html';

  if ((route === '/admin.html') && !getSession(request)) return redirect(response, '/admin-login.html');
  if ((route === '/admin-login.html') && getSession(request)) return redirect(response, '/admin.html');

  const decoded = decodeURIComponent(route);
  const relative = decoded.replace(/^[/\\]+/, '');
  const target = path.resolve(ROOT, relative);
  if (!target.startsWith(`${ROOT}${path.sep}`) || relative.split(/[\\/]/).some((part) => part.startsWith('.')) || DENIED_FILES.has(relative)) {
    response.writeHead(404, securityHeaders(pathname));
    return response.end('Not found');
  }

  try {
    const metadata = await stat(target);
    if (!metadata.isFile()) throw new Error('Not a file');
    const extension = path.extname(target).toLowerCase();
    const headers = {
      ...securityHeaders(pathname),
      'Content-Type': MIME_TYPES.get(extension) || 'application/octet-stream',
      'Content-Length': metadata.size,
    };
    if (!pathname.startsWith('/admin') && /\.(?:css|js|woff2|png|jpe?g|webp|svg)$/i.test(target)) {
      headers['Cache-Control'] = 'public, max-age=3600';
    }
    response.writeHead(200, headers);
    if (request.method === 'HEAD') return response.end();
    response.end(await readFile(target));
  } catch {
    response.writeHead(404, { ...securityHeaders(pathname), 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Страница не найдена.');
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (request.method === 'POST' && pathname.startsWith('/api/auth/') && !verifySameOrigin(request)) {
      return json(response, 403, { error: 'Запрос отклонён.' });
    }
    if (request.method === 'POST' && pathname === '/api/auth/request-code') return await requestLoginCode(request, response);
    if (request.method === 'POST' && pathname === '/api/auth/verify-code') return await confirmLoginCode(request, response);
    if (request.method === 'POST' && pathname === '/api/auth/logout') return logout(request, response);
    if (request.method === 'GET' && pathname === '/api/auth/session') {
      return json(response, getSession(request) ? 200 : 401, { authenticated: Boolean(getSession(request)) });
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      return json(response, 405, { error: 'Метод не поддерживается.' }, { Allow: 'GET, HEAD, POST' });
    }
    return await serveStatic(request, response, pathname);
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error('[server]', error.message);
    return json(response, status, { error: status >= 500 ? 'Сервис временно недоступен.' : error.message });
  }
});

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, challenge] of challenges) if (challenge.expiresAt <= now) challenges.delete(id);
  for (const [token, session] of sessions) if (session.expiresAt <= now) sessions.delete(token);
  loginLimiter.prune(now);
  loginIpLimiter.prune(now);
  otpLimiter.prune(now);
  otpIpLimiter.prune(now);
}, 5 * 60 * 1000);
cleanupTimer.unref();

server.listen(PORT, HOST, () => {
  console.log(`Сайт: http://localhost:${PORT}`);
  console.log(`Админка: http://localhost:${PORT}/admin`);
  if (!isConfigured()) console.warn('Авторизация не настроена: запустите node scripts/setup-auth.mjs');
});
