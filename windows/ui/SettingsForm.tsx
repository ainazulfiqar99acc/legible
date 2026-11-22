import type { CheckId, Sensitivity, Settings, StripPosition } from '../../shared/types';
import { CHECK_LABEL } from '../../shared/strings';

const CHECK_NOTES: Record<CheckId, string> = {
  facing: 'Head turned away while you talk',
  light: 'Backlit or too dark',
  distance: 'Lips too small to read',
  pace: 'Experimental: faster than your rehearsal (lip movement; unreliable on real faces so far)',
  occlusion: 'Experimental: hand over mouth',
  phrase: 'Uses the SDK breathing trace: long runs without a pause',
};

export function SettingsForm({ settings, onChange }: { settings: Settings; onChange: (p: Partial<Settings>) => void }) {
  const setCheck = (id: CheckId, on: boolean) => onChange({ checks: { ...settings.checks, [id]: on } });
  return (
    <div class="settings">
      <div class="label">Checks</div>
      {(Object.keys(CHECK_NOTES) as CheckId[]).map((id) => (
        <label class="toggle" key={id}>
          <input type="checkbox" checked={settings.checks[id]} onChange={(e) => setCheck(id, (e.target as HTMLInputElement).checked)} />
          <span>
            <strong>{CHECK_LABEL[id]}</strong> — {CHECK_NOTES[id]}
          </span>
        </label>
      ))}

      <div class="label" style={{ marginTop: '14px', marginBottom: '6px' }}>
        Sensitivity
      </div>
      <div class="seg" role="group" aria-label="Sensitivity">
        {(['low', 'normal', 'high'] as Sensitivity[]).map((v) => (
          <button key={v} type="button" aria-pressed={settings.sensitivity === v} onClick={() => onChange({ sensitivity: v })}>
            {v[0]!.toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      <div class="field" style={{ marginTop: '14px' }}>
        <label class="label" for="strip-pos">
          Strip position
        </label>
        <select
          id="strip-pos"
          value={settings.stripPosition}
          onChange={(e) => onChange({ stripPosition: (e.target as HTMLSelectElement).value as StripPosition })}
        >
          <option value="top-center">Top centre (under a laptop webcam)</option>
          <option value="top-left">Top left</option>
          <option value="top-right">Top right</option>
          <option value="free">Where I dragged it</option>
        </select>
      </div>

      <label class="toggle">
        <input type="checkbox" checked={settings.tickSound} onChange={(e) => onChange({ tickSound: (e.target as HTMLInputElement).checked })} />
        <span>Soft tick with each nudge (off by default)</span>
      </label>
      <label class="toggle">
        <input
          type="checkbox"
          checked={settings.recordNumbers}
          onChange={(e) => onChange({ recordNumbers: (e.target as HTMLInputElement).checked })}
        />
        <span>Save a numbers-only recording of each session (for replay and tuning)</span>
      </label>
    </div>
  );
}
