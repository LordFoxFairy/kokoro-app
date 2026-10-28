"use client"

import { useProjectPins } from "@/features/app/use-project-pins"
import { McpTrialProvider } from "@/ui/mcp/mcp-trial-context"
import { useSessionArchive } from "@/ui/shell/use-session-archive"

import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"

import { activeMode, type AgentMode } from "@/core/conversations"
import { isCreditInsufficient } from "@/billing/rules"
import { useHydrated } from "@/lib/use-hydrated"
import { RAIL_COLLAPSED_WIDTH, RAIL_DEFAULT } from "@/ui/rail/use-rail-resize"
import { matchesSavedKeyboardShortcut } from "@/lib/keyboard-shortcuts"
import { useIsMobile } from "@/hooks/use-mobile"
import type { SessionClient } from "@/engine/client"
import { useT } from "@/i18n/context"
import { browserConversationMoveCoordinator, browserHubClient, browserListClient, evictBrowserConversationIndex } from "@/ui/shell/page-clients"
import {
  createConversationMoveCoordinator,
  type ConversationMoveResult,
} from "@/ui/shell/conversation-move-coordinator"
import { useTaskNotifications } from "@/ui/shell/use-task-notifications"
import { useAwaitingNotify } from "@/ui/shell/use-awaiting-notify"
import { useCanvasWorkspace } from "@/ui/shell/use-canvas-workspace"
import { useComposerSelectors } from "@/ui/shell/use-composer-selectors"
import { useComposerConnections } from "@/ui/shell/use-composer-connections"
import { createManusSkillHubClient, retainManusSkillHubClient } from "@/ui/skills/manus-skill-client"
import { isRuntimeNavigationEnabled } from "@/ui/navigation/runtime-navigation-registry"
import { useConversationReaders } from "@/ui/shell/use-conversation-readers"
import { useDraft } from "@/ui/shell/use-draft"
import { readChatModel } from "@/ui/settings/chat-prefs"
import type { ConversationThreadProps } from "@/ui/thread/conversation-thread"
import type { WorkspaceRailProps } from "@/components/blocks/workspace-rail/workspace-rail"
import type { AppCommandMenuProps } from "./app-command-menu"

import { AppCommandMenu } from "./app-command-menu"
import { AppFrameComposer, type AppFrameComposerProps } from "./app-frame-composer"
import { AppFrameBootingMainSurface, AppFrameMainSurface } from "./app-frame-main-surface"
import { AppFrameOverlaySurfaces } from "./app-frame-overlay-surfaces"
import { AppFrameShell } from "./app-frame-shell"
import { DefaultEmptyState } from "./app-frame-status-surfaces"
import {
  COMPACT_DESKTOP_RAIL_BREAKPOINT,
  projectWorkspaceCapabilities,
  settingsTabFromLocation,
} from "./app-frame-helpers"
import type { AppFrameProps, EmptyStateProps } from "./app-frame.types"
import { useAppFrameActions } from "./use-app-frame-actions"
import { useAppFrameEngine } from "./use-app-frame-engine"
import { useAppFrameLayout } from "./use-app-frame-layout"
import { useAppFrameNavigation } from "./use-app-frame-navigation"
import { useAppFrameOverlays } from "./use-app-frame-overlays"
import { useAppFrameProject } from "./use-app-frame-project"
import { useProjectList } from "@/features/app/use-project-list"
import { useProjectMcpRecommendations } from "@/features/app/use-project-mcp-recommendations"
import { projectMcpDefaultSelection } from "@/features/app/project-mcp-default-selection"
import { navigateMountedSurface } from "@/ui/navigation/mounted-surface-navigation"
import { sessionScopeKey } from "@/engine/session-scope"
import archiveStyles from "@/ui/settings/settings-modal.module.css"
import { ConnectorCommandProvider } from "@/ui/mcp/connector-command-context"
import shellStyles from "./app-frame.module.css"

export type { AppCommandMenuProps }
export type { AppFrameProps, EmptyStateProps, WorkspaceCapabilities } from "./app-frame.types"
export { COMPACT_DESKTOP_RAIL_BREAKPOINT, settingsTabFromLocation }

function AppFrameBootingSurface({
  brandName,
  desktopRailCollapsed = false,
  projectWorkspace = false,
  standaloneSurface = false,
  hideWorkspaceHeader = false,
}: Pick<AppFrameProps, "brandName" | "desktopRailCollapsed" | "projectWorkspace" | "standaloneSurface" | "hideWorkspaceHeader">) {
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const composer = (
    <AppFrameComposer
      preview={false}
      brandName={brandName}
      projectWorkspace={projectWorkspace}
      hasMessages={false}
      creationIntent={null}
      onCreationIntentDismiss={() => undefined}
      workspaceCapabilities={{ instructions: false, connectors: false, resources: false, skills: false, projectConversations: false }}
      onOpenMcpCatalog={() => undefined}
      onOpenSettings={() => undefined}
      draft=""
      onDraftChange={() => undefined}
      onKeyDown={() => undefined}
      onSubmit={(event) => event.preventDefault()}
      isStreaming={false}
      canSend={false}
      onStop={() => undefined}
      composerRef={composerRef}
      mode="fast"
      onModeChange={() => undefined}
      modeLocked
      models={[]}
      selectedModel={null}
      onModelChange={() => undefined}
      modelLocked
      emptyWorkspace
    />
  )
  return (
    <div className={shellStyles.shell} data-desktop-web="true" data-web-skin="kokoro"
      style={{ "--rail-width": `${desktopRailCollapsed ? RAIL_COLLAPSED_WIDTH : RAIL_DEFAULT}px` } as CSSProperties}>
      <div className={`${shellStyles.inset} flex flex-1`} data-slot="sidebar-inset">
        {/* Keep the first admitted document spatially continuous with the
         * mounted workspace. This is intentionally a static shell, not a
         * loading indicator: it prevents the empty, full-width flash that
         * made a route handoff feel like the app had disappeared. */}
        <aside className={shellStyles.bootingRail} aria-hidden="true">
          <span className={shellStyles.bootingRailBrand} />
          <span className={shellStyles.bootingRailAction} />
          <span className={shellStyles.bootingRailAction} />
          <span className={shellStyles.bootingRailAction} />
          <span className={shellStyles.bootingRailAccount} />
        </aside>
        <div className={shellStyles.workspace}>
          <div className={`${shellStyles.mainPanel} flex-1`}>
            <AppFrameBootingMainSurface
              composer={composer}
              standaloneSurface={standaloneSurface}
              hideWorkspaceHeader={hideWorkspaceHeader}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export function AppFrame(props: AppFrameProps) {
  return props.booting
    ? <AppFrameBootingSurface
        {...(props.brandName === undefined ? {} : { brandName: props.brandName })}
        {...(props.desktopRailCollapsed === undefined ? {} : { desktopRailCollapsed: props.desktopRailCollapsed })}
        {...(props.projectWorkspace === undefined ? {} : { projectWorkspace: props.projectWorkspace })}
        {...(props.standaloneSurface === undefined ? {} : { standaloneSurface: props.standaloneSurface })}
        {...(props.hideWorkspaceHeader === undefined ? {} : { hideWorkspaceHeader: props.hideWorkspaceHeader })}
      />
    : <AppFrameRuntime {...props} />
}

function AppFrameRuntime({
  engine: injectedEngine,
  brandName,
  brandMark,
  brandLogoUrl,
  webSkin = "kokoro",
  navigation,
  featureFlags,
  workspaceCapabilities,
  chatHref,
  emptyState,
  scheduledTaskClient,
  emptyStateOwnsComposer = false,
  standaloneSurface = false,
  desktopRailCollapsed = false,
  hideWorkspaceHeader = false,
  projectWorkspace = false,
  projectRef,
  projectReadBoundary,
  onOpenProject,
  activeNavigationKey,
  commandMenu: CommandMenu = AppCommandMenu,
  preview = false,
}: AppFrameProps) {
  const t = useT()
  const mounted = useHydrated()
  const narrowWeb = useIsMobile()
  const resolvedWebSkin = webSkin

  const engineState = useAppFrameEngine({
    injectedEngine,
    preview,
    projectRef,
  })
  const {
    engine,
    sessionScope,
    machine,
    store,
    thread,
    pendingMode,
    staging,
    hydrating,
    connection,
    canSubmitMessage,
    activeId,
  } = engineState

  const canvas = useCanvasWorkspace(activeId, thread, mounted)
  const layout = useAppFrameLayout({
    desktopRailCollapsed,
    canvasOpen: canvas.canvasOpen,
  })

  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null)

  const navigationState = useAppFrameNavigation({
    engine,
    scope: sessionScope,
    chatHref,
    projectRef,
    projectWorkspace,
    standaloneSurface,
    mounted,
    activeId,
    threadMessageCount: thread.messages.length,
    hydrating,
    machinePhase: machine.phase,
    ...(engineState.missingSessionId === undefined ? {} : { missingSessionId: engineState.missingSessionId }),
  })

  const mcpCatalogScope = useMemo(() => ({ engine, sessionScope, preview, subject: projectReadBoundary?.subject,
    conversation: navigationState.resolvedConversationRouteId, standaloneSurface }),
  [engine, sessionScope, preview, projectReadBoundary?.subject, navigationState.resolvedConversationRouteId, standaloneSurface])
  const overlays = useAppFrameOverlays({
    mcpCatalogScope,
    mcpCatalogEnabled: preview || projectReadBoundary?.admitted === true && Boolean(projectReadBoundary.subject),
    mounted,
    settingsTab: navigationState.settingsTab,
    setSettingsTab: navigationState.setSettingsTab,
    settingsHistoryEntryRef: navigationState.settingsHistoryEntryRef,
    syncSettingsUrl: navigationState.syncSettingsUrl,
    shellRef: layout.shellRef,
    composerRef,
    accountTriggerRef,
  })

  const routedConversationId = navigationState.resolvedConversationRouteId
  const projectOverview = projectWorkspace && routedConversationId === null
  const selectors = useComposerSelectors(engine, { preview, applyModelToEngine: !projectOverview })

  const focusComposer = useCallback(() => {
    const node = composerRef.current
    if (node) {
      node.style.height = "auto"
      node.style.height = `${node.scrollHeight}px`
      node.focus({ preventScroll: true })
    }
  }, [])

  const isStreaming = machine.phase !== "idle" && machine.phase !== "error"
  const moveCoordinator = useMemo(() => injectedEngine === undefined
    ? browserConversationMoveCoordinator()
    : createConversationMoveCoordinator({
        client: browserListClient({ preview }),
        evictSourceIndex: (_scopeKey, sessionId) => injectedEngine?.reconcileConversationCache(sessionId),
      }), [injectedEngine, preview])
  useEffect(() => {
    if (projectReadBoundary?.admitted && projectReadBoundary.subject) {
      moveCoordinator.admitVerifiedSubject(projectReadBoundary.subject)
    } else if (projectReadBoundary?.subject) {
      moveCoordinator.suspendVerifiedSubject(projectReadBoundary.subject)
    }
  }, [moveCoordinator, projectReadBoundary])
  const moveSnapshot = useSyncExternalStore(
    moveCoordinator.subscribe,
    moveCoordinator.getSnapshot,
    moveCoordinator.getSnapshot,
  )
  const moveScopeKey = sessionScopeKey(sessionScope)
  const railReadIdentity = JSON.stringify([projectReadBoundary?.subject ?? "injected", projectReadBoundary?.generation ?? 0])
  const railReadAdmitted = preview || (projectReadBoundary === undefined ? injectedEngine !== undefined : projectReadBoundary.admitted && projectReadBoundary.subject !== null)
  // Account MCP selection follows the enabled connector module, not project default bindings.
  const composerConnectionsEnabled = navigation === undefined
    ? featureFlags === undefined && (workspaceCapabilities?.connectors ?? true)
    : navigation.some(item => item.key === "mcp" && isRuntimeNavigationEnabled(item, featureFlags))
  const connectionsBoundary = preview ? { admitted: true, subject: "preview", generation: 0 } : projectReadBoundary ?? { admitted: injectedEngine !== undefined, subject: "injected", generation: 0 }
  const [moveSelectionGeneration, setMoveSelectionGeneration] = useState(0)
  const handleConversationDeleteConfirmed = useCallback((scope: typeof sessionScope, id: string) => {
    if (sessionScopeKey(scope) === moveScopeKey) setMoveSelectionGeneration((generation) => generation + 1)
    if (engine === null || sessionScopeKey(scope) !== moveScopeKey) evictBrowserConversationIndex(sessionScopeKey(scope), id)
  }, [engine, moveScopeKey])
  const archive = useSessionArchive({preview,boundary:projectReadBoundary,engine,scope:moveScopeKey})
  const conversationReaders = useConversationReaders({
    engine, preview,
    activeId: projectWorkspace ? routedConversationId : activeId,
    thread, isStreaming, observeRunStatus: engine !== null && !hydrating,
    scope: sessionScope,
    readBoundary: { identity: railReadIdentity, admitted: railReadAdmitted },
    scopeVersions: moveSnapshot.scopeVersions,
    archiveRevision: archive.revision,
    archiveReceipt: archive.event,
    onDeleteConfirmed: handleConversationDeleteConfirmed,
  })
  const conversationsCtl = conversationReaders.read(sessionScope)
  const conversationMove = moveSnapshot.intent
  const moveRouteContext = typeof window === "undefined" ? null : (() => {
    const url = new URL(window.location.href)
    url.searchParams.delete("conversation")
    return `${url.pathname}${url.search}${url.hash}`
  })()
  let moveActor: string | null | undefined
  try { moveActor = typeof window === "undefined" ? undefined : window.localStorage.getItem("kokoro.web.auth-index-subject") }
  catch { moveActor = undefined }
  const isVisibleMoveLeaf = useCallback((sourceScopeKey: string, id: string) => {
    if (!railReadAdmitted || standaloneSurface || sourceScopeKey !== moveScopeKey || !engine || typeof window === "undefined") return false
    const url = new URL(window.location.href)
    const path = sessionScope.kind === "project" ? `/app/project/${encodeURIComponent(sessionScope.projectRef)}` : new URL(chatHref, window.location.href).pathname
    return url.pathname === path && url.searchParams.getAll("conversation").length === 1 &&
      url.searchParams.get("conversation") === id && engine.getSnapshot().store?.activeId === id
  }, [chatHref, engine, moveScopeKey, railReadAdmitted, sessionScope, standaloneSurface])
  const moveViewIdentity = useMemo(
    () => ({ engine, scopeKey: moveScopeKey, selectionGeneration: moveSelectionGeneration, route: moveRouteContext, actor: moveActor, readIdentity: railReadIdentity, admitted: railReadAdmitted, standaloneSurface }),
    [engine, moveActor, moveRouteContext, moveScopeKey, moveSelectionGeneration, railReadAdmitted, railReadIdentity, standaloneSurface],
  )
  const moveProjectionRef = useRef<{
    engine: typeof engine
    scopeKey: string
    identity: typeof moveViewIdentity
    live: boolean
  } | null>(null)
  const [moveFailureProjection, setMoveFailureProjection] = useState<NonNullable<typeof moveProjectionRef.current> | null>(null)
  useLayoutEffect(() => {
    const projection = { engine, scopeKey: moveScopeKey, identity: moveViewIdentity, live: true }
    moveProjectionRef.current = projection
    const retireNavigation = () => {
      projection.live = false
      setMoveSelectionGeneration((generation) => generation + 1)
    }
    window.addEventListener("popstate", retireNavigation)
    window.addEventListener("kokoro:surface-navigation", retireNavigation)
    return () => {
      window.removeEventListener("popstate", retireNavigation)
      window.removeEventListener("kokoro:surface-navigation", retireNavigation)
      projection.live = false
      if (moveProjectionRef.current === projection) moveProjectionRef.current = null
    }
  }, [engine, moveScopeKey, moveViewIdentity])
  const commitConfirmedMove = useCallback((result: ConversationMoveResult, wasActive: boolean) => {
    if (result.status !== "confirmed") return
    if (!wasActive) return
    const confirmedTargetScope = result.targetProjectId === null ? "direct" : `project:${result.targetProjectId}`
    if (confirmedTargetScope === moveScopeKey) {
      // Same-scope URL changes do not replace the scoped engine, so explicitly
      // hydrate the exact retained session before projecting its canonical URL.
      engine?.openConversation(result.sessionId)
    }
    const conversation = encodeURIComponent(result.sessionId)
    const target = result.targetProjectId === null
      ? `/app?conversation=${conversation}`
      : `/app/project/${encodeURIComponent(result.targetProjectId)}?conversation=${conversation}`
    navigateMountedSurface(target)
  }, [engine, moveScopeKey])
  const settleConversationMove = useCallback((
    result: ConversationMoveResult,
    wasActive: boolean,
    projection: NonNullable<typeof moveProjectionRef.current>,
    submittedRoute: string,
  ) => {
    if (!projection.live || moveProjectionRef.current !== projection || !projection.identity.admitted) return
    const actualRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`
    const normalized = new URL(submittedRoute, window.location.origin)
    normalized.searchParams.delete("conversation")
    // Matching owner ACK synchronously evicts the source index. Its existing
    // fallback effect may remove only the old conversation query before this
    // Promise continuation. That is not a user navigation, but is admissible
    // only for the captured visible leaf, its matching ACK and retired index.
    const confirmedFallback = wasActive && result.status === "confirmed" &&
      !projection.engine?.getSnapshot().store?.conversations.some(entry => entry.id === result.sessionId) &&
      actualRoute === `${normalized.pathname}${normalized.search}${normalized.hash}`
    if (actualRoute !== submittedRoute && !confirmedFallback) return
    try {
      if (projection.identity.actor === undefined || window.localStorage.getItem("kokoro.web.auth-index-subject") !== projection.identity.actor) return
    } catch { return }
    if (result.status === "rejected") {
      setMoveFailureProjection({ ...projection, scopeKey: result.sourceScopeKey })
    }
    commitConfirmedMove(result, wasActive)
  }, [commitConfirmedMove])
  const moveConversation = useCallback((sourceScope: typeof sessionScope, sessionId: string, targetProjectId: string | null) => {
    if (!engine) return
    const projection = moveProjectionRef.current
    if (projection === null) return
    setMoveFailureProjection(null)
    const wasActive = isVisibleMoveLeaf(sessionScopeKey(sourceScope), sessionId)
    const submittedRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`
    void moveCoordinator.start({ sourceScopeKey: sessionScopeKey(sourceScope), sessionId, targetProjectId })
      .then((result) => {
        settleConversationMove(result, wasActive, projection, submittedRoute)
      })
  }, [engine, isVisibleMoveLeaf, moveCoordinator, settleConversationMove])
  const retryConversationMove = useCallback(() => {
    if (!engine) return
    const retained = moveCoordinator.getSnapshot().intent
    if (retained === null) return
    const projection = moveProjectionRef.current
    if (projection === null) return
    setMoveFailureProjection(null)
    const shouldSelectRetainedConversation = isVisibleMoveLeaf(retained.sourceScopeKey, retained.sessionId)
    const submittedRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`
    void moveCoordinator.retry().then((result) => {
      if (result !== null) {
        // Retry repairs binding state, but must not steal a different
        // conversation or catalog/overview chosen while the outcome was unknown.
        settleConversationMove(result, shouldSelectRetainedConversation, projection, submittedRoute)
      }
    })
  }, [engine, isVisibleMoveLeaf, moveCoordinator, settleConversationMove])
  useTaskNotifications(engine, preview, projectReadBoundary)
  const awaitingIdentity = JSON.stringify([preview, projectReadBoundary?.subject ?? null, sessionScopeKey(sessionScope)])
  const awaitingIds = useAwaitingNotify(projectReadBoundary?.subject === null ? null : activeId, machine.phase, t, brandName, awaitingIdentity, engine)

  const draftRoute = typeof window === "undefined" ? null : `${window.location.pathname}${window.location.search}`
  const draftSelectionMatches = !projectWorkspace || routedConversationId === null || routedConversationId === activeId
  const draftController = useDraft(projectWorkspace ? routedConversationId : activeId, mounted && draftSelectionMatches, projectRef)
  const draftRouteIsCurrent = useCallback(() => {
    if (!projectWorkspace) return true
    if (!draftSelectionMatches || typeof window === "undefined" ||
      `${window.location.pathname}${window.location.search}` !== draftRoute) return false
    return !projectWorkspace || routedConversationId === null ||
      engine?.getSnapshot().store?.activeId === routedConversationId
  }, [draftRoute, draftSelectionMatches, engine, projectWorkspace, routedConversationId])
  const { draft, updateDraft: updateScopedDraft, clearDraft: clearScopedDraft } = draftController
  const updateDraft = useCallback((value: string) => {
    if (draftRouteIsCurrent()) updateScopedDraft(value)
  }, [updateScopedDraft, draftRouteIsCurrent])
  const clearDraft = useCallback(() => {
    if (draftRouteIsCurrent()) clearScopedDraft()
  }, [clearScopedDraft, draftRouteIsCurrent])
  // An overview is a new task draft, not the retained engine's active task.
  // Keep its choices local until accepted Send allocates a fresh conversation.
  const [projectDraftEpoch, setProjectDraftEpoch] = useState(0)
  const projectDraftContext = useMemo(() => ({
    engine, projectRef, route: draftRoute, actor: moveActor,
    identity: railReadIdentity, admitted: railReadAdmitted, epoch: projectDraftEpoch,
    mode: "fast" as AgentMode, model: readChatModel(),
    mcpConnectionIds: [] as readonly string[],
    mcpTouched: false, mcpSeededVersion: null as string | null,
  }), [engine, projectRef, draftRoute, moveActor, projectDraftEpoch, railReadIdentity, railReadAdmitted])
  const [projectDraftSelection, setProjectDraftSelection] = useState(() => ({
    context: projectDraftContext, mode: projectDraftContext.mode, model: projectDraftContext.model,
    mcpConnectionIds: projectDraftContext.mcpConnectionIds,
    mcpTouched: false, mcpSeededVersion: null as string | null,
  }))
  const projectDraft = projectDraftSelection.context === projectDraftContext ? projectDraftSelection : projectDraftContext
  const liveProjectDraft = useRef<typeof projectDraftContext | null>(null)
  useLayoutEffect(() => {
    if (!projectOverview) return
    liveProjectDraft.current = projectDraftContext
    const retire = () => {
      try {
        if (`${window.location.pathname}${window.location.search}` === projectDraftContext.route
          && window.localStorage.getItem("kokoro.web.auth-index-subject") === projectDraftContext.actor) return
      } catch { /* Unreadable actor evidence retires the draft. */ }
      liveProjectDraft.current = null
      setProjectDraftEpoch(epoch => epoch + 1)
    }
    window.addEventListener("popstate", retire)
    window.addEventListener("kokoro:surface-navigation", retire)
    window.addEventListener("storage", retire)
    return () => {
      if (liveProjectDraft.current === projectDraftContext) liveProjectDraft.current = null
      window.removeEventListener("popstate", retire)
      window.removeEventListener("kokoro:surface-navigation", retire)
      window.removeEventListener("storage", retire)
    }
  }, [projectDraftContext, projectOverview])
  const projectDraftIsCurrent = useCallback(() => {
    try {
      return railReadAdmitted && liveProjectDraft.current === projectDraftContext && projectDraftContext.actor !== undefined
        && (preview || projectReadBoundary === undefined || projectReadBoundary.subject === projectDraftContext.actor)
        && `${window.location.pathname}${window.location.search}` === projectDraftContext.route
        && window.localStorage.getItem("kokoro.web.auth-index-subject") === projectDraftContext.actor
    } catch { return false }
  }, [railReadAdmitted, projectDraftContext, preview, projectReadBoundary])
  const updateProjectDraft = (choice: Partial<{ mode: AgentMode; model: string | null }>) => {
    if (!projectDraftIsCurrent()) return
    setProjectDraftSelection(previous => {
      const current = previous.context === projectDraftContext ? previous : projectDraftContext
      return { context: projectDraftContext, mode: current.mode, model: current.model, mcpConnectionIds: current.mcpConnectionIds,
        mcpTouched: current.mcpTouched, mcpSeededVersion: current.mcpSeededVersion, ...choice }
    })
  }
  const projectReads = useProjectList(preview, projectReadBoundary, projectRef, projectWorkspace)
  const projectPins = useProjectPins({ preview, boundary: projectReadBoundary,
    visibleIds: projectReads.list.status === "ready" ? projectReads.list.data.map(item=>item.id) : null,
    onUnavailable: projectReads.retireProject })
  const projectedWorkspaceCapabilities = projectWorkspaceCapabilities(featureFlags, workspaceCapabilities, { preview })
  const recommendations = useProjectMcpRecommendations({
    projectId: projectReads.current.status === "ready" && projectReads.current.data.id === projectRef ? projectReads.current.data.id : null,
    boundary: projectReadBoundary,
    enabled: projectWorkspace && !preview && projectedWorkspaceCapabilities.connectors === true,
    hub: browserHubClient({ preview }),
  })
  const connections = useComposerConnections({
    engine,
    client: browserHubClient({ preview }),
    boundary: { ...connectionsBoundary, admitted: connectionsBoundary.admitted && composerConnectionsEnabled },
    enforceSubjectMarker: !preview && injectedEngine === undefined,
    loadAllForDefaults: projectOverview && !projectDraft.mcpTouched && recommendations.configReady && Boolean(recommendations.facts?.recommendations.length),
    ...(projectOverview ? { localDraft: {
      context: projectDraftContext,
      selectedIds: projectDraft.mcpConnectionIds,
      isCurrent: projectDraftIsCurrent,
      update: (change: (ids: readonly string[]) => readonly string[]) => {
        if (!projectDraftIsCurrent()) return
        setProjectDraftSelection(previous => {
          if (!projectDraftIsCurrent()) return previous
          const current = previous.context === projectDraftContext ? previous : projectDraftContext
          return { context: projectDraftContext, mode: current.mode, model: current.model,
            mcpConnectionIds: change(current.mcpConnectionIds), mcpTouched: true, mcpSeededVersion: current.mcpSeededVersion }
        })
      },
    } } : {}),
  })
  const recommendationFacts = recommendations.facts
  if (projectOverview && !projectDraft.mcpTouched && recommendations.allowed && recommendations.configReady && recommendationFacts &&
    projectDraft.mcpSeededVersion !== recommendationFacts.state_version &&
    (recommendationFacts.recommendations.length > 0 ? connections.complete === true : connections.status === "ready")) {
    const facts = recommendationFacts
    const ids = projectMcpDefaultSelection(facts.recommendations, connections.items)
    if (ids !== null) setProjectDraftSelection(previous => {
      const current = previous.context === projectDraftContext ? previous : projectDraftContext
      if (current.mcpTouched || current.mcpSeededVersion === facts.state_version) return previous
      return { context: projectDraftContext, mode: current.mode, model: current.model,
        mcpConnectionIds: ids, mcpTouched: false, mcpSeededVersion: facts.state_version }
    })
  }
  const refreshProjects = projectReads.refresh
  const handleProjectOpen = useCallback((id: string, handoffDraft?: string) => {
    // Navigation is independently fenced; creation ACK refreshes through
    // onProjectCreated even when the user has chosen another mounted scope.
    if (onOpenProject) onOpenProject(id, handoffDraft)
    else navigateMountedSurface(`/app/project/${encodeURIComponent(id)}`)
  }, [onOpenProject])
  const project = useAppFrameProject({
    projectRef,
    projectWorkspace,
    preview,
    mounted,
    draft,
    updateDraft,
    clearDraft,
    onOpenProject: handleProjectOpen,
    onProjectCreated: refreshProjects,
    projectDetail: projectReads.current,
    instructionHistory: projectReads.instructionHistory,
    instructionContext: projectReads.context,
    instructionsEnabled: projectedWorkspaceCapabilities.instructions,
    contextEnabled: [projectedWorkspaceCapabilities.instructions, projectedWorkspaceCapabilities.resources, projectedWorkspaceCapabilities.connectors, projectedWorkspaceCapabilities.skills].some(Boolean),
    refreshProject: refreshProjects,
    retireProject: projectReads.retireProject,
    refreshRenamedProject: projectReads.refreshRenamedProject,
    ...(projectReadBoundary === undefined ? {} : { renameBoundary: projectReadBoundary }),
    // Project dialogs follow the address, not a retained task engine acquiring its activeId.
    renameRouteKey: JSON.stringify([projectRef ?? null, navigationState.settingsTab, draftRoute, typeof window === "undefined" ? null : window.location.hash]),
  })

  const actions = useAppFrameActions({
    preview,
    ...(projectReadBoundary === undefined ? {} : { readBoundary: projectReadBoundary }),
    engine,
    projectWorkspace,
    ...(projectRef === undefined ? {} : { projectRef }),
    routedConversationId,
    ...(projectOverview ? { projectComposerDraft: { mode: projectDraft.mode, model: projectDraft.model,
      selectedMcpConnectionIds: projectDraft.mcpConnectionIds, isCurrent: projectDraftIsCurrent },
      onProjectDraftAccepted: () => selectors.setSelectedModel(projectDraft.model) } : {}),
    standaloneSurface,
    chatHref,
    activeId,
    draft,
    clearDraft,
    updateDraft,
    setDeploymentIntent: navigationState.setDeploymentIntent,
    syncConversationUrl: navigationState.syncConversationUrl,
    setConversationRouteId: navigationState.setConversationRouteId,
    focusComposer,
    closeSettings: overlays.closeSettings,
    brandName,
    commandNewChatTimerRef: overlays.commandNewChatTimerRef,
  })
  const selectConversationWithMoveFence = useCallback((id: string) => {
    setMoveSelectionGeneration((generation) => generation + 1)
    actions.selectConversationWithUrl(id)
  }, [actions])
  const startNewChatWithMoveFence = useCallback(() => {
    setMoveSelectionGeneration((generation) => generation + 1)
    actions.startNewChatAndFocus()
  }, [actions])
  const startNewChatFromCommandWithMoveFence = useCallback(() => {
    setMoveSelectionGeneration((generation) => generation + 1)
    actions.startNewChatFromCommand()
  }, [actions])
  const { openCommand } = overlays

  // Copying a private task URL neither creates a share nor grants access.
  const copySubject = projectReadBoundary?.subject ?? null
  const copyGeneration = projectReadBoundary?.generation
  const copyAdmitted = projectReadBoundary?.admitted === true
    && typeof copySubject === "string" && copySubject.trim().length > 0
    && Number.isSafeInteger(copyGeneration) && (copyGeneration ?? -1) >= 0
  const copyRoute = typeof window === "undefined" ? "" : window.location.href
  const [copyNavigationEpoch, setCopyNavigationEpoch] = useState(0)
  const copyView = useMemo(() => ({
    engine, scope: moveScopeKey, activeId, preview, subject: copySubject,
    generation: copyGeneration, admitted: copyAdmitted, actor: moveActor,
    route: copyRoute, epoch: copyNavigationEpoch, mounted, hydrating,
    meta: thread.meta, visible: navigationState.routeOwnsConversation, standaloneSurface,
  }), [engine, moveScopeKey, activeId, preview, copySubject, copyGeneration, copyAdmitted,
    moveActor, copyRoute, copyNavigationEpoch, mounted, hydrating, thread.meta,
    navigationState.routeOwnsConversation, standaloneSurface])
  type CopyTaskAttempt = { view: typeof copyView; live: boolean; pending: symbol | null; feedbackTimer: number | null; onStorage: ((event: StorageEvent) => void) | null }
  const copyLifetimeRef = useRef<CopyTaskAttempt | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<{ lifetime: CopyTaskAttempt; kind: "success" | "failure" } | null>(null)
  useLayoutEffect(() => {
    const lifetime: CopyTaskAttempt = { view: copyView, live: true, pending: null, feedbackTimer: null, onStorage: null }
    copyLifetimeRef.current = lifetime
    const retire = () => {
      lifetime.live = false
      setCopyNavigationEpoch((epoch) => epoch + 1)
    }
    // Engine notify is synchronous: observe intermediate A→B→A selections even
    // when React batches them into one committed render.
    const observeSelection = () => {
      const current = copyView.engine?.getSnapshot()
      if (current && ((current.store?.activeId ?? null) !== copyView.activeId
        || current.hydrating !== copyView.hydrating
        || (current.thread.meta === null) !== (copyView.meta === null)
        || current.thread.meta?.ownerId !== copyView.meta?.ownerId)) {
        if (lifetime.live) retire()
      }
    }
    const unsubscribeSelection = copyView.engine?.subscribe(observeSelection)
    observeSelection()
    window.addEventListener("popstate", retire)
    window.addEventListener("hashchange", retire)
    window.addEventListener("kokoro:surface-navigation", retire)
    return () => {
      lifetime.live = false
      unsubscribeSelection?.()
      if (lifetime.feedbackTimer !== null) window.clearTimeout(lifetime.feedbackTimer)
      window.removeEventListener("popstate", retire)
      window.removeEventListener("hashchange", retire)
      window.removeEventListener("kokoro:surface-navigation", retire)
      if (lifetime.onStorage !== null) window.removeEventListener("storage", lifetime.onStorage)
      if (copyLifetimeRef.current === lifetime) copyLifetimeRef.current = null
    }
  }, [copyView])
  const currentTaskLink = useCallback((): string | null => {
    if (!mounted || !engine || standaloneSurface || !navigationState.routeOwnsConversation) return null
    if (!preview) {
      if (!copyAdmitted) return null
      try { if (window.localStorage.getItem("kokoro.web.auth-index-subject") !== copySubject) return null }
      catch { return null }
    }
    const snapshot = engine.getSnapshot()
    const id = snapshot.store?.activeId
    if (!id?.trim() || id !== activeId || snapshot.hydrating || snapshot.thread.meta === null
      || snapshot.thread.messages.length === 0) return null
    const actual = new URL(window.location.href)
    if (actual.href !== copyRoute) return null
    let direct: URL
    try { direct = new URL(chatHref, actual) } catch { return null }
    if (direct.origin !== actual.origin) return null
    const path = sessionScope.kind === "project"
      ? `/app/project/${encodeURIComponent(sessionScope.projectRef)}` : direct.pathname
    if (actual.pathname !== path || actual.searchParams.getAll("conversation").length !== 1
      || actual.searchParams.get("conversation") !== id) return null
    const target = new URL(actual.origin)
    target.pathname = path
    target.searchParams.set("conversation", id)
    return target.href
  }, [mounted, engine, standaloneSurface, navigationState.routeOwnsConversation, preview,
    copyAdmitted, copySubject, activeId, chatHref, sessionScope, copyRoute])
  const copyCurrentTaskLink = useCallback(() => {
    const lifetime = copyLifetimeRef.current
    const target = currentTaskLink()
    if (!lifetime?.live || lifetime.view !== copyView || lifetime.pending !== null || target === null) return
    const attempt = Symbol("copy-task-link")
    lifetime.pending = attempt
    if (lifetime.feedbackTimer !== null) window.clearTimeout(lifetime.feedbackTimer)
    lifetime.feedbackTimer = null
    // Subscribe only while this feature owns a visible result or operation.
    if (lifetime.onStorage === null) {
      lifetime.onStorage = (event) => {
        if (event.key !== null && event.key !== "kokoro.web.auth-index-subject") return
        lifetime.live = false
        setCopyNavigationEpoch((epoch) => epoch + 1)
      }
      window.addEventListener("storage", lifetime.onStorage)
    }
    setCopyFeedback(null)
    const stillCurrent = () => lifetime.live && copyLifetimeRef.current === lifetime
      && lifetime.pending === attempt && currentTaskLink() === target
    const finish = (kind: "success" | "failure") => {
      if (!stillCurrent()) return
      setCopyFeedback({ lifetime, kind })
      const timer = window.setTimeout(() => {
        if (lifetime.feedbackTimer !== timer) return
        lifetime.feedbackTimer = null
        if (lifetime.live && copyLifetimeRef.current === lifetime) {
          setCopyFeedback((current) => current?.lifetime === lifetime ? null : current)
        }
      }, 3500)
      lifetime.feedbackTimer = timer
    }
    // Clipboard writes cannot be undone; a retired view can only suppress its result.
    try {
      if (typeof navigator.clipboard?.writeText !== "function") {
        finish("failure")
        lifetime.pending = null
        return
      }
      void Promise.resolve(navigator.clipboard.writeText(target)).then(
        () => finish("success"), () => finish("failure"),
      ).finally(() => {
        if (copyLifetimeRef.current === lifetime && lifetime.pending === attempt) lifetime.pending = null
      })
    } catch {
      finish("failure")
      if (copyLifetimeRef.current === lifetime && lifetime.pending === attempt) lifetime.pending = null
    }
  }, [copyView, currentTaskLink])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (matchesSavedKeyboardShortcut(event, "copyTaskLink")) {
        if (currentTaskLink() !== null) {
          event.preventDefault()
          copyCurrentTaskLink()
        }
        return
      }
      if (matchesSavedKeyboardShortcut(event, "search")) {
        event.preventDefault()
        openCommand()
        return
      }
      if (matchesSavedKeyboardShortcut(event, "newTask")) {
        event.preventDefault()
        startNewChatWithMoveFence()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [openCommand, startNewChatWithMoveFence, currentTaskLink, copyCurrentTaskLink])

  const hasMessages = thread.messages.length > 0
  const showConversation = hasMessages && !standaloneSurface && navigationState.routeOwnsConversation
  const canRetryPendingSubmission = engine?.getSnapshot().canRetryPendingSubmission ?? false
  const initialSnapshotFailed = machine.phase === "error"
    && !canRetryPendingSubmission
    && store !== null
    && thread.messages.length === 0
  const hasFailed = !isStreaming && (
    machine.phase === "error" || thread.unattributedFailure !== null
  )
  const creditRejected = hasFailed && isCreditInsufficient(machine.error)
  const mode = projectOverview ? projectDraft.mode : store ? activeMode(store) : pendingMode
  const composerHasMessages = !projectOverview && hasMessages
  const modeLocked = composerHasMessages
  const projectSubmissionAdmitted = !projectWorkspace || (
    typeof window !== "undefined"
    && projectRef !== undefined
    && window.location.pathname === `/app/project/${encodeURIComponent(projectRef)}`
    && draftRouteIsCurrent()
    && !hydrating
    && connection.status === "connected"
    && (routedConversationId === null
      ? machine.phase === "idle" && !canRetryPendingSubmission
      : activeId === routedConversationId)
  )
  const canSend = draft.trim().length > 0 && canSubmitMessage && projectSubmissionAdmitted
    && !navigationState.conversationHydrating && !navigationState.conversationHydrationFailed
  const conversations = conversationsCtl?.conversations ?? []
  const projectedCreationIntent = projectWorkspace ? null : navigationState.deploymentIntent

  const previousHasMessagesRef = useRef(hasMessages)
  useEffect(() => {
    const wasEmpty = !previousHasMessagesRef.current
    previousHasMessagesRef.current = hasMessages
    if (!wasEmpty || !hasMessages) return
    const frame = window.requestAnimationFrame(() => focusComposer())
    return () => window.cancelAnimationFrame(frame)
  }, [focusComposer, hasMessages])

  const retryAndFocusComposer = useCallback(() => {
    engine?.retry()
    window.requestAnimationFrame(() => focusComposer())
  }, [engine, focusComposer])

  const retryConversationHydration = useCallback(() => {
    const requestedConversationId = navigationState.resolvedConversationRouteId ?? activeId
    if (!engine || requestedConversationId === null) return
    const current = engine.getSnapshot()
    if (current.missingSessionId === requestedConversationId) {
      engine.openConversation(requestedConversationId)
      return
    }
    if (current.store?.activeId === requestedConversationId) {
      const fallback = current.store.conversations.find(({ id }) => id !== requestedConversationId)
      if (fallback) {
        engine.selectConversation(fallback.id)
      } else {
        engine.newConversation()
      }
    }
    engine.openConversation(requestedConversationId)
  }, [activeId, engine, navigationState.resolvedConversationRouteId])

  const EmptyState = emptyState ?? DefaultEmptyState
  const shareClient: Pick<SessionClient, "createShare" | "revokeShare"> = browserListClient({ preview })

  const conversationProps: ConversationThreadProps = {
    preview,
    ...(brandName === undefined ? {} : { brandName }),
    sessionId: activeId,
    thread,
    isStreaming,
    currentRunId: machine.runId ?? thread.activeRunId,
    executionPhase: machine.phase,
    isReconnecting: connection.status === "reconnecting",
    hasFailed,
    submissionFailureCode: machine.error,
    canRetryPendingSubmission,
    canRetryResume: engine?.getSnapshot().canRetryResume ?? false,
    onRetryResume: () => engine?.retryResume(),
    creditRejected,
    onOpenBilling: () => overlays.openSettings("credits"),
    onOpenPricing: () => overlays.openSettings("subscription"),
    onRetry: retryAndFocusComposer,
    onRetryMessageParts: (messageId) => engine?.retryMessageParts?.(messageId),
    mode,
    stagingByRun: staging,
    hitlRunId: (machine.phase === "waiting" || machine.phase === "resuming") ? machine.runId : null,
    controlError: (machine.phase === "waiting" || machine.phase === "resuming") ? machine.error : null,
    onToolDecision: (runId, toolId, decision) => engine?.stageToolDecision(runId, toolId, decision),
    onCancelRun: () => engine?.cancelRun(),
    onOpenFile: (path) => { project.dismissProjectContext(); canvas.openFile(path) },
    onOpenDelivery: (delivery) => { project.dismissProjectContext(); canvas.openDelivery(delivery) },
  }

  const projectConversations: NonNullable<EmptyStateProps["projectConversations"]> = conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
  }))

  const composerSkillBoundary = useMemo(() => projectReadBoundary ?? { admitted: false, subject: null, generation: 0 }, [projectReadBoundary])
  const composerSkillClient = useMemo(() => createManusSkillHubClient(browserHubClient({ preview }), composerSkillBoundary), [preview, composerSkillBoundary])
  useLayoutEffect(() => {
    if (preview || !composerSkillBoundary.admitted || composerSkillBoundary.subject === null) return
    return retainManusSkillHubClient(composerSkillClient)
  }, [preview, composerSkillBoundary, composerSkillClient])
  const composerSkillScope = useMemo(() => ({ engine, scope: moveScopeKey, conversationId: projectWorkspace ? routedConversationId : activeId }), [engine, moveScopeKey, projectWorkspace, routedConversationId, activeId])
  const skillSelectionSnapshot = engine?.getSnapshot()

  const composerProps: AppFrameComposerProps = {
    skills: { client: composerSkillClient, boundary: composerSkillBoundary, scopeKey: composerSkillScope, selectable: canSubmitMessage && !hydrating && !skillSelectionSnapshot?.hasPendingSubmission && !skillSelectionSnapshot?.canRetryPendingSubmission, onSelect: actions.selectSkillForCurrentDraft },
    connections,
    connectionsEnabled: composerConnectionsEnabled,
    localDraftPersistenceFailed: engine?.getSnapshot().notice?.key === "chat.localDraftPersistenceFailed",
    submissionRecoveryFailed: engine?.getSnapshot().notice?.key === "chat.submissionRecoveryFailed",
    preview,
    brandName,
    projectWorkspace,
    hasMessages: composerHasMessages,
    creationIntent: projectedCreationIntent,
    onCreationIntentDismiss: actions.dismissCreationIntent,
    workspaceCapabilities: projectedWorkspaceCapabilities,
    onOpenMcpCatalog: overlays.openMcpCatalog,
    onOpenSettings: overlays.openSettings,
    draft,
    onDraftChange: updateDraft,
    selectedSkill: actions.selectedSkill,
    onRemoveSelectedSkill: actions.clearSelectedSkill,
    onKeyDown: actions.handleKeyDown,
    onSubmit: actions.handleSubmit,
    isStreaming,
    isAwaitingApproval: (machine.phase === "waiting" || machine.phase === "resuming"),
    canSend,
    onStop: () => engine?.cancelRun(),
    composerRef,
    emptyWorkspace: !composerHasMessages,
    mode,
    onModeChange: (next) => projectOverview ? updateProjectDraft({ mode: next }) : engine?.setMode(next),
    modeLocked,
    models: selectors.models,
    modelCatalogStatus: selectors.modelCatalogStatus,
    onRetryModels: selectors.retryModels,
    hideModelSelector: !hasMessages && (projectedCreationIntent === "website" || projectedCreationIntent === "app"),
    selectedModel: projectOverview ? projectDraft.model : selectors.selectedModel,
    onModelChange: projectOverview ? (model) => updateProjectDraft({ model }) : selectors.setSelectedModel,
    modelLocked: modeLocked,
  }

  const emptyStateProps: EmptyStateProps = {
    ...(projectReadBoundary === undefined ? {} : { projectReadBoundary }),
    projectInstructionContext: projectReads.context,
    projectHistoryStatus: projectReads.instructionHistory.status,
    projectHistoryRetryable: projectReads.instructionHistory.status === "error" && projectReads.instructionHistory.retryable,
    projectDetail: projectReads.current,
    projectMcpRecommendations: recommendations,
    onRetryProjectRead: refreshProjects,
    ...(brandName === undefined ? {} : { brandName }),
    preview,
    ...(scheduledTaskClient === undefined ? {} : { scheduledTaskClient }),
    draft,
    ...(projectedCreationIntent === null ? {} : { creationIntent: projectedCreationIntent }),
    projectWorkspace,
    onPrompt: actions.handlePrompt,
    onCreationIntentSelect: actions.handleCreationIntentSelect,
    projectConversations,
    activeProjectConversationId: activeId,
    onSelectProjectConversation: selectConversationWithMoveFence,
    onOpenSession: selectConversationWithMoveFence,
    projectConversationsLoading: conversationsCtl?.loading ?? true,
    projectConversationsError: conversationsCtl?.error ?? false,
    onRetryProjectConversations: () => conversationsCtl?.refresh(),
    ...(project.projectInstructionRequest === undefined ? {} : { projectInstructionRequest: project.projectInstructionRequest }),
    projectInstructions: project.projectInstructions,
    projectInstructionHistory: project.projectInstructionHistory,
    onSaveProjectInstructions: project.saveProjectInstructions,
    onUploadProjectResource: project.uploadProjectResource,
    onListProjectResources: project.listProjectResources,
    ...(projectRef === undefined ? {} : { projectRef }),
    onOpenSettings: overlays.openSettings,
    onOpenProject: project.openProject,
    ...(projectPins.available ? { projectPins } : {}),
    onCreateProject: project.createProject,
    onCreateMcp: overlays.openMcpCreate,
    onCreateSkillWithAi: actions.startSkillCreationFromSettings,
    onTrySkill: actions.startSkillUseFromSettings,
    models: selectors.models,
    selectedModel: selectors.selectedModel,
    onModelChange: selectors.setSelectedModel,
    composer: emptyStateOwnsComposer ? <AppFrameComposer {...composerProps} /> : undefined,
    workspaceCapabilities: projectedWorkspaceCapabilities,
    shareClient,
  }

  const composer = navigationState.conversationMissing ? null : <AppFrameComposer {...composerProps} />

  const toggleNavigationRail = useCallback(() => {
    if (layout.compactDesktopRail) layout.setCompactRailOpen((open) => !open)
    else if (!narrowWeb) layout.setRailCollapsed((collapsed) => !collapsed)
  }, [layout, narrowWeb])

  const mainSurface = (
    <AppFrameMainSurface
      brandName={brandName}
      activeId={activeId}
      mounted={mounted}
      hideWorkspaceHeader={hideWorkspaceHeader}
      standaloneSurface={standaloneSurface}
      projectWorkspace={projectWorkspace}
      projectRef={projectRef}
      resolvedRailCollapsed={layout.resolvedRailCollapsed}
      narrowWeb={narrowWeb}
      compactDesktopRail={layout.compactDesktopRail}
      onNavigationToggle={toggleNavigationRail}
      navigationExpanded={!layout.resolvedRailCollapsed}
      railHidden={layout.railHidden}
      showConversation={showConversation}
      conversationHydrating={navigationState.conversationHydrating}
      conversationHydrationFailed={navigationState.conversationHydrationFailed || initialSnapshotFailed}
      conversationMissing={navigationState.conversationMissing}
      machineError={machine.error}
      connection={connection}
      onReconnect={() => engine?.reconnect()}
      projectCreation={project.projectCreation}
      projectRename={project.projectRename}
      projectContext={project.projectContext}
      projectInstruction={project.projectInstruction}
      projectDelete={project.projectDelete}
      onRetryProjectCreation={project.retryProjectCreation}
      retryConversationHydration={retryConversationHydration}
      onOpenSettings={overlays.openSettings}
      shareClient={shareClient}
      thread={thread}
      conversationProps={conversationProps}
      emptyState={EmptyState}
      emptyStateProps={emptyStateProps}
      composer={composer}
      emptyStateOwnsComposer={emptyStateOwnsComposer}
      canvas={{ ...canvas, onReopen: () => { project.dismissProjectContext(); canvas.onReopen() } }}
    />
  )

  const railProps: Omit<WorkspaceRailProps, "withinProvider"> = {
    ...(projectReadBoundary === undefined ? {} : { readBoundary: projectReadBoundary }),
    compactDesktopRail: layout.compactDesktopRail,
    collapsed: layout.resolvedRailCollapsed,
    onToggleCollapse: () => {
      if (layout.compactDesktopRail) layout.setCompactRailOpen((value) => !value)
      else layout.setRailCollapsed((value) => !value)
    },
    onNewChat: startNewChatWithMoveFence,
    ...(brandName === undefined ? {} : { brandName }),
    ...(brandMark === undefined ? {} : { brandMark }),
    ...(brandLogoUrl === undefined ? {} : { brandLogoUrl }),
    ...(navigation === undefined ? {} : { navigation }),
    ...(featureFlags === undefined ? {} : { featureFlags }),
    chatHref,
    ...(projectRef === undefined ? {} : { projectHref: `/app/project/${encodeURIComponent(projectRef)}` }),
    projectActive: projectWorkspace,
    ...(!preview ? {
      projects: projectReads.list.status === "ready" ? projectReads.list.data.map((item) => ({
        id: item.id, name: item.name, href: `/app/project/${encodeURIComponent(item.id)}`, active: item.id === projectRef,
      })) : [],
      projectListStatus: projectReads.list.status,
      projectListRetryable: projectReads.list.status === "error" && projectReads.list.retryable,
      onRetryProjects: refreshProjects,
    } : {}),
    ...(projectPins.available ? { projectPins } : {}),
    onCreateProject: project.createProject,
    ...(project.projectMenuAccess ? { onRequestProjectRename: project.requestProjectRename, onRequestProjectDelete: project.requestProjectDeletion } : {}),
    ...(activeNavigationKey === undefined ? {} : { activeNavigationKey }),
    preview,
    conversations,
    activeId,
    awaitingIds,
    onSelectConversation: selectConversationWithMoveFence,
    onDeleteConversation: (id) => conversationsCtl?.deleteConversation(id) ?? Promise.resolve(false),
    onRenameConversation: (id, title) => conversationsCtl?.renameConversation(id, title),
    ...(!preview && projectReadBoundary?.admitted && projectReadBoundary.subject ? {onArchiveConversation:(id:string)=>void archive.archive(id),archiveBusy:archive.busy||archive.blocked}:{}),
    conversationScope: sessionScope,
    conversationMove,
    conversationMovePending: conversationMove?.status === "pending",
    conversationMoveFailed: moveFailureProjection?.identity === moveViewIdentity,
    onMoveConversation: (id, target) => moveConversation(sessionScope, id, target),
    conversationReads: {
      scope: sessionScope, read: conversationReaders.read, ensureScope: conversationReaders.ensureScope,
      activeId: projectWorkspace ? routedConversationId : activeId, identity: railReadIdentity, admitted: railReadAdmitted,
      archiveBusy:archive.busy||archive.blocked, ...(!preview && projectReadBoundary?.admitted && projectReadBoundary.subject?{onArchive:(id:string)=>void archive.archive(id)}:{}),
      failedMoveScopeKey: moveFailureProjection?.identity === moveViewIdentity ? moveFailureProjection.scopeKey : null,
      onSelect: (scope, id) => {
        if (sessionScopeKey(scope) === moveScopeKey) selectConversationWithMoveFence(id)
        else {
          setMoveSelectionGeneration((generation) => generation + 1)
          navigateMountedSurface(scope.kind === "direct" ? `/app?conversation=${encodeURIComponent(id)}` : `/app/project/${encodeURIComponent(scope.projectRef)}?conversation=${encodeURIComponent(id)}`)
        }
      },
      onNewChat: (scope) => {
        if (sessionScopeKey(scope) === moveScopeKey) startNewChatWithMoveFence()
      },
      onMove: moveConversation,
    },
    onRetryConversationMove: retryConversationMove,
    onOpenSettings: overlays.openSettings,
    accountTriggerRef,
    listLoading: conversationsCtl?.loading ?? true,
    listLoadingMore: conversationsCtl?.loadingMore ?? false,
    listError: conversationsCtl?.error ?? false,
    onRetryList: () => conversationsCtl?.refresh(),
    hasMore: conversationsCtl?.hasMore ?? false,
    onLoadMore: () => conversationsCtl?.loadMore(),
  }

  const commandProps: Omit<AppCommandMenuProps, "open" | "onOpenChange"> = {
    onNewChat: startNewChatFromCommandWithMoveFence,
    onOpenSettings: overlays.openSettings,
    ...(navigation === undefined ? {} : { navigation }),
    ...(featureFlags === undefined ? {} : { featureFlags }),
    projectWorkspace,
    returnFocusRef: overlays.commandReturnFocusRef,
    focusScopeRef: layout.shellRef,
  }

  const overlaySurfaces = (
    <>
    {!preview && projectReadBoundary?.admitted && archive.blocked ? <div className={archiveStyles.archiveFeedback} role="group" aria-label={t("data.unknown")}><p role="alert">{t("data.unknown")}</p><button type="button" disabled={archive.busy} onClick={()=>void archive.reconcile()}>{t("data.reload")}</button>{archive.review?<button type="button" disabled={archive.busy} onClick={archive.proceed}>{t("data.continue")}</button>:null}</div>:null}
    {copyFeedback !== null && copyFeedback.lifetime.view === copyView && copyFeedback.lifetime.live ? (
      <div className={shellStyles.taskLinkFeedback} role={copyFeedback.kind === "success" ? "status" : "alert"}>
        {t(copyFeedback.kind === "success" ? "shell.taskLinkCopied" : "shell.taskLinkCopyFailed")}
      </div>
    ) : null}
    <AppFrameOverlaySurfaces
      mounted={mounted}
      mcpCatalog={{ open: overlays.mcpCatalogOpen, onOpenChange: open => { if (!open) overlays.closeMcpCatalog() },
        returnFocusRef: overlays.mcpCatalogReturnFocusRef, onCreate: overlays.openMcpCatalogCreate }}
      settingsTab={navigationState.settingsTab}
      {...(overlays.settingsSkillsScope === undefined ? {} : { settingsSkillsScope: overlays.settingsSkillsScope })}
      brandName={brandName}
      preview={preview}
      onArchiveChanged={archive.confirmed}
      {...(projectReadBoundary === undefined ? {} : { readBoundary: projectReadBoundary })}
      onCloseSettings={overlays.closeSettings}
      onTabChange={(tab, skillsView) => navigationState.syncSettingsUrl(tab, "replace", skillsView)}
      onCreateSkillWithAi={actions.startSkillCreationFromSettings}
      onTrySkill={actions.startSkillUseFromSettings}
      settingsReturnFocusRef={overlays.settingsReturnFocusRef}
      shellRef={layout.shellRef}
      mcpCreateMode={overlays.mcpCreateMode}
      setMcpCreateMode={(mode) => overlays.setMcpCreateMode(mode)}
      mcpCreateReturnFocusRef={overlays.mcpCreateReturnFocusRef}
      commandMenu={CommandMenu}
      commandProps={commandProps}
      commandOpen={overlays.commandOpen}
      onCommandOpenChange={overlays.setCommandOpen}
    />
    </>
  )

  const {
    compactDesktopRail: layoutCompactDesktopRail,
    setCompactRailOpen,
    setRailCollapsed,
  } = layout
  const onRailOpenChange = useCallback((open: boolean) => {
    if (layoutCompactDesktopRail) setCompactRailOpen(open)
    else setRailCollapsed(!open)
  }, [layoutCompactDesktopRail, setCompactRailOpen, setRailCollapsed])

  return (
    <>
    {conversationReaders.hosts}
    <McpTrialProvider onTry={composerConnectionsEnabled ? actions.startMcpTrial : null}>
    <ConnectorCommandProvider client={browserHubClient({ preview })} boundary={preview ? { admitted: true, subject: "preview", generation: 0 } : projectReadBoundary ?? { admitted: false, subject: null, generation: 0 }}>
    <AppFrameShell
      {...(projectReadBoundary === undefined ? {} : { readBoundary: projectReadBoundary })}
      preview={preview}
      webSkin={resolvedWebSkin}
      narrowWeb={narrowWeb}
      compactDesktopRail={layout.compactDesktopRail}
      hideWorkspaceHeader={hideWorkspaceHeader}
      resolvedRailCollapsed={layout.resolvedRailCollapsed}
      railHidden={layout.railHidden}
      railWidth={layout.railWidth}
      canvasWidth={layout.canvasWidth}
      isResizing={layout.isResizing}
      shellRef={layout.shellRef}
      workspaceRef={layout.workspaceRef}
      onRailOpenChange={onRailOpenChange}
      onNavigationToggle={toggleNavigationRail}
      onResizeStart={layout.onResizeStart}
      onResizeKeyDown={layout.onResizeKeyDown}
      onCanvasLayoutChange={layout.onCanvasLayoutChange}
      onCanvasResizeStart={layout.onCanvasResizeStart}
      railProps={railProps}
      mainSurface={mainSurface}
      canvas={canvas}
      hideCanvas={project.projectContext.open && !projectOverview}
      thread={thread}
      activeId={activeId}
      overlays={overlaySurfaces}
    />
    </ConnectorCommandProvider>
    </McpTrialProvider>
    </>
  )
}
