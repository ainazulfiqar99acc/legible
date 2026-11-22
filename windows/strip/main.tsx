import '../ui/base';
import './strip.css';
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { api, useLegibleState } from '../ui/api';
import { Light } from '../ui/Light';
import { StopIcon } from '../ui/icons';
import { STRIP_ORDER } from '../../shared/strings';

/** Optional soft tick (off by default). Output only; Legible never opens the microphone. */
function tick(): void {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.06, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.09);
    setTimeout(() => void ctx.close(), 300);
  } catch {
    /* no audio output */
  }
}

function Strip() {
  const s = useLegibleState();
  const [announce, setAnnounce] = useState('');
  const lastNudge = useRef<string | null>(null);

  // aria-live: announce only nudge starts and tracking changes (the engine already limits nudges to one per 5 s)
  useEffect(() => {
    const key = s.nudge ? `${s.nudge.check}@${s.nudge.since}` : null;
    if (key && key !== lastNudge.current) {
      setAnnounce(s.nudge!.message);
      void api()
        .invoke('getSettings')
        .then((st) => st.tickSound && tick());
    }
    lastNudge.current = key;
  }, [s.nudge?.check, s.nudge?.since]);
  useEffect(() => {
    if (s.phase === 'running' && !s.tracking && s.trackingNote) setAnnounce(s.trackingNote);
  }, [s.tracking, s.trackingNote]);
  useEffect(() => {
    if (s.error) setAnnounce(`${s.error.title}. ${s.error.action}.`);
  }, [s.error?.code]);

  const lineClass = s.error ? 'error' : s.nudge ? 'issue' : !s.tracking && s.phase === 'running' ? 'untracked' : '';
  const isReplay = s.mode === 'replay';

  return (
    <div class={`strip ${lineClass}`}>
      <button
        class="lights"
        type="button"
        aria-label="Open the Legible panel"
        onClick={() => api().command({ type: 'open-panel' })}
      >
        {STRIP_ORDER.map((id) => (
          <Light key={id} id={id} state={s.lights[id]} />
        ))}
      </button>
      <div class="msg" title="Drag to move">
        <div class="tags">
          {s.camOn && <span class="tag">CAM</span>}
          {isReplay && <span class="tag ink">REPLAY</span>}
          {s.mode === 'rehearsal' && <span class="tag ink">PRACTICE</span>}
        </div>
        {/* "Not tracking — reason": the reason goes on its own smaller line so it always fits */}
        <div class="line">
          {s.line.split(' — ')[0]}
          {s.line.includes(' — ') && <span class="sub">{s.line.split(' — ')[1]}</span>}
        </div>
        {s.error && (
          <button
            class="err-action"
            type="button"
            onClick={() =>
              s.error!.actionId === 'retry'
                ? api().command({ type: 'retry' })
                : s.error!.actionId === 'obs-guide'
                  ? api().command({ type: 'open-obs-guide' })
                  : api().command({ type: 'open-setup', screen: 'setup' })
            }
          >
            {s.error.action} →
          </button>
        )}
      </div>
      <button class="stop" type="button" aria-label="Stop (Ctrl+Shift+L)" title="Stop (Ctrl/Cmd+Shift+L)" onClick={() => api().command({ type: 'stop' })}>
        <StopIcon size={20} />
        <span>Stop</span>
      </button>
      <div class="sr-only" role="status" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}

render(<Strip />, document.getElementById('app')!);
