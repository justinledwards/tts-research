import { useEffect, useRef, useState } from "react";
import { Button, Panel } from "../../design";
import {
  CINEMA_ADVANCED_MODE_ACTIONS,
  activeCinemaAdvancedModeAction,
  type CinemaAdvancedModeAction,
} from "./cinemaAdvancedMode";
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
  onModeChange,
}: Readonly<{
  activePanelId?: CinemaInspectorPanelId | null;
  mode: CinemaFocusMode;
  onAdvancedAction?: (action: CinemaAdvancedModeAction) => void;
  onModeChange: (mode: CinemaFocusMode) => void;
}>) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedRef = useRef<HTMLDivElement | null>(null);
  const activeAdvancedAction = activeCinemaAdvancedModeAction({
    activePanelId,
    mode,
  });
  const advancedButtonLabel = activeAdvancedAction?.label ?? "More";
  const advancedButtonAriaLabel = activeAdvancedAction
    ? `Advanced menu. Active operator mode: ${activeAdvancedAction.label}`
    : "More advanced modes";

  useEffect(() => {
    if (!advancedOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!advancedRef.current?.contains(event.target as Node)) {
        setAdvancedOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [advancedOpen]);

  const handleAdvancedAction = (action: CinemaAdvancedModeAction) => {
    if (action.disabledReason) {
      return;
    }
    setAdvancedOpen(false);
    if (onAdvancedAction) {
      onAdvancedAction(action);
      return;
    }
    onModeChange(action.mode);
  };

  return (
    <div
      className="grid grid-cols-[repeat(3,minmax(0,1fr))_auto] rounded-md border p-0.5 text-xs font-semibold vs-border vs-surface"
      data-cinema-mode-control-group=""
    >
      {CINEMA_PRIMARY_FOCUS_MODES.map((item) => (
        <Button
          aria-pressed={mode === item}
          className="min-w-0 rounded px-2"
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
      <div className="relative" ref={advancedRef}>
        <Button
          aria-controls="cinema-advanced-mode-menu"
          aria-expanded={advancedOpen}
          aria-haspopup="menu"
          aria-label={advancedButtonAriaLabel}
          className="gap-1.5 rounded px-2"
          data-advanced-mode-id={activeAdvancedAction?.id}
          data-testid="ui-action-cinema-advanced-menu"
          data-ui-action-advanced={activeAdvancedAction ? "true" : undefined}
          data-ui-action-owner="cinema-advanced"
          data-ui-action-scope="operator"
          onClick={() => {
            setAdvancedOpen((current) => !current);
          }}
          selected={activeAdvancedAction !== null}
          size="sm"
          title={activeAdvancedAction?.reason ?? "Open advanced Cinema controls"}
          variant="mode"
        >
          {advancedButtonLabel}
        </Button>
        {advancedOpen ? (
          <Panel
            className="absolute right-0 top-[calc(100%+0.35rem)] z-20 grid min-w-40 p-1 text-left shadow-lg"
            id="cinema-advanced-mode-menu"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setAdvancedOpen(false);
              }
            }}
            role="menu"
            variant="raised"
          >
            <p className="px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] vs-muted">
              Advanced
            </p>
            {CINEMA_ADVANCED_MODE_ACTIONS.map((action) => (
              <Button
                align="start"
                aria-checked={activeAdvancedAction?.id === action.id}
                className="justify-start rounded px-2"
                data-advanced-mode-id={action.id}
                data-advanced-mode-reason={action.reason}
                data-testid={action.testId}
                data-ui-action-advanced="true"
                data-ui-action-owner={action.owner}
                data-ui-action-scope="operator"
                disabled={Boolean(action.disabledReason)}
                disabledReason={action.disabledReason}
                key={action.id}
                onClick={() => {
                  handleAdvancedAction(action);
                }}
                role="menuitemradio"
                selected={activeAdvancedAction?.id === action.id}
                size="sm"
                title={action.disabledReason ?? action.reason}
                variant="mode"
              >
                <span className="grid gap-0.5">
                  <span>{action.label}</span>
                  <span className="text-[0.65rem] font-medium leading-4 vs-muted">
                    {action.detail}
                  </span>
                </span>
              </Button>
            ))}
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
