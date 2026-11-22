// Choosing a camera. Virtual and screen-mirroring cameras are listed but never picked by default:
// Legible must look at the user's face through a real webcam (or OBS, when the user chooses it).

export interface CameraLike {
  deviceId: string;
  label: string;
}

/** Virtual cameras and phone/screen-mirroring sources. */
export const VIRTUAL_CAMERA = /obs|virtual|snap camera|droidcam|camo|xsplit|mmhmm|transcreen|screen|ndi|manycam|iriun/i;
/** Likely the built-in or USB webcam. */
const PHYSICAL_HINT = /wide vision|hd camera|webcam|integrated|facetime|built-in|usb video|c9\d\d|brio|logitech|lifecam/i;

export const isVirtualCamera = (label: string): boolean => VIRTUAL_CAMERA.test(label);

export function pickDefaultCamera<T extends CameraLike>(cams: T[]): T | null {
  const real = cams.filter((c) => !isVirtualCamera(c.label));
  return real.find((c) => PHYSICAL_HINT.test(c.label)) ?? real[0] ?? cams[0] ?? null;
}
