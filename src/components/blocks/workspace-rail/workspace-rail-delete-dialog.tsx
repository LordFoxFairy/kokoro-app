"use client"

import { useCallback, useEffect, useRef, type RefObject } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useT } from "@/i18n/context"
import type { ConversationSummary } from "@/ui/rail/rail-search"

type WorkspaceDeleteDialogProps = {
  target: ConversationSummary | null
  onClose: () => void
  onConfirm: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
  fallbackFocusRef?: RefObject<HTMLElement | null>
}

export function WorkspaceDeleteDialog({
  target,
  onClose,
  onConfirm,
  returnFocusRef,
  fallbackFocusRef,
}: WorkspaceDeleteDialogProps) {
  const t = useT()
  const focusRef = useRef<RefObject<HTMLElement | null> | undefined>(returnFocusRef)

  useEffect(() => {
    if (returnFocusRef) focusRef.current = returnFocusRef
  }, [returnFocusRef])

  const closeAndRestoreFocus = () => {
    onClose()
    scheduleFocusRestore()
  }
  const wasOpenRef = useRef(target !== null)
  const confirmedRef = useRef(false)

  const scheduleFocusRestore = useCallback(() => {
    const opener = confirmedRef.current
      ? fallbackFocusRef?.current
      : focusRef.current?.current
    if (!opener || !opener.isConnected || opener.hasAttribute("disabled") || opener.getAttribute("aria-hidden") === "true") {
      return
    }
    window.setTimeout(() => {
      if (opener.isConnected && !opener.hasAttribute("disabled") && opener.getAttribute("aria-hidden") !== "true") {
        opener.focus()
      }
    }, 0)
  }, [fallbackFocusRef])

  useEffect(() => {
    const wasOpen = wasOpenRef.current
    wasOpenRef.current = target !== null
    if (target !== null) confirmedRef.current = false
    if (!wasOpen || target !== null) return
    // The trigger may have lived inside a closing mobile Sheet. Restore focus
    // after Radix has completed its own close cycle.
    scheduleFocusRestore()
  }, [scheduleFocusRestore, target])

  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
          scheduleFocusRestore()
        }
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          const opener = confirmedRef.current
            ? fallbackFocusRef?.current
            : focusRef.current?.current
          // Own this handoff instead of allowing Radix to focus a removed
          // trigger or the body after a destructive action.
          if (!opener || !opener.isConnected || opener.hasAttribute("disabled") || opener.getAttribute("aria-hidden") === "true") {
            return
          }
          event.preventDefault()
          scheduleFocusRestore()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t("rail.deleteConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {target ? t("rail.deleteConfirmDescription", { title: target.title || t("rail.newChat") }) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={closeAndRestoreFocus}>{t("rail.deleteCancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              confirmedRef.current = true
              onConfirm()
            }}
          >
            {t("rail.deleteConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
