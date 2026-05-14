export type JobStatus =
  | "queued"
  | "optimizing"
  | "synthesizing"
  | "checking"
  | "retrying"
  | "completed"
  | "failed";

export type StageStatus = "waiting" | "running" | "done" | "failed";

export interface CreateVoiceJobRequest {
  text: string;
  voiceId?: string;
}

export type VoiceKind = "native" | "clone";

export interface Voice {
  id: string;
  name: string;
  kind: VoiceKind;
  provider: string;
  langCode: string;
  referenceAudioUrl?: string;
  referenceAudioPath?: string;
  sourceFilename?: string;
  createdAt: string;
}

export interface RetryMetadata {
  maxRetries: number;
  attempts: number;
  segmentAttempts: number;
  currentSegment: number;
  totalSegments: number;
  completedSegments: number;
  workerCount: number;
}

export interface PipelineStages {
  optimization: StageStatus;
  synthesis: StageStatus;
  checker: StageStatus;
}

export interface VoiceCheck {
  complete: boolean;
  transcript: string;
  resumeText?: string;
  needsResume: boolean;
  reason: string;
  provider: string;
  similarity: number;
}

export interface JobProgress {
  message: string;
  detail: string;
  activeStage: string;
  currentSegment?: number;
  totalSegments?: number;
  startedAt?: string;
}

export interface VoiceJob {
  id: string;
  status: JobStatus;
  stages: PipelineStages;
  inputText: string;
  optimizedText: string;
  optimizer: string;
  audioUrl: string;
  audioPath?: string;
  contentType: string;
  durationMs: number;
  provider: string;
  voiceId: string;
  voice: string;
  retries: RetryMetadata;
  voiceCheck: VoiceCheck;
  progress: JobProgress;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
