"use client"

import { ChevronDown, Clock3, Cloud, Ellipsis, File, Globe2, Grid2X2, Paperclip, Plus, Search, ShieldCheck, SlidersHorizontal, SquareCode } from "lucide-react"
import { useRef, type Dispatch, type SetStateAction } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { ScheduledTaskEditorDialog } from "@/features/scheduled-tasks"
import { useLocale } from "@/i18n/context"

import type { ProjectResourcePreview, ProjectScheduledPreview, ProjectWebsitePreview, ResourceKind } from "./project-workspace-model"
import dialogStyles from "./project-workspace-dialogs.module.css"

type Revision = NonNullable<EmptyStateProps["projectInstructionHistory"]>[number]
type DialogChange = (setOpen: (open: boolean) => void) => (open: boolean) => void

export type ProjectWorkspaceDialogsProps = {
  brandName?: string
  instructionsOpen: boolean
  setInstructionsOpen: Dispatch<SetStateAction<boolean>>
  instructions: string
  setInstructions: Dispatch<SetStateAction<string>>
  instructionsSaving: boolean
  setInstructionsSaving: Dispatch<SetStateAction<boolean>>
  instructionsError: boolean
  setInstructionsError: Dispatch<SetStateAction<boolean>>
  instructionsHistoryOpen: boolean
  setInstructionsHistoryOpen: Dispatch<SetStateAction<boolean>>
  selectedInstructionRevision: string | null
  setSelectedInstructionRevision: Dispatch<SetStateAction<string | null>>
  projectInstructionHistory: readonly Revision[]
  onSaveProjectInstructions?: EmptyStateProps["onSaveProjectInstructions"]
  resourcesOpen: boolean
  setResourcesOpen: Dispatch<SetStateAction<boolean>>
  resourceQuery: string
  setResourceQuery: Dispatch<SetStateAction<string>>
  setResourceKind: Dispatch<SetStateAction<ResourceKind>>
  resourceSearchRef: React.RefObject<HTMLInputElement | null>
  resourceInputRef: React.RefObject<HTMLInputElement | null>
  filteredResources: readonly ProjectResourcePreview[]
  handleResourceFiles: (files: FileList) => Promise<void>
  skillsOpen: boolean
  setSkillsOpen: Dispatch<SetStateAction<boolean>>
  skillQuery: string
  setSkillQuery: Dispatch<SetStateAction<string>>
  setSkillFilter: Dispatch<SetStateAction<"all" | "official">>
  skillBuilderEnabled: boolean
  setSkillBuilderEnabled: Dispatch<SetStateAction<boolean>>
  skillVisible: boolean
  onSetProjectSkillEnabled?: EmptyStateProps["onSetProjectSkillEnabled"]
  websitesOpen: boolean
  setWebsitesOpen: Dispatch<SetStateAction<boolean>>
  websiteQuery: string
  setWebsiteQuery: Dispatch<SetStateAction<string>>
  selectedWebsiteId: string | null
  setSelectedWebsiteId: Dispatch<SetStateAction<string | null>>
  linkedWebsiteId: string | null
  setLinkedWebsiteId: Dispatch<SetStateAction<string | null>>
  filteredWebsites: readonly ProjectWebsitePreview[]
  scheduledOpen: boolean
  setScheduledOpen: Dispatch<SetStateAction<boolean>>
  scheduledQuery: string
  setScheduledQuery: Dispatch<SetStateAction<string>>
  selectedScheduledId: string | null
  setSelectedScheduledId: Dispatch<SetStateAction<string | null>>
  linkedScheduledId: string | null
  setLinkedScheduledId: Dispatch<SetStateAction<string | null>>
  filteredScheduledTasks: readonly ProjectScheduledPreview[]
  scheduledEditorOpen: boolean
  setScheduledEditorOpen: Dispatch<SetStateAction<boolean>>
  onCreateProjectScheduledTask?: EmptyStateProps["onCreateProjectScheduledTask"]
  onOpenSettings?: EmptyStateProps["onOpenSettings"]
  onContextDialogChange: DialogChange
}

export function ProjectWorkspaceDialogs({
  brandName, instructionsOpen, setInstructionsOpen, instructions, setInstructions, instructionsSaving, setInstructionsSaving,
  instructionsError, setInstructionsError, instructionsHistoryOpen, setInstructionsHistoryOpen, selectedInstructionRevision,
  setSelectedInstructionRevision, projectInstructionHistory, onSaveProjectInstructions, resourcesOpen, setResourcesOpen,
  resourceQuery, setResourceQuery, setResourceKind, resourceSearchRef, resourceInputRef, filteredResources,
  handleResourceFiles, skillsOpen, setSkillsOpen, skillQuery, setSkillQuery, setSkillFilter, skillBuilderEnabled,
  setSkillBuilderEnabled, skillVisible, onSetProjectSkillEnabled, websitesOpen, setWebsitesOpen, websiteQuery, setWebsiteQuery,
  selectedWebsiteId, setSelectedWebsiteId, linkedWebsiteId, setLinkedWebsiteId, filteredWebsites, scheduledOpen, setScheduledOpen,
  scheduledQuery, setScheduledQuery, selectedScheduledId, setSelectedScheduledId, linkedScheduledId, setLinkedScheduledId,
  filteredScheduledTasks, scheduledEditorOpen, setScheduledEditorOpen, onCreateProjectScheduledTask, onOpenSettings,
  onContextDialogChange,
}: ProjectWorkspaceDialogsProps) {
  const { locale, t } = useLocale()
  const instructionsHistoryDialogRef = useRef<HTMLDivElement | null>(null)
  return <>
    <Dialog open={instructionsOpen} onOpenChange={onContextDialogChange(setInstructionsOpen)}>
      <DialogContent className={dialogStyles.instructionsDialog} overlayClassName={dialogStyles.instructionsOverlay ?? ""} closeLabel={t("shell.closeDialog")}>
        <DialogHeader className={dialogStyles.instructionsDialogHeader}><DialogTitle>{t("firstSite.projectInstructionsTitle")}</DialogTitle><DialogDescription>{t("firstSite.projectInstructionsDescription")}</DialogDescription></DialogHeader>
        <Textarea className={dialogStyles.instructionsTextarea} aria-label={t("firstSite.projectInstructionsTitle")} value={instructions} onChange={(event) => { setInstructions(event.target.value); setInstructionsError(false) }} />
        {instructionsError ? <p className={dialogStyles.instructionsError}>{t("firstSite.projectInstructionsSaveError")}</p> : null}
        <DialogFooter className={dialogStyles.instructionsDialogFooter}>
          <Button type="button" variant="outline" className={dialogStyles.instructionsHistory} onClick={() => { setSelectedInstructionRevision(projectInstructionHistory[0]?.id ?? null); setInstructionsHistoryOpen(true) }}>{t("firstSite.history")}</Button>
          <span className={dialogStyles.instructionsFooterSpacer} />
          <DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose>
          <Button type="button" disabled={instructionsSaving} onClick={async () => { setInstructionsSaving(true); setInstructionsError(false); try { await onSaveProjectInstructions?.(instructions); onContextDialogChange(setInstructionsOpen)(false) } catch { setInstructionsError(true) } finally { setInstructionsSaving(false) } }}>{t("firstSite.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={instructionsHistoryOpen} onOpenChange={setInstructionsHistoryOpen}>
      <DialogContent ref={instructionsHistoryDialogRef} tabIndex={-1} className={dialogStyles.instructionsHistoryDialog} overlayClassName={dialogStyles.instructionsOverlay ?? ""} closeLabel={t("shell.closeDialog")} onOpenAutoFocus={(event) => { event.preventDefault(); instructionsHistoryDialogRef.current?.focus() }}>
        <DialogTitle className={dialogStyles.instructionsHistoryTitle}>{t("firstSite.projectInstructionsHistory")}</DialogTitle>
        <div className={dialogStyles.instructionsHistoryLayout}><ul className={dialogStyles.instructionsRevisionList}>{projectInstructionHistory.length > 0 ? projectInstructionHistory.map((revision, index) => { const selected = (selectedInstructionRevision ?? projectInstructionHistory[0]?.id) === revision.id; const date = new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(revision.updatedAt); return <li key={revision.id}><Button type="button" variant="ghost" className={dialogStyles.instructionsRevision} data-selected={selected || undefined} aria-pressed={selected} onClick={() => setSelectedInstructionRevision(revision.id)}>{revision.current || index === 0 ? <small>{t("firstSite.currentVersion")}</small> : null}<strong>{date}</strong><span><i aria-hidden="true">{revision.actorName.slice(0, 1).toUpperCase()}</i>{revision.actorName}</span></Button></li> }) : <p className={dialogStyles.instructionsHistoryEmpty}>{t("firstSite.noInstructionHistory")}</p>}</ul><div className={dialogStyles.instructionsRevisionContent}>{projectInstructionHistory.find((revision) => revision.id === (selectedInstructionRevision ?? projectInstructionHistory[0]?.id))?.instruction ?? ""}</div></div>
      </DialogContent>
    </Dialog>

    <Dialog open={resourcesOpen} onOpenChange={onContextDialogChange(setResourcesOpen)}>
      <DialogContent className={dialogStyles.resourcesDialog} overlayClassName={dialogStyles.instructionsOverlay ?? ""} closeLabel={t("shell.closeDialog")}>
        <DialogTitle className={dialogStyles.resourcesDialogTitle}>{t("firstSite.filesAndResources")}</DialogTitle>
        <div className={dialogStyles.resourcesToolbar}><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" size="icon-sm" aria-label={t("firstSite.filter")}><SlidersHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" sideOffset={4}><DropdownMenuItem onSelect={() => setResourceKind("all")}>{t("library.filterAll")}</DropdownMenuItem><DropdownMenuItem onSelect={() => setResourceKind("file")}>{t("library.filterDocuments")}</DropdownMenuItem><DropdownMenuItem onSelect={() => setResourceKind("web")}>{t("firstSite.webResource")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu><label className={dialogStyles.resourcesSearch}><Search aria-hidden="true" /><Input ref={resourceSearchRef} aria-label={t("firstSite.searchResources")} placeholder={t("firstSite.searchResources")} value={resourceQuery} onChange={(event) => setResourceQuery(event.target.value)} /></label></div>
        {filteredResources.length > 0 ? <div className={dialogStyles.resourceList} role="list" aria-label={t("firstSite.filesAndResources")}>{filteredResources.map((resource) => <div key={resource.id} className={dialogStyles.resourceRow} role="listitem">{resource.kind === "web" ? <Globe2 aria-hidden="true" /> : <File aria-hidden="true" />}<span><strong>{resource.name}</strong><small>{resource.detail}</small></span></div>)}</div> : <div className={dialogStyles.resourcesEmpty}><File aria-hidden="true" /><p>{resourceQuery.trim() ? t("firstSite.noMatchingResources") : t("firstSite.filesHint")}</p></div>}
        <div className={dialogStyles.resourcesAddGroup}><input ref={resourceInputRef} id="project-resource-upload" className={dialogStyles.resourcesFileInput} type="file" multiple onChange={(event) => { if (event.currentTarget.files) void handleResourceFiles(event.currentTarget.files); event.currentTarget.value = "" }} /><Button type="button" onClick={() => resourceInputRef.current?.click()}><Plus />{t("firstSite.add")}</Button><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size="icon-sm" aria-label={t("firstSite.addMenu")}><ChevronDown aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent className={dialogStyles.resourcesAddMenu} align="end" sideOffset={4}><DropdownMenuItem onSelect={() => resourceInputRef.current?.click()}><Paperclip />{t("firstSite.addLocalFile")}</DropdownMenuItem><DropdownMenuItem onSelect={() => { setResourceKind("web"); window.requestAnimationFrame(() => resourceSearchRef.current?.focus()) }}><Globe2 />{t("firstSite.searchWeb")}</DropdownMenuItem><DropdownMenuSub><DropdownMenuSubTrigger><Grid2X2 />{t("firstSite.more")}</DropdownMenuSubTrigger><DropdownMenuSubContent className={dialogStyles.resourcesMoreMenu} sideOffset={4}><DropdownMenuItem onSelect={() => onOpenSettings?.("mcp")}><Cloud />{t("firstSite.addFromGoogleDrive")}</DropdownMenuItem><DropdownMenuItem onSelect={() => onOpenSettings?.("mcp")}><Cloud />{t("firstSite.addFromOneDrivePersonal")}</DropdownMenuItem><DropdownMenuItem onSelect={() => onOpenSettings?.("mcp")}><Cloud />{t("firstSite.addFromOneDriveWork")}</DropdownMenuItem></DropdownMenuSubContent></DropdownMenuSub></DropdownMenuContent></DropdownMenu></div>
      </DialogContent>
    </Dialog>

    <Dialog open={skillsOpen} onOpenChange={onContextDialogChange(setSkillsOpen)}>
      <DialogContent className={dialogStyles.projectSkillsDialog} overlayClassName={dialogStyles.instructionsOverlay ?? ""} closeLabel={t("shell.closeDialog")}>
        <DialogTitle className={dialogStyles.projectSkillsTitle}>{t("firstSite.projects")}{t("firstSite.skills")}</DialogTitle><p className={dialogStyles.projectSkillsHint}><span>{t("firstSite.projectSkillsHint")}</span><span aria-hidden="true"> · </span><Button type="button" variant="link" onClick={() => onOpenSettings?.("skills")}>{t("firstSite.viewMySkills")}</Button></p>
        <div className={dialogStyles.projectSkillsToolbar}><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" size="icon-sm" aria-label={t("firstSite.filter")}><SlidersHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" sideOffset={4}><DropdownMenuItem onSelect={() => setSkillFilter("all")}>{t("library.filterAll")}</DropdownMenuItem><DropdownMenuItem onSelect={() => setSkillFilter("official")}>{t("skills.official")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu><label className={dialogStyles.projectSkillsSearch}><Search /><Input aria-label={t("skills.searchPlaceholder")} placeholder={t("skills.searchPlaceholder")} value={skillQuery} onChange={(event) => setSkillQuery(event.target.value)} /></label><Button type="button" variant="outline" onClick={() => onOpenSettings?.("skills")}><Plus />{t("firstSite.add")}<ChevronDown aria-hidden="true" /></Button><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" size="icon-sm" aria-label={t("firstSite.more")}><Ellipsis /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" sideOffset={4}><DropdownMenuItem onSelect={() => onOpenSettings?.("skills")}>{t("firstSite.manageSkills")}</DropdownMenuItem><DropdownMenuItem onSelect={() => setSkillBuilderEnabled((enabled) => !enabled)}>{skillBuilderEnabled ? t("firstSite.disableSkill") : t("firstSite.enableSkill")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
        {skillVisible ? <article className={dialogStyles.projectSkillCard}><div className={dialogStyles.projectSkillCardTop}><h3>{t("firstSite.skillBuilder")}</h3><Switch checked={skillBuilderEnabled} aria-label={t("firstSite.skillBuilder")} onCheckedChange={async (enabled) => { const previous = skillBuilderEnabled; setSkillBuilderEnabled(enabled); try { await onSetProjectSkillEnabled?.("skill-builder", enabled) } catch { setSkillBuilderEnabled(previous) } }} /></div><p className={dialogStyles.projectSkillDescription}>{t("firstSite.skillBuilderDescription", { brand: brandName ?? "Kokoro" })}</p><footer className={dialogStyles.projectSkillFooter}><ShieldCheck /><span>{t("skills.official")}</span><span aria-hidden="true">·</span><span>{t("skills.updatedAt", { date: t("firstSite.updatedToday") })}</span><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={t("firstSite.more")}><Ellipsis /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" sideOffset={4}><DropdownMenuItem onSelect={() => onOpenSettings?.("skills")}>{t("firstSite.manageSkills")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></footer></article> : <div className={dialogStyles.projectSkillsEmpty}>{t("firstSite.noSkills")}</div>}
      </DialogContent>
    </Dialog>

    <Dialog open={websitesOpen} onOpenChange={onContextDialogChange(setWebsitesOpen)}>
      <DialogContent className={dialogStyles.projectPickerDialog} overlayClassName={dialogStyles.instructionsOverlay ?? ""} closeLabel={t("shell.closeDialog")}><DialogTitle className={dialogStyles.projectPickerTitle}>{t("firstSite.addWebsiteToProject")}</DialogTitle><label className={dialogStyles.projectPickerSearch}><Search aria-hidden="true" /><Input aria-label={t("firstSite.searchWebsites")} placeholder={t("firstSite.searchWebsites")} value={websiteQuery} onChange={(event) => setWebsiteQuery(event.target.value)} /></label>{filteredWebsites.length > 0 ? <div className={dialogStyles.projectPickerList} role="list" aria-label={t("firstSite.searchWebsites")}>{filteredWebsites.map((website) => { const selected = selectedWebsiteId === website.id || linkedWebsiteId === website.id; return <button key={website.id} type="button" className={dialogStyles.projectPickerRow} aria-pressed={selected} data-selected={selected || undefined} onClick={() => setSelectedWebsiteId(website.id)}><SquareCode aria-hidden="true" /><span><strong>{website.name}</strong><small>{website.detail}</small></span></button> })}</div> : <div className={dialogStyles.projectPickerEmpty}><SquareCode aria-hidden="true" /><span>{t("firstSite.noWebsites")}</span></div>}<DialogFooter className={dialogStyles.projectPickerFooter}><DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose><Button type="button" disabled={!selectedWebsiteId} onClick={() => { setLinkedWebsiteId(selectedWebsiteId); onContextDialogChange(setWebsitesOpen)(false) }}>{t("firstSite.save")}</Button></DialogFooter></DialogContent>
    </Dialog>

    <Dialog open={scheduledOpen} onOpenChange={onContextDialogChange(setScheduledOpen)}>
      <DialogContent className={dialogStyles.projectPickerDialog} overlayClassName={dialogStyles.instructionsOverlay ?? ""} closeLabel={t("shell.closeDialog")}><DialogTitle className={dialogStyles.projectPickerTitle}>{t("firstSite.projectScheduledTasks")}</DialogTitle><div className={dialogStyles.scheduledPickerToolbar}><label className={dialogStyles.projectPickerSearch}><Search aria-hidden="true" /><Input aria-label={t("firstSite.searchScheduledTasks")} placeholder={t("firstSite.searchScheduledTasks")} value={scheduledQuery} onChange={(event) => setScheduledQuery(event.target.value)} /></label><Button type="button" variant="outline" onClick={() => setScheduledEditorOpen(true)}><Plus />{t("firstSite.createNewItem")}</Button></div>{filteredScheduledTasks.length > 0 ? <div className={dialogStyles.projectPickerList} role="list" aria-label={t("firstSite.searchScheduledTasks")}>{filteredScheduledTasks.map((task) => { const selected = selectedScheduledId === task.id || linkedScheduledId === task.id; return <button key={task.id} type="button" className={dialogStyles.projectPickerRow} aria-pressed={selected} data-selected={selected || undefined} onClick={() => setSelectedScheduledId(task.id)}><Clock3 aria-hidden="true" /><span><strong>{task.title}</strong><small>{task.time} · {task.prompt}</small></span></button> })}</div> : <div className={dialogStyles.projectPickerEmpty}><Clock3 aria-hidden="true" /><span>{t("firstSite.noScheduledTasks")}</span></div>}<DialogFooter className={dialogStyles.projectPickerFooter}><DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose><Button type="button" disabled={!selectedScheduledId} onClick={() => { setLinkedScheduledId(selectedScheduledId); onContextDialogChange(setScheduledOpen)(false) }}>{t("firstSite.save")}</Button></DialogFooter></DialogContent>
    </Dialog>

    <ScheduledTaskEditorDialogBridge open={scheduledEditorOpen} onOpenChange={setScheduledEditorOpen} brandName={brandName ?? "Kokoro"} onSave={onCreateProjectScheduledTask} />
  </>
}

type ScheduledTaskEditorDialogBridgeProps = { open: boolean; onOpenChange: Dispatch<SetStateAction<boolean>>; brandName: string; onSave?: EmptyStateProps["onCreateProjectScheduledTask"] }
function ScheduledTaskEditorDialogBridge({ open, onOpenChange, brandName, onSave }: ScheduledTaskEditorDialogBridgeProps) {
  // The editor remains a feature-local boundary; keeping its adapter here avoids
  // coupling the workspace orchestrator to the dialog assembly.
  return <ScheduledTaskEditorDialog open={open} onOpenChange={onOpenChange} brandName={brandName} {...(onSave === undefined ? {} : { onSave })} />
}
