//
//  errors.ts
//  @amsemnat/expo-sdk
//
//  Copyright 2026 am-semnat contributors.
//  Licensed under the Apache License, Version 2.0. See LICENSE.
//

/**
 * Every error code surfaced from the native bridges, in sealed order. Must
 * stay in lockstep with `AmSemnatError` in the iOS and Android SDKs — new
 * codes require a coordinated release across all four packages.
 */
export const AM_SEMNAT_ERROR_CODES = [
  'NFC_UNAVAILABLE',
  'NFC_DISABLED',
  'SESSION_CANCELLED',
  'SESSION_TIMEOUT',
  'TAG_LOST',
  'TAG_NOT_VALID',
  'MULTIPLE_TAGS_FOUND',
  'PACE_AUTH_FAILED',
  'PIN_VERIFY_FAILED',
  'PIN_BLOCKED',
  'READ_FAILED',
  'SIGNING_FAILED',
  'INVALID_INPUT',
  'UNKNOWN',
] as const;

export type AmSemnatErrorCode = (typeof AM_SEMNAT_ERROR_CODES)[number];

/**
 * Optional fields carried alongside the code. Populated per-case:
 * - `retriesRemaining` — only on `PIN_VERIFY_FAILED`.
 * - `parameter` — only on `INVALID_INPUT` (`"can"` / `"pin1"` / `"pin2"` /
 *   `"pdfHash"`).
 * - `detail` — diagnostic text on `READ_FAILED`, `SIGNING_FAILED`,
 *   `INVALID_INPUT`, `UNKNOWN`.
 */
export interface AmSemnatErrorInfo {
  retriesRemaining?: number;
  parameter?: string;
  detail?: string;
}

/**
 * Shape the native bridges serialize into. Both platforms encode the
 * structured payload as a JSON sentinel suffix on the error message
 * (`<message>{…}`) because Expo's iOS `Promise.reject` only exposes
 * `(code, description)` to JS — it has no userInfo channel. Android uses
 * the same encoding for symmetry.
 *
 * @internal
 */
export interface NativeErrorShape {
  code?: string;
  message?: string;
}

/** Record-separator control character used to delimit the JSON info payload. */
export const INFO_SENTINEL = '';

/**
 * Thrown from every public `AmSemnat` method. Preserves `instanceof`
 * equality so callers can `try { … } catch (err) { if (err instanceof
 * AmSemnatError && err.code === 'PIN_VERIFY_FAILED') … }` safely.
 */
export class AmSemnatError extends Error {
  public readonly code: AmSemnatErrorCode;
  public readonly retriesRemaining?: number;
  public readonly parameter?: string;
  public readonly detail?: string;

  constructor(code: AmSemnatErrorCode, message: string, info: AmSemnatErrorInfo = {}) {
    super(message);
    this.name = 'AmSemnatError';
    this.code = code;
    if (info.retriesRemaining !== undefined) this.retriesRemaining = info.retriesRemaining;
    if (info.parameter !== undefined) this.parameter = info.parameter;
    if (info.detail !== undefined) this.detail = info.detail;
    Object.setPrototypeOf(this, AmSemnatError.prototype);
  }
}

const KNOWN_CODES: ReadonlySet<AmSemnatErrorCode> = new Set(AM_SEMNAT_ERROR_CODES);

function isKnownCode(value: unknown): value is AmSemnatErrorCode {
  return typeof value === 'string' && KNOWN_CODES.has(value as AmSemnatErrorCode);
}

function readNumber(source: Record<string, unknown>, key: string): number | undefined {
  const raw = source[key];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const raw = source[key];
  return typeof raw === 'string' ? raw : undefined;
}

/**
 * Extracts the info payload from a native error message. The native bridges
 * append `<sentinel><json>` when there's structured data to carry; this
 * helper splits on the sentinel and returns `{ cleanMessage, info }`.
 *
 * If the message contains no sentinel, or the trailing segment is not
 * parseable JSON, the original message is returned unchanged and `info` is
 * an empty object.
 */
export function splitInfoSuffix(message: string): {
  cleanMessage: string;
  info: Record<string, unknown>;
} {
  const idx = message.indexOf(INFO_SENTINEL);
  if (idx < 0) return { cleanMessage: message, info: {} };
  const head = message.slice(0, idx);
  const tail = message.slice(idx + INFO_SENTINEL.length);
  try {
    const parsed = JSON.parse(tail);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { cleanMessage: head, info: parsed as Record<string, unknown> };
    }
  } catch {
    // Malformed suffix — fall through and preserve the raw message so the
    // caller still sees something useful.
  }
  return { cleanMessage: message, info: {} };
}

/**
 * Normalizes whatever the native bridge threw into an `AmSemnatError`.
 * Already-wrapped `AmSemnatError` instances pass through unchanged.
 *
 * The native layer is the source of truth for the `code`; this helper only
 * falls back to `'UNKNOWN'` when the error is missing a code (non-bridge
 * exception) or carries a code outside the frozen taxonomy.
 */
export function fromNativeError(err: unknown): AmSemnatError {
  if (err instanceof AmSemnatError) return err;

  const shape = (err ?? {}) as NativeErrorShape;
  const rawCode = shape.code;
  const code: AmSemnatErrorCode = isKnownCode(rawCode) ? rawCode : 'UNKNOWN';

  const rawMessage =
    typeof shape.message === 'string' && shape.message.length > 0
      ? shape.message
      : err instanceof Error
        ? err.message
        : String(err);

  const { cleanMessage, info: payload } = splitInfoSuffix(rawMessage);

  const info: AmSemnatErrorInfo = {};
  const retries = readNumber(payload, 'retriesRemaining');
  if (retries !== undefined) info.retriesRemaining = retries;
  const parameter = readString(payload, 'parameter');
  if (parameter !== undefined) info.parameter = parameter;
  const detail = readString(payload, 'detail');
  if (detail !== undefined) info.detail = detail;

  return new AmSemnatError(code, cleanMessage, info);
}
