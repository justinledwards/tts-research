export function slugUiActionPart(value) {
  const normalized = String(value ?? "")
    .replaceAll("&", " and ")
    .replaceAll("+", " plus ")
    .replaceAll(/(^|[\s(])-/g, "$1 minus ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
  return normalized || "control";
}

export function uiActionSurfaceId(surface) {
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
}) {
  const parts = [
    "ui-action",
    surfaceId,
    stageId ? `stage-${stageId}` : null,
    sourceId ? `source-${sourceId}` : null,
    projectId ? `project-${projectId}` : null,
    ownerId ? `owner-${ownerId}` : null,
    contextId,
    actionSlug,
  ];
  return parts.filter(Boolean).map(slugUiActionPart).join("-");
}

export function stableActionIdContext(rawAction, { label }) {
  const surfaceId = slugUiActionPart(rawAction.surfaceId ?? rawAction.surface ?? "surface");
  const actionSlug = slugUiActionPart(rawAction.actionSlug ?? label ?? rawAction.label);
  const sourceId = optionalSlug(
    rawAction.sourceId ?? rawAction.bookSourceId ?? rawAction.preparedSourceId,
  );
  const projectId = optionalSlug(rawAction.projectId);
  const stageId = optionalSlug(
    rawAction.stageId ??
      rawAction.workspaceStageId ??
      (String(rawAction.scenarioId ?? "").startsWith("workspace-") ? rawAction.scenarioId : null),
  );
  const ownerId = optionalSlug(rawAction.owner ?? rawAction.playbackOwner);
  const contextId = optionalSlug(
    rawAction.commandId ??
      rawAction.playbackAction ??
      rawAction.railModeIdentity ??
      rawAction.compactControlId ??
      rawAction.segmentedIdentity ??
      rawAction.operatorScope ??
      rawAction.advancedModeId ??
      rawAction.role ??
      rawAction.tagName,
  );
  return {
    actionSlug,
    contextId,
    ownerId,
    projectId,
    sourceId,
    stageId,
    surfaceId,
  };
}

function optionalSlug(value) {
  const normalized = String(value ?? "").trim();
  return normalized ? slugUiActionPart(normalized) : null;
}

export function generatedUiActionId(rawAction, { label, matchIndex, stable }) {
  const context = stableActionIdContext(rawAction, { label });
  const baseId = buildUiActionId(context);
  if (stable) {
    return { context, id: baseId };
  }
  return {
    context,
    id: `${baseId}-instance-${String(matchIndex + 1)}`,
  };
}
