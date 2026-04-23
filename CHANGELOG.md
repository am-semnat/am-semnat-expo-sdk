# Changelog

All notable changes to `@amsemnat/expo-sdk` are documented in this file.

The format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Version numbers ship in lockstep with the sibling SDKs
(`am-semnat-ios-sdk`, `am-semnat-android-sdk`, `@amsemnat/verifier-node`)
through the 0.x cycle.

## 0.1.0 — unreleased

Initial release.

### Added

- `AmSemnat.readIdentity`, `AmSemnat.sign`, `AmSemnat.verifyPassiveOffline`,
  `AmSemnat.isNfcAvailable`, `AmSemnat.isNfcEnabled`, `AmSemnat.setLogger`,
  `AmSemnat.cancelCurrentOp`.
- `AmSemnat.cancelCurrentOp()` cancels the in-flight `readIdentity` /
  `sign`; the awaiting promise rejects with `SESSION_CANCELLED`.
  Typical use: expo-router `useFocusEffect` cleanup so navigating away
  from the reading screen tears down the NFC session. Required on
  Android where reader mode is Activity-bound and survives in-app
  navigation; on iOS the reader sheet invalidates immediately.
- Typed `ReadProgress` / `SignProgress` unions streamed per-op through an
  `onProgress` callback keyed by an opaque opId.
- `AmSemnatError` class with the full 14-code taxonomy (`NFC_UNAVAILABLE`,
  `PIN_VERIFY_FAILED` with `retriesRemaining`, `INVALID_INPUT` with
  `parameter` / `detail`, etc.) preserved across the native → JS
  boundary.
- Bundled config plugin (`app.plugin.js`) applying iOS NFC entitlements
  and Info.plist AIDs, Android NFC feature flag, and BouncyCastle
  META-INF exclusion.
- JS-side `InputValidation` port of the iOS / Android rules so callers
  fail fast with the same `INVALID_INPUT` shape the native layer would
  produce.
- `NfcMessages` carries `authenticating` and `progressFormat` in addition
  to the original four fields. The iOS bridge formats the fork's per-DG
  progress percentage into the sheet via token substitution
  (`{phase}` + `{percent}`); pass `progressFormat: ''` to suppress the
  percentage. Ignored on Android (reader-mode has no system sheet).
