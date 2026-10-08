"use client";

import * as React from "react";

/** True when a key press should be left alone: typing in a field, a modifier held, or an overlay open. */
export function shouldIgnoreKey(e: KeyboardEvent, allowInOverlay = false): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  const t = e.target as HTMLElement | null;
  if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return true;
  if (!allowInOverlay && document.querySelector('[role="dialog"],[role="menu"],[role="listbox"]')) return true;
  return false;
}

/** Single-key shortcuts for one screen. The map is keyed by `e.key`. */
export function useHotkeys(map: Record<string, (e: KeyboardEvent) => void>, enabled = true) {
  const ref = React.useRef(map);
  React.useEffect(() => {
    ref.current = map;
  });
  React.useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreKey(e)) return;
      const fn = ref.current[e.key];
      if (fn) {
        // "g" starts a go-to sequence handled by the shell. Leave the second key to it.
        if ((window as unknown as { __crmGoPending?: boolean }).__crmGoPending) return;
        fn(e);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
