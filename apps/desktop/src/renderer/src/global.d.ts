import type { ReporterBridge } from '../../preload/index.js';

declare global {
  interface Window {
    reporter: ReporterBridge;
  }
}

export {};
