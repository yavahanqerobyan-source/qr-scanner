import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const HASH_BYTES = 64;

export async function hashPassword(password, salt = randomBytes(16)) {
  if (typeof password !== 'string' || password.length < 6) {
    throw new Error('Пароль должен содержать не менее 6 символов.');
  }
  const derived = await scrypt(password, salt, HASH_BYTES);
  return `scrypt$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}

export async function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') return false;
  const [algorithm, encodedSalt, encodedHash] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !encodedSalt || !encodedHash) return false;

  try {
    const salt = Buffer.from(encodedSalt, 'base64url');
    const expected = Buffer.from(encodedHash, 'base64url');
    if (salt.length < 16 || expected.length !== HASH_BYTES) return false;
    const actual = Buffer.from(await scrypt(password, salt, expected.length));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function digestOtp(code, challengeId, secret) {
  return createHmac('sha256', secret).update(`${challengeId}:${code}`).digest();
}

export function verifyOtp(code, challengeId, secret, expectedDigest) {
  if (!expectedDigest || typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  const actual = digestOtp(code, challengeId, secret);
  return actual.length === expectedDigest.length && timingSafeEqual(actual, expectedDigest);
}

export class SlidingWindowLimiter {
  constructor({ limit, windowMs }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.entries = new Map();
  }

  consume(key, now = Date.now()) {
    const cutoff = now - this.windowMs;
    const attempts = (this.entries.get(key) || []).filter((time) => time > cutoff);
    if (attempts.length >= this.limit) {
      this.entries.set(key, attempts);
      return { allowed: false, retryAfterMs: attempts[0] + this.windowMs - now };
    }
    attempts.push(now);
    this.entries.set(key, attempts);
    return { allowed: true, retryAfterMs: 0 };
  }

  reset(key) {
    this.entries.delete(key);
  }

  prune(now = Date.now()) {
    const cutoff = now - this.windowMs;
    for (const [key, attempts] of this.entries) {
      const recent = attempts.filter((time) => time > cutoff);
      if (recent.length) this.entries.set(key, recent);
      else this.entries.delete(key);
    }
  }
}
