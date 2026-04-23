# Attribution guide

`@amsemnat/expo-sdk` is an Expo Module — TypeScript + thin native bridges
over `AmSemnatSDK` (iOS) and `ro.amsemnat:am-semnat-sdk` (Android). The
package itself ships no vendored third-party source.

Attribution obligations that apply to your app all flow through the two
underlying SDKs, not this one:

1. **iOS** — `AmSemnatSDK` links a vendored fork of
   [`AndyQ/NFCPassportReader`](https://github.com/AndyQ/NFCPassportReader)
   (MIT) and OpenSSL via `OpenSSL-Universal` (Apache-2.0). See
   `../ios/NOTICE` and `../ios/ATTRIBUTION.md` for the raw text and a
   drop-in SwiftUI snippet.

2. **Android** — `ro.amsemnat:am-semnat-sdk` links JMRTD (LGPL-2.1),
   SCUBA (LGPL-2.1), and BouncyCastle (MIT + Bouncy Castle licence). See
   `../android/NOTICE` and `../android/ATTRIBUTION.md` for the relinking
   obligation that LGPL places on AAB/APK publishers and the ProGuard
   keep-rules shipped in `consumer-rules.pro`.

If your app already has an open-source licenses screen (React Native's
`react-native-oss-licenses`, Expo's built-in, or a custom list), extend
it with the two sibling entries rather than re-deriving the third-party
list from scratch.

This package's own code is Apache-2.0 — see [`LICENSE`](LICENSE).
