//
//  index.ts
//  @amsemnat/expo-sdk config plugin
//
//  Copyright 2026 am-semnat contributors.
//  Licensed under the Apache License, Version 2.0. See LICENSE.
//

import type { ConfigPlugin } from 'expo/config-plugins';
import { withPlugins } from 'expo/config-plugins';

import { withAndroidCompositeBuild } from './withAndroidCompositeBuild';
import { withAndroidNfcFeature } from './withAndroidNfcFeature';
import { withBouncyCastleExclusion } from './withBouncyCastleExclusion';
import { withIosNfcEntitlements } from './withIosNfcEntitlements';

/**
 * Composes the four am-semnat config plugins into a single entry referenced
 * from the consumer's `app.json` / `app.config.ts`. The ordering is:
 * iOS entitlements → Android feature → BouncyCastle exclusion → composite
 * build directive. All sub-plugins are idempotent; running `expo prebuild`
 * twice is safe.
 */
const withAmSemnat: ConfigPlugin = (config) =>
  withPlugins(config, [
    withIosNfcEntitlements,
    withAndroidNfcFeature,
    withBouncyCastleExclusion,
    withAndroidCompositeBuild,
  ]);

module.exports = withAmSemnat;
export default withAmSemnat;
