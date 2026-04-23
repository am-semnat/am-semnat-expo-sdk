//
//  InputValidation.test.ts
//  @amsemnat/expo-sdk
//
//  Copyright 2026 am-semnat contributors.
//  Licensed under the Apache License, Version 2.0. See LICENSE.
//
//  Mirrors `Tests/AmSemnatTests/InputValidationTests.swift` from the iOS
//  SDK — every rule here must reject exactly the same inputs the native
//  layer would, so callers never see a divergence between the JS-side
//  fail-fast and what the bridge would have thrown.

import { AmSemnatError } from '../src/errors';
import {
  validateCan,
  validatePdfHashBase64,
  validatePin,
  validateSigningTime,
} from '../src/InputValidation';

function expectInvalidInput(fn: () => void, parameter: string): AmSemnatError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AmSemnatError);
    const e = err as AmSemnatError;
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.parameter).toBe(parameter);
    expect(typeof e.detail).toBe('string');
    return e;
  }
  throw new Error(`Expected ${parameter} validation to throw`);
}

describe('validateCan', () => {
  test.each(['123456', '000000', '999999'])('accepts "%s"', (can) => {
    expect(() => validateCan(can)).not.toThrow();
  });

  test.each(['', '1', '12345', '1234567'])('rejects "%s" for length', (can) => {
    const e = expectInvalidInput(() => validateCan(can), 'can');
    expect(e.detail).toContain('6 digits');
  });

  test.each(['12345a', 'abcdef', '12 345', '12.345', '12-345'])(
    'rejects "%s" as non-numeric',
    (can) => {
      const e = expectInvalidInput(() => validateCan(can), 'can');
      expect(e.detail).toBe('must be numeric');
    },
  );
});

describe('validatePin', () => {
  test.each(['1234', '123456'])('accepts "%s"', (pin) => {
    expect(() => validatePin(pin, 'pin1')).not.toThrow();
    expect(() => validatePin(pin, 'pin2')).not.toThrow();
  });

  test.each(['', '1', '12345', '1234567', '12'])('rejects "%s" for length', (pin) => {
    const e = expectInvalidInput(() => validatePin(pin, 'pin2'), 'pin2');
    expect(e.detail).toContain('4 or 6 digits');
  });

  test('parameter name is threaded into the error', () => {
    const e1 = expectInvalidInput(() => validatePin('abcd', 'pin1'), 'pin1');
    const e2 = expectInvalidInput(() => validatePin('abcd', 'pin2'), 'pin2');
    expect(e1.detail).toBe('must be numeric');
    expect(e2.detail).toBe('must be numeric');
  });
});

describe('validatePdfHashBase64', () => {
  // 48 bytes SHA-384 → 64 base64 chars, no padding.
  const fortyEightBytes = 'A'.repeat(64);
  // Construct a base64 that decodes to exactly 48 bytes.
  const fortyEightBytesValid = Buffer.alloc(48, 0xab).toString('base64');

  test('accepts a real 48-byte hash', () => {
    expect(() => validatePdfHashBase64(fortyEightBytesValid)).not.toThrow();
  });

  test('accepts a 64-char all-"A" base64 (48 bytes zero)', () => {
    expect(() => validatePdfHashBase64(fortyEightBytes)).not.toThrow();
  });

  test.each([
    [Buffer.alloc(32).toString('base64'), 32], // SHA-256 length
    [Buffer.alloc(47).toString('base64'), 47],
    [Buffer.alloc(64).toString('base64'), 64], // SHA-512 length
    ['', 0],
  ])('rejects wrong byte count (%d bytes)', (encoded, expectedLen) => {
    const e = expectInvalidInput(() => validatePdfHashBase64(encoded), 'pdfHash');
    expect(e.detail).toContain(`${expectedLen}`);
    expect(e.detail).toContain('48 bytes');
  });

  test('rejects malformed base64', () => {
    const e = expectInvalidInput(() => validatePdfHashBase64('!!!not base64!!!'), 'pdfHash');
    expect(e.detail).toContain('base64');
  });

  test('accepts URL-safe alphabet (`-`/`_` replacements)', () => {
    // 48 bytes of 0xFB → standard base64 would include `+` and `/`.
    const std = Buffer.alloc(48, 0xfb).toString('base64');
    const urlSafe = std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(() => validatePdfHashBase64(urlSafe)).not.toThrow();
  });
});

describe('validateSigningTime', () => {
  test.each([
    '2026-02-16T12:30:00Z',
    '2026-02-16T12:30:00.000Z',
    '2026-02-16T12:30:00+02:00',
  ])('accepts "%s"', (ts) => {
    expect(() => validateSigningTime(ts)).not.toThrow();
  });

  test.each(['', 'yesterday', 'not-a-date'])('rejects "%s"', (ts) => {
    const e = expectInvalidInput(() => validateSigningTime(ts), 'signingTime');
    expect(e.detail).toContain('ISO 8601');
  });

  // Note: `Date.parse` is lenient (accepts `2026/02/16`). The JS-side check
  // is coarse — the native bridges (iOS `ISO8601DateFormatter`, Kotlin
  // `Instant.parse`) do the strict validation. Don't tighten the regex
  // here without also refining the bridges, or consumers hit divergence.
});
