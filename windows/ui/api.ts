import { useEffect, useState } from 'preact/hooks';
import type { LegibleApi } from '../../shared/ipc';
import type { LegibleState } from '../../shared/types';
import { offState } from '../../shared/state';

declare global {
  interface Window {
    legible: LegibleApi;
  }
}

export const api = (): LegibleApi => window.legible;

/** Live LegibleState from the sensor via main. */
export function useLegibleState(): LegibleState {
  const [s, set] = useState<LegibleState>(offState());
  useEffect(() => {
    void api()
      .invoke('getState')
      .then((v) => v && set(v));
    return api().onState(set);
  }, []);
  return s;
}

export function useNavigate(initial: string, onChange?: (to: string) => void): [string, (to: string) => void] {
  const [to, set] = useState(initial);
  useEffect(() => api().onNavigate((v) => (onChange ? onChange(v) : set(v))), [onChange]);
  return [to, set];
}

export const fmtDuration = (s: number): string => {
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};
