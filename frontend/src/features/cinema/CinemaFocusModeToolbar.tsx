import { Button } from "../../design";
import { CinemaMoreMenu } from "./CinemaMoreMenu";
import type { CinemaAdvancedModeAction } from "./cinemaAdvancedMode";
import type { CinemaMoreAction } from "./cinemaMoreActions";
import {
  CINEMA_PRIMARY_FOCUS_MODES,
  type CinemaFocusMode,
  type CinemaInspectorPanelId,
  cinemaFocusModeLabel,
} from "./model";

export function CinemaFocusModeToolbar({
  actions,
  activePanelId,
  mode,
  onAdvancedAction,
  onCommandPalette,
  onCreateAudio,
  onDiscardTemporarySource,
  onHelpGuide,
  onKeepTemporarySource,
  onKeyboardShortcuts,
  onMenuOpen,
  onModeChange,
  onOpenInspector,
  onReturnPreview,
  onReturnReview,
  onReaderSettings,
  onSourceDetails,
  onTheatreMode,
  sourceOwner,
  temporarySourceId,
}: Readonly<{
  actions?: readonly CinemaMoreAction[];
  activePanelId?: CinemaInspectorPanelId | null;
  mode: CinemaFocusMode;
  onAdvancedAction?: (action: CinemaAdvancedModeAction) => void;
  onCommandPalette?: () => void;
  onCreateAudio?: () => void;
  onDiscardTemporarySource?: () => void;
  onHelpGuide?: () => void;
  onKeepTemporarySource?: () => void;
  onKeyboardShortcuts?: () => void;
  onMenuOpen?: () => void;
  onModeChange: (mode: CinemaFocusMode) => void;
  onOpenInspector?: () => void;
  onReturnPreview?: () => void;
  onReturnReview?: () => void;
  onReaderSettings?: () => void;
  onSourceDetails?: () => void;
  onTheatreMode?: () => void;
  sourceOwner?: string;
  temporarySourceId?: string | null;
}>) {
  const handleAdvancedAction = (action: CinemaAdvancedModeAction) => {
    if (action.disabledReason) {
      return;
    }
    if (onAdvancedAction) {
      onAdvancedAction(action);
      return;
    }
    onModeChange(action.mode);
  };

  return (
    <div
      className="grid grid-cols-[repeat(3,minmax(0,1fr))_auto_auto] rounded-md border p-0.5 text-xs font-semibold vs-border vs-surface"
      data-cinema-mode-control-group=""
    >
      {CINEMA_PRIMARY_FOCUS_MODES.map((item) => (
        <Button
          aria-pressed={mode === item}
          className="min-w-0 rounded px-2"
          data-testid={`ui-action-cinema-focus-${item}`}
          key={item}
          onClick={() => {
            onModeChange(item);
          }}
          selected={mode === item}
          size="sm"
          variant="mode"
        >
          {cinemaFocusModeLabel(item)}
        </Button>
      ))}
      {onTheatreMode ? (
        <Button
          aria-label="Open Cinema Theatre"
          className="min-w-0 rounded px-2"
          data-testid="ui-action-cinema-theatre"
          onClick={onTheatreMode}
          size="sm"
          variant="mode"
        >
          Theatre
        </Button>
      ) : null}
      <CinemaMoreMenu
        actions={actions}
        activePanelId={activePanelId}
        mode={mode}
        onAdvancedAction={handleAdvancedAction}
        onCommandPalette={onCommandPalette}
        onCreateAudio={onCreateAudio}
        onDiscardTemporarySource={onDiscardTemporarySource}
        onHelpGuide={onHelpGuide}
        onKeepTemporarySource={onKeepTemporarySource}
        onKeyboardShortcuts={onKeyboardShortcuts}
        onMenuOpen={onMenuOpen}
        onOpenInspector={onOpenInspector}
        onReturnPreview={onReturnPreview}
        onReturnReview={onReturnReview}
        onReaderSettings={onReaderSettings}
        onSourceDetails={onSourceDetails}
        onTheatreMode={onTheatreMode}
        sourceOwner={sourceOwner}
        temporarySourceId={temporarySourceId}
      />
    </div>
  );
}
