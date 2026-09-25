import type { KeyboardEvent } from "react";

interface PressableOptions {
  /** ARIA role; pass null to keep the element's native role (e.g. a table row). Default "button". */
  role?: string | null;
  /** Adds aria-pressed (toggle buttons). */
  pressed?: boolean;
  /** Adds aria-checked (radio / switch). */
  checked?: boolean;
  label?: string;
}

/**
 * Props that make a non-button element operable from the keyboard: focusable, announced with a role,
 * and activated by Enter or Space as well as click. Prefer a real <button> where the markup allows;
 * use this for table rows, headers and card-like containers that cannot become buttons.
 */
export function pressable(onActivate: () => void, opts: PressableOptions = {}) {
  const { role = "button", pressed, checked, label } = opts;
  return {
    ...(role ? { role } : {}),
    tabIndex: 0,
    ...(pressed !== undefined ? { "aria-pressed": pressed } : {}),
    ...(checked !== undefined ? { "aria-checked": checked } : {}),
    ...(label ? { "aria-label": label } : {}),
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      // Ignore keys bubbling up from focusable children (inputs, nested buttons).
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
