export const UI_ACTION_SURFACES = [
  "Workspace",
  "BookCinema",
  "DocumentCinema",
  "WebsiteCinema",
  "Teleprompt",
  "Settings",
  "Command Center",
  "Intake",
  "Review",
  "Preview",
  "Preview mini-player",
  "Project Dashboard",
  "Voice Dashboard",
  "Command Palette",
  "Mobile/narrow More sheet",
  "UI Memory",
  "Speech Policy",
] as const;

export type UiActionSurface = (typeof UI_ACTION_SURFACES)[number];

export const UI_ACTION_CLASSES = [
  "navigation",
  "transport",
  "mode",
  "settings",
  "destructive",
  "diagnostic",
  "preview",
  "generation",
  "hidden",
  "disabled",
] as const;

export type UiActionClass = (typeof UI_ACTION_CLASSES)[number];

export const UI_ACTION_EXPECTED_TRANSITIONS = [
  "state-changed",
  "menu-or-panel-opened",
  "route-changed",
  "focus-moved",
  "live-status-updated",
  "disabled-with-reason",
  "intentionally-no-op",
] as const;

export type UiActionExpectedTransition = (typeof UI_ACTION_EXPECTED_TRANSITIONS)[number];

export interface UiActionAuditScope {
  readonly id: string;
  readonly label: string;
  readonly surface: UiActionSurface;
  readonly description: string;
  readonly fixtureKind:
    | "pdf-book"
    | "docx-book"
    | "epub-book"
    | "markdown-document"
    | "website"
    | "workspace"
    | "settings";
}

export const UI_ACTION_AUDIT_SCOPES = [
  {
    id: "book-pdf-pre-audio",
    label: "PDF book source, pre-audio",
    surface: "BookCinema",
    description: "Book source controls before a narration job exists.",
    fixtureKind: "pdf-book",
  },
  {
    id: "book-docx-audio-ready",
    label: "DOCX book source, audio ready",
    surface: "BookCinema",
    description: "Book Cinema controls after a DOCX narration job is ready.",
    fixtureKind: "docx-book",
  },
  {
    id: "book-epub-audio-ready",
    label: "EPUB book source, audio ready",
    surface: "BookCinema",
    description: "Book Cinema controls after an EPUB narration job is ready.",
    fixtureKind: "epub-book",
  },
  {
    id: "document-cinema",
    label: "Markdown document source with citations",
    surface: "DocumentCinema",
    description: "Document Cinema controls for a prepared Markdown source.",
    fixtureKind: "markdown-document",
  },
  {
    id: "website-cinema",
    label: "Website source",
    surface: "WebsiteCinema",
    description: "Website Cinema controls for a local website fixture.",
    fixtureKind: "website",
  },
  {
    id: "pinned-inspector",
    label: "Pinned inspector",
    surface: "BookCinema",
    description: "Cinema read mode with inspector pinned open.",
    fixtureKind: "epub-book",
  },
  {
    id: "settings-open",
    label: "Settings open",
    surface: "Settings",
    description: "Studio settings drawer and settings tabs.",
    fixtureKind: "settings",
  },
  {
    id: "workspace-intake",
    label: "Workspace Intake",
    surface: "Intake",
    description: "Workspace intake stage controls.",
    fixtureKind: "workspace",
  },
  {
    id: "workspace-review",
    label: "Workspace Review",
    surface: "Review",
    description: "Workspace review stage controls.",
    fixtureKind: "workspace",
  },
  {
    id: "workspace-preview",
    label: "Workspace Preview",
    surface: "Preview",
    description: "Workspace preview stage controls.",
    fixtureKind: "workspace",
  },
  {
    id: "workspace-teleprompt",
    label: "Workspace Teleprompt",
    surface: "Teleprompt",
    description: "Teleprompt stage controls from workspace review.",
    fixtureKind: "workspace",
  },
] as const satisfies readonly UiActionAuditScope[];

export function isUiActionSurface(value: string): value is UiActionSurface {
  return UI_ACTION_SURFACES.includes(value as UiActionSurface);
}

export function isUiActionClass(value: string): value is UiActionClass {
  return UI_ACTION_CLASSES.includes(value as UiActionClass);
}
