//
//  events.ts
//  @amsemnat/expo-sdk
//
//  Copyright 2026 am-semnat contributors.
//  Licensed under the Apache License, Version 2.0. See LICENSE.
//

import type { AmSemnatLogger } from './logger';
import type { LogEvent, ProgressEvent } from './native';
import { nativeModule } from './native';
import type { ReadProgress, SignProgress } from './progress';

/**
 * Routes native `onProgress` events to per-op callbacks keyed by `opId`.
 * `readIdentity` / `sign` each generate a UUID, register the callback here,
 * call the native async function with the same `opId`, and unregister on
 * resolve or reject.
 *
 * The native bridges emit the full camelCase step string verbatim
 * (`paceEstablishing`, `readingDg1`, …) so no mapping table is needed — the
 * event payload is already in `ReadProgress | SignProgress` form.
 */

type AnyProgress = ReadProgress | SignProgress;

interface Subscription {
  remove(): void;
}

const progressCallbacks = new Map<string, (step: AnyProgress) => void>();
let progressSub: Subscription | null = null;

function ensureProgressSubscribed(): void {
  if (progressSub) return;
  progressSub = nativeModule.addListener('onProgress', (payload) => {
    const evt = payload as ProgressEvent;
    const cb = progressCallbacks.get(evt.opId);
    if (!cb) return;
    cb(evt.step as AnyProgress);
  });
}

function maybeUnsubscribeProgress(): void {
  if (progressCallbacks.size === 0 && progressSub) {
    progressSub.remove();
    progressSub = null;
  }
}

/**
 * Registers a per-op progress callback. Returns an `unregister` function
 * the caller must invoke when the underlying native call resolves or rejects
 * — failing to do so leaks the callback and the shared event subscription.
 */
export function registerProgress<TStep extends AnyProgress>(
  opId: string,
  callback: ((step: TStep) => void) | undefined,
): () => void {
  if (!callback) return () => {};
  ensureProgressSubscribed();
  progressCallbacks.set(opId, callback as (step: AnyProgress) => void);
  return () => {
    progressCallbacks.delete(opId);
    maybeUnsubscribeProgress();
  };
}

// ----- Logger -----

let installedLogger: AmSemnatLogger | null = null;
let logSub: Subscription | null = null;

/**
 * Installs, swaps, or uninstalls the JS-side logger. Passing the same logger
 * twice is a no-op; passing a new logger swaps the JS sink without
 * re-toggling the native bridge; passing `null` detaches and tells the
 * native side to stop forwarding log events.
 */
export function setInstalledLogger(logger: AmSemnatLogger | null): void {
  if (installedLogger === logger) return;

  if (logger) {
    installedLogger = logger;
    if (!logSub) {
      logSub = nativeModule.addListener('onLog', (payload) => {
        if (!installedLogger) return;
        const evt = payload as LogEvent;
        switch (evt.level) {
          case 'debug':
            installedLogger.debug(evt.message);
            break;
          case 'info':
            installedLogger.info(evt.message);
            break;
          case 'error':
            installedLogger.error(evt.message, evt.error ? new Error(evt.error) : undefined);
            break;
        }
      });
      nativeModule.setLoggerEnabled(true).catch(() => {});
    }
  } else {
    installedLogger = null;
    if (logSub) {
      logSub.remove();
      logSub = null;
      nativeModule.setLoggerEnabled(false).catch(() => {});
    }
  }
}
