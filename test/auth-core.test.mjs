import test from 'node:test';
import assert from 'node:assert/strict';
import { digestOtp, hashPassword, SlidingWindowLimiter, verifyOtp, verifyPassword } from '../auth-core.mjs';

test('scrypt hash accepts the correct password and rejects another value', async () => {
  const hash = await hashPassword('test-password-2026');
  assert.match(hash, /^scrypt\$[^$]+\$[^$]+$/);
  assert.equal(await verifyPassword('test-password-2026', hash), true);
  assert.equal(await verifyPassword('another-password', hash), false);
  assert.equal(await verifyPassword('test-password-2026', 'invalid'), false);
});

test('OTP digest is bound to code, challenge and secret', () => {
  const expected = digestOtp('123456', 'challenge-a', 'a-long-test-secret-value-for-otp');
  assert.equal(verifyOtp('123456', 'challenge-a', 'a-long-test-secret-value-for-otp', expected), true);
  assert.equal(verifyOtp('123457', 'challenge-a', 'a-long-test-secret-value-for-otp', expected), false);
  assert.equal(verifyOtp('123456', 'challenge-b', 'a-long-test-secret-value-for-otp', expected), false);
});

test('sliding window limiter blocks and resets attempts', () => {
  const limiter = new SlidingWindowLimiter({ limit: 2, windowMs: 1000 });
  assert.equal(limiter.consume('client', 1000).allowed, true);
  assert.equal(limiter.consume('client', 1100).allowed, true);
  assert.equal(limiter.consume('client', 1200).allowed, false);
  assert.equal(limiter.consume('client', 2101).allowed, true);
  limiter.reset('client');
  assert.equal(limiter.consume('client', 2200).allowed, true);
});
