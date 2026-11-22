import '../ui/base';
import './panel.css';
import { render } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { api, fmtDuration, useLegibleState, useNavigate } from '../ui/api';
import { CHECK_ICON, CloseIcon, Logo } from '../ui/icons';
import { LIGHT_WORD } from '../ui/Light';
import { CHECK_LABEL, STRIP_ORDER } from '../../shared/strings';
import type { CheckId, LegibleState, PanelTab, Settings } from '../../shared/types';
import { SettingsForm } from '../ui/SettingsForm';
import { PrivacyView } from '../ui/PrivacyView';

const TABS: { id: PanelTab; label: string }[] = [
  { id: 'now', label: 'Now' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'mirror', label: 'Mirror' },
  { id: 'settings', label: 'Settings' },
  { id: 'privacy', label: 'Privacy' },
];

function Panel() {
  const s = useLegibleState();
  const initial = (new URLSearchParams(location.search).get('tab') as PanelTab) || 'now';
  const [tab, setTab] = useNavigate(initial);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') api().command({ type: 'close-panel' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onTabKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const n = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    setTab(TABS[n]!.id);
    tabRefs.current[n]?.focus();
  };

  return (
    <div class="panel">
      <header class="bar">
        <Logo size={24} />
        <span class="label">Legible</span>
        {s.camOn && <span class="tag">CAM</span>}
        {s.mode === 'replay' && <span class="tag">REPLAY</span>}
        <button class="close" type="button" aria-label="Close panel" onClick={() => api().command({ type: 'close-panel' })}>
          <CloseIcon size={18} />
        </button>
      </header>
      <nav class="tabs" role="tablist">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div class="body" role="tabpanel">
        {tab === 'now' && <Now s={s} />}
        {tab === 'timeline' && <Timeline s={s} />}
        {tab === 'mirror' && <Mirror s={s} />}
        {tab === 'settings' && <SettingsTab />}
        {tab === 'privacy' && <PrivacyView state={s} compact />}
      </div>
    </div>
  );
}

function Now({ s }: { s: LegibleState }) {
  const rows: CheckId[] = [...STRIP_ORDER];
  return (
    <div>
      {s.error ? (
        <section class="block err">
          <div class="label">Problem</div>
          <h2>{s.error.title}</h2>
          <p>{s.error.detail}</p>
          <div class="row">
            <button
              class="btn primary"
              type="button"
              onClick={() =>
                s.error!.actionId === 'retry'
                  ? api().command({ type: 'retry' })
                  : s.error!.actionId === 'obs-guide'
                    ? api().command({ type: 'open-obs-guide' })
                    : api().command({ type: 'open-setup', screen: 'setup' })
              }
            >
              {s.error.action}
            </button>
            <button class="btn" type="button" onClick={() => api().command({ type: 'stop' })}>
              Stop
            </button>
          </div>
        </section>
      ) : (
        <section class={`block ${s.nudge ? 'nudge' : ''}`}>
          <div class="label">{s.phase === 'off' ? 'Camera off' : s.speaking ? 'You are talking' : 'Listening'}</div>
          <h2>{s.line}</h2>
          {s.nudge && <p>Fix it and the light clears after two seconds.</p>}
          {!s.tracking && s.phase === 'running' && (
            <p>Legible judges nothing while it cannot see one face clearly. This time is left out of your receipt.</p>
          )}
          {s.hint && (
            <p class="hint">
              <span class="label">SDK says</span> {s.hint}
            </p>
          )}
        </section>
      )}
      <hr class="rule" />
      <ul class="checks">
        {rows.map((id) => {
          const Icon = CHECK_ICON[id];
          const st = s.lights[id as keyof typeof s.lights];
          return (
            <li key={id} class={st}>
              <Icon size={20} />
              <span class="name">{CHECK_LABEL[id]}</span>
              <span class="state">{LIGHT_WORD[st]}</span>
            </li>
          );
        })}
      </ul>
      <hr class="rule" />
      <div class="session mono">
        <span>
          <span class="label">Session</span> {fmtDuration(s.totals.elapsedMs / 1000)}
        </span>
        <span>
          <span class="label">Talk</span> {fmtDuration(s.totals.talkMs / 1000)}
        </span>
        {s.phase !== 'off' && (
          <span title="Sensor loop rate while hidden">
            <span class="label">Hz</span> {s.tickHz}
          </span>
        )}
      </div>
    </div>
  );
}

function Timeline({ s }: { s: LegibleState }) {
  return (
    <div>
      <p class="small">Last 5 minutes. One square per 5 seconds.</p>
      <div class="timeline">
        {STRIP_ORDER.map((id) => {
          const cells = s.timeline[id];
          const pad = Array.from({ length: Math.max(0, 60 - cells.length) }, () => 'none' as const);
          return (
            <div class="tl-row" key={id}>
              <span class="label">{CHECK_LABEL[id]}</span>
              <div class="cells" aria-label={`${CHECK_LABEL[id]} timeline`}>
                {[...pad, ...cells].map((c, i) => (
                  <i key={i} class={`c ${c}`} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div class="legend">
        <span>
          <i class="c good" /> Readable
        </span>
        <span>
          <i class="c issue" /> Issue
        </span>
        <span>
          <i class="c listening" /> Listening
        </span>
        <span>
          <i class="c untracked" /> Not tracking
        </span>
      </div>
    </div>
  );
}

/** Mirror: off by default. Opens its own view of the same camera only while a session is using it. */
function Mirror({ s }: { s: LegibleState }) {
  const [on, setOn] = useState(false);
  const [err, setErr] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  const stopMirror = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!on || !s.camOn) {
      stopMirror();
      return;
    }
    let cancelled = false;
    void (async () => {
      const st = await api().invoke('getSettings');
      try {
        const ms = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: st.deviceId ? { deviceId: { exact: st.deviceId } } : true,
        });
        if (cancelled) return ms.getTracks().forEach((t) => t.stop());
        stream.current = ms;
        if (video.current) {
          video.current.srcObject = ms;
          void video.current.play();
        }
        setErr('');
      } catch (e) {
        setErr((e as Error).message || 'Mirror unavailable');
      }
    })();
    return () => {
      cancelled = true;
      stopMirror();
    };
  }, [on, s.camOn]);

  useEffect(() => stopMirror, []);

  const m = s.mouth;
  return (
    <div>
      <label class="toggle">
        <input type="checkbox" checked={on} onChange={(e) => setOn((e.target as HTMLInputElement).checked)} disabled={!s.camOn} />
        <span>Show mirror {s.camOn ? '' : '(only while the camera is on)'}</span>
      </label>
      <div class="mirror">
        {on && s.camOn ? <video ref={video} muted playsInline /> : <div class="mirror-off label">Mirror off</div>}
        <svg class="vf" viewBox="0 0 100 56.25" preserveAspectRatio="none" aria-hidden="true">
          <g stroke="#FFD000" stroke-width="1.4" fill="none">
            <path d="M3 12V3h12M85 3h12v9M97 44v9H85M15 53H3v-9" />
          </g>
          {m && on && (
            <g>
              {/* mirrored: x -> 100 - x */}
              <line x1={100 - m.l.x * 100} y1={m.l.y * 56.25} x2={100 - m.r.x * 100} y2={m.r.y * 56.25} stroke="#FFD000" stroke-width="0.8" />
              <circle cx={100 - m.l.x * 100} cy={m.l.y * 56.25} r="0.9" fill="#FFD000" />
              <circle cx={100 - m.r.x * 100} cy={m.r.y * 56.25} r="0.9" fill="#FFD000" />
            </g>
          )}
        </svg>
      </div>
      <p class="small mono">
        {m ? `Mouth width ${m.widthPct.toFixed(1)}% of frame (closer than 6% is the goal)` : 'Mouth not tracked'}
      </p>
      <p class="small">The mirror is shown only here and is never recorded. The yellow line marks landmarks 61 and 291 (mouth corners).</p>
      {err && <p class="small err-text">{err}</p>}
    </div>
  );
}

function SettingsTab() {
  const [st, setSt] = useState<Settings | null>(null);
  useEffect(() => {
    void api().invoke('getSettings').then(setSt);
  }, []);
  if (!st) return null;
  const save = async (patch: Partial<Settings>) => setSt(await api().invoke('setSettings', patch));
  return (
    <div>
      <SettingsForm settings={st} onChange={save} />
      <hr class="rule" />
      <p class="small">
        Key and camera live in Setup.{' '}
        <button class="btn small" type="button" onClick={() => api().command({ type: 'open-setup', screen: 'setup' })}>
          Open Setup
        </button>
      </p>
    </div>
  );
}


render(<Panel />, document.getElementById('app')!);
