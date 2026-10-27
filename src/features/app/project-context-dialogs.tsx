"use client"
import { ChevronDown, Cloud, File, Globe2, Grid2X2, Paperclip, Plus, Search, SlidersHorizontal } from "lucide-react"
import { useLayoutEffect, useRef, type Dispatch, type SetStateAction } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ProjectInstructionSaveError, type EmptyStateProps } from "@/components/blocks/app-frame/app-frame.types"
import { useLocale } from "@/i18n/context"
import { ProjectResourceRow } from "./project-resource-row"
import { ProjectResourceDetail, type ProjectResourceActions } from "./project-resource-detail"
import type { ResourceUploadIntent } from "./kokoro-project-workspace"
import type { ProjectResourcePreview, ResourceKind } from "./project-workspace-model"
import dialogStyles from "./project-workspace-dialogs.module.css"
type Revision = NonNullable<EmptyStateProps["projectInstructionHistory"]>[number]
type DialogChange = (setOpen: (open: boolean) => void) => (open: boolean) => void
export type ProjectContextDialogsProps = { preview: boolean
  historyAvailable?: boolean
  instructionsAvailable: boolean
  onInstructionsCloseAutoFocus: (event: Event) => void
  instructionsOpen: boolean
  setInstructionsOpen: Dispatch<SetStateAction<boolean>>
  instructions: string
  setInstructions: Dispatch<SetStateAction<string>>
  instructionsSaving: boolean
  setInstructionsSaving: Dispatch<SetStateAction<boolean>>
  instructionsError: boolean
  instructionsResult: ProjectInstructionSaveError | null
  setInstructionsResult: Dispatch<SetStateAction<ProjectInstructionSaveError | null>>
  setInstructionsError: Dispatch<SetStateAction<boolean>>
  instructionsHistoryOpen: boolean
  setInstructionsHistoryOpen: Dispatch<SetStateAction<boolean>>
  selectedInstructionRevision: string | null
  setSelectedInstructionRevision: Dispatch<SetStateAction<string | null>>
  projectInstructionHistory: readonly Revision[]
  onSaveProjectInstructions?: EmptyStateProps["onSaveProjectInstructions"]
  resourceActions: ProjectResourceActions
  resourceFocusContext: object
  resourcesAvailable: boolean
  resourcesOpen: boolean
  setResourcesOpen: Dispatch<SetStateAction<boolean>>
  resourceQuery: string
  setResourceQuery: Dispatch<SetStateAction<string>>
  setResourceKind: Dispatch<SetStateAction<ResourceKind>>
  resourceSearchRef: React.RefObject<HTMLInputElement | null>
  resourceInputRef: React.RefObject<HTMLInputElement | null>
  filteredResources: readonly ProjectResourcePreview[]
  resourceListStatus: "loading" | "loadingMore" | "ready" | "error"
  resourceRefreshFailed: boolean
  resourceNextCursor: string | null
  onLoadMoreResources: () => void
  resourceUploads: readonly ResourceUploadIntent[]
  onRetryResourceUpload: (intent: ResourceUploadIntent) => void
  handleResourceFiles: (files: FileList) => Promise<void>
  onOpenSettings?: EmptyStateProps["onOpenSettings"]
  onContextDialogChange: DialogChange
  active?: boolean
}
export function ProjectContextDialogs({ preview, active = true, historyAvailable = true, instructionsAvailable, onInstructionsCloseAutoFocus, instructionsOpen, setInstructionsOpen, instructions, setInstructions, instructionsSaving, setInstructionsSaving, instructionsError, instructionsResult, setInstructionsResult, setInstructionsError, instructionsHistoryOpen, setInstructionsHistoryOpen, selectedInstructionRevision, setSelectedInstructionRevision, projectInstructionHistory, onSaveProjectInstructions, resourceActions, resourceFocusContext, resourcesAvailable, resourcesOpen, setResourcesOpen, resourceQuery, setResourceQuery, setResourceKind, resourceSearchRef, resourceInputRef, filteredResources, resourceListStatus, resourceRefreshFailed, resourceNextCursor, onLoadMoreResources, resourceUploads, onRetryResourceUpload, handleResourceFiles, onOpenSettings, onContextDialogChange }: ProjectContextDialogsProps) {
 const { locale, t } = useLocale()
  const resourceReturnFocus = useRef<{ target: HTMLButtonElement; context: object; route: string } | null>(null)
  const activeResourceFocus = useRef(resourceFocusContext)
  useLayoutEffect(() => { activeResourceFocus.current = resourceFocusContext }, [resourceFocusContext])
  const instructionsHistoryDialogRef = useRef<HTMLDivElement | null>(null)
  const frozenInstruction = instructionsResult?.status === "unknown" || instructionsResult?.status === "read-error" || instructionsResult?.status === "forbidden"
  const saveInstruction = async () => {
    if (!active || !instructionsAvailable || instructionsSaving || !onSaveProjectInstructions || instructionsResult?.status === "forbidden") return
    setInstructionsSaving(true)
    setInstructionsError(false)
    try {
      await onSaveProjectInstructions(instructions)
      setInstructionsResult(null)
      setInstructionsOpen(false)
    } catch (error) {
      if (error instanceof ProjectInstructionSaveError) {
        setInstructions(error.instruction)
        setInstructionsResult(error)
      }
      setInstructionsError(true)
    } finally { setInstructionsSaving(false) }
  }
  return <>
    <Dialog open={active && instructionsOpen} onOpenChange={(open) => { if (!instructionsSaving) setInstructionsOpen(open) }}>
      <DialogContent onCloseAutoFocus={onInstructionsCloseAutoFocus}
        onEscapeKeyDown={(event) => { if (instructionsSaving) event.preventDefault() }}
        onPointerDownOutside={(event) => { if (instructionsSaving) event.preventDefault() }}
        onInteractOutside={(event) => { if (instructionsSaving) event.preventDefault() }}
        className={dialogStyles.instructionsDialog} overlayClassName={dialogStyles.instructionsOverlay ?? ""} closeLabel={t("shell.closeDialog")}>
        <DialogHeader className={dialogStyles.instructionsDialogHeader}><DialogTitle>{t("firstSite.projectInstructionsTitle")}</DialogTitle><DialogDescription>{t("firstSite.projectInstructionsDescription")}</DialogDescription></DialogHeader>
        <div className={dialogStyles.instructionsDialogBody}>
          <Textarea disabled={!instructionsAvailable || instructionsSaving || frozenInstruction} className={dialogStyles.instructionsTextarea} aria-label={t("firstSite.projectInstructionsTitle")} value={instructions} onChange={(event) => { setInstructions(event.target.value); setInstructionsError(false) }} />
          {instructionsError ? <p role="alert" className={dialogStyles.instructionsError}>{t(instructionsResult?.status === "unknown" ? "projectSkills.unknown"
            : instructionsResult?.status === "read-error" ? "projectSkills.ackReadFailed"
            : instructionsResult?.status === "forbidden" ? "skills.personal.forbidden" : "firstSite.projectInstructionsSaveError")}</p> : null}
        </div>
        <DialogFooter className={dialogStyles.instructionsDialogFooter}>
          <Button type="button" variant="outline" className={dialogStyles.instructionsHistory} disabled={!historyAvailable} onClick={() => { setSelectedInstructionRevision(projectInstructionHistory[0]?.id ?? null); setInstructionsHistoryOpen(true) }}>{t("firstSite.history")}</Button>
          <span className={dialogStyles.instructionsFooterSpacer} />
          <DialogClose asChild><Button type="button" variant="outline" disabled={instructionsSaving}>{t("firstSite.cancel")}</Button></DialogClose>
          <Button type="button" disabled={!instructionsAvailable || instructionsSaving || !onSaveProjectInstructions || instructionsResult?.status === "forbidden"} onClick={() => { void saveInstruction() }}>{t(instructionsResult?.status === "unknown" ? "projectSkills.retryOriginal" : instructionsResult?.status === "read-error" ? "projectSkills.reload" : "firstSite.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={active && historyAvailable && instructionsHistoryOpen} onOpenChange={setInstructionsHistoryOpen}>
      <DialogContent ref={instructionsHistoryDialogRef} tabIndex={-1} className={dialogStyles.instructionsHistoryDialog} overlayClassName={dialogStyles.instructionsOverlay ?? ""} closeLabel={t("shell.closeDialog")} onOpenAutoFocus={(event) => { event.preventDefault(); instructionsHistoryDialogRef.current?.focus() }}>
        <DialogTitle className={dialogStyles.instructionsHistoryTitle}>{t("firstSite.projectInstructionsHistory")}</DialogTitle>
        <div className={dialogStyles.instructionsHistoryLayout}><ul className={dialogStyles.instructionsRevisionList}>{projectInstructionHistory.length > 0 ? projectInstructionHistory.map((revision, index) => { const selected = (selectedInstructionRevision ?? projectInstructionHistory[0]?.id) === revision.id; const date = new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(revision.updatedAt); return <li key={revision.id}><Button type="button" variant="ghost" className={dialogStyles.instructionsRevision} data-selected={selected || undefined} aria-pressed={selected} onClick={() => setSelectedInstructionRevision(revision.id)}>{revision.current || index === 0 ? <small>{t("firstSite.currentVersion")}</small> : null}<strong>{date}</strong><span><i aria-hidden="true">{revision.actorName.slice(0, 1).toUpperCase()}</i>{revision.actorName}</span></Button></li> }) : <p className={dialogStyles.instructionsHistoryEmpty}>{t("firstSite.noInstructionHistory")}</p>}</ul><div className={dialogStyles.instructionsRevisionContent}>{projectInstructionHistory.find((revision) => revision.id === (selectedInstructionRevision ?? projectInstructionHistory[0]?.id))?.instruction ?? ""}</div></div>
      </DialogContent>
    </Dialog>

    <Dialog open={active && resourcesOpen} onOpenChange={onContextDialogChange(setResourcesOpen)}>
      <DialogContent aria-busy={resourceListStatus === "loading" || resourceListStatus === "loadingMore"} className={dialogStyles.resourcesDialog} overlayClassName={dialogStyles.instructionsOverlay ?? ""} closeLabel={t("shell.closeDialog")}>
        <DialogTitle className={dialogStyles.resourcesDialogTitle}>{t("firstSite.filesAndResources")}</DialogTitle>
        <div className={dialogStyles.resourcesToolbar}><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" size="icon-sm" aria-label={t("firstSite.filter")}><SlidersHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" sideOffset={4}><DropdownMenuItem onSelect={() => setResourceKind("all")}>{t("library.filterAll")}</DropdownMenuItem><DropdownMenuItem onSelect={() => setResourceKind("file")}>{t("library.filterDocuments")}</DropdownMenuItem><DropdownMenuItem onSelect={() => setResourceKind("web")}>{t("firstSite.webResource")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu><label className={dialogStyles.resourcesSearch}><Search aria-hidden="true" /><Input ref={resourceSearchRef} aria-label={t("firstSite.searchResources")} placeholder={t("firstSite.searchResources")} value={resourceQuery} onChange={(event) => setResourceQuery(event.target.value)} /></label></div>
        {resourceListStatus === "loading" || resourceListStatus === "loadingMore" ? <p className="sr-only" role="status">{t("firstSite.resourceListLoading")}</p> : null}
        {resourceListStatus === "error" || resourceRefreshFailed ? <p className="sr-only" role="status">{t("firstSite.resourceListFailed")}</p> : null}
        <div className="min-h-32" aria-busy={resourceListStatus === "loading" || resourceListStatus === "loadingMore"}>
          {resourcesAvailable && filteredResources.length > 0 ? <div className={dialogStyles.resourceList} role="list" aria-label={t("firstSite.filesAndResources")}>{filteredResources.map((resource) => <ProjectResourceRow key={resource.id} resource={resource} disabled={preview || !resourcesAvailable} onOpen={target => { resourceReturnFocus.current = { target, context: resourceFocusContext, route: `${location.pathname}${location.search}${location.hash}` }; resourceActions.open(resource.id) }} />)}</div>
            : resourcesAvailable && resourceListStatus === "ready" && !resourceRefreshFailed ? <div className={dialogStyles.resourcesEmpty}><File aria-hidden="true" /><p>{resourceQuery.trim() ? t("firstSite.noMatchingResources") : t("firstSite.resourceListEmpty")}</p></div> : null}
        </div>
        {resourceListStatus === "ready" && resourceNextCursor !== null ? <Button type="button" variant="outline" className={dialogStyles.resourceLoadMore} disabled={!resourcesAvailable} onClick={onLoadMoreResources}>{t("firstSite.resourceLoadMore")}</Button> : null}
        {resourceUploads.length > 0 ? <div className={dialogStyles.resourceUploadList} aria-live="polite">{resourceUploads.map((intent) => <div key={intent.id} className={dialogStyles.resourceUploadRow}>
          <File aria-hidden="true" />
          <span><strong>{intent.file.name}</strong><small role={intent.status === "failed" ? "alert" : "status"}>{intent.status === "uploading" ? t("firstSite.resourceUploading") : t(intent.error === "resource_file_infected" ? "firstSite.resourceInfected" : intent.error === "idempotency_conflict" || intent.error === "resource_upload_aborted" ? "firstSite.resourceUploadRestart" : intent.error === "request_body_too_large" || intent.error === "upload_http_413" ? "firstSite.resourceTooLarge" : intent.retryable ? "firstSite.resourceUploadFailed" : "firstSite.resourceUploadRejected", { name: intent.file.name })}</small></span>
          {intent.status === "failed" && intent.retryable ? <Button type="button" variant="outline" size="sm" disabled={!resourcesAvailable} onClick={() => onRetryResourceUpload(intent)} aria-label={t("firstSite.resourceRetryUpload", { name: intent.file.name })}>{t("firstSite.retry")}</Button> : null}
        </div>)}</div> : null}
        <div className={dialogStyles.resourcesAddGroup}><input ref={resourceInputRef} id="project-resource-upload" className={dialogStyles.resourcesFileInput} type="file" multiple disabled={!resourcesAvailable} onChange={(event) => { if (event.currentTarget.files) void handleResourceFiles(event.currentTarget.files); event.currentTarget.value = "" }} /><Button type="button" disabled={!resourcesAvailable} onClick={() => resourceInputRef.current?.click()}><Plus />{t("firstSite.add")}</Button><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size="icon-sm" disabled={!resourcesAvailable} aria-label={t("firstSite.addMenu")}><ChevronDown aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent className={dialogStyles.resourcesAddMenu} align="end" sideOffset={4}><DropdownMenuItem onSelect={() => resourceInputRef.current?.click()}><Paperclip />{t("firstSite.addLocalFile")}</DropdownMenuItem><DropdownMenuItem onSelect={() => { setResourceKind("web"); window.requestAnimationFrame(() => resourceSearchRef.current?.focus()) }}><Globe2 />{t("firstSite.searchWeb")}</DropdownMenuItem><DropdownMenuSub><DropdownMenuSubTrigger><Grid2X2 />{t("firstSite.more")}</DropdownMenuSubTrigger><DropdownMenuSubContent className={dialogStyles.resourcesMoreMenu} sideOffset={4}><DropdownMenuItem onSelect={() => onOpenSettings?.("mcp")}><Cloud />{t("firstSite.addFromGoogleDrive")}</DropdownMenuItem><DropdownMenuItem onSelect={() => onOpenSettings?.("mcp")}><Cloud />{t("firstSite.addFromOneDrivePersonal")}</DropdownMenuItem><DropdownMenuItem onSelect={() => onOpenSettings?.("mcp")}><Cloud />{t("firstSite.addFromOneDriveWork")}</DropdownMenuItem></DropdownMenuSubContent></DropdownMenuSub></DropdownMenuContent></DropdownMenu></div>
      </DialogContent>
    </Dialog>

    <ProjectResourceDetail actions={{ ...resourceActions, selected: active ? resourceActions.selected : null }} presentation={filteredResources.find(resource => resource.id === resourceActions.selected)} onReturnFocus={() => {
      const source = resourceReturnFocus.current
      if (source?.context !== activeResourceFocus.current || source.route !== `${location.pathname}${location.search}${location.hash}`) return
      const target = source.target.isConnected && !source.target.disabled ? source.target : resourceSearchRef.current
      if (target?.isConnected && (typeof target.checkVisibility !== "function" || target.checkVisibility())) target.focus({ preventScroll: true })
    }} />

  </>
}
