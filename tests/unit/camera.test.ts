import { describe, expect, it } from 'vitest';
import { isVirtualCamera, pickDefaultCamera } from '../../shared/camera';

describe('default camera', () => {
  it('picks the real webcam over screen-mirroring and virtual cameras (this build machine)', () => {
    const cams = [
      { deviceId: 'a', label: 'TranScreen Camera' },
      { deviceId: 'b', label: 'HP Wide Vision HD Camera (0408:5482)' },
      { deviceId: 'c', label: 'OBS Virtual Camera' },
    ];
    expect(pickDefaultCamera(cams)?.label).toBe('HP Wide Vision HD Camera (0408:5482)');
  });
  it('flags virtual cameras', () => {
    expect(isVirtualCamera('OBS Virtual Camera')).toBe(true);
    expect(isVirtualCamera('TranScreen Camera')).toBe(true);
    expect(isVirtualCamera('HP Wide Vision HD Camera')).toBe(false);
  });
  it('falls back to a virtual camera only when nothing else exists', () => {
    expect(pickDefaultCamera([{ deviceId: 'c', label: 'OBS Virtual Camera' }])?.deviceId).toBe('c');
    expect(pickDefaultCamera([])).toBeNull();
  });
});
