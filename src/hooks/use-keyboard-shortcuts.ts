"use client";

import { useEffect, useState } from "react";

import {
  readKeyboardShortcuts,
  subscribeKeyboardShortcuts,
  type KeyboardShortcutMap,
} from "@/lib/keyboard-shortcuts";

/** Keeps shortcut hints synchronized with the user’s saved bindings. */
export function useKeyboardShortcuts(): KeyboardShortcutMap {
  const [shortcuts, setShortcuts] = useState<KeyboardShortcutMap>(() => readKeyboardShortcuts());

  useEffect(() => {
    const refresh = () => setShortcuts(readKeyboardShortcuts());
    return subscribeKeyboardShortcuts(refresh);
  }, []);

  return shortcuts;
}
