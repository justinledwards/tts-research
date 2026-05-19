/// <reference types="vite/client" />

import type { FrontendPerformanceStore } from "./features/performance";

declare global {
  var __ttsResearchPerformance: FrontendPerformanceStore | undefined;

  interface Window {
    __ttsResearchPerformance?: FrontendPerformanceStore;
  }
}
