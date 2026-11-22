// Frame probe: twice a second, draw the camera frame into a 160x90 OffscreenCanvas, compute face vs background
// luminance, and discard the pixels. Nothing is stored; the canvas is overwritten on the next sample.

import type { FaceSample, SensorEvent } from '../../shared/types';
import { PROBE_H, PROBE_INTERVAL_MS, PROBE_W } from '../../rules/thresholds';
import { measureBrightness, rgbaToLuma } from './features/brightness';
import { probeBoxes } from './decode';

export class FrameProbe {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly canvas = new OffscreenCanvas(PROBE_W, PROBE_H);
  private readonly ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  private readonly luma = new Uint8Array(PROBE_W * PROBE_H);

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly latestFace: () => FaceSample | null,
    private readonly now: () => number,
    private readonly emit: (e: SensorEvent) => void,
  ) {}

  start(): void {
    this.timer = setInterval(() => this.sample(), PROBE_INTERVAL_MS);
  }

  private sample(): void {
    const face = this.latestFace();
    const t = this.now();
    if (!face || t - face.t > 500 || this.video.readyState < 2) return;
    this.ctx.drawImage(this.video, 0, 0, PROBE_W, PROBE_H);
    const img = this.ctx.getImageData(0, 0, PROBE_W, PROBE_H);
    rgbaToLuma(img.data, this.luma);
    img.data.fill(0); // discard pixels now
    const boxes = probeBoxes(face, PROBE_W, PROBE_H);
    const r = measureBrightness(this.luma, PROBE_W, PROBE_H, boxes.face, boxes.mouth);
    this.luma.fill(0);
    if (r) this.emit({ kind: 'brightness', t, faceLum: r.faceLum, ringLum: r.ringLum, mouthLum: r.mouthLum });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.ctx.clearRect(0, 0, PROBE_W, PROBE_H);
  }
}
