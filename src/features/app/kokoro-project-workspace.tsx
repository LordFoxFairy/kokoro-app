"use client"

import { Cable, ChevronDown, ChevronRight, Clock3, Cloud, Ellipsis, File, Globe2, Grid2X2, ListFilter, MessageSquare, Paperclip, Plus, Search, ShieldCheck, SlidersHorizontal, SquareCode, Upload, Wrench } from "lucide-react"
import Image from "next/image"
import { useCallback, useRef, useState, type MouseEvent } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { useLocale } from "@/i18n/context"

import { ProjectContextCard, ProjectContextSection } from "./project-context-card"
import { ProjectIdentity } from "./project-identity"
import { ProjectTaskEmpty } from "./project-task-empty"
import { KokoroProjectTaskWelcome } from "./kokoro-project-task-welcome"
import { ScheduledTaskEditorDialog } from "./scheduled-task-editor"
import styles from "./kokoro-project-workspace.module.css"

type ProjectWorkspaceProps = Pick<
  EmptyStateProps,
  "brandName" | "composer" | "onOpenSettings" | "onPrompt" | "projectConversations" | "activeProjectConversationId" | "onSelectProjectConversation" | "workspaceCapabilities"
  | "projectTask" | "projectInstructions" | "projectInstructionHistory" | "onSaveProjectInstructions" | "onUploadProjectResources" | "onSetProjectSkillEnabled" | "onCreateProjectScheduledTask"
>

/**
 * A project is a persistent workspace, not a renamed direct-chat screen.
 * Its Composer creates a project-scoped conversation; sibling context modules
 * hold the durable defaults that apply to every conversation in the project.
 */
export function KokoroProjectWorkspace({
  brandName,
  composer,
  onOpenSettings,
  projectConversations = [],
  activeProjectConversationId,
  onSelectProjectConversation,
  workspaceCapabilities,
  projectTask = false,
  projectInstructions = "",
  projectInstructionHistory = [],
  onSaveProjectInstructions,
  onUploadProjectResources,
  onSetProjectSkillEnabled,
  onCreateProjectScheduledTask,
}: ProjectWorkspaceProps) {
  const { locale, t } = useLocale()
  const capabilities = workspaceCapabilities
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [instructions, setInstructions] = useState(projectInstructions)
  const [instructionsSaving, setInstructionsSaving] = useState(false)
  const [instructionsError, setInstructionsError] = useState(false)
  const [instructionsHistoryOpen, setInstructionsHistoryOpen] = useState(false)
  const [selectedInstructionRevision, setSelectedInstructionRevision] = useState<string | null>(null)
  const instructionsHistoryDialogRef = useRef<HTMLDivElement | null>(null)
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [skillBuilderEnabled, setSkillBuilderEnabled] = useState(true)
  const [websitesOpen, setWebsitesOpen] = useState(false)
  const [scheduledOpen, setScheduledOpen] = useState(false)
  const [scheduledEditorOpen, setScheduledEditorOpen] = useState(false)
  const contextOpenerRef = useRef<HTMLButtonElement | null>(null)

  const rememberContextOpener = (event: MouseEvent<HTMLButtonElement>) => {
    contextOpenerRef.current = event.currentTarget
  }

  const restoreContextOpener = useCallback(() => {
    window.requestAnimationFrame(() => {
      const target = contextOpenerRef.current
      if (!target?.isConnected || target.disabled) return
      target.focus({ preventScroll: true })
    })
  }, [])

  const onContextDialogChange = useCallback((setOpen: (open: boolean) => void) => (open: boolean) => {
    setOpen(open)
    if (!open) restoreContextOpener()
  }, [restoreContextOpener])

  if (projectTask) {
    return <KokoroProjectTaskWelcome composer={composer} />
  }

  return (
    <section
      className={styles.surface}
      data-slot="project-workspace"
      data-locale={locale}
      data-resource-copy-lines={locale === "zh" || locale === "ko" ? "one" : "two"}
      aria-label={t("firstSite.projects")}
    >
      <div className={styles.main}>
        <ProjectIdentity brandName={brandName} />

        <div className={styles.composer}>{composer}</div>

        {capabilities?.projectConversations ? (
          <section className={styles.conversations} aria-labelledby="project-conversation-heading">
            <h2 id="project-conversation-heading">{t("firstSite.tasks")}</h2>
            <p>{t("firstSite.tasksPrivate")}</p>
            {projectConversations.length > 0 ? (
              <div className={styles.conversationList} role="list">
                {projectConversations.map((conversation) => (
                  <Button
                    key={conversation.id}
                    type="button"
                    variant={conversation.id === activeProjectConversationId ? "secondary" : "ghost"}
                    className={styles.conversationRow}
                    onClick={() => onSelectProjectConversation?.(conversation.id)}
                  >
                    <MessageSquare data-icon="inline-start" aria-hidden="true" />
                    <span>{conversation.title}</span>
                  </Button>
                ))}
              </div>
            ) : (
              <ProjectTaskEmpty />
            )}
          </section>
        ) : null}
      </div>

      <aside className={styles.context} aria-label={t("firstSite.workspaceStatus")}>
        {(capabilities?.instructions || capabilities?.connectors) ? (
          <Card className={styles.contextCard} data-context-kind="instructions">
            {capabilities?.instructions ? (
              <CardHeader className={styles.cardHeader}>
                <CardTitle className={styles.cardTitle}>
                  <Button type="button" variant="ghost" size="sm" onClick={(event) => {
                    rememberContextOpener(event)
                    setInstructions(projectInstructions)
                    setInstructionsError(false)
                    setInstructionsOpen(true)
                  }}>
                    {t("firstSite.instructions")}
                    <ChevronRight data-icon="inline-end" aria-hidden="true" />
                  </Button>
                </CardTitle>
              </CardHeader>
            ) : null}
            {capabilities?.instructions ? (
              <CardContent className={styles.cardDescription}>{t("firstSite.instructionsHint")}</CardContent>
            ) : null}
            {capabilities?.connectors ? (
              <CardFooter className={styles.connectorRow}>
                <Cable aria-hidden="true" />
                <span>{t("firstSite.connectors")}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => onOpenSettings?.("mcp")}>
                  <Plus data-icon="inline-start" aria-hidden="true" />
                  {t("firstSite.add")}
                </Button>
              </CardFooter>
            ) : null}
          </Card>
        ) : null}

        {(capabilities?.resources || capabilities?.skills) ? (
          <Card className={styles.contextCard} data-context-kind="resources-skills">
            {capabilities.resources ? (
              <ProjectContextSection
                title={t("firstSite.filesAndResources")}
                description={t("firstSite.filesHint")}
                actions={[
                  { label: t("firstSite.upload"), icon: Upload, trailingIcon: ChevronDown, statusDot: true },
                  { label: t("firstSite.searchWeb"), icon: ListFilter },
                ]}
                showChevron
                onClick={(event) => {
                  rememberContextOpener(event)
                  setResourcesOpen(true)
                }}
              />
            ) : null}
            {capabilities.skills ? (
              <ProjectContextSection
                title={t("firstSite.skills")}
                emptyLabel={t("firstSite.skillBuilder")}
                icon={Wrench}
                emptyVisual={<span className={styles.skillVisual}><Wrench aria-hidden="true" /></span>}
                action={t("firstSite.add")}
                actionIcon={Plus}
                actionIconOnly
                showChevron
                onClick={(event) => {
                  rememberContextOpener(event)
                  setSkillsOpen(true)
                }}
              />
            ) : null}
          </Card>
        ) : null}
        {capabilities?.websites ? (
          <ProjectContextCard
            kind="websites"
            title={t("firstSite.websites")}
            description={t("firstSite.websitesHint")}
            emptyVisual={
              <Image
                className={styles.projectEmptyArtwork}
                src="/site-assets/project-website.webp"
                width={75}
                height={64}
                loading="eager"
                alt=""
                aria-hidden="true"
              />
            }
            footerAction={{ label: t("firstSite.add"), icon: Plus }}
            onClick={(event) => {
              rememberContextOpener(event)
              setWebsitesOpen(true)
            }}
          />
        ) : null}
        {capabilities?.scheduledTasks ? (
          <ProjectContextCard
            kind="scheduled"
            title={t("firstSite.scheduledTasks")}
            description={t("firstSite.scheduledTasksHint")}
            emptyVisual={
              <Image
                className={styles.projectEmptyArtwork}
                src="/site-assets/project-scheduled-tasks.svg"
                width={75}
                height={64}
                alt=""
                aria-hidden="true"
              />
            }
            footerAction={{ label: t("firstSite.add"), icon: Plus }}
            onClick={(event) => {
              rememberContextOpener(event)
              setScheduledOpen(true)
            }}
          />
        ) : null}
      </aside>

      <Dialog open={instructionsOpen} onOpenChange={onContextDialogChange(setInstructionsOpen)}>
        <DialogContent className={styles.instructionsDialog} overlayClassName={styles.instructionsOverlay} closeLabel={t("shell.closeDialog")}>
          <DialogHeader className={styles.instructionsDialogHeader}>
            <DialogTitle>{t("firstSite.projectInstructionsTitle")}</DialogTitle>
            <DialogDescription>{t("firstSite.projectInstructionsDescription")}</DialogDescription>
          </DialogHeader>
          <Textarea
            className={styles.instructionsTextarea}
            aria-label={t("firstSite.projectInstructionsTitle")}
            value={instructions}
            onChange={(event) => {
              setInstructions(event.target.value)
              setInstructionsError(false)
            }}
          />
          {instructionsError ? <p className={styles.instructionsError}>{t("firstSite.projectInstructionsSaveError")}</p> : null}
          <DialogFooter className={styles.instructionsDialogFooter}>
            <Button type="button" variant="outline" className={styles.instructionsHistory} onClick={() => {
              setSelectedInstructionRevision(projectInstructionHistory[0]?.id ?? null)
              setInstructionsHistoryOpen(true)
            }}>{t("firstSite.history")}</Button>
            <span className={styles.instructionsFooterSpacer} />
            <DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose>
            <Button
              type="button"
              disabled={instructionsSaving}
              onClick={async () => {
                setInstructionsSaving(true)
                setInstructionsError(false)
                try {
                  await onSaveProjectInstructions?.(instructions)
                  onContextDialogChange(setInstructionsOpen)(false)
                } catch {
                  setInstructionsError(true)
                } finally {
                  setInstructionsSaving(false)
                }
              }}
            >{t("firstSite.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={instructionsHistoryOpen} onOpenChange={setInstructionsHistoryOpen}>
        <DialogContent
          ref={instructionsHistoryDialogRef}
          tabIndex={-1}
          className={styles.instructionsHistoryDialog}
          overlayClassName={styles.instructionsOverlay}
          closeLabel={t("shell.closeDialog")}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            instructionsHistoryDialogRef.current?.focus()
          }}
        >
          <DialogTitle className={styles.instructionsHistoryTitle}>{t("firstSite.projectInstructionsHistory")}</DialogTitle>
          <div className={styles.instructionsHistoryLayout}>
            <ul className={styles.instructionsRevisionList}>
              {projectInstructionHistory.length > 0 ? projectInstructionHistory.map((revision, index) => {
                const selected = (selectedInstructionRevision ?? projectInstructionHistory[0]?.id) === revision.id
                const date = new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(revision.updatedAt)
                return (
                  <li key={revision.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      className={styles.instructionsRevision}
                      data-selected={selected || undefined}
                      aria-pressed={selected}
                      onClick={() => setSelectedInstructionRevision(revision.id)}
                    >
                      {revision.current || index === 0 ? <small>{t("firstSite.currentVersion")}</small> : null}
                      <strong>{date}</strong>
                      <span><i aria-hidden="true">{revision.actorName.slice(0, 1).toUpperCase()}</i>{revision.actorName}</span>
                    </Button>
                  </li>
                )
              }) : <p className={styles.instructionsHistoryEmpty}>{t("firstSite.noInstructionHistory")}</p>}
            </ul>
            <div className={styles.instructionsRevisionContent}>
              {projectInstructionHistory.find((revision) => revision.id === (selectedInstructionRevision ?? projectInstructionHistory[0]?.id))?.instruction ?? ""}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={resourcesOpen} onOpenChange={onContextDialogChange(setResourcesOpen)}>
        <DialogContent className={styles.resourcesDialog} overlayClassName={styles.instructionsOverlay} closeLabel={t("shell.closeDialog")}>
          <DialogTitle className={styles.resourcesDialogTitle}>{t("firstSite.filesAndResources")}</DialogTitle>
          <div className={styles.resourcesToolbar}>
            <Button type="button" variant="outline" size="icon-sm" aria-label={t("firstSite.filter")}><SlidersHorizontal /></Button>
            <label className={styles.resourcesSearch}>
              <Search aria-hidden="true" />
              <Input aria-label={t("firstSite.searchResources")} placeholder={t("firstSite.searchResources")} />
            </label>
          </div>
          <div className={styles.resourcesEmpty}>
            <File aria-hidden="true" />
            <p>{t("firstSite.filesHint")}</p>
            <div className={styles.resourcesAddGroup}>
              <input id="project-resource-upload" className={styles.resourcesFileInput} type="file" multiple onChange={(event) => {
                if (event.currentTarget.files) void onUploadProjectResources?.(event.currentTarget.files)
                event.currentTarget.value = ""
              }} />
              <Button type="button" onClick={() => document.getElementById("project-resource-upload")?.click()}><Plus />{t("firstSite.add")}</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button type="button" size="icon-sm" aria-label={t("firstSite.addMenu")}><ChevronDown /></Button></DropdownMenuTrigger>
                <DropdownMenuContent className={styles.resourcesAddMenu} align="end" sideOffset={4}>
                  <DropdownMenuItem onSelect={() => document.getElementById("project-resource-upload")?.click()}><Paperclip />{t("firstSite.addLocalFile")}</DropdownMenuItem>
                  <DropdownMenuItem><Globe2 />{t("firstSite.searchWeb")}</DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger><Grid2X2 />{t("firstSite.more")}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className={styles.resourcesMoreMenu} sideOffset={4}>
                      <DropdownMenuItem onSelect={() => onOpenSettings?.("mcp")}><Cloud />{t("firstSite.addFromGoogleDrive")}</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onOpenSettings?.("mcp")}><Cloud />{t("firstSite.addFromOneDrivePersonal")}</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onOpenSettings?.("mcp")}><Cloud />{t("firstSite.addFromOneDriveWork")}</DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={skillsOpen} onOpenChange={onContextDialogChange(setSkillsOpen)}>
        <DialogContent className={styles.projectSkillsDialog} overlayClassName={styles.instructionsOverlay} closeLabel={t("shell.closeDialog")}>
          <DialogTitle className={styles.projectSkillsTitle}>{t("firstSite.projects")}{t("firstSite.skills")}</DialogTitle>
          <p className={styles.projectSkillsHint}>
            <span>{t("firstSite.projectSkillsHint")}</span>
            <span aria-hidden="true"> · </span>
            <Button type="button" variant="link" onClick={() => onOpenSettings?.("skills")}>{t("firstSite.viewMySkills")}</Button>
          </p>
          <div className={styles.projectSkillsToolbar}>
            <Button type="button" variant="outline" size="icon-sm" aria-label={t("firstSite.filter")}><SlidersHorizontal /></Button>
            <label className={styles.projectSkillsSearch}><Search /><Input aria-label={t("skills.searchPlaceholder")} placeholder={t("skills.searchPlaceholder")} /></label>
            <Button type="button" variant="outline" onClick={() => onOpenSettings?.("skills")}><Plus />{t("firstSite.add")}<ChevronDown /></Button>
            <Button type="button" variant="outline" size="icon-sm" aria-label={t("firstSite.more")}><Ellipsis /></Button>
          </div>
          <article className={styles.projectSkillCard}>
            <div className={styles.projectSkillCardTop}>
              <h3>{t("firstSite.skillBuilder")}</h3>
              <Switch
                checked={skillBuilderEnabled}
                aria-label={t("firstSite.skillBuilder")}
                onCheckedChange={async (enabled) => {
                  const previous = skillBuilderEnabled
                  setSkillBuilderEnabled(enabled)
                  try { await onSetProjectSkillEnabled?.("skill-builder", enabled) }
                  catch { setSkillBuilderEnabled(previous) }
                }}
              />
            </div>
            <p className={styles.projectSkillDescription}>{t("firstSite.skillBuilderDescription", { brand: brandName ?? "Kokoro" })}</p>
            <footer className={styles.projectSkillFooter}>
              <ShieldCheck /><span>{t("skills.official")}</span><span aria-hidden="true">·</span><span>{t("skills.updatedAt", { date: t("firstSite.updatedToday") })}</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t("firstSite.more")}><Ellipsis /></Button>
            </footer>
          </article>
        </DialogContent>
      </Dialog>

      <Dialog open={websitesOpen} onOpenChange={onContextDialogChange(setWebsitesOpen)}>
        <DialogContent className={styles.projectPickerDialog} overlayClassName={styles.instructionsOverlay} closeLabel={t("shell.closeDialog")}>
          <DialogTitle className={styles.projectPickerTitle}>{t("firstSite.addWebsiteToProject")}</DialogTitle>
          <label className={styles.projectPickerSearch}><Search aria-hidden="true" /><Input aria-label={t("firstSite.searchWebsites")} placeholder={t("firstSite.searchWebsites")} /></label>
          <div className={styles.projectPickerEmpty}><SquareCode aria-hidden="true" /><span>{t("firstSite.noWebsites")}</span></div>
          <DialogFooter className={styles.projectPickerFooter}>
            <DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose>
            <Button type="button" disabled>{t("firstSite.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduledOpen} onOpenChange={onContextDialogChange(setScheduledOpen)}>
        <DialogContent className={styles.projectPickerDialog} overlayClassName={styles.instructionsOverlay} closeLabel={t("shell.closeDialog")}>
          <DialogTitle className={styles.projectPickerTitle}>{t("firstSite.projectScheduledTasks")}</DialogTitle>
          <div className={styles.scheduledPickerToolbar}>
            <label className={styles.projectPickerSearch}><Search aria-hidden="true" /><Input aria-label={t("firstSite.searchScheduledTasks")} placeholder={t("firstSite.searchScheduledTasks")} /></label>
            <Button type="button" variant="outline" onClick={() => setScheduledEditorOpen(true)}><Plus />{t("firstSite.createNewItem")}</Button>
          </div>
          <div className={styles.projectPickerEmpty}><Clock3 aria-hidden="true" /><span>{t("firstSite.noScheduledTasks")}</span></div>
          <DialogFooter className={styles.projectPickerFooter}>
            <DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose>
            <Button type="button">{t("firstSite.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScheduledTaskEditorDialog
        open={scheduledEditorOpen}
        onOpenChange={setScheduledEditorOpen}
        brandName={brandName ?? "Kokoro"}
        onSave={onCreateProjectScheduledTask}
      />
    </section>
  )
}
