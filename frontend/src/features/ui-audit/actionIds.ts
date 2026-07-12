export interface UiActionIdParts {
  readonly actionSlug: string;
  readonly contextId?: string | null;
  readonly ownerId?: string | null;
  readonly projectId?: string | null;
  readonly sourceId?: string | null;
  readonly stageId?: string | null;
  readonly surfaceId: string;
}

export function slugUiActionPart(value: string | null | undefined): string {
  const slug = (value ?? "")
    .replaceAll("&", " and ")
    .replaceAll("+", " plus ")
    .replaceAll(/(^|[\s(])-/g, "$1 minus ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
  return slug || "control";
}

export function uiActionSurfaceId(surface: string): string {
  return slugUiActionPart(surface || "surface");
}

export function buildUiActionId({
  actionSlug,
  contextId,
  ownerId,
  projectId,
  sourceId,
  stageId,
  surfaceId,
}: UiActionIdParts): string {
  return [
    "ui-action",
    surfaceId,
    stageId ? `stage-${stageId}` : null,
    sourceId ? `source-${sourceId}` : null,
    projectId ? `project-${projectId}` : null,
    ownerId ? `owner-${ownerId}` : null,
    contextId,
    actionSlug,
  ]
    .filter(Boolean)
    .map((part) => slugUiActionPart(part))
    .join("-");
}
