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
import { Skeleton } from "@/components/ui/skeleton"
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
  "brandName" | "composer" | "onOpenSettings" | "onPrompt" | "projectConversations" | "projectConversationsLoading" | "projectConversationsError" | "onRetryProjectConversations" | "activeProjectConversationId" | "onSelectProjectConversation" | "workspaceCapabilities"
  | "projectTask" | "projectInstructions" | "projectInstructionHistory" | "onSaveProjectInstructions" | "onUploadProjectResources" | "onSetProjectSkillEnabled" | "onCreateProjectScheduledTask"
>

type ResourceKind = "all" | "file" | "web"

type ProjectResourcePreview = {
  id: string
  name: string
  kind: Exclude<ResourceKind, "all">
  detail: string
}

type ProjectWebsitePreview = {
  id: string
  name: string
  detail: string
}

type ProjectScheduledPreview = {
  id: string
  title: string
  prompt: string
  frequency: "daily" | "weekly"
  time: string
  timezone: string
  autoApprove: boolean
}

const previewResources: readonly ProjectResourcePreview[] = [
  { id: "research-brief", name: "研究简报.md", kind: "file", detail: "Markdown · 4 KB" },
  { id: "kokoro-product-site", name: "Kokoro 产品网站", kind: "web", detail: "网页参考" },
]

const previewWebsites: readonly ProjectWebsitePreview[] = [
  { id: "kokoro-product-site", name: "Kokoro 产品网站", detail: "kokoro.miaokit.cloud" },
  { id: "launch-notes-site", name: "产品发布页", detail: "launch.example.test" },
]

const previewScheduledTasks: readonly ProjectScheduledPreview[] = [
  {
    id: "daily-briefing",
    title: "每日简报",
    prompt: "汇总今天的重要消息",
    frequency: "daily",
    time: "08:00",
    timezone: "UTC",
    autoApprove: false,
  },
]

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
  projectConversationsLoading = false,
  projectConversationsError = false,
  onRetryProjectConversations,
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
  const [resourceQuery, setResourceQuery] = useState("")
  const [resourceKind, setResourceKind] = useState<ResourceKind>("all")
  const [resourceItems, setResourceItems] = useState<readonly ProjectResourcePreview[]>(previewResources)
  const resourceInputRef = useRef<HTMLInputElement | null>(null)
  const resourceSearchRef = useRef<HTMLInputElement | null>(null)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [skillQuery, setSkillQuery] = useState("")
  const [skillFilter, setSkillFilter] = useState<"all" | "official">("all")
  const [skillBuilderEnabled, setSkillBuilderEnabled] = useState(true)
  const [websitesOpen, setWebsitesOpen] = useState(false)
  const [websiteQuery, setWebsiteQuery] = useState("")
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string | null>(null)
  const [linkedWebsiteId, setLinkedWebsiteId] = useState<string | null>(null)
  const [scheduledOpen, setScheduledOpen] = useState(false)
  const [scheduledQuery, setScheduledQuery] = useState("")
  const [scheduledItems, setScheduledItems] = useState<readonly ProjectScheduledPreview[]>(previewScheduledTasks)
  const [selectedScheduledId, setSelectedScheduledId] = useState<string | null>(null)
  const [linkedScheduledId, setLinkedScheduledId] = useState<string | null>(null)
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

  const openResources = (event: MouseEvent<HTMLButtonElement>, kind: ResourceKind = "all") => {
    rememberContextOpener(event)
    setResourceKind(kind)
    setResourceQuery("")
    setResourcesOpen(true)
    if (kind === "web") {
      window.requestAnimationFrame(() => resourceSearchRef.current?.focus())
    }
  }

  const openResourceUpload = (event: MouseEvent<HTMLButtonElement>) => {
    openResources(event)
    window.requestAnimationFrame(() => resourceInputRef.current?.click())
  }

  const filteredResources = resourceItems.filter((resource) => {
    const queryMatches = resourceQuery.trim().length === 0
      || `${resource.name} ${resource.detail}`.toLocaleLowerCase().includes(resourceQuery.trim().toLocaleLowerCase())
    return queryMatches && (resourceKind === "all" || resource.kind === resourceKind)
  })

  const filteredWebsites = previewWebsites.filter((website) => {
    const query = websiteQuery.trim().toLocaleLowerCase()
    return query.length === 0 || `${website.name} ${website.detail}`.toLocaleLowerCase().includes(query)
  })

  const filteredScheduledTasks = scheduledItems.filter((task) => {
    const query = scheduledQuery.trim().toLocaleLowerCase()
    return query.length === 0 || `${task.title} ${task.prompt}`.toLocaleLowerCase().includes(query)
  })

  const skillMatches = skillQuery.trim().length === 0 || t("firstSite.skillBuilder").toLocaleLowerCase().includes(skillQuery.trim().toLocaleLowerCase())
  const skillVisible = skillMatches && (skillFilter === "all" || skillFilter === "official")

  const handleResourceFiles = async (files: FileList) => {
    if (files.length === 0) return
    const added = Array.from(files).map((file, index) => ({
      id: `upload-${file.name}-${file.lastModified}-${index}`,
      name: file.name,
      kind: "file" as const,
      detail: `${file.type || "文件"} · ${Math.max(1, Math.ceil(file.size / 1024))} KB`,
    }))
    setResourceItems((current) => [...added, ...current])
    try {
      await onUploadProjectResources?.(files)
    } catch {
      setResourceItems((current) => current.filter((item) => !added.some((candidate) => candidate.id === item.id)))
    }
  }

  const handleScheduledTaskSave = async (task: {
    title: string
    prompt: string
    frequency: string
    time: string
    timezone?: string
    expiresAt?: string
    autoApprove: boolean
  }) => {
    await onCreateProjectScheduledTask?.(task)
    const created: ProjectScheduledPreview = {
      id: `scheduled-${task.title}-${task.time}`,
      title: task.title,
      prompt: task.prompt,
      frequency: task.frequency === "weekly" ? "weekly" : "daily",
      time: task.time,
      timezone: task.timezone ?? "UTC",
      autoApprove: task.autoApprove,
    }
    setScheduledItems((current) => [created, ...current.filter((item) => item.id !== created.id)])
    setSelectedScheduledId(created.id)
    setLinkedScheduledId(created.id)
  }

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
            {projectConversationsLoading ? (
              <div className={styles.conversationState} data-testid="project-conversations-loading" aria-busy="true">
                <div className={styles.conversationLoadingRows} aria-hidden="true">
                  <Skeleton className={styles.conversationLoadingRow} />
                  <Skeleton className={styles.conversationLoadingRow} />
                  <Skeleton className={styles.conversationLoadingRowShort} />
                </div>
                <p className={styles.conversationLoadingMessage} role="status">{t("firstSite.tasksLoading")}</p>
              </div>
            ) : projectConversationsError ? (
              <div className={styles.conversationState} data-testid="project-conversations-error" role="alert" aria-labelledby="project-conversations-error-title">
                <p id="project-conversations-error-title" className={styles.conversationErrorMessage}>{t("firstSite.tasksError")}</p>
                <Button type="button" variant="outline" onClick={onRetryProjectConversations} disabled={!onRetryProjectConversations}>
                  {t("firstSite.retry")}
                </Button>
              </div>
            ) : projectConversations.length > 0 ? (
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
                  { id: "upload", label: t("firstSite.upload"), icon: Upload, trailingIcon: ChevronDown, statusDot: true },
                  { id: "search-web", label: t("firstSite.searchWeb"), icon: ListFilter },
                ]}
                showChevron
                onClick={(event) => {
                  openResources(event)
                }}
                onAction={(id, event) => {
                  if (id === "upload") {
                    openResourceUpload(event)
                    return
                  }
                  if (id === "search-web") {
                    openResources(event, "web")
                  }
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
              setWebsiteQuery("")
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
              setScheduledQuery("")
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon-sm" aria-label={t("firstSite.filter")}><SlidersHorizontal /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={4}>
                <DropdownMenuItem onSelect={() => setResourceKind("all")}>{t("library.filterAll")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setResourceKind("file")}>{t("library.filterDocuments")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setResourceKind("web")}>{t("firstSite.webResource")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <label className={styles.resourcesSearch}>
              <Search aria-hidden="true" />
              <Input
                ref={resourceSearchRef}
                aria-label={t("firstSite.searchResources")}
                placeholder={t("firstSite.searchResources")}
                value={resourceQuery}
                onChange={(event) => setResourceQuery(event.target.value)}
              />
            </label>
          </div>
          {filteredResources.length > 0 ? (
            <div className={styles.resourceList} role="list" aria-label={t("firstSite.filesAndResources")}>
              {filteredResources.map((resource) => (
                <div key={resource.id} className={styles.resourceRow} role="listitem">
                  {resource.kind === "web" ? <Globe2 aria-hidden="true" /> : <File aria-hidden="true" />}
                  <span><strong>{resource.name}</strong><small>{resource.detail}</small></span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.resourcesEmpty}>
              <File aria-hidden="true" />
              <p>{resourceQuery.trim() ? t("firstSite.noMatchingResources") : t("firstSite.filesHint")}</p>
            </div>
          )}
          <div className={styles.resourcesAddGroup}>
            <input
              ref={resourceInputRef}
              id="project-resource-upload"
              className={styles.resourcesFileInput}
              type="file"
              multiple
              onChange={(event) => {
                if (event.currentTarget.files) void handleResourceFiles(event.currentTarget.files)
                event.currentTarget.value = ""
              }}
            />
            <Button type="button" onClick={() => resourceInputRef.current?.click()}><Plus />{t("firstSite.add")}</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" size="icon-sm" aria-label={t("firstSite.addMenu")}><ChevronDown /></Button></DropdownMenuTrigger>
              <DropdownMenuContent className={styles.resourcesAddMenu} align="end" sideOffset={4}>
                <DropdownMenuItem onSelect={() => resourceInputRef.current?.click()}><Paperclip />{t("firstSite.addLocalFile")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => {
                  setResourceKind("web")
                  window.requestAnimationFrame(() => resourceSearchRef.current?.focus())
                }}><Globe2 />{t("firstSite.searchWeb")}</DropdownMenuItem>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon-sm" aria-label={t("firstSite.filter")}><SlidersHorizontal /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={4}>
                <DropdownMenuItem onSelect={() => setSkillFilter("all")}>{t("library.filterAll")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSkillFilter("official")}>{t("skills.official")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <label className={styles.projectSkillsSearch}>
              <Search />
              <Input
                aria-label={t("skills.searchPlaceholder")}
                placeholder={t("skills.searchPlaceholder")}
                value={skillQuery}
                onChange={(event) => setSkillQuery(event.target.value)}
              />
            </label>
            <Button type="button" variant="outline" onClick={() => onOpenSettings?.("skills")}><Plus />{t("firstSite.add")}<ChevronDown /></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon-sm" aria-label={t("firstSite.more")}><Ellipsis /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4}>
                <DropdownMenuItem onSelect={() => onOpenSettings?.("skills")}>{t("firstSite.manageSkills")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSkillBuilderEnabled((enabled) => !enabled)}>
                  {skillBuilderEnabled ? t("firstSite.disableSkill") : t("firstSite.enableSkill")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {skillVisible ? (
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={t("firstSite.more")}><Ellipsis /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={4}>
                    <DropdownMenuItem onSelect={() => onOpenSettings?.("skills")}>{t("firstSite.manageSkills")}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </footer>
            </article>
          ) : (
            <div className={styles.projectSkillsEmpty}>{t("firstSite.noSkills")}</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={websitesOpen} onOpenChange={onContextDialogChange(setWebsitesOpen)}>
        <DialogContent className={styles.projectPickerDialog} overlayClassName={styles.instructionsOverlay} closeLabel={t("shell.closeDialog")}>
          <DialogTitle className={styles.projectPickerTitle}>{t("firstSite.addWebsiteToProject")}</DialogTitle>
          <label className={styles.projectPickerSearch}>
            <Search aria-hidden="true" />
            <Input
              aria-label={t("firstSite.searchWebsites")}
              placeholder={t("firstSite.searchWebsites")}
              value={websiteQuery}
              onChange={(event) => setWebsiteQuery(event.target.value)}
            />
          </label>
          {filteredWebsites.length > 0 ? (
            <div className={styles.projectPickerList} role="list" aria-label={t("firstSite.searchWebsites")}>
              {filteredWebsites.map((website) => {
                const selected = selectedWebsiteId === website.id || linkedWebsiteId === website.id
                return (
                  <button
                    key={website.id}
                    type="button"
                    className={styles.projectPickerRow}
                    aria-pressed={selected}
                    data-selected={selected || undefined}
                    onClick={() => setSelectedWebsiteId(website.id)}
                  >
                    <SquareCode aria-hidden="true" />
                    <span><strong>{website.name}</strong><small>{website.detail}</small></span>
                  </button>
                )
              })}
            </div>
          ) : <div className={styles.projectPickerEmpty}><SquareCode aria-hidden="true" /><span>{t("firstSite.noWebsites")}</span></div>}
          <DialogFooter className={styles.projectPickerFooter}>
            <DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose>
            <Button
              type="button"
              disabled={!selectedWebsiteId}
              onClick={() => {
                setLinkedWebsiteId(selectedWebsiteId)
                onContextDialogChange(setWebsitesOpen)(false)
              }}
            >{t("firstSite.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduledOpen} onOpenChange={onContextDialogChange(setScheduledOpen)}>
        <DialogContent className={styles.projectPickerDialog} overlayClassName={styles.instructionsOverlay} closeLabel={t("shell.closeDialog")}>
          <DialogTitle className={styles.projectPickerTitle}>{t("firstSite.projectScheduledTasks")}</DialogTitle>
          <div className={styles.scheduledPickerToolbar}>
            <label className={styles.projectPickerSearch}>
              <Search aria-hidden="true" />
              <Input
                aria-label={t("firstSite.searchScheduledTasks")}
                placeholder={t("firstSite.searchScheduledTasks")}
                value={scheduledQuery}
                onChange={(event) => setScheduledQuery(event.target.value)}
              />
            </label>
            <Button type="button" variant="outline" onClick={() => setScheduledEditorOpen(true)}><Plus />{t("firstSite.createNewItem")}</Button>
          </div>
          {filteredScheduledTasks.length > 0 ? (
            <div className={styles.projectPickerList} role="list" aria-label={t("firstSite.searchScheduledTasks")}>
              {filteredScheduledTasks.map((task) => {
                const selected = selectedScheduledId === task.id || linkedScheduledId === task.id
                return (
                  <button
                    key={task.id}
                    type="button"
                    className={styles.projectPickerRow}
                    aria-pressed={selected}
                    data-selected={selected || undefined}
                    onClick={() => setSelectedScheduledId(task.id)}
                  >
                    <Clock3 aria-hidden="true" />
                    <span><strong>{task.title}</strong><small>{task.time} · {task.prompt}</small></span>
                  </button>
                )
              })}
            </div>
          ) : <div className={styles.projectPickerEmpty}><Clock3 aria-hidden="true" /><span>{t("firstSite.noScheduledTasks")}</span></div>}
          <DialogFooter className={styles.projectPickerFooter}>
            <DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose>
            <Button
              type="button"
              disabled={!selectedScheduledId}
              onClick={() => {
                setLinkedScheduledId(selectedScheduledId)
                onContextDialogChange(setScheduledOpen)(false)
              }}
            >{t("firstSite.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScheduledTaskEditorDialog
        open={scheduledEditorOpen}
        onOpenChange={setScheduledEditorOpen}
        brandName={brandName ?? "Kokoro"}
        onSave={handleScheduledTaskSave}
      />
    </section>
  )
}
