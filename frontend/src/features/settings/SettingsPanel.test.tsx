import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_SPEECH_POLICY_DEFINITION } from "../../speechPolicy";
import { createRunConfiguration } from "../../runConfig";
import { DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS } from "../../teleprompter";
import { DEFAULT_READER_ACCESSIBILITY_SETTINGS } from "../reader-accessibility";
import { DEFAULT_READ_ALONG_PREFERENCES } from "../readalong";
import { defaultUiMemoryState } from "../preferences";
import { DEFAULT_SHORTCUT_PREFERENCES } from "../shortcuts/shortcutRegistry";
import { SettingsPanel } from "./SettingsPanel";

const noop = () => {
  // Test callback.
};

const asyncNoop = async () => {
  // Test callback.
};

describe("SettingsPanel", () => {
  it("renders task groups, quick settings, and scope labels", () => {
    const markup = renderToStaticMarkup(
      <SettingsPanel
        canSubmit
        customSpeechPolicyProfiles={[]}
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
        speechPolicyProfile="Enterprise"
        speechPolicyProfiles={DEFAULT_SPEECH_POLICY_DEFINITION.profiles}
        shortcutPreferences={DEFAULT_SHORTCUT_PREFERENCES}
        teleprompterSettings={DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS}
        themeName="light"
        ttsEngineError={null}
        ttsEngines={[]}
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
        onTeleprompterSettingsChange={noop}
        onThemeChange={noop}
        onUiMemoryExportPreferences={() => "{}"}
        onUiMemoryImportPreferences={() => ({ message: "Imported.", ok: true })}
        onUiMemoryPreferenceChange={noop}
        onUiMemoryReset={noop}
        onUpdateCustomSpeechPolicyProfile={asyncNoop}
      />,
    );

    expect(markup).toContain("Studio Settings");
    expect(markup).toContain("Quick settings");
    expect(markup).toContain("Quick");
    expect(markup).toContain("Advanced");
    expect(markup).toContain("Expert / Diagnostics");
    expect(markup).toContain("Output intent");
    expect(markup).toContain("Preview sample");
    expect(markup).toContain("Session");
    expect(markup).toContain("Project");
    expect(markup).toContain("Source");
    expect(markup).toContain("Machine");
  });
});
