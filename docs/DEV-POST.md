---
title: "Legible: a private coach that keeps you lip-readable on video calls"
published: false
tags: presagechallenge, accessibility, electron, computervision
cover_image: https://raw.githubusercontent.com/ainazulfiqar99acc/legible/main/docs/media/cover.png
---

*This is a submission for the [Presage SmartSpectra SDK Challenge 2026](https://dev.to/challenges/presage-2026-11-04).*

## What I built

People who lip-read need to see the speaker's face: **turned towards them, lit from the front, close enough, at a normal pace.** On video calls we break all four without noticing. We glance at a second screen mid-sentence, sit in front of a bright window, and lean back from the laptop.

**Legible** is a small strip that docks under your webcam. It **stays quiet while you are readable.** When you are not, and **only while you are talking**, it gives you **one short, private nudge**:

| Light | Nudge | What Legible sees |
| --- | --- | --- |
| Face | "Face the camera while you talk" | Head turned more than 20° from your own rehearsal baseline for 1 s (from face landmarks), or the SDK's `FACE_NOT_FORWARD` |
| Light | "Light is behind you" / "Your face is too dark" | Face vs. background brightness from a 160×90 probe twice a second, or the SDK's `TOO_DARK` / `TOO_BRIGHT` |
| Distance | "Move a little closer" | Mouth width (landmarks 61–291) too small a share of the frame for 3 s |

After the call you get a **readability receipt**: how long you talked, the share of it you were readable, your top issue and one tip.

Nobody on the call sees anything. Legible coaches **your own visibility**. It says nothing about anyone's hearing, emotions or health.

## Demo

{% embed https://youtu.be/EnqeuEsMBN8 %}

*(The narrated walkthrough plays a synthetic, numbers-only session through the real app, labelled REPLAY. Narration: the open-source Kokoro-82M voice model.)*

![The strip: a Face nudge, then readable again](https://raw.githubusercontent.com/ainazulfiqar99acc/legible/main/docs/media/cover.png)

The receipt below is from a **real** 3-minute session on a laptop webcam:

![Readability receipt from a real session: 83% readable, top issue Face](https://raw.githubusercontent.com/ainazulfiqar99acc/legible/main/docs/media/receipt-real-session.png)

**Code:** https://github.com/ainazulfiqar99acc/legible

## How I used SmartSpectra

Legible runs the SmartSpectra Node SDK (3.5.0) inside a hidden Electron window and asks it for exactly two metrics: **`FACE_LANDMARKS`** and **`TALKING`**. It also listens to the SDK's **validation status** codes.

- **`TALKING` gates everything.** Each check only runs while SmartSpectra says you are talking, with a 700 ms hangover. Turn away while you *listen*, and nothing happens. This also means Legible detects speech **without a microphone**: the talking signal comes from the face.
- **Landmarks** give head yaw (nose tip vs. outer eye corners, projected on the eye line so head roll does not read as a turn), mouth width and lip opening. The face box also tells the light probe where the face is.
- **Validation codes**, normally used to tell an app "your vitals reading is unreliable", become coaching signals for a *listener*: `FACE_NOT_FORWARD`, `TOO_DARK`, `TOO_BRIGHT`, `FACE_TOO_FAR`. `MULTIPLE_FACES_FOUND` makes Legible stop judging and say "Not tracking — more than one face". It never assesses anyone else.

**When it cannot see you, it says so.** A grey hatched "Not tracking" state replaces the lights, and that time is left out of the receipt. Legible never shows an issue it cannot see.

## Testing it on a real face

A plan made from synthetic data is a guess, so I ran a scripted 3-minute live session on an HP laptop webcam. An on-screen prompt walked me through talking, turning about 30°, turning away silently, covering the lens, leaning back, talking fast and switching off the room light. Legible recorded only numbers: landmark points, the talking flag and brightness means.

What it confirmed:

- The SDK sends **478 landmarks in pixel coordinates** (MediaPipe order), so the mouth-corner and nose indices are right.
- **Face:** nudged **0.5 s** after I started talking while turned. Turning away silently: **no nudge**.
- **Covered lens:** "Not tracking" within about a second.
- **Stop:** camera off and receipt open in 0.9 s.

What it broke, and what I changed (every number is in [`rules/thresholds.ts`](https://github.com/ainazulfiqar99acc/legible/blob/main/rules/thresholds.ts), with the measurement in a comment):

- **The talking flag flickers inside a sentence.** Runs had a median of 0.37 s and gaps a median of 0.18 s. Three-second "hold" rules never completed. Fix: a longer hangover, plus hold timers that survive pauses of up to 1.5 s.
- **A wide-angle laptop camera makes everyone look far away.** My mouth was 5–6.6% of the frame width at a normal seat (the limit was 6%), and about 2% leaning back. The limit is now 3.5%.
- **A normal room is mildly backlit.** Face vs. background was 0.55–0.65 in ordinary light. The backlight limit dropped from 0.6 to 0.42, and a plain "face too dark" check now catches the light going off (face brightness fell from 75 to about 25).
- **Single-frame `MULTIPLE_FACES_FOUND` glitches** (31–78 ms) appeared with only me in the room. They are now debounced at 250 ms.
- **Pace from lip movement did not work.** When I talked fast, my lips opened *less*, so peak counting read fast speech as slower. Pace is now **off by default and labelled experimental**. I would rather ship three checks that work than four that nag.

Replayed through the tuned rules, the same recording produced exactly the right nudges: Face when turned, Distance when leaning back, Light when the room went dark, and none in between. The receipt maths and the engine rules are covered by 87 unit tests and 4 Electron end-to-end tests that run the same analyser.

## Privacy and consent

> Legible looks at your own face to tell you, privately, when you are hard to lip-read. It never uses the microphone, records nothing, and shares nothing with the people on your call. SmartSpectra runs on your computer, checks its licence online, and telemetry is off.

- The camera opens only after in-app consent, only during Rehearsal or a session, and is marked by a yellow **CAM** tag. **Ctrl/Cmd+Shift+L** stops it.
- No microphone (`audio: false` everywhere; microphone permission is always denied), no video recording, no screen capture.
- The API key is stored encrypted with the OS keychain (Electron `safeStorage`). It is only handed to the hidden sensor window, never logged.
- **Privacy → Delete everything** removes the one data folder.
- SmartSpectra metrics are for general wellness and information only. Legible makes no medical claims.

## How it's built

- **Electron**, with multiple windows: a hidden sensor window (`backgroundThrottling: false`, about 30 Hz while hidden) owns the camera, the SDK and a **pure, deterministic analyser**. The strip, panel, setup and receipt are small **Preact** windows that receive state through the main process.
- **The same analyser everywhere.** Live sessions, the REPLAY mode (for judges without a key) and the unit tests run the same code on the same numbers-only events.
- **Nudge engine:** one nudge at a time (Face > Light > Distance); it clears after 2 s of good state; at most one new nudge every 5 s; the same nudge does not repeat within 30 s.
- **Camera sharing:** on Windows a webcam often serves one app at a time. Setup checks this and explains the OBS Virtual Camera route. **Rehearsal** (8 sentences, before/after receipts) also works on its own.

Try it without a key: `npm install && npm run build && npm run replay`.

## Limitations and what's next

- The thresholds are tuned on **one** person, camera and room. Next: more people, and the planned lip-reading benefit test (viewers transcribe muted clips with and without Legible's tips).
- Camera sharing with Zoom/Teams/Meet still needs measuring on more machines.
- Pace needs a better signal than lip-opening peaks.

## Credits

Presage SmartSpectra SDK · Electron · electron-vite · Preact · Vitest · Playwright · IBM Plex (OFL) · Kokoro-82M (Apache 2.0) for the narration · communication guidance from RNID and City Lit.
