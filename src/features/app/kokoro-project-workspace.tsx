"use client"

import { Cable, ChevronDown, ChevronRight, ListFilter, MessageSquare, Plus, Upload, Wrench } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useCallback, useRef, useState, type MouseEvent, type SetStateAction } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { useLocale } from "@/i18n/context"
import { cn } from "@/lib/utils"
import { ProjectResourceUploadError } from "./project-resource-upload"

import { ProjectContextCard, ProjectContextSection } from "./project-context-card"
import { ProjectIdentity } from "./project-identity"
import { ProjectConversationEmpty } from "./project-conversation-empty"
import { KokoroProjectConversationWelcome } from "./kokoro-project-conversation-welcome"
import { ProjectWorkspaceDialogs } from "./project-workspace-dialogs"
import { previewScheduledTasks, previewWebsites, type ProjectScheduledPreview, type ResourceKind } from "./project-workspace-model"
import { useProjectResources } from "./use-project-resources"
import styles from "./kokoro-project-workspace.module.css"
import layoutStyles from "./project-workspace-layout.module.css"

type ProjectWorkspaceProps = Pick<
  EmptyStateProps,
  "brandName" | "composer" | "onOpenSettings" | "onPrompt" | "projectConversations" | "projectConversationsLoading" | "projectConversationsError" | "onRetryProjectConversations" | "activeProjectConversationId" | "onSelectProjectConversation" | "workspaceCapabilities"
  | "projectConversation" | "projectInstructions" | "projectInstructionHistory" | "onSaveProjectInstructions" | "onUploadProjectResource" | "onListProjectResources" | "projectRef" | "preview" | "onSetProjectSkillEnabled" | "onCreateProjectScheduledTask" | "projectDetail" | "onRetryProjectRead" | "projectInstructionContext" | "projectHistoryStatus" | "projectHistoryRetryable"
>

type InstructionEditorState = {
  instructionsOpen: boolean
  instructions: string
  instructionsSaving: boolean
  instructionsError: boolean
  instructionsHistoryOpen: boolean
  selectedInstructionRevision: string | null
}

export type ResourceUploadIntent = {
  id: string
  file: File
  key: string
  status: "uploading" | "failed"
  error: string | undefined
  retryable: boolean
}

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
  projectConversation = false,
  projectInstructions = "",
  projectInstructionHistory = [],
  onSaveProjectInstructions,
  onUploadProjectResource,
  onListProjectResources,
  projectRef,
  preview = false,
  projectDetail,
  projectInstructionContext,
  projectHistoryStatus,
  projectHistoryRetryable,
  onRetryProjectRead,
  onSetProjectSkillEnabled,
  onCreateProjectScheduledTask,
}: ProjectWorkspaceProps) {
  const { locale, t } = useLocale()
  const capabilities = workspaceCapabilities
  const instructionContext = projectInstructionContext ?? `${preview}:${projectRef ?? ""}`
  const emptyInstructionEditor: InstructionEditorState = {
    instructionsOpen: false, instructions: projectInstructions, instructionsSaving: false,
    instructionsError: false, instructionsHistoryOpen: false, selectedInstructionRevision: null,
  }
  const [instructionEditor, setInstructionEditor] = useState({ context: instructionContext, state: emptyInstructionEditor })
  // A context change resets before React commits the dialog. Each setter keeps
  // its originating context, so an old save's catch/finally cannot edit B.
  if (instructionEditor.context !== instructionContext) {
    setInstructionEditor({ context: instructionContext, state: emptyInstructionEditor })
  }
  const editor = instructionEditor.context === instructionContext ? instructionEditor.state : emptyInstructionEditor
  const { instructionsOpen, instructions, instructionsSaving, instructionsError, instructionsHistoryOpen, selectedInstructionRevision } = editor
  const instructionSetter = <K extends keyof InstructionEditorState>(field: K) => (value: SetStateAction<InstructionEditorState[K]>) => {
    setInstructionEditor((current) => {
      if (current.context !== instructionContext) return current
      const next = typeof value === "function" ? (value as (previous: InstructionEditorState[K]) => InstructionEditorState[K])(current.state[field]) : value
      return { ...current, state: { ...current.state, [field]: next } }
    })
  }
  const setInstructionsOpen = instructionSetter("instructionsOpen")
  const setInstructions = instructionSetter("instructions")
  const setInstructionsSaving = instructionSetter("instructionsSaving")
  const setInstructionsError = instructionSetter("instructionsError")
  const setInstructionsHistoryOpen = instructionSetter("instructionsHistoryOpen")
  const setSelectedInstructionRevision = instructionSetter("selectedInstructionRevision")
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const [resourceQuery, setResourceQuery] = useState("")
  const [resourceKind, setResourceKind] = useState<ResourceKind>("all")
  const resources = useProjectResources(projectRef, preview, onListProjectResources)
  const [resourceUploads, setResourceUploads] = useState<readonly ResourceUploadIntent[]>([])
  const activeResourceUploads = useRef(new Set<string>())
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
  const [scheduledItems, setScheduledItems] = useState<readonly ProjectScheduledPreview[]>(preview ? previewScheduledTasks : [])
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

  const filteredResources = resources.items.filter((resource) => {
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

  const submitResourceUpload = async (intent: ResourceUploadIntent) => {
    if (activeResourceUploads.current.has(intent.id)) return
    activeResourceUploads.current.add(intent.id)
    setResourceUploads((current) => current.map((item) => item.id === intent.id ? { ...item, status: "uploading", error: undefined } : item))
    try {
      if (!onUploadProjectResource) throw new ProjectResourceUploadError("upload_not_configured", false)
      const receipt = await onUploadProjectResource(intent.file, intent.key)
      await resources.confirmUpload(receipt)
      setResourceUploads((current) => current.filter((item) => item.id !== intent.id))
    } catch (error) {
      const uploadError = error instanceof ProjectResourceUploadError ? error : null
      setResourceUploads((current) => current.map((item) => item.id === intent.id ? {
        ...item,
        status: "failed",
        error: uploadError?.code ?? "upload_network_error",
        retryable: uploadError?.retryable ?? true,
      } : item))
    } finally {
      activeResourceUploads.current.delete(intent.id)
    }
  }

  const handleResourceFiles = async (files: FileList) => {
    const intents = Array.from(files).map((file): ResourceUploadIntent => {
      const identity = crypto.randomUUID()
      return { id: identity, file, key: `project-resource:${identity}`, status: "uploading", error: undefined, retryable: true }
    })
    if (intents.length === 0) return
    setResourceUploads((current) => [...current, ...intents])
    for (const intent of intents) await submitResourceUpload(intent)
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
    if (!preview) throw new Error("preview_only")
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

  if (projectConversation && !projectConversationsLoading && !projectConversationsError) {
    return <KokoroProjectConversationWelcome composer={composer} />
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
        <ProjectIdentity preview={preview} {...(brandName === undefined ? {} : { brandName })} {...(projectDetail === undefined ? {} : { projectDetail })} {...(onRetryProjectRead === undefined ? {} : { onRetryProjectRead })} />

        <div className={cn(styles.composer, layoutStyles.composer)}>{composer}</div>

        {capabilities?.projectConversations ? (
          <section className={cn(styles.conversations, layoutStyles.conversations)} aria-labelledby="project-conversation-heading">
            <h2 id="project-conversation-heading">{t("firstSite.projectConversations")}</h2>
            <p>{t("firstSite.projectConversationsPrivate")}</p>
            {projectConversationsLoading ? (
              <div className={styles.conversationState} data-testid="project-conversations-loading" aria-busy="true">
                <div className={styles.conversationLoadingRows} aria-hidden="true">
                  <Skeleton className={styles.conversationLoadingRow} />
                  <Skeleton className={styles.conversationLoadingRow} />
                  <Skeleton className={styles.conversationLoadingRowShort} />
                </div>
                <p className={styles.conversationLoadingMessage} role="status">{t("firstSite.conversationsLoading")}</p>
              </div>
            ) : projectConversationsError ? (
              <div className={styles.conversationState} data-testid="project-conversations-error" role="alert" aria-labelledby="project-conversations-error-title">
                <p id="project-conversations-error-title" className={styles.conversationErrorMessage}>{t("firstSite.conversationsError")}</p>
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
              <ProjectConversationEmpty />
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
                  <Button type="button" variant="ghost" size="sm" disabled={!preview && projectDetail !== undefined && projectDetail.status !== "ready"} onClick={(event) => {
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
              <CardContent className={styles.cardDescription}>
                {t("firstSite.instructionsHint")}
                {!preview && projectHistoryStatus === "loading" ? <p role="status">{t("firstSite.projectsLoading")}</p> : null}
                {!preview && projectHistoryStatus === "error" ? <div role="alert">
                  <p>{t("firstSite.projectsError")}</p>
                  <Button type="button" variant="outline" disabled={!projectHistoryRetryable || !onRetryProjectRead} onClick={onRetryProjectRead}>{t("firstSite.retry")}</Button>
                </div> : null}
              </CardContent>
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
        {capabilities?.scheduledTasks && !preview ? (
          <Card data-context-kind="scheduled"><CardHeader><CardTitle>{t("firstSite.scheduledTasks")}</CardTitle></CardHeader>
            <CardContent><p>{t("firstSite.independentScheduledTasks")}</p></CardContent>
            <CardFooter><Button asChild variant="outline"><Link href={projectRef
              ? `/app/scheduled?project_id=${encodeURIComponent(projectRef)}#scheduled-tasks/new`
              : "/app/scheduled"}>{t("firstSite.openScheduledTasks")}</Link></Button></CardFooter>
          </Card>
        ) : null}
        {capabilities?.scheduledTasks && preview ? (
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
        preview={preview}
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
        resourceListStatus={resources.status}
        resourceListErrorCursor={resources.errorCursor}
        resourceNextCursor={resources.nextCursor}
        onRetryResourceList={() => { void resources.retry() }}
        onLoadMoreResources={() => { void resources.loadMore() }}
        resourceUploads={resourceUploads}
        onRetryResourceUpload={(intent) => { void submitResourceUpload(intent) }}
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
