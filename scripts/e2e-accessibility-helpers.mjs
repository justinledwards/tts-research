export async function scanPageAccessibility(page, minimumInteractiveSize) {
  return page.evaluate((minimumInteractiveSize) => {
    const visible = (element) =>
      element instanceof HTMLElement &&
      element.getAttribute("aria-hidden") !== "true" &&
      !element.closest("[aria-hidden='true']") &&
      element.offsetParent !== null &&
      element.getClientRects().length > 0;
    const normalize = (value) =>
      String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
    const labelledByText = (element) =>
      normalize(
        element
          .getAttribute("aria-labelledby")
          ?.split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" "),
      );
    const labelsText = (element) => {
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) {
        return normalize(Array.from(element.labels ?? [], (label) => label.textContent).join(" "));
      }
      return "";
    };
    const accessibleName = (element) =>
      normalize(
        element.getAttribute("aria-label") ||
          labelledByText(element) ||
          labelsText(element) ||
          element.textContent ||
          element.getAttribute("title") ||
          element.getAttribute("placeholder"),
      );
    const roleFor = (element) => {
      const explicit = element.getAttribute("role");
      if (explicit) {
        return explicit;
      }
      const tagName = element.tagName.toLowerCase();
      if (tagName === "button") {
        return "button";
      }
      if (tagName === "select") {
        return "combobox";
      }
      if (tagName === "a" && element.hasAttribute("href")) {
        return "link";
      }
      if (element instanceof HTMLInputElement) {
        if (element.type === "checkbox") {
          return "checkbox";
        }
        if (element.type === "radio") {
          return "radio";
        }
        return "textbox";
      }
      if (element instanceof HTMLTextAreaElement) {
        return "textbox";
      }
      return null;
    };
    const disabledReason = (element) =>
      normalize(
        element.getAttribute("data-disabled-reason") ||
          element.getAttribute("data-ui-disabled-reason") ||
          element.getAttribute("title") ||
          "",
      );
    const surfaceFor = (element) =>
      normalize(
        element.getAttribute("data-ui-action-surface") ||
          element.closest("[data-ui-action-surface]")?.getAttribute("data-ui-action-surface") ||
          element.closest("[data-rail-mode-toolbar]")?.getAttribute("data-rail-mode-toolbar") ||
          element.closest("[data-overlay-zone]")?.getAttribute("data-overlay-zone") ||
          element.closest("[data-overlay-owner]")?.getAttribute("data-overlay-owner") ||
          "",
      );
    const declaredHitTargetMin = (element) => {
      const rawValue = Number.parseFloat(element.getAttribute("data-hit-target-min") ?? "");
      const classValue = element.classList.contains("vs-compact-hit-target")
        ? minimumInteractiveSize
        : 0;
      return Math.max(Number.isFinite(rawValue) ? rawValue : 0, classValue);
    };
    const selector = [
      "button",
      "a[href]",
      "input",
      "select",
      "textarea",
      "[role='button']",
      "[role='switch']",
      "[role='tab']",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const controls = Array.from(document.querySelectorAll(selector))
      .filter(visible)
      .map((element, index) => {
        const rect = element.getBoundingClientRect();
        const disabled =
          element.disabled === true || element.getAttribute("aria-disabled") === "true";
        const stableTestId = element.getAttribute("data-testid") || null;
        const hitTargetMin = declaredHitTargetMin(element);
        const hitAreaHeight = Math.max(rect.height, hitTargetMin);
        const hitAreaWidth = Math.max(rect.width, hitTargetMin);
        return {
          accessibleName: accessibleName(element),
          disabled,
          disabledReason: disabled ? disabledReason(element) : "",
          height: rect.height,
          hitAreaHeight,
          hitAreaWidth,
          id: stableTestId || element.id || `${element.tagName.toLowerCase()}-${String(index)}`,
          role: roleFor(element),
          stableTestId,
          surface: surfaceFor(element) || null,
          visualHeight: rect.height,
          visualWidth: rect.width,
          visibleLabel: normalize(element.textContent || labelsText(element)),
          width: rect.width,
        };
      });
    const compactRailControlAffordanceFailures = () =>
      Array.from(document.querySelectorAll("[data-compact-control='rail-toggle']")).flatMap(
        (element) => {
          if (!(element instanceof HTMLElement) || !visible(element)) {
            return [];
          }
          const visibleLabel = normalize(element.textContent);
          const failures = [];
          const controlId =
            element.getAttribute("data-testid") ||
            element.getAttribute("data-compact-control-id") ||
            "compact-rail-control";
          if (visibleLabel.length <= 1) {
            failures.push({
              controlId,
              detail: "Collapsed rail control uses a one-letter visible label.",
              ruleId: "compact-rail-label",
              severity: "fail",
            });
          }
          if (!normalize(element.getAttribute("aria-label"))) {
            failures.push({
              controlId,
              detail: "Collapsed rail control has no aria-label.",
              ruleId: "compact-rail-aria",
              severity: "fail",
            });
          }
          if (!normalize(element.getAttribute("title"))) {
            failures.push({
              controlId,
              detail: "Collapsed rail control has no tooltip/title.",
              ruleId: "compact-rail-tooltip",
              severity: "fail",
            });
          }
          if (!normalize(element.getAttribute("data-command-id"))) {
            failures.push({
              controlId,
              detail: "Collapsed rail control has no command id for command-palette parity.",
              ruleId: "compact-rail-command",
              severity: "fail",
            });
          }
          return failures;
        },
      );
    const clippedSegmentedControlFailures = () =>
      Array.from(document.querySelectorAll("[data-segmented-option], [data-rail-mode-option]"))
        .filter((element) => element instanceof HTMLElement && visible(element))
        .flatMap((element) => {
          const visibleLabel = normalize(element.textContent);
          if (!visibleLabel) {
            return [];
          }
          const declaredHitTarget = declaredHitTargetMin(element);
          const allowedHeight = Math.max(element.clientHeight, declaredHitTarget);
          const allowedWidth = Math.max(element.clientWidth, declaredHitTarget);
          if (
            element.scrollWidth <= allowedWidth + 1 &&
            element.scrollHeight <= allowedHeight + 1
          ) {
            return [];
          }
          return [
            {
              controlId:
                element.getAttribute("data-testid") ||
                element.getAttribute("data-segmented-option") ||
                "segmented-control-option",
              detail: `Segmented control label appears clipped: ${visibleLabel}`,
              ruleId: "segmented-control-clipped",
              severity: "fail",
            },
          ];
        });
    const issues = [];
    const controlIssue = (control, issue) => ({
      ...issue,
      stableTestId: control.stableTestId,
      surface: control.surface,
    });
    for (const control of controls) {
      const name = control.accessibleName || control.visibleLabel;
      if (!name) {
        issues.push(
          controlIssue(control, {
            controlId: control.id,
            detail: "Interactive control has no visible or programmatic name.",
            ruleId: "control-name",
            severity: "fail",
          }),
        );
      }
      if (control.disabled && !control.disabledReason) {
        issues.push(
          controlIssue(control, {
            controlId: control.id,
            detail: "Disabled control does not expose a reason.",
            ruleId: "disabled-reason",
            severity: "fail",
          }),
        );
      }
      if (
        control.hitAreaWidth < minimumInteractiveSize ||
        control.hitAreaHeight < minimumInteractiveSize
      ) {
        issues.push(
          controlIssue(control, {
            controlId: control.id,
            detail: `Touch target hit area is ${Math.round(control.hitAreaWidth)} x ${Math.round(
              control.hitAreaHeight,
            )} px; visual box is ${Math.round(control.visualWidth)} x ${Math.round(
              control.visualHeight,
            )} px; target minimum is ${String(minimumInteractiveSize)} x ${String(
              minimumInteractiveSize,
            )} px.`,
            hitAreaSize: {
              height: control.hitAreaHeight,
              width: control.hitAreaWidth,
            },
            ruleId: "touch-target",
            severity: "warning",
            visualSize: {
              height: control.visualHeight,
              width: control.visualWidth,
            },
          }),
        );
      }
      if (!control.role) {
        issues.push(
          controlIssue(control, {
            controlId: control.id,
            detail: "Interactive control has no explicit or implicit role.",
            ruleId: "control-role",
            severity: "warning",
          }),
        );
      }
    }
    for (const control of compactRailControlAffordanceFailures()) {
      issues.push(control);
    }
    for (const control of clippedSegmentedControlFailures()) {
      issues.push(control);
    }
    for (const image of Array.from(document.images).filter(visible)) {
      if (!image.hasAttribute("alt")) {
        issues.push({
          controlId: image.currentSrc || image.src || "image",
          detail: "Visible images need alt text, even when empty for decorative images.",
          ruleId: "image-alt",
          severity: "fail",
        });
      }
    }
    const liveRegionCount = document.querySelectorAll("[aria-live], [role='status']").length;
    if (liveRegionCount === 0) {
      issues.push({
        controlId: "document",
        detail: "No live status region was found for asynchronous reader or generation updates.",
        ruleId: "live-region",
        severity: "warning",
      });
    }
    return {
      controls,
      controlCount: controls.length,
      failCount: issues.filter((issue) => issue.severity === "fail").length,
      issues,
      liveRegionCount,
      warningCount: issues.filter((issue) => issue.severity === "warning").length,
    };
  }, minimumInteractiveSize);
}

export function summarize(results) {
  const failures = results.reduce(
    (total, result) => total + result.scan.failCount + result.browserIssues.length,
    0,
  );
  const warnings = results.reduce((total, result) => total + result.scan.warningCount, 0);
  return {
    controls: results.reduce((total, result) => total + result.scan.controlCount, 0),
    failures,
    scenarios: results.length,
    warnings,
  };
}

export function scanPageLandmarks() {
  const countSelector = (selector) =>
    Array.from(document.querySelectorAll(selector)).filter(
      (element) => element instanceof HTMLElement && element.offsetParent !== null,
    ).length;
  const landmarks = {
    banner: countSelector("[role='banner'], header"),
    complementary: countSelector("[role='complementary'], aside"),
    contentinfo: countSelector("[role='contentinfo'], footer"),
    main: countSelector("[role='main'], main"),
    navigation: countSelector("[role='navigation'], nav"),
  };
  const missingPrimaryLandmarks = ["main", "navigation", "contentinfo"].filter(
    (key) => landmarks[key] === 0,
  );
  return { landmarks, missingPrimaryLandmarks };
}

export function toFindingsDocument(document) {
  const allIssues = document.results.flatMap((result) => result.scan.issues);
  const browserIssueTotal = document.results.reduce(
    (total, result) => total + result.browserIssues.length,
    0,
  );
  const warningCounts = new Map();
  for (const issue of allIssues.filter((candidate) => candidate.severity === "warning")) {
    const count = warningCounts.get(issue.ruleId) ?? 0;
    warningCounts.set(issue.ruleId, count + 1);
  }

  return {
    generatedAt: document.generatedAt,
    schemaVersion: "a11y-findings.v1",
    status: document.status,
    scanner: document.scanner,
    appBaseUrl: document.appBaseUrl,
    apiBaseUrl: document.apiBaseUrl,
    summary: {
      controls: document.summary.controls,
      failures: document.summary.failures,
      scenarios: document.summary.scenarios,
      warnings: document.summary.warnings,
      browserIssues: browserIssueTotal,
      missingPrimaryLandmarks: document.results.reduce(
        (total, result) => total + result.landmarks.missingPrimaryLandmarks.length,
        0,
      ),
    },
    findings: {
      scenarioResults: document.results.map((result) => ({
        id: result.id,
        label: result.label,
        status:
          result.scan.failCount === 0 && result.browserIssues.length === 0 ? "passed" : "failed",
        focusAfterTab: result.focusedAfterTab,
        browserIssues: result.browserIssues.length,
        landmarkSummary: result.landmarks.landmarks,
        missingPrimaryLandmarks: result.landmarks.missingPrimaryLandmarks,
      })),
      warningCounts: [...warningCounts.entries()].map(([ruleId, count]) => ({
        count,
        ruleId,
      })),
      warnings: allIssues.filter((issue) => issue.severity === "warning"),
      failures: allIssues.filter((issue) => issue.severity === "fail"),
    },
  };
}

export function renderReport(document) {
  const lines = [
    "# Accessibility Audit",
    "",
    `Generated: ${document.generatedAt}`,
    `Status: ${document.status}`,
    `Scanner: ${document.scanner}`,
    "",
    "## Summary",
    "",
    `- Scenarios: ${document.summary.scenarios}`,
    `- Controls checked: ${document.summary.controls}`,
    `- Failures: ${document.summary.failures}`,
    `- Warnings: ${document.summary.warnings}`,
    "",
    "## Findings",
    "",
  ];
  for (const result of document.results) {
    lines.push(`### ${result.label}`);
    lines.push(`- Viewport: ${result.viewport.width} x ${result.viewport.height}`);
    lines.push(`- Focus after first Tab: ${result.focusedAfterTab ?? "none"}`);
    lines.push(`- Browser issues: ${result.browserIssues.length}`);
    lines.push(
      `- Primary landmarks observed: main=${String(result.landmarks.landmarks.main)} nav=${String(
        result.landmarks.landmarks.navigation,
      )} contentinfo=${String(result.landmarks.landmarks.contentinfo)}`,
    );
    if (result.scan.issues.length === 0 && result.browserIssues.length === 0) {
      lines.push("- No findings.");
    } else {
      for (const issue of result.scan.issues.slice(0, 30)) {
        const surface = issue.surface ? ` [${issue.surface}]` : "";
        const stableTestId =
          issue.stableTestId && issue.stableTestId !== issue.controlId
            ? ` stable-id=${issue.stableTestId}`
            : "";
        lines.push(
          `- ${issue.severity}: ${issue.ruleId} on ${issue.controlId}${surface}${stableTestId} - ${issue.detail}`,
        );
      }
      for (const issue of result.browserIssues) {
        lines.push(`- fail: browser issue - ${issue}`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
