// Pictograms in the Tabler style: 24 px grid, 2 px stroke, square caps and mitred joins.

import type { CheckId } from '../../shared/types';

interface P {
  size?: number;
  title?: string;
}

function Svg({ size = 24, title, children }: P & { children: preact.ComponentChildren }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="square"
      stroke-linejoin="miter"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/** Face: a head outline turned slightly, with an eye and a mouth line. */
export const FaceIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7 4h9l3 4v6l-3 6H8l-3-6V8z" />
    <path d="M10 10h0.01M15 10h0.01" />
    <path d="M10 16h5" />
  </Svg>
);

/** Light: a sun behind a head = backlight. */
export const LightIcon = (p: P) => (
  <Svg {...p}>
    <path d="M17 3v2M21 7h-2M19.5 4.5l-1.4 1.4" />
    <circle cx="16" cy="9" r="2.5" />
    <path d="M4 21v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2" />
    <circle cx="9" cy="10" r="3" />
  </Svg>
);

/** Distance: two arrows pointing inward. */
export const DistanceIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 12h6M6 9l3 3-3 3" />
    <path d="M21 12h-6M18 9l-3 3 3 3" />
    <path d="M12 6v12" />
  </Svg>
);

/** Pace: a metronome. */
export const PaceIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7 21l3-17h4l3 17z" />
    <path d="M12 16l5-9" />
    <path d="M8 17h8" />
  </Svg>
);

/** Mouth: lips. */
export const MouthIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 12c3-4 6-5 9-3 3-2 6-1 9 3-3 4-6 5-9 5s-6-1-9-5z" />
    <path d="M3 12h18" />
  </Svg>
);

/** Pauses: two bars. */
export const PauseIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8 5v14M16 5v14" />
  </Svg>
);

export const StopIcon = (p: P) => (
  <Svg {...p}>
    <rect x="6" y="6" width="12" height="12" fill="currentColor" />
  </Svg>
);

export const CloseIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const CHECK_ICON: Record<CheckId, (p: P) => preact.JSX.Element> = {
  facing: FaceIcon,
  light: LightIcon,
  distance: DistanceIcon,
  pace: PaceIcon,
  occlusion: MouthIcon,
  phrase: PauseIcon,
};

/** Logo: four yellow viewfinder corners framing a horizontal mouth line. `ink` = on a yellow square (app icon). */
export function Logo({ size = 32, onYellow = false }: { size?: number; onYellow?: boolean }) {
  const corner = onYellow ? '#0B0B0B' : '#FFD000';
  const line = onYellow ? '#0B0B0B' : 'currentColor';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {onYellow && <rect width="32" height="32" fill="#FFD000" />}
      <g fill="none" stroke={corner} stroke-width="3.5" stroke-linecap="square">
        <path d="M4 11V4h7M21 4h7v7M28 21v7h-7M11 28H4v-7" />
      </g>
      <path d="M10 16h12" stroke={line} stroke-width="3" stroke-linecap="square" />
    </svg>
  );
}
