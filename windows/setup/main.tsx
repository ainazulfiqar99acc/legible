import '../ui/base';
import './setup.css';
import { render } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { api, useLegibleState } from '../ui/api';
import { Logo } from '../ui/icons';
import { PrivacyView } from '../ui/PrivacyView';
import { SettingsForm } from '../ui/SettingsForm';
import { Light } from '../ui/Light';
import { REHEARSAL_SENTENCES, STRIP_ORDER, WHY_POINTS } from '../../shared/strings';
import type { Baseline, Settings, SetupScreen } from '../../shared/types';
import { CameraCheck } from './CameraCheck';
import { ObsGuide } from './ObsGuide';

type Screen = SetupScreen | 'rehearsal-done' | 'settings';
type Intent = 'rehearse' | 'call' | null;

function App() {
  const initial = (new URLSearchParams(location.search).get('screen') as Screen) || 'welcome';
  const [screen, setScreen] = useState<Screen>(initial);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [intent, setIntent] = useState<Intent>(null);
  const state = useLegibleState();

  const refresh = useCallback(async () => {
    setSettings(await api().invoke('getSettings'));
    setHasKey((await api().invoke('hasKey')).hasKey);
  }, []);
  useEffect(() => {
    void refresh();
    return api().onNavigate((to) => {
      setScreen(to as Screen);
      void refresh();
    });
  }, []);
  useEffect(() => {
    document.getElementById('main')?.focus();
  }, [screen]);

  const save = async (patch: Partial<Settings>) => setSettings(await api().invoke('setSettings', patch));

  /** Rehearse / Use in a call: consent first, then key and camera, then go. */
  const go = (what: Exclude<Intent, null>) => {
    setIntent(what);
    if (!settings?.consentGiven) return setScreen('consent');
    if (!hasKey || !settings.deviceId) return setScreen('setup');
    if (what === 'rehearse') return setScreen('rehearsal');
    api().command({ type: 'start', mode: 'live' });
  };

  if (!settings) return null;
  return (
    <div class="setup">
      <header class="topbar">
        <button class="brand" type="button" onClick={() => setScreen('welcome')} aria-label="Legible home">
          <Logo size={28} />
          <span class="label">Legible</span>
        </button>
        {state.camOn && <span class="tag">CAM</span>}
        <nav>
          <button type="button" aria-current={screen === 'setup'} onClick={() => setScreen('setup')}>
            Setup
          </button>
          <button type="button" aria-current={screen === 'settings'} onClick={() => setScreen('settings')}>
            Settings
          </button>
          <button type="button" aria-current={screen === 'privacy'} onClick={() => setScreen('privacy')}>
            Privacy
          </button>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        {screen === 'welcome' && <Welcome go={go} why={() => setScreen('why')} />}
        {screen === 'why' && <Why back={() => setScreen('welcome')} />}
        {screen === 'consent' && (
          <Consent
            onAgree={async () => {
              await save({ consentGiven: true });
              setScreen('setup');
            }}
            onLeave={() => setScreen('welcome')}
          />
        )}
        {screen === 'setup' && (
          <Setup
            settings={settings}
            hasKey={hasKey}
            onSaved={refresh}
            save={save}
            intent={intent}
            go={go}
            obs={() => setScreen('obs')}
            consent={() => setScreen('consent')}
          />
        )}
        {screen === 'obs' && <ObsGuide back={() => setScreen('setup')} />}
        {screen === 'rehearsal' && <Rehearsal state={state} />}
        {screen === 'rehearsal-done' && <RehearsalDone again={() => setScreen('rehearsal')} call={() => go('call')} />}
        {screen === 'privacy' && (
          <section class="section">
            <h1>Privacy</h1>
            <PrivacyView state={state} />
          </section>
        )}
        {screen === 'settings' && (
          <section class="section">
            <h1>Settings</h1>
            <SettingsForm settings={settings} onChange={save} />
          </section>
        )}
      </main>
    </div>
  );
}

function Welcome({ go, why }: { go: (w: 'rehearse' | 'call') => void; why: () => void }) {
  return (
    <>
      <section class="section hero">
        <Logo size={72} onYellow />
        <h1>Stay lip-readable on calls.</h1>
        <p>
          Legible sits under your webcam and stays quiet while people can read your lips. When you turn away, sit with a window behind you,
          drift too far or rush <em>while you are talking</em>, it gives you one short, private nudge.
        </p>
        <div class="actions">
          <button class="btn primary" type="button" onClick={() => go('rehearse')}>
            Rehearse
          </button>
          <button class="btn primary" type="button" onClick={() => go('call')}>
            Use in a call
          </button>
        </div>
        <p class="small">
          <button class="link" type="button" onClick={why}>
            Why this matters
          </button>
        </p>
      </section>
      <hr class="rule" />
      <section class="section">
        <h2>No key or camera?</h2>
        <p>Watch a replay of a synthetic, numbers-only session. It drives the real strip, engine and receipt.</p>
        <button class="btn" type="button" onClick={() => api().command({ type: 'start', mode: 'replay' })}>
          Watch a replay
        </button>
      </section>
      <hr class="rule" />
      <section class="section small">
        <p>
          Shortcut: <span class="mono">Ctrl/Cmd + Shift + L</span> starts and stops sensing. Legible never uses the microphone and never records
          video.
        </p>
      </section>
    </>
  );
}

function Why({ back }: { back: () => void }) {
  return (
    <section class="section">
      <h1>Why this matters</h1>
      <p>People who lip-read depend on seeing the speaker's face and mouth. Three things help most:</p>
      {WHY_POINTS.map((w) => (
        <div class="why" key={w.title}>
          <h2>{w.title}</h2>
          <p>{w.body}</p>
          <p class="small">
            Source:{' '}
            <button class="link" type="button" onClick={() => void api().invoke('openExternal', w.url)}>
              {w.source}
            </button>
          </p>
        </div>
      ))}
      <p class="small">Legible coaches your own visibility only. It says nothing about anyone's hearing.</p>
      <button class="btn" type="button" onClick={back}>
        Back
      </button>
    </section>
  );
}

function Consent({ onAgree, onLeave }: { onAgree: () => void; onLeave: () => void }) {
  return (
    <section class="section">
      <h1>Before the camera turns on</h1>
      <div class="consent">
        <div>
          <div class="label">Legible measures</div>
          <ul>
            <li>which way your head is facing</li>
            <li>the size and movement of your mouth</li>
            <li>how much light falls on your face compared with behind you</li>
            <li>whether you are talking (from lip movement)</li>
          </ul>
        </div>
        <div>
          <div class="label">Legible never</div>
          <ul>
            <li>uses the microphone</li>
            <li>records or stores video or images</li>
            <li>sends anything to the people on your call</li>
            <li>judges identity, emotion, health or hearing</li>
          </ul>
        </div>
      </div>
      <hr class="rule" />
      <p>
        The camera is on only during Rehearsal and while the strip is running, marked by a yellow <span class="tag">CAM</span> tag. Stop it with the
        Stop square or <span class="mono">Ctrl/Cmd + Shift + L</span>.
      </p>
      <p class="small">
        Face analysis runs on your computer with the Presage SmartSpectra SDK. The SDK checks its licence online; its telemetry is switched off.
      </p>
      <div class="actions">
        <button class="btn primary" type="button" onClick={onAgree}>
          I agree — allow the camera
        </button>
        <button class="btn" type="button" onClick={onLeave}>
          Leave
        </button>
      </div>
    </section>
  );
}

function Setup(props: {
  settings: Settings;
  hasKey: boolean;
  onSaved: () => Promise<void>;
  save: (p: Partial<Settings>) => Promise<void>;
  intent: Intent;
  go: (w: 'rehearse' | 'call') => void;
  obs: () => void;
  consent: () => void;
}) {
  const { settings, hasKey } = props;
  const [key, setKey] = useState('');
  const [keyMsg, setKeyMsg] = useState('');
  const [ready, setReady] = useState<{ verdict: string; reason: string } | null>(null);
  const [checking, setChecking] = useState(false);

  const saveKey = async (e: Event) => {
    e.preventDefault();
    const r = await api().invoke('saveKey', key);
    setKeyMsg(r.message);
    if (r.ok) setKey('');
    await props.onSaved();
  };

  const readiness = async () => {
    setChecking(true);
    setReady(null);
    setReady(await api().invoke('readiness', { deviceLabel: settings.deviceLabel }));
    setChecking(false);
  };

  return (
    <>
      <section class="section">
        <h1>Setup</h1>
        <form onSubmit={saveKey}>
          <div class="field">
            <label class="label" for="key">
              SmartSpectra API key
            </label>
            <input
              id="key"
              type="password"
              autocomplete="off"
              spellcheck={false}
              value={key}
              placeholder={hasKey ? 'Saved — enter a new key to replace it' : 'Paste your key'}
              onInput={(e) => setKey((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="actions">
            <button class="btn" type="submit" disabled={key.trim().length === 0}>
              Save key
            </button>
            {hasKey && (
              <span class="ok">
                <span class="tag">Saved</span> stored encrypted by your OS
              </span>
            )}
          </div>
          {keyMsg && <p role="status">{keyMsg}</p>}
        </form>
      </section>
      <hr class="rule" />
      {!settings.consentGiven ? (
        <section class="section">
          <h2>Camera</h2>
          <p>Agree to the camera consent first.</p>
          <button class="btn primary" type="button" onClick={props.consent}>
            Read the consent
          </button>
        </section>
      ) : (
        <CameraCheck settings={settings} save={props.save} obs={props.obs} />
      )}
      <hr class="rule" />
      <section class="section">
        <h2>This computer</h2>
        <p>The SDK's readiness check opens the camera for a moment and tells you whether this computer can keep up.</p>
        <div class="actions">
          <button class="btn" type="button" onClick={readiness} disabled={checking || !hasKey || !settings.consentGiven}>
            {checking ? 'Checking…' : 'Check this computer'}
          </button>
        </div>
        {ready && (
          <p role="status">
            <span class={`tag ${ready.verdict === 'ready' ? '' : 'ink'}`}>{ready.verdict}</span> {ready.reason}
          </p>
        )}
      </section>
      <hr class="rule" />
      <section class="section">
        <div class="actions">
          <button class="btn primary" type="button" disabled={!hasKey || !settings.deviceId} onClick={() => props.go('rehearse')}>
            Rehearse now
          </button>
          <button class="btn primary" type="button" disabled={!hasKey || !settings.deviceId} onClick={() => props.go('call')}>
            Use in a call
          </button>
        </div>
        {(!hasKey || !settings.deviceId) && <p class="small">Add a key and choose a camera to continue.</p>}
      </section>
    </>
  );
}

function Rehearsal({ state }: { state: ReturnType<typeof useLegibleState> }) {
  const [setBaseline, setSetBaseline] = useState(true);
  const [hasBaseline, setHasBaseline] = useState(false);
  useEffect(() => {
    void api().invoke('getBaseline').then((b) => setHasBaseline(!!b));
  }, []);
  const running = state.mode === 'rehearsal' && state.phase !== 'off';
  const idx = state.rehearsal ? state.rehearsal.sentence - 1 : 0;
  const total = REHEARSAL_SENTENCES.length;

  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') api().command({ type: 'rehearsal-next' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running]);

  if (!running) {
    return (
      <section class="section">
        <h1>Rehearsal</h1>
        <p>
          Read eight short sentences out loud at a comfortable pace, facing the camera. Legible learns how you normally hold your head and how fast
          your lips move, so later nudges are about <em>you</em>.
        </p>
        <label class="toggle">
          <input type="checkbox" checked={setBaseline} onChange={(e) => setSetBaseline((e.target as HTMLInputElement).checked)} />
          <span>Use this run to set my baseline</span>
        </label>
        {hasBaseline && (
          <p class="small">
            Before/after check: turn this off and rehearse once with your usual habits (second screen, window behind you), then once with Legible's
            tips. The receipt compares the two.
          </p>
        )}
        <div class="actions">
          <button class="btn primary" type="button" onClick={() => api().command({ type: 'start', mode: 'rehearsal', setBaseline })}>
            Start rehearsal
          </button>
        </div>
        {state.error && (
          <p role="alert" class="err">
            {state.error.title}: {state.error.detail}
          </p>
        )}
      </section>
    );
  }

  return (
    <section class="section rehearsal">
      <div class="progress" aria-label={`Sentence ${idx + 1} of ${total}`}>
        <span class="mono">
          Sentence {Math.min(idx + 1, total)} / {total}
        </span>
        <div class="squares">
          {Array.from({ length: total }, (_, i) => (
            <i key={i} class={i < idx ? 'done' : i === idx ? 'now' : ''} />
          ))}
        </div>
      </div>
      <p class="sentence" aria-live="polite">
        {REHEARSAL_SENTENCES[Math.min(idx, total - 1)]}
      </p>
      <hr class="rule" />
      <div class="live">
        <div class="lights">
          {STRIP_ORDER.map((id) => (
            <Light key={id} id={id} state={state.lights[id]} />
          ))}
        </div>
        <div class="line" role="status" aria-live="polite">
          {state.error ? state.error.title : state.line}
        </div>
      </div>
      <hr class="rule" />
      <div class="actions">
        <button class="btn primary" type="button" onClick={() => api().command({ type: 'rehearsal-next' })}>
          {idx + 1 >= total ? 'Finish' : 'Next'}
        </button>
        <button class="btn" type="button" onClick={() => api().command({ type: 'rehearsal-redo' })}>
          Redo
        </button>
        <button class="btn" type="button" onClick={() => api().command({ type: 'stop' })}>
          Stop
        </button>
      </div>
      <p class="small">Tip: press → to go to the next sentence.</p>
    </section>
  );
}

function RehearsalDone({ again, call }: { again: () => void; call: () => void }) {
  const [base, setBase] = useState<Baseline | null>(null);
  useEffect(() => {
    void api().invoke('getBaseline').then(setBase);
  }, []);
  return (
    <section class="section">
      <h1>Rehearsal done</h1>
      {base ? (
        <dl class="mono baseline">
          <div>
            <dt>Head angle</dt>
            <dd>{base.yawDeg.toFixed(1)}°</dd>
          </div>
          <div>
            <dt>Visible syllables</dt>
            <dd>{base.syllableRate === null ? '—' : `${base.syllableRate.toFixed(2)} / s`}</dd>
          </div>
          <div>
            <dt>Talk measured</dt>
            <dd>{base.talkSeconds} s</dd>
          </div>
        </dl>
      ) : (
        <p>No baseline was saved. Read every sentence out loud facing the camera, and try again.</p>
      )}
      <p>Your practice receipt is open in its own window.</p>
      <div class="actions">
        <button class="btn" type="button" onClick={again}>
          Rehearse again
        </button>
        <button class="btn primary" type="button" onClick={call}>
          Use in a call
        </button>
      </div>
    </section>
  );
}

render(<App />, document.getElementById('app')!);
