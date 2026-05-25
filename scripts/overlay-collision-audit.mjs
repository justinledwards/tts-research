const OVERLAY_SELECTOR =
  "[data-overlay-owner], [data-cinema-mobile-sheet], [data-cinema-transport-footer]";

const CONTROL_SELECTOR = [
  "button",
  "[role='button']",
  "[role='tab']",
  "a[href]",
  "input",
  "select",
  "textarea",
  "[data-ui-action-surface]",
  "[data-playback-primary='true']",
].join(", ");

const MODAL_OVERLAY_OWNERS = new Set(["command-palette", "settings-drawer"]);

export async function collectOverlayCollisionReport(page, options = {}) {
  const minOverlapArea = Number.isFinite(options.minOverlapArea) ? options.minOverlapArea : 64;
  const minTargetOverlapRatio = Number.isFinite(options.minTargetOverlapRatio)
    ? options.minTargetOverlapRatio
    : 0.08;
  return page.evaluate(
    ({
      controlSelector,
      minOverlapArea: pageMinOverlapArea,
      minTargetOverlapRatio: pageRatio,
      modalOverlayOwners,
      overlaySelector,
    }) => {
      const modalOwners = new Set(modalOverlayOwners);
      const intersectRects = (left, right) => {
        const next = {
          bottom: Math.min(left.bottom, right.bottom),
          left: Math.max(left.left, right.left),
          right: Math.min(left.right, right.right),
          top: Math.max(left.top, right.top),
        };
        return next.right > next.left && next.bottom > next.top ? next : null;
      };
      const visibleRectFor = (element) => {
        const rawRect = element.getBoundingClientRect();
        if (rawRect.width <= 0 || rawRect.height <= 0) {
          return null;
        }
        let clipped = intersectRects(rawRect, {
          bottom: window.innerHeight,
          left: 0,
          right: window.innerWidth,
          top: 0,
        });
        if (!clipped) {
          return null;
        }
        let current = element.parentElement;
        while (current instanceof HTMLElement) {
          const style = window.getComputedStyle(current);
          const clipsOverflow = /auto|clip|hidden|scroll/.test(
            `${style.overflow} ${style.overflowX} ${style.overflowY}`,
          );
          if (clipsOverflow) {
            clipped = intersectRects(clipped, current.getBoundingClientRect());
            if (!clipped) {
              return null;
            }
          }
          current = current.parentElement;
        }
        return {
          ...clipped,
          height: clipped.bottom - clipped.top,
          width: clipped.right - clipped.left,
          x: clipped.left,
          y: clipped.top,
        };
      };
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }
        if (
          typeof element.checkVisibility === "function" &&
          !element.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })
        ) {
          return false;
        }
        if (!visibleRectFor(element)) {
          return false;
        }
        let current = element;
        while (current instanceof HTMLElement) {
          const style = window.getComputedStyle(current);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            current.getAttribute("aria-hidden") === "true"
          ) {
            return false;
          }
          current = current.parentElement;
        }
        return true;
      };
      const rectFor = (element) => {
        const rect = visibleRectFor(element) ?? element.getBoundingClientRect();
        return {
          bottom: Math.round(rect.bottom),
          height: Math.round(rect.height),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
        };
      };
      const overlapArea = (left, right) => {
        const x = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
        const y = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
        return x * y;
      };
      const inferOverlayOwner = (element) => {
        const explicitOwner = element.dataset.overlayOwner;
        if (explicitOwner) {
          return explicitOwner;
        }
        if (element.hasAttribute("data-cinema-mobile-sheet")) {
          return "bottom-sheet";
        }
        if (element.hasAttribute("data-cinema-transport-footer")) {
          return "cinema-transport";
        }
        const label = element.getAttribute("aria-label") ?? "";
        if (/command palette/i.test(label)) {
          return "command-palette";
        }
        if (/settings/i.test(label)) {
          return "settings-drawer";
        }
        return "unknown-overlay";
      };
      const inferOverlayZone = (element, owner) => {
        if (element.dataset.overlayZone) {
          return element.dataset.overlayZone;
        }
        if (owner === "bottom-sheet") {
          return "mobile-bottom-sheet";
        }
        if (owner === "cinema-transport") {
          return "bottom-activity-footer";
        }
        return owner;
      };
      const labelFor = (element) =>
        (
          element.getAttribute("aria-label") ??
          element.getAttribute("title") ??
          element.textContent ??
          ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 100);
      const isProtectedTarget = (element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }
        const testId = element.dataset.testid ?? "";
        const actionClass = element.dataset.actionClass ?? "";
        const role = element.getAttribute("role") ?? "";
        if (element.dataset.playbackPrimary === "true") {
          return true;
        }
        if (actionClass === "generation" || actionClass === "preview") {
          return true;
        }
        if (
          /workspace-stage-action|revision-|preview-mini-play|preview-mini-open-cinema/i.test(
            testId,
          )
        ) {
          return true;
        }
        if (role === "tab" && element.getAttribute("aria-selected") === "true") {
          return true;
        }
        if (element.closest("[data-cinema-transport-footer]")) {
          return true;
        }
        if (element.closest("[data-testid='revision-panel']")) {
          return true;
        }
        return false;
      };
      const visibleDialogs = [
        ...document.querySelectorAll("[role='dialog'][aria-modal='true']"),
      ].filter(visible);
      const activeDialog = visibleDialogs[visibleDialogs.length - 1] ?? null;
      const rawOverlays = [...document.querySelectorAll(overlaySelector)]
        .filter(
          (element) => !activeDialog || element === activeDialog || activeDialog.contains(element),
        )
        .filter((element) => !element.hasAttribute("data-cinema-surface"))
        .filter(visible);
      const overlays = rawOverlays.filter((element) => {
        const ancestor = element.parentElement?.closest(overlaySelector);
        return !ancestor || !visible(ancestor);
      });
      const overlayModels = overlays.map((element, index) => {
        const owner = inferOverlayOwner(element);
        return {
          element,
          id: element.id || element.dataset.testid || `${owner}-${String(index + 1)}`,
          owner,
          rect: rectFor(element),
          zone: inferOverlayZone(element, owner),
        };
      });
      const activeRoot = visibleDialogs[visibleDialogs.length - 1] ?? document;
      const activeRootTargets = [
        ...(activeRoot instanceof Element && activeRoot.matches(controlSelector)
          ? [activeRoot]
          : []),
        ...activeRoot.querySelectorAll(controlSelector),
      ];
      const protectedTargets = activeRootTargets
        .filter(visible)
        .filter(isProtectedTarget)
        .map((element, index) => ({
          element,
          id: element.id || element.dataset.testid || `protected-target-${String(index + 1)}`,
          label: labelFor(element),
          rect: rectFor(element),
          role: element.getAttribute("role") || element.tagName.toLowerCase(),
          testId: element.dataset.testid ?? null,
        }));
      const findings = [];
      for (const overlay of overlayModels) {
        if (modalOwners.has(overlay.owner)) {
          continue;
        }
        for (const target of protectedTargets) {
          if (overlay.element.contains(target.element)) {
            continue;
          }
          if (target.element.closest(overlaySelector) === overlay.element) {
            continue;
          }
          const area = overlapArea(overlay.rect, target.rect);
          const targetArea = Math.max(1, target.rect.width * target.rect.height);
          const targetOverlapRatio = area / targetArea;
          if (area >= pageMinOverlapArea && targetOverlapRatio >= pageRatio) {
            findings.push({
              kind: "overlay-collision",
              overlayId: overlay.id,
              overlayOwner: overlay.owner,
              overlayRect: overlay.rect,
              overlayZone: overlay.zone,
              severity: "error",
              targetId: target.id,
              targetLabel: target.label,
              targetRect: target.rect,
              targetRole: target.role,
              targetTestId: target.testId,
              overlapArea: Math.round(area),
              targetOverlapRatio: Number(targetOverlapRatio.toFixed(3)),
            });
          }
        }
      }
      return {
        findings,
        overlays: overlayModels.map((overlay) => ({
          id: overlay.id,
          owner: overlay.owner,
          rect: overlay.rect,
          zone: overlay.zone,
        })),
        protectedTargets: protectedTargets.map((target) => ({
          id: target.id,
          label: target.label,
          rect: target.rect,
          role: target.role,
          testId: target.testId,
        })),
        schemaVersion: "overlay-collision.v1",
        summary: {
          failures: findings.length,
          overlays: overlayModels.length,
          protectedTargets: protectedTargets.length,
        },
      };
    },
    {
      controlSelector: CONTROL_SELECTOR,
      minOverlapArea,
      minTargetOverlapRatio,
      modalOverlayOwners: [...MODAL_OVERLAY_OWNERS],
      overlaySelector: OVERLAY_SELECTOR,
    },
  );
}

export function overlayCollisionOverlapArea(left, right) {
  const x = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const y = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  return x * y;
}

export function summarizeOverlayCollisionReports(reports) {
  const findings = reports.flatMap((report) => report?.findings ?? []);
  return {
    failures: findings.length,
    overlays: reports.reduce((total, report) => total + (report?.summary?.overlays ?? 0), 0),
    protectedTargets: reports.reduce(
      (total, report) => total + (report?.summary?.protectedTargets ?? 0),
      0,
    ),
    reports: reports.length,
  };
}

export function renderOverlayCollisionReport({ generatedAt = new Date().toISOString(), reports }) {
  const summary = summarizeOverlayCollisionReports(reports);
  const lines = [
    "# Overlay collision report",
    "",
    `Generated: ${generatedAt}`,
    "",
    "## Summary",
    "",
    `- Reports: ${String(summary.reports)}`,
    `- Overlay surfaces: ${String(summary.overlays)}`,
    `- Protected controls: ${String(summary.protectedTargets)}`,
    `- Collision failures: ${String(summary.failures)}`,
    "",
  ];
  if (summary.failures === 0) {
    lines.push("No overlay collisions detected.", "");
    return `${lines.join("\n")}\n`;
  }
  lines.push("## Findings", "");
  for (const report of reports) {
    const findings = report?.findings ?? [];
    for (const finding of findings) {
      lines.push(
        `- ${finding.overlayOwner} (${finding.overlayZone}) overlaps ${finding.targetLabel || finding.targetId} by ${String(
          finding.overlapArea,
        )}px² (${String(Math.round(finding.targetOverlapRatio * 100))}% of target).`,
      );
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}
