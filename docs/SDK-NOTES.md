# SmartSpectra SDK notes

Checked against the installed `@smartspectra/node-sdk` **3.5.0** (`js/index.d.ts`, `js/renderer/index.d.ts`, `js/main/index.d.ts`, `js/messages/*.d.ts`, `js/preload/index.js`, `docs/device-readiness.md`) on 20 Nov 2026. Legible uses only the names below. All SDK calls are in `windows/sensor/sdk.ts` (renderer) and `app/main/readiness.ts` (main).

## What Legible calls

| Where | API | Notes |
| --- | --- | --- |
| main | `bindSmartSpectraIpc(window, { logger })` from `@smartspectra/node-sdk/main` | Once per sensor window; the binding releases itself when the window closes. |
| sensor preload | `require('@smartspectra/node-sdk/preload')` | Exposes `window.__smartspectraBridge`. Loaded from Legible's own preload, so the sensor window uses `sandbox: false`. |
| sensor renderer | `new SmartSpectraSDK({ apiKey, requestedMetrics, enableTelemetry: false })` from `@smartspectra/node-sdk/renderer` | `requestedMetrics = [MetricType.FACE_LANDMARKS (11), MetricType.TALKING (13)]`, plus `...breathingMetrics` only when the Pauses check (F12) is switched on. |
| sensor renderer | `sdk.useMediaStream(stream)` | The stream comes from `getUserMedia({ audio: false, video: { deviceId } })`. The SDK never stops host-owned tracks, so Legible stops them itself. |
| sensor renderer | `sdk.on('metrics' \| 'validationStatus' \| 'error' \| 'processingStatus', …)` | Signatures as typed: `metrics(buf: Uint8Array, timestampUs)`, `validationStatus(code, timestampUs, hint)`, `error(code, message, retryable)`. |
| sensor renderer | `await sdk.start()`, `await sdk.stop()`, `sdk.destroy()` | |
| sensor renderer | `decodeMetrics(buf)` from `@smartspectra/node-sdk/messages` | Accepts a `Uint8Array`. |
| main | `new SmartSpectraSDK({ …, enableTelemetry: false }).useCamera(CameraSelection.byId(id) \| CameraSelection.default)` then `await checkDeviceReadiness()` and `await destroy()` | Verdict is compared explicitly: `verdict === 'ready'`. |

Never called: `requestInsight`, `useFile`, `useCustomInput`. A unit test (`tests/unit/privacy.test.ts`) fails if `requestInsight` or `enableTelemetry: true` ever appears.

## Differences from the plan

1. **Renderer `stop()` is async; there is no `stopAsync()` on the renderer class.** `stopAsync()` exists only on the main-process `SmartSpectraSDK`. Legible's shutdown is: stop camera tracks, then `await sdk.stop()` (with a 1.5 s cap), then `sdk.destroy()`, then main destroys the sensor window.
2. **`checkDeviceReadiness()` exists only on the main-process SDK** and needs a camera source (`useCamera`). File and custom inputs return `inconclusive`. So readiness runs in the main process, after consent, while no session holds the camera. It opens the camera natively for the check. It runs **only on demand** from Setup → "Check this computer". Measured on 22 Nov (HP laptop): it takes **~24 s** and judges the conditions of that moment — with nobody seated it returned `blocked`, and a minute later, seated, `ready` ("Qualified. Proceed with the tested configuration under the current conditions."). Running it before every first session therefore delayed the camera by ~25 s and could block a session that would have worked, so it no longer gates sessions; live problems surface as SDK errors and validation codes.
3. **Protobuf field names are camelCase** (protobufjs): `breathing.upperTrace`, not `upper_trace`.
4. **`Face.talking` and `Face.landmarks` are arrays.** One metrics packet can carry several samples, each with its own timestamp; Legible processes each one.
5. **Validation codes are integers named with a `k` prefix** (`ValidationCode.kFaceNotForward = 17`). Legible maps them to the plan's names in `windows/sensor/decode.ts`. There are also codes the plan did not list: `kFaceSizeOutOfRange` (4, deprecated) and `kChestNotVisible` (7).
6. **Extra error codes** beyond the plan's list: `kInvalidState`, `kConfigurationFailed`, `kServerError`, `kProcessingFailed`, `kFrameConversionFailed`, `kNonMonotonicTimestamp`, `kTimestampGap`, `kMetricNotAuthorized`. Each one maps to a plain message and an action (`shared/strings.ts`, tested in `tests/unit/errors.test.ts`).
7. **Timestamps are epoch microseconds.** The renderer anchors `VideoFrame.timestamp` to `Date.now()` (`js/renderer/timestamp.js`). Legible maps them to session time with an offset that keeps every event at or before its arrival time (`Clock` in `sdk.ts`).
8. **`logLevel` is not in the renderer typings' re-exports** (`SmartSpectraLogLevel` is only exported from the root). Legible leaves the default (`kWarning`).

## Facts relied on

- Landmarks: 478 `{x, y}` points with `stable`, `reset` and a timestamp. Legible keeps only indices 1, 33, 263, 61, 291, 13 and 14, plus the bounding box (`windows/sensor/decode.ts`). Sets with fewer than 478 points are ignored.
- Talking: `{detected, stable, timestamp}`.
- Telemetry defaults to **on**; Legible always passes `false` (renderer session and readiness instance).
- Licence authentication is online; there is no offline mode. Replay mode needs neither a key nor a network connection.

## Stage 1 measurements (real camera, 22 Nov 2026)

HP Wide Vision HD Camera (0408:5482), Windows 11, one person at a desk, normal room light. Driven by `scripts/live-check.mjs`, analysed with `scripts/live-report.mjs` and `tests/unit/live-recording.test.ts` (numbers-only recordings). Full table in `docs/RESULTS.md`.

1. **Landmark model: confirmed.** `FACE_LANDMARKS` sends **478 points** (MediaPipe Face Mesh with irises), so the indices 1/33/263/61/291/13/14 apply. The one-off diagnostic log line reads `landmarks n=478 x=577..767 y=313..546 frame=1280x720`.
2. **Coordinate space: confirmed pixels** of the 1280×720 input (x and y ranges above are in pixels, not 0–1). No change to `session.ts`.
3. **Yaw.** Facing the camera: median 1–3° (rehearsal baseline −3°). Turned to "a second screen": 35–58°. Silent turn: 44–55°. The facing check separates clearly at the 20° limit. Not yet checked against a protractor at exactly 15/30°, so `NOSE_DEPTH_RATIO` is unchanged.
4. **Pace: does not separate on a real face.** Visible lip-opening peaks per talking second: normal 0.7–1.2/s, *fast* 0.5–0.7/s, slow 0.7–0.9/s. Fast speech opens the lips *less* (median aperture 0.007 vs 0.026 normal), so peak counting reads fast talk as slower. Smoothing and prominence variants (1–3 frames, 10–30%) did not fix the order. **Pace is now off by default and labelled experimental.**
5. **Update rate.** Landmarks arrive at **~22–25 per second** (camera delivered ~22 fps; the SDK reported `FRAME_RATE_TOO_LOW` for most of the session). The sensor loop ran at a median 23 Hz. Talking packets ~25 per second.
6. **Talking signal shape.** `talking.detected` flickers within continuous speech: runs median 0.37 s, gaps median 0.18 s, p75 0.8 s. Hence `SPEAKING_HANGOVER_MS` 400 → 700 and hold timers now survive pauses up to 1.5 s (`HOLD_GAP_TOLERANCE_MS`).
7. **Validation codes seen:** OK, FRAME_RATE_TOO_LOW, EXCESSIVE_MOTION, FACE_NOT_FORWARD, TOO_DARK (lens covered), FACE_TOO_LOW, and **MULTIPLE_FACES_FOUND as 6 single-frame glitches (31–78 ms)** with one person present. Hence a 250 ms debounce (`MULTI_FACE_DEBOUNCE_MS`). `FACE_TOO_FAR` was never reported, even leaning far back, so Distance relies on mouth width.
8. **Camera sharing** with a call app: still to measure (`docs/RESULTS.md`).

## Eligibility question for Presage (Discord)

> Does an app whose live behaviour is driven by face landmarks, talking detection and validation status meet the "at least one live Presage signal" rule?

**Decision (22 Nov 2026):** without waiting for the answer, **Pauses** (F12) is now **on by default** (`DEFAULT_SETTINGS.checks.phrase`) and is the fourth light on the strip, in the slot Pace used. Legible therefore always requests the `breathingMetrics` bundle and reacts live to the chest breathing trace: more than 25 s of talking without a pause containing an inhale → "Pause between sentences". Without a stable trace (e.g. `CHEST_NOT_VISIBLE` on a tightly framed laptop camera) the light shows "No data" and never nudges. Verified on synthetic fixtures (`long-run`, `demo`); **not yet verified on a real chest trace**.
