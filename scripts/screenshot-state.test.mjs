import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertScreenshotState,
  deriveScreenshotStateExpectations,
  renderStateMismatches,
} from "./screenshot-state.mjs";

test("infers focus screenshot mode expectations from filenames", () => {
  assert.deepEqual(deriveScreenshotStateExpectations("website-cinema-focus-review.png"), {
    expectedContextPanelDefault: "review",
    expectedLoadingState: "ready",
    expectedMode: "Review",
    expectedRendererLifecycleState: "ready",
    expectedSelectedModeControl: "Review",
    expectedSurface: "Website Cinema",
  });
});

test("flags a Read screenshot with Review selected", () => {
  const mismatches = assertScreenshotState({
    expectations: deriveScreenshotStateExpectations("book-cinema-focus-read.png"),
    screenshotPath: "book-cinema-focus-read.png",
    state: {
      activeMode: "Review",
      contextPanel: { activeTab: "review" },
      loadingTexts: [],
      selectedModeControls: [{ label: "Review" }],
      surface: "Book Cinema",
    },
  });

  assert.equal(
    mismatches.some((mismatch) => mismatch.kind === "read-review-conflict"),
    true,
  );
});

test("flags Debug screenshots that leave More as the active control", () => {
  const mismatches = assertScreenshotState({
    expectations: deriveScreenshotStateExpectations("document-cinema-focus-debug.png"),
    screenshotPath: "document-cinema-focus-debug.png",
    state: {
      activeMode: "Debug",
      contextPanel: { activeTab: "diagnostics" },
      loadingTexts: [],
      selectedModeControls: [{ label: "More" }],
      surface: "Document Cinema",
    },
  });

  assert.equal(
    mismatches.some((mismatch) => mismatch.kind === "debug-more-conflict"),
    true,
  );
});

test("flags ready screenshots that still show renderer loading copy", () => {
  const mismatches = assertScreenshotState({
    expectations: deriveScreenshotStateExpectations("document-cinema-focus-read.png"),
    screenshotPath: "document-cinema-focus-read.png",
    state: {
      activeMode: "Read",
      contextPanel: null,
      loadingTexts: ["Loading source renderer"],
      rendererLifecycle: "loading",
      selectedModeControls: [{ label: "Read" }],
      surface: "Document Cinema",
    },
  });

  assert.equal(
    mismatches.some((mismatch) => mismatch.kind === "loading-state"),
    true,
  );
});

test("allows explicitly named loading screenshots to show bounded renderer loading", () => {
  const mismatches = assertScreenshotState({
    expectations: deriveScreenshotStateExpectations("document-cinema-focus-loading.png"),
    screenshotPath: "document-cinema-focus-loading.png",
    state: {
      activeMode: "Read",
      contextPanel: null,
      loadingTexts: ["Preparing this view locally"],
      rendererLifecycle: "loading",
      selectedModeControls: [{ label: "Read" }],
      surface: "Document Cinema",
    },
  });

  assert.equal(mismatches.length, 0);
});

test("flags audio-ready chrome while the renderer is still loading", () => {
  const mismatches = assertScreenshotState({
    expectations: deriveScreenshotStateExpectations("document-cinema-focus-loading.png"),
    screenshotPath: "document-cinema-focus-loading.png",
    state: {
      activeMode: "Read",
      audioLifecycleState: "audio-ready",
      contextPanel: null,
      loadingTexts: ["Preparing this view locally"],
      rendererLifecycle: "loading",
      selectedModeControls: [{ label: "Read" }],
      surface: "Document Cinema",
    },
  });

  assert.equal(
    mismatches.some((mismatch) => mismatch.kind === "renderer-audio-contradiction"),
    true,
  );
});

test("renders an empty mismatch report for clean manifests", () => {
  const markdown = renderStateMismatches({
    records: [],
    summary: { screenshots: 0 },
  });

  assert.match(markdown, /No mismatches detected/);
});
