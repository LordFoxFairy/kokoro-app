"use client"

import { useId, useLayoutEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useT } from "@/i18n/context"
import { MoreHorizontal } from "lucide-react"
import type { ProjectContextControl, ProjectDeleteControl, ProjectInstructionControl, ProjectRenameControl } from "./workspace-header.types"

type WorkspaceHeaderProjectMenuProps = {
  projectRename?: ProjectRenameControl
  projectContext?: ProjectContextControl
  projectInstruction?: ProjectInstructionControl
  projectDelete?: ProjectDeleteControl
}

export function WorkspaceHeaderProjectMenu({ projectRename, projectContext, projectInstruction, projectDelete }: WorkspaceHeaderProjectMenuProps) {
  const t = useT()
  const inputId = useId()
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null)
  const renameReturnFocusRef = useRef<HTMLButtonElement | null>(null)
  const renameReturnFocusRouteRef = useRef<string | null>(null)
  const renameReturnFocusScopeRef = useRef<object | null>(null)
  const deleteReturnFocusRef = useRef<HTMLButtonElement | null>(null)
  const deleteReturnFocusRouteRef = useRef<string | null>(null)
  const deleteReturnFocusScopeRef = useRef<object | null>(null)
  const activeFocusScopeRef = useRef<object | null>(null)
  const focusScopeToken = projectRename?.focusScopeToken ?? projectDelete?.focusScopeToken ?? null
  useLayoutEffect(() => {
    activeFocusScopeRef.current = focusScopeToken
    return () => {
      if (activeFocusScopeRef.current === focusScopeToken) activeFocusScopeRef.current = null
    }
  }, [focusScopeToken])
  const busy = projectRename?.status === "pending" || projectRename?.status === "confirming-read"
  const deleteBusy = projectDelete?.status === "pending"
  const problem = projectRename?.problem
  const errorKey = problem === "invalid" ? "firstSite.projectRenameInvalid"
    : problem === "permission" ? "firstSite.projectRenameForbidden"
      : problem === "read" ? "firstSite.projectRenameReadFailed"
        : problem === "unknown" ? "firstSite.projectRenameUnknown" : "firstSite.projectRenameRejected"

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={(node) => { moreTriggerRef.current = node; projectInstruction?.onTriggerMount(node); projectContext?.onTriggerMount(node) }} type="button" variant="ghost" size="icon-sm" className="size-8 min-h-8" aria-label={t("firstSite.projectOptions")}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {projectRename?.available ? (
            <DropdownMenuItem onSelect={() => {
              const source = moreTriggerRef.current
              renameReturnFocusRef.current = source?.isConnected ? source : null
              renameReturnFocusRouteRef.current = source?.isConnected
                ? `${window.location.pathname}${window.location.search}${window.location.hash}` : null
              renameReturnFocusScopeRef.current = source?.isConnected ? projectRename.focusScopeToken : null
              projectRename.onOpen()
            }}>{t("firstSite.renameProject")}</DropdownMenuItem>
          ) : null}
          {projectContext?.available ? <DropdownMenuItem onSelect={() => projectContext.onOpen(moreTriggerRef.current)}>{t("firstSite.projectSettings")}</DropdownMenuItem> : null}
          {projectInstruction?.available ? <DropdownMenuItem onSelect={() => projectInstruction.onOpen(moreTriggerRef.current)}>{t("firstSite.editProjectInstructions")}</DropdownMenuItem> : null}
          {projectDelete?.available ? <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => {
            const source = moreTriggerRef.current
            deleteReturnFocusRef.current = source?.isConnected ? source : null
            deleteReturnFocusRouteRef.current = source?.isConnected
              ? `${window.location.pathname}${window.location.search}${window.location.hash}` : null
            deleteReturnFocusScopeRef.current = source?.isConnected ? projectDelete.focusScopeToken : null
            projectDelete.onOpen()
          }}>{t("firstSite.deleteProject")}</DropdownMenuItem> : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {projectRename ? (
        <Dialog open={projectRename.open} onOpenChange={(open) => { if (!open && !busy) projectRename.onClose() }}>
          <DialogContent showCloseButton={false}
            onCloseAutoFocus={(event) => {
              const source = renameReturnFocusRef.current
              const sourceRoute = renameReturnFocusRouteRef.current
              const sourceScope = renameReturnFocusScopeRef.current
              renameReturnFocusRef.current = null
              renameReturnFocusRouteRef.current = null
              renameReturnFocusScopeRef.current = null
              const currentRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`
              if (!projectRename.available || currentRoute !== sourceRoute || sourceScope !== activeFocusScopeRef.current
                || !sourceScope || !source?.isConnected || source !== moreTriggerRef.current) return
              event.preventDefault()
              source.focus()
            }}
            onEscapeKeyDown={(event) => { if (busy) event.preventDefault() }}
            onPointerDownOutside={(event) => { if (busy) event.preventDefault() }}
            onInteractOutside={(event) => { if (busy) event.preventDefault() }}>
            <DialogHeader>
              <DialogTitle>{t("firstSite.renameProject")}</DialogTitle>
              <DialogDescription>{t("firstSite.projectRenameDescription")}</DialogDescription>
            </DialogHeader>
            <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (!busy && !projectRename.frozen) projectRename.onSave() }}>
              <div className="grid gap-2">
                <label htmlFor={inputId} className="text-sm font-medium">{t("firstSite.projectName")}</label>
                <Input id={inputId} value={projectRename.name} disabled={busy || projectRename.frozen}
                  onChange={(event) => projectRename.onChange(event.target.value)} aria-invalid={problem === "invalid"} />
              </div>
              {busy ? <p role="status" className="text-sm text-muted-foreground">
                {t(projectRename.status === "pending" ? "firstSite.projectRenameSaving" : "firstSite.projectRenameReading")}
              </p> : null}
              {problem ? <p role="alert" className="text-sm text-destructive">{t(errorKey)}</p> : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={projectRename.onClose} disabled={busy}>{t("firstSite.cancel")}</Button>
                {projectRename.status === "unknown" || projectRename.status === "read-error" ? (
                  <Button type="button" onClick={projectRename.onRetry} disabled={busy}>
                    {t(projectRename.status === "read-error" ? "firstSite.projectRenameReadRetry" : "firstSite.projectRenameRetry")}
                  </Button>
                ) : <Button type="submit" disabled={busy || projectRename.frozen || !projectRename.available}>{t("firstSite.save")}</Button>}
                {projectRename.frozen && !busy && problem !== "permission" ? (
                  <Button type="button" variant="outline" onClick={projectRename.onRestart}>{t("firstSite.projectRenameRestart")}</Button>
                ) : null}
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      {projectDelete ? (
        <Dialog open={projectDelete.open} onOpenChange={(open) => { if (!open && !deleteBusy) projectDelete.onClose() }}>
          <DialogContent showCloseButton={false}
            onCloseAutoFocus={(event) => {
              const source = deleteReturnFocusRef.current
              const sourceRoute = deleteReturnFocusRouteRef.current
              const sourceScope = deleteReturnFocusScopeRef.current
              deleteReturnFocusRef.current = null
              deleteReturnFocusRouteRef.current = null
              deleteReturnFocusScopeRef.current = null
              const currentRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`
              if (!projectDelete.available || currentRoute !== sourceRoute || sourceScope !== activeFocusScopeRef.current
                || !sourceScope || !source?.isConnected || source !== moreTriggerRef.current) return
              event.preventDefault()
              source.focus()
            }}
            onEscapeKeyDown={(event) => { if (deleteBusy) event.preventDefault() }}
            onPointerDownOutside={(event) => { if (deleteBusy) event.preventDefault() }}
            onInteractOutside={(event) => { if (deleteBusy) event.preventDefault() }}>
            <DialogHeader>
              <DialogTitle>{t("firstSite.deleteProject")}</DialogTitle>
              <DialogDescription>
                <span className="block font-medium text-foreground">{t("firstSite.projectDeleteTarget", { name: projectDelete.targetName })}</span>
                <span className="mt-2 block">{t("firstSite.projectDeleteDescription")}</span>
              </DialogDescription>
            </DialogHeader>
            {deleteBusy ? <p role="status" className="text-sm text-muted-foreground">{t("firstSite.projectDeleting")}</p> : null}
            {projectDelete.problem ? <p role="alert" className="text-sm text-destructive">
              {t(projectDelete.problem === "permission" ? "firstSite.projectDeleteForbidden"
                : projectDelete.problem === "read" ? "firstSite.projectDeleteReadFailed"
                  : projectDelete.problem === "unknown" ? "firstSite.projectDeleteUnknown" : "firstSite.projectDeleteRejected")}
            </p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={projectDelete.onClose} disabled={deleteBusy}>{t("firstSite.cancel")}</Button>
              {projectDelete.problem === "unknown" || projectDelete.problem === "read" ? (
                <>
                  <Button type="button" variant="outline" onClick={projectDelete.onCheck} disabled={deleteBusy}>{t("firstSite.projectDeleteCheck")}</Button>
                  {projectDelete.problem === "unknown" || projectDelete.problem === "read" ? <Button type="button" onClick={projectDelete.onRetry} disabled={deleteBusy}>{t("firstSite.projectDeleteRetry")}</Button> : null}
                </>
              ) : <Button type="button" variant="destructive" onClick={projectDelete.onConfirm} disabled={deleteBusy || projectDelete.frozen || !projectDelete.available}>{t("firstSite.deleteProject")}</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}
