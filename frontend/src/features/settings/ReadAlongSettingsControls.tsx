import { Button, Panel, Toggle, fieldControlClassName } from "../../design";
import {
  GOLDEN_MINUTE_HIGHLIGHT_PREVIEW_TEXT,
  HighlightRenderer,
  READ_ALONG_DEGRADED_SYNC_DISPLAY_OPTIONS,
  READ_ALONG_HIGHLIGHT_GRANULARITIES,
  READ_ALONG_HIGHLIGHT_MOTIONS,
  READ_ALONG_HIGHLIGHT_PRESET_IDS,
  READ_ALONG_HIGHLIGHT_STYLES,
  READ_ALONG_PREFERENCE_LABELS,
  READ_ALONG_PREFERENCE_SCOPES,
  READ_ALONG_SCROLL_FOLLOW_POLICIES,
  READ_ALONG_SYNC_STRICTNESS_OPTIONS,
  applyReadAlongHighlightPreset,
  effectiveReadAlongPreferences,
  readAlongHighlightPreset,
  readAlongHighlightPresetMatches,
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
import {
  providerCapabilityDataAttributes,
  providerCapabilityGate,
  type ProviderRuntimeCapabilities,
} from "../provider-capabilities";
import { ScopeBadge } from "./ScopeBadge";

const READ_ALONG_RESET_CALIBRATION_CONFIRMATION =
  "Reset read-along calibration offsets for this provider and the global highlight timing?";

export function ReadAlongSettingsControls({
  accessibilitySettings,
  preferences,
  providerId,
  providerRuntime,
  onChange,
}: Readonly<{
  accessibilitySettings: ReaderAccessibilitySettings;
  preferences: ReadAlongPreferences;
  providerId: string;
  providerRuntime: ProviderRuntimeCapabilities;
  onChange: (preferences: ReadAlongPreferences) => void;
}>) {
  const wordTimingGate = providerCapabilityGate(providerRuntime, "wordTiming");
  const phraseTimingGate = providerCapabilityGate(providerRuntime, "phraseTiming");
  const wordTimingDisabledReason = wordTimingGate.disabled ? wordTimingGate.reason : undefined;
  const phraseTimingDisabledReason = phraseTimingGate.disabled
    ? phraseTimingGate.reason
    : undefined;
  const displayPreferences = normalizeProviderLimitedReadAlongPreferences(preferences, {
    phraseTimingDisabled: Boolean(phraseTimingDisabledReason),
    wordTimingDisabled: Boolean(wordTimingDisabledReason),
  });
  const effectivePreferences = effectiveReadAlongPreferences(
    displayPreferences,
    accessibilitySettings,
  );
  const activeProviderOffset = preferences.providerOffsetsMs[providerId] ?? 0;
  const previewMode = readAlongVisualModeFromPreferences(
    readAlongPreviewSnapshot(providerRuntime),
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

      <fieldset className="grid gap-2">
        <legend className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">
          Highlight preset
        </legend>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {READ_ALONG_HIGHLIGHT_PRESET_IDS.map((id) => {
            const preset = readAlongHighlightPreset(id);
            return (
              <Button
                align="start"
                className="grid gap-1 p-3"
                data-testid={`ui-action-readalong-highlight-preset-${id}`}
                data-ui-action-surface="Settings"
                key={id}
                onClick={() => {
                  onChange(applyReadAlongHighlightPreset(id, preferences));
                }}
                selected={readAlongHighlightPresetMatches(id, displayPreferences)}
                variant="mode"
              >
                <span className="font-semibold">{preset.label}</span>
                <span className="vs-muted text-xs leading-5">{preset.description}</span>
              </Button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-3 md:grid-cols-2">
        <ReadAlongSelect<ReadAlongHighlightGranularity>
          label="Highlight granularity"
          options={READ_ALONG_HIGHLIGHT_GRANULARITIES}
          optionDisabledReasons={{
            word: wordTimingDisabledReason,
          }}
          testId="ui-action-readalong-highlight-granularity"
          value={displayPreferences.highlightGranularity}
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
          optionDisabledReasons={{
            exactWordWhenAvailable: wordTimingDisabledReason,
          }}
          testId="ui-action-readalong-sync-strictness"
          value={displayPreferences.syncStrictness}
          valueLabels={READ_ALONG_PREFERENCE_LABELS.syncStrictness}
          onChange={(syncStrictness) => {
            update({ syncStrictness });
          }}
        />
      </div>

      <Panel className="grid gap-3 p-3" variant="raised">
        <h5 className="text-sm font-semibold">Highlight motion</h5>
        <Toggle
          checked={preferences.highlightMotion === "smoothCursor"}
          data-testid="ui-action-readalong-highlight-motion-smooth-cursor"
          data-ui-action-surface="Settings"
          detail={
            effectivePreferences.highlightMotion === "static" &&
            preferences.highlightMotion === "smoothCursor"
              ? "Disabled by reduced motion or high-contrast reader settings."
              : "Moves a decorative cursor between timed words without changing sync state."
          }
          label={READ_ALONG_PREFERENCE_LABELS.motion.smoothCursor}
          onChange={(checked) => {
            update({
              highlightMotion: checked
                ? READ_ALONG_HIGHLIGHT_MOTIONS[1]
                : READ_ALONG_HIGHLIGHT_MOTIONS[0],
            });
          }}
        />
      </Panel>

      <ProviderTimingLimitations
        phraseTimingDisabledReason={phraseTimingDisabledReason}
        providerRuntime={providerRuntime}
        wordTimingDisabledReason={wordTimingDisabledReason}
      />

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
            {READ_ALONG_PREFERENCE_LABELS.scrollFollow[effectivePreferences.scrollFollow]} ·{" "}
            {READ_ALONG_PREFERENCE_LABELS.motion[effectivePreferences.highlightMotion]}
          </span>
        </div>
        <p
          className="rounded-md border bg-[var(--vs-surface)] p-3 text-lg leading-9 vs-border"
          data-readalong-highlight-motion={effectivePreferences.highlightMotion}
        >
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
  optionDisabledReasons,
  testId,
  value,
  valueLabels,
  onChange,
}: Readonly<{
  label: string;
  options: readonly T[];
  optionDisabledReasons?: Partial<Record<T, string | undefined>>;
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
          <option disabled={Boolean(optionDisabledReasons?.[option])} key={option} value={option}>
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

function ProviderTimingLimitations({
  phraseTimingDisabledReason,
  providerRuntime,
  wordTimingDisabledReason,
}: Readonly<{
  phraseTimingDisabledReason?: string;
  providerRuntime: ProviderRuntimeCapabilities;
  wordTimingDisabledReason?: string;
}>) {
  const needsForcedAlignment =
    providerRuntime.capabilities.alignmentRequiredForWordHighlight &&
    Boolean(wordTimingDisabledReason);
  const heuristicDegraded =
    Boolean(wordTimingDisabledReason) &&
    Boolean(phraseTimingDisabledReason) &&
    !providerRuntime.capabilities.alignmentSupported;
  if (!wordTimingDisabledReason && !phraseTimingDisabledReason && !needsForcedAlignment) {
    return null;
  }
  return (
    <Panel
      className="grid gap-3 p-3"
      data-readalong-provider-label={providerRuntime.providerLabel}
      data-testid="readalong-provider-limitations"
      variant="raised"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="text-sm font-semibold">Provider timing limits</h5>
        <span className="vs-muted text-xs">{providerRuntime.providerLabel}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {wordTimingDisabledReason ? (
          <Button
            {...providerCapabilityDataAttributes("wordTiming", wordTimingDisabledReason)}
            data-command-id="readalong:word-highlight"
            data-testid="ui-action-readalong-word-highlight-unavailable"
            disabled
            disabledReason={wordTimingDisabledReason}
            variant="secondary"
          >
            Word highlight unavailable
          </Button>
        ) : null}
        {phraseTimingDisabledReason ? (
          <Button
            {...providerCapabilityDataAttributes("phraseTiming", phraseTimingDisabledReason)}
            data-testid="ui-action-readalong-phrase-fallback-unavailable"
            disabled
            disabledReason={phraseTimingDisabledReason}
            variant="secondary"
          >
            Phrase fallback unavailable
          </Button>
        ) : (
          <span
            className="rounded-md border px-3 py-2 text-sm font-semibold vs-border vs-surface"
            data-readalong-provider-fallback="phrase"
          >
            Phrase highlight fallback available
          </span>
        )}
      </div>
      <div className="grid gap-1 text-xs leading-5 vs-muted">
        {needsForcedAlignment ? (
          <span data-readalong-provider-requires-alignment="true">
            Forced alignment required before this provider can claim word-level sync.
          </span>
        ) : null}
        {heuristicDegraded ? (
          <span data-readalong-provider-degraded-mode="heuristic">
            Heuristic degraded mode will be shown instead of unsupported timing precision.
          </span>
        ) : null}
      </div>
    </Panel>
  );
}

function normalizeProviderLimitedReadAlongPreferences(
  preferences: ReadAlongPreferences,
  limits: Readonly<{
    phraseTimingDisabled: boolean;
    wordTimingDisabled: boolean;
  }>,
): ReadAlongPreferences {
  const next = { ...preferences };
  if (limits.wordTimingDisabled && next.highlightGranularity === "word") {
    next.highlightGranularity = limits.phraseTimingDisabled ? "block" : "phrase";
  }
  if (limits.wordTimingDisabled && next.syncStrictness === "exactWordWhenAvailable") {
    next.syncStrictness = limits.phraseTimingDisabled ? "blockFallback" : "phraseFallback";
  }
  return next;
}

function readAlongPreviewSnapshot(providerRuntime: ProviderRuntimeCapabilities) {
  if (providerRuntime.capabilities.wordTiming) {
    return { confidence: 0.91, mode: "word" as const, state: "synced-word" as const };
  }
  if (
    providerRuntime.capabilities.phraseTiming ||
    providerRuntime.capabilities.alignmentSupported
  ) {
    return { confidence: 0.78, mode: "phrase" as const, state: "synced-phrase" as const };
  }
  return { confidence: 0.38, mode: "degraded" as const, state: "degraded" as const };
}
