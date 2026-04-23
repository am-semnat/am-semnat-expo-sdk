//
//  InputValidation.ts
//  @amsemnat/expo-sdk
//
//  Copyright 2026 am-semnat contributors.
//  Licensed under the Apache License, Version 2.0. See LICENSE.
//

import { AmSemnatError } from './errors';

/**
 * Port of `Sources/AmSemnat/Internal/InputValidation.swift` from the iOS SDK.
 * Runs JS-side before any bridge call so consumers fail fast with the exact
 * same error shape the native layer would have produced anyway.
 *
 * Keep in lockstep with the iOS and Android rules — a divergence here means
 * two different platforms reject the same input with two different codes.
 */

const ASCII_DIGIT = /^[0-9]+$/;

/** CAN must be exactly 6 ASCII digits. */
export function validateCan(can: string): void {
  if (can.length !== 6) {
    throw new AmSemnatError('INVALID_INPUT', `Invalid can: must be 6 digits, got ${can.length}`, {
      parameter: 'can',
      detail: `must be 6 digits, got ${can.length}`,
    });
  }
  if (!ASCII_DIGIT.test(can)) {
    throw new AmSemnatError('INVALID_INPUT', 'Invalid can: must be numeric', {
      parameter: 'can',
      detail: 'must be numeric',
    });
  }
}

/** PIN must be 4 or 6 ASCII digits. `parameter` is `"pin1"` or `"pin2"`. */
export function validatePin(pin: string, parameter: 'pin1' | 'pin2'): void {
  if (pin.length !== 4 && pin.length !== 6) {
    throw new AmSemnatError(
      'INVALID_INPUT',
      `Invalid ${parameter}: must be 4 or 6 digits, got ${pin.length}`,
      { parameter, detail: `must be 4 or 6 digits, got ${pin.length}` },
    );
  }
  if (!ASCII_DIGIT.test(pin)) {
    throw new AmSemnatError('INVALID_INPUT', `Invalid ${parameter}: must be numeric`, {
      parameter,
      detail: 'must be numeric',
    });
  }
}

/**
 * The PDF hash must be a 48-byte SHA-384 digest, supplied as base64. Mirrors
 * `validatePdfHash` in iOS/Android but consumes the encoded form to match
 * the TS API contract.
 */
export function validatePdfHashBase64(pdfHashBase64: string): void {
  const bytes = decodeBase64Length(pdfHashBase64);
  if (bytes !== 48) {
    throw new AmSemnatError(
      'INVALID_INPUT',
      `Invalid pdfHash: must be 48 bytes (SHA-384), got ${bytes}`,
      { parameter: 'pdfHash', detail: `must be 48 bytes (SHA-384), got ${bytes}` },
    );
  }
}

/**
 * signingTime must be an ISO 8601 string that parses back to a valid Date.
 * Matches what the native bridges feed into `ISO8601DateFormatter` /
 * `Instant.parse`.
 */
export function validateSigningTime(signingTime: string): void {
  const t = Date.parse(signingTime);
  if (Number.isNaN(t)) {
    throw new AmSemnatError(
      'INVALID_INPUT',
      `Invalid signingTime: not a parseable ISO 8601 timestamp: ${signingTime}`,
      { parameter: 'signingTime', detail: 'must be an ISO 8601 timestamp' },
    );
  }
}

/**
 * Computes the decoded byte length of a base64 string without materializing
 * the bytes. Throws `INVALID_INPUT` if the encoding is malformed.
 */
function decodeBase64Length(encoded: string): number {
  // Accept standard and URL-safe alphabets; tolerate missing padding.
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new AmSemnatError('INVALID_INPUT', 'Invalid pdfHash: not valid base64', {
      parameter: 'pdfHash',
      detail: 'not valid base64',
    });
  }
  const padded = normalized.length % 4 === 0
    ? normalized
    : normalized + '='.repeat(4 - (normalized.length % 4));
  const paddingChars = padded.endsWith('==') ? 2 : padded.endsWith('=') ? 1 : 0;
  return (padded.length * 3) / 4 - paddingChars;
}
