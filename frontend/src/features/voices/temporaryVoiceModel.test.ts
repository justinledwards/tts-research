import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TemporarySourceSession, TTSEngineDiagnostics, VoiceProfile } from "../../types";
import {
  EMPTY_TEMPORARY_VOICE_STATE,
  buildTemporaryVoiceDashboardModel,
  canUseTemporaryMediaForVoiceCloning,
  confirmTemporaryVoiceCloneConsent,
  effectiveTemporaryVoiceSelection,
  loadTemporaryVoiceState,
  providerTemporaryVoiceSelection,
  recordTemporaryVoiceAudition,
  saveTemporaryVoiceState,
  savedProfileTemporaryVoiceSelection,
  selectTemporaryVoiceForSource,
} from "./temporaryVoiceModel";

describe("temporary voice model", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        clear: () => {
          values.clear();
        },
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => {
          values.delete(key);
        },
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
      },
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("keeps temporary voice choices session-scoped without mutating saved profiles", () => {
    const profile = voiceProfile();
    const state = selectTemporaryVoiceForSource(
      EMPTY_TEMPORARY_VOICE_STATE,
      "temp-1",
      savedProfileTemporaryVoiceSelection(profile, "2026-06-12T11:00:00.000Z"),
    );

    expect(effectiveTemporaryVoiceSelection(state, "temp-1")).toMatchObject({
      kind: "saved-profile",
      voiceProfileId: "profile-1",
    });
    expect(profile.status).toBe("ready");
    expect(Object.keys(profile.cloneArtifacts ?? {})).toHaveLength(0);
  });

  it("records audition history without creating voice assets or saved preferences", () => {
    const selected = providerTemporaryVoiceSelection(
      "af_heart",
      "Heart",
      "2026-06-12T11:00:00.000Z",
    );
    const selectedState = selectTemporaryVoiceForSource(
      EMPTY_TEMPORARY_VOICE_STATE,
      "temp-1",
      selected,
    );
    const state = recordTemporaryVoiceAudition(selectedState, {
      createdAt: "2026-06-12T11:01:00.000Z",
      id: "audition-1",
      result: "played",
      sample: "The quick brown fox.",
      selection: selected,
      temporarySourceId: "temp-1",
    });
    const model = buildTemporaryVoiceDashboardModel({
      activeTemporarySourceId: "temp-1",
      profiles: [voiceProfile()],
      state,
      temporarySources: [temporarySource()],
      ttsEngines: [ttsEngine()],
    });

    expect(model.auditionHistory).toHaveLength(1);
    expect(model.activeUsage[0]?.auditionCount).toBe(1);
    expect(model.activeUsage[0]?.currentSelection.kind).toBe("provider");
    expect(Object.keys(state.selectionsByTemporarySourceId)).toEqual(["temp-1"]);
  });

  it("requires explicit consent before temporary media can be used for cloning", () => {
    expect(canUseTemporaryMediaForVoiceCloning(EMPTY_TEMPORARY_VOICE_STATE, "temp-1")).toBe(false);

    const state = confirmTemporaryVoiceCloneConsent(EMPTY_TEMPORARY_VOICE_STATE, {
      confirmedAt: "2026-06-12T11:02:00.000Z",
      provenanceSummary: "Confirmed consent.",
      temporarySourceId: "temp-1",
    });

    expect(canUseTemporaryMediaForVoiceCloning(state, "temp-1")).toBe(true);
    expect(
      buildTemporaryVoiceDashboardModel({
        activeTemporarySourceId: "temp-1",
        profiles: [],
        state,
        temporarySources: [temporarySource()],
        ttsEngines: [ttsEngine()],
      }).cloneConsentRequired,
    ).toBe(false);
  });

  it("persists temporary state in session storage per project", () => {
    const state = selectTemporaryVoiceForSource(
      EMPTY_TEMPORARY_VOICE_STATE,
      "temp-1",
      providerTemporaryVoiceSelection("af_heart", "Heart"),
    );

    saveTemporaryVoiceState("alpha", state);

    expect(loadTemporaryVoiceState("alpha").selectionsByTemporarySourceId["temp-1"]).toMatchObject({
      kind: "provider",
      providerVoiceId: "af_heart",
    });
    expect(loadTemporaryVoiceState("beta").selectionsByTemporarySourceId).toEqual({});
  });
});

function voiceProfile(): VoiceProfile {
  return {
    audioFormat: "audio/wav",
    cloneArtifacts: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    durationMs: 1000,
    id: "profile-1",
    language: "en",
    name: "Narrator",
    referenceAudio: "reference.wav",
    referencePath: "/profiles/profile-1/reference.wav",
    referenceTrimmed: false,
    sourceBytes: 1024,
    sourceFile: "narrator.wav",
    status: "ready",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function temporarySource(): TemporarySourceSession {
  return {
    artifacts: [],
    createdAt: "2026-06-12T11:00:00.000Z",
    expiresAt: "2026-06-12T15:00:00.000Z",
    id: "temp-1",
    kind: "markdown",
    lastAccessedAt: "2026-06-12T11:00:00.000Z",
    promotionStatus: "notPromoted",
    sourceName: "Temporary article",
    sourceOwner: "temporary",
    scope: "temporary",
    status: "previewable",
    temporarySourceId: "temp-1",
    updatedAt: "2026-06-12T11:00:00.000Z",
    wordCount: 12,
  };
}

function ttsEngine(): TTSEngineDiagnostics {
  return {
    default: true,
    experimental: false,
    id: "kokoro",
    label: "Kokoro",
    local: true,
    status: "ready",
    supportsReference: true,
    supportsSSML: true,
    supportsSwedish: true,
    supportsVoice: true,
    capabilities: {
      abComparison: true,
      alignment: true,
      alignmentRequiredForWordHighlight: false,
      alignmentSupported: true,
      cancelJob: true,
      localOnly: true,
      mockTts: false,
      phonemeOverrides: true,
      phraseTiming: true,
      retryJob: true,
      ssml: true,
      ssmlMarks: true,
      streaming: false,
      tts: true,
      voiceCloning: true,
      voicePreview: true,
      wordTiming: true,
    },
  };
}
