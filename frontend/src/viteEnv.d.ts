/// <reference types="vite/client" />

import type { FrontendPerformanceStore } from "./features/performance";

declare global {
  var __ttsResearchPerformance: FrontendPerformanceStore | undefined;

  interface ImportMetaEnv {
    readonly VITE_FEATURE_TEMPORARY_SOURCES_QUICK_LISTEN?: string;
  }

  interface Window {
    __ttsResearchPerformance?: FrontendPerformanceStore;
  }
}
