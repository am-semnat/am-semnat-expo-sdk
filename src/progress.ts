//
//  progress.ts
//  @amsemnat/expo-sdk
//
//  Copyright 2026 am-semnat contributors.
//  Licensed under the Apache License, Version 2.0. See LICENSE.
//

/**
 * Phases reported while `AmSemnat.readIdentity` is running. The native bridges
 * emit the string representation of the matching native enum case verbatim;
 * the iOS raw values are the source of truth and the Android bridge
 * camel-cases its `SCREAMING_SNAKE_CASE` enum before emitting so the JS
 * payload is platform-independent.
 *
 * Ordering on a successful read, with CA enabled:
 * `paceEstablishing → readingDg14 → chipAuthenticating → readingDg1 →
 *  readingDg2 → readingDg7 → readingDg11 → readingEData → complete`.
 * DG14 can fire before the other DGs because the vendored reader needs its
 * keys for chip authentication; consumers should localize each value
 * independently rather than depending on the order.
 */
export type ReadProgress =
  | 'paceEstablishing'
  | 'readingDg1'
  | 'readingDg2'
  | 'readingDg7'
  | 'readingDg11'
  | 'readingDg14'
  | 'chipAuthenticating'
  | 'readingEData'
  | 'complete';

/**
 * Phases reported while `AmSemnat.sign` is running.
 * `paceEstablishing → verifyingPin → readingCertificate → signing → complete`.
 */
export type SignProgress =
  | 'paceEstablishing'
  | 'verifyingPin'
  | 'readingCertificate'
  | 'signing'
  | 'complete';
