"use client"

import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useT } from "@/i18n/context"
import type { ProjectDeletionControl } from "./workspace-header.types"

/** The stable route header owns recovery even after its Project row is gone. */
export function WorkspaceHeaderProjectDeletion({ control, onCloseAutoFocus }: {
  control: ProjectDeletionControl
  onCloseAutoFocus: (event: Event) => void
}) {
  const t = useT()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const busy = control.status === "pending" || control.status === "reading"
  const snapshot = control.snapshot
  const errorKey = control.problem === "permission" ? "firstSite.projectDeletionForbidden"
    : control.problem === "conflict" ? "firstSite.projectDeletionConflict"
      : control.problem === "rate-limited" ? "firstSite.projectDeletionRateLimited"
        : control.problem === "unavailable" ? "firstSite.projectDeletionUnavailableResult"
          : control.problem === "in-progress" ? "firstSite.projectDeletionInProgress"
      : control.problem === "read" ? "firstSite.projectDeletionReadFailed"
        : control.problem === "unknown" ? "firstSite.projectDeletionUnknown" : "firstSite.projectDeletionRejected"
  return <Dialog open={control.open} onOpenChange={(open) => { if (!open) control.onClose() }}>
    <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
      onOpenAutoFocus={(event) => { event.preventDefault(); cancelRef.current?.focus() }}
      onCloseAutoFocus={onCloseAutoFocus}>
      <DialogHeader>
        <DialogTitle>{t("firstSite.deleteProject")}</DialogTitle>
        <DialogDescription>{t("firstSite.projectDeletionDescription")}</DialogDescription>
      </DialogHeader>
      <p className="break-words text-sm font-medium">{control.name}</p>
      {busy ? <p role="status" className="text-sm text-muted-foreground">{t(control.status === "pending" ? "firstSite.projectDeletionSending" : "firstSite.projectDeletionReading")}</p> : null}
      {snapshot ? <div role="status" className="grid gap-2 text-sm">
        <p>{t(snapshot.logical_release_state === "released" ? "firstSite.projectDeletionReleased"
          : snapshot.logical_release_state === "blocked" ? "firstSite.projectDeletionBlocked" : "firstSite.projectDeletionPending")}</p>
        <p className="text-muted-foreground">{t("firstSite.projectDeletionPhysicalPending")}</p>
      </div> : null}
      {control.problem ? <p role="alert" className="text-sm text-destructive">{t(errorKey)}</p> : null}
      <DialogFooter>
        <Button ref={cancelRef} type="button" variant="outline" onClick={control.onClose}>{t("firstSite.cancel")}</Button>
        {snapshot ? <Button type="button" onClick={control.onRead} disabled={busy || control.problem === "permission"}>{t("firstSite.projectDeletionRead")}</Button>
          : control.status === "unknown" ? <Button type="button" onClick={control.onRetry} disabled={busy}>{t("firstSite.projectDeletionRetry")}</Button>
            : <Button type="button" variant="destructive" onClick={control.onConfirm}
              disabled={busy || !control.available || control.status !== "idle"}>{t("firstSite.deleteProject")}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
