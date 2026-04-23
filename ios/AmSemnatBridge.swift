//
//  AmSemnatBridge.swift
//  @amsemnat/expo-sdk iOS bridge
//
//  Copyright 2026 am-semnat contributors.
//  Licensed under the Apache License, Version 2.0. See LICENSE.
//

import AmSemnatSDK
import ExpoModulesCore
import Foundation

/// Expo Modules bridge that exposes the `AmSemnatSDK` Swift surface to JS.
///
/// The native SDK owns its own `NFCTagReaderSession` — this module simply
/// translates arguments in, errors + progress out. Progress is fanned out
/// through a single `onProgress` event keyed by the JS-generated `opId`;
/// logger output rides a separate `onLog` channel when the JS side calls
/// `setLoggerEnabled(true)`.
public class AmSemnatBridgeModule: Module {
    private var loggerAdapter: BridgeLoggerAdapter?
    /// Guards against concurrent NFC sessions — the underlying
    /// `NFCTagReaderSession` rejects overlapping sessions with a cryptic
    /// error, so we surface a clean `SESSION_IN_PROGRESS` if a second call
    /// arrives while one is still running.
    private var inflight: Task<Void, Never>?

    public func definition() -> ModuleDefinition {
        Name("AmSemnatBridge")

        Events("onProgress", "onLog")

        // iOS has no system-level "NFC enabled" toggle, so both functions
        // report the same hardware-availability bit.
        AsyncFunction("isNfcAvailable") { () -> Bool in nfcAvailable() }
        AsyncFunction("isNfcEnabled") { () -> Bool in nfcAvailable() }

        AsyncFunction("setLoggerEnabled") { [weak self] (enabled: Bool) in
            guard let self = self else { return }
            if enabled {
                if self.loggerAdapter == nil {
                    let adapter = BridgeLoggerAdapter { [weak self] level, message, errorDescription in
                        var body: [String: Any] = ["level": level, "message": message]
                        if let errorDescription = errorDescription {
                            body["error"] = errorDescription
                        }
                        self?.sendEvent("onLog", body)
                    }
                    self.loggerAdapter = adapter
                    if #available(iOS 15, *) {
                        AmSemnat.logger = adapter
                    }
                }
            } else {
                if #available(iOS 15, *) {
                    AmSemnat.logger = nil
                }
                self.loggerAdapter = nil
            }
        }

        AsyncFunction("cancelCurrentOp") {
            if #available(iOS 15, *) {
                AmSemnat.cancelCurrentOp()
            }
        }

        AsyncFunction("readIdentity") { [weak self] (args: ReadArgs, promise: Promise) in
            guard let self = self else { return }
            self.runNfcOp(promise) {
                let messages = args.messages.toNfcMessages()
                let groups = Set(args.dataGroups.compactMap { DataGroupName.toSdk($0) })
                let opId = args.opId
                let identity = try await AmSemnat.readIdentity(
                    can: args.can,
                    pin1: args.pin1,
                    dataGroups: groups,
                    messages: messages
                ) { step in
                    self.sendEvent("onProgress", [
                        "opId": opId,
                        "kind": "read",
                        "step": step.rawValue,
                    ])
                }
                return identity.toJsDictionary()
            }
        }

        AsyncFunction("sign") { [weak self] (args: SignArgs, promise: Promise) in
            guard let self = self else { return }
            self.runNfcOp(promise) {
                guard let pdfHash = Data(base64Encoded: args.pdfHashBase64) else {
                    throw AmSemnatError.invalidInput(parameter: "pdfHash", detail: "not valid base64")
                }
                let signingTime = try parseIsoDate(args.signingTime)
                let messages = args.messages.toNfcMessages()
                let opId = args.opId
                let signature = try await AmSemnat.sign(
                    can: args.can,
                    pin2: args.pin2,
                    pdfHash: pdfHash,
                    signingTime: signingTime,
                    messages: messages
                ) { step in
                    self.sendEvent("onProgress", [
                        "opId": opId,
                        "kind": "sign",
                        "step": step.rawValue,
                    ])
                }
                return signature.toJsDictionary()
            }
        }

        Function("verifyPassiveOffline") { (args: VerifyArgs) -> [String: Any] in
            guard nfcAvailable() else {
                throw AmSemnatBridgeException.from(.nfcUnavailable)
            }
            guard let sod = Data(base64Encoded: args.rawSodBase64) else {
                throw AmSemnatBridgeException.from(.invalidInput(parameter: "rawSod", detail: "not valid base64"))
            }
            var groups: [DataGroup: Data] = [:]
            for (name, encoded) in args.dataGroups {
                guard let group = DataGroupName.toSdk(name) else { continue }
                guard let bytes = Data(base64Encoded: encoded) else {
                    throw AmSemnatBridgeException.from(.invalidInput(parameter: name, detail: "not valid base64"))
                }
                groups[group] = bytes
            }
            let anchors: [Data] = try args.trustAnchorsBase64.enumerated().map { index, encoded in
                guard let bytes = Data(base64Encoded: encoded) else {
                    throw AmSemnatBridgeException.from(.invalidInput(
                        parameter: "trustAnchors[\(index)]",
                        detail: "not valid base64"
                    ))
                }
                return bytes
            }
            let result = AmSemnat.verifyPassiveOffline(
                rawSod: sod,
                dataGroups: groups,
                trustAnchors: anchors
            )
            var payload: [String: Any] = [
                "valid": result.valid,
                "errors": result.errors,
            ]
            if let cn = result.signerCommonName {
                payload["signerCommonName"] = cn
            }
            if let signedAt = result.signedAt {
                payload["signedAt"] = Self.iso8601Formatter.string(from: signedAt)
            }
            return payload
        }
    }

    fileprivate static let iso8601Formatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    /// Runs an NFC-backed async op under a serial in-flight guard. A second
    /// call while one is running short-circuits with `SESSION_CANCELLED`
    /// (closest code in the taxonomy for "you already have a session").
    private func runNfcOp(
        _ promise: Promise,
        _ body: @escaping () async throws -> Any
    ) {
        guard #available(iOS 15, *) else {
            promise.reject(AmSemnatBridgeException.from(.nfcUnavailable))
            return
        }
        if inflight != nil {
            promise.reject(AmSemnatBridgeException.from(
                .unknown(detail: "an NFC session is already in progress")
            ))
            return
        }
        inflight = Task { [weak self] in
            defer { self?.inflight = nil }
            do {
                let result = try await body()
                promise.resolve(result)
            } catch let err as AmSemnatError {
                promise.reject(AmSemnatBridgeException.from(err))
            } catch {
                promise.reject(AmSemnatBridgeException.from(
                    .unknown(detail: error.localizedDescription)
                ))
            }
        }
    }
}

/// `NFCTagReaderSession.readingAvailable` feature-detect wrapped in the
/// iOS-15 availability gate. Used by `isNfc*` and by `verifyPassiveOffline`
/// — the latter doesn't need NFC itself but `AmSemnat.verifyPassiveOffline`
/// is only annotated for iOS 15+.
private func nfcAvailable() -> Bool {
    if #available(iOS 15, *) {
        return AmSemnat.isNfcAvailable()
    }
    return false
}

// MARK: - Argument records

private struct ReadArgs: Record {
    @Field var opId: String = ""
    @Field var can: String = ""
    @Field var pin1: String = ""
    @Field var dataGroups: [String] = []
    @Field var messages: MessagesRecord = MessagesRecord()
}

private struct SignArgs: Record {
    @Field var opId: String = ""
    @Field var can: String = ""
    @Field var pin2: String = ""
    @Field var pdfHashBase64: String = ""
    @Field var signingTime: String = ""
    @Field var messages: MessagesRecord = MessagesRecord()
}

private struct VerifyArgs: Record {
    @Field var rawSodBase64: String = ""
    @Field var dataGroups: [String: String] = [:]
    @Field var trustAnchorsBase64: [String] = []
}

private struct MessagesRecord: Record {
    @Field var readyToScan: String = ""
    @Field var authenticating: String = ""
    @Field var scanning: String = ""
    // Sentinel "\0" distinguishes "consumer omitted the field" (use default)
    // from "consumer passed an empty string" (suppress the percentage). The
    // JS side sends the empty string explicitly to opt out of the suffix.
    @Field var progressFormat: String = "\0"
    @Field var success: String = ""
    @Field var tagLost: String = ""

    @available(iOS 15, *)
    func toNfcMessages() -> NfcMessages {
        let defaults = NfcMessages.default
        return NfcMessages(
            readyToScan: readyToScan.isEmpty ? defaults.readyToScan : readyToScan,
            authenticating: authenticating.isEmpty ? defaults.authenticating : authenticating,
            scanning: scanning.isEmpty ? defaults.scanning : scanning,
            progressFormat: progressFormat == "\0" ? defaults.progressFormat : progressFormat,
            success: success.isEmpty ? defaults.success : success,
            tagLost: tagLost.isEmpty ? defaults.tagLost : tagLost
        )
    }
}

// MARK: - Helpers

/// Maps the JS-side string (`"DG1"`, `"DG14"`, …) to the SDK enum. Unknown
/// values are dropped rather than errored — consumers are free to request
/// groups the SDK doesn't support and receive only what it does.
private enum DataGroupName {
    static func toSdk(_ name: String) -> DataGroup? {
        switch name {
        case "DG1": return .dg1
        case "DG2": return .dg2
        case "DG7": return .dg7
        case "DG14": return .dg14
        default: return nil
        }
    }
}

/// Foundation's `ISO8601DateFormatter` is strict — accept both
/// `2026-02-16T12:30:00Z` and `...00.000Z` by trying two cached formatters.
/// Android's `Instant.parse` accepts both forms natively, so the parsing
/// asymmetry is unavoidable. Don't remove either formatter without
/// widening the Kotlin side or narrowing the TS validator.
private let iso8601WithFractional: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()

private let iso8601Plain: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
}()

private func parseIsoDate(_ raw: String) throws -> Date {
    if let date = iso8601WithFractional.date(from: raw) { return date }
    if let date = iso8601Plain.date(from: raw) { return date }
    throw AmSemnatError.invalidInput(parameter: "signingTime", detail: "must be ISO 8601")
}

/// Bridge-level logger adapter. Conforming explicitly rather than via a
/// closure so the SDK's `Sendable` requirement is satisfied without
/// capturing non-Sendable state.
@available(iOS 15, *)
private final class BridgeLoggerAdapter: AmSemnatLogger, @unchecked Sendable {
    private let onEvent: (String, String, String?) -> Void

    init(onEvent: @escaping (String, String, String?) -> Void) {
        self.onEvent = onEvent
    }

    func debug(_ message: String) { onEvent("debug", message, nil) }
    func info(_ message: String) { onEvent("info", message, nil) }
    func error(_ message: String, error: Error?) {
        onEvent("error", message, error.map { String(describing: $0) })
    }
}

// MARK: - Result structs → JS

@available(iOS 15, *)
private extension RomanianSignature {
    func toJsDictionary() -> [String: Any] {
        [
            "signatureBase64": signature.base64EncodedString(),
            "certificateBase64": certificate.base64EncodedString(),
            "signedAttributesBase64": signedAttributes.base64EncodedString(),
        ]
    }
}

// MARK: - RomanianIdentity → JS

@available(iOS 15, *)
private extension RomanianIdentity {
    func toJsDictionary() -> [String: Any] {
        var dict: [String: Any] = ["chipAuthenticated": chipAuthenticated]
        func putString(_ key: String, _ value: String?) {
            if let value = value { dict[key] = value }
        }
        func putData(_ key: String, _ value: Data?) {
            if let value = value { dict[key] = value.base64EncodedString() }
        }
        putString("cnp", cnp)
        putString("firstName", firstName)
        putString("lastName", lastName)
        putString("dateOfBirth", dateOfBirth)
        putString("sex", sex)
        putString("nationality", nationality)
        putString("documentNumber", documentNumber)
        putString("dateOfExpiry", dateOfExpiry)
        putString("placeOfBirth", placeOfBirth)
        putString("address", address)
        putString("issuingAuthority", issuingAuthority)
        putString("issuingDate", issuingDate)
        putData("faceImageBase64", faceImage)
        putData("signatureImageBase64", signatureImage)
        putData("rawSodBase64", rawSod)
        putData("rawDg1Base64", rawDg1)
        putData("rawDg2Base64", rawDg2)
        putData("rawDg14Base64", rawDg14)
        return dict
    }
}

// MARK: - Error marshaling

/// Expo's iOS `Promise.reject` channel only exposes `(code, description)` to
/// JS — no separate userInfo dict makes it across the bridge. To preserve
/// the `{ retriesRemaining?, parameter?, detail? }` shape we encode the info
/// payload as a JSON sentinel suffix (`<message>\u{001E}{"detail":"…"}`) on
/// the description. The JS `fromNativeError` helper splits on the same
/// delimiter and rehydrates an `AmSemnatError` with the structured fields.
/// The Android bridge uses the identical sentinel for symmetry.
private final class AmSemnatBridgeException: Exception {
    static let infoSeparator: Character = "\u{001E}"

    private let overrideCode: String
    private let overrideReason: String

    init(code: String, reason: String) {
        self.overrideCode = code
        self.overrideReason = reason
        super.init()
    }

    override var code: String { overrideCode }
    override var reason: String { overrideReason }

    @available(iOS 15, *)
    static func from(_ err: AmSemnatError) -> AmSemnatBridgeException {
        let (code, info): (String, [String: Any]) = {
            switch err {
            case .nfcUnavailable: return ("NFC_UNAVAILABLE", [:])
            case .nfcDisabled: return ("NFC_DISABLED", [:])
            case .sessionCancelled: return ("SESSION_CANCELLED", [:])
            case .sessionTimeout: return ("SESSION_TIMEOUT", [:])
            case .tagLost: return ("TAG_LOST", [:])
            case .tagNotValid: return ("TAG_NOT_VALID", [:])
            case .multipleTagsFound: return ("MULTIPLE_TAGS_FOUND", [:])
            case .paceAuthFailed: return ("PACE_AUTH_FAILED", [:])
            case .pinVerifyFailed(let retries):
                return ("PIN_VERIFY_FAILED", ["retriesRemaining": retries])
            case .pinBlocked: return ("PIN_BLOCKED", [:])
            case .readFailed(let detail): return ("READ_FAILED", ["detail": detail])
            case .signingFailed(let detail): return ("SIGNING_FAILED", ["detail": detail])
            case .invalidInput(let parameter, let detail):
                return ("INVALID_INPUT", ["parameter": parameter, "detail": detail])
            case .unknown(let detail): return ("UNKNOWN", ["detail": detail])
            }
        }()
        let message = err.errorDescription ?? code
        let reason = encode(message: message, info: info)
        return AmSemnatBridgeException(code: code, reason: reason)
    }

    private static func encode(message: String, info: [String: Any]) -> String {
        guard !info.isEmpty else { return message }
        let data = (try? JSONSerialization.data(withJSONObject: info, options: [])) ?? Data()
        let json = String(data: data, encoding: .utf8) ?? ""
        return "\(message)\(infoSeparator)\(json)"
    }
}
