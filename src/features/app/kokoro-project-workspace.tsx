"use client"

import { Cable, ChevronDown, ChevronRight, ListFilter, MessageSquare, Plus, Upload, Wrench } from "lucide-react"
import Image from "next/image"
import { useCallback, useRef, useState, type MouseEvent } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { useLocale } from "@/i18n/context"
import { cn } from "@/lib/utils"

import { ProjectContextCard, ProjectContextSection } from "./project-context-card"
import { ProjectIdentity } from "./project-identity"
import { ProjectTaskEmpty } from "./project-task-empty"
import { KokoroProjectTaskWelcome } from "./kokoro-project-task-welcome"
import { ProjectWorkspaceDialogs } from "./project-workspace-dialogs"
import { previewResources, previewScheduledTasks, previewWebsites, type ProjectResourcePreview, type ProjectScheduledPreview, type ResourceKind } from "./project-workspace-model"
import styles from "./kokoro-project-workspace.module.css"
import layoutStyles from "./project-workspace-layout.module.css"

type ProjectWorkspaceProps = Pick<
  EmptyStateProps,
  "brandName" | "composer" | "onOpenSettings" | "onPrompt" | "projectConversations" | "projectConversationsLoading" | "projectConversationsError" | "onRetryProjectConversations" | "activeProjectConversationId" | "onSelectProjectConversation" | "workspaceCapabilities"
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
      className={cn(styles.surface, layoutStyles.surface)}
      data-slot="project-workspace"
      data-locale={locale}
      data-resource-copy-lines={locale === "zh" || locale === "ko" ? "one" : "two"}
      aria-label={t("firstSite.projects")}
    >
      <div className={cn(styles.main, layoutStyles.main)}>
        <ProjectIdentity {...(brandName === undefined ? {} : { brandName })} />

        <div className={cn(styles.composer, layoutStyles.composer)}>{composer}</div>

        {capabilities?.projectConversations ? (
          <section className={cn(styles.conversations, layoutStyles.conversations)} aria-labelledby="project-conversation-heading">
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

      <aside className={cn(styles.context, layoutStyles.context)} aria-label={t("firstSite.workspaceStatus")}>
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

      <ProjectWorkspaceDialogs
        {...(brandName === undefined ? {} : { brandName })}
        instructionsOpen={instructionsOpen}
        setInstructionsOpen={setInstructionsOpen}
        instructions={instructions}
        setInstructions={setInstructions}
        instructionsSaving={instructionsSaving}
        setInstructionsSaving={setInstructionsSaving}
        instructionsError={instructionsError}
        setInstructionsError={setInstructionsError}
        instructionsHistoryOpen={instructionsHistoryOpen}
        setInstructionsHistoryOpen={setInstructionsHistoryOpen}
        selectedInstructionRevision={selectedInstructionRevision}
        setSelectedInstructionRevision={setSelectedInstructionRevision}
        projectInstructionHistory={projectInstructionHistory}
        {...(onSaveProjectInstructions === undefined ? {} : { onSaveProjectInstructions })}
        resourcesOpen={resourcesOpen}
        setResourcesOpen={setResourcesOpen}
        resourceQuery={resourceQuery}
        setResourceQuery={setResourceQuery}
        setResourceKind={setResourceKind}
        resourceSearchRef={resourceSearchRef}
        resourceInputRef={resourceInputRef}
        filteredResources={filteredResources}
        handleResourceFiles={handleResourceFiles}
        skillsOpen={skillsOpen}
        setSkillsOpen={setSkillsOpen}
        skillQuery={skillQuery}
        setSkillQuery={setSkillQuery}
        setSkillFilter={setSkillFilter}
        skillBuilderEnabled={skillBuilderEnabled}
        setSkillBuilderEnabled={setSkillBuilderEnabled}
        skillVisible={skillVisible}
        {...(onSetProjectSkillEnabled === undefined ? {} : { onSetProjectSkillEnabled })}
        websitesOpen={websitesOpen}
        setWebsitesOpen={setWebsitesOpen}
        websiteQuery={websiteQuery}
        setWebsiteQuery={setWebsiteQuery}
        selectedWebsiteId={selectedWebsiteId}
        setSelectedWebsiteId={setSelectedWebsiteId}
        linkedWebsiteId={linkedWebsiteId}
        setLinkedWebsiteId={setLinkedWebsiteId}
        filteredWebsites={filteredWebsites}
        scheduledOpen={scheduledOpen}
        setScheduledOpen={setScheduledOpen}
        scheduledQuery={scheduledQuery}
        setScheduledQuery={setScheduledQuery}
        selectedScheduledId={selectedScheduledId}
        setSelectedScheduledId={setSelectedScheduledId}
        linkedScheduledId={linkedScheduledId}
        setLinkedScheduledId={setLinkedScheduledId}
        filteredScheduledTasks={filteredScheduledTasks}
        scheduledEditorOpen={scheduledEditorOpen}
        setScheduledEditorOpen={setScheduledEditorOpen}
        onCreateProjectScheduledTask={handleScheduledTaskSave}
        {...(onOpenSettings === undefined ? {} : { onOpenSettings })}
        onContextDialogChange={onContextDialogChange}
      />
    </section>
  )
}
