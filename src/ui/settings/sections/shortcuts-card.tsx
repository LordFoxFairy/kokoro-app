"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";

import {
  readKeyboardShortcuts,
  resetKeyboardShortcuts,
  sameKeyboardShortcut,
  matchesKeyboardShortcut,
  validKeyboardShortcut,
  shortcutFromKeyboardEvent,
  shortcutIds,
  type KeyboardShortcutMap,
  type ShortcutId,
  type ShortcutRecording,
  writeKeyboardShortcuts,
} from "@/lib/keyboard-shortcuts";
import { useKeyboardShortcuts, useKeyboardShortcutParts } from "@/hooks/use-keyboard-shortcuts";
import { useT } from "@/i18n/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import styles from "./settings-sections.module.css";

const shortcutLabels: Record<ShortcutId, "settings.shortcutNewTask" | "settings.shortcutSearch" | "settings.shortcutSidebar" | "settings.shortcutCopyTaskLink"> = {
  newTask: "settings.shortcutNewTask",
  search: "settings.shortcutSearch",
  sidebar: "settings.shortcutSidebar",
  copyTaskLink: "settings.shortcutCopyTaskLink",
};

/** Settings is the sole editing surface; AppFrame and Sidebar read this
 * persisted map when handling every keyboard event. */
export function ShortcutsCard() {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const shortcuts = useKeyboardShortcuts();
  const keyboardShortcutParts = useKeyboardShortcutParts();

  const persist = useCallback((next: KeyboardShortcutMap, source?: ShortcutRecording): void => {
    setSaved(false);
    try {
      writeKeyboardShortcuts(next, source);
      setError(null);
      setSaved(true);
    } catch (failure) {
      setError(t(failure instanceof Error && failure.message === "shortcut-conflict"
        ? "settings.shortcutConflict" : "settings.shortcutSaveFailed"));
    }
  }, [t]);

  useEffect(() => {
    if (!recording) return;
    const captureShortcut = (event: KeyboardEvent): void => {
      if (event.key === "Tab") {
        setRecording(null);
        setError(null);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        setRecording(null);
        setError(null);
        return;
      }
      if (event.repeat || event.isComposing) return;
      const shortcut = shortcutFromKeyboardEvent(event);
      if (shortcut === null) return;
      if (!validKeyboardShortcut(shortcut)) {
        setError(t("settings.shortcutInvalid"));
        return;
      }
      // Re-read so another tab's saved change cannot be silently overwritten.
      const current = readKeyboardShortcuts();
      if (shortcutIds.some((id) => id !== recording && (sameKeyboardShortcut(current[id], shortcut)
        || matchesKeyboardShortcut(event, current[id])))) {
        setError(t("settings.shortcutConflict"));
        return;
      }
      persist({ ...current, [recording]: shortcut }, { id: recording, event });
      setRecording(null);
    };
    window.addEventListener("keydown", captureShortcut, true);
    return () => window.removeEventListener("keydown", captureShortcut, true);
  }, [recording, t, persist]);

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
              <Fragment key={id}>
              <div className={styles.shortcutRow}>
                <div className={styles.shortcutLabel}>{label}{id === "copyTaskLink" ? <p>{t("settings.shortcutCopyTaskLinkHint")}</p> : null}</div>
                <div className={styles.shortcutActions} data-recording={recording === id || undefined}>
                  <Button
                    className={styles.shortcutKeys}
                    variant="ghost"
                    type="button"
                    aria-label={t("settings.shortcutEditLabel", { name: label })}
                    onClick={() => { setSaved(false); setError(null); setRecording(id); }}
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
                        setRecording(null);
                        persist({ ...readKeyboardShortcuts(), [id]: { key: "", primary: false, shift: false, alt: false } });
                      }}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>
              {id === "newTask" ? <div className={styles.shortcutRow}>
                <div className={styles.shortcutLabel}>{t("settings.shortcutVoice")}</div>
                <Button variant="ghost" disabled title={t("settings.shortcutVoiceUnavailable")}>{t("settings.shortcutVoiceUnavailable")}</Button>
              </div> : null}
              </Fragment>
            );
          })}
        </div>
        <p role={error ? "alert" : undefined}>{error ?? t("settings.shortcutHelp")}</p>
        <div className={styles.shortcutResetRow}>
          {recording ? <Button variant="outline" onClick={() => { setRecording(null); setError(null); }}>{t("settings.shortcutCancel")}</Button> : null}
          {saved ? <span className={styles.savedBadge} role="status" aria-label={t("settings.saved")}>{t("settings.saved")}</span> : null}
          <Button className={styles.shortcutReset} variant="outline" type="button" onClick={() => {
            setSaved(false);
            try {
              resetKeyboardShortcuts();
              setSaved(true);
              setError(null);
            } catch {
              setError(t("settings.shortcutSaveFailed"));
            }
            setRecording(null);
          }}>{t("settings.shortcutReset")}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
