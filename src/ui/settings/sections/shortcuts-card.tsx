"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import {
  keyboardShortcutParts,
  readKeyboardShortcuts,
  resetKeyboardShortcuts,
  shortcutFromKeyboardEvent,
  shortcutIds,
  type KeyboardShortcutMap,
  type ShortcutId,
  writeKeyboardShortcuts,
} from "@/lib/keyboard-shortcuts";
import { useT } from "@/i18n/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import styles from "./settings-sections.module.css";

const shortcutLabels: Record<ShortcutId, "settings.shortcutNewTask" | "settings.shortcutSearch" | "settings.shortcutSidebar"> = {
  newTask: "settings.shortcutNewTask",
  search: "settings.shortcutSearch",
  sidebar: "settings.shortcutSidebar",
};

/** Settings is the sole editing surface; AppFrame and Sidebar read this
 * persisted map when handling every keyboard event. */
export function ShortcutsCard() {
  const t = useT();
  const [saved, setSaved] = useState(false);
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [shortcuts, setShortcuts] = useState<KeyboardShortcutMap>(
    readKeyboardShortcuts,
  );

  const persist = (next: KeyboardShortcutMap): void => {
    setShortcuts(next);
    writeKeyboardShortcuts(next);
    setSaved(true);
  };

  useEffect(() => {
    if (!recording) return;
    const captureShortcut = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        setRecording(null);
        return;
      }
      const shortcut = shortcutFromKeyboardEvent(event);
      if (shortcut === null) return;
      event.preventDefault();
      event.stopPropagation();
      persist({ ...shortcuts, [recording]: shortcut });
      setRecording(null);
    };
    window.addEventListener("keydown", captureShortcut, true);
    return () => window.removeEventListener("keydown", captureShortcut, true);
  }, [recording, shortcuts]);

  useEffect(() => {
    if (!saved) return;
    const id = window.setTimeout(() => setSaved(false), 1600);
    return () => window.clearTimeout(id);
  }, [saved]);

  return (
    <Card className={`${styles.card} ${styles.shortcutsCard}`} data-settings-card data-testid="settings-shortcuts">
      <CardContent className={styles.cardContent}>
        <div className={styles.shortcutList}>
          {shortcutIds.map((id) => {
            const label = t(shortcutLabels[id]);
            const parts = keyboardShortcutParts(shortcuts[id]);
            return (
              <div className={styles.shortcutRow} key={id}>
                <div className={styles.shortcutLabel}>{label}</div>
                <div className={styles.shortcutActions} data-recording={recording === id || undefined}>
                  <Button
                    className={styles.shortcutKeys}
                    variant="ghost"
                    type="button"
                    aria-label={t("settings.shortcutEditLabel", { name: label })}
                    onClick={() => setRecording(id)}
                  >
                    <span className={styles.shortcutKeySet} data-recording={recording === id || undefined}>
                      {recording === id
                        ? t("settings.shortcutRecording")
                        : parts.length > 0
                          ? parts.map((part) => <kbd className={styles.shortcutKey} key={part}>{part}</kbd>)
                          : t("settings.shortcutUnset")}
                    </span>
                    <span className={styles.shortcutEditHint}>{t("settings.shortcutClickEdit")}</span>
                  </Button>
                  {recording === id ? null : (
                    <Button
                      className={styles.shortcutRemove}
                      variant="ghost"
                      size="icon-xs"
                      type="button"
                      aria-label={t("settings.shortcutClearLabel", { name: label })}
                      onClick={() => {
                        persist({ ...shortcuts, [id]: { key: "", primary: false, shift: false, alt: false } });
                      }}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className={styles.shortcutResetRow}>
          {saved ? <span className={styles.savedBadge} role="status" aria-label={t("settings.saved")}>{t("settings.saved")}</span> : null}
          <Button className={styles.shortcutReset} variant="outline" type="button" onClick={() => {
            setShortcuts(resetKeyboardShortcuts());
            setSaved(true);
            setRecording(null);
          }}>{t("settings.shortcutReset")}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
