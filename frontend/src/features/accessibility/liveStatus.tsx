import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type LiveStatusPriority = "polite" | "assertive";

export interface LiveStatusRecord {
  message: string;
  priority: LiveStatusPriority;
  timestampMs: number;
}

export interface LiveStatusApi {
  announce: (message: string, priority?: LiveStatusPriority) => void;
  announceAssertive: (message: string) => void;
  announcePolite: (message: string) => void;
}

export type LiveStatusSyncState =
  | "synced-word"
  | "synced-phrase"
  | "resyncing"
  | "degraded"
  | "paused"
  | "seeking"
  | "stale-audio";

export const LIVE_STATUS_DEDUPE_WINDOW_MS = 1200;

const LiveStatusContext = createContext<LiveStatusApi>({
  announce: () => {
    return;
  },
  announceAssertive: () => {
    return;
  },
  announcePolite: () => {
    return;
  },
});

export const liveStatusMessages = {
  audioGenerationCompleted: () => "Audio generation completed.",
  audioGenerationFailed: () => "Generation failed.",
  audioGenerationStarted: () => "Audio generation started.",
  bookmarkSaved: () => "Bookmark saved.",
  cueChanged: (cueLabel: string) => `Cue changed to ${cueLabel}.`,
  settingsReset: (scope: string) => `${scope} settings reset.`,
  sourceExtractionCompleted: () => "Source extraction completed.",
  sourceExtractionFailed: () => "Source extraction failed.",
  sourceExtractionStarted: () => "Source extraction started.",
  syncDegraded: (surface: string, reason?: string | null) =>
    reason?.trim()
      ? `Read-along sync degraded in ${surface}. ${reason.trim()}`
      : `Read-along sync degraded in ${surface}.`,
  syncRestored: (surface: string) => `Read-along sync restored in ${surface}.`,
  telepromptTheatreEntered: () => "Teleprompt Theatre entered.",
  telepromptTheatreExited: () => "Teleprompt Theatre exited.",
} as const;

export function LiveStatusProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [politeMessage, setPoliteMessage] = useState("");
  const [assertiveMessage, setAssertiveMessage] = useState("");
  const previousRecordRef = useRef<LiveStatusRecord | null>(null);

  const announce = useCallback((message: string, priority: LiveStatusPriority = "polite") => {
    const normalizedMessage = normalizeLiveStatusMessage(message);
    if (!normalizedMessage) {
      return;
    }
    const timestampMs = Date.now();
    if (
      shouldSuppressLiveStatusAnnouncement(
        previousRecordRef.current,
        { message: normalizedMessage, priority, timestampMs },
        LIVE_STATUS_DEDUPE_WINDOW_MS,
      )
    ) {
      return;
    }
    previousRecordRef.current = { message: normalizedMessage, priority, timestampMs };
    if (priority === "assertive") {
      setAssertiveMessage(normalizedMessage);
      return;
    }
    setPoliteMessage(normalizedMessage);
  }, []);

  const api = useMemo<LiveStatusApi>(
    () => ({
      announce,
      announceAssertive: (message: string) => {
        announce(message, "assertive");
      },
      announcePolite: (message: string) => {
        announce(message, "polite");
      },
    }),
    [announce],
  );

  return (
    <LiveStatusContext.Provider value={api}>
      {children}
      <LiveStatusRegions assertiveMessage={assertiveMessage} politeMessage={politeMessage} />
    </LiveStatusContext.Provider>
  );
}

export function LiveStatusRegions({
  assertiveMessage,
  politeMessage,
}: Readonly<{ assertiveMessage: string; politeMessage: string }>) {
  return (
    <>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="sr-only"
        data-live-status-channel="polite"
        data-testid="live-status-polite"
        role="status"
      >
        {politeMessage}
      </div>
      <div
        aria-atomic="true"
        aria-live="assertive"
        className="sr-only"
        data-live-status-channel="assertive"
        data-testid="live-status-assertive"
        role="alert"
      >
        {assertiveMessage}
      </div>
    </>
  );
}

export function useLiveStatus(): LiveStatusApi {
  return useContext(LiveStatusContext);
}

export function useReadAlongLiveStatus({
  reason,
  state,
  surface,
}: Readonly<{
  reason?: string | null;
  state: LiveStatusSyncState | null | undefined;
  surface: string;
}>) {
  const { announcePolite } = useLiveStatus();
  const previousStateRef = useRef<LiveStatusSyncState | null>(null);

  useEffect(() => {
    if (!state) {
      return;
    }
    const previousState = previousStateRef.current;
    previousStateRef.current = state;
    if (isDegradedSyncState(state) && !isDegradedSyncState(previousState)) {
      announcePolite(liveStatusMessages.syncDegraded(surface, reason));
      return;
    }
    if (isSyncedState(state) && isDegradedSyncState(previousState)) {
      announcePolite(liveStatusMessages.syncRestored(surface));
    }
  }, [announcePolite, reason, state, surface]);
}

export function shouldSuppressLiveStatusAnnouncement(
  previous: LiveStatusRecord | null,
  next: LiveStatusRecord,
  dedupeWindowMs = LIVE_STATUS_DEDUPE_WINDOW_MS,
): boolean {
  return (
    previous?.message === next.message &&
    previous.priority === next.priority &&
    next.timestampMs - previous.timestampMs < dedupeWindowMs
  );
}

function normalizeLiveStatusMessage(message: string): string {
  return message.replaceAll(/\s+/g, " ").trim();
}

function isDegradedSyncState(state: LiveStatusSyncState | null): boolean {
  return state === "degraded" || state === "stale-audio";
}

function isSyncedState(state: LiveStatusSyncState | null): boolean {
  return state === "synced-word" || state === "synced-phrase";
}
