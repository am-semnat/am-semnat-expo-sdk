//
//  errors.test.ts
//  @amsemnat/expo-sdk
//
//  Copyright 2026 am-semnat contributors.
//  Licensed under the Apache License, Version 2.0. See LICENSE.
//
//  Round-trips every `AmSemnatErrorCode` through the native-error shape the
//  bridges produce (`{ code, message }` where `message` carries a JSON
//  sentinel suffix) and asserts that `fromNativeError` reassembles the
//  structured fields (`retriesRemaining` / `parameter` / `detail`). The
//  sentinel format is what Expo's iOS `Promise.reject` forces on us (no
//  userInfo channel), and the Android bridge follows suit for symmetry.

import {
  AmSemnatError,
  type AmSemnatErrorCode,
  fromNativeError,
  INFO_SENTINEL,
  splitInfoSuffix,
} from '../src/errors';

function nativeShape(code: string, message: string, info?: Record<string, unknown>) {
  const suffix = info && Object.keys(info).length > 0 ? INFO_SENTINEL + JSON.stringify(info) : '';
  return { code, message: message + suffix };
}

describe('AmSemnatError', () => {
  test('preserves instanceof after construction', () => {
    const err = new AmSemnatError('TAG_LOST', 'gone');
    expect(err).toBeInstanceOf(AmSemnatError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('TAG_LOST');
    expect(err.name).toBe('AmSemnatError');
  });

  test('name is fixed so catch-and-serialize stays stable', () => {
    const err = new AmSemnatError('UNKNOWN', 'boom');
    expect(err.name).toBe('AmSemnatError');
  });
});

describe('splitInfoSuffix', () => {
  test('returns raw message when no sentinel is present', () => {
    expect(splitInfoSuffix('plain')).toEqual({ cleanMessage: 'plain', info: {} });
  });

  test('splits on sentinel and parses JSON', () => {
    const raw = `msg${INFO_SENTINEL}{"retriesRemaining":2}`;
    expect(splitInfoSuffix(raw)).toEqual({
      cleanMessage: 'msg',
      info: { retriesRemaining: 2 },
    });
  });

  test('falls back to raw message when the JSON tail is malformed', () => {
    const raw = `msg${INFO_SENTINEL}not-json`;
    expect(splitInfoSuffix(raw)).toEqual({ cleanMessage: raw, info: {} });
  });

  test('ignores JSON arrays (only objects carry info)', () => {
    const raw = `msg${INFO_SENTINEL}[1,2,3]`;
    expect(splitInfoSuffix(raw)).toEqual({ cleanMessage: raw, info: {} });
  });
});

describe('fromNativeError', () => {
  test.each<[AmSemnatErrorCode]>([
    ['NFC_UNAVAILABLE'],
    ['NFC_DISABLED'],
    ['SESSION_CANCELLED'],
    ['SESSION_TIMEOUT'],
    ['TAG_LOST'],
    ['TAG_NOT_VALID'],
    ['MULTIPLE_TAGS_FOUND'],
    ['PACE_AUTH_FAILED'],
    ['PIN_BLOCKED'],
  ])('passes plain %s through unchanged', (code) => {
    const err = fromNativeError(nativeShape(code, `human ${code}`));
    expect(err).toBeInstanceOf(AmSemnatError);
    expect(err.code).toBe(code);
    expect(err.message).toBe(`human ${code}`);
    expect(err.retriesRemaining).toBeUndefined();
    expect(err.parameter).toBeUndefined();
    expect(err.detail).toBeUndefined();
  });

  test('PIN_VERIFY_FAILED carries retriesRemaining', () => {
    const err = fromNativeError(
      nativeShape('PIN_VERIFY_FAILED', 'PIN verify failed: 2 retries remaining', {
        retriesRemaining: 2,
      }),
    );
    expect(err.code).toBe('PIN_VERIFY_FAILED');
    expect(err.retriesRemaining).toBe(2);
    expect(err.message).toBe('PIN verify failed: 2 retries remaining');
  });

  test('INVALID_INPUT carries parameter and detail', () => {
    const err = fromNativeError(
      nativeShape('INVALID_INPUT', 'Invalid can: must be numeric', {
        parameter: 'can',
        detail: 'must be numeric',
      }),
    );
    expect(err.code).toBe('INVALID_INPUT');
    expect(err.parameter).toBe('can');
    expect(err.detail).toBe('must be numeric');
  });

  test.each<[AmSemnatErrorCode]>([['READ_FAILED'], ['SIGNING_FAILED'], ['UNKNOWN']])(
    '%s carries detail',
    (code) => {
      const err = fromNativeError(nativeShape(code, 'human', { detail: 'the why' }));
      expect(err.code).toBe(code);
      expect(err.detail).toBe('the why');
    },
  );

  test('unknown native codes fall back to UNKNOWN but preserve the message', () => {
    const err = fromNativeError({ code: 'NOT_A_REAL_CODE', message: 'what' });
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toBe('what');
  });

  test('native errors without a code fall back to UNKNOWN', () => {
    const err = fromNativeError({ message: 'hmm' });
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toBe('hmm');
  });

  test('an already-wrapped AmSemnatError passes through', () => {
    const original = new AmSemnatError('PIN_BLOCKED', 'blocked');
    expect(fromNativeError(original)).toBe(original);
  });

  test('numeric retriesRemaining arrives when the bridge serialized a string', () => {
    // Defensive: no current serializer produces this shape, but the parser
    // tolerates it so a future bridge change doesn't silently drop the field.
    const err = fromNativeError(
      nativeShape('PIN_VERIFY_FAILED', 'x', { retriesRemaining: '1' }),
    );
    expect(err.retriesRemaining).toBe(1);
  });
});

describe('sentinel round-trip (native → JS)', () => {
  test('Swift-style encode reproduces what fromNativeError expects', () => {
    // Mirrors the encode path in `AmSemnatBridge.swift`
    // (`<message><sentinel><json>`) and the Android `BridgeCodedException.from`.
    const info = { retriesRemaining: 0 };
    const message = `PIN verify failed: 0 retries remaining${INFO_SENTINEL}${JSON.stringify(info)}`;
    const err = fromNativeError({ code: 'PIN_VERIFY_FAILED', message });
    expect(err.code).toBe('PIN_VERIFY_FAILED');
    expect(err.retriesRemaining).toBe(0);
    expect(err.message).toBe('PIN verify failed: 0 retries remaining');
  });
});
