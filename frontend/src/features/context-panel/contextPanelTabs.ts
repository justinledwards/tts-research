export const CONTEXT_PANEL_TAB_IDS = [
  "overview",
  "review",
  "diagnostics",
  "policy",
  "history",
] as const;

export type ContextPanelTabId = (typeof CONTEXT_PANEL_TAB_IDS)[number];

export interface ContextPanelTabMeta {
  advanced?: boolean;
  detail: string;
  emptyState: string;
  id: ContextPanelTabId;
  keywords: string[];
  label: string;
}

export const CONTEXT_PANEL_TAB_META: Record<ContextPanelTabId, ContextPanelTabMeta> = {
  diagnostics: {
    advanced: true,
    detail: "Operator diagnostics for health, timing, skipped content, and generated-audio checks.",
    emptyState:
      "Diagnostics are available when generated audio, extraction health, or timing data exists.",
    id: "diagnostics",
    keywords: ["debug", "health", "timing", "confidence", "skipped"],
    label: "Diagnostics",
  },
  history: {
    detail: "Outline, bookmarks, recent positions, and return context.",
    emptyState: "No outline, bookmark, recent position, or return context is available yet.",
    id: "history",
    keywords: ["outline", "bookmarks", "recent", "wayfinding"],
    label: "History",
  },
  overview: {
    detail: "Current source, passage, provenance, and readiness.",
    emptyState: "No current source or passage context is available yet.",
    id: "overview",
    keywords: ["source", "passage", "provenance", "ready"],
    label: "Overview",
  },
  policy: {
    detail: "Speech policy, voice, source pins, and policy notes.",
    emptyState: "No speech policy or voice-policy context is available yet.",
    id: "policy",
    keywords: ["policy", "voice", "notes", "pins"],
    label: "Policy",
  },
  review: {
    detail: "Review tasks, block status, spoken form, and queues.",
    emptyState: "No review task, narration block, or queue context is available yet.",
    id: "review",
    keywords: ["review", "blocks", "script", "queue"],
    label: "Review",
  },
};

export const CONTEXT_PANEL_PRIMARY_TAB_IDS = ["overview", "review", "policy", "history"] as const;
export const CONTEXT_PANEL_ADVANCED_TAB_IDS = ["diagnostics"] as const;
