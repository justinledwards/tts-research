import { useEffect, useRef, useState } from "react";
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
        <button
          aria-pressed={mode === item}
          className={`cinema-touch-target rounded px-2 transition ${
            mode === item
              ? "bg-orange-500 text-white shadow-sm"
              : "vs-muted hover:bg-[var(--vs-raised)] hover:text-[var(--vs-text)]"
          }`}
          key={item}
          onClick={() => {
            onModeChange(item);
          }}
          type="button"
        >
          {cinemaFocusModeLabel(item)}
        </button>
      ))}
      <div className="relative" ref={advancedRef}>
        <button
          aria-expanded={advancedOpen}
          aria-haspopup="menu"
          className={`cinema-touch-target rounded px-2 transition ${
            mode === "debug"
              ? "bg-zinc-900 text-white shadow-sm"
              : "vs-muted hover:bg-[var(--vs-raised)] hover:text-[var(--vs-text)]"
          }`}
          onClick={() => {
            setAdvancedOpen((current) => !current);
          }}
          type="button"
        >
          More
        </button>
        {advancedOpen ? (
          <div
            className="absolute right-0 top-[calc(100%+0.35rem)] z-20 grid min-w-40 rounded-md border bg-[var(--vs-raised)] p-1 text-left shadow-lg vs-border"
            role="menu"
          >
            <p className="px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] vs-muted">
              Advanced
            </p>
            {CINEMA_ADVANCED_FOCUS_MODES.map((item) => (
              <button
                aria-checked={mode === item}
                className={`cinema-touch-target rounded px-2 text-left transition ${
                  mode === item
                    ? "bg-zinc-900 text-white shadow-sm"
                    : "vs-muted hover:bg-[var(--vs-surface)] hover:text-[var(--vs-text)]"
                }`}
                key={item}
                onClick={() => {
                  setAdvancedOpen(false);
                  onModeChange(item);
                }}
                role="menuitemradio"
                type="button"
              >
                {cinemaFocusModeLabel(item)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
