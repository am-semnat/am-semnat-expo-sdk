//
//  withBouncyCastleExclusion.ts
//  @amsemnat/expo-sdk config plugin
//
//  Copyright 2026 am-semnat contributors.
//  Licensed under the Apache License, Version 2.0. See LICENSE.
//

import type { ConfigPlugin } from 'expo/config-plugins';
import { withAppBuildGradle } from 'expo/config-plugins';

/**
 * Excludes the duplicate `META-INF/versions/9/OSGI-INF/MANIFEST.MF` entry
 * that BouncyCastle ships in multiple JARs. Without this, the Android build
 * fails `mergeDebugJavaResource` with a duplicate-file error.
 *
 * The Android SDK already excludes it at the library level (see
 * `am-semnat-sdk/android/sdk/build.gradle`'s `packaging.resources.excludes`),
 * but that doesn't transitively reach the app module's merge task — the
 * exclusion has to be repeated at the app level.
 *
 * Ported from `am-semnat/plugins/withBouncyCastleExclusion.js`.
 */
export const withBouncyCastleExclusion: ConfigPlugin = (config) => {
  return withAppBuildGradle(config, (cfg) => {
    const buildGradle = cfg.modResults.contents;
    if (
      buildGradle.includes('packagingOptions') &&
      !buildGradle.includes('META-INF/versions/9/OSGI-INF/MANIFEST.MF')
    ) {
      cfg.modResults.contents = buildGradle.replace(
        /packagingOptions\s*\{/,
        `packagingOptions {
        resources {
            excludes += 'META-INF/versions/9/OSGI-INF/MANIFEST.MF'
        }`,
      );
    }
    return cfg;
  });
};
