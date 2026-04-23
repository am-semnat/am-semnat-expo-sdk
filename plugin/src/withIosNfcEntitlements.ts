//
//  withIosNfcEntitlements.ts
//  @amsemnat/expo-sdk config plugin
//
//  Copyright 2026 am-semnat contributors.
//  Licensed under the Apache License, Version 2.0. See LICENSE.
//

import type { ConfigPlugin } from 'expo/config-plugins';
import { withEntitlementsPlist, withInfoPlist } from 'expo/config-plugins';

const NFC_FORMATS_KEY = 'com.apple.developer.nfc.readersession.formats';
const SELECT_IDENTIFIERS_KEY =
  'com.apple.developer.nfc.readersession.iso7816.select-identifiers';

/**
 * AIDs the Romanian CEI card expects the reader-session to declare in
 * Info.plist. `A0000002471001` is the eMRTD applet; the longer identifier
 * is the national eDATA applet.
 */
const CEI_AIDS = ['A0000002471001', 'A000000077030C60000000FE00000500'];

/**
 * Writes NFC reader-session formats to the app's `.entitlements` plist and
 * the ISO 7816 select-identifiers to `Info.plist`. The two pieces live in
 * different files on purpose — Apple's CodeSign will reject a provisioning
 * profile that carries `select-identifiers` in the entitlements plist, so
 * this plugin also strips that key from entitlements if Expo leaked it
 * there from a caller's `ios.infoPlist` block.
 *
 * Ported verbatim from `am-semnat/plugins/withNfcEntitlement.js`.
 */
export const withIosNfcEntitlements: ConfigPlugin = (config) => {
  config = withEntitlementsPlist(config, (cfg) => {
    cfg.modResults[NFC_FORMATS_KEY] = ['TAG', 'PACE'];
    delete cfg.modResults[SELECT_IDENTIFIERS_KEY];
    return cfg;
  });

  config = withInfoPlist(config, (cfg) => {
    cfg.modResults[SELECT_IDENTIFIERS_KEY] = CEI_AIDS;
    return cfg;
  });

  return config;
};
