//
//  logger.ts
//  @amsemnat/expo-sdk
//
//  Copyright 2026 am-semnat contributors.
//  Licensed under the Apache License, Version 2.0. See LICENSE.
//

/**
 * Optional diagnostic sink installed with `AmSemnat.setLogger`. Messages and
 * errors are forwarded from the native SDKs (iOS `AmSemnatLogger` protocol,
 * Android `AmSemnatLogger` interface) through the Expo event bus.
 *
 * Implementations must treat `message` as potentially sensitive — the native
 * SDKs already redact CAN and PIN bytes, but callers writing their own logs
 * on top should continue to scrub PII before persisting.
 */
export interface AmSemnatLogger {
  debug(message: string): void;
  info(message: string): void;
  error(message: string, error?: Error): void;
}
