import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const loadingPatterns = [
  /Loading source renderer/i,
  /Loading selected chapter/i,
  /Loading Book Cinema/i,
  /Preparing this view locally/i,
  /Taking longer than expected/i,
];

const audioStatePatterns = [
  { id: "audio-ready", pattern: /\bAudio ready\b/i },
  { id: "audio-missing", pattern: /\bAudio missing\b|\bReady to create audio\b/i },
  { id: "playing", pattern: /\bPlaying\b/i },
  { id: "generating", pattern: /\bGenerating\b|\bCreating audio\b/i },
  { id: "stale", pattern: /\bStale audio\b/i },
  { id: "degraded", pattern: /\bDegraded\b|\bRenderer failed\b/i },
];

const modeLabels = new Set(["Read", "Inspect", "Review", "Debug", "Diagnostics", "More"]);
const contextDefaults = {
  Debug: "diagnostics",
  Inspect: "overview",
  Review: "review",
};

export function deriveScreenshotStateExpectations(screenshotPath) {
  const basename = path.basename(screenshotPath).toLowerCase();
  const expectations = {};

  if (/\bwebsite-cinema\b|responsive-website/.test(basename)) {
    expectations.expectedSurface = "Website Cinema";
  } else if (/\bdocument-cinema\b|responsive-document/.test(basename)) {
    expectations.expectedSurface = "Document Cinema";
  } else if (/\bbook-cinema\b|responsive-book/.test(basename)) {
    expectations.expectedSurface = "Book Cinema";
  } else if (basename.includes("settings")) {
    expectations.expectedSurface = "Settings";
  } else if (basename.includes("workspace")) {
    expectations.expectedSurface = "Workspace";
  }

  const cinemaStatefulScreenshot = /\bcinema\b|responsive-(book|document|website)/.test(basename);
  const responsiveCinemaScreenshot = /^responsive-(book|document|website)-/.test(basename);
  if (cinemaStatefulScreenshot && /-read-pinned\.png$/.test(basename)) {
    expectations.expectedMode = "Read";
    expectations.expectedSelectedModeControl = "Read";
    expectations.expectedContextPanelDefault = "overview";
    expectations.allowPinnedContextPanel = true;
  } else if (
    cinemaStatefulScreenshot &&
    /-read\.png$|responsive-[^-]+-[^-]+\.png$/.test(basename)
  ) {
    expectations.expectedMode = "Read";
    if (!responsiveCinemaScreenshot) {
      expectations.expectedSelectedModeControl = "Read";
    }
    expectations.expectedContextPanelDefault = null;
  } else if (cinemaStatefulScreenshot && /-inspect\.png$/.test(basename)) {
    expectations.expectedMode = "Inspect";
    expectations.expectedSelectedModeControl = "Inspect";
    expectations.expectedContextPanelDefault = "overview";
  } else if (cinemaStatefulScreenshot && /-review\.png$/.test(basename)) {
    expectations.expectedMode = "Review";
    expectations.expectedSelectedModeControl = "Review";
    expectations.expectedContextPanelDefault = "review";
  } else if (cinemaStatefulScreenshot && /-debug\.png$|-advanced\.png$/.test(basename)) {
    expectations.expectedMode = "Debug";
    expectations.expectedSelectedModeControl = "Diagnostics";
    expectations.expectedContextPanelDefault = "diagnostics";
  }

  if (expectations.expectedMode && !basename.includes("loading") && !basename.includes("failure")) {
    expectations.expectedLoadingState = "ready";
  }

  return expectations;
}

export function instrumentScreenshotState(page, { records, rootDir }) {
  if (page.__ttsScreenshotStateInstrumented) {
    return page;
  }
  const originalScreenshot = page.screenshot.bind(page);
  page.screenshot = async (options = {}) => {
    const result = await originalScreenshot(options);
    if (typeof options.path === "string") {
      try {
        records.push(
          await recordScreenshotState(page, {
            expectations: deriveScreenshotStateExpectations(options.path),
            rootDir,
            screenshotPath: options.path,
          }),
        );
      } catch (error) {
        records.push({
          expectations: deriveScreenshotStateExpectations(options.path),
          mismatches: [
            {
              actual: error instanceof Error ? error.message : String(error),
              expected: "state collection",
              issue: `Unable to collect screenshot state for ${path.basename(options.path)}.`,
              kind: "state-collection",
            },
          ],
          relativePath: rootDir ? path.relative(rootDir, options.path) : options.path,
          screenshotPath: options.path,
          state: null,
          status: "failed",
        });
      }
    }
    return result;
  };
  page.__ttsScreenshotStateInstrumented = true;
  return page;
}

export async function recordScreenshotState(page, { expectations = {}, rootDir, screenshotPath }) {
  const state = await collectScreenshotState(page);
  const mismatches = assertScreenshotState({ expectations, screenshotPath, state });
  return {
    expectations,
    mismatches,
    screenshotPath,
    relativePath: rootDir ? path.relative(rootDir, screenshotPath) : screenshotPath,
    state,
    status: mismatches.length === 0 ? "passed" : "failed",
  };
}

export async function collectScreenshotState(page) {
  return page.evaluate(
    ({ audioSources, loadingSources }) => {
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      };
      const visibleText = document.body.innerText?.replace(/\s+/g, " ").trim() ?? "";
      const overlay =
        Array.from(
          document.querySelectorAll(
            '[role="dialog"][aria-labelledby="book-cinema-title"], [role="dialog"][aria-labelledby="prepared-source-cinema-title"]',
          ),
        ).find(visible) ?? null;
      const root = overlay ?? document.body;
      const labelledBy = overlay?.getAttribute("aria-labelledby") ?? "";
      const heading = labelledBy ? document.getElementById(labelledBy) : null;
      const sourceTitle = heading?.textContent?.replace(/\s+/g, " ").trim() ?? null;
      const surface = deriveSurface(root, sourceTitle, visibleText);
      const contextPanel = Array.from(
        root.querySelectorAll("[data-context-panel-active-tab]"),
      ).find(visible);
      const selectedControls = Array.from(
        root.querySelectorAll("button, [role='tab'], [role='menuitemradio']"),
      )
        .filter(visible)
        .filter((element) => {
          const attrs = [
            element.getAttribute("aria-pressed"),
            element.getAttribute("aria-selected"),
            element.getAttribute("aria-checked"),
            element.getAttribute("data-selected"),
          ];
          return attrs.includes("true");
        })
        .map((element) => ({
          ariaChecked: element.getAttribute("aria-checked"),
          ariaPressed: element.getAttribute("aria-pressed"),
          ariaSelected: element.getAttribute("aria-selected"),
          dataSelected: element.getAttribute("data-selected"),
          label: element.textContent?.replace(/\s+/g, " ").trim() ?? "",
          role: element.getAttribute("role") ?? element.tagName.toLowerCase(),
        }));
      const selectedModeControls = selectedControls.filter((control) =>
        ["Read", "Inspect", "Review", "Debug", "Diagnostics", "More"].includes(control.label),
      );
      const explicitMode = root.getAttribute("data-cinema-focus-mode");
      const inspectorMode = root
        .querySelector("[data-cinema-inspector-mode]")
        ?.getAttribute("data-cinema-inspector-mode");
      const activeContextTab = contextPanel?.getAttribute("data-context-panel-active-tab") ?? null;
      const activeMode = deriveActiveMode(
        explicitMode,
        inspectorMode,
        selectedModeControls,
        activeContextTab,
      );
      const loadingTexts = loadingSources
        .filter((pattern) => new RegExp(pattern.source, pattern.flags).test(visibleText))
        .map((pattern) => pattern.label);
      const audioLifecycleState =
        audioSources.find((item) => new RegExp(item.source, item.flags).test(visibleText))?.id ??
        null;

      return {
        activeContextTab,
        activeMode,
        audioLifecycleState,
        bodyTextSample: visibleText.slice(0, 800),
        contextPanel: contextPanel
          ? {
              activeTab: activeContextTab,
              surface: contextPanel.getAttribute("data-context-panel-surface") ?? null,
              title:
                contextPanel.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
            }
          : null,
        loadingTexts,
        selectedControls,
        selectedModeControls,
        sourceTitle,
        surface,
        url: window.location.href,
      };

      function deriveSurface(node, title, text) {
        const surfaceAttr = node.getAttribute?.("data-cinema-surface") ?? null;
        if (surfaceAttr === "website") {
          return "Website Cinema";
        }
        if (surfaceAttr === "document") {
          return "Document Cinema";
        }
        if (surfaceAttr === "book") {
          return "Book Cinema";
        }
        const haystack = `${title ?? ""} ${text}`;
        if (/Studio Settings/i.test(haystack)) {
          return "Settings";
        }
        if (
          /Revision Panel|Guided Intake|Project library|Spoken Form|Teleprompt Studio/i.test(
            haystack,
          )
        ) {
          return "Workspace";
        }
        if (/Website Cinema/i.test(haystack)) {
          return "Website Cinema";
        }
        if (/Document Cinema/i.test(haystack)) {
          return "Document Cinema";
        }
        if (/Book Cinema/i.test(haystack)) {
          return "Book Cinema";
        }
        return null;
      }

      function deriveActiveMode(explicit, inspector, controls, activeTab) {
        const normalizedExplicit = normalizeMode(explicit);
        if (normalizedExplicit) {
          return normalizedExplicit;
        }
        const exact = controls.find((control) =>
          ["Read", "Inspect", "Review", "Debug"].includes(control.label),
        );
        if (exact) {
          return exact.label;
        }
        const normalizedInspector = normalizeMode(inspector);
        if (normalizedInspector) {
          return normalizedInspector;
        }
        if (activeTab === "diagnostics") {
          return "Debug";
        }
        return null;
      }

      function normalizeMode(value) {
        if (!value) {
          return null;
        }
        if (value === "read") {
          return "Read";
        }
        if (value === "inspect") {
          return "Inspect";
        }
        if (value === "review") {
          return "Review";
        }
        if (value === "debug") {
          return "Debug";
        }
        return null;
      }
    },
    {
      audioSources: audioStatePatterns.map((item) => ({
        flags: item.pattern.flags,
        id: item.id,
        source: item.pattern.source,
      })),
      loadingSources: loadingPatterns.map((pattern) => ({
        flags: pattern.flags,
        label: pattern.source,
        source: pattern.source,
      })),
    },
  );
}

export function assertScreenshotState({ expectations = {}, screenshotPath = "", state }) {
  const mismatches = [];
  const label = path.basename(screenshotPath);
  const selectedModeLabels = new Set(
    (state.selectedModeControls ?? [])
      .map((control) => control.label)
      .filter((value) => modeLabels.has(value)),
  );

  if (expectations.expectedSurface && state.surface !== expectations.expectedSurface) {
    mismatches.push({
      actual: state.surface,
      expected: expectations.expectedSurface,
      issue: `${label} expected ${expectations.expectedSurface} but rendered ${state.surface ?? "unknown surface"}.`,
      kind: "surface",
    });
  }

  if (expectations.expectedSelectedModeControl) {
    const expectedControl = expectations.expectedSelectedModeControl;
    if (!selectedModeLabels.has(expectedControl)) {
      mismatches.push({
        actual: [...selectedModeLabels].join(", ") || "none",
        expected: expectedControl,
        issue: `${label} expected ${expectedControl} mode control to be selected.`,
        kind: "selected-mode-control",
      });
    }
  }

  if (expectations.expectedMode && state.activeMode !== expectations.expectedMode) {
    mismatches.push({
      actual: state.activeMode,
      expected: expectations.expectedMode,
      issue: `${label} expected active mode ${expectations.expectedMode} but observed ${state.activeMode ?? "unknown"}.`,
      kind: "active-mode",
    });
  }

  if (expectations.expectedMode === "Read" && selectedModeLabels.has("Review")) {
    mismatches.push({
      actual: "Review selected",
      expected: "Read only",
      issue: `${label} is a Read screenshot but Review is selected.`,
      kind: "read-review-conflict",
    });
  }

  if (expectations.expectedMode === "Debug" && selectedModeLabels.has("More")) {
    mismatches.push({
      actual: "More selected",
      expected: "Debug or Diagnostics selected",
      issue: `${label} entered Debug through More but left More as the visible active mode.`,
      kind: "debug-more-conflict",
    });
  }

  if (Object.hasOwn(expectations, "expectedContextPanelDefault")) {
    const expectedPanel = expectations.expectedContextPanelDefault;
    const actualPanel = state.contextPanel?.activeTab ?? null;
    if (expectedPanel === null && actualPanel !== null && !expectations.allowPinnedContextPanel) {
      mismatches.push({
        actual: actualPanel,
        expected: null,
        issue: `${label} expected no context panel in Read mode, but ${actualPanel} was visible.`,
        kind: "context-panel",
      });
    } else if (expectedPanel !== null && actualPanel !== expectedPanel) {
      mismatches.push({
        actual: actualPanel,
        expected: expectedPanel,
        issue: `${label} expected context panel ${expectedPanel} but rendered ${actualPanel ?? "none"}.`,
        kind: "context-panel",
      });
    }
  } else if (contextDefaults[expectations.expectedMode] && state.contextPanel?.activeTab) {
    const expectedPanel = contextDefaults[expectations.expectedMode];
    if (state.contextPanel.activeTab !== expectedPanel) {
      mismatches.push({
        actual: state.contextPanel.activeTab,
        expected: expectedPanel,
        issue: `${label} expected ${expectations.expectedMode} to default to ${expectedPanel}.`,
        kind: "context-panel-default",
      });
    }
  }

  if (expectations.expectedLoadingState === "ready" && (state.loadingTexts ?? []).length > 0) {
    mismatches.push({
      actual: state.loadingTexts.join(", "),
      expected: "no loading copy",
      issue: `${label} is a ready-state screenshot but still shows loading copy.`,
      kind: "loading-state",
    });
  }

  if (
    expectations.expectedAudioLifecycleState &&
    state.audioLifecycleState !== expectations.expectedAudioLifecycleState
  ) {
    mismatches.push({
      actual: state.audioLifecycleState,
      expected: expectations.expectedAudioLifecycleState,
      issue: `${label} expected audio lifecycle ${expectations.expectedAudioLifecycleState}.`,
      kind: "audio-lifecycle",
    });
  }

  if (
    expectations.expectedSourceTitle &&
    !String(state.sourceTitle ?? "").includes(expectations.expectedSourceTitle)
  ) {
    mismatches.push({
      actual: state.sourceTitle,
      expected: expectations.expectedSourceTitle,
      issue: `${label} expected source title containing ${expectations.expectedSourceTitle}.`,
      kind: "source-title",
    });
  }

  return mismatches;
}

export async function writeScreenshotStateArtifacts({ outputDir, records, rootDir }) {
  await mkdir(outputDir, { recursive: true });
  const mismatches = records.flatMap((record) =>
    record.mismatches.map((mismatch) => ({
      ...mismatch,
      screenshotPath: record.relativePath,
    })),
  );
  const document = {
    generatedAt: new Date().toISOString(),
    records,
    rootDir,
    schemaVersion: "screenshot-state.v1",
    status: mismatches.length === 0 ? "passed" : "failed",
    summary: {
      mismatches: mismatches.length,
      screenshots: records.length,
      surfaces: [...new Set(records.map((record) => record.state?.surface).filter(Boolean))],
    },
  };
  await writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(document, null, 2)}\n`);
  await writeFile(path.join(outputDir, "state-mismatches.md"), renderStateMismatches(document));
  return document;
}

export function renderStateMismatches(document) {
  const mismatches = document.records.flatMap((record) =>
    record.mismatches.map((mismatch) => ({
      ...mismatch,
      screenshotPath: record.relativePath,
    })),
  );
  if (mismatches.length === 0) {
    return [
      "# Screenshot State Mismatches",
      "",
      "No mismatches detected.",
      "",
      `Screenshots checked: ${String(document.summary.screenshots)}`,
      "",
    ].join("\n");
  }
  const rows = mismatches
    .map(
      (mismatch) =>
        `| ${escapeMarkdown(mismatch.screenshotPath)} | ${escapeMarkdown(mismatch.kind)} | ${escapeMarkdown(
          String(mismatch.expected ?? ""),
        )} | ${escapeMarkdown(String(mismatch.actual ?? ""))} | ${escapeMarkdown(mismatch.issue)} |`,
    )
    .join("\n");
  return [
    "# Screenshot State Mismatches",
    "",
    `Detected ${String(mismatches.length)} screenshot state mismatch${
      mismatches.length === 1 ? "" : "es"
    }.`,
    "",
    "| Screenshot | Kind | Expected | Actual | Issue |",
    "| --- | --- | --- | --- | --- |",
    rows,
    "",
  ].join("\n");
}

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}
