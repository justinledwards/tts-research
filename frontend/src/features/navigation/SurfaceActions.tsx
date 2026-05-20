import type { ReactNode } from "react";

export function SurfaceActionButton({
  children,
  className = "",
  icon,
  label,
  onClick,
  title,
}: Readonly<{
  children?: ReactNode;
  className?: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  title?: string;
}>) {
  return (
    <button
      aria-label={label}
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold shadow-sm transition hover:border-orange-200 hover:bg-orange-50 vs-raised ${className}`}
      onClick={onClick}
      title={title ?? label}
      type="button"
    >
      {icon}
      {children}
    </button>
  );
}

export function SettingsIcon({ className = "h-4 w-4" }: Readonly<{ className?: string }>) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="m19 13.5.1-1.5-.1-1.5 2-1.5-2-3.4-2.5 1a7.5 7.5 0 0 0-2.6-1.5L13.5 2h-4l-.4 2.6A7.5 7.5 0 0 0 6.5 6.1L4 5.1 2 8.5l2 1.5-.1 1.5L4 13l-2 1.5 2 3.4 2.5-1a7.5 7.5 0 0 0 2.6 1.5l.4 2.6h4l.4-2.6a7.5 7.5 0 0 0 2.6-1.5l2.5 1 2-3.4-2-1.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function HelpIcon({ className = "h-4 w-4" }: Readonly<{ className?: string }>) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M9.5 9a2.7 2.7 0 1 1 4.7 1.8c-.9.8-2.2 1.5-2.2 3.2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <path d="M12 17.2v.1" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function ExitIcon({ className = "h-4 w-4" }: Readonly<{ className?: string }>) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M9 6 3 12l6 6M4 12h12M15 5h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function CloseIcon({ className = "h-4 w-4" }: Readonly<{ className?: string }>) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
