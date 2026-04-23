# Contributing

Thanks for taking a look. A few notes on how this package is shaped.

## Repository relationship

Until Phase 7 of the SDK release plan
(`../../romania-eid-research/sdk/open-source-sdk-plan.md`), the four
packages live side-by-side in `am-semnat-sdk/`:

```
am-semnat-sdk/
├── ios/        # AmSemnatSDK podspec
├── android/    # ro.amsemnat:am-semnat-sdk (Maven Central at Phase 7)
├── expo/       # this package
└── verifier-node/ (future)
```

The Expo bridge links against the sibling native SDKs via local paths
(`ios/AmSemnatBridge.podspec` → `:path => '../../ios'`; Android via
`includeBuild` injected by the config plugin). Breaking the sibling layout
breaks the dev harness.

## Public API is frozen

The public surface (`src/index.ts` exports) mirrors the spec locked in
[`sdk-api-surface.md`](../../../romania-eid-research/sdk/sdk-api-surface.md).
Don't add fields, rename options, or reorder enum values without updating
that doc and the iOS / Android siblings in lockstep. 0.x versions move
together.

## Building

```bash
npm install
npm run build        # src/ → build/
npm run build:plugin # plugin/src/ → plugin/build/
npm test             # Jest (no NFC; JS-side only)
```

Native changes require a host Expo app to test against — there is no
standalone harness. During Phase 4 the `am-semnat` repo is the intended
host; see that project's `CLAUDE.md` for how to `npm link` this package
in without breaking the still-active `expo-cei-reader` module.

## What not to do

- Don't port native business logic here. Any read / sign / verify logic
  belongs in `../ios/Sources/` or `../android/sdk/src/main/kotlin/`, not in
  the bridge.
- Don't bypass the JS-side `InputValidation`. The native layer also
  validates; the point of the duplicate is to fail fast and keep the
  `INVALID_INPUT` shape identical across the two paths.
- Don't add logs to the JS-side code that aren't routed through the
  injected `AmSemnatLogger`. Consumers rely on one sink.

## Reporting issues

File against whichever repo the bug lives in:

- API surface / cross-platform semantics → `am-semnat-sdk` meta repo
- iOS native behaviour → `am-semnat-ios-sdk`
- Android native behaviour → `am-semnat-android-sdk`
- JS / TS / config plugin → `am-semnat-expo-sdk`
