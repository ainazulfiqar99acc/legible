import { useEffect, useState } from 'preact/hooks';
import type { LegibleState, Receipt } from '../../shared/types';
import { api } from './api';

export function PrivacyView({ state, compact = false }: { state: LegibleState; compact?: boolean }) {
  const [path, setPath] = useState('');
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [msg, setMsg] = useState('');
  const [confirming, setConfirming] = useState(false);

  const refresh = () => {
    void api().invoke('dataPath').then(setPath);
    void api().invoke('listReceipts').then(setReceipts);
  };
  useEffect(refresh, []);

  const deleteReceipts = async () => {
    for (const r of receipts) await api().invoke('discardReceipt', r.id);
    setMsg(`Deleted ${receipts.length} receipt${receipts.length === 1 ? '' : 's'}.`);
    refresh();
  };
  const deleteEverything = async () => {
    const r = await api().invoke('deleteEverything');
    setConfirming(false);
    setMsg(r.ok ? 'Everything deleted. The data folder is empty.' : 'Some files could not be deleted.');
    refresh();
  };

  return (
    <div class="privacy">
      <section>
        <div class="label">Camera</div>
        <p>
          {state.camOn ? (
            <>
              <span class="tag">CAM</span> The camera is on for this session.
            </>
          ) : (
            'The camera is off.'
          )}
        </p>
        {state.phase !== 'off' && (
          <button class="btn primary" type="button" onClick={() => api().command({ type: 'stop' })}>
            Stop camera now
          </button>
        )}
      </section>
      <hr class="rule" style={{ margin: '14px 0' }} />
      <section>
        <div class="label">What Legible does not do</div>
        <ul class="plain">
          <li>No microphone. Talking is detected from lip movement.</li>
          <li>No recording or storing of video. Brightness numbers are computed twice a second and thrown away.</li>
          <li>Nothing is sent to the people on your call.</li>
          <li>It never judges identity, emotion, health or hearing, and stops judging when a second face appears.</li>
        </ul>
      </section>
      <hr class="rule" style={{ margin: '14px 0' }} />
      <section>
        <div class="label">Network</div>
        <p>
          SDK telemetry is <strong>off</strong> (<span class="mono">enableTelemetry: false</span>). SmartSpectra still checks its licence online
          while it runs; that is the only network request.
        </p>
      </section>
      <hr class="rule" style={{ margin: '14px 0' }} />
      <section>
        <div class="label">Stored on this computer</div>
        <p>Settings, your rehearsal baseline (head angle, syllable rate), receipts you keep, and your API key encrypted by the OS.</p>
        <p class="mono small" style={{ wordBreak: 'break-all' }}>
          {path}
        </p>
        <p>
          {receipts.length} kept receipt{receipts.length === 1 ? '' : 's'}.
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button class="btn" type="button" disabled={receipts.length === 0} onClick={deleteReceipts}>
            Delete receipts
          </button>
          {!confirming ? (
            <button class="btn danger" type="button" onClick={() => setConfirming(true)}>
              Delete everything
            </button>
          ) : (
            <>
              <button class="btn danger" type="button" onClick={deleteEverything}>
                Yes, delete everything
              </button>
              <button class="btn" type="button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
        {msg && (
          <p role="status" style={{ marginTop: '10px' }}>
            {msg}
          </p>
        )}
        {!compact && <p class="small">Delete everything removes settings, baseline, receipts, recordings and the stored key.</p>}
      </section>
    </div>
  );
}
