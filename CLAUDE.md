# CLAUDE.md

Guidance for Claude Code when working in `am-semnat-sdk/expo/`.

## What this is

Expo Module (`@amsemnat/expo-sdk`) that wraps the two native SDKs at
`../ios/` (`AmSemnatSDK` pod) and `../android/` (`ro.amsemnat:am-semnat-sdk`
Gradle module). Zero business logic — just marshaling args in, progress
and errors out. Extracted from `../../am-semnat/modules/expo-cei-reader/`,
which still ships and runs in parallel until the `am-semnat` app finishes
migrating to this package.

The public TS surface is **frozen** for 0.x. Don't change exported type
names, option fields, enum values, or `AmSemnatError` codes without
updating the iOS / Android / verifier siblings in lockstep.

## Build & test

```bash
npm install
npm run build        # src/ → build/
npm run build:plugin # plugin/src/ → plugin/build/
npm test             # Jest — no NFC, JS-side only
```

Native bridges are not compiled by `npm` — they compile when a host Expo
app links this package and runs `pod install` / `./gradlew`. The primary
host is `../../am-semnat`; smoke test there with a real card after any
bridge change.

## Layout

`src/` — public TS:
- `index.ts`, `AmSemnat.ts` (namespace entry point)
- `types.ts`, `progress.ts`, `logger.ts`, `errors.ts`
- `InputValidation.ts` — JS-side port of
  `../ios/Sources/AmSemnat/Internal/InputValidation.swift`
- `native.ts`, `events.ts` — bridge wiring and opId-keyed event fan-out

`ios/` — Swift Expo Module, one file (`AmSemnatBridge.swift`) + podspec
that depends on `AmSemnatSDK` via `:path => '../../ios'`.

`android/` — Kotlin Expo Module, one file (`AmSemnatBridgeModule.kt`) +
`build.gradle` that depends on `ro.amsemnat:am-semnat-sdk` from Maven
Central.

`plugin/src/` — config plugin (TS → compiled to `plugin/build/`). Three
sub-plugins composed by `index.ts`:
- `withIosNfcEntitlements` — formats → `.entitlements`, select-identifiers
  → Info.plist (ported from `am-semnat/plugins/withNfcEntitlement.js`)
- `withAndroidNfcFeature` — `<uses-feature>` in manifest
- `withBouncyCastleExclusion` — META-INF dedupe in app `build.gradle`

`__tests__/` — Jest suites for `InputValidation` and error round-trip.

## Rules

- **Public surface is frozen for 0.x.** Additions only, in lockstep
  with the iOS / Android / verifier siblings.
- **Apache-2.0 for this package's code.** No vendored third-party source
  lives here; the underlying SDKs carry the MIT / LGPL obligations.
- **Thin bridge.** Every `AmSemnat.readIdentity` / `.sign` / `.verifyPassiveOffline`
  call should translate args and delegate. If you find yourself adding
  parsing, domain logic, or orchestration here, that logic belongs in
  the native SDK instead.
- **Error shape is symmetric.** iOS and Android both encode structured
  info (`retriesRemaining`, `parameter`, `detail`) as a JSON sentinel
  suffix on the error message — `<message><RS><json>` where `<RS>` is
  U+001E. Expo's iOS `Promise.reject` has no userInfo channel; the
  sentinel is the only way to carry structured data through that API.
  `errors.ts#splitInfoSuffix` reverses it on the JS side.

## Gotchas

- **Progress events fan out through a shared subscription keyed by `opId`.**
  The native side emits `onProgress` events with `{ opId, kind, step }`;
  the JS shim (`events.ts`) routes each to the matching caller's
  `onProgress`. Forgetting to `unregister()` in the `finally` block leaks
  the subscription and keeps the event stream alive for a dead promise.
- **`isNfcEnabled` == `isNfcAvailable` on iOS.** iOS has no separate
  "NFC is enabled" system toggle — both async calls return
  `NFCTagReaderSession.readingAvailable`. Android returns the real
  `NfcAdapter.isEnabled` value.
- **Don't reach into the vendored `expo-cei-reader` module.** It still
  ships from `../../am-semnat/modules/expo-cei-reader/` for parallel use
  during the migration window, but its types, Romanian-language strings,
  and error codes diverge from this surface deliberately. The consumer
  app swaps imports file-by-file.
- **Tests run on Node, not on a device.** There is no jest-expo setup;
  imports go straight to `src/`. That means tests can't touch
  `expo-modules-core` (the `requireNativeModule` call in `native.ts`
  throws under Node). Keep test files on the pure-TS helpers only
  (`InputValidation`, `errors`).
