import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SHORTCUT_PREFERENCES,
  normalizeShortcutPreferences,
  resolveShortcutCommandBinding,
  shortcutAriaKeyShortcutsForCommand,
  shortcutAvailability,
  shortcutAvailabilityDisabled,
  shortcutAvailabilityReason,
  shortcutLabelForCommand,
  shortcutPreferenceConflicts,
  shouldIgnoreNarrationShortcutEvent,
  shouldIgnoreNarrationShortcutTarget,
  updateShortcutPreference,
} from "./shortcutRegistry";

function keyEvent(
  key: string,
  modifiers: Readonly<
    Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">>
  > = {},
): KeyboardEvent {
  return { key, ...modifiers } as KeyboardEvent;
}

class FakeHTMLElement {
  isContentEditable = false;
  closestMatch = false;

  constructor(readonly tagName: string) {}

  closest(selector?: string) {
    return this.closestMatch && selector?.includes("button") ? this : null;
  }
}

describe("shortcut registry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves fixed multi-binding narration shortcuts", () => {
    expect(
      resolveShortcutCommandBinding(keyEvent("k"), DEFAULT_SHORTCUT_PREFERENCES, "reader"),
    ).toMatchObject({
      bindingId: "k",
      commandId: "playback.toggle",
    });
    expect(
      resolveShortcutCommandBinding(keyEvent("ArrowDown"), DEFAULT_SHORTCUT_PREFERENCES, "theatre"),
    ).toMatchObject({
      bindingId: "arrow-down",
      commandId: "theatre.nextCue",
    });
  });

  it("normalizes and updates configurable shortcut preferences without losing old storage", () => {
    const preferences = normalizeShortcutPreferences({ "command.palette": "alt-k" });

    expect(shortcutLabelForCommand("command.palette", preferences)).toBe("Alt+K");
    expect(shortcutLabelForCommand("review.approve", preferences)).toBe("A");
    expect(shortcutLabelForCommand("status.openActivity", preferences)).toBe("Alt+Shift+A");
    expect(shortcutLabelForCommand("status.inspectIssue", preferences)).toBe("Alt+Shift+I");
    expect(shortcutLabelForCommand("temporary.quickListen", preferences)).toBe("Alt+Shift+Q");
    expect(shortcutLabelForCommand("temporary.keepInProject", preferences)).toBe("Alt+Shift+K");
    expect(shortcutLabelForCommand("review.nextIssue", preferences)).toBe("N");
    expect(
      shortcutLabelForCommand(
        "review.approve",
        updateShortcutPreference(preferences, "review.approve", "alt-a"),
      ),
    ).toBe("Alt+A");
  });

  it("surfaces shortcut labels, aria tokens, conflicts, and availability states", () => {
    expect(shortcutLabelForCommand("playback.toggle", DEFAULT_SHORTCUT_PREFERENCES)).toBe(
      "Space / K",
    );
    expect(
      shortcutAriaKeyShortcutsForCommand("theatre.toggleControls", DEFAULT_SHORTCUT_PREFERENCES),
    ).toBe("t");
    expect(
      shortcutAriaKeyShortcutsForCommand("theatre.shortcutHelp", DEFAULT_SHORTCUT_PREFERENCES),
    ).toBe("Shift+? F1");
    expect(shortcutPreferenceConflicts(DEFAULT_SHORTCUT_PREFERENCES)).toEqual([]);

    const disabled = shortcutAvailability(false, "Generated audio is missing.");
    expect(shortcutAvailabilityDisabled(disabled)).toBe(true);
    expect(shortcutAvailabilityReason(disabled)).toBe("Generated audio is missing.");
    expect(shortcutAvailabilityDisabled(shortcutAvailability(true))).toBe(false);
  });

  it("blocks narration shortcuts inside editing targets", () => {
    vi.stubGlobal("HTMLElement", FakeHTMLElement);
    const input = new FakeHTMLElement("input");
    const editable = new FakeHTMLElement("div");
    editable.isContentEditable = true;
    const regular = new FakeHTMLElement("button");

    expect(shouldIgnoreNarrationShortcutTarget(input as unknown as EventTarget)).toBe(true);
    expect(shouldIgnoreNarrationShortcutTarget(editable as unknown as EventTarget)).toBe(true);
    expect(shouldIgnoreNarrationShortcutTarget(regular as unknown as EventTarget)).toBe(false);
  });

  it("preserves native Space, Enter, and arrow behavior on focused controls", () => {
    vi.stubGlobal("HTMLElement", FakeHTMLElement);
    const button = new FakeHTMLElement("button");
    button.closestMatch = true;

    expect(
      shouldIgnoreNarrationShortcutEvent({ key: " ", target: button as unknown as EventTarget }),
    ).toBe(true);
    expect(
      shouldIgnoreNarrationShortcutEvent({
        key: "ArrowRight",
        target: button as unknown as EventTarget,
      }),
    ).toBe(true);
    expect(
      shouldIgnoreNarrationShortcutEvent({ key: "k", target: button as unknown as EventTarget }),
    ).toBe(false);
  });
});
