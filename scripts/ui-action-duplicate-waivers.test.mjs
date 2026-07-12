import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyDuplicateGroup,
  summarizeDuplicateClassifications,
} from "./ui-action-duplicate-waivers.mjs";

test("classifies repeated same-surface controls as scenario coverage", () => {
  const classification = classifyDuplicateGroup({
    actionClass: "transport",
    actionIds: ["book-scope", "book-scope"],
    count: 2,
    kind: "same-label-same-surface",
    label: "Book scope: Chapter One",
    scenarios: ["book-docx-audio-ready", "book-epub-audio-ready"],
    surface: "BookCinema",
    surfaces: ["BookCinema"],
  });

  assert.equal(classification.category, "allowed-same-control-across-scenarios");
  assert.equal(classification.severity, "waived");
});

test("classifies preview audition duplicates under the preview playback burn-down", () => {
  const classification = classifyDuplicateGroup({
    actionClass: "generation",
    actionIds: ["ui-action-preview-mini-play", "ui-action-preview-local-play"],
    count: 2,
    kind: "same-label-same-surface",
    label: "Audition",
    playbackActions: ["audition"],
    playbackOwners: ["preview"],
    scenarios: ["workspace-preview-asr-warning"],
    surface: "Preview",
    surfaces: ["Preview"],
  });

  assert.equal(classification.category, "allowed-owned-overexposure");
  assert.equal(classification.burnDownIssue, "WP46-BD-PREVIEW-PLAYBACK");
  assert.equal(classification.severity, "waived");
});

test("classifies clone controls as overexposed with a burn-down issue", () => {
  const classification = classifyDuplicateGroup({
    actionClass: "generation",
    actionIds: ["clone-a", "clone-b"],
    count: 2,
    kind: "identical-action-overexposed",
    label: "Clone",
    scenarios: ["workspace-review", "workspace-preview"],
    surface: "Review, Preview",
    surfaces: ["Review", "Preview"],
  });

  assert.equal(classification.category, "allowed-owned-overexposure");
  assert.equal(classification.burnDownIssue, "WP46-BD-VOICE-CLONE");
  assert.equal(classification.severity, "waived");
});

test("classifies voice-command clone controls under the clone burn-down", () => {
  const classification = classifyDuplicateGroup({
    actionClass: "generation",
    actionIds: ["clone-a", "clone-b"],
    count: 2,
    kind: "same-label-same-surface",
    label: "Clone",
    scenarios: ["workspace-review", "workspace-preview"],
    surface: "Voice Command",
    surfaces: ["Voice Command"],
  });

  assert.equal(classification.category, "allowed-owned-overexposure");
  assert.equal(classification.burnDownIssue, "WP46-BD-VOICE-CLONE");
});

test("classifies shared Cinema More IA entries as surface parity", () => {
  const classification = classifyDuplicateGroup({
    actionClass: "diagnostic",
    actionIds: [
      "ui-action-cinema-advanced-alignment-repair",
      "ui-action-cinema-advanced-alignment-repair",
      "ui-action-cinema-advanced-alignment-repair",
    ],
    count: 3,
    kind: "same-label-different-behavior",
    label: "Alignment repair",
    scenarios: ["book-more-menu", "document-more-menu", "website-more-menu"],
    surface: "BookCinema, DocumentCinema, WebsiteCinema",
    surfaces: ["BookCinema", "DocumentCinema", "WebsiteCinema"],
  });

  assert.equal(classification.category, "allowed-surface-parity");
  assert.equal(classification.id, "wp57-cinema-more-ia-parity");
});

test("classifies the global workspace layout control as shell chrome", () => {
  const classification = classifyDuplicateGroup({
    actionClass: "navigation",
    actionIds: ["ui-action-workspace-layout-full", "ui-action-workspace-layout-full"],
    count: 2,
    kind: "same-label-different-behavior",
    label: "Full workspace layout",
    scenarios: ["workspace-review", "workspace-preview"],
    surface: "Review, Preview",
    surfaces: ["Review", "Preview"],
  });

  assert.equal(classification.category, "allowed-same-control-across-scenarios");
  assert.equal(classification.id, "wp46-workspace-layout-shell-control");
});

test("classifies playback Cinema navigation as an allowed listening destination", () => {
  const classification = classifyDuplicateGroup({
    actionClass: "navigation",
    actionIds: ["ui-action-rail-playback-open-cinema", "ui-action-rail-playback-open-cinema"],
    count: 2,
    kind: "same-label-same-surface",
    label: "Cinema",
    scenarios: ["book-pdf-pre-audio", "workspace-intake"],
    surface: "Playback",
    surfaces: ["Playback"],
  });

  assert.equal(classification.category, "allowed-surface-parity");
  assert.equal(classification.burnDownIssue, null);
});

test("leaves unknown duplicate groups unclassified", () => {
  const classification = classifyDuplicateGroup({
    actionClass: "navigation",
    actionIds: ["mystery-a", "mystery-b"],
    count: 2,
    kind: "same-label-different-behavior",
    label: "Mystery action",
    scenarios: ["custom-one", "custom-two"],
    surface: "Workspace, Preview",
    surfaces: ["Workspace", "Preview"],
  });

  assert.equal(classification.category, "unclassified");
  assert.equal(classification.severity, "blocking");
});

test("summarizes waiver, needs-review, and unclassified duplicate categories", () => {
  const summary = summarizeDuplicateClassifications([
    {
      actionClass: "navigation",
      actionIds: ["review-a", "review-b"],
      count: 2,
      kind: "same-label-different-behavior",
      label: "Review",
      scenarios: ["project-dashboard"],
      surface: "Command Center",
      surfaces: ["Command Center"],
    },
    {
      actionClass: "generation",
      actionIds: ["clone-a", "clone-b"],
      count: 2,
      kind: "identical-action-overexposed",
      label: "Clone",
      scenarios: ["workspace-review", "workspace-preview"],
      surface: "Review, Preview",
      surfaces: ["Review", "Preview"],
    },
    {
      actionClass: "navigation",
      actionIds: ["mystery-a", "mystery-b"],
      count: 2,
      kind: "same-label-different-behavior",
      label: "Mystery action",
      scenarios: ["custom-one", "custom-two"],
      surface: "Workspace, Preview",
      surfaces: ["Workspace", "Preview"],
    },
  ]);

  assert.equal(summary.byCategory["allowed-surface-parity"], 1);
  assert.equal(summary.byCategory["allowed-owned-overexposure"], 1);
  assert.equal(summary.byCategory.overexposed, 0);
  assert.equal(summary.byCategory.unclassified, 1);
  assert.equal(summary.burnDownIssues[0].issue, "WP46-BD-VOICE-CLONE");
});
