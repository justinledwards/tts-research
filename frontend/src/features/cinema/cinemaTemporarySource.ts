import type {
  BookSource,
  PlaybackProgress,
  PreparedSource,
  SourceOwner,
  TemporarySourceLifecycleState,
} from "../../types";
import type { SourceLifecycleEnvelope } from "../source-lifecycle";

export type CinemaTemporarySurface = "book" | "document" | "website";

export interface CinemaTemporarySourceContract {
  expiresAt?: string;
  expiryLabel: string;
  historyScope: "project" | "temporary-session";
  isTemporary: boolean;
  ownershipLabel: "Project" | "Temporary";
  provenanceLabel: string;
  sourceOwner: SourceOwner;
  statusLabel: string;
  surface: CinemaTemporarySurface;
  temporarySourceId?: string;
}

export function cinemaTemporarySourceContract({
  expiresAt,
  sourceOwner,
  status,
  surface,
  temporarySourceId,
}: {
  expiresAt?: string;
  sourceOwner?: SourceOwner;
  status?: TemporarySourceLifecycleState;
  surface: CinemaTemporarySurface;
  temporarySourceId?: string;
}): CinemaTemporarySourceContract {
  const isTemporary = sourceOwner === "temporary" || Boolean(temporarySourceId);
  return {
    expiresAt,
    expiryLabel: isTemporary ? expiryLabel(expiresAt) : "Durable project source",
    historyScope: isTemporary ? "temporary-session" : "project",
    isTemporary,
    ownershipLabel: isTemporary ? "Temporary" : "Project",
    provenanceLabel: isTemporary
      ? `Temporary ${surfaceLabel(surface).toLowerCase()} session`
      : "Project library source",
    sourceOwner: isTemporary ? "temporary" : "project",
    statusLabel: isTemporary ? temporaryStatusLabel(status) : "Project source",
    surface,
    temporarySourceId,
  };
}

export function cinemaContractFromPreparedSource(
  source: PreparedSource,
  surface: CinemaTemporarySurface,
): CinemaTemporarySourceContract {
  return cinemaTemporarySourceContract({
    expiresAt: source.metadata?.temporaryExpiresAt as string | undefined,
    sourceOwner: source.sourceOwner,
    status: source.metadata?.temporaryStatus as TemporarySourceLifecycleState | undefined,
    surface,
    temporarySourceId: source.temporarySourceId,
  });
}

export function cinemaContractFromBookSource(
  source: BookSource,
  surface: CinemaTemporarySurface = "book",
): CinemaTemporarySourceContract {
  return cinemaTemporarySourceContract({
    expiresAt: source.ingestion?.temporaryExpiresAt,
    sourceOwner: source.sourceOwner,
    status: source.ingestion?.temporaryStatus,
    surface,
    temporarySourceId: source.temporarySourceId,
  });
}

export function cinemaContractFromLifecycle(
  sourceLifecycle: SourceLifecycleEnvelope,
  surface: CinemaTemporarySurface,
): CinemaTemporarySourceContract {
  return cinemaTemporarySourceContract({
    expiresAt: sourceLifecycle.expiresAt,
    sourceOwner: sourceLifecycle.sourceOwner,
    status: sourceLifecycle.temporaryStatus,
    surface,
    temporarySourceId: sourceLifecycle.temporarySourceId,
  });
}

export function filterCinemaHistoryProgress(
  progressItems: PlaybackProgress[],
  contract: CinemaTemporarySourceContract,
): PlaybackProgress[] {
  if (!contract.isTemporary) {
    return progressItems.filter((progress) => !progress.temporarySourceId);
  }
  return progressItems.filter(
    (progress) =>
      progress.temporarySourceId === contract.temporarySourceId ||
      progress.readingPosition?.temporarySourceId === contract.temporarySourceId,
  );
}

function temporaryStatusLabel(status?: TemporarySourceLifecycleState): string {
  switch (status) {
    case "audio_ready": {
      return "Temporary source · audio ready";
    }
    case "discarded": {
      return "Temporary source discarded";
    }
    case "expired": {
      return "Temporary source expired";
    }
    case "failed": {
      return "Temporary source failed";
    }
    case "generating": {
      return "Temporary source · generating audio";
    }
    case "promoted": {
      return "Temporary source kept in project";
    }
    default: {
      return "Temporary source";
    }
  }
}

function expiryLabel(expiresAt?: string): string {
  if (!expiresAt) {
    return "Expires with this session";
  }
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return "Expires with this session";
  }
  return `Expires ${date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  })}`;
}

function surfaceLabel(surface: CinemaTemporarySurface): string {
  if (surface === "book") {
    return "Book Cinema";
  }
  if (surface === "website") {
    return "Website Cinema";
  }
  return "Document Cinema";
}
