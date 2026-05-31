export const semanticColors = {
  accent: "var(--vs-accent)",
  actionPrimary: "var(--vs-action-primary)",
  actionSecondary: "var(--vs-action-secondary-bg)",
  background: "var(--vs-shell)",
  border: "var(--vs-border-subtle)",
  borderStrong: "var(--vs-border-strong)",
  danger: "var(--vs-status-danger)",
  focusRing: "var(--vs-focus-ring)",
  highlightCurrentWord: "var(--vs-highlight-current-word)",
  inspector: "var(--vs-surface-inspector)",
  muted: "var(--vs-text-muted)",
  overlay: "var(--vs-surface-overlay)",
  raised: "var(--vs-surface-primary)",
  selected: "var(--vs-selected)",
  selectedBorder: "var(--vs-selected-border)",
  surface: "var(--vs-surface-secondary)",
  surfaceMuted: "var(--vs-surface-muted)",
  text: "var(--vs-text-primary)",
  textSecondary: "var(--vs-text-secondary)",
  warning: "var(--vs-status-warning)",
  workspace: "var(--vs-workspace)",
} as const;

export const toneClassName = {
  neutral:
    "border-[var(--vs-border-subtle)] bg-[var(--vs-surface-secondary)] text-[var(--vs-text-secondary)]",
  accent:
    "border-[var(--vs-selected-border)] bg-[var(--vs-selected)] text-[var(--vs-selected-text)]",
  success:
    "border-[var(--vs-status-success-border)] bg-[var(--vs-status-success-bg)] text-[var(--vs-status-success)]",
  warning:
    "border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] text-[var(--vs-status-warning)]",
  danger:
    "border-[var(--vs-status-danger-border)] bg-[var(--vs-status-danger-bg)] text-[var(--vs-status-danger)]",
  info: "border-[var(--vs-status-info-border)] bg-[var(--vs-status-info-bg)] text-[var(--vs-status-info)]",
  pinned: "border-[var(--vs-pinned-border)] bg-[var(--vs-pinned)] text-[var(--vs-selected-text)]",
} as const;
