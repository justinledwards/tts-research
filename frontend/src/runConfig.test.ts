import { describe, expect, it } from "vitest";
import {
  buildCreateVoiceJobRequest,
  createRunConfiguration,
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
    expect(resolveRunPrimaryLabel(draft, null)).toBe("Create Preview");

    const checked = createRunConfiguration("checkedMaster");
    expect(checked.options.asrCheck).toBe(true);
    expect(checked.options.autoRetry).toBe(true);
    expect(checked.options.voiceClone).toBe(true);
    expect(resolveRunPrimaryLabel(checked, null)).toBe("Create Checked Audio");
  });

  it("normalizes stored partial configuration against the preset", () => {
    const config = normalizeRunConfiguration({
      runMode: "fastCreate",
      performanceMode: "quality",
      options: {
        textPreprocess: false,
      },
    });

    expect(config.runMode).toBe("fastCreate");
    expect(config.performanceMode).toBe("quality");
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
    const fastRequest = buildCreateVoiceJobRequest("Hello", fast, "profile-1");
    expect(fastRequest.adaptiveMode).toBe(true);
    expect(fastRequest.voiceProfileId).toBe("profile-1");
    expect(fastRequest.pipelineOptions?.asrCheck).toBe(false);

    const draft = createRunConfiguration("draftPreview");
    const draftRequest = buildCreateVoiceJobRequest("Hello", draft, "profile-1");
    expect(draftRequest.voiceProfileId).toBeUndefined();
    expect(draftRequest.pipelineOptions?.voiceClone).toBe(false);
  });
});
