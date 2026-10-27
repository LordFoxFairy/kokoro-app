"use client"

import { ChevronDown, ChevronRight, ListFilter, Plus, Upload } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type SetStateAction } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import type { ProjectInstructionRequest, ProjectInstructionSaveError } from "@/components/blocks/app-frame/app-frame.types"
import { useLocale } from "@/i18n/context"
import { cn } from "@/lib/utils"
import { ProjectResourceUploadError } from "./project-resource-upload"

import { ProjectContextCard, ProjectContextSection } from "./project-context-card"
import { ProjectIdentity } from "./project-identity"
import { ProjectConversations } from "./project-conversations"
import { ProjectSkillsSection } from "./project-skills-section"
import { ProjectMcpRecommendationsSection } from "./project-mcp-recommendations-section"
import { ProjectWorkspaceDialogs } from "./project-workspace-dialogs"
import { previewScheduledTasks, previewWebsites, type ProjectScheduledPreview, type ResourceKind } from "./project-workspace-model"
import { useProjectComposerClearance } from "./use-project-composer-clearance"
import { useProjectResourceActions } from "./use-project-resource-actions"
import { useProjectResources } from "./use-project-resources"
import styles from "./kokoro-project-workspace.module.css"
import layoutStyles from "./project-workspace-layout.module.css"

type ProjectWorkspaceProps = Pick<
  EmptyStateProps,
  "brandName" | "composer" | "onOpenSettings" | "onPrompt" | "projectConversations" | "projectConversationsLoading" | "projectConversationsError" | "onRetryProjectConversations" | "activeProjectConversationId" | "onSelectProjectConversation" | "workspaceCapabilities"
  | "projectInstructionRequest" | "projectInstructions" | "projectInstructionHistory" | "onSaveProjectInstructions" | "onUploadProjectResource" | "onListProjectResources" | "projectRef" | "preview" | "onCreateProjectScheduledTask" | "projectDetail" | "onRetryProjectRead" | "projectInstructionContext" | "projectHistoryStatus" | "projectHistoryRetryable" | "projectReadBoundary" | "projectMcpRecommendations"
>

type InstructionEditorState = {
  request: ProjectInstructionRequest | null
  instructionsOpen: boolean
  instructions: string
  instructionsSaving: boolean
  instructionsError: boolean
  instructionsResult: ProjectInstructionSaveError | null
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
  localValidation?: boolean
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
  projectInstructionRequest,
  projectInstructions = "",
  projectInstructionHistory = [],
  onSaveProjectInstructions,
  onUploadProjectResource,
  onListProjectResources,
  projectRef,
  preview = false,
  projectDetail,
  projectHistoryStatus,
  projectHistoryRetryable,
  onRetryProjectRead,
  projectReadBoundary,
  projectMcpRecommendations,
  onCreateProjectScheduledTask,
}: ProjectWorkspaceProps) {
  const { locale, t } = useLocale()
  const { surfaceRef, composerRef } = useProjectComposerClearance(true)
  const capabilities = workspaceCapabilities
  const instructionsAvailable = Boolean(capabilities?.instructions) && (preview ||
    (projectReadBoundary === undefined || projectReadBoundary.admitted && projectReadBoundary.subject !== null)
    && (projectDetail === undefined || projectDetail.status === "ready" && projectDetail.data.id === projectRef))
  const [instructionRouteEpoch, setInstructionRouteEpoch] = useState(0)
  useLayoutEffect(() => {
    let route = `${window.location.pathname}${window.location.search}${window.location.hash}`
    const retire = () => {
      const next = `${window.location.pathname}${window.location.search}${window.location.hash}`
      if (route === next) return
      route = next
      setInstructionRouteEpoch((value) => value + 1)
    }
    window.addEventListener("popstate", retire)
    window.addEventListener("kokoro:surface-navigation", retire)
    return () => {
      window.removeEventListener("popstate", retire)
      window.removeEventListener("kokoro:surface-navigation", retire)
    }
  }, [])
  const instructionFocusContext = useMemo(() => ({ preview, projectRef, enabled: capabilities?.instructions, instructionRouteEpoch,
    admitted: projectReadBoundary?.admitted, subject: projectReadBoundary?.subject, generation: projectReadBoundary?.generation }), [preview, projectRef, capabilities?.instructions,
    projectReadBoundary?.admitted, projectReadBoundary?.subject, projectReadBoundary?.generation, instructionRouteEpoch])
  const instructionContext = instructionFocusContext
  const emptyInstructionEditor: InstructionEditorState = {
    request: null, instructionsOpen: false, instructions: projectInstructions, instructionsSaving: false,
    instructionsError: false, instructionsResult: null, instructionsHistoryOpen: false, selectedInstructionRevision: null,
  }
  const [instructionEditor, setInstructionEditor] = useState({ context: instructionContext, state: emptyInstructionEditor })
  // A context change resets before React commits the dialog. Each setter keeps
  // its originating context, so an old save's catch/finally cannot edit B.
  if (instructionEditor.context !== instructionContext) {
    setInstructionEditor({ context: instructionContext, state: emptyInstructionEditor })
  } else if (instructionsAvailable && projectInstructionRequest && instructionEditor.state.request !== projectInstructionRequest) {
    setInstructionEditor({ context: instructionContext, state: { ...(instructionEditor.state.instructionsResult !== null
      ? instructionEditor.state : emptyInstructionEditor), request: projectInstructionRequest, instructionsOpen: true } })
  }
  const editor = instructionEditor.context === instructionContext ? instructionEditor.state : emptyInstructionEditor
  const { instructionsOpen, instructions, instructionsSaving, instructionsError, instructionsResult, instructionsHistoryOpen, selectedInstructionRevision } = editor
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
  const setInstructionsResult = instructionSetter("instructionsResult")
  const setInstructionsHistoryOpen = instructionSetter("instructionsHistoryOpen")
  const setSelectedInstructionRevision = instructionSetter("selectedInstructionRevision")
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const [resourceQuery, setResourceQuery] = useState("")
  const [resourceKind, setResourceKind] = useState<ResourceKind>("all")
  const resourcesAvailable = preview || projectReadBoundary === undefined
    || projectReadBoundary.admitted && projectReadBoundary.subject !== null
  const resourceSubject = projectReadBoundary?.subject
  const resourceGeneration = projectReadBoundary?.generation
  const resourceContext = useMemo(() => ({ projectRef, preview, resourceSubject, resourceGeneration, resourcesAvailable, instructionRouteEpoch }),
    [projectRef, preview, resourceSubject, resourceGeneration, resourcesAvailable, instructionRouteEpoch])
  const resourceIdentity = JSON.stringify([projectRef, preview, resourceSubject])
  const resources = useProjectResources(projectRef, preview, onListProjectResources, resourceContext, resourcesAvailable)
  const resourceActions = useProjectResourceActions(projectRef, resourceContext, resourcesAvailable && !preview, resources.confirmDelete)
  const [uploadState, setUploadState] = useState<{ identity: string; context: object; items: readonly ResourceUploadIntent[] }>(
    { identity: resourceIdentity, context: resourceContext, items: [] })
  if (uploadState.context !== resourceContext) {
    // A paused attempt may have committed. Retain its original file/key for
    // explicit same-owner recovery, but never resume the batch automatically.
    setUploadState({ identity: resourceIdentity, context: resourceContext,
      items: uploadState.identity !== resourceIdentity ? [] : uploadState.items.map((intent) => intent.status === "uploading"
        ? { ...intent, status: "failed", error: "upload_network_error", retryable: true } : intent) })
  }
  const resourceUploads = resourcesAvailable && uploadState.context === resourceContext ? uploadState.items : []
  const setResourceUploads = (update: (items: readonly ResourceUploadIntent[]) => readonly ResourceUploadIntent[]) => {
    setUploadState((current) => current.context === resourceContext ? { ...current, items: update(current.items) } : current)
  }
  const resourceScope = useRef<{ context: object; active: boolean; opened: boolean; uploads: Set<string> } | null>(null)
  useLayoutEffect(() => {
    const scope = { context: resourceContext, active: true, opened: false, uploads: new Set<string>() }
    resourceScope.current = scope
    return () => { scope.active = false }
  }, [resourceContext])
  useLayoutEffect(() => {
    const scope = resourceScope.current
    if (resourcesOpen && scope?.context === resourceContext) scope.opened = true
  }, [resourceContext, resourcesOpen])
  const resourceInputRef = useRef<HTMLInputElement | null>(null)
  const resourceSearchRef = useRef<HTMLInputElement | null>(null)
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
  const activeInstructionFocusContextRef = useRef<object | null>(null)
  const instructionFocusRef = useRef<{ context: object; route: string; request: ProjectInstructionRequest | null; target: HTMLButtonElement | null } | null>(null)
  useLayoutEffect(() => {
    activeInstructionFocusContextRef.current = instructionFocusContext
    return () => { activeInstructionFocusContextRef.current = null }
  }, [instructionFocusContext])
  useLayoutEffect(() => {
    if (!instructionsOpen) return
    instructionFocusRef.current = { context: instructionFocusContext,
      route: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      request: editor.request, target: editor.request?.returnFocus ?? contextOpenerRef.current }
    editor.request?.onConsumed()
  }, [instructionsOpen, instructionFocusContext, editor.request])
  const onInstructionsCloseAutoFocus = (event: Event) => {
    event.preventDefault()
    const focus = instructionFocusRef.current
    if (!focus || focus.context !== activeInstructionFocusContextRef.current
      || focus.route !== `${window.location.pathname}${window.location.search}${window.location.hash}`
      || focus.request && !focus.request.isCurrent()) return
    const available = (target: HTMLButtonElement | null) => target?.isConnected && !target.disabled
      && (typeof target.checkVisibility !== "function" || target.checkVisibility())
    const target = available(focus.target) ? focus.target : focus.request?.fallbackFocus()
    if (target && available(target)) target.focus({ preventScroll: true })
  }

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
    const scope = resourceScope.current
    if (!resourcesOpen && scope?.active && scope.context === resourceContext && scope.opened && !preview) void resources.refresh()
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

  const submitResourceUpload = async (intent: ResourceUploadIntent) => {
    const scope = resourceScope.current
    if (!resourcesAvailable || !scope?.active || scope.context !== resourceContext || scope.uploads.has(intent.id)) return
    const current = () => scope.active && resourceScope.current === scope
    scope.uploads.add(intent.id)
    setResourceUploads((current) => current.map((item) => item.id === intent.id ? { ...item, status: "uploading", error: undefined } : item))
    try {
      if (!onUploadProjectResource) throw new ProjectResourceUploadError("upload_not_configured", false)
      const receipt = await onUploadProjectResource(intent.file, intent.key)
      if (!current()) return
      await resources.confirmUpload(receipt)
      if (!current()) return
      setResourceUploads((current) => current.filter((item) => item.id !== intent.id))
    } catch (error) {
      if (!current()) return
      const uploadError = error instanceof ProjectResourceUploadError ? error : null
      setResourceUploads((current) => current.map((item) => item.id === intent.id ? {
        ...item,
        status: "failed",
        error: uploadError?.code ?? "upload_network_error",
        retryable: uploadError?.retryable ?? true,
        localValidation: uploadError?.localValidation === true,
      } : item))
    } finally {
      scope.uploads.delete(intent.id)
    }
  }

  const handleResourceFiles = async (files: FileList) => {
    const scope = resourceScope.current
    if (!resourcesAvailable || !scope?.active || scope.context !== resourceContext) return
    const intents = Array.from(files).map((file): ResourceUploadIntent => {
      const identity = crypto.randomUUID()
      return { id: identity, file, key: `project-resource:${identity}`, status: "uploading", error: undefined, retryable: true }
    })
    if (intents.length === 0) return
    const selectedNames = new Set(intents.map(intent => intent.file.name))
    setResourceUploads((current) => [...current.filter(intent => !(intent.status === "failed" && intent.localValidation === true && selectedNames.has(intent.file.name))), ...intents])
    for (const intent of intents) {
      if (!scope.active || resourceScope.current !== scope) break
      await submitResourceUpload(intent)
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

  const openInstructions = (event: MouseEvent<HTMLButtonElement>) => {
    if (!instructionsAvailable) return
    instructionSetter("request")(null)
    rememberContextOpener(event)
    if (instructionsResult === null || instructionsResult.status === "rejected") {
      setInstructions(projectInstructions)
      setInstructionsResult(null)
      setInstructionsError(false)
    }
    setInstructionsOpen(true)
  }

  return (
    <section
      className={cn(styles.surface, layoutStyles.surface)}
      ref={surfaceRef}
      data-slot="project-workspace"
      data-locale={locale}
      aria-label={t("firstSite.projects")}
    >
      <div className={layoutStyles.document}>
        <ProjectIdentity preview={preview} {...(brandName === undefined ? {} : { brandName })} {...(projectDetail === undefined ? {} : { projectDetail })} {...(onRetryProjectRead === undefined ? {} : { onRetryProjectRead })} />

        <aside className={cn(styles.context, layoutStyles.context)} aria-label={t("firstSite.workspaceStatus")}>
          {(capabilities?.instructions || capabilities?.connectors) ? (
            <Card className={styles.contextCard} data-context-kind="instructions">
              {capabilities?.instructions ? (
                <CardHeader className={styles.cardHeader}>
                  <CardTitle className={styles.cardTitle}>
                    <Button type="button" variant="ghost" size="sm" disabled={!instructionsAvailable} onClick={openInstructions}>
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
              {capabilities?.instructions ? (
                <CardFooter className={styles.instructionAction}>
                  <Button type="button" variant="outline" size="sm"
                    aria-label={`${t("firstSite.add")}${t("firstSite.instructions")}`}
                    disabled={!instructionsAvailable}
                    onClick={openInstructions}>
                    <Plus aria-hidden="true" />{t("firstSite.add")}
                  </Button>
                </CardFooter>
              ) : null}
              {capabilities?.connectors ? (
                <ProjectMcpRecommendationsSection model={projectMcpRecommendations} />
              ) : null}
            </Card>
          ) : null}

          {(capabilities?.resources || capabilities?.skills) ? (
            <Card className={styles.contextCard} data-context-kind="resources-skills">
              {capabilities.resources ? (
                <section data-context-section="resources" aria-label={t("firstSite.filesAndResources")}><ProjectContextSection
                  title={t("firstSite.filesAndResources")}
                  description={t("firstSite.filesHint")}
                  actions={[
                    { id: "upload", label: t("firstSite.upload"), icon: Upload, trailingIcon: ChevronDown },
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
                /></section>
              ) : null}
              {capabilities.skills ? (
                <ProjectSkillsSection key={JSON.stringify([projectReadBoundary?.subject ?? null, projectRef ?? null])}
                  preview={preview} {...(projectDetail === undefined ? {} : { projectDetail })}
                  {...(projectReadBoundary === undefined ? {} : { projectReadBoundary })}
                  {...(onOpenSettings === undefined ? {} : { onOpenSettings })} />
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
            <Card className={styles.contextCard} data-context-kind="scheduled"><CardHeader className={styles.cardHeader}><CardTitle className={styles.cardTitle}>{t("firstSite.scheduledTasks")}</CardTitle></CardHeader>
              <CardContent className={styles.cardDescription}><p>{t("firstSite.independentScheduledTasks")}</p></CardContent>
              <CardFooter className={styles.cardFooter}><Button asChild variant="outline"><Link href={projectRef
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
        {capabilities?.projectConversations ? <ProjectConversations
          projectConversations={projectConversations}
          projectConversationsLoading={projectConversationsLoading}
          projectConversationsError={projectConversationsError}
          {...(onRetryProjectConversations === undefined ? {} : { onRetryProjectConversations })}
          {...(activeProjectConversationId === undefined ? {} : { activeProjectConversationId })}
          {...(onSelectProjectConversation === undefined ? {} : { onSelectProjectConversation })}
        /> : null}
      </div>
      <div ref={composerRef} className={cn(styles.composer, layoutStyles.composer)}>{composer}</div>

      <ProjectWorkspaceDialogs
        preview={preview}
        {...(brandName === undefined ? {} : { brandName })}
        instructionsAvailable={instructionsAvailable}
        onInstructionsCloseAutoFocus={onInstructionsCloseAutoFocus}
        instructionsOpen={instructionsOpen && instructionsAvailable}
        setInstructionsOpen={setInstructionsOpen}
        instructions={instructions}
        setInstructions={setInstructions}
        instructionsSaving={instructionsSaving}
        setInstructionsSaving={setInstructionsSaving}
        instructionsError={instructionsError}
        setInstructionsError={setInstructionsError}
        instructionsResult={instructionsResult}
        setInstructionsResult={setInstructionsResult}
        instructionsHistoryOpen={instructionsHistoryOpen}
        setInstructionsHistoryOpen={setInstructionsHistoryOpen}
        selectedInstructionRevision={selectedInstructionRevision}
        setSelectedInstructionRevision={setSelectedInstructionRevision}
        projectInstructionHistory={projectInstructionHistory}
        {...(onSaveProjectInstructions === undefined ? {} : { onSaveProjectInstructions })}
        resourceActions={resourceActions}
        resourceFocusContext={resourceContext}
        resourcesAvailable={resourcesAvailable}
        resourcesOpen={resourcesOpen}
        setResourcesOpen={setResourcesOpen}
        resourceQuery={resourceQuery}
        setResourceQuery={setResourceQuery}
        setResourceKind={setResourceKind}
        resourceSearchRef={resourceSearchRef}
        resourceInputRef={resourceInputRef}
        filteredResources={filteredResources}
        resourceListStatus={resources.status}
        resourceRefreshFailed={resources.refreshFailed}
        resourceNextCursor={resources.nextCursor}
        onLoadMoreResources={() => { void resources.loadMore() }}
        resourceUploads={resourceUploads}
        onRetryResourceUpload={(intent) => { void submitResourceUpload(intent) }}
        handleResourceFiles={handleResourceFiles}
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
