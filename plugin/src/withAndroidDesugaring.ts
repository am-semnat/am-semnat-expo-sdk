//
//  withAndroidDesugaring.ts
//  @amsemnat/expo-sdk config plugin
//
//  Copyright 2026 am-semnat contributors.
//  Licensed under the Apache License, Version 2.0. See LICENSE.
//

import type { ConfigPlugin } from 'expo/config-plugins';
import { withAppBuildGradle } from 'expo/config-plugins';

/**
 * Enables core library desugaring in the consumer app's
 * `android/app/build.gradle`. The `ro.amsemnat:am-semnat-sdk` AAR declares
 * `android.useCoreLibraryDesugaring = true` because it uses
 * `java.time.Instant` in its public API and `java.util.Base64` internally,
 * both of which require desugaring on `minSdk 24`. Consumers that skip
 * this fail `:app:checkDebugAarMetadata` with "Dependency requires core
 * library desugaring to be enabled".
 *
 * Ported from `am-semnat/plugins/withAndroidDesugaring.js`.
 */

const DESUGAR_LIB = "coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs:2.1.5'";
const COMPILE_OPT = 'coreLibraryDesugaringEnabled true';
const COMPILE_OPTIONS_BLOCK = `compileOptions {
        ${COMPILE_OPT}
    }`;

function addCompileOption(contents: string): string {
  if (contents.includes(COMPILE_OPT)) return contents;

  if (/compileOptions\s*\{/.test(contents)) {
    return contents.replace(
      /(compileOptions\s*\{)/,
      `$1\n        ${COMPILE_OPT}`,
    );
  }

  return contents.replace(
    /(\n\s*namespace\s+['"][^'"]+['"]\n)/,
    `$1\n    ${COMPILE_OPTIONS_BLOCK}\n`,
  );
}

function addDesugarDependency(contents: string): string {
  if (contents.includes(DESUGAR_LIB)) return contents;
  return contents.replace(/(dependencies\s*\{)/, `$1\n    ${DESUGAR_LIB}`);
}

export const withAndroidDesugaring: ConfigPlugin = (config) =>
  withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = addDesugarDependency(addCompileOption(cfg.modResults.contents));
    return cfg;
  });
