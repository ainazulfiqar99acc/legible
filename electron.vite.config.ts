import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import preact from '@preact/preset-vite';

const r = (p: string) => resolve(import.meta.dirname, p);

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: { input: { index: r('app/main/index.ts') } },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { sensor: r('app/preload/sensor.ts'), ui: r('app/preload/ui.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: r('.'),
    publicDir: false,
    plugins: [preact()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          sensor: r('windows/sensor/index.html'),
          strip: r('windows/strip/index.html'),
          panel: r('windows/panel/index.html'),
          receipt: r('windows/receipt/index.html'),
          setup: r('windows/setup/index.html'),
        },
      },
    },
  },
});
