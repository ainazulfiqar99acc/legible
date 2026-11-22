import type { LightState, StripCheckId } from '../../shared/types';
import { CHECK_LABEL } from '../../shared/strings';
import { CHECK_ICON } from './icons';

export const LIGHT_WORD: Record<LightState, string> = {
  listening: 'Listening',
  good: 'Good',
  issue: 'Fix',
  unknown: 'No data',
  untracked: 'Not tracking',
  disabled: 'Off',
};

/** A 48 px square light: pictogram + word, never colour alone. */
export function Light({ id, state }: { id: StripCheckId; state: LightState }) {
  const Icon = CHECK_ICON[id];
  return (
    <div class={`light ${state}`} title={`${CHECK_LABEL[id]}: ${LIGHT_WORD[state]}`}>
      <Icon size={22} />
      <span class="word">{CHECK_LABEL[id]}</span>
      <span class="sr-only">{LIGHT_WORD[state]}</span>
    </div>
  );
}
