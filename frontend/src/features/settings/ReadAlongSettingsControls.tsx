import { Button, Panel, Toggle, fieldControlClassName } from "../../design";
import {
  GOLDEN_MINUTE_HIGHLIGHT_PREVIEW_TEXT,
  HighlightRenderer,
  READ_ALONG_DEGRADED_SYNC_DISPLAY_OPTIONS,
  READ_ALONG_HIGHLIGHT_GRANULARITIES,
  READ_ALONG_HIGHLIGHT_STYLES,
  READ_ALONG_PREFERENCE_LABELS,
  READ_ALONG_PREFERENCE_SCOPES,
  READ_ALONG_SCROLL_FOLLOW_POLICIES,
  READ_ALONG_SYNC_STRICTNESS_OPTIONS,
  effectiveReadAlongPreferences,
  readAlongVisualModeFromPreferences,
  type ReadAlongDegradedSyncDisplay,
  type ReadAlongHighlightGranularity,
  type ReadAlongHighlightStyle,
  type ReadAlongPreferenceScope,
  type ReadAlongPreferences,
  type ReadAlongScrollFollow,
  type ReadAlongSyncStrictness,
} from "../readalong";
import type { ReaderAccessibilitySettings } from "../reader-accessibility";
import { ScopeBadge } from "./ScopeBadge";

const READ_ALONG_RESET_CALIBRATION_CONFIRMATION =
  "Reset read-along calibration offsets for this provider and the global highlight timing?";

export function ReadAlongSettingsControls({
  accessibilitySettings,
  preferences,
  providerId,
  onChange,
}: Readonly<{
  accessibilitySettings: ReaderAccessibilitySettings;
  preferences: ReadAlongPreferences;
  providerId: string;
  onChange: (preferences: ReadAlongPreferences) => void;
}>) {
  const effectivePreferences = effectiveReadAlongPreferences(preferences, accessibilitySettings);
  const activeProviderOffset = preferences.providerOffsetsMs[providerId] ?? 0;
  const previewMode = readAlongVisualModeFromPreferences(
    { confidence: 0.91, mode: "word", state: "synced-word" },
    effectivePreferences,
  );
  const update = (patch: Partial<ReadAlongPreferences>) => {
    onChange({ ...preferences, ...patch });
  };
  const updateSegmentBoundary = (
    key: keyof ReadAlongPreferences["segmentBoundary"],
    value: boolean,
  ) => {
    update({
      segmentBoundary: {
        ...preferences.segmentBoundary,
        [key]: value,
      },
    });
  };
  const updateProviderOffset = (value: number) => {
    onChange({
      ...preferences,
      providerOffsetsMs: {
        ...preferences.providerOffsetsMs,
        [providerId]: value,
      },
    });
  };
  const resetCalibration = () => {
    if (!globalThis.confirm(READ_ALONG_RESET_CALIBRATION_CONFIRMATION)) {
      return;
    }
    const providerOffsetsMs = Object.fromEntries(
      Object.entries(preferences.providerOffsetsMs).filter(([key]) => key !== providerId),
    );
    onChange({
      ...preferences,
      globalHighlightOffsetMs: 0,
      providerOffsetsMs,
    });
  };

  return (
    <Panel className="grid gap-4 p-3" data-testid="readalong-settings" variant="surface">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            Read-along settings
            <ScopeBadge scope={preferences.scope} />
          </h4>
          <p className="vs-muted mt-1 text-xs leading-5">
            Configure highlight behavior, follow motion, sync fallback, calibration, and degraded
            display before opening Debug.
          </p>
        </div>
        <span className="vs-muted text-xs">
          Effective style: {READ_ALONG_PREFERENCE_LABELS.style[effectivePreferences.highlightStyle]}
        </span>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">
          Preference scope
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {READ_ALONG_PREFERENCE_SCOPES.map((scope) => (
            <Button
              align="start"
              className="grid gap-1 p-3"
              data-testid={`ui-action-readalong-scope-${scope}`}
              data-ui-action-surface="Settings"
              key={scope}
              onClick={() => {
                update({ scope });
              }}
              selected={preferences.scope === scope}
              variant="mode"
            >
              <span className="font-semibold">{READ_ALONG_PREFERENCE_LABELS.scope[scope]}</span>
              <span className="vs-muted text-xs leading-5">{scopeDescription(scope)}</span>
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 md:grid-cols-2">
        <ReadAlongSelect<ReadAlongHighlightGranularity>
          label="Highlight granularity"
          options={READ_ALONG_HIGHLIGHT_GRANULARITIES}
          testId="ui-action-readalong-highlight-granularity"
          value={preferences.highlightGranularity}
          valueLabels={READ_ALONG_PREFERENCE_LABELS.granularity}
          onChange={(highlightGranularity) => {
            update({ highlightGranularity });
          }}
        />
        <ReadAlongSelect<ReadAlongHighlightStyle>
          label="Highlight style"
          options={READ_ALONG_HIGHLIGHT_STYLES}
          testId="ui-action-readalong-highlight-style"
          value={preferences.highlightStyle}
          valueLabels={READ_ALONG_PREFERENCE_LABELS.style}
          onChange={(highlightStyle) => {
            update({ highlightStyle });
          }}
        />
        <ReadAlongSelect<ReadAlongScrollFollow>
          label="Scroll follow"
          options={READ_ALONG_SCROLL_FOLLOW_POLICIES}
          testId="ui-action-readalong-scroll-follow"
          value={preferences.scrollFollow}
          valueLabels={READ_ALONG_PREFERENCE_LABELS.scrollFollow}
          onChange={(scrollFollow) => {
            update({ scrollFollow });
          }}
        />
        <ReadAlongSelect<ReadAlongSyncStrictness>
          label="Sync strictness"
          options={READ_ALONG_SYNC_STRICTNESS_OPTIONS}
          testId="ui-action-readalong-sync-strictness"
          value={preferences.syncStrictness}
          valueLabels={READ_ALONG_PREFERENCE_LABELS.syncStrictness}
          onChange={(syncStrictness) => {
            update({ syncStrictness });
          }}
        />
      </div>

      <Panel className="grid gap-3 p-3" variant="raised">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h5 className="text-sm font-semibold">Calibration</h5>
          <Button
            data-confirm={READ_ALONG_RESET_CALIBRATION_CONFIRMATION}
            data-testid="ui-action-readalong-reset-calibration"
            data-ui-action-surface="Settings"
            onClick={resetCalibration}
            size="sm"
            variant="secondary"
          >
            Reset calibration
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ReadAlongNumberInput
            label="Global highlight offset"
            testId="ui-action-readalong-global-offset"
            value={preferences.globalHighlightOffsetMs}
            onChange={(globalHighlightOffsetMs) => {
              update({ globalHighlightOffsetMs });
            }}
          />
          <ReadAlongNumberInput
            label={`Provider offset: ${providerId}`}
            testId="ui-action-readalong-provider-offset"
            value={activeProviderOffset}
            onChange={updateProviderOffset}
          />
        </div>
      </Panel>

      <Panel className="grid gap-3 p-3" variant="raised">
        <h5 className="text-sm font-semibold">Segment boundary behavior</h5>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle
            checked={preferences.segmentBoundary.flashSegment}
            data-testid="ui-action-readalong-segment-flash"
            data-ui-action-surface="Settings"
            label="Flash segment"
            onChange={(checked) => {
              updateSegmentBoundary("flashSegment", checked);
            }}
          />
          <Toggle
            checked={preferences.segmentBoundary.fadePreviousPhrase}
            data-testid="ui-action-readalong-segment-fade-previous"
            data-ui-action-surface="Settings"
            label="Fade previous phrase"
            onChange={(checked) => {
              updateSegmentBoundary("fadePreviousPhrase", checked);
            }}
          />
          <Toggle
            checked={preferences.segmentBoundary.pauseAtSegmentBoundary}
            data-testid="ui-action-readalong-segment-pause"
            data-ui-action-surface="Settings"
            label="Pause at segment boundary"
            onChange={(checked) => {
              updateSegmentBoundary("pauseAtSegmentBoundary", checked);
            }}
          />
          <Toggle
            checked={preferences.segmentBoundary.autoAdvance}
            data-testid="ui-action-readalong-segment-auto-advance"
            data-ui-action-surface="Settings"
            label="Auto-advance"
            onChange={(checked) => {
              updateSegmentBoundary("autoAdvance", checked);
            }}
          />
        </div>
      </Panel>

      <ReadAlongSelect<ReadAlongDegradedSyncDisplay>
        label="Degraded sync display"
        options={READ_ALONG_DEGRADED_SYNC_DISPLAY_OPTIONS}
        testId="ui-action-readalong-degraded-sync-display"
        value={preferences.degradedSyncDisplay}
        valueLabels={READ_ALONG_PREFERENCE_LABELS.degradedSyncDisplay}
        onChange={(degradedSyncDisplay) => {
          update({ degradedSyncDisplay });
        }}
      />

      <Panel className="grid gap-2 p-3" data-testid="readalong-highlight-preview" variant="raised">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h5 className="text-sm font-semibold">Golden-minute highlight preview</h5>
          <span className="vs-muted text-xs">
            {READ_ALONG_PREFERENCE_LABELS.granularity[preferences.highlightGranularity]} ·{" "}
            {READ_ALONG_PREFERENCE_LABELS.scrollFollow[effectivePreferences.scrollFollow]}
          </span>
        </div>
        <p className="rounded-md border bg-[var(--vs-surface)] p-3 text-lg leading-9 vs-border">
          <HighlightRenderer
            activeWordIndex={5}
            highlightStyle={effectivePreferences.highlightStyle}
            mode={previewMode}
            phraseWordEnd={9}
            phraseWordStart={3}
            surface="document"
            text={GOLDEN_MINUTE_HIGHLIGHT_PREVIEW_TEXT}
          />
        </p>
      </Panel>
    </Panel>
  );
}

function ReadAlongSelect<T extends string>({
  label,
  options,
  testId,
  value,
  valueLabels,
  onChange,
}: Readonly<{
  label: string;
  options: readonly T[];
  testId: string;
  value: T;
  valueLabels: Record<T, string>;
  onChange: (value: T) => void;
}>) {
  return (
    <label className="grid gap-1 text-xs font-semibold">
      <span>{label}</span>
      <select
        className={`${fieldControlClassName} h-11`}
        data-testid={testId}
        data-ui-action-surface="Settings"
        onChange={(event) => {
          onChange(event.currentTarget.value as T);
        }}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {valueLabels[option]}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReadAlongNumberInput({
  label,
  testId,
  value,
  onChange,
}: Readonly<{
  label: string;
  testId: string;
  value: number;
  onChange: (value: number) => void;
}>) {
  return (
    <label className="grid gap-1 text-xs font-semibold">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <input
          className={`${fieldControlClassName} h-11`}
          data-testid={testId}
          data-ui-action-surface="Settings"
          max={2000}
          min={-2000}
          onChange={(event) => {
            onChange(Number(event.currentTarget.value));
          }}
          step={25}
          type="number"
          value={value}
        />
        <span className="vs-muted shrink-0">ms</span>
      </span>
    </label>
  );
}

function scopeDescription(scope: ReadAlongPreferenceScope): string {
  if (scope === "machine") {
    return "Persists on this browser when reader memory is enabled.";
  }
  if (scope === "project") {
    return "Persists for the current project when reader memory is enabled.";
  }
  return "Applies until this page session ends.";
}
