import { useEffect, useRef, useState } from "react";
import { Button, Panel } from "../../design";
import type { CinemaAdvancedModeAction } from "./cinemaAdvancedMode";
import {
  CINEMA_MORE_ACTIONS,
  CINEMA_MORE_MENU_ID,
  CINEMA_MORE_SECTIONS,
  activeCinemaMoreAction,
  cinemaMoreActionsBySection,
  type CinemaMoreAction,
  type CinemaMoreNavigationActionId,
} from "./cinemaMoreActions";
import type { CinemaFocusMode, CinemaInspectorPanelId } from "./model";

export interface CinemaMoreMenuProps {
  activePanelId?: CinemaInspectorPanelId | null;
  actions?: readonly CinemaMoreAction[];
  mode: CinemaFocusMode;
  onAdvancedAction?: (action: CinemaAdvancedModeAction) => void;
  onCommandPalette?: () => void;
  onCompactTransport?: () => void;
  onHelpGuide?: () => void;
  onKeyboardShortcuts?: () => void;
  onReaderSettings?: () => void;
  onTheatreMode?: () => void;
}

export function CinemaMoreMenu({
  activePanelId,
  actions = CINEMA_MORE_ACTIONS,
  mode,
  onAdvancedAction,
  onCommandPalette,
  onCompactTransport,
  onHelpGuide,
  onKeyboardShortcuts,
  onReaderSettings,
  onTheatreMode,
}: Readonly<CinemaMoreMenuProps>) {
  const availableActions = actions.filter(Boolean);
  const [open, setOpen] = useState(false);
  const focusFirstOnOpenRef = useRef(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const activeAction = activeCinemaMoreAction({ activePanelId, mode });
  const buttonLabel = activeAction?.label ?? "More";
  const buttonAriaLabel = activeAction
    ? `Cinema More menu. Active operator mode: ${activeAction.label}`
    : "Open Cinema More menu";

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !focusFirstOnOpenRef.current) {
      return;
    }
    focusFirstOnOpenRef.current = false;
    const timer = globalThis.setTimeout(() => {
      const firstMenuItem = menuRef.current?.querySelector<HTMLButtonElement>(
        "[role^='menuitem']:not(:disabled)",
      );
      firstMenuItem?.focus();
    }, 0);
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [open]);

  if (availableActions.length === 0) {
    return null;
  }

  const closeMenu = () => {
    setOpen(false);
  };

  const closeAndReturnFocus = () => {
    setOpen(false);
    globalThis.setTimeout(() => {
      triggerRef.current?.focus();
    }, 0);
  };

  const disabledReasonFor = (action: CinemaMoreAction): string | undefined => {
    if (action.disabledReason) {
      return action.disabledReason;
    }
    if (action.kind === "advanced" && !onAdvancedAction) {
      return "Advanced Cinema actions are unavailable in this surface.";
    }
    if (action.id === "reader-settings" && !onReaderSettings) {
      return "Reader settings are unavailable in this surface.";
    }
    if (action.id === "compact-transport" && !onCompactTransport) {
      return "Compact transport cannot be changed in this surface.";
    }
    if (action.id === "theatre-mode" && !onTheatreMode) {
      return "Theatre mode is unavailable in this surface.";
    }
    if (action.id === "command-palette" && !onCommandPalette) {
      return "Command palette is unavailable in this context.";
    }
    if (action.id === "keyboard-shortcuts" && !onKeyboardShortcuts) {
      return "Keyboard shortcut help is unavailable in this context.";
    }
    if (action.id === "help-guide" && !onHelpGuide) {
      return "Cinema help is unavailable in this context.";
    }
    return undefined;
  };

  const handleAction = (action: CinemaMoreAction) => {
    if (disabledReasonFor(action)) {
      return;
    }
    if (action.kind === "advanced") {
      closeAndReturnFocus();
      onAdvancedAction?.(action.advancedAction);
      return;
    }
    switch (action.id) {
      case "reader-settings": {
        closeAndReturnFocus();
        onReaderSettings?.();
        return;
      }
      case "compact-transport": {
        closeAndReturnFocus();
        onCompactTransport?.();
        return;
      }
      case "theatre-mode": {
        closeAndReturnFocus();
        onTheatreMode?.();
        return;
      }
      case "command-palette": {
        closeMenu();
        onCommandPalette?.();
        return;
      }
      case "keyboard-shortcuts": {
        closeMenu();
        onKeyboardShortcuts?.();
        return;
      }
      case "help-guide": {
        closeMenu();
        onHelpGuide?.();
        return;
      }
    }
  };

  const focusMenuItem = (direction: "first" | "last" | "next" | "previous") => {
    const menuItems = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role^='menuitem']") ?? []),
    ].filter((item) => !item.disabled);
    if (menuItems.length === 0) {
      return;
    }
    const activeIndex =
      document.activeElement instanceof HTMLButtonElement
        ? menuItems.indexOf(document.activeElement)
        : -1;
    let nextIndex: number;
    switch (direction) {
      case "last": {
        nextIndex = menuItems.length - 1;
        break;
      }
      case "next": {
        nextIndex = activeIndex < 0 ? 0 : (activeIndex + 1) % menuItems.length;
        break;
      }
      case "previous": {
        nextIndex = activeIndex <= 0 ? menuItems.length - 1 : activeIndex - 1;
        break;
      }
      case "first": {
        nextIndex = 0;
        break;
      }
    }
    menuItems[nextIndex]?.focus();
  };

  const groupedActions = cinemaMoreActionsBySection(availableActions);

  return (
    <div className="relative" ref={menuRef}>
      <Button
        aria-controls={CINEMA_MORE_MENU_ID}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={buttonAriaLabel}
        className="gap-1.5 rounded px-2"
        data-advanced-mode-id={activeAction?.id}
        data-cinema-more-trigger=""
        data-testid="ui-action-cinema-more-menu"
        data-ui-action-advanced={activeAction ? "true" : undefined}
        data-ui-action-owner="cinema-more"
        data-ui-action-scope={activeAction ? "operator" : "menu"}
        onClick={() => {
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            event.nativeEvent.stopImmediatePropagation();
            closeAndReturnFocus();
            return;
          }
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            focusFirstOnOpenRef.current = true;
            setOpen(true);
          }
        }}
        ref={triggerRef}
        selected={activeAction !== null}
        size="sm"
        title={activeAction?.reason ?? "Open Cinema More controls"}
        variant="mode"
      >
        {buttonLabel}
      </Button>
      {open ? (
        <Panel
          className="absolute right-0 top-[calc(100%+0.35rem)] z-20 grid min-w-64 gap-1 p-1 text-left shadow-lg"
          data-cinema-more-menu=""
          id={CINEMA_MORE_MENU_ID}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              event.nativeEvent.stopImmediatePropagation();
              closeAndReturnFocus();
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              focusMenuItem("next");
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              focusMenuItem("previous");
              return;
            }
            if (event.key === "Home") {
              event.preventDefault();
              focusMenuItem("first");
              return;
            }
            if (event.key === "End") {
              event.preventDefault();
              focusMenuItem("last");
            }
          }}
          role="menu"
          variant="raised"
        >
          {CINEMA_MORE_SECTIONS.map((section) => {
            const sectionActions = groupedActions[section.id];
            if (sectionActions.length === 0) {
              return null;
            }
            return (
              <div data-cinema-more-section={section.id} key={section.id}>
                <p className="px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] vs-muted">
                  {section.label}
                </p>
                {sectionActions.map((action) => {
                  const disabledReason = disabledReasonFor(action);
                  const selected = activeAction?.id === action.id;
                  const commandId = commandIdForAction(action);
                  return (
                    <Button
                      align="start"
                      aria-checked={action.kind === "advanced" ? selected : undefined}
                      className="w-full justify-start rounded px-2"
                      data-advanced-mode-id={action.kind === "advanced" ? action.id : undefined}
                      data-advanced-mode-reason={
                        action.kind === "advanced" ? action.reason : undefined
                      }
                      data-cinema-more-action-id={action.id}
                      data-cinema-more-action-kind={action.kind}
                      data-cinema-more-section-id={action.sectionId}
                      data-command-id={commandId}
                      data-testid={action.testId}
                      data-ui-action-advanced={action.kind === "advanced" ? "true" : undefined}
                      data-ui-action-owner={action.owner}
                      data-ui-action-scope={action.kind === "advanced" ? "operator" : action.kind}
                      disabled={Boolean(disabledReason)}
                      disabledReason={disabledReason}
                      key={action.id}
                      onClick={() => {
                        handleAction(action);
                      }}
                      role={action.kind === "advanced" ? "menuitemradio" : "menuitem"}
                      selected={selected}
                      size="sm"
                      title={disabledReason ?? action.reason}
                      variant="mode"
                    >
                      <span className="grid gap-0.5">
                        <span>{action.label}</span>
                        <span className="text-[0.65rem] font-medium leading-4 vs-muted">
                          {disabledReason ?? action.detail}
                        </span>
                      </span>
                    </Button>
                  );
                })}
              </div>
            );
          })}
        </Panel>
      ) : null}
    </div>
  );
}

function commandIdForAction(action: CinemaMoreAction): string | undefined {
  if (action.commandId) {
    return action.commandId;
  }
  return `cinema:more:${action.id}`;
}

export function navigationActionMatchesCommand(
  actionId: CinemaMoreNavigationActionId,
  commandId: string,
): boolean {
  if (actionId === "command-palette") {
    return commandId === "command.palette";
  }
  if (actionId === "keyboard-shortcuts") {
    return commandId === "shortcuts:open";
  }
  return commandId === "help:open";
}
