//
//  withAndroidNfcFeature.ts
//  @amsemnat/expo-sdk config plugin
//
//  Copyright 2026 am-semnat contributors.
//  Licensed under the Apache License, Version 2.0. See LICENSE.
//

import type { ConfigPlugin } from 'expo/config-plugins';
import { withAndroidManifest } from 'expo/config-plugins';

/**
 * Adds `<uses-feature android:name="android.hardware.nfc"
 * android:required="true" />` to the Android manifest. Keeps the Play Store
 * filter honest — devices without NFC hardware won't see the app, which is
 * what callers of this SDK want by default.
 *
 * Ported from `am-semnat/plugins/withNfcFeature.js`.
 */
export const withAndroidNfcFeature: ConfigPlugin = (config) => {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest as {
      'uses-feature'?: Array<{ $?: Record<string, string> }>;
    };

    if (!manifest['uses-feature']) {
      manifest['uses-feature'] = [];
    }

    const hasNfcFeature = manifest['uses-feature'].some(
      (f) => f.$?.['android:name'] === 'android.hardware.nfc',
    );

    if (!hasNfcFeature) {
      manifest['uses-feature'].push({
        $: {
          'android:name': 'android.hardware.nfc',
          'android:required': 'true',
        },
      });
    }

    return cfg;
  });
};
