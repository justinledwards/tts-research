import { Button } from "../../design";
import type { CinemaAdvancedModeAction } from "./cinemaAdvancedMode";
import { CinemaMoreMenu } from "./CinemaMoreMenu";
import {
  CINEMA_PRIMARY_FOCUS_MODES,
  cinemaFocusModeLabel,
  type CinemaFocusMode,
  type CinemaInspectorPanelId,
} from "./model";

export function CinemaFocusModeToolbar({
  activePanelId,
  mode,
  onAdvancedAction,
  onCommandPalette,
  onHelpGuide,
  onKeyboardShortcuts,
  onMenuOpen,
  onModeChange,
  onReaderSettings,
  onTheatreMode,
}: Readonly<{
  activePanelId?: CinemaInspectorPanelId | null;
  mode: CinemaFocusMode;
  onAdvancedAction?: (action: CinemaAdvancedModeAction) => void;
  onCommandPalette?: () => void;
  onHelpGuide?: () => void;
  onKeyboardShortcuts?: () => void;
  onMenuOpen?: () => void;
  onModeChange: (mode: CinemaFocusMode) => void;
  onReaderSettings?: () => void;
  onTheatreMode?: () => void;
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
        activePanelId={activePanelId}
        mode={mode}
        onAdvancedAction={handleAdvancedAction}
        onCommandPalette={onCommandPalette}
        onHelpGuide={onHelpGuide}
        onKeyboardShortcuts={onKeyboardShortcuts}
        onMenuOpen={onMenuOpen}
        onReaderSettings={onReaderSettings}
        onTheatreMode={onTheatreMode}
      />
    </div>
  );
}
