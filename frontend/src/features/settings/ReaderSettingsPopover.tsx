import { ReaderAccessibilityControls } from "../../components/reader/ReaderAccessibilityControls";
import { normalizeThemeName, VOICE_STUDIO_THEMES } from "../../theme";
import type { ThemeName } from "../../types";
import type { ReaderAccessibilitySettings } from "../reader-accessibility";
import { ScopeBadge } from "./ScopeBadge";

export function ReaderSettingsPopover({
  accessibilitySettings,
  autoFollow,
  className = "",
  themeName,
  onAccessibilitySettingsChange,
  onAutoFollowChange,
  onThemeChange,
}: Readonly<{
  accessibilitySettings: ReaderAccessibilitySettings;
  autoFollow?: boolean;
  className?: string;
  themeName: ThemeName;
  onAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
  onAutoFollowChange?: (enabled: boolean) => void;
  onThemeChange: (theme: ThemeName) => void;
}>) {
  return (
    <div
      className={`absolute right-6 top-[3.6rem] z-[60] w-72 rounded-md border bg-[var(--vs-raised)] p-4 text-sm shadow-xl vs-border ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Reader settings</h3>
        <ScopeBadge scope="machine" />
      </div>
      <ReaderAccessibilityControls
        className="mt-4"
        settings={accessibilitySettings}
        variant="panel"
        onChange={onAccessibilitySettingsChange}
      />
      {autoFollow !== undefined && onAutoFollowChange ? (
        <label className="mt-4 flex items-center justify-between gap-3">
          <span>Auto-follow</span>
          <input
            checked={autoFollow}
            className="h-4 w-4 accent-orange-600"
            onChange={(event) => {
              onAutoFollowChange(event.currentTarget.checked);
            }}
            type="checkbox"
          />
        </label>
      ) : null}
      <label className="mt-3 grid gap-1">
        <span className="vs-muted">Theme</span>
        <select
          className="h-10 rounded-md border bg-[var(--vs-surface)] px-3 outline-none vs-border"
          onChange={(event) => {
            onThemeChange(normalizeThemeName(event.currentTarget.value));
          }}
          value={themeName}
        >
          {VOICE_STUDIO_THEMES.map((theme) => (
            <option key={theme.name} value={theme.name}>
              {theme.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
