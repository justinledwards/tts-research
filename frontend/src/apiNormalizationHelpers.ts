import type {
  PreparedSource,
  TranscriptMetadata,
  VoiceProfileCandidate,
  VoiceProfileSource,
} from "./types";

interface TranscriptCapable {
  transcriptMetadata?: TranscriptMetadata | null;
  transcript?: string;
  transcriptGeneratedAt?: string;
  transcriptModel?: string;
  transcriptError?: string;
  transcriptConfidence?: number;
}

export function normalizePreparedSource(source: PreparedSource): PreparedSource {
  return normalizeTranscriptFields(source);
}

export function normalizeVoiceProfileCandidate(
  candidate: VoiceProfileCandidate,
): VoiceProfileCandidate {
  return normalizeTranscriptFields(candidate);
}

export function normalizeVoiceProfileSource(source: VoiceProfileSource): VoiceProfileSource {
  const nullableSource = source as VoiceProfileSource & {
    candidates?: VoiceProfileSource["candidates"] | null;
    stages?: VoiceProfileSource["stages"] | null;
  };
  const normalized = normalizeTranscriptFields(source);

  return {
    ...normalized,
    candidates: Array.isArray(nullableSource.candidates)
      ? nullableSource.candidates.map((candidate) => normalizeVoiceProfileCandidate(candidate))
      : [],
    stages: Array.isArray(nullableSource.stages) ? nullableSource.stages : [],
  };
}

function normalizeTranscriptFields<T extends TranscriptCapable>(item: T): T {
  const metadata = item.transcriptMetadata ?? undefined;
  const transcript = item.transcript ?? metadata?.text;
  const transcriptGeneratedAt = item.transcriptGeneratedAt ?? metadata?.generatedAt;
  const transcriptModel = item.transcriptModel ?? metadata?.model ?? metadata?.provider;
  const transcriptError = item.transcriptError ?? metadata?.error;
  const transcriptConfidence = item.transcriptConfidence ?? metadata?.confidence;
  const transcriptMetadata =
    metadata ??
    (transcript || transcriptGeneratedAt || transcriptModel || transcriptError
      ? {
          text: transcript,
          generatedAt: transcriptGeneratedAt,
          model: transcriptModel,
          confidence: transcriptConfidence,
          error: transcriptError,
        }
      : undefined);

  return {
    ...item,
    ...(transcriptMetadata ? { transcriptMetadata } : {}),
    ...(transcript ? { transcript } : {}),
    ...(transcriptGeneratedAt ? { transcriptGeneratedAt } : {}),
    ...(transcriptModel ? { transcriptModel } : {}),
    ...(transcriptError ? { transcriptError } : {}),
    ...(typeof transcriptConfidence === "number" ? { transcriptConfidence } : {}),
  };
}
