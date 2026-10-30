"use client"
import { Clock3, Plus, Search, SquareCode } from "lucide-react"
import type { Dispatch, SetStateAction } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame.types"
import { ScheduledTaskEditorDialog, type ScheduledTaskEditorValue } from "@/features/scheduled-tasks"
import { useLocale } from "@/i18n/context"
import type { ProjectScheduledPreview, ProjectWebsitePreview } from "./project-workspace-model"
import dialogStyles from "./project-workspace-dialogs.module.css"
type DialogChange = (setOpen: (open: boolean) => void) => (open: boolean) => void
export type ProjectWorkspaceDialogsProps = { preview: boolean; brandName?: string
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
  onContextDialogChange: DialogChange
}
export function ProjectWorkspaceDialogs({ preview, brandName, websitesOpen, setWebsitesOpen, websiteQuery, setWebsiteQuery, selectedWebsiteId, setSelectedWebsiteId, linkedWebsiteId, setLinkedWebsiteId, filteredWebsites, scheduledOpen, setScheduledOpen, scheduledQuery, setScheduledQuery, selectedScheduledId, setSelectedScheduledId, linkedScheduledId, setLinkedScheduledId, filteredScheduledTasks, scheduledEditorOpen, setScheduledEditorOpen, onCreateProjectScheduledTask, onContextDialogChange }: ProjectWorkspaceDialogsProps) {
 const { t } = useLocale()
 return <>
    <Dialog open={websitesOpen} onOpenChange={onContextDialogChange(setWebsitesOpen)}>
      <DialogContent className={dialogStyles.projectPickerDialog} overlayClassName={dialogStyles.instructionsOverlay ?? ""} closeLabel={t("shell.closeDialog")}><DialogTitle className={dialogStyles.projectPickerTitle}>{t("firstSite.addWebsiteToProject")}</DialogTitle><label className={dialogStyles.projectPickerSearch}><Search aria-hidden="true" /><Input aria-label={t("firstSite.searchWebsites")} placeholder={t("firstSite.searchWebsites")} value={websiteQuery} onChange={(event) => setWebsiteQuery(event.target.value)} /></label>{filteredWebsites.length > 0 ? <div className={dialogStyles.projectPickerList} role="list" aria-label={t("firstSite.searchWebsites")}>{filteredWebsites.map((website) => { const selected = selectedWebsiteId === website.id || linkedWebsiteId === website.id; return <button key={website.id} type="button" className={dialogStyles.projectPickerRow} aria-pressed={selected} data-selected={selected || undefined} onClick={() => setSelectedWebsiteId(website.id)}><SquareCode aria-hidden="true" /><span><strong>{website.name}</strong><small>{website.detail}</small></span></button> })}</div> : <div className={dialogStyles.projectPickerEmpty}><SquareCode aria-hidden="true" /><span>{t("firstSite.noWebsites")}</span></div>}<DialogFooter className={dialogStyles.projectPickerFooter}><DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose><Button type="button" disabled={!selectedWebsiteId} onClick={() => { setLinkedWebsiteId(selectedWebsiteId); onContextDialogChange(setWebsitesOpen)(false) }}>{t("firstSite.save")}</Button></DialogFooter></DialogContent>
    </Dialog>

    {preview ? <Dialog open={scheduledOpen} onOpenChange={onContextDialogChange(setScheduledOpen)}>
      <DialogContent className={dialogStyles.projectPickerDialog} overlayClassName={dialogStyles.instructionsOverlay ?? ""} closeLabel={t("shell.closeDialog")}><DialogTitle className={dialogStyles.projectPickerTitle}>{t("firstSite.projectScheduledTasks")}</DialogTitle><div className={dialogStyles.scheduledPickerToolbar}><label className={dialogStyles.projectPickerSearch}><Search aria-hidden="true" /><Input aria-label={t("firstSite.searchScheduledTasks")} placeholder={t("firstSite.searchScheduledTasks")} value={scheduledQuery} onChange={(event) => setScheduledQuery(event.target.value)} /></label><Button type="button" variant="outline" onClick={() => setScheduledEditorOpen(true)}><Plus />{t("firstSite.createNewItem")}</Button></div>{filteredScheduledTasks.length > 0 ? <div className={dialogStyles.projectPickerList} role="list" aria-label={t("firstSite.searchScheduledTasks")}>{filteredScheduledTasks.map((task) => { const selected = selectedScheduledId === task.id || linkedScheduledId === task.id; return <button key={task.id} type="button" className={dialogStyles.projectPickerRow} aria-pressed={selected} data-selected={selected || undefined} onClick={() => setSelectedScheduledId(task.id)}><Clock3 aria-hidden="true" /><span><strong>{task.title}</strong><small>{task.time} · {task.prompt}</small></span></button> })}</div> : <div className={dialogStyles.projectPickerEmpty}><Clock3 aria-hidden="true" /><span>{t("firstSite.noScheduledTasks")}</span></div>}<DialogFooter className={dialogStyles.projectPickerFooter}><DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose><Button type="button" disabled={!selectedScheduledId} onClick={() => { setLinkedScheduledId(selectedScheduledId); onContextDialogChange(setScheduledOpen)(false) }}>{t("firstSite.save")}</Button></DialogFooter></DialogContent>
    </Dialog> : null}

    {preview ? <ScheduledTaskEditorDialogBridge open={scheduledEditorOpen} onOpenChange={setScheduledEditorOpen} brandName={brandName ?? "Kokoro"} onSave={onCreateProjectScheduledTask} /> : null}
  </>
}

type ScheduledTaskEditorDialogBridgeProps = { open: boolean; onOpenChange: Dispatch<SetStateAction<boolean>>; brandName: string; onSave?: EmptyStateProps["onCreateProjectScheduledTask"] }
function ScheduledTaskEditorDialogBridge({ open, onOpenChange, brandName, onSave }: ScheduledTaskEditorDialogBridgeProps) {
  // The editor remains a feature-local boundary; keeping its adapter here avoids
  // coupling the workspace orchestrator to the dialog assembly.
  const save = onSave === undefined
    ? undefined
    : async (value: ScheduledTaskEditorValue): Promise<void> => {
      const { expiresAt, ...draft } = value
      await onSave({ ...draft, ...(typeof expiresAt === "string" ? { expiresAt } : {}) })
    }
  return <ScheduledTaskEditorDialog open={open} onOpenChange={onOpenChange} brandName={brandName} {...(save === undefined ? {} : { onSave: save })} />
}
