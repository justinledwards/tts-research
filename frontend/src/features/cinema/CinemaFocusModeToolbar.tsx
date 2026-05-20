import { CINEMA_FOCUS_MODES, cinemaFocusModeLabel, type CinemaFocusMode } from "./model";

export function CinemaFocusModeToolbar({
  mode,
  onModeChange,
}: Readonly<{
  mode: CinemaFocusMode;
  onModeChange: (mode: CinemaFocusMode) => void;
}>) {
  return (
    <div className="grid grid-cols-4 rounded-md border p-0.5 text-xs font-semibold vs-border vs-surface">
      {CINEMA_FOCUS_MODES.map((item) => (
        <button
          aria-pressed={mode === item}
          className={`h-9 rounded px-2 transition ${
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
    </div>
  );
}
