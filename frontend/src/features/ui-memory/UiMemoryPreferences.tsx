import { useState } from "react";
import { Button, Panel, StatusChip, Toggle, fieldControlClassName } from "../../design";
import type { UiMemoryPreferenceId, UiMemoryState } from "../preferences";
import {
  UI_MEMORY_PREFERENCE_META,
  UI_MEMORY_RESET_CONFIRMATION,
  UI_MEMORY_RESET_LABELS,
  type UiMemoryResetScope,
} from "./uiMemoryModel";

export interface UiMemoryImportApplyResult {
  readonly ok: boolean;
  readonly message: string;
}

export interface UiMemoryPreferencesProps {
  readonly uiMemory: UiMemoryState;
  readonly onExportPreferences: () => Promise<string> | string;
  readonly onImportPreferences: (
    json: string,
  ) => Promise<UiMemoryImportApplyResult> | UiMemoryImportApplyResult;
  readonly onPreferenceChange: (preferenceId: UiMemoryPreferenceId, enabled: boolean) => void;
  readonly onResetMemory: (scope: UiMemoryResetScope) => void;
}

export function UiMemoryPreferences({
  uiMemory,
  onExportPreferences,
  onImportPreferences,
  onPreferenceChange,
  onResetMemory,
}: Readonly<UiMemoryPreferencesProps>) {
  const [jsonText, setJsonText] = useState("");
  const [statusMessage, setStatusMessage] = useState(
    "Generated audio, model paths, secrets, and project content are never exported.",
  );

  const exportPreferences = async () => {
    try {
      const exported = await onExportPreferences();
      setJsonText(exported);
      setStatusMessage("Preferences JSON is ready. Sensitive project data was omitted.");
    } catch (caughtError) {
      setStatusMessage(
        caughtError instanceof Error ? caughtError.message : "Unable to export UI preferences.",
      );
    }
  };

  const importPreferences = async () => {
    const result = await onImportPreferences(jsonText);
    setStatusMessage(result.message);
  };

  const resetMemory = (scope: UiMemoryResetScope) => {
    if (!globalThis.confirm(UI_MEMORY_RESET_CONFIRMATION[scope])) {
      return;
    }
    onResetMemory(scope);
    setStatusMessage(`${UI_MEMORY_RESET_LABELS[scope]} complete.`);
  };

  return (
    <Panel className="grid gap-4 p-3" data-testid="ui-memory-preferences" variant="surface">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            UI memory
            <StatusChip tone="neutral">Machine-local</StatusChip>
          </h4>
          <p className="vs-muted mt-1 text-xs leading-5">
            Choose what this browser remembers and what is session-only.
          </p>
        </div>
        <StatusChip tone={uiMemory.rememberLayout ? "success" : "neutral"}>
          {uiMemory.rememberLayout ? "Layout remembered" : "Default layout"}
        </StatusChip>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {UI_MEMORY_PREFERENCE_META.map((preference) => (
          <Toggle
            checked={uiMemory[preference.id]}
            data-testid={preference.testId}
            detail={preference.detail}
            key={preference.id}
            label={preference.label}
            onChange={(checked) => {
              onPreferenceChange(preference.id, checked);
            }}
          />
        ))}
      </div>

      <div className="grid gap-3 border-t pt-3 vs-border">
        <div className="flex flex-wrap gap-2">
          <Button
            data-testid="ui-action-ui-memory-export-json"
            onClick={() => {
              void exportPreferences();
            }}
            size="sm"
            variant="secondary"
          >
            Export preferences JSON
          </Button>
          <Button
            data-testid="ui-action-ui-memory-import-json"
            onClick={() => {
              void importPreferences();
            }}
            size="sm"
            variant="secondary"
          >
            Import preferences JSON
          </Button>
        </div>
        <textarea
          aria-label="UI memory preferences JSON"
          className={`${fieldControlClassName} min-h-32 font-mono text-xs`}
          data-testid="ui-memory-json"
          onChange={(event) => {
            setJsonText(event.currentTarget.value);
          }}
          placeholder="Exported preferences JSON"
          spellCheck={false}
          value={jsonText}
        />
        <p aria-live="polite" className="text-xs leading-5 vs-muted">
          {statusMessage}
        </p>
      </div>

      <div className="grid gap-2 border-t pt-3 sm:grid-cols-3 vs-border">
        <Button
          data-confirm={UI_MEMORY_RESET_CONFIRMATION.workspace}
          data-testid="ui-action-ui-memory-reset-workspace"
          onClick={() => {
            resetMemory("workspace");
          }}
          size="sm"
          variant="secondary"
        >
          Reset workspace layout
        </Button>
        <Button
          data-confirm={UI_MEMORY_RESET_CONFIRMATION.reader}
          data-testid="ui-action-ui-memory-reset-reader"
          onClick={() => {
            resetMemory("reader");
          }}
          size="sm"
          variant="secondary"
        >
          Reset reader preferences
        </Button>
        <Button
          data-confirm={UI_MEMORY_RESET_CONFIRMATION.all}
          data-testid="ui-action-ui-memory-reset-all"
          onClick={() => {
            resetMemory("all");
          }}
          size="sm"
          variant="destructive"
        >
          Reset all UI memory
        </Button>
      </div>
    </Panel>
  );
}
