"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"

import { activeMode } from "@/core/conversations"
import { isCreditInsufficient } from "@/billing/rules"
import { useHydrated } from "@/lib/use-hydrated"
import { useIsMobile } from "@/hooks/use-mobile"
import type { SessionClient } from "@/engine/client"
import { useT } from "@/i18n/context"
import { browserConversationMoveCoordinator, browserListClient, evictBrowserConversationIndex } from "@/ui/shell/page-clients"
import {
  createConversationMoveCoordinator,
  type ConversationMoveResult,
} from "@/ui/shell/conversation-move-coordinator"
import { useAwaitingNotify } from "@/ui/shell/use-awaiting-notify"
import { useCanvasWorkspace } from "@/ui/shell/use-canvas-workspace"
import { useComposerSelectors } from "@/ui/shell/use-composer-selectors"
import { useConversationList } from "@/ui/shell/use-conversation-list"
import { useDraft } from "@/ui/shell/use-draft"
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
  isNewChatShortcut,
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
import { navigateMountedSurface } from "@/ui/navigation/mounted-surface-navigation"
import { sessionScopeKey } from "@/engine/session-scope"
import shellStyles from "./app-frame.module.css"

export type { AppCommandMenuProps }
export type { AppFrameProps, EmptyStateProps, WorkspaceCapabilities } from "./app-frame.types"
export { COMPACT_DESKTOP_RAIL_BREAKPOINT, settingsTabFromLocation }

function AppFrameBootingSurface({ brandName, projectWorkspace = false }: Pick<AppFrameProps, "brandName" | "projectWorkspace">) {
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
    <div className={shellStyles.shell} data-desktop-web="true" data-web-skin="kokoro">
      <div className={`${shellStyles.inset} flex flex-1`} data-slot="sidebar-inset">
        <div className={shellStyles.workspace}>
          <div className={`${shellStyles.mainPanel} flex-1`}>
            <AppFrameBootingMainSurface composer={composer} />
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
        {...(props.projectWorkspace === undefined ? {} : { projectWorkspace: props.projectWorkspace })}
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
    projectRef,
    projectWorkspace,
    mounted,
    activeId,
    threadMessageCount: thread.messages.length,
    hydrating,
    machinePhase: machine.phase,
  })

  const overlays = useAppFrameOverlays({
    mounted,
    settingsTab: navigationState.settingsTab,
    setSettingsTab: navigationState.setSettingsTab,
    settingsHistoryEntryRef: navigationState.settingsHistoryEntryRef,
    syncSettingsUrl: navigationState.syncSettingsUrl,
    shellRef: layout.shellRef,
    composerRef,
    accountTriggerRef,
  })

  const selectors = useComposerSelectors(engine, { preview })

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
  const conversationsCtl = useConversationList({
    engine,
    preview,
    activeId,
    thread,
    isStreaming,
    focusComposer,
    scope: sessionScope,
    readBoundary: { identity: railReadIdentity, admitted: railReadAdmitted },
    scopeRevision: moveSnapshot.scopeVersions.get(moveScopeKey) ?? 0,
  })
  const conversationMove = moveSnapshot.intent
  const [moveSelectionGeneration, setMoveSelectionGeneration] = useState(0)
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
  const awaitingIds = useAwaitingNotify(activeId, machine.phase, t, brandName)

  const routedConversationId = navigationState.resolvedConversationRouteId
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
  const projectReads = useProjectList(preview, projectReadBoundary, projectRef, projectWorkspace)
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
    refreshProject: refreshProjects,
    refreshRenamedProject: projectReads.refreshRenamedProject,
    ...(projectReadBoundary === undefined ? {} : { renameBoundary: projectReadBoundary }),
    renameRouteKey: JSON.stringify([projectRef ?? null, activeId, navigationState.settingsTab]),
  })

  const actions = useAppFrameActions({
    engine,
    projectWorkspace,
    ...(projectRef === undefined ? {} : { projectRef }),
    routedConversationId,
    standaloneSurface,
    chatHref,
    activeId,
    draft,
    clearDraft,
    updateDraft,
    setDeploymentIntent: navigationState.setDeploymentIntent,
    syncConversationUrl: navigationState.syncConversationUrl,
    setConversationRouteId: navigationState.setConversationRouteId,
    conversations: conversationsCtl,
    focusComposer,
    closeSettings: overlays.closeSettings,
    brandName,
    commandNewChatTimerRef: overlays.commandNewChatTimerRef,
  })
  // A folder's explicit new-chat action is consumed by the destination's
  // committed engine, never by a made-up deep-link conversation id. This
  // mounted handoff is short-lived; it is not a queued owner command.
  const folderNewChatIntentRef = useRef<{
    identity: string
    scopeKey: string
    target: string
    actor: string | null
    timer: number
  } | null>(null)
  const clearFolderNewChatIntent = useCallback(() => {
    const intent = folderNewChatIntentRef.current
    folderNewChatIntentRef.current = null
    if (intent !== null) window.clearTimeout(intent.timer)
  }, [])
  useEffect(() => {
    const onNavigation = () => {
      const intent = folderNewChatIntentRef.current
      if (intent !== null && `${window.location.pathname}${window.location.search}${window.location.hash}` !== intent.target) clearFolderNewChatIntent()
    }
    // Even history returning to the same address must not resurrect a click.
    window.addEventListener("popstate", clearFolderNewChatIntent)
    window.addEventListener("kokoro:surface-navigation", onNavigation)
    return () => {
      window.removeEventListener("popstate", clearFolderNewChatIntent)
      window.removeEventListener("kokoro:surface-navigation", onNavigation)
      clearFolderNewChatIntent()
    }
  }, [clearFolderNewChatIntent])
  useLayoutEffect(() => {
    const intent = folderNewChatIntentRef.current
    if (intent === null) return
    let actor: string | null
    try { actor = window.localStorage.getItem("kokoro.web.auth-index-subject") }
    catch { clearFolderNewChatIntent(); return }
    if (!railReadAdmitted || intent.identity !== railReadIdentity || actor !== intent.actor ||
      `${window.location.pathname}${window.location.search}${window.location.hash}` !== intent.target) {
      clearFolderNewChatIntent()
      return
    }
    // Preserve the source scope while the destination lease is committing.
    if (intent.scopeKey !== moveScopeKey || engine === null) return
    const destination = engine.getSnapshot()
    if (destination.canRetryPendingSubmission || destination.machine.phase !== "idle" || destination.connection.status !== "connected") {
      clearFolderNewChatIntent()
      return
    }
    if (destination.hydrating) return
    if (!destination.canSubmitMessage) { clearFolderNewChatIntent(); return }
    clearFolderNewChatIntent() // consume before synchronous engine notification
    actions.startNewChatAndFocus()
  }, [actions, clearFolderNewChatIntent, engine, hydrating, machine.phase, moveScopeKey, railReadAdmitted, railReadIdentity])
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

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        openCommand()
        return
      }
      if (isNewChatShortcut(event)) {
        event.preventDefault()
        startNewChatWithMoveFence()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [openCommand, startNewChatWithMoveFence])

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
  const mode = store ? activeMode(store) : pendingMode
  const modeLocked = hasMessages
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
  const conversations = conversationsCtl.conversations
  const projectConversationView = projectWorkspace && navigationState.resolvedConversationRouteId !== null && !narrowWeb
  const projectedCreationIntent = projectWorkspace ? null : navigationState.deploymentIntent
  const projectedWorkspaceCapabilities = projectWorkspaceCapabilities(
    featureFlags,
    workspaceCapabilities,
  )

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
    canRetryPendingSubmission,
    canRetryResume: engine?.getSnapshot().canRetryResume ?? false,
    onRetryResume: () => engine?.retryResume(),
    creditRejected,
    onOpenBilling: () => overlays.openSettings("credits"),
    onOpenPricing: () => overlays.openSettings("subscription"),
    onRetry: retryAndFocusComposer,
    mode,
    stagingByRun: staging,
    hitlRunId: (machine.phase === "waiting" || machine.phase === "resuming") ? machine.runId : null,
    controlError: (machine.phase === "waiting" || machine.phase === "resuming") ? machine.error : null,
    onToolDecision: (runId, toolId, decision) => engine?.stageToolDecision(runId, toolId, decision),
    onCancelRun: () => engine?.cancelRun(),
    onOpenFile: canvas.openFile,
    onOpenDelivery: canvas.openDelivery,
  }

  const projectConversations: NonNullable<EmptyStateProps["projectConversations"]> = conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
  }))

  const composerProps: AppFrameComposerProps = {
    preview,
    brandName,
    projectWorkspace,
    hasMessages,
    creationIntent: projectedCreationIntent,
    onCreationIntentDismiss: actions.dismissCreationIntent,
    workspaceCapabilities: projectedWorkspaceCapabilities,
    onOpenSettings: overlays.openSettings,
    draft,
    onDraftChange: updateDraft,
    onKeyDown: actions.handleKeyDown,
    onSubmit: actions.handleSubmit,
    isStreaming,
    isAwaitingApproval: (machine.phase === "waiting" || machine.phase === "resuming"),
    canSend,
    onStop: () => engine?.cancelRun(),
    composerRef,
    emptyWorkspace: !hasMessages,
    mode,
    onModeChange: (next) => engine?.setMode(next),
    modeLocked,
    models: selectors.models,
    hideModelSelector: !hasMessages && (!projectedCreationIntent || projectedCreationIntent === "website" || projectedCreationIntent === "app"),
    selectedModel: selectors.selectedModel,
    onModelChange: selectors.setSelectedModel,
    modelLocked: modeLocked,
  }

  const emptyStateProps: EmptyStateProps = {
    projectInstructionContext: projectReads.context,
    projectHistoryStatus: projectReads.instructionHistory.status,
    projectHistoryRetryable: projectReads.instructionHistory.status === "error" && projectReads.instructionHistory.retryable,
    projectDetail: projectReads.current,
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
    projectConversationsLoading: conversationsCtl.loading,
    projectConversationsError: conversationsCtl.error,
    onRetryProjectConversations: conversationsCtl.refresh,
    projectInstructions: project.projectInstructions,
    projectInstructionHistory: project.projectInstructionHistory,
    onSaveProjectInstructions: project.saveProjectInstructions,
    onUploadProjectResource: project.uploadProjectResource,
    onListProjectResources: project.listProjectResources,
    ...(projectRef === undefined ? {} : { projectRef }),
    onSetProjectSkillEnabled: project.setProjectSkillEnabled,
    projectConversation: projectConversationView,
    onOpenSettings: overlays.openSettings,
    onOpenProject: project.openProject,
    onCreateProject: project.createProject,
    onCreateMcp: overlays.openMcpCreate,
    onCreateCustomApi: overlays.openCustomApiCreate,
    onCreateSkillWithAi: actions.startSkillCreationFromSettings,
    onTrySkill: actions.startSkillUseFromSettings,
    models: selectors.models,
    selectedModel: selectors.selectedModel,
    onModelChange: selectors.setSelectedModel,
    composer: emptyStateOwnsComposer ? <AppFrameComposer {...composerProps} /> : undefined,
    workspaceCapabilities: projectedWorkspaceCapabilities,
    shareClient,
  }

  const composer = <AppFrameComposer {...composerProps} />

  const mainSurface = (
    <AppFrameMainSurface
      brandName={brandName}
      activeId={activeId}
      mounted={mounted}
      hideWorkspaceHeader={hideWorkspaceHeader}
      standaloneSurface={standaloneSurface}
      projectWorkspace={projectWorkspace}
      projectRef={projectRef}
      projectConversationView={projectConversationView}
      resolvedRailCollapsed={layout.resolvedRailCollapsed}
      narrowWeb={narrowWeb}
      compactDesktopRail={layout.compactDesktopRail}
      railHidden={layout.railHidden}
      showConversation={showConversation}
      conversationHydrating={navigationState.conversationHydrating}
      conversationHydrationFailed={navigationState.conversationHydrationFailed || initialSnapshotFailed}
      machineError={machine.error}
      connection={connection}
      onReconnect={() => engine?.reconnect()}
      projectCreation={project.projectCreation}
      projectRename={project.projectRename}
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
      canvas={canvas}
    />
  )

  const railProps: Omit<WorkspaceRailProps, "withinProvider"> = {
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
    onCreateProject: project.createProject,
    ...(activeNavigationKey === undefined ? {} : { activeNavigationKey }),
    preview,
    conversations,
    activeId,
    awaitingIds,
    onSelectConversation: selectConversationWithMoveFence,
    onDeleteConversation: conversationsCtl.deleteConversation,
    onRenameConversation: conversationsCtl.renameConversation,
    conversationScope: sessionScope,
    conversationMove,
    conversationMovePending: conversationMove?.status === "pending",
    conversationMoveFailed: moveFailureProjection?.identity === moveViewIdentity,
    onMoveConversation: (id, target) => moveConversation(sessionScope, id, target),
    conversationReads: {
      engine, scope: sessionScope, activeId: projectWorkspace ? routedConversationId : activeId, thread, isStreaming,
      identity: railReadIdentity, admitted: railReadAdmitted, scopeVersions: moveSnapshot.scopeVersions, focusComposer,
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
        else {
          clearFolderNewChatIntent()
          if (!railReadAdmitted) return
          let actor: string | null
          try { actor = window.localStorage.getItem("kokoro.web.auth-index-subject") }
          catch { return }
          const target = scope.kind === "direct" ? "/app" : `/app/project/${encodeURIComponent(scope.projectRef)}`
          const timer = window.setTimeout(clearFolderNewChatIntent, 5_000)
          folderNewChatIntentRef.current = { identity: railReadIdentity, scopeKey: sessionScopeKey(scope), target, actor, timer }
          setMoveSelectionGeneration((generation) => generation + 1)
          navigateMountedSurface(target)
        }
      },
      onMove: moveConversation,
      onDeleteConfirmed: (scope, id) => {
        if (sessionScopeKey(scope) === moveScopeKey) setMoveSelectionGeneration((generation) => generation + 1)
        if (engine === null || sessionScopeKey(scope) !== moveScopeKey) evictBrowserConversationIndex(sessionScopeKey(scope), id)
      },
    },
    onRetryConversationMove: retryConversationMove,
    onOpenSettings: overlays.openSettings,
    accountTriggerRef,
    listLoading: conversationsCtl.loading,
    listLoadingMore: conversationsCtl.loadingMore,
    listError: conversationsCtl.error,
    onRetryList: conversationsCtl.refresh,
    hasMore: conversationsCtl.hasMore,
    onLoadMore: conversationsCtl.loadMore,
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
    <AppFrameOverlaySurfaces
      mounted={mounted}
      settingsTab={navigationState.settingsTab}
      brandName={brandName}
      preview={preview}
      onCloseSettings={overlays.closeSettings}
      onTabChange={(tab) => navigationState.syncSettingsUrl(tab, "replace")}
      onStartDeployment={actions.startDeploymentFromSettings}
      onCreateSkillWithAi={actions.startSkillCreationFromSettings}
      onTrySkill={actions.startSkillUseFromSettings}
      settingsReturnFocusRef={overlays.settingsReturnFocusRef}
      shellRef={layout.shellRef}
      mcpCreateMode={overlays.mcpCreateMode}
      setMcpCreateMode={(mode) => overlays.setMcpCreateMode(mode)}
      mcpCreateReturnFocusRef={overlays.mcpCreateReturnFocusRef}
      customApiOpen={overlays.customApiOpen}
      setCustomApiOpen={overlays.setCustomApiOpen}
      customApiReturnFocusRef={overlays.customApiReturnFocusRef}
      commandMenu={CommandMenu}
      commandProps={commandProps}
      commandOpen={overlays.commandOpen}
      onCommandOpenChange={overlays.setCommandOpen}
    />
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
    <AppFrameShell
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
      onResizeStart={layout.onResizeStart}
      onResizeKeyDown={layout.onResizeKeyDown}
      onCanvasLayoutChange={layout.onCanvasLayoutChange}
      onCanvasResizeStart={layout.onCanvasResizeStart}
      railProps={railProps}
      mainSurface={mainSurface}
      canvas={canvas}
      thread={thread}
      activeId={activeId}
      overlays={overlaySurfaces}
    />
  )
}
