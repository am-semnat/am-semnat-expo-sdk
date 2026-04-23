# @amsemnat/expo-sdk

Expo Module for reading and signing with Romanian electronic identity
cards (CEI / eID) over NFC. Wraps the `AmSemnatSDK` iOS pod and
`ro.amsemnat:am-semnat-sdk` Android library behind a single TypeScript
surface.

## Status

`0.1.0` — pre-stable. Ships in lockstep with the iOS and Android sibling
SDKs. Public surface is locked in
[`sdk-api-surface.md`](https://github.com/am-semnat/am-semnat-sdk);
non-breaking additions only through 0.x.

## Requirements

- Expo SDK ≥ 52 (managed or bare — both work via `expo prebuild`)
- iOS 15.0+ / Android API 24+
- Device with NFC hardware (`NFCTagReaderSession` on iOS, `NfcAdapter` on
  Android)

## Installation

```bash
npm install @amsemnat/expo-sdk
npx expo prebuild --clean
```

Add the config plugin to `app.json` / `app.config.ts`:

```jsonc
{
  "expo": {
    "plugins": ["@amsemnat/expo-sdk"]
  }
}
```

On iOS you must also supply `NFCReaderUsageDescription` in your app's
`ios.infoPlist` block — Expo does not generate this for you:

```jsonc
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NFCReaderUsageDescription": "Tap your ID card to sign in."
      }
    }
  }
}
```

The plugin handles the rest:

- iOS — NFC reader-session formats entitlement + the two Romanian CEI
  applet AIDs in Info.plist
- Android — `<uses-feature android:name="android.hardware.nfc">` +
  BouncyCastle META-INF exclusion in the app's `packagingOptions`
- Phase 4 dev — `includeBuild('../am-semnat-sdk/android')` in the
  consumer's `android/settings.gradle` (removed at Phase 7 when the
  Android SDK publishes to Maven Central)

## Quick start

### Read identity

```ts
import { AmSemnat, AmSemnatError } from '@amsemnat/expo-sdk';

try {
  const identity = await AmSemnat.readIdentity({
    can: '123456',    // 6-digit CAN from the card
    pin1: '1234',     // optional PIN1 for eDATA (empty = skip)
    onProgress: (step) => console.log('step:', step),
  });
  // identity.cnp, identity.firstName, identity.lastName, …
  // identity.chipAuthenticated (UX signal only)
  // identity.rawSodBase64 / .rawDg1Base64 / .rawDg2Base64
} catch (err) {
  if (err instanceof AmSemnatError) {
    if (err.code === 'PIN_VERIFY_FAILED') {
      console.log(`PIN1 wrong, ${err.retriesRemaining} retries left`);
    } else if (err.code === 'PACE_AUTH_FAILED') {
      console.log('Wrong CAN — prompt user');
    }
  }
  throw err;
}
```

### Sign a PDF byte-range hash (PAdES)

```ts
import { AmSemnat } from '@amsemnat/expo-sdk';

const sig = await AmSemnat.sign({
  can: '123456',
  pin2: '123456',
  pdfHashBase64,                            // 48-byte SHA-384, base64
  signingTime: new Date().toISOString(),
  onProgress: (step) => console.log('step:', step),
});
// sig.signatureBase64         — 96 bytes, raw ECDSA P-384 r‖s
// sig.certificateBase64       — DER-encoded signing cert
// sig.signedAttributesBase64  — DER-encoded SET of CMS signed attributes
```

### Offline passive authentication

```ts
import { AmSemnat } from '@amsemnat/expo-sdk';

const result = AmSemnat.verifyPassiveOffline({
  rawSodBase64: identity.rawSodBase64!,
  dataGroups: {
    DG1: identity.rawDg1Base64!,
    DG2: identity.rawDg2Base64!,
    DG14: identity.rawDg14Base64!,
  },
  trustAnchorsBase64: [/* CSCA or document-signer certs, DER → base64 */],
});
if (!result.valid) console.warn(result.errors);
```

Server-side verification against the official Romanian trust list is
delegated to `@amsemnat/verifier-node` (shipped separately).

## Localizing the NFC sheet

iOS owns the NFC reader-session sheet; the SDK writes phase-specific
strings into it via an optional `messages` argument. Defaults are
neutral English — production apps should pass a localized
`NfcMessages`.

```ts
await AmSemnat.readIdentity({
  can, pin1,
  messages: {
    readyToScan:    t('nfc.holdCard'),
    authenticating: t('nfc.authenticating'),
    scanning:       t('nfc.reading'),
    progressFormat: t('nfc.progressFormat'),  // e.g. '{phase} — {percent}%'
    success:        t('nfc.done'),
    tagLost:        t('nfc.cardMoved'),
  },
  onProgress,
});
```

`progressFormat` composes the live per-DG read percentage into the
sheet. Two tokens are substituted:

- `{phase}`   → your `scanning` string
- `{percent}` → the reader's 0-100 progress, rendered as an integer

The English default `'{phase} — {percent}%'` renders as
`'Reading your card… — 40%'`. Pass `progressFormat: ''` to suppress
the percentage and show `scanning` verbatim.

**Android has no system NFC sheet in reader mode** — render your own
progress UI from the `onProgress` callback. The `messages` argument
is accepted for payload symmetry but discarded on Android.

## Cancelling on navigation away

On Android, `NfcAdapter.enableReaderMode` is Activity-scoped — an
in-app navigation away from a reading screen does **not** tear the
session down, so a follow-up `readIdentity` call on the same Activity
fails with `SESSION_CANCELLED`-style conflicts. On iOS the reader
sheet auto-invalidates when the app backgrounds but not on in-app
screen transitions.

`AmSemnat.cancelCurrentOp()` handles both. Typical wiring with
expo-router:

```ts
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { AmSemnat } from '@amsemnat/expo-sdk';

useFocusEffect(
  useCallback(() => {
    return () => {
      AmSemnat.cancelCurrentOp().catch(() => {});
    };
  }, []),
);
```

The in-flight `readIdentity` / `sign` promise rejects with
`AmSemnatError` code `'SESSION_CANCELLED'`. No-op when nothing is in
flight. Safe to call repeatedly.

## Progress events

`ReadProgress`:
`paceEstablishing → readingDg14 → chipAuthenticating → readingDg1 →
readingDg2 → readingDg7 → readingDg11 → readingEData → complete`

`SignProgress`:
`paceEstablishing → verifyingPin → readingCertificate → signing → complete`

DG14 fires before the other DGs because its keys are needed for Chip
Authentication. Consumers should localize each value independently rather
than depending on the exact order.

## Logging

```ts
AmSemnat.setLogger({
  debug: console.log,
  info: console.log,
  error: (msg, err) => console.error(msg, err),
});

// Detach:
AmSemnat.setLogger(null);
```

Messages flow from the native `AmSemnatLogger` protocols through an
`onLog` event; CAN and PIN bytes are redacted by the native SDKs before
they reach you.

## What's not in 0.x

- Active Authentication (DG15) — the iOS fork supports it but the API
  surface deliberately omits it for 0.x; pass the `rawDg*Base64` fields
  to `@amsemnat/verifier-node` for transferable proof instead.
- Low-level `tag:` overloads from the native SDKs — no safe equivalent
  across React Native's threading model.

## License

Apache-2.0 for this package's own code. See [`LICENSE`](LICENSE),
[`NOTICE`](NOTICE), and [`ATTRIBUTION.md`](ATTRIBUTION.md). Third-party
attribution obligations flow through the sibling native SDKs.
