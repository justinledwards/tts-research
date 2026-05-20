import { SETTINGS_SCOPE_META, type SettingsScope } from "./model";

export function ScopeBadge({
  className = "",
  scope,
}: Readonly<{ className?: string; scope: SettingsScope }>) {
  const meta = SETTINGS_SCOPE_META[scope];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${meta.badgeClassName} ${className}`}
      title={`${meta.label}: ${meta.description}`}
    >
      {meta.shortLabel}
    </span>
  );
}
