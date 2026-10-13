"use client";

import { useSyncExternalStore } from "react";
import { useHydrated } from "@/lib/use-hydrated";
import {
  KEYBOARD_SHORTCUTS_CHANGED_EVENT,
  defaultKeyboardShortcuts,
  isMacKeyboard,
  keyboardShortcutParts,
  readKeyboardShortcuts,
  type KeyboardShortcut,
  type KeyboardShortcutMap,
} from "@/lib/keyboard-shortcuts";

function subscribe(refresh: () => void): () => void {
  window.addEventListener(KEYBOARD_SHORTCUTS_CHANGED_EVENT, refresh);
  window.addEventListener("storage", refresh);
  return () => {
    window.removeEventListener(KEYBOARD_SHORTCUTS_CHANGED_EVENT, refresh);
    window.removeEventListener("storage", refresh);
  };
}

/** Stable server snapshot; saved bindings and platform hints appear after hydration. */
export function useKeyboardShortcuts(): KeyboardShortcutMap {
  return useSyncExternalStore(subscribe, readKeyboardShortcuts, defaultKeyboardShortcuts);
}

export function useKeyboardShortcutParts(): (shortcut: KeyboardShortcut) => readonly string[] {
  const hydrated = useHydrated();
  return (shortcut) => keyboardShortcutParts(shortcut, hydrated && isMacKeyboard());
}
