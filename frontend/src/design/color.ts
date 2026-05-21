export const semanticColors = {
  accent: "var(--vs-accent)",
  background: "var(--vs-bg)",
  border: "var(--vs-border)",
  danger: "var(--vs-danger)",
  focusRing: "var(--vs-focus-ring)",
  muted: "var(--vs-muted)",
  raised: "var(--vs-raised)",
  selected: "var(--vs-selected)",
  selectedBorder: "var(--vs-selected-border)",
  surface: "var(--vs-surface)",
  text: "var(--vs-text)",
} as const;

export const toneClassName = {
  neutral: "border-[var(--vs-border)] bg-[var(--vs-surface)] text-[var(--vs-text)]",
  accent: "border-[var(--vs-selected-border)] bg-[var(--vs-selected)] text-orange-700",
  success: "border-[var(--vs-success-border)] bg-[var(--vs-success-soft)] text-[var(--vs-success)]",
  warning: "border-[var(--vs-warning-border)] bg-[var(--vs-warning-soft)] text-[var(--vs-warning)]",
  danger: "border-[var(--vs-danger-border)] bg-[var(--vs-danger-soft)] text-[var(--vs-danger)]",
  info: "border-blue-300 bg-blue-500/10 text-blue-700",
  pinned: "border-[var(--vs-pinned-border)] bg-[var(--vs-pinned)] text-orange-700",
} as const;
