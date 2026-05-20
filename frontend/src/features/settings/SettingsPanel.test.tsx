import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_SPEECH_POLICY_DEFINITION } from "../../speechPolicy";
import { createRunConfiguration } from "../../runConfig";
import { DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS } from "../../teleprompter";
import { DEFAULT_READER_ACCESSIBILITY_SETTINGS } from "../reader-accessibility";
import { defaultUiMemoryState } from "../preferences";
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
        onPrepareProfileTarget={asyncNoop}
        onReaderAccessibilitySettingsChange={noop}
        onRememberLayoutChange={noop}
        onResetUiMemory={noop}
        onRunConfigurationChange={noop}
        onSaveBookSourcePolicy={asyncNoop}
        onSavePreparedSourcePolicy={asyncNoop}
        onSpeechPolicyOverridesChange={noop}
        onSpeechPolicyProfileChange={noop}
        onSubmit={noop}
        onTeleprompterSettingsChange={noop}
        onThemeChange={noop}
        onUpdateCustomSpeechPolicyProfile={asyncNoop}
      />,
    );

    expect(markup).toContain("Studio Settings");
    expect(markup).toContain("Quick settings");
    expect(markup).toContain("Run");
    expect(markup).toContain("Reader");
    expect(markup).toContain("Voices");
    expect(markup).toContain("Sources");
    expect(markup).toContain("Runtime");
    expect(markup).toContain("Diagnostics");
    expect(markup).toContain("Session");
    expect(markup).toContain("Project");
    expect(markup).toContain("Machine");
  });
});
