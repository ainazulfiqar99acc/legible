# Sharing one camera with OBS Virtual Camera

On Windows, most webcams serve **one app at a time**. If your call app (Zoom, Teams, Meet) holds the camera, Legible cannot open it: you get "Camera is busy". OBS Studio solves this by publishing a virtual camera that several apps can read at once.

On macOS, two apps can usually share a camera, so OBS is rarely needed. On Linux, use OBS with `v4l2loopback`.

## Steps (Windows)

1. Install **OBS Studio** from https://obsproject.com/ (free, open source, separate software).
2. In OBS, under **Sources**, add **Video Capture Device** and choose your webcam. Set the resolution to **1280×720** and the FPS to **30**.
3. Press **Start Virtual Camera** (Controls panel, bottom right).
4. In your call app, choose **OBS Virtual Camera** as the camera.
5. In Legible → Setup → Camera, choose **OBS Virtual Camera**, then press **Check**. You should see "Camera works".
6. Start Legible with **Use in a call** or **Ctrl+Shift+L**.

## What reads what

- **OBS** reads your physical webcam.
- **Your call app** reads OBS Virtual Camera, so the people on the call see exactly what Legible checks.
- **Legible** reads **only** OBS Virtual Camera. It does not control OBS, does not read OBS's settings or files, and sends nothing back.

## Tips

- Keep the OBS picture **unmirrored and uncropped** around your face. Lighting and distance checks then judge the same picture your call sends.
- If you add OBS filters (brightness, background blur), add them knowing your call sends the filtered picture too. Legible judges what the listener actually receives.
- If Legible says "No picture", start the virtual camera in OBS first, then press Check again.

## If nothing works

Use **Rehearsal**: practise the habit before the call with the camera free, then join the call as usual. The receipt's before/after comparison shows the improvement.
