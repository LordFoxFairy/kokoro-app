"use client"

import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import type { RefObject } from "react"
import { useRef, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useT } from "@/i18n/context"
import type {
  SkillInstallationUpdateFlow,
  SkillUpdateState,
} from "./skill-installation-update-flow"
import styles from "./skills-panel.module.css"

export function SkillInstallationUpdateDialog({
  flow,
  boundary,
  state,
  admitted,
  open,
  onOpenChange,
  onAbandoned,
  returnFocusRef,
  fallbackFocusRef,
}: {
  flow: SkillInstallationUpdateFlow
  boundary: ProjectReadBoundary
  state: SkillUpdateState
  admitted: boolean
  open: boolean
  onOpenChange: (value: boolean) => void
  onAbandoned: () => void
  returnFocusRef: RefObject<HTMLElement | null>
  fallbackFocusRef: RefObject<HTMLElement | null>
}) {
  const t = useT()
  const [confirmation, setConfirmation] = useState<SkillUpdateState | null>(null)
  const stopWaiting = useRef<HTMLButtonElement | null>(null)
  const busy = state.kind === "running"
  const close = () => {
    setConfirmation(null)
    flow.cancel(boundary)
    if (!state.acknowledged || state.kind === "completed") flow.reset(boundary)
    onOpenChange(false)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) close()
      }}
    >
      <DialogContent
        className={styles.updateDialog}
        closeLabel={t("skills.close")}
        onCloseAutoFocus={(event) => {
          const trigger = returnFocusRef.current
          const target =
            trigger?.isConnected && !trigger.matches(":disabled")
              ? trigger
              : fallbackFocusRef.current
          if (!target?.isConnected) return
          event.preventDefault()
          target.focus({ preventScroll: true })
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("skills.update.title")}</DialogTitle>
          <DialogDescription>
            {t("skills.update.description")}
          </DialogDescription>
        </DialogHeader>
        {admitted && state.current ? (
          <div className={styles.updateSummary}>
            <strong>{state.current.display_name}</strong>
            <p>
              {t("skills.update.versions", {
                current: state.current.revision,
                target: state.targetRevision ?? "",
              })}
            </p>
            <p>
              {state.current.enabled
                ? t("skills.personal.enabled")
                : t("skills.personal.disabled")}
            </p>
          </div>
        ) : null}
        {!admitted ? (
          <p role="status">{t("skills.localImport.session")}</p>
        ) : busy ? (
          <p role="status" aria-live="polite">
            {t(
              state.phase === "update"
                ? "skills.update.submitting"
                : "skills.update.reading",
            )}
          </p>
        ) : null}
        {admitted &&
        ["unknown", "read_failed", "unavailable"].includes(state.kind) ? (
          <Alert role="alert">
            <AlertDescription>
              {t(
                state.kind === "unknown"
                  ? "skills.update.unknown"
                  : state.kind === "unavailable"
                    ? "skills.update.unavailable"
                    : state.acknowledged
                      ? "skills.update.readFailed"
                      : "skills.update.checkFailed",
              )}
            </AlertDescription>
          </Alert>
        ) : null}
        {admitted && state.kind === "completed" ? (
          <p role="status">{t("skills.update.completed")}</p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            {t("skills.close")}
          </Button>
          {admitted && state.kind === "unknown" ? (
            <Button ref={stopWaiting} type="button" variant="ghost" onClick={() => setConfirmation(state)}>
              {t("skills.update.stopWaiting")}
            </Button>
          ) : null}
          {admitted && !busy && state.kind !== "completed" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void flow.readCurrent(boundary)}
            >
              {t("skills.personal.checkCurrent")}
            </Button>
          ) : null}
          {admitted &&
          !busy &&
          (state.kind === "unknown" ||
            (state.acknowledged && state.kind === "read_failed") ||
            (state.kind === "selected" && state.current)) ? (
            <Button type="button" onClick={() => void flow.confirm(boundary)}>
              {t(
                state.acknowledged
                  ? "skills.personal.checkCurrent"
                  : state.kind === "unknown"
                    ? "skills.update.retryOriginal"
                    : "skills.update.confirm",
              )}
            </Button>
          ) : null}
          {admitted &&
          !busy &&
          (state.kind === "completed" ||
            (!state.acknowledged && state.kind !== "unknown")) ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (flow.reset(boundary)) close()
              }}
            >
              {t(
                state.kind === "completed"
                  ? "skills.update.done"
                  : "skills.cancel",
              )}
            </Button>
          ) : null}
        </DialogFooter>
        <AlertDialog open={open && admitted && state.kind === "unknown" && confirmation === state}
          onOpenChange={value => { if (!value) setConfirmation(null) }}>
          <AlertDialogContent size="sm" onCloseAutoFocus={event => {
            if (!open || !admitted || !flow.matches(boundary) || flow.getSnapshot().kind !== "unknown" || !stopWaiting.current?.isConnected) return
            event.preventDefault()
            stopWaiting.current.focus({ preventScroll: true })
          }}>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("skills.update.stopWaitingTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("skills.update.stopWaitingDescription")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("skills.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => {
                if (confirmation && flow.abandon(boundary, confirmation)) {
                  setConfirmation(null)
                  onAbandoned()
                  onOpenChange(false)
                }
              }}>{t("skills.update.stopWaiting")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}
