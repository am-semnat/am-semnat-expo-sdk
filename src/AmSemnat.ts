//
//  AmSemnat.ts
//  @amsemnat/expo-sdk
//
//  Copyright 2026 am-semnat contributors.
//  Licensed under the Apache License, Version 2.0. See LICENSE.
//

import { uuid } from 'expo-modules-core';

import { fromNativeError } from './errors';
import { registerProgress, setInstalledLogger } from './events';
import {
  validateCan,
  validatePdfHashBase64,
  validatePin,
  validateSigningTime,
} from './InputValidation';
import type { AmSemnatLogger } from './logger';
import { nativeModule } from './native';
import type { ReadProgress, SignProgress } from './progress';
import {
  DEFAULT_DATA_GROUPS,
  DEFAULT_NFC_MESSAGES,
  type PassiveVerificationResult,
  type ReadIdentityOptions,
  type RomanianIdentity,
  type RomanianSignature,
  type SignOptions,
  type VerifyPassiveOfflineOptions,
} from './types';

/**
 * Entry point for the am-semnat Expo SDK. Thin delegation to the native
 * bridge (`AmSemnatBridge`) — JS-side input validation runs first so callers
 * fail fast with the same `INVALID_INPUT` shape the native layer would
 * produce. Progress is fanned out through a shared event bus keyed by a
 * per-call `opId`.
 */
export const AmSemnat = {
  isNfcAvailable(): Promise<boolean> {
    return nativeModule.isNfcAvailable();
  },

  /** On iOS returns the same value as `isNfcAvailable` — no system-level toggle exists. */
  isNfcEnabled(): Promise<boolean> {
    return nativeModule.isNfcEnabled();
  },

  /** Pass `null` to detach. */
  setLogger(logger: AmSemnatLogger | null): void {
    setInstalledLogger(logger);
  },

  /**
   * Cancels the in-flight `readIdentity` / `sign`, if any. The awaiting
   * promise rejects with `AmSemnatError` code `'SESSION_CANCELLED'`.
   * No-op when nothing is in flight.
   *
   * Typical use: call from a screen's `useFocusEffect` cleanup so navigating
   * away tears down the NFC session cleanly. Android has no system sheet,
   * so without this hook a reader-mode session survives in-app navigation
   * and blocks the next `readIdentity` call.
   */
  cancelCurrentOp(): Promise<void> {
    return nativeModule.cancelCurrentOp();
  },

  /** Pass `pin1: ''` to skip eDATA; the personal-id / issuing-authority / address fields will then be `undefined`. */
  async readIdentity(options: ReadIdentityOptions): Promise<RomanianIdentity> {
    const { can, pin1, dataGroups, messages, onProgress } = options;
    validateCan(can);
    if (pin1.length > 0) validatePin(pin1, 'pin1');

    const opId = uuid.v4();
    const unregister = registerProgress<ReadProgress>(opId, onProgress);
    try {
      return await nativeModule.readIdentity({
        opId,
        can,
        pin1,
        dataGroups: dataGroups ?? DEFAULT_DATA_GROUPS,
        messages: messages ?? DEFAULT_NFC_MESSAGES,
      });
    } catch (err) {
      throw fromNativeError(err);
    } finally {
      unregister();
    }
  },

  /** `pdfHashBase64` must decode to exactly 48 bytes (SHA-384 of the PDF byte range). */
  async sign(options: SignOptions): Promise<RomanianSignature> {
    const { can, pin2, pdfHashBase64, signingTime, messages, onProgress } = options;
    validateCan(can);
    validatePin(pin2, 'pin2');
    validatePdfHashBase64(pdfHashBase64);
    validateSigningTime(signingTime);

    const opId = uuid.v4();
    const unregister = registerProgress<SignProgress>(opId, onProgress);
    try {
      return await nativeModule.sign({
        opId,
        can,
        pin2,
        pdfHashBase64,
        signingTime,
        messages: messages ?? DEFAULT_NFC_MESSAGES,
      });
    } catch (err) {
      throw fromNativeError(err);
    } finally {
      unregister();
    }
  },

  verifyPassiveOffline(options: VerifyPassiveOfflineOptions): PassiveVerificationResult {
    try {
      return nativeModule.verifyPassiveOffline({
        rawSodBase64: options.rawSodBase64,
        dataGroups: options.dataGroups,
        trustAnchorsBase64: options.trustAnchorsBase64,
      });
    } catch (err) {
      throw fromNativeError(err);
    }
  },
};
