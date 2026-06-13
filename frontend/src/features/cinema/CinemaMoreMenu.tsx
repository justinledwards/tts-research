import { useEffect, useRef, useState } from "react";
import { Button, Panel } from "../../design";
import type { CinemaAdvancedModeAction } from "./cinemaAdvancedMode";
import {
  activeCinemaMoreAction,
  CINEMA_MORE_ACTIONS,
  CINEMA_MORE_MENU_ID,
  CINEMA_MORE_SECTIONS,
  type CinemaMoreAction,
  type CinemaMoreActionId,
  type CinemaMoreNavigationActionId,
  cinemaMoreActionsBySection,
  isCinemaMoreOperatorAction,
} from "./cinemaMoreActions";
import type { CinemaFocusMode, CinemaInspectorPanelId } from "./model";

export interface CinemaMoreMenuProps {
  activePanelId?: CinemaInspectorPanelId | null;
  actions?: readonly CinemaMoreAction[];
  mode: CinemaFocusMode;
  onAdvancedAction?: (action: CinemaAdvancedModeAction) => void;
  onCommandPalette?: () => void;
  onCreateAudio?: () => void;
  onDiscardTemporarySource?: () => void;
  onHelpGuide?: () => void;
  onKeepTemporarySource?: () => void;
  keepTemporarySourceDisabledReason?: string;
  onKeyboardShortcuts?: () => void;
  onMenuOpen?: () => void;
  onOpenInspector?: () => void;
  onReturnPreview?: () => void;
  onReturnReview?: () => void;
  onReaderSettings?: () => void;
  onSourceDetails?: () => void;
  onTheatreMode?: () => void;
  sourceOwner?: string;
  temporarySourceId?: string | null;
}

type CinemaMoreHandlerKey =
  | "onCommandPalette"
  | "onCreateAudio"
  | "onDiscardTemporarySource"
  | "onHelpGuide"
  | "onKeepTemporarySource"
  | "onKeyboardShortcuts"
  | "onOpenInspector"
  | "onReaderSettings"
  | "onReturnPreview"
  | "onReturnReview"
  | "onSourceDetails"
  | "onTheatreMode";

type CinemaMoreHandlerAvailability = Record<CinemaMoreHandlerKey, boolean> & {
  readonly hasAdvancedAction: boolean;
};

const CINEMA_MORE_HANDLER_REQUIREMENTS: Partial<
  Record<CinemaMoreActionId, { readonly handler: CinemaMoreHandlerKey; readonly reason: string }>
> = {
  "command-palette": {
    handler: "onCommandPalette",
    reason: "Command palette is unavailable in this context.",
  },
  "create-audio": {
    handler: "onCreateAudio",
    reason: "Generated audio is unavailable for this source.",
  },
  "discard-temporary-source": {
    handler: "onDiscardTemporarySource",
    reason: "Discard temporary source is unavailable here.",
  },
  "help-guide": {
    handler: "onHelpGuide",
    reason: "Cinema help is unavailable in this context.",
  },
  "keep-temporary-source": {
    handler: "onKeepTemporarySource",
    reason: "Keep in project is unavailable for this temporary source.",
  },
  "keyboard-shortcuts": {
    handler: "onKeyboardShortcuts",
    reason: "Keyboard shortcut help is unavailable in this context.",
  },
  "open-inspector": {
    handler: "onOpenInspector",
    reason: "Inspector is unavailable in this surface.",
  },
  "reader-settings": {
    handler: "onReaderSettings",
    reason: "Reader settings are unavailable in this surface.",
  },
  "retry-audio": {
    handler: "onCreateAudio",
    reason: "Generated audio is unavailable for this source.",
  },
  "return-preview": {
    handler: "onReturnPreview",
    reason: "Preview is unavailable for this source.",
  },
  "return-review": {
    handler: "onReturnReview",
    reason: "Review is unavailable for this source.",
  },
  "source-details": {
    handler: "onSourceDetails",
    reason: "Source details are unavailable in this surface.",
  },
  "theatre-mode": {
    handler: "onTheatreMode",
    reason: "Theatre mode is unavailable in this surface.",
  },
};

function disabledReasonForCinemaMoreAction(
  action: CinemaMoreAction,
  availability: CinemaMoreHandlerAvailability,
): string | undefined {
  if (action.disabledReason) {
    return action.disabledReason;
  }
  if (isCinemaMoreOperatorAction(action) && !availability.hasAdvancedAction) {
    return "Advanced Cinema actions are unavailable in this surface.";
  }
  const requirement = CINEMA_MORE_HANDLER_REQUIREMENTS[action.id];
  if (requirement && !availability[requirement.handler]) {
    return requirement.reason;
  }
  return undefined;
}

export function CinemaMoreMenu({
  activePanelId,
  actions = CINEMA_MORE_ACTIONS,
  mode,
  onAdvancedAction,
  onCommandPalette,
  onCreateAudio,
  onDiscardTemporarySource,
  onHelpGuide,
  onKeepTemporarySource,
  keepTemporarySourceDisabledReason,
  onKeyboardShortcuts,
  onMenuOpen,
  onOpenInspector,
  onReturnPreview,
  onReturnReview,
  onReaderSettings,
  onSourceDetails,
  onTheatreMode,
  sourceOwner,
  temporarySourceId,
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
  const handlerAvailability: CinemaMoreHandlerAvailability = {
    hasAdvancedAction: Boolean(onAdvancedAction),
    onCommandPalette: Boolean(onCommandPalette),
    onCreateAudio: Boolean(onCreateAudio),
    onDiscardTemporarySource: Boolean(onDiscardTemporarySource),
    onHelpGuide: Boolean(onHelpGuide),
    onKeepTemporarySource: Boolean(onKeepTemporarySource),
    onKeyboardShortcuts: Boolean(onKeyboardShortcuts),
    onOpenInspector: Boolean(onOpenInspector),
    onReaderSettings: Boolean(onReaderSettings),
    onReturnPreview: Boolean(onReturnPreview),
    onReturnReview: Boolean(onReturnReview),
    onSourceDetails: Boolean(onSourceDetails),
    onTheatreMode: Boolean(onTheatreMode),
  };

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
    if (action.id === "keep-temporary-source" && keepTemporarySourceDisabledReason) {
      return keepTemporarySourceDisabledReason;
    }
    return disabledReasonForCinemaMoreAction(action, handlerAvailability);
  };

  const handleAction = (action: CinemaMoreAction) => {
    if (disabledReasonFor(action)) {
      return;
    }
    if (isCinemaMoreOperatorAction(action)) {
      closeAndReturnFocus();
      onAdvancedAction?.(action.advancedAction);
      return;
    }
    switch (action.id) {
      case "open-inspector": {
        closeAndReturnFocus();
        onOpenInspector?.();
        return;
      }
      case "source-details": {
        closeAndReturnFocus();
        onSourceDetails?.();
        return;
      }
      case "create-audio":
      case "retry-audio": {
        closeAndReturnFocus();
        onCreateAudio?.();
        return;
      }
      case "keep-temporary-source": {
        closeAndReturnFocus();
        onKeepTemporarySource?.();
        return;
      }
      case "discard-temporary-source": {
        closeAndReturnFocus();
        onDiscardTemporarySource?.();
        return;
      }
      case "return-review": {
        closeAndReturnFocus();
        onReturnReview?.();
        return;
      }
      case "return-preview": {
        closeAndReturnFocus();
        onReturnPreview?.();
        return;
      }
      case "reader-settings": {
        closeAndReturnFocus();
        onReaderSettings?.();
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
          setOpen((current) => {
            const nextOpen = !current;
            if (nextOpen) {
              focusFirstOnOpenRef.current = true;
              onMenuOpen?.();
            }
            return nextOpen;
          });
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            event.nativeEvent.stopImmediatePropagation();
            closeAndReturnFocus();
            return;
          }
          if ((event.key === "Enter" || event.key === " ") && !open) {
            event.preventDefault();
            focusFirstOnOpenRef.current = true;
            onMenuOpen?.();
            setOpen(true);
            return;
          }
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            focusFirstOnOpenRef.current = true;
            onMenuOpen?.();
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
          className="absolute right-0 top-[calc(100%+0.35rem)] z-20 grid max-h-[calc(100vh-12rem)] min-w-64 gap-1 overflow-y-auto p-1 text-left shadow-lg"
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
              <div
                data-cinema-more-section={section.id}
                data-cinema-more-section-label={section.label}
                key={section.id}
              >
                <p className="px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] vs-muted">
                  {section.label}
                </p>
                {sectionActions.map((action) => {
                  const disabledReason = disabledReasonFor(action);
                  const selected = activeAction?.id === action.id;
                  const commandId = commandIdForAction(action);
                  const detailId = `${CINEMA_MORE_MENU_ID}-${action.id}-detail`;
                  const operatorAction = isCinemaMoreOperatorAction(action);
                  return (
                    <Button
                      align="start"
                      aria-checked={operatorAction ? selected : undefined}
                      aria-describedby={detailId}
                      aria-label={action.label}
                      className="w-full justify-between gap-3 rounded px-2"
                      data-advanced-mode-id={operatorAction ? action.id : undefined}
                      data-advanced-mode-reason={operatorAction ? action.reason : undefined}
                      data-cinema-more-action-id={action.id}
                      data-cinema-more-action-kind={action.kind}
                      data-cinema-more-disabled-reason={disabledReason}
                      data-cinema-more-section-id={action.sectionId}
                      data-cinema-more-shortcut-hint={action.shortcutHint}
                      data-command-id={commandId}
                      data-source-owner={sourceOwner}
                      data-shortcut-command-id={action.shortcutCommandId}
                      data-testid={action.testId}
                      data-temporary-source-id={temporarySourceId ?? undefined}
                      data-ui-action-advanced={operatorAction ? "true" : undefined}
                      data-ui-action-owner={action.owner}
                      data-ui-action-scope={operatorAction ? "operator" : action.kind}
                      disabled={Boolean(disabledReason)}
                      disabledReason={disabledReason}
                      key={action.id}
                      onClick={() => {
                        handleAction(action);
                      }}
                      role={operatorAction ? "menuitemradio" : "menuitem"}
                      selected={selected}
                      size="sm"
                      title={disabledReason ?? action.reason}
                      variant="mode"
                    >
                      <span className="grid min-w-0 gap-0.5">
                        <span className="truncate">{action.label}</span>
                        <span
                          className="text-[0.65rem] font-medium leading-4 vs-muted"
                          id={detailId}
                        >
                          {disabledReason ?? action.detail}
                        </span>
                      </span>
                      {action.shortcutHint ? (
                        <span className="ml-auto shrink-0 rounded border px-1.5 py-0.5 text-[0.62rem] font-semibold leading-4 vs-border vs-muted">
                          {action.shortcutHint}
                        </span>
                      ) : null}
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
