"use client";

import { z } from "zod";

import { createPersistedStore } from "@/lib/persisted-store";

export const shortcutIds = ["newTask", "search", "sidebar"] as const;
const STORAGE_KEY = "kokoro.web.keyboard-shortcuts";
export const KEYBOARD_SHORTCUTS_CHANGED_EVENT = "kokoro.keyboard-shortcuts.changed";
export type ShortcutId = (typeof shortcutIds)[number];

export type KeyboardShortcut = Readonly<{
  key: string;
  primary: boolean;
  shift: boolean;
  alt: boolean;
}>;

export type KeyboardShortcutMap = Record<ShortcutId, KeyboardShortcut>;
export type ShortcutRecording = Readonly<{
  id: ShortcutId;
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"> & Partial<Pick<KeyboardEvent, "code">>;
}>;

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
  key: STORAGE_KEY,
  schema: shortcutsSchema,
});

export function defaultKeyboardShortcuts(): KeyboardShortcutMap { return defaults; }

export function readKeyboardShortcuts(): KeyboardShortcutMap {
  return store.read() ?? defaults;
}

export function writeKeyboardShortcuts(value: KeyboardShortcutMap, recording?: ShortcutRecording): void {
  const parsed = shortcutsSchema.parse(value);
  const current = readKeyboardShortcuts();
  if (recording) {
    if (!matchesKeyboardShortcut(recording.event, parsed[recording.id])) throw new Error("shortcut-invalid");
    // The original event proves alias overlap across a legacy semantic key and
    // a new physical fallback. Reject before touching storage or publishing.
    if (shortcutIds.some((other) => other !== recording.id
      && matchesKeyboardShortcut(recording.event, parsed[other]))) throw new Error("shortcut-conflict");
  }
  for (const id of shortcutIds) {
    // An existing duplicate must not prevent clearing another legacy binding.
    if (!parsed[id].key || sameKeyboardShortcut(parsed[id], current[id])) continue;
    if (!validKeyboardShortcut(parsed[id])) throw new Error("shortcut-invalid");
    if (shortcutIds.some((other) => other !== id && sameKeyboardShortcut(parsed[id], parsed[other]))) {
      throw new Error("shortcut-conflict");
    }
  }
  if (typeof window === "undefined") throw new Error("shortcut-storage-unavailable");
  // Do not mutate the shared store's optimistic cache on a failed durable write.
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(KEYBOARD_SHORTCUTS_CHANGED_EVENT));
  }
}

export function resetKeyboardShortcuts(): KeyboardShortcutMap {
  writeKeyboardShortcuts(defaults);
  return defaults;
}

function keyboardEventKey(event: { key: string; code?: string }): string {
  // Keep semantic letters across keyboard layouts; code is only a fallback for
  // Option/Shift-produced symbols when creating a new binding.
  if (/^[a-z0-9]$/i.test(event.key)) return event.key.toLowerCase();
  if (event.code === "Period") return ".";
  if (event.code && /^(Key[A-Z]|Digit[0-9])$/.test(event.code)) {
    return event.code.replace(/^(Key|Digit)/, "").toLowerCase();
  }
  return event.key;
}

export function matchesKeyboardShortcut(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"> & Partial<Pick<KeyboardEvent, "code">>,
  shortcut: KeyboardShortcut,
): boolean {
  return shortcut.key.length > 0
    && (event.key.toLowerCase() === shortcut.key.toLowerCase()
      || keyboardEventKey(event).toLowerCase() === shortcut.key.toLowerCase())
    && event.metaKey === (shortcut.primary && isMacKeyboard())
    && event.ctrlKey === (shortcut.primary && !isMacKeyboard())
    && event.shiftKey === shortcut.shift
    && event.altKey === shortcut.alt;
}

export function isMacKeyboard(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
}

export function sameKeyboardShortcut(a: KeyboardShortcut, b: KeyboardShortcut): boolean {
  return a.key.length > 0 && a.key.toLowerCase() === b.key.toLowerCase()
    && a.primary === b.primary && a.shift === b.shift && a.alt === b.alt;
}

/** Validate new bindings only; existing preferences are never silently rewritten. */
export function validKeyboardShortcut(shortcut: KeyboardShortcut): boolean {
  if (!shortcut.primary || !/^[a-z0-9.]$/i.test(shortcut.key)) return false;
  // These combinations belong to browser/OS navigation, windows or tabs.
  return !"qwrtnl".includes(shortcut.key.toLowerCase())
    && !(shortcut.alt && shortcut.key.toLowerCase() === "b");
}

export function matchesSavedKeyboardShortcut(event: KeyboardEvent, id: ShortcutId): boolean {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.key === "Process") return false;
  if (event.target instanceof Element && event.target.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"]',
  )) return false;
  const shortcuts = readKeyboardShortcuts();
  return matchesKeyboardShortcut(event, shortcuts[id])
    && shortcutIds.filter((other) => matchesKeyboardShortcut(event, shortcuts[other])).length === 1;
}

export function keyboardShortcutParts(shortcut: KeyboardShortcut, mac = isMacKeyboard()): readonly string[] {
  if (shortcut.key.length === 0) return [];
  return [
    ...(shortcut.primary ? [mac ? "⌘" : "Ctrl"] : []),
    ...(shortcut.alt ? [mac ? "⌥" : "Alt"] : []),
    ...(shortcut.shift ? [mac ? "⇧" : "Shift"] : []),
    shortcut.key.length === 1 ? shortcut.key.toLocaleUpperCase() : shortcut.key,
  ];
}

export function shortcutFromKeyboardEvent(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"> & Partial<Pick<KeyboardEvent, "code">>): KeyboardShortcut | null {
  if (["Meta", "Control", "Alt", "Shift", "Dead", "Process", "Unidentified"].includes(event.key) || (event.metaKey && event.ctrlKey)) return null;
  return {
    key: keyboardEventKey(event),
    primary: isMacKeyboard() ? event.metaKey : event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
  };
}
