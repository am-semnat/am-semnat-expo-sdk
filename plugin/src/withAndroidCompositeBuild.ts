//
//  withAndroidCompositeBuild.ts
//  @amsemnat/expo-sdk config plugin
//
//  Copyright 2026 am-semnat contributors.
//  Licensed under the Apache License, Version 2.0. See LICENSE.
//

import type { ConfigPlugin } from 'expo/config-plugins';
import { withSettingsGradle } from 'expo/config-plugins';

/**
 * **Phase-4-only.** Injects a Gradle composite-build directive into the
 * consumer app's `android/settings.gradle` so `ro.amsemnat:am-semnat-sdk`
 * resolves against the sibling checkout at `am-semnat-sdk/android/` instead
 * of a Maven coordinate. Required because the Android SDK is published as
 * `0.1.0-SNAPSHOT` and not yet on Maven Central.
 *
 * The plugin is a no-op when the directive is already present. At Phase 7
 * this plugin is deleted and the module's `build.gradle` switches to a
 * plain registry dependency.
 */
export const withAndroidCompositeBuild: ConfigPlugin = (config) => {
  return withSettingsGradle(config, (cfg) => {
    // Path is relative to `android/settings.gradle`, i.e. `<consumer>/android/`.
    // Sibling checkout lives at `<root>/am-semnat-sdk/android/`, so we go up two.
    const marker = "includeBuild('../../am-semnat-sdk/android')";
    const altMarker = 'includeBuild("../../am-semnat-sdk/android")';
    const contents = cfg.modResults.contents;

    if (contents.includes(marker) || contents.includes(altMarker)) {
      return cfg;
    }

    // Gradle auto-substitution won't fire because the included build's project
    // is named `:sdk`, not `:am-semnat-sdk`. Map the Maven coordinate explicitly.
    const block = [
      `${marker} { // am-semnat-sdk dev harness (Phase 4)`,
      `  dependencySubstitution {`,
      `    substitute module('ro.amsemnat:am-semnat-sdk') using project(':sdk')`,
      `  }`,
      `}`,
      ``,
    ].join('\n');

    // Must land after `pluginManagement { }` (Gradle requires that to be the
    // first block) but before any `include(':app')` lines — inserting after
    // the top `plugins { }` block satisfies both.
    const pluginsBlockEnd = contents.indexOf('}\n', contents.indexOf('plugins {'));
    if (pluginsBlockEnd === -1) {
      cfg.modResults.contents = `${block}${contents}`;
    } else {
      const insertAt = pluginsBlockEnd + 2;
      cfg.modResults.contents =
        contents.slice(0, insertAt) + '\n' + block + contents.slice(insertAt);
    }
    return cfg;
  });
};
