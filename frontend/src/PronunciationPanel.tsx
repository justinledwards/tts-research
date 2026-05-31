import { useEffect, useMemo, useRef, useState } from "react";
import {
  apiBaseUrl,
  deleteProjectLexiconEntry,
  deleteVoiceProfileLexiconEntry,
  getProjectLexicon,
  getVoiceProfileLexicon,
  importProjectLexicon,
  importVoiceProfileLexicon,
  upsertProjectLexiconEntry,
  upsertVoiceProfileLexiconEntry,
} from "./api";
import type {
  LexiconEntry,
  LexiconScope,
  LexiconUpsertRequest,
  PreparedSource,
  PronunciationLexicon,
} from "./types";

const EMPTY_LEXICON: PronunciationLexicon = {
  entries: [],
  ownerId: "",
  scope: "project",
  updatedAt: "",
  version: "lexicon.v1",
};

export function PronunciationPanel({
  projectId,
  source,
  voiceProfileId,
}: Readonly<{
  projectId: string;
  source: PreparedSource | null;
  voiceProfileId: string;
}>) {
  const [scope, setScope] = useState<LexiconScope>("project");
  const [projectLexicon, setProjectLexicon] = useState<PronunciationLexicon>(EMPTY_LEXICON);
  const [profileLexicon, setProfileLexicon] = useState<PronunciationLexicon>(EMPTY_LEXICON);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [replacement, setReplacement] = useState("");
  const [lang, setLang] = useState("");
  const [isProtected, setIsProtected] = useState(true);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void getProjectLexicon(projectId)
      .then((lexicon) => {
        if (!cancelled) {
          setProjectLexicon(lexicon);
        }
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) {
          setError(formatPanelError(caughtError, "Unable to load project lexicon"));
        }
      });
    if (voiceProfileId) {
      void getVoiceProfileLexicon(voiceProfileId)
        .then((lexicon) => {
          if (!cancelled) {
            setProfileLexicon(lexicon);
          }
        })
        .catch((caughtError: unknown) => {
          if (!cancelled) {
            setError(formatPanelError(caughtError, "Unable to load voice profile lexicon"));
          }
        });
    } else {
      setProfileLexicon(EMPTY_LEXICON);
    }
    return () => {
      cancelled = true;
    };
  }, [projectId, voiceProfileId]);

  const activeLexicon = scope === "voiceProfile" ? profileLexicon : projectLexicon;
  const decisions = useMemo(() => pronunciationDecisions(source), [source]);
  const canUseProfile = voiceProfileId.trim().length > 0;

  const refreshScope = (nextLexicon: PronunciationLexicon) => {
    if (nextLexicon.scope === "voiceProfile") {
      setProfileLexicon(nextLexicon);
    } else {
      setProjectLexicon(nextLexicon);
    }
  };

  const submitEntry = async () => {
    const request: LexiconUpsertRequest = {
      id: editingEntryId ?? undefined,
      lang,
      protected: isProtected,
      replacement,
      term,
    };
    try {
      const next =
        scope === "voiceProfile"
          ? await upsertVoiceProfileLexiconEntry(voiceProfileId, request)
          : await upsertProjectLexiconEntry(projectId, request);
      refreshScope(next);
      setTerm("");
      setReplacement("");
      setLang("");
      setEditingEntryId(null);
      setError(null);
    } catch (caughtError) {
      setError(formatPanelError(caughtError, "Unable to save pronunciation"));
    }
  };

  const deleteEntry = async (entry: LexiconEntry) => {
    try {
      const next =
        entry.scope === "voiceProfile"
          ? await deleteVoiceProfileLexiconEntry(voiceProfileId, entry.id)
          : await deleteProjectLexiconEntry(projectId, entry.id);
      refreshScope(next);
      setError(null);
    } catch (caughtError) {
      setError(formatPanelError(caughtError, "Unable to delete pronunciation"));
    }
  };

  const editEntry = (entry: LexiconEntry) => {
    setScope(entry.scope);
    setEditingEntryId(entry.id);
    setTerm(entry.term);
    setReplacement(entry.replacement ?? entry.phoneme ?? "");
    setLang(entry.lang ?? "");
    setIsProtected(entry.protected ?? false);
  };

  const resetForm = () => {
    setEditingEntryId(null);
    setTerm("");
    setReplacement("");
    setLang("");
    setIsProtected(true);
  };

  const importFile = async (file: File | null | undefined) => {
    if (!file) {
      return;
    }
    try {
      const next =
        scope === "voiceProfile"
          ? await importVoiceProfileLexicon(voiceProfileId, file)
          : await importProjectLexicon(projectId, file);
      refreshScope(next);
      setError(null);
    } catch (caughtError) {
      setError(formatPanelError(caughtError, "Unable to import PLS lexicon"));
    }
  };

  return (
    <div className="grid gap-4 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex overflow-hidden rounded-md border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-primary)]">
          <ScopeButton
            active={scope === "project"}
            label="Project"
            onClick={() => {
              setScope("project");
              resetForm();
            }}
          />
          <ScopeButton
            active={scope === "voiceProfile"}
            disabled={!canUseProfile}
            label="Voice Profile"
            onClick={() => {
              setScope("voiceProfile");
              resetForm();
            }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="h-9 rounded-md border border-[var(--vs-border-subtle)] px-3 text-xs font-semibold text-[var(--vs-text-secondary)] hover:border-[var(--vs-selected-border)]"
            onClick={() => {
              fileInputRef.current?.click();
            }}
            type="button"
          >
            Import PLS
          </button>
          <a
            className="inline-flex h-9 items-center rounded-md border border-[var(--vs-border-subtle)] px-3 text-xs font-semibold text-[var(--vs-text-secondary)] hover:border-[var(--vs-selected-border)]"
            href={lexiconExportUrl(scope, projectId, voiceProfileId)}
          >
            Export PLS
          </a>
          <input
            accept=".pls,application/pls+xml,text/xml,application/xml"
            className="sr-only"
            ref={fileInputRef}
            type="file"
            onChange={(event) => {
              void importFile(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-[var(--vs-status-danger-border)] bg-[var(--vs-status-danger-bg)] p-3 text-xs text-[var(--vs-status-danger)]">
          {error}
        </p>
      ) : null}

      <div className="grid gap-2 rounded-md border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-secondary)] p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_auto] md:items-end">
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--vs-text-muted)]">
          Term
          <input
            className="h-9 rounded-md border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-primary)] px-3 text-sm font-medium normal-case tracking-normal text-[var(--vs-text-primary)]"
            onChange={(event) => {
              setTerm(event.currentTarget.value);
            }}
            value={term}
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--vs-text-muted)]">
          Spoken As
          <input
            className="h-9 rounded-md border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-primary)] px-3 text-sm font-medium normal-case tracking-normal text-[var(--vs-text-primary)]"
            onChange={(event) => {
              setReplacement(event.currentTarget.value);
            }}
            value={replacement}
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--vs-text-muted)]">
          Lang
          <input
            className="h-9 rounded-md border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-primary)] px-3 text-sm font-medium normal-case tracking-normal text-[var(--vs-text-primary)]"
            onChange={(event) => {
              setLang(event.currentTarget.value);
            }}
            placeholder="en"
            value={lang}
          />
        </label>
        <label className="flex h-9 items-center gap-2 text-xs font-semibold text-[var(--vs-text-secondary)]">
          <input
            checked={isProtected}
            className="h-4 w-4 accent-orange-500"
            onChange={(event) => {
              setIsProtected(event.currentTarget.checked);
            }}
            type="checkbox"
          />
          Protected
        </label>
        <button
          className="h-9 rounded-md bg-[var(--vs-action-primary-hover)] px-3 text-xs font-semibold text-[var(--vs-action-primary-text)] disabled:opacity-50 md:col-start-4"
          disabled={
            !term.trim() || !replacement.trim() || (scope === "voiceProfile" && !canUseProfile)
          }
          onClick={() => {
            void submitEntry();
          }}
          type="button"
        >
          {editingEntryId ? "Update" : "Add"}
        </button>
        {editingEntryId ? (
          <button
            className="h-9 rounded-md border border-[var(--vs-border-subtle)] px-3 text-xs font-semibold text-[var(--vs-text-secondary)] md:col-start-3"
            onClick={resetForm}
            type="button"
          >
            Cancel
          </button>
        ) : null}
      </div>

      <div className="grid gap-2">
        {activeLexicon.entries.map((entry) => (
          <div
            className="grid gap-2 rounded-md border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-primary)] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            key={entry.id}
          >
            <div className="min-w-0">
              <p className="truncate font-semibold text-[var(--vs-text-primary)]">
                {entry.term} → {entry.replacement ?? entry.phoneme}
              </p>
              <p className="mt-1 text-xs text-[var(--vs-text-muted)]">
                {entry.scope === "voiceProfile" ? "Voice profile" : "Project"}
                {entry.lang ? ` · ${entry.lang}` : ""}
                {entry.protected ? " · protected" : ""}
              </p>
            </div>
            <div className="flex gap-2 sm:justify-end">
              <button
                className="h-8 rounded-md border border-[var(--vs-border-subtle)] px-3 text-xs font-semibold text-[var(--vs-text-secondary)] hover:border-[var(--vs-selected-border)] hover:text-[var(--vs-selected-text)]"
                onClick={() => {
                  editEntry(entry);
                }}
                type="button"
              >
                Edit
              </button>
              <button
                className="h-8 rounded-md border border-[var(--vs-border-subtle)] px-3 text-xs font-semibold text-[var(--vs-text-secondary)] hover:border-[var(--vs-status-danger-border)] hover:text-[var(--vs-status-danger)]"
                onClick={() => {
                  void deleteEntry(entry);
                }}
                type="button"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {activeLexicon.entries.length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--vs-border-subtle)] bg-[var(--vs-surface-primary)] p-4 text-sm text-[var(--vs-text-muted)]">
            No pronunciations in this scope yet.
          </p>
        ) : null}
      </div>

      {decisions.length > 0 ? (
        <div className="grid gap-2 border-t border-[var(--vs-border-subtle)] pt-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--vs-text-muted)]">
            Applied in preview
          </p>
          <div className="flex flex-wrap gap-2">
            {decisions.slice(0, 10).map((decision) => (
              <span
                className="rounded-full border border-[var(--vs-status-info-border)] bg-[var(--vs-status-info-bg)] px-2 py-1 text-xs font-semibold text-[var(--vs-status-info)]"
                key={`${decision.entryId ?? decision.originalText}-${decision.startOffset.toString()}`}
              >
                {decision.originalText} → {decision.spoken}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ScopeButton({
  active,
  disabled = false,
  label,
  onClick,
}: Readonly<{ active: boolean; disabled?: boolean; label: string; onClick: () => void }>) {
  return (
    <button
      className={`h-9 px-3 text-xs font-semibold transition ${active ? "bg-[var(--vs-theatre-bg)] text-[var(--vs-action-primary-text)]" : "text-[var(--vs-text-secondary)] hover:bg-[var(--vs-action-secondary-hover)]"} disabled:opacity-40`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function pronunciationDecisions(source: PreparedSource | null) {
  return (source?.blocks ?? []).flatMap((block) => block.pronunciations ?? []);
}

function lexiconExportUrl(scope: LexiconScope, projectId: string, voiceProfileId: string): string {
  if (scope === "voiceProfile" && voiceProfileId) {
    return `${apiBaseUrl}/api/voice-profiles/${encodeURIComponent(voiceProfileId)}/lexicon/export.pls`;
  }
  return `${apiBaseUrl}/api/projects/${encodeURIComponent(projectId)}/lexicon/export.pls`;
}

function formatPanelError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
