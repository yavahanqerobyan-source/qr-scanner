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
const MAX_CONTENT_BODY_BYTES = 32 * 1024 * 1024;
const CONSENT_VERSION = 'pd-2026-08-17';

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
const TRUST_PROXY = String(process.env.TRUST_PROXY || 'false').toLowerCase() === 'true';
const database = await import('./database.mjs');

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
const publicWriteLimiter = new SlidingWindowLimiter({ limit: 60, windowMs: 15 * 60 * 1000 });

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
  '.env', '.env.example', '.gitignore', 'package.json', 'package-lock.json', 'server.mjs', 'auth-core.mjs', 'smtp-client.mjs', 'database.mjs', 'README.md',
]);

const DENIED_DIRECTORIES = new Set(['migrations', 'node_modules', 'scripts', 'test', 'legal']);

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
  if (TRUST_PROXY) {
    const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
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

async function readJsonBody(request, maxBytes = MAX_BODY_BYTES) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Слишком большой запрос.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Некорректный запрос.'), { status: 400 });
  }
}

function requireAdmin(request, response) {
  const session = getSession(request);
  if (!session) {
    json(response, 401, { error: 'Требуется вход в панель.' });
    return null;
  }
  return session;
}

function cleanText(value, maxLength, fallback = '') {
  const text = String(value ?? fallback).trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return text.slice(0, maxLength);
}

function validateContentItems(value, kind) {
  if (!Array.isArray(value) || value.length > 200) throw Object.assign(new Error('Некорректный список контента.'), { status: 400 });
  const ids = new Set();
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Object.assign(new Error('Некорректная запись контента.'), { status: 400 });
    const id = cleanText(raw.id, 100);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) throw Object.assign(new Error('Некорректный или повторяющийся идентификатор.'), { status: 400 });
    ids.add(id);
    const title = cleanText(raw.title, 180);
    if (!title) throw Object.assign(new Error('У каждой записи должно быть название.'), { status: 400 });
    const item = { ...raw, id, title, published: Boolean(raw.published) };
    const image = cleanText(raw.image, 4 * 1024 * 1024);
    if (image && !image.startsWith('data:image/webp;base64,') && !/^(?:https:\/\/|assets\/)[^\s]+$/i.test(image)) {
      throw Object.assign(new Error('Недопустимый адрес изображения.'), { status: 400 });
    }
    item.image = image;
    if (kind === 'product') {
      item.status = ['available', 'reserved', 'sold', 'ask'].includes(raw.status) ? raw.status : 'ask';
      item.price = cleanText(raw.price, 20);
    }
    return item;
  });
}

async function publicContent(response) {
  const content = await database.getPublicContent();
  return json(response, 200, content, { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' });
}

async function createLead(request, response) {
  const limit = publicWriteLimiter.consume(getClientIp(request));
  if (!limit.allowed) return json(response, 429, { error: 'Слишком много запросов. Попробуйте позже.' }, { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) });
  const body = await readJsonBody(request);
  if (body.consent !== true || body.consentVersion !== CONSENT_VERSION) {
    return json(response, 400, { error: 'Нужно подтвердить согласие на обработку персональных данных.' });
  }
  const type = ['portrait', 'certificate', 'product'].includes(body.type) ? body.type : 'portrait';
  const channel = ['telegram', 'max', 'phone', 'site'].includes(body.channel) ? body.channel : 'site';
  const name = cleanText(body.name, 120);
  const detail = cleanText(body.detail, 2000);
  const title = {
    portrait: 'Заявка на портрет',
    certificate: 'Интерес к подарочному сертификату',
    product: 'Интерес к готовой работе',
  }[type];
  const productId = cleanText(body.productId, 100);
  if (!detail && type === 'portrait') return json(response, 400, { error: 'Добавьте краткое описание заказа.' });
  const now = new Date();
  const evidenceBase = `${getClientIp(request)}|${request.headers['user-agent'] || ''}|${body.formId || ''}`;
  const result = await database.insertLead({
    type,
    channel,
    title,
    productId,
    name,
    detail,
    consentVersion: CONSENT_VERSION,
    consentAt: now,
    source: cleanText(body.source, 60, 'website'),
    evidence: { requestHash: database.hashEvidence(evidenceBase), formId: cleanText(body.formId, 80) },
  });
  return json(response, 201, { ok: true, id: result.id });
}

async function recordEvents(request, response) {
  const limit = publicWriteLimiter.consume(getClientIp(request));
  if (!limit.allowed) return json(response, 429, { error: 'Слишком много запросов.' });
  const body = await readJsonBody(request, 32 * 1024);
  if (body.consent !== true || body.consentVersion !== 'analytics-2026-08-17') return json(response, 400, { error: 'Нет согласия на аналитику.' });
  const values = Array.isArray(body.events) ? body.events.slice(0, 20) : [];
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const events = values.map((raw) => {
    const visitorId = cleanText(raw.visitorId, 36);
    const sessionId = cleanText(raw.sessionId, 36);
    if (!uuidPattern.test(visitorId) || !uuidPattern.test(sessionId)) throw Object.assign(new Error('Некорректный идентификатор аналитики.'), { status: 400 });
    const occurredAt = new Date(raw.occurredAt);
    if (Number.isNaN(occurredAt.getTime()) || Math.abs(Date.now() - occurredAt.getTime()) > 24 * 60 * 60 * 1000) throw Object.assign(new Error('Некорректное время события.'), { status: 400 });
    const properties = Object.fromEntries(Object.entries(raw.properties || {}).filter(([, entry]) => ['string', 'number', 'boolean'].includes(typeof entry)).slice(0, 20).map(([key, entry]) => [cleanText(key, 50), typeof entry === 'string' ? cleanText(entry, 120) : entry]));
    return { visitorId, sessionId, name: cleanText(raw.name, 80), page: cleanText(raw.page, 120, '/'), properties, occurredAt };
  }).filter((event) => event.name);
  if (events.length) await database.insertAnalyticsEvents(events, 'analytics-2026-08-17');
  return json(response, 202, { ok: true, accepted: events.length });
}

async function adminSnapshot(request, response) {
  const session = requireAdmin(request, response);
  if (!session) return;
  return json(response, 200, await database.getAdminSnapshot());
}

async function replaceAdminContent(request, response, kind) {
  const session = requireAdmin(request, response);
  if (!session) return;
  const body = await readJsonBody(request, MAX_CONTENT_BODY_BYTES);
  const items = validateContentItems(body.items, kind);
  await database.replaceContent(kind, items, session.email);
  return json(response, 200, { ok: true, count: items.length });
}

async function changeLeadStatus(request, response, id) {
  const session = requireAdmin(request, response);
  if (!session) return;
  const body = await readJsonBody(request);
  const status = cleanText(body.status, 30);
  if (!['new', 'contacted', 'in_progress', 'completed', 'archived'].includes(status)) return json(response, 400, { error: 'Некорректный статус.' });
  await database.updateLeadStatus(id, status, session.email);
  return json(response, 200, { ok: true });
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
  const relativeParts = relative.split(/[\\/]/);
  const extension = path.extname(relative).toLowerCase();
  if (!target.startsWith(`${ROOT}${path.sep}`)
      || relativeParts.some((part) => part.startsWith('.'))
      || DENIED_DIRECTORIES.has(relativeParts[0])
      || DENIED_FILES.has(relative)
      || ['.mjs', '.sql', '.md', '.lock'].includes(extension)) {
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

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && pathname.startsWith('/api/') && !verifySameOrigin(request)) {
      return json(response, 403, { error: 'Запрос отклонён.' });
    }
    if (request.method === 'POST' && pathname === '/api/auth/request-code') return await requestLoginCode(request, response);
    if (request.method === 'POST' && pathname === '/api/auth/verify-code') return await confirmLoginCode(request, response);
    if (request.method === 'POST' && pathname === '/api/auth/logout') return logout(request, response);
    if (request.method === 'GET' && pathname === '/api/auth/session') {
      return json(response, getSession(request) ? 200 : 401, { authenticated: Boolean(getSession(request)) });
    }
    if (request.method === 'GET' && pathname === '/api/health') {
      const databaseStatus = database.databaseEnabled ? await database.checkDatabase().then(() => 'ok').catch(() => 'error') : 'not_configured';
      return json(response, databaseStatus === 'error' ? 503 : 200, { status: 'ok', database: databaseStatus });
    }
    if (request.method === 'GET' && pathname === '/api/content') return await publicContent(response);
    if (request.method === 'POST' && pathname === '/api/leads') return await createLead(request, response);
    if (request.method === 'POST' && pathname === '/api/events') return await recordEvents(request, response);
    if (request.method === 'GET' && pathname === '/api/admin/snapshot') return await adminSnapshot(request, response);
    if (request.method === 'PUT' && pathname === '/api/admin/portfolio') return await replaceAdminContent(request, response, 'portfolio');
    if (request.method === 'PUT' && pathname === '/api/admin/products') return await replaceAdminContent(request, response, 'product');
    const leadStatusMatch = pathname.match(/^\/api\/admin\/leads\/([0-9a-f-]{36})$/i);
    if (request.method === 'PATCH' && leadStatusMatch) return await changeLeadStatus(request, response, leadStatusMatch[1]);
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
  publicWriteLimiter.prune(now);
}, 5 * 60 * 1000);
cleanupTimer.unref();

server.listen(PORT, HOST, () => {
  console.log(`Сайт: http://localhost:${PORT}`);
  console.log(`Админка: http://localhost:${PORT}/admin`);
  if (!isConfigured()) console.warn('Авторизация не настроена: запустите node scripts/setup-auth.mjs');
});
