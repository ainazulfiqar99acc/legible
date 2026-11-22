// Hidden sensor window entry. Receives commands from main, runs one Session at a time.

import type { SensorApi } from '../../shared/ipc';
import { Session } from './session';

declare global {
  interface Window {
    legibleSensor: SensorApi;
  }
}

const api = window.legibleSensor;
let session: Session | null = null;

api.onCommand((c) => {
  switch (c.type) {
    case 'start':
      if (session) return;
      session = new Session(c, api);
      void session.start();
      return;
    case 'stop':
      if (!session) {
        api.report({ type: 'stopped', receipt: null, baseline: null, recording: null });
        return;
      }
      void session.stop();
      return;
    case 'settings':
      session?.updateSettings(c.settings);
      return;
    case 'rehearsal-next':
      session?.rehearsalNext();
      return;
    case 'rehearsal-redo':
      session?.rehearsalRedo();
      return;
  }
});

// Closing the window (main destroys it on stop/quit) must release the camera too.
window.addEventListener('beforeunload', () => {
  void session?.stop();
});
