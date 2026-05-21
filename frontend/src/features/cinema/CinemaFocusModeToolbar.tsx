import { useEffect, useRef, useState } from "react";
import { Button, Panel } from "../../design";
import {
  CINEMA_ADVANCED_FOCUS_MODES,
  CINEMA_PRIMARY_FOCUS_MODES,
  cinemaFocusModeLabel,
  type CinemaFocusMode,
} from "./model";

export function CinemaFocusModeToolbar({
  mode,
  onModeChange,
}: Readonly<{
  mode: CinemaFocusMode;
  onModeChange: (mode: CinemaFocusMode) => void;
}>) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_auto] rounded-md border p-0.5 text-xs font-semibold vs-border vs-surface">
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
          aria-expanded={advancedOpen}
          aria-haspopup="menu"
          className="rounded px-2"
          onClick={() => {
            setAdvancedOpen((current) => !current);
          }}
          selected={mode === "debug"}
          size="sm"
          variant="mode"
        >
          More
        </Button>
        {advancedOpen ? (
          <Panel
            className="absolute right-0 top-[calc(100%+0.35rem)] z-20 grid min-w-40 p-1 text-left shadow-lg"
            role="menu"
            variant="raised"
          >
            <p className="px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] vs-muted">
              Advanced
            </p>
            {CINEMA_ADVANCED_FOCUS_MODES.map((item) => (
              <Button
                align="start"
                aria-checked={mode === item}
                className="justify-start rounded px-2"
                key={item}
                onClick={() => {
                  setAdvancedOpen(false);
                  onModeChange(item);
                }}
                role="menuitemradio"
                selected={mode === item}
                size="sm"
                variant="mode"
              >
                {cinemaFocusModeLabel(item)}
              </Button>
            ))}
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
