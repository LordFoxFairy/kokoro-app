"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"

import { useT } from "@/i18n/context"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

import styles from "./settings-sections.module.css"

// —— 快捷键：独立于对话偏好，保持 Manus 的设置分区与信息密度。
export function ShortcutsCard() {
  const t = useT()
  const [reset, setReset] = useState(false)
  const [recording, setRecording] = useState<string | null>(null)
  const defaultKeys: Record<string, string[]> = {
    newTask: ["⌘", "⇧", "O"],
    plan: ["⌘", "/"],
    voice: ["⌃", "D"],
    search: ["⌘", "K"],
    sidebar: ["⌘", "."],
  }
  const [shortcutKeys, setShortcutKeys] = useState<Record<string, string[]>>(defaultKeys)
  const shortcuts = [
    { id: "newTask", label: t("settings.shortcutNewTask") },
    { id: "plan", label: t("settings.shortcutPlan") },
    { id: "voice", label: t("settings.shortcutVoice") },
    { id: "search", label: t("settings.shortcutSearch") },
    { id: "sidebar", label: t("settings.shortcutSidebar") },
  ]

  useEffect(() => {
    if (!recording) return
    const captureShortcut = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        setRecording(null)
        return
      }
      if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) return
      event.preventDefault()
      event.stopPropagation()
      const nextKeys = [
        event.metaKey ? "⌘" : "",
        event.ctrlKey ? "⌃" : "",
        event.altKey ? "⌥" : "",
        event.shiftKey ? "⇧" : "",
        event.key.length === 1 ? event.key.toUpperCase() : event.key,
      ].filter(Boolean)
      setShortcutKeys((current) => ({ ...current, [recording]: nextKeys }))
      setRecording(null)
      setReset(false)
    }
    window.addEventListener("keydown", captureShortcut, true)
    return () => window.removeEventListener("keydown", captureShortcut, true)
  }, [recording])

  return (
    <Card className={`${styles.card} ${styles.shortcutsCard}`} data-settings-card data-testid="settings-shortcuts">
      <CardContent className={styles.cardContent}>
        <div className={styles.shortcutList}>
          {shortcuts.map((shortcut) => {
            const recordedKeys = shortcutKeys[shortcut.id]
            return (
            <div className={styles.shortcutRow} key={shortcut.label}>
              <div className={styles.shortcutLabel}>{shortcut.label}</div>
              <div className={styles.shortcutActions} data-recording={recording === shortcut.id || undefined}>
                <Button
                  className={styles.shortcutKeys}
                  variant="ghost"
                  type="button"
                  aria-label={t("settings.shortcutEditLabel", { name: shortcut.label })}
                  onClick={() => setRecording(shortcut.id)}
                >
                  <span className={styles.shortcutKeySet} data-recording={recording === shortcut.id || undefined}>
                    {recording === shortcut.id
                      ? t("settings.shortcutRecording")
                      : recordedKeys?.length
                        ? recordedKeys.map((key) => <kbd className={styles.shortcutKey} key={key}>{key}</kbd>)
                        : t("settings.shortcutUnset")}
                  </span>
                  <span className={styles.shortcutEditHint}>{t("settings.shortcutClickEdit")}</span>
                </Button>
                {recording === shortcut.id ? null : (
                  <Button
                    className={styles.shortcutRemove}
                    variant="ghost"
                    size="icon-xs"
                    type="button"
                    aria-label={t("settings.shortcutClearLabel", { name: shortcut.label })}
                    onClick={() => {
                      setShortcutKeys((current) => ({ ...current, [shortcut.id]: [] }))
                      setRecording(null)
                      setReset(false)
                    }}
                  >
                    <X aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
            )
          })}
        </div>
        <div className={styles.shortcutResetRow}>
          {reset ? <span className={styles.savedBadge} role="status" aria-label={t("settings.saved")}>{t("settings.saved")}</span> : null}
          <Button className={styles.shortcutReset} variant="outline" type="button" onClick={() => {
            setShortcutKeys(defaultKeys)
            setRecording(null)
            setReset(true)
          }}>{t("settings.shortcutReset")}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
