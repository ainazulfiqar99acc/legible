// In-app version of docs/OBS-GUIDE.md.

import { api } from '../ui/api';

export function ObsGuide({ back }: { back: () => void }) {
  return (
    <section class="section">
      <h1>Share one camera with OBS</h1>
      <p>
        On Windows, most webcams can be used by one app at a time. OBS Studio (free, separate software) can read the real camera and publish an
        "OBS Virtual Camera" that several apps can read at once.
      </p>
      <ol class="steps">
        <li>
          Install OBS Studio from{' '}
          <button class="link" type="button" onClick={() => void api().invoke('openExternal', 'https://obsproject.com/')}>
            obsproject.com
          </button>
          .
        </li>
        <li>In OBS, under Sources, add <strong>Video Capture Device</strong> and choose your webcam. Set it to 1280×720, 30 fps.</li>
        <li>
          In OBS, press <strong>Start Virtual Camera</strong>.
        </li>
        <li>
          In your call app (Zoom, Teams, Meet), choose <strong>OBS Virtual Camera</strong> as the camera.
        </li>
        <li>
          In Legible Setup, choose <strong>OBS Virtual Camera</strong> too, then press Check.
        </li>
      </ol>
      <hr class="rule" />
      <h2>What reads what</h2>
      <p>
        OBS reads your physical camera. Legible reads only the virtual camera, the same picture your call already sends. Legible does not control
        OBS, and OBS does not send anything to Legible beyond that picture.
      </p>
      <p class="small">Keep OBS's picture unmirrored and uncropped around your face, so lighting and distance checks see what the call sees.</p>
      <button class="btn" type="button" onClick={back}>
        Back to Setup
      </button>
    </section>
  );
}
