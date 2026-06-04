import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_SPEECH_POLICY_SETTINGS,
  DEFAULT_SPEECH_POLICY_DEFINITION,
} from "../../speechPolicy";
import { createRunConfiguration } from "../../runConfig";
import { DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS } from "../../teleprompter";
import { DEFAULT_READER_ACCESSIBILITY_SETTINGS } from "../reader-accessibility";
import { DEFAULT_READ_ALONG_PREFERENCES } from "../readalong";
import { DEFAULT_TELEPROMPT_THEATRE_SETTINGS } from "../teleprompt/telepromptTheatreSettings";
import { defaultUiMemoryState } from "../preferences";
import { DEFAULT_SHORTCUT_PREFERENCES } from "../shortcuts/shortcutRegistry";
import { SettingsPanel } from "./SettingsPanel";
import type { SettingsCommandTarget } from "./model";
import type { CustomSpeechPolicyProfile, TTSEngineDiagnostics } from "../../types";

const noop = () => {
  // Test callback.
};

const asyncNoop = async () => {
  // Test callback.
};

function renderSettingsPanel(
  commandTarget?: SettingsCommandTarget,
  options: Readonly<{
    customSpeechPolicyProfiles?: CustomSpeechPolicyProfile[];
    speechPolicyProfile?: string;
    ttsEngines?: TTSEngineDiagnostics[];
  }> = {},
): string {
  return renderToStaticMarkup(
    <SettingsPanel
      canSubmit
      commandTarget={commandTarget}
      customSpeechPolicyProfiles={options.customSpeechPolicyProfiles ?? []}
      isOpen
      isSpeechPolicyPreviewing={false}
      job={null}
      metrics={null}
      metricsError={null}
      profileSource={null}
      profileSourceDiagnostics={null}
      projectStorage={null}
      projectStorageError={null}
      readerAccessibilitySettings={DEFAULT_READER_ACCESSIBILITY_SETTINGS}
      readAlongPreferences={DEFAULT_READ_ALONG_PREFERENCES}
      researchModules={[]}
      runConfiguration={createRunConfiguration("checkedMaster")}
      selectedBookSource={null}
      selectedPreparedSource={null}
      selectedProfile={null}
      sourceMode="text"
      sourcePolicySavingKey={null}
      speechPolicyDefinition={DEFAULT_SPEECH_POLICY_DEFINITION}
      speechPolicyError={null}
      speechPolicyOverrides={{}}
      speechPolicyProfile={options.speechPolicyProfile ?? "Enterprise"}
      speechPolicyProfiles={DEFAULT_SPEECH_POLICY_DEFINITION.profiles}
      shortcutPreferences={DEFAULT_SHORTCUT_PREFERENCES}
      telepromptTheatreSettings={DEFAULT_TELEPROMPT_THEATRE_SETTINGS}
      teleprompterSettings={DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS}
      themeName="light"
      ttsEngineError={null}
      ttsEngines={options.ttsEngines ?? []}
      uiMemory={defaultUiMemoryState()}
      onClearBookSourcePolicy={asyncNoop}
      onClearPreparedSourcePolicy={asyncNoop}
      onClearSpeechPolicyOverrides={noop}
      onClose={noop}
      onCreateCustomSpeechPolicyProfile={asyncNoop}
      onDeleteCustomSpeechPolicyProfile={asyncNoop}
      onReaderAccessibilitySettingsChange={noop}
      onReadAlongPreferencesChange={noop}
      onRunConfigurationChange={noop}
      onSaveBookSourcePolicy={asyncNoop}
      onSavePreparedSourcePolicy={asyncNoop}
      onShortcutPreferencesChange={noop}
      onShortcutPreferencesReset={noop}
      onSpeechPolicyOverridesChange={noop}
      onSpeechPolicyProfileChange={noop}
      onSubmit={noop}
      onTelepromptTheatreSettingsChange={noop}
      onTeleprompterSettingsChange={noop}
      onThemeChange={noop}
      onUiMemoryExportPreferences={() => "{}"}
      onUiMemoryImportPreferences={() => ({ message: "Imported.", ok: true })}
      onUiMemoryPreferenceChange={noop}
      onUiMemoryReset={noop}
      onUpdateCustomSpeechPolicyProfile={asyncNoop}
    />,
  );
}

describe("SettingsPanel", () => {
  it("renders task groups, quick settings, and scope labels", () => {
    const markup = renderSettingsPanel();

    expect(markup).toContain("Studio Settings");
    expect(markup).toContain("Quick settings");
    expect(markup).toContain("Quick");
    expect(markup).toContain("Advanced");
    expect(markup).toContain("Expert / Diagnostics");
    expect(markup).toContain("Output intent");
    expect(markup).toContain("Use-case preset");
    expect(markup).toContain("Long-form book listening");
    expect(markup).toContain("Before / after summary");
    expect(markup).toContain("Settings audit");
    expect(markup).toContain("Built-in defaults -&gt; Machine defaults -&gt; Project defaults");
    expect(markup).toContain("Preview draft");
    expect(markup).toContain("Apply preset defaults");
    expect(markup).toContain("Policy requires confirm");
    expect(markup).toContain("Preview sample");
    expect(markup).toContain("Session");
    expect(markup).toContain("Project");
    expect(markup).toContain("Source");
    expect(markup).toContain("Machine");
  });

  it("renders the golden-minute speech-policy preview when targeted", () => {
    const markup = renderSettingsPanel({
      fieldId: "projectSpeechPolicy",
      groupId: "sources",
      layerId: "advanced",
      scope: "project",
    });

    expect(markup).toContain("Golden-minute policy preview");
    expect(markup).toContain("Visual spoken-text preview");
    expect(markup).toContain("Reset project default");
    expect(markup).toContain("without changing selected-source pins");
    expect(markup).toContain("citation [^gm1]");
    expect(markup).toContain("Dr. -&gt; Doctor");
    expect(markup).toContain("Enterprise vs Education");
    expect(markup).toContain("Accessibility vs Technical Docs");
  });

  it("renders Teleprompt Theatre settings when targeted", () => {
    const markup = renderSettingsPanel({
      fieldId: "telepromptTheatre",
      groupId: "reader",
      layerId: "advanced",
      scope: "machine",
    });

    expect(markup).toContain("Teleprompt Theatre");
    expect(markup).toContain("Laptop presenter");
    expect(markup).toContain("Recording booth");
    expect(markup).toContain("Cue font size");
  });

  it("renders reader typography presets only inside Reader settings", () => {
    const markup = renderSettingsPanel({
      fieldId: "readerPreferences",
      groupId: "reader",
      layerId: "advanced",
      scope: "machine",
    });

    expect(markup).toContain("Typography preset");
    expect(markup).toContain("Teleprompt");
    expect(markup).toContain("Theatre");
    expect(markup).toContain('data-testid="ui-action-reader-typography-preset"');
    expect(markup).not.toContain("settings-quick-reader-scale");
  });

  it("renders the Studio tutorial launcher preference in UI memory settings", () => {
    const markup = renderSettingsPanel({
      fieldId: "uiMemory",
      groupId: "reader",
      layerId: "advanced",
      scope: "machine",
    });

    expect(markup).toContain("Show Studio tutorial launcher");
    expect(markup).toContain('data-testid="ui-action-ui-memory-show-tutorial-launcher"');
  });

  it("renders custom golden-minute policy comparison when a user profile exists", () => {
    const markup = renderSettingsPanel(
      {
        fieldId: "projectSpeechPolicy",
        groupId: "sources",
        layerId: "advanced",
        scope: "project",
      },
      {
        customSpeechPolicyProfiles: [
          {
            baseProfile: "Enterprise",
            createdAt: "2026-05-27T00:00:00.000Z",
            id: "custom-policy",
            name: "Project proofing custom",
            settings: {
              ...BUILT_IN_SPEECH_POLICY_SETTINGS.Enterprise,
              citationMode: "inline",
              footnoteMode: "inline",
            },
            updatedAt: "2026-05-27T00:00:00.000Z",
          },
        ],
        speechPolicyProfile: "custom-policy",
      },
    );

    expect(markup).toContain("Project proofing custom");
    expect(markup).toContain("Custom vs project default");
    expect(markup).toContain("sentence highlight");
    expect(markup).toContain("Citation marker [^gm1] is read inline");
  });

  it("shows provider timing limits in read-along settings", () => {
    const markup = renderSettingsPanel(
      {
        fieldId: "readAlongPreferences",
        groupId: "reader",
        layerId: "advanced",
        scope: "machine",
      },
      {
        ttsEngines: [
          {
            capabilities: {
              abComparison: true,
              alignment: true,
              alignmentRequiredForWordHighlight: true,
              alignmentSupported: true,
              cancelJob: true,
              localOnly: true,
              mockTts: false,
              phonemeOverrides: true,
              phraseTiming: true,
              retryJob: true,
              ssml: true,
              ssmlMarks: true,
              streaming: true,
              tts: true,
              voiceCloning: true,
              voicePreview: true,
              wordTiming: false,
            },
            default: true,
            experimental: false,
            id: "kokoro",
            label: "No word timing profile",
            local: true,
            status: "ready",
            supportsReference: true,
            supportsSSML: true,
            supportsSwedish: true,
            supportsVoice: true,
          },
        ],
      },
    );

    expect(markup).toContain("Provider timing limits");
    expect(markup).toContain("Word highlight unavailable");
    expect(markup).toContain("Phrase highlight fallback available");
    expect(markup).toContain("Forced alignment required");
    expect(markup).toContain('data-command-id="readalong:word-highlight"');
  });
});
