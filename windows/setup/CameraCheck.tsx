// Camera choice and the camera-sharing check: can Legible read this camera while the call app has it open?

import { useEffect, useState } from 'preact/hooks';
import { api } from '../ui/api';
import type { Settings } from '../../shared/types';
import { isVirtualCamera as isVirtual, pickDefaultCamera } from '../../shared/camera';

type Result = { ok: boolean; title: string; body: string } | null;


function guidance(platform: string, busy: boolean): string {
  if (!busy) return '';
  if (platform === 'win32')
    return 'On Windows most webcams work with one app at a time. Use OBS Virtual Camera: OBS reads the real camera, and both your call app and Legible read "OBS Virtual Camera".';
  if (platform === 'darwin')
    return 'macOS normally lets two apps share a camera. Quit apps you are not using that might hold it (Photo Booth, other video apps), then check again.';
  return 'On Linux a V4L2 camera is often exclusive. Use OBS Virtual Camera (v4l2loopback) so both apps can read it.';
}

export function CameraCheck({ settings, save, obs }: { settings: Settings; save: (p: Partial<Settings>) => Promise<void>; obs: () => void }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [listed, setListed] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [checking, setChecking] = useState(false);
  const platform = api().platform;

  const list = async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    const cams = all.filter((d) => d.kind === 'videoinput');
    setDevices(cams);
    setListed(true);
    // first run, or the saved camera is gone: prefer a real webcam over virtual / screen-mirroring sources
    const saved = cams.find((c) => c.deviceId === settings.deviceId);
    if (!saved) {
      const pick = pickDefaultCamera(cams);
      if (pick) await save({ deviceId: pick.deviceId, deviceLabel: pick.label || 'Camera' });
    }
  };
  useEffect(() => {
    void list();
    navigator.mediaDevices.addEventListener('devicechange', list);
    return () => navigator.mediaDevices.removeEventListener('devicechange', list);
  }, []);

  const check = async () => {
    setChecking(true);
    setResult(null);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: settings.deviceId ? { deviceId: { exact: settings.deviceId } } : true,
      });
      const v = document.createElement('video');
      v.muted = true;
      v.srcObject = stream;
      await v.play();
      // wait for a real frame (a busy camera may open but deliver nothing)
      const gotFrame = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 4000);
        const poll = () => {
          if (v.videoWidth > 0 && v.currentTime > 0) {
            clearTimeout(timer);
            resolve(true);
          } else requestAnimationFrame(poll);
        };
        poll();
      });
      v.pause();
      v.srcObject = null;
      setResult(
        gotFrame
          ? {
              ok: true,
              title: 'Camera works',
              body: 'Legible could read this camera just now. If your call app had its camera on, this path works for live calls.',
            }
          : { ok: false, title: 'No picture', body: `The camera opened but sent no frames. ${guidance(platform, true)}` },
      );
      // refresh labels now that permission is granted
      void list();
    } catch (e) {
      const name = (e as DOMException).name;
      const busy = name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError';
      setResult({
        ok: false,
        title: busy ? 'Camera is busy' : name === 'NotAllowedError' ? 'Camera permission denied' : 'Camera not available',
        body: busy
          ? guidance(platform, true)
          : name === 'NotAllowedError'
            ? 'Allow camera access for Legible in your operating system privacy settings.'
            : 'Pick another camera and check again.',
      });
    } finally {
      stream?.getTracks().forEach((t) => t.stop()); // released immediately
      setChecking(false);
    }
  };

  return (
    <section class="section">
      <h2>Camera</h2>
      <div class="field">
        <label class="label" for="cam">
          Camera Legible reads
        </label>
        <select
          id="cam"
          value={settings.deviceId ?? ''}
          onChange={(e) => {
            const id = (e.target as HTMLSelectElement).value;
            const d = devices.find((x) => x.deviceId === id);
            void save({ deviceId: id, deviceLabel: d?.label ?? null });
            setResult(null);
          }}
        >
          {devices.length === 0 && <option value="">{listed ? 'No cameras found' : 'Looking for cameras…'}</option>}
          {devices.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Camera ${i + 1}`}
              {isVirtual(d.label) ? ' (virtual)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div class="label">Camera-sharing check</div>
      <ol class="steps">
        <li>Open your call app (Zoom, Teams, Meet in a browser) and turn its camera on.</li>
        <li>Press Check. Legible opens the camera for a moment and closes it again.</li>
      </ol>
      <div class="actions">
        <button class="btn" type="button" onClick={check} disabled={checking || devices.length === 0}>
          {checking ? 'Checking…' : 'Check'}
        </button>
        {platform === 'win32' && (
          <button class="link" type="button" onClick={obs}>
            OBS Virtual Camera guide
          </button>
        )}
      </div>
      {result && (
        <div class={`result ${result.ok ? 'ok' : 'bad'}`} role="status">
          <strong>{result.title}.</strong> {result.body}
          {!result.ok && (
            <div style={{ marginTop: '8px' }}>
              <button class="btn small" type="button" onClick={obs}>
                Open the OBS guide
              </button>
            </div>
          )}
        </div>
      )}
      <p class="small">If no camera can be shared, Rehearsal still works on its own: practise before the call, then join with your usual set-up.</p>
    </section>
  );
}
