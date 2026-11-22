# Privacy, consent and data handling

Legible looks only at your own face, never listens, never records, and shares nothing with the people on your call.

## Consent

Before any camera access, Legible shows what it measures and what it never does. Until you press **I agree**, the main process refuses every camera permission request (`setPermissionRequestHandler` in `app/main/index.ts`).

- **Measured:** head direction, mouth size and movement, light on your face compared with the background, whether you are talking (from lip movement).
- **Not measured:** identity, emotion, health, hearing.
- **Not done:** microphone, recording, screen capture, sending anything to the call.

## Camera

- The camera is on only during **Rehearsal** and a **live session**. A yellow **CAM** tag shows on the strip, panel and setup window while it is on.
- Stop with the **Stop** square, **Ctrl/Cmd+Shift+L**, closing the strip, or quitting. Shutdown order: stop camera tracks (the camera light goes off at once), `await sdk.stop()`, `sdk.destroy()`, then the hidden sensor window is destroyed.
- The **Setup → Check** button and **Setup → Check this computer** (the SDK readiness check, ~25 s) open the camera for a moment and close it again. Neither runs on its own.
- The panel's **Mirror** is off by default and is never recorded.

## Breathing

**Pauses** (on by default) asks the SDK for its chest breathing trace, computed on your computer from the same camera frames. Legible uses it only to notice long talk runs without a breath pause. The trace is not shown as a number, not stored (except inside the optional, off-by-default numbers-only recording), and nothing is said about health. Switch Pauses off in Settings and the breathing metrics are no longer requested.

## Microphone

Never. Every `getUserMedia` call passes `audio: false`, the permission handler rejects any request that includes audio, and a unit test scans the source for audio capture.

## What the SDK does

SmartSpectra processes frames on your computer. It checks its licence with Presage online; there is no offline mode. **SDK telemetry is switched off** (`enableTelemetry: false`). Replay mode uses neither the SDK nor the network.

## What is stored

All of it is in one folder: `<userData>/legible-data/` (shown in Privacy, with the full path).

| File | Contents |
| --- | --- |
| `settings.json` | Which checks are on, sensitivity, strip position, chosen camera ID, consent flag |
| `baseline.json` | From Rehearsal: median head angle, visible syllables per second, lip-aperture range, mouth/face brightness ratio |
| `key.bin` | Your API key, encrypted with Electron `safeStorage` (DPAPI / Keychain / libsecret) |
| `receipts/*.json` | Only receipts you press **Keep** on: durations, percentages, issue counts |
| `recordings/*.json` | Only if you turn on "Save a numbers-only recording": seven landmark points, the face box, talking flags, validation codes and brightness means per frame. No pixels. |

Brightness is computed from a 160×90 copy of the frame twice a second. The pixel buffer is zeroed immediately after the means are computed.

`<userData>` is `%APPDATA%\legible` on Windows, `~/Library/Application Support/legible` on macOS and `~/.config/legible` on Linux.

## Deletion

- **Discard** on a receipt deletes it. Closing the receipt window without Keep also discards it.
- **Privacy → Delete receipts** deletes every kept receipt.
- **Privacy → Delete everything** stops any session, removes `legible-data/` entirely (settings, baseline, key, receipts, recordings) and clears the browser storage. The e2e test checks that the folder is empty afterwards.

## API key

The key is stored encrypted and never reaches a UI window. Only the hidden sensor window can ask for it, over an IPC handler that checks the sender, and only to construct the SDK. Logs record event names only and redact anything token-shaped.

## A second person in frame

When the SDK reports `MULTIPLE_FACES_FOUND`, Legible stops judging at once and shows "Not tracking — more than one face". That time is not counted in your receipt.

## Using OBS

If you use OBS Virtual Camera, OBS (separate software) reads your physical camera and Legible reads only the virtual camera. See [OBS-GUIDE.md](OBS-GUIDE.md).

## Draft disclosure for the DEV post

> Legible looks at your own face to tell you, privately, when you are hard to lip-read: turned away, backlit, too far or rushing. It never uses the microphone, records nothing, and shares nothing with the people on your call. SmartSpectra runs on your computer, checks its licence online, and telemetry is off.
