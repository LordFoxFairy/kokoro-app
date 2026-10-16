import { beforeEach, expect, it, vi } from "vitest";
import { readKeyboardShortcuts, writeKeyboardShortcuts } from "@/lib/keyboard-shortcuts";
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
it("storage failure must reject without publishing a saved binding", () => {
  const before = readKeyboardShortcuts();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  expect(() => writeKeyboardShortcuts({ ...before, search: { ...before.search, key: "j" } })).toThrow();
  expect(readKeyboardShortcuts()).toEqual(before);
});
it("rejects bindings that collide with another action", () => {
  const before = readKeyboardShortcuts();
  expect(() => writeKeyboardShortcuts({ ...before, sidebar: before.search })).toThrow();
  expect(readKeyboardShortcuts()).toEqual(before);
});

it("does not rewrite pre-existing duplicate data and refuses ambiguous triggers", async () => {
  const { matchesSavedKeyboardShortcut } = await import("@/lib/keyboard-shortcuts");
  const original = readKeyboardShortcuts();
  const legacy = { ...original, sidebar: original.search };
  localStorage.setItem("kokoro.web.keyboard-shortcuts", JSON.stringify(legacy));
  expect(readKeyboardShortcuts()).toEqual(legacy);
  expect(matchesSavedKeyboardShortcut(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }), "search")).toBe(false);
  expect(localStorage.getItem("kokoro.web.keyboard-shortcuts")).toBe(JSON.stringify(legacy));
});
it("uses platform-specific primary modifiers and labels, rejects both modifiers", async () => {
  const { matchesKeyboardShortcut, keyboardShortcutParts } = await import("@/lib/keyboard-shortcuts");
  const shortcut = readKeyboardShortcuts().search;
  const event = { key: "k", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
  expect(matchesKeyboardShortcut(event, shortcut)).toBe(true);
  expect(keyboardShortcutParts(shortcut)).toEqual(["Ctrl", "K"]);
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  expect(matchesKeyboardShortcut(event, shortcut)).toBe(false);
  expect(matchesKeyboardShortcut({ ...event, metaKey: true, ctrlKey: false }, shortcut)).toBe(true);
  expect(matchesKeyboardShortcut({ ...event, metaKey: true }, shortcut)).toBe(false);
  expect(keyboardShortcutParts(shortcut)).toEqual(["⌘", "K"]);
});
it("can clear each legacy binding even when all three previously collided", () => {
  const original = readKeyboardShortcuts();
  localStorage.setItem("kokoro.web.keyboard-shortcuts", JSON.stringify({ newTask: original.search, search: original.search, sidebar: original.search }));
  const empty = { key: "", primary: false, shift: false, alt: false };
  writeKeyboardShortcuts({ ...readKeyboardShortcuts(), newTask: empty });
  writeKeyboardShortcuts({ ...readKeyboardShortcuts(), search: empty });
  expect(readKeyboardShortcuts().newTask.key).toBe("");
  expect(readKeyboardShortcuts().search.key).toBe("");
});
it("physical option and shifted digit keys remain recordable and matchable", async () => {
  const { shortcutFromKeyboardEvent, matchesKeyboardShortcut } = await import("@/lib/keyboard-shortcuts");
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  const event = { key: "∆", code: "KeyJ", metaKey: true, ctrlKey: false, altKey: true, shiftKey: false };
  const shortcut = shortcutFromKeyboardEvent(event)!;
  expect(shortcut.key).toBe("j");
  expect(matchesKeyboardShortcut(event, shortcut)).toBe(true);
});

it("preserves existing semantic letters and symbols across non-US layouts", async () => {
  const { matchesKeyboardShortcut, shortcutFromKeyboardEvent } = await import("@/lib/keyboard-shortcuts");
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  const event = { key: "z", code: "KeyW", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false };
  expect(shortcutFromKeyboardEvent(event)?.key).toBe("z");
  expect(matchesKeyboardShortcut(event, { key: "z", primary: true, shift: false, alt: false })).toBe(true);
  expect(matchesKeyboardShortcut({ ...event, key: "!", code: "Digit1", shiftKey: true }, { key: "!", primary: true, shift: true, alt: false })).toBe(true);
});

it("accepts the period binding shown on the read-only Manus shortcuts page", () => {
  const current = readKeyboardShortcuts();
  writeKeyboardShortcuts({ ...current, sidebar: { key: ".", primary: true, shift: false, alt: false } });
  expect(readKeyboardShortcuts().sidebar.key).toBe(".");
});

it("records and triggers period with Shift while retaining a legacy greater-than key", async () => {
  const { shortcutFromKeyboardEvent, matchesKeyboardShortcut } = await import("@/lib/keyboard-shortcuts");
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  const event = { key: ">", code: "Period", metaKey: true, ctrlKey: false, shiftKey: true, altKey: false };
  const recorded = shortcutFromKeyboardEvent(event)!;
  expect(recorded.key).toBe(".");
  expect(matchesKeyboardShortcut(event, recorded)).toBe(true);
  expect(matchesKeyboardShortcut(event, { ...recorded, key: ">" })).toBe(true);
});

it.each([
  { legacyKey: ">", code: "Period", shiftKey: true, altKey: false },
  { legacyKey: "∆", code: "KeyJ", shiftKey: false, altKey: true },
])("rejects a newly recorded alias of legacy $legacyKey at persistence boundary", async ({ legacyKey, code, shiftKey, altKey }) => {
  const { matchesSavedKeyboardShortcut, resetKeyboardShortcuts, shortcutFromKeyboardEvent } = await import("@/lib/keyboard-shortcuts");
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  const original = readKeyboardShortcuts();
  const legacy = { ...original, search: { key: legacyKey, primary: true, shift: shiftKey, alt: altKey } };
  const raw = JSON.stringify(legacy);
  localStorage.setItem("kokoro.web.keyboard-shortcuts", raw);
  const event = new KeyboardEvent("keydown", { key: legacyKey, code, metaKey: true, shiftKey, altKey });
  const binding = shortcutFromKeyboardEvent(event)!;
  expect(() => writeKeyboardShortcuts({ ...legacy, sidebar: binding }, { id: "sidebar", event })).toThrow("shortcut-conflict");
  expect(localStorage.getItem("kokoro.web.keyboard-shortcuts")).toBe(raw);
  expect(matchesSavedKeyboardShortcut(event, "search")).toBe(true);
  expect(matchesSavedKeyboardShortcut(event, "sidebar")).toBe(false);
  writeKeyboardShortcuts({ ...legacy, search: { key: "", primary: false, shift: false, alt: false } });
  writeKeyboardShortcuts({ ...readKeyboardShortcuts(), sidebar: binding }, { id: "sidebar", event });
  expect(matchesSavedKeyboardShortcut(event, "sidebar")).toBe(true);
  resetKeyboardShortcuts();
  expect(readKeyboardShortcuts().sidebar.key).toBe(".");
});

// SET36-BEGIN: copy-task-link-storage-and-binding
const set36CopyBinding = { key: "l", primary: true, shift: true, alt: false };
const set36LegacyMap = {
  newTask: { key: "o", primary: true, shift: true, alt: false },
  search: { key: "k", primary: true, shift: false, alt: false },
  sidebar: { key: "b", primary: true, shift: false, alt: false },
};
it("SET36 old three-field storage gains copy binding with stable reference and zero writes", () => {
  const raw = JSON.stringify(set36LegacyMap);
  localStorage.setItem("kokoro.web.keyboard-shortcuts", raw);
  const writes = vi.spyOn(Storage.prototype, "setItem");
  const first = readKeyboardShortcuts();
  expect(first).toEqual({ ...set36LegacyMap, copyTaskLink: set36CopyBinding });
  expect(readKeyboardShortcuts()).toBe(first);
  expect(writes).not.toHaveBeenCalled();
  expect(localStorage.getItem("kokoro.web.keyboard-shortcuts")).toBe(raw);
});
it("SET36 old binding collision only clears the newly introduced copy default", () => {
  const legacy = { ...set36LegacyMap, search: set36CopyBinding };
  const raw = JSON.stringify(legacy);
  localStorage.setItem("kokoro.web.keyboard-shortcuts", raw);
  const writes = vi.spyOn(Storage.prototype, "setItem");
  expect(readKeyboardShortcuts()).toEqual({ ...legacy, copyTaskLink: { key: "", primary: false, shift: false, alt: false } });
  expect(writes).not.toHaveBeenCalled();
  expect(localStorage.getItem("kokoro.web.keyboard-shortcuts")).toBe(raw);
});
it("SET36 strict maps reject missing old fields and unknown fields without rewriting storage", () => {
  for (const invalid of [
    { search: set36LegacyMap.search, sidebar: set36LegacyMap.sidebar },
    { ...set36LegacyMap, unexpected: set36CopyBinding },
    { ...set36LegacyMap, copyTaskLink: { ...set36CopyBinding, unexpected: true } },
  ]) {
    const raw = JSON.stringify(invalid);
    localStorage.setItem("kokoro.web.keyboard-shortcuts", raw);
    expect(readKeyboardShortcuts()).toHaveProperty("copyTaskLink", set36CopyBinding);
    expect(localStorage.getItem("kokoro.web.keyboard-shortcuts")).toBe(raw);
  }
});
it("SET36 only exact primary Shift L becomes newly valid and has platform-specific dispatch", async () => {
  const { validKeyboardShortcut, matchesSavedKeyboardShortcut } = await import("@/lib/keyboard-shortcuts");
  expect(validKeyboardShortcut(set36CopyBinding)).toBe(true);
  expect(validKeyboardShortcut({ ...set36CopyBinding, shift: false })).toBe(false);
  expect(validKeyboardShortcut({ ...set36CopyBinding, alt: true })).toBe(false);
  expect(validKeyboardShortcut({ ...set36CopyBinding, key: "q" })).toBe(false);
  const copyId = "copyTaskLink" as Parameters<typeof matchesSavedKeyboardShortcut>[1];
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  expect(matchesSavedKeyboardShortcut(new KeyboardEvent("keydown", { key: "L", metaKey: true, shiftKey: true }), copyId)).toBe(true);
  expect(matchesSavedKeyboardShortcut(new KeyboardEvent("keydown", { key: "L", ctrlKey: true, shiftKey: true }), copyId)).toBe(false);
  expect(matchesSavedKeyboardShortcut(new KeyboardEvent("keydown", { key: "L", metaKey: true, ctrlKey: true, shiftKey: true }), copyId)).toBe(false);
});
it("SET36 explicit copy edits persist current shape and failed writes retain prior binding", () => {
  const current = readKeyboardShortcuts();
  const changed = { ...current, copyTaskLink: { ...set36CopyBinding, key: "j" } };
  writeKeyboardShortcuts(changed);
  expect(JSON.parse(localStorage.getItem("kokoro.web.keyboard-shortcuts")!)).toEqual(changed);
  const writes = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  expect(() => writeKeyboardShortcuts({ ...changed, copyTaskLink: set36CopyBinding } as Parameters<typeof writeKeyboardShortcuts>[0])).toThrow();
  expect(readKeyboardShortcuts()).toEqual(changed);
  writes.mockRestore();
});
// SET36-END: copy-task-link-storage-and-binding
