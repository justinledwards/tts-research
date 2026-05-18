/// <reference types="vite/client" />

import type { FrontendPerformanceMetric } from "./performanceMetrics";

declare global {
  var __ttsResearchPerformance:
    | {
        metrics: FrontendPerformanceMetric[];
        spans: Partial<Record<FrontendPerformanceMetric["name"], number>>;
      }
    | undefined;

  interface Window {
    __ttsResearchPerformance?: {
      metrics: FrontendPerformanceMetric[];
      spans: Partial<Record<FrontendPerformanceMetric["name"], number>>;
    };
  }
}
