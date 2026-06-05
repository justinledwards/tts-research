import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export interface ReaderModalLifecycleOptions {
  closeOnEscape?: boolean;
  isOpen?: boolean;
  lockScroll?: boolean;
  onClose?: () => void;
  trapFocus?: boolean;
}

export function useReaderModalLifecycle(
  containerRef: RefObject<HTMLElement | null>,
  {
    closeOnEscape = false,
    isOpen = true,
    lockScroll = true,
    onClose,
    trapFocus = true,
  }: ReaderModalLifecycleOptions = {},
) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const container = containerRef.current;
    const previousOverflow = document.body.style.overflow;
    const activeElement = document.activeElement;
    const previouslyFocused = activeElement instanceof HTMLElement ? activeElement : null;

    if (lockScroll) {
      document.body.style.overflow = "hidden";
    }
    focusInitialElement(container);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeOnEscape && !event.defaultPrevented) {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key === "Tab" && trapFocus && container) {
        trapTabFocus(event, container);
      }
    };

    globalThis.addEventListener("keydown", handleKeyDown);
    return () => {
      if (lockScroll) {
        document.body.style.overflow = previousOverflow;
      }
      globalThis.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [closeOnEscape, containerRef, isOpen, lockScroll, trapFocus]);
}

function focusInitialElement(container: HTMLElement | null) {
  if (!container) {
    return;
  }
  const activeElement = document.activeElement;
  if (
    activeElement instanceof HTMLElement &&
    container.contains(activeElement) &&
    isEditableFocusTarget(activeElement)
  ) {
    return;
  }
  const autofocus = container.querySelector<HTMLElement>("[data-reader-autofocus]");
  (autofocus ?? container).focus();
}

function isEditableFocusTarget(element: HTMLElement): boolean {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return true;
  }
  return element.isContentEditable;
}

function trapTabFocus(event: KeyboardEvent, container: HTMLElement) {
  const focusable = [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.getClientRects().length > 0,
  );
  if (focusable.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1);
  const activeElement = document.activeElement;
  if (!last) {
    return;
  }
  if (event.shiftKey && activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
