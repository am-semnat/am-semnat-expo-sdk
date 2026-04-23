//
//  index.ts
//  @amsemnat/expo-sdk
//
//  Copyright 2026 am-semnat contributors.
//  Licensed under the Apache License, Version 2.0. See LICENSE.
//

export { AmSemnat } from './AmSemnat';
export { AmSemnatError } from './errors';
export type { AmSemnatErrorCode, AmSemnatErrorInfo } from './errors';
export type { AmSemnatLogger } from './logger';
export type { ReadProgress, SignProgress } from './progress';
export {
  DEFAULT_DATA_GROUPS,
  DEFAULT_NFC_MESSAGES,
} from './types';
export type {
  DataGroup,
  NfcMessages,
  PassiveVerificationResult,
  ReadIdentityOptions,
  RomanianIdentity,
  RomanianSignature,
  SignOptions,
  VerifyPassiveOfflineOptions,
} from './types';
