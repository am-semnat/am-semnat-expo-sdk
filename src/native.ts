//
//  native.ts
//  @amsemnat/expo-sdk
//
//  Copyright 2026 am-semnat contributors.
//  Licensed under the Apache License, Version 2.0. See LICENSE.
//

import { requireNativeModule } from 'expo-modules-core';

import type { DataGroup, PassiveVerificationResult, RomanianIdentity, RomanianSignature } from './types';
import type { NfcMessages } from './types';

/**
 * Payload passed to the native `readIdentity` async function. `opId` is the
 * JS-generated UUID used to route progress events back to the specific call.
 * `messages` is only consumed on iOS; Android ignores it because the system
 * NFC sheet is not customizable.
 */
export interface NativeReadArgs {
  opId: string;
  can: string;
  pin1: string;
  dataGroups: DataGroup[];
  messages: NfcMessages;
}

/** Payload for the native `sign` async function. */
export interface NativeSignArgs {
  opId: string;
  can: string;
  pin2: string;
  pdfHashBase64: string;
  signingTime: string;
  messages: NfcMessages;
}

/** Payload for `verifyPassiveOffline`. Pure in/out, no NFC. */
export interface NativeVerifyArgs {
  rawSodBase64: string;
  dataGroups: Partial<Record<DataGroup, string>>;
  trustAnchorsBase64: string[];
}

/** Event body for `onProgress`. */
export interface ProgressEvent {
  opId: string;
  kind: 'read' | 'sign';
  step: string;
}

/** Event body for `onLog`. */
export interface LogEvent {
  level: 'debug' | 'info' | 'error';
  message: string;
  error?: string;
}

/**
 * Shape of the Expo native module as seen from TS. The bridge implementations
 * must match this interface exactly; any drift becomes a runtime error.
 */
export interface AmSemnatBridgeSpec {
  isNfcAvailable(): Promise<boolean>;
  isNfcEnabled(): Promise<boolean>;
  setLoggerEnabled(enabled: boolean): Promise<void>;
  cancelCurrentOp(): Promise<void>;
  readIdentity(args: NativeReadArgs): Promise<RomanianIdentity>;
  sign(args: NativeSignArgs): Promise<RomanianSignature>;
  verifyPassiveOffline(args: NativeVerifyArgs): PassiveVerificationResult;
  addListener(event: string, listener: (payload: unknown) => void): { remove(): void };
  removeAllListeners(event: string): void;
}

/**
 * Singleton reference to the native Expo module, registered as
 * `AmSemnatBridge` in `expo-module.config.json`. `requireNativeModule` throws
 * synchronously if autolinking didn't pick up the module — usually a sign
 * that `npx expo prebuild` hasn't been run after installing the package.
 */
export const nativeModule: AmSemnatBridgeSpec =
  requireNativeModule<AmSemnatBridgeSpec>('AmSemnatBridge');
