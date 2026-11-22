// All user-facing words in one place. Short, plain, about the speaker's own visibility only.

import type { AppError, CheckId, StripCheckId } from './types';

export const CHECK_LABEL: Record<CheckId, string> = {
  facing: 'Face',
  light: 'Light',
  distance: 'Distance',
  pace: 'Pace',
  occlusion: 'Mouth',
  phrase: 'Pauses',
};

export const NUDGE = {
  facing: 'Face the camera while you talk',
  backlit: 'Light is behind you',
  dark: 'Your face is too dark',
  bright: 'Too much light on your face',
  distance: 'Move a little closer',
  pace: 'Slow down a little',
  occlusion: 'Keep your mouth visible',
  phrase: 'Pause between sentences',
  exaggeration: 'Speak naturally',
} as const;

export const LINE = {
  off: 'Camera off',
  starting: 'Starting…',
  listening: 'Listening',
  readable: 'Readable',
  stopping: 'Stopping…',
  noFace: 'Not tracking — face not found',
  multipleFaces: 'Not tracking — more than one face',
  lost: 'Not tracking',
  replay: 'REPLAY',
} as const;

/** One tip for the receipt, keyed by top issue. Based on RNID / City Lit deaf-awareness guidance. */
export const TIP: Record<CheckId | 'none', string> = {
  facing: 'Put the call window on the screen with the camera, so looking at people means facing them.',
  light: 'Face a window or lamp instead of sitting with it behind you; light from the front makes lips readable.',
  distance: 'Sit so your head and shoulders fill the frame; lips need to be large enough to read.',
  pace: 'Leave a short gap between sentences. Normal or slightly slower speech is easier to lip-read than fast speech.',
  occlusion: 'Keep hands, mugs and microphones away from your mouth while you talk.',
  phrase: 'Pause and breathe between sentences; it gives a lip-reader time to catch up.',
  none: 'Nice work. Keep the same set-up for your next call.',
};

export const STRIP_ORDER: StripCheckId[] = ['facing', 'light', 'distance', 'phrase'];

export const WHY_POINTS: { title: string; body: string; source: string; url: string }[] = [
  {
    title: 'Face the person',
    body: 'Lip-readers need to see your whole face. Turning to a second screen while you talk hides your lips.',
    source: 'RNID — communication tips',
    url: 'https://rnid.org.uk/information-and-support/hearing-loss/communication-tips/',
  },
  {
    title: 'Keep your face lit',
    body: 'Light from the front, not behind you. A window behind you turns your face into a silhouette.',
    source: 'RNID — deaf-aware meetings',
    url: 'https://rnid.org.uk/information-and-support/deaf-awareness/make-your-meetings-deaf-aware',
  },
  {
    title: 'Speak clearly, not fast',
    body: 'A normal or slightly slower pace, without exaggerating, and nothing covering your mouth.',
    source: 'City Lit — talking to people with hearing loss',
    url: 'https://www.citylit.ac.uk/blog/talking-to-people-with-hearing-loss',
  },
];

export const REHEARSAL_SENTENCES: string[] = [
  'The meeting will start at ten past nine.',
  'Please send me the figures before lunch.',
  'We moved the launch to the second week of May.',
  'Could you share your screen for a moment?',
  'I think the blue design works better on phones.',
  'Let us take five minutes and come back to this.',
  'The train was late, so I will join from home.',
  'Thank you, that was really helpful.',
];

const ERR: Record<string, Omit<AppError, 'code' | 'retryable'>> = {
  kAuthenticationFailed: {
    title: 'Key not accepted',
    detail: 'SmartSpectra did not accept the API key.',
    action: 'Check your key in Setup',
    actionId: 'setup',
  },
  kCreditExhausted: {
    title: 'No SmartSpectra credits left',
    detail: 'This API key has used its credits. Rehearsal and live sessions need credits; replay mode does not.',
    action: 'Open Setup',
    actionId: 'setup',
  },
  kNetworkError: {
    title: 'Cannot reach Presage',
    detail: 'SmartSpectra runs on your computer but checks its licence online. Check your internet connection.',
    action: 'Try again',
    actionId: 'retry',
  },
  kServerError: {
    title: 'Presage server problem',
    detail: 'The licence server returned an error. Wait a moment and try again.',
    action: 'Try again',
    actionId: 'retry',
  },
  kInputUnavailable: {
    title: 'Camera is busy',
    detail: 'Another app is using the camera. On Windows most webcams work with one app at a time — use OBS Virtual Camera to share it with your call app.',
    action: 'Open the OBS guide',
    actionId: 'obs-guide',
  },
  kSustainedLowFrameRate: {
    title: 'Camera too slow',
    detail: 'The frame rate stayed too low to track your face reliably. Close other heavy apps or pick another camera.',
    action: 'Try again',
    actionId: 'retry',
  },
  kMetricNotAuthorized: {
    title: 'Signal not available on this key',
    detail: 'Your key is not authorised for face landmarks or talking detection.',
    action: 'Check your key in Setup',
    actionId: 'setup',
  },
  kConfigurationFailed: {
    title: 'SDK could not start',
    detail: 'SmartSpectra rejected the configuration.',
    action: 'Try again',
    actionId: 'retry',
  },
  kProcessingFailed: {
    title: 'Tracking stopped',
    detail: 'SmartSpectra stopped processing frames.',
    action: 'Try again',
    actionId: 'retry',
  },
  NotAllowedError: {
    title: 'Camera permission denied',
    detail: 'The operating system blocked camera access for Legible. Allow it in your privacy settings.',
    action: 'Open Setup',
    actionId: 'setup',
  },
  NotReadableError: {
    title: 'Camera is busy',
    detail: 'Another app is holding the camera. Close it, or use OBS Virtual Camera so both apps can read it.',
    action: 'Open the OBS guide',
    actionId: 'obs-guide',
  },
  NotFoundError: {
    title: 'Camera not found',
    detail: 'The chosen camera is not connected. Pick another one in Setup.',
    action: 'Open Setup',
    actionId: 'setup',
  },
  OverconstrainedError: {
    title: 'Camera not found',
    detail: 'The chosen camera is not available. Pick another one in Setup.',
    action: 'Open Setup',
    actionId: 'setup',
  },
  noKey: {
    title: 'No API key yet',
    detail: 'Add your SmartSpectra API key in Setup. Replay mode works without one.',
    action: 'Open Setup',
    actionId: 'setup',
  },
  readiness: {
    title: 'This computer may struggle',
    detail: 'The SDK readiness check did not return "ready".',
    action: 'Try again',
    actionId: 'retry',
  },
};

export function describeError(code: string, message: string, retryable: boolean): AppError {
  const known = ERR[code];
  if (known) return { code, retryable, ...known, detail: known.detail };
  return {
    code,
    retryable,
    title: 'Something went wrong',
    detail: message || 'Legible stopped unexpectedly.',
    action: retryable ? 'Try again' : 'Open Setup',
    actionId: retryable ? 'retry' : 'setup',
  };
}
