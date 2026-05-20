import { describe, expect, it } from "vitest";
import {
  buildCinemaFocusCommandMetadata,
  buildSettingsCommandMetadata,
  buildWorkspaceCommandMetadata,
  searchCommandEntries,
  type CommandEntry,
} from "./index";

const noop = () => {
  void 0;
};

describe("command search", () => {
  it("ranks exact and title matches before detail-only matches", () => {
    const entries: CommandEntry[] = [
      {
        detail: "Change local reader preferences.",
        id: "settings-reader",
        perform: noop,
        section: "Settings",
        title: "Reader preferences",
      },
      {
        detail: "A reader setting lives over here.",
        id: "workspace-reader",
        perform: noop,
        section: "Workspace",
        title: "Open workspace",
      },
      {
        detail: "Search generated audio and source context.",
        id: "source",
        keywords: ["reader"],
        perform: noop,
        section: "Sources",
        title: "Prepared source",
      },
    ];

    expect(searchCommandEntries(entries, "reader").map((entry) => entry.id)).toEqual([
      "settings-reader",
      "source",
      "workspace-reader",
    ]);
  });

  it("supports multi-token searches across title and keywords", () => {
    const entries: CommandEntry[] = [
      {
        id: "cinema-review",
        keywords: ["bookmarks", "recent"],
        perform: noop,
        section: "Cinema",
        title: "Review cinema focus",
      },
      {
        id: "settings-review",
        perform: noop,
        section: "Settings",
        title: "Review settings",
      },
    ];

    expect(searchCommandEntries(entries, "review bookmarks").map((entry) => entry.id)).toEqual([
      "cinema-review",
    ]);
  });
});

describe("metadata command generation", () => {
  it("generates settings commands from groups, fields, and scopes", () => {
    const commands = buildSettingsCommandMetadata();

    expect(commands.map((command) => command.id)).toContain("settings:group:sources");
    expect(commands.map((command) => command.id)).toContain("settings:field:sourceSpeechPolicy");
    expect(commands.map((command) => command.id)).toContain("settings:scope:machine");
  });

  it("generates workspace and cinema commands from shared metadata", () => {
    expect(buildWorkspaceCommandMetadata().map((command) => command.id)).toContain(
      "workspace:stage:teleprompt",
    );
    expect(buildWorkspaceCommandMetadata().map((command) => command.id)).toContain(
      "workspace:layout:focus",
    );
    expect(buildCinemaFocusCommandMetadata().map((command) => command.id)).toEqual([
      "cinema:focus:read",
      "cinema:focus:inspect",
      "cinema:focus:review",
      "cinema:focus:debug",
    ]);
  });
});
