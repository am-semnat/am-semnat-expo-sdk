//
//  AmSemnatBridgeModule.kt
//  @amsemnat/expo-sdk Android bridge
//
//  Copyright 2026 am-semnat contributors.
//  Licensed under the Apache License, Version 2.0. See LICENSE.
//

package ro.amsemnat.expo

import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject
import ro.amsemnat.sdk.AmSemnat
import ro.amsemnat.sdk.AmSemnatError
import ro.amsemnat.sdk.AmSemnatLogger
import ro.amsemnat.sdk.DataGroup
import ro.amsemnat.sdk.PassiveVerificationResult
import ro.amsemnat.sdk.ReadProgress
import ro.amsemnat.sdk.RomanianIdentity
import ro.amsemnat.sdk.RomanianSignature
import ro.amsemnat.sdk.SignProgress
import java.time.Instant
import java.util.Base64

/**
 * Expo Modules bridge that exposes the `ro.amsemnat:am-semnat-sdk` Kotlin
 * surface to JS. Mirrors `AmSemnatBridgeModule.swift` on iOS:
 *
 * - `readIdentity` / `sign` delegate to the activity-owned SDK overloads.
 *   Progress is forwarded through a single `onProgress` event keyed by a
 *   JS-generated `opId` so multiple concurrent callers can't clash.
 * - `setLoggerEnabled(true)` installs a native `AmSemnatLogger` adapter
 *   that forwards each call as an `onLog` event.
 * - Errors from the SDK's sealed `AmSemnatError` hierarchy are translated
 *   into `BridgeCodedException` whose `message` carries a JSON sentinel
 *   suffix (`<message><json>`) — the JS layer splits on the same
 *   character and rehydrates `retriesRemaining` / `parameter` / `detail`.
 *   Expo's iOS `Promise.reject` has no userInfo channel, so both platforms
 *   use this encoding for symmetry.
 */
class AmSemnatBridgeModule : Module() {

    private var loggerAdapter: BridgeLoggerAdapter? = null

    /**
     * Module-scoped coroutine scope — one per module instance, cancelled in
     * [OnDestroy]. A prior revision created `CoroutineScope(Dispatchers.Main)`
     * per call: leaked because the scope was never cancelled, so a mid-scan
     * activity teardown left zombie coroutines running NFC I/O into a dead
     * Promise. Use this scope for every bridge `launch`.
     */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    /** In-flight NFC op guard; a second call short-circuits with a clean error. */
    @Volatile
    private var inflight: Job? = null

    override fun definition() = ModuleDefinition {
        Name("AmSemnatBridge")

        Events("onProgress", "onLog")

        OnDestroy {
            AmSemnat.logger = null
            loggerAdapter = null
            scope.cancel()
        }

        AsyncFunction("isNfcAvailable") {
            val context = appContext.reactContext ?: return@AsyncFunction false
            AmSemnat.isNfcAvailable(context)
        }

        AsyncFunction("isNfcEnabled") {
            val context = appContext.reactContext ?: return@AsyncFunction false
            AmSemnat.isNfcEnabled(context)
        }

        AsyncFunction("cancelCurrentOp") {
            AmSemnat.cancelCurrentOp()
        }

        AsyncFunction("setLoggerEnabled") { enabled: Boolean ->
            if (enabled) {
                if (loggerAdapter == null) {
                    val adapter = BridgeLoggerAdapter { level, message, errorText ->
                        val body = mutableMapOf<String, Any?>(
                            "level" to level,
                            "message" to message,
                        )
                        if (errorText != null) body["error"] = errorText
                        this@AmSemnatBridgeModule.sendEvent("onLog", body)
                    }
                    loggerAdapter = adapter
                    AmSemnat.logger = adapter
                }
            } else {
                AmSemnat.logger = null
                loggerAdapter = null
            }
        }

        AsyncFunction("readIdentity") { args: ReadArgs, promise: Promise ->
            val activity = appContext.currentActivity
                ?: return@AsyncFunction promise.reject(
                    BridgeCodedException.from(AmSemnatError.Unknown("No foreground activity"))
                )
            launchNfcOp(promise) {
                val groups = args.dataGroups.mapNotNull { toSdkGroup(it) }.toSet()
                val opId = args.opId
                val identity = AmSemnat.readIdentity(
                    activity = activity,
                    can = args.can,
                    pin1 = args.pin1,
                    dataGroups = groups,
                ) { step: ReadProgress ->
                    this@AmSemnatBridgeModule.sendEvent("onProgress", mapOf(
                        "opId" to opId,
                        "kind" to "read",
                        "step" to readProgressToJs(step),
                    ))
                }
                identity.toJsMap()
            }
        }

        AsyncFunction("sign") { args: SignArgs, promise: Promise ->
            val activity = appContext.currentActivity
                ?: return@AsyncFunction promise.reject(
                    BridgeCodedException.from(AmSemnatError.Unknown("No foreground activity"))
                )
            launchNfcOp(promise) {
                val pdfHash = try {
                    Base64.getDecoder().decode(args.pdfHashBase64)
                } catch (_: IllegalArgumentException) {
                    throw AmSemnatError.InvalidInput("pdfHash", "not valid base64")
                }
                val signingTime = try {
                    Instant.parse(args.signingTime)
                } catch (_: Exception) {
                    throw AmSemnatError.InvalidInput("signingTime", "must be ISO 8601")
                }
                val opId = args.opId
                val signature = AmSemnat.sign(
                    activity = activity,
                    can = args.can,
                    pin2 = args.pin2,
                    pdfHash = pdfHash,
                    signingTime = signingTime,
                ) { step: SignProgress ->
                    this@AmSemnatBridgeModule.sendEvent("onProgress", mapOf(
                        "opId" to opId,
                        "kind" to "sign",
                        "step" to signProgressToJs(step),
                    ))
                }
                signature.toJsMap()
            }
        }

        Function("verifyPassiveOffline") { args: VerifyArgs ->
            val decoder = Base64.getDecoder()
            val sod = try {
                decoder.decode(args.rawSodBase64)
            } catch (_: IllegalArgumentException) {
                throw BridgeCodedException.from(AmSemnatError.InvalidInput("rawSod", "not valid base64"))
            }
            val groups = mutableMapOf<DataGroup, ByteArray>()
            for ((name, encoded) in args.dataGroups) {
                val group = toSdkGroup(name) ?: continue
                groups[group] = try {
                    decoder.decode(encoded)
                } catch (_: IllegalArgumentException) {
                    throw BridgeCodedException.from(AmSemnatError.InvalidInput(name, "not valid base64"))
                }
            }
            val anchors = args.trustAnchorsBase64.mapIndexed { index, encoded ->
                try {
                    decoder.decode(encoded)
                } catch (_: IllegalArgumentException) {
                    throw BridgeCodedException.from(AmSemnatError.InvalidInput("trustAnchors[$index]", "not valid base64"))
                }
            }
            val result = AmSemnat.verifyPassiveOffline(sod, groups, anchors)
            result.toJsMap()
        }
    }

    /**
     * Launches [body] on the module-scoped coroutine scope under a serial
     * in-flight guard. A second call while one is running short-circuits
     * with a clean error — `NfcAdapter.enableReaderMode` is single-owner
     * and would otherwise surface the conflict as an opaque failure.
     * The three-catch cascade is centralized here so individual op blocks
     * stay focused on argument marshaling.
     */
    private fun launchNfcOp(
        promise: Promise,
        body: suspend () -> Any?,
    ) {
        if (inflight?.isActive == true) {
            promise.reject(BridgeCodedException.from(
                AmSemnatError.Unknown("an NFC session is already in progress")
            ))
            return
        }
        inflight = scope.launch {
            try {
                promise.resolve(body())
            } catch (err: AmSemnatError) {
                promise.reject(BridgeCodedException.from(err))
            } catch (err: CancellationException) {
                promise.reject(BridgeCodedException.from(AmSemnatError.SessionCancelled))
                throw err
            } catch (err: Throwable) {
                promise.reject(BridgeCodedException.from(
                    AmSemnatError.Unknown(err.message ?: err.toString())
                ))
            }
        }
    }

    // -------------------------------------------------------------------
    // Argument records
    // -------------------------------------------------------------------

    class ReadArgs : Record {
        @Field var opId: String = ""
        @Field var can: String = ""
        @Field var pin1: String = ""
        @Field var dataGroups: List<String> = emptyList()
        @Field var messages: MessagesRecord = MessagesRecord()
    }

    class SignArgs : Record {
        @Field var opId: String = ""
        @Field var can: String = ""
        @Field var pin2: String = ""
        @Field var pdfHashBase64: String = ""
        @Field var signingTime: String = ""
        @Field var messages: MessagesRecord = MessagesRecord()
    }

    class VerifyArgs : Record {
        @Field var rawSodBase64: String = ""
        @Field var dataGroups: Map<String, String> = emptyMap()
        @Field var trustAnchorsBase64: List<String> = emptyList()
    }

    /**
     * Accepted and discarded on Android — reader-mode NFC has no system
     * sheet at all, so there's nothing for the SDK to write these strings
     * to. Kept as a record for argument-shape parity with iOS, so the JS
     * layer can pass a single `messages` object to both platforms. The
     * consumer app is responsible for its own Android progress UI, driven
     * by the `onProgress` callback.
     */
    class MessagesRecord : Record {
        @Field var readyToScan: String = ""
        @Field var authenticating: String = ""
        @Field var scanning: String = ""
        @Field var progressFormat: String = ""
        @Field var success: String = ""
        @Field var tagLost: String = ""
    }
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

private fun toSdkGroup(name: String): DataGroup? = when (name) {
    "DG1" -> DataGroup.DG1
    "DG2" -> DataGroup.DG2
    "DG7" -> DataGroup.DG7
    "DG14" -> DataGroup.DG14
    else -> null
}

/**
 * Converts the Kotlin SDK's `SCREAMING_SNAKE_CASE` enum to the camelCase
 * string the JS side expects (matches the iOS `String` raw values).
 */
private fun readProgressToJs(step: ReadProgress): String = when (step) {
    ReadProgress.PACE_ESTABLISHING -> "paceEstablishing"
    ReadProgress.READING_DG1 -> "readingDg1"
    ReadProgress.READING_DG2 -> "readingDg2"
    ReadProgress.READING_DG7 -> "readingDg7"
    ReadProgress.READING_DG14 -> "readingDg14"
    ReadProgress.CHIP_AUTHENTICATING -> "chipAuthenticating"
    ReadProgress.READING_EDATA -> "readingEData"
    ReadProgress.COMPLETE -> "complete"
}

private fun signProgressToJs(step: SignProgress): String = when (step) {
    SignProgress.PACE_ESTABLISHING -> "paceEstablishing"
    SignProgress.VERIFYING_PIN -> "verifyingPin"
    SignProgress.READING_CERTIFICATE -> "readingCertificate"
    SignProgress.SIGNING -> "signing"
    SignProgress.COMPLETE -> "complete"
}

private val B64 = Base64.getEncoder()

private fun RomanianIdentity.toJsMap(): Map<String, Any?> {
    val out = HashMap<String, Any?>(20)
    out["chipAuthenticated"] = chipAuthenticated
    cnp?.let { out["cnp"] = it }
    firstName?.let { out["firstName"] = it }
    lastName?.let { out["lastName"] = it }
    dateOfBirth?.let { out["dateOfBirth"] = it }
    sex?.let { out["sex"] = it }
    nationality?.let { out["nationality"] = it }
    documentNumber?.let { out["documentNumber"] = it }
    dateOfExpiry?.let { out["dateOfExpiry"] = it }
    placeOfBirth?.let { out["placeOfBirth"] = it }
    address?.let { out["address"] = it }
    issuingAuthority?.let { out["issuingAuthority"] = it }
    issuingDate?.let { out["issuingDate"] = it }
    faceImage?.let { out["faceImageBase64"] = B64.encodeToString(it) }
    signatureImage?.let { out["signatureImageBase64"] = B64.encodeToString(it) }
    rawSod?.let { out["rawSodBase64"] = B64.encodeToString(it) }
    rawDg1?.let { out["rawDg1Base64"] = B64.encodeToString(it) }
    rawDg2?.let { out["rawDg2Base64"] = B64.encodeToString(it) }
    rawDg14?.let { out["rawDg14Base64"] = B64.encodeToString(it) }
    return out
}

private fun RomanianSignature.toJsMap(): Map<String, Any?> = mapOf(
    "signatureBase64" to B64.encodeToString(signature),
    "certificateBase64" to B64.encodeToString(certificate),
    "signedAttributesBase64" to B64.encodeToString(signedAttributes),
)

private fun PassiveVerificationResult.toJsMap(): Map<String, Any?> {
    val out = HashMap<String, Any?>(4)
    out["valid"] = valid
    out["errors"] = errors
    signerCommonName?.let { out["signerCommonName"] = it }
    signedAt?.let { out["signedAt"] = it.toString() }
    return out
}

// ---------------------------------------------------------------------
// Logger + error marshaling
// ---------------------------------------------------------------------

private class BridgeLoggerAdapter(
    private val onEvent: (level: String, message: String, error: String?) -> Unit,
) : AmSemnatLogger {
    override fun debug(message: String) = onEvent("debug", message, null)
    override fun info(message: String) = onEvent("info", message, null)
    override fun error(message: String, throwable: Throwable?) =
        onEvent("error", message, throwable?.toString())
}

/**
 * Expo Kotlin's `CodedException` hardcodes code generation from its own
 * class name, so the taxonomy is exposed by subclassing once per code.
 * The message carries the JSON sentinel suffix; the JS side extracts
 * `{ retriesRemaining?, parameter?, detail? }` from it.
 */
private class BridgeCodedException(
    code: String,
    message: String,
) : CodedException(code, message, null) {

    companion object {
        private const val SENTINEL = ''

        fun from(err: AmSemnatError): BridgeCodedException {
            val (code, info) = when (err) {
                is AmSemnatError.NfcUnavailable -> "NFC_UNAVAILABLE" to emptyMap()
                is AmSemnatError.NfcDisabled -> "NFC_DISABLED" to emptyMap()
                is AmSemnatError.SessionCancelled -> "SESSION_CANCELLED" to emptyMap()
                is AmSemnatError.SessionTimeout -> "SESSION_TIMEOUT" to emptyMap()
                is AmSemnatError.TagLost -> "TAG_LOST" to emptyMap()
                is AmSemnatError.TagNotValid -> "TAG_NOT_VALID" to emptyMap()
                is AmSemnatError.MultipleTagsFound -> "MULTIPLE_TAGS_FOUND" to emptyMap()
                is AmSemnatError.PaceAuthFailed -> "PACE_AUTH_FAILED" to emptyMap()
                is AmSemnatError.PinVerifyFailed -> "PIN_VERIFY_FAILED" to mapOf("retriesRemaining" to err.retriesRemaining)
                is AmSemnatError.PinBlocked -> "PIN_BLOCKED" to emptyMap()
                is AmSemnatError.ReadFailed -> "READ_FAILED" to mapOf("detail" to err.detail)
                is AmSemnatError.SigningFailed -> "SIGNING_FAILED" to mapOf("detail" to err.detail)
                is AmSemnatError.InvalidInput -> "INVALID_INPUT" to mapOf("parameter" to err.parameter, "detail" to err.detail)
                is AmSemnatError.Unknown -> "UNKNOWN" to mapOf("detail" to err.detail)
            }
            val base = err.message ?: code
            val msg = if (info.isEmpty()) base else base + SENTINEL + JSONObject(info).toString()
            return BridgeCodedException(code, msg)
        }
    }
}
