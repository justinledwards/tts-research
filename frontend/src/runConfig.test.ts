import { describe, expect, it } from "vitest";
import {
  applyKokoroRenderMode,
  applySpeechPolicyToCreateVoiceJobRequest,
  buildCreateVoiceJobRequest,
  createRunConfiguration,
  kokoroEngineFamilyValue,
  kokoroRenderModeForConfiguration,
  normalizeRunConfiguration,
  resolveRunPrimaryLabel,
} from "./runConfig";
import type { VoiceJob } from "./types";

describe("run configuration helpers", () => {
  it("builds explicit presets for draft preview and checked master", () => {
    const draft = createRunConfiguration("draftPreview");
    expect(draft.runMode).toBe("draftPreview");
    expect(draft.options.asrCheck).toBe(false);
    expect(draft.options.autoRetry).toBe(false);
    expect(draft.options.voiceClone).toBe(false);
    expect(draft.ttsEngine).toBe("auto");
    expect(resolveRunPrimaryLabel(draft, null)).toBe("Create & Listen");

    const checked = createRunConfiguration("checkedMaster");
    expect(checked.options.asrCheck).toBe(true);
    expect(checked.options.autoRetry).toBe(true);
    expect(checked.options.voiceClone).toBe(true);
    expect(resolveRunPrimaryLabel(checked, null)).toBe("Create & Listen");
  });

  it("normalizes stored partial configuration and engine choice against the preset", () => {
    const config = normalizeRunConfiguration({
      runMode: "fastCreate",
      performanceMode: "quality",
      ttsEngine: "supertonic-3",
      engineOptions: {
        lang: "sv",
      },
      options: {
        textPreprocess: false,
      },
    });

    expect(config.runMode).toBe("fastCreate");
    expect(config.performanceMode).toBe("quality");
    expect(config.ttsEngine).toBe("supertonic-3");
    expect(config.engineOptions.lang).toBe("sv");
    expect(config.options.textPreprocess).toBe(false);
    expect(config.options.asrCheck).toBe(false);
    expect(config.options.qualityReport).toBe(true);
  });

  it("uses create again once a job is completed", () => {
    const config = createRunConfiguration("publishMaster");
    expect(resolveRunPrimaryLabel(config, { status: "completed" } as VoiceJob)).toBe(
      "Create Again",
    );
  });

  it("builds job payloads with compatibility adaptive mode and optional voice clone", () => {
    const fast = createRunConfiguration("fastCreate");
    const fastRequest = buildCreateVoiceJobRequest(
      "Hello",
      fast,
      "profile-1",
      "project-1",
      "bf_emma",
      "b",
    );
    expect(fastRequest.projectId).toBe("project-1");
    expect(fastRequest.adaptiveMode).toBe(true);
    expect(fastRequest.voiceProfileId).toBe("profile-1");
    expect(fastRequest.ttsEngine).toBe("auto");
    expect(fastRequest.ttsVoice).toBe("bf_emma");
    expect(fastRequest.ttsLanguage).toBe("b");
    expect(fastRequest.pipelineOptions?.asrCheck).toBe(false);

    const draft = createRunConfiguration("draftPreview");
    const draftRequest = buildCreateVoiceJobRequest("Hello", draft, "profile-1");
    expect(draftRequest.voiceProfileId).toBeUndefined();
    expect(draftRequest.pipelineOptions?.voiceClone).toBe(false);
  });

  it("normalizes speech policy fields for create job request parity", () => {
    const request = buildCreateVoiceJobRequest("Hello", createRunConfiguration("draftPreview"), "");
    const withPolicy = applySpeechPolicyToCreateVoiceJobRequest(request, {
      speechPolicyOverrides: { footnoteMode: "skip" },
      speechPolicyProfile: " Enterprise ",
    });

    expect(request.speechPolicyProfile).toBeUndefined();
    expect(request.speechPolicyOverrides).toBeUndefined();
    expect(withPolicy.speechPolicyProfile).toBe("Enterprise");
    expect(withPolicy.speechPolicyOverrides).toEqual({ footnoteMode: "skip" });

    const cleared = applySpeechPolicyToCreateVoiceJobRequest(withPolicy, {
      speechPolicyOverrides: {},
    });
    expect(cleared.speechPolicyProfile).toBeUndefined();
    expect(cleared.speechPolicyOverrides).toBeUndefined();

    const defaulted = applySpeechPolicyToCreateVoiceJobRequest(request, {
      speechPolicyProfile: "",
    });
    expect(defaulted.speechPolicyProfile).toBe("Enterprise");
  });

  it("maps Kokoro render modes to engine ids and clone intent", () => {
    const base = createRunConfiguration("checkedMaster");

    const voicepack = applyKokoroRenderMode(base, "voicepack");
    expect(voicepack.ttsEngine).toBe("kokoro");
    expect(voicepack.options.voiceClone).toBe(false);
    expect(kokoroRenderModeForConfiguration(voicepack)).toBe("voicepack");

    const clone = applyKokoroRenderMode(base, "kokoclone");
    expect(clone.ttsEngine).toBe("kokoro-clone");
    expect(clone.options.voiceClone).toBe(true);
    expect(kokoroRenderModeForConfiguration(clone)).toBe("kokoclone");

    const embed = applyKokoroRenderMode(base, "kokoro-embed");
    expect(embed.ttsEngine).toBe("kokoro-embed");
    expect(embed.options.voiceClone).toBe(true);
    expect(kokoroRenderModeForConfiguration(embed)).toBe("kokoro-embed");
    expect(kokoroEngineFamilyValue(embed.ttsEngine)).toBe("kokoro");
  });
});
