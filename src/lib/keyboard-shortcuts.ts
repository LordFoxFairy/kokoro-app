"use client";

import { z } from "zod";

import { createPersistedStore } from "@/lib/persisted-store";

export const shortcutIds = ["newTask", "search", "sidebar"] as const;
export const KEYBOARD_SHORTCUTS_CHANGED_EVENT = "kokoro.keyboard-shortcuts.changed";
export type ShortcutId = (typeof shortcutIds)[number];

export type KeyboardShortcut = Readonly<{
  key: string;
  primary: boolean;
  shift: boolean;
  alt: boolean;
}>;

export type KeyboardShortcutMap = Record<ShortcutId, KeyboardShortcut>;

const shortcutSchema = z
  .object({
    key: z.string().max(32),
    primary: z.boolean(),
    shift: z.boolean(),
    alt: z.boolean(),
  })
  .strict();

const shortcutsSchema = z
  .object({
    newTask: shortcutSchema,
    search: shortcutSchema,
    sidebar: shortcutSchema,
  })
  .strict();

const defaults: KeyboardShortcutMap = {
  newTask: { key: "o", primary: true, shift: true, alt: false },
  search: { key: "k", primary: true, shift: false, alt: false },
  sidebar: { key: "b", primary: true, shift: false, alt: false },
};

const store = createPersistedStore({
  key: "kokoro.web.keyboard-shortcuts",
  schema: shortcutsSchema,
});

export function readKeyboardShortcuts(): KeyboardShortcutMap {
  return store.read() ?? defaults;
}

export function writeKeyboardShortcuts(value: KeyboardShortcutMap): void {
  store.write(value);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(KEYBOARD_SHORTCUTS_CHANGED_EVENT));
  }
}

export function resetKeyboardShortcuts(): KeyboardShortcutMap {
  writeKeyboardShortcuts(defaults);
  return defaults;
}

export function matchesKeyboardShortcut(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
  shortcut: KeyboardShortcut,
): boolean {
  return shortcut.key.length > 0
    && event.key.toLocaleLowerCase() === shortcut.key.toLocaleLowerCase()
    && (event.metaKey || event.ctrlKey) === shortcut.primary
    && event.shiftKey === shortcut.shift
    && event.altKey === shortcut.alt;
}

export function keyboardShortcutParts(shortcut: KeyboardShortcut): readonly string[] {
  if (shortcut.key.length === 0) return [];
  return [
    ...(shortcut.primary ? ["⌘"] : []),
    ...(shortcut.alt ? ["⌥"] : []),
    ...(shortcut.shift ? ["⇧"] : []),
    shortcut.key.length === 1 ? shortcut.key.toLocaleUpperCase() : shortcut.key,
  ];
}

export function shortcutFromKeyboardEvent(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">): KeyboardShortcut | null {
  if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) return null;
  return {
    key: event.key,
    primary: event.metaKey || event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
  };
}
