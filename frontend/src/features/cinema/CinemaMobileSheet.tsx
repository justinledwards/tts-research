import type { ReactNode } from "react";

export interface CinemaMobilePanelSpec<TPanelId extends string = string> {
  children: ReactNode;
  icon?: ReactNode;
  id: TPanelId;
  label: string;
}

export function CinemaMobileSheet<TPanelId extends string>({
  activePanelId,
  panels,
  onPanelChange,
}: Readonly<{
  activePanelId: TPanelId | null;
  panels: readonly CinemaMobilePanelSpec<TPanelId>[];
  onPanelChange: (panel: TPanelId | null) => void;
}>) {
  if (!activePanelId) {
    return null;
  }
  if (panels.length === 0) {
    return null;
  }
  const activePanel = panels.find((panel) => panel.id === activePanelId) ?? panels[0];

  return (
    <section className="fixed inset-x-0 bottom-[8.75rem] z-[55] max-h-[42vh] overflow-y-auto rounded-t-2xl border bg-[var(--vs-raised)] px-4 pb-5 pt-3 shadow-2xl vs-border lg:hidden">
      <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-zinc-500/50" />
      <div
        className="mb-4 grid border-b text-sm font-semibold vs-border"
        style={{ gridTemplateColumns: `repeat(${panels.length.toString()}, minmax(0, 1fr))` }}
      >
        {panels.map((panel) => (
          <button
            className={`flex items-center justify-center gap-2 border-b-2 px-2 pb-3 ${
              activePanel.id === panel.id
                ? "border-orange-500 text-orange-500"
                : "border-transparent vs-muted"
            }`}
            key={panel.id}
            onClick={() => {
              onPanelChange(panel.id);
            }}
            type="button"
          >
            {panel.icon}
            {panel.label}
          </button>
        ))}
      </div>
      {activePanel.children}
    </section>
  );
}
