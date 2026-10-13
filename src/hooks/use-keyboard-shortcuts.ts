"use client";

import { useEffect, useState } from "react";

import {
  KEYBOARD_SHORTCUTS_CHANGED_EVENT,
  readKeyboardShortcuts,
  type KeyboardShortcutMap,
} from "@/lib/keyboard-shortcuts";

/** Keeps shortcut hints synchronized with the user’s saved bindings. */
export function useKeyboardShortcuts(): KeyboardShortcutMap {
  const [shortcuts, setShortcuts] = useState<KeyboardShortcutMap>(() => readKeyboardShortcuts());

  useEffect(() => {
    const refresh = () => setShortcuts(readKeyboardShortcuts());
    window.addEventListener(KEYBOARD_SHORTCUTS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(KEYBOARD_SHORTCUTS_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return shortcuts;
}
