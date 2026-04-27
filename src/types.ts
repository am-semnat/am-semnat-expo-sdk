//
//  types.ts
//  @amsemnat/expo-sdk
//
//  Copyright 2026 am-semnat contributors.
//  Licensed under the Apache License, Version 2.0. See LICENSE.
//

/**
 * LDS data groups the SDK can read from a Romanian CEI card. Matches the
 * iOS and Android public enums exactly; the native bridges translate these
 * strings to the corresponding native case before delegating.
 *
 * `DG15` (Active Authentication) is intentionally omitted from 0.x.
 */
export type DataGroup = 'DG1' | 'DG2' | 'DG7' | 'DG14';

/**
 * Default set of data groups read when `readIdentity` is called without the
 * `dataGroups` option. Mirrors `DataGroup.default` in Swift /
 * `DataGroup.DEFAULT` in Kotlin.
 */
export const DEFAULT_DATA_GROUPS: DataGroup[] = ['DG1', 'DG2', 'DG14'];

/**
 * On-screen copy for the iOS `NFCTagReaderSession` sheet. Android has no
 * system NFC sheet in reader mode — `NfcAdapter.enableReaderMode` hands
 * the tag to the app and the UI is entirely the app's responsibility —
 * so these fields are ignored on Android; render your own progress UI
 * from the `onProgress` callback. Defaults are intentionally English and
 * neutral — consumer apps should pass a localized variant.
 *
 * Progress template — `progressFormat` uses token substitution (not printf):
 *   `{phase}`   → the `scanning` string
 *   `{percent}` → the SDK's per-DG progress (0-100) as an integer
 * English default is `"{phase} — {percent}%"`. Set `progressFormat = ''`
 * to suppress the percentage and show `scanning` verbatim.
 */
export interface NfcMessages {
  readyToScan: string;
  authenticating: string;
  scanning: string;
  progressFormat: string;
  success: string;
  tagLost: string;
}

export const DEFAULT_NFC_MESSAGES: NfcMessages = {
  readyToScan: 'Hold your ID card near the top of the device.',
  authenticating: 'Authenticating…',
  scanning: 'Keep holding still…',
  progressFormat: '{phase} — {percent}%',
  success: 'Done.',
  tagLost: 'Card moved — please try again.',
};

/**
 * Flat identity record returned by `readIdentity`. Every field is optional
 * except `chipAuthenticated`; a field is populated only when the relevant
 * data group was both requested and successfully read.
 *
 * `chipAuthenticated` is a local-UX-only signal — for transferable evidence,
 * pair `rawSodBase64` + the `rawDg*Base64` fields with `verifyPassiveOffline`
 * or the `@amsemnat/verifier` service.
 */
export interface RomanianIdentity {
  cnp?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  sex?: string;
  nationality?: string;
  documentNumber?: string;
  dateOfExpiry?: string;
  placeOfBirth?: string;
  address?: string;
  issuingAuthority?: string;
  issuingDate?: string;
  faceImageBase64?: string;
  signatureImageBase64?: string;
  chipAuthenticated: boolean;
  rawSodBase64?: string;
  rawDg1Base64?: string;
  rawDg2Base64?: string;
  rawDg14Base64?: string;
}

/**
 * Three base64-encoded byte strings needed to assemble a PAdES B-B
 * `SignedData` structure and embed it into a PDF placeholder.
 *
 * - `signatureBase64` — raw 96-byte ECDSA P-384 `r || s`.
 * - `certificateBase64` — DER-encoded X.509 signing certificate from the card.
 * - `signedAttributesBase64` — DER-encoded CMS `SET OF Attribute`, ready to be
 *   placed in the `SignerInfo.signedAttrs` field.
 */
export interface RomanianSignature {
  signatureBase64: string;
  certificateBase64: string;
  signedAttributesBase64: string;
}

/**
 * Result of `verifyPassiveOffline`. `valid` is `true` only when the SOD
 * signature, certificate chain, and every supplied DG hash all pass.
 * Per-check failure strings are surfaced through `errors` for diagnostics.
 */
export interface PassiveVerificationResult {
  valid: boolean;
  errors: string[];
  signerCommonName?: string;
  signedAt?: string;
}

/** Options for `AmSemnat.readIdentity`. */
export interface ReadIdentityOptions {
  can: string;
  pin1: string;
  dataGroups?: DataGroup[];
  messages?: NfcMessages;
  onProgress?: (step: import('./progress').ReadProgress) => void;
}

/** Options for `AmSemnat.sign`. */
export interface SignOptions {
  can: string;
  pin2: string;
  pdfHashBase64: string;
  signingTime: string;
  messages?: NfcMessages;
  onProgress?: (step: import('./progress').SignProgress) => void;
}

/** Options for `AmSemnat.verifyPassiveOffline`. */
export interface VerifyPassiveOfflineOptions {
  rawSodBase64: string;
  dataGroups: Partial<Record<DataGroup, string>>;
  trustAnchorsBase64: string[];
}
