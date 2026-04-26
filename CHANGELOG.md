# Changelog

All notable changes to `@amsemnat/expo-sdk` are documented in this file.

The format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Version numbers ship in lockstep with the sibling SDKs
(`am-semnat-ios-sdk`, `am-semnat-android-sdk`, `@amsemnat/verifier-node`)
through the 0.x cycle.

## 0.1.1 — unreleased

### Fixed

- Config plugin now enables core library desugaring in the consumer app's
  `android/app/build.gradle`. The underlying `ro.amsemnat:am-semnat-sdk`
  AAR requires it; without this sub-plugin `:app:checkDebugAarMetadata`
  failed with "Dependency requires core library desugaring to be
  enabled". Previously consumers worked around it by hand-rolling a
  `withAndroidDesugaring` plugin.
- Relaxed the Android Gradle dependency pin from
  `ro.amsemnat:am-semnat-sdk:0.1.0` to `:0.1.+`, matching the iOS
  podspec's `~> 0.1` and the locked versioning policy. Android-only
  patch fixes to the underlying SDK now propagate without a coupled
  expo-sdk republish.
- Android callers that omitted `DG14` from the requested `dataGroups`
  set used to get `RomanianIdentity.chipAuthenticated = false` on cards
  that actually support chip authentication — iOS always attempted it
  regardless. The Android SDK now matches iOS; bump
  `ro.amsemnat:am-semnat-sdk` to `0.1.1` to pick up the fix (the relaxed
  Gradle pin above does this automatically).

## 0.1.0 — 2026-04-24

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
