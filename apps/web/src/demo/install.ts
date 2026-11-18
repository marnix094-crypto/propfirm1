import { setRealtime } from '@/lib/realtime';
import { installDemoBackend } from './backend';
import { DemoRealtime } from './realtime';

/** Demo preview: in-browser backend + simulated realtime. Only loaded when VITE_DEMO_MODE=true. */
export function installDemo() {
  installDemoBackend();
  setRealtime(new DemoRealtime());
}
