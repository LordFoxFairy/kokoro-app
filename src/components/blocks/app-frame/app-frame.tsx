"use client"

import { useCallback, useEffect, useRef } from "react"

import { activeMode } from "@/core/conversations"
import { isCreditInsufficient } from "@/billing/rules"
import { useHydrated } from "@/lib/use-hydrated"
import { useIsMobile } from "@/hooks/use-mobile"
import type { SessionClient } from "@/engine/client"
import { useT } from "@/i18n/context"
import { browserListClient } from "@/ui/shell/page-clients"
import { useAwaitingNotify } from "@/ui/shell/use-awaiting-notify"
import { useCanvasWorkspace } from "@/ui/shell/use-canvas-workspace"
import { useComposerSelectors } from "@/ui/shell/use-composer-selectors"
import { useConversationList } from "@/ui/shell/use-conversation-list"
import { useDraft } from "@/ui/shell/use-draft"
import { removePinned, usePinnedSkills } from "@/ui/shell/use-pinned-skills"
import type { ConversationThreadProps } from "@/ui/thread/conversation-thread"
import type { WorkspaceRailProps } from "@/components/blocks/workspace-rail/workspace-rail"
import type { AppCommandMenuProps } from "./app-command-menu"

import { AppCommandMenu } from "./app-command-menu"
import { AppFrameComposer, type AppFrameComposerProps } from "./app-frame-composer"
import { AppFrameMainSurface } from "./app-frame-main-surface"
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

export type { AppCommandMenuProps }
export type { AppFrameProps, EmptyStateProps, WorkspaceCapabilities } from "./app-frame.types"
export { COMPACT_DESKTOP_RAIL_BREAKPOINT, settingsTabFromLocation }

export function AppFrame({
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

  const pinnedSkills = usePinnedSkills(engine)
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
  const conversationsCtl = useConversationList({
    engine,
    preview,
    activeId,
    thread,
    isStreaming,
    focusComposer,
    scope: sessionScope,
  })
  const awaitingIds = useAwaitingNotify(activeId, machine.phase, t, brandName)

  const { draft, updateDraft, clearDraft } = useDraft(activeId, mounted)
  const project = useAppFrameProject({
    projectRef,
    projectWorkspace,
    preview,
    mounted,
    draft,
    updateDraft,
    clearDraft,
    ...(onOpenProject === undefined ? {} : { onOpenProject }),
  })

  const actions = useAppFrameActions({
    engine,
    projectWorkspace,
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
    pinnedSkills,
    commandNewChatTimerRef: overlays.commandNewChatTimerRef,
  })
  const { openCommand } = overlays
  const { startNewChatAndFocus } = actions

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        openCommand()
        return
      }
      if (isNewChatShortcut(event)) {
        event.preventDefault()
        startNewChatAndFocus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [openCommand, startNewChatAndFocus])

  const hasMessages = thread.messages.length > 0
  const showConversation = hasMessages && !standaloneSurface && navigationState.routeOwnsConversation
  const hasFailed = !isStreaming && (machine.phase === "error" || thread.runStatus === "failed")
  const creditRejected = hasFailed && isCreditInsufficient(machine.error)
  const mode = store ? activeMode(store) : pendingMode
  const modeLocked = hasMessages
  const canSend = draft.trim().length > 0
  const conversations = conversationsCtl.conversations
  const projectTaskView = projectWorkspace && navigationState.resolvedConversationRouteId !== null && !narrowWeb
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
    const requestedConversationId = navigationState.resolvedConversationRouteId
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
  }, [engine, navigationState.resolvedConversationRouteId])

  const EmptyState = emptyState ?? DefaultEmptyState
  const shareClient: Pick<SessionClient, "createShare" | "revokeShare"> = browserListClient({ preview })

  const conversationProps: ConversationThreadProps = {
    ...(brandName === undefined ? {} : { brandName }),
    sessionId: activeId,
    thread,
    isStreaming,
    isReconnecting: machine.phase === "reattaching",
    hasFailed,
    creditRejected,
    onOpenBilling: () => overlays.openSettings("credits"),
    onOpenPricing: () => overlays.openSettings("subscription"),
    onRetry: retryAndFocusComposer,
    mode,
    stagingByRun: staging,
    hitlRunId: machine.phase === "awaiting-hitl" ? machine.runId : null,
    controlError: machine.phase === "awaiting-hitl" ? machine.error : null,
    onToolDecision: (runId, toolId, decision) => engine?.stageToolDecision(runId, toolId, decision),
    onCancelRun: () => engine?.cancelRun(),
    onOpenFile: canvas.openFile,
    onOpenDelivery: canvas.openDelivery,
    onOpenTool: canvas.openTool,
  }

  const projectConversations: NonNullable<EmptyStateProps["projectConversations"]> = conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    status: conversation.id === activeId
      ? machine.phase === "awaiting-hitl"
        ? "waiting"
        : isStreaming
          ? "running"
          : hasFailed
            ? "failed"
            : thread.messages.length > 0
              ? "completed"
              : "queued"
      : conversation.title.length > 0
        ? "completed"
        : "queued",
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
    isAwaitingApproval: machine.phase === "awaiting-hitl",
    canSend,
    onStop: () => engine?.cancelRun(),
    composerRef,
    emptyWorkspace: !hasMessages,
    mode,
    onModeChange: (next) => engine?.setMode(next),
    modeLocked,
    pinnedSkills,
    onUnpinSkill: removePinned,
    models: selectors.models,
    hideModelSelector: !hasMessages && (!projectedCreationIntent || projectedCreationIntent === "website" || projectedCreationIntent === "app"),
    selectedModel: selectors.selectedModel,
    onModelChange: selectors.setSelectedModel,
    modelLocked: modeLocked,
    agents: selectors.agents,
    selectedAgent: selectors.selectedAgent,
    onAgentChange: selectors.setSelectedAgent,
    agentLocked: modeLocked,
  }

  const emptyStateProps: EmptyStateProps = {
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
    onSelectProjectConversation: actions.selectConversationWithUrl,
    onOpenSession: actions.selectConversationWithUrl,
    projectConversationsLoading: conversationsCtl.loading,
    projectConversationsError: conversationsCtl.error,
    onRetryProjectConversations: conversationsCtl.refresh,
    projectInstructions: project.projectInstructions,
    projectInstructionHistory: project.projectInstructionHistory,
    onSaveProjectInstructions: project.saveProjectInstructions,
    onUploadProjectResources: project.uploadProjectResources,
    onSetProjectSkillEnabled: project.setProjectSkillEnabled,
    onCreateProjectScheduledTask: project.createProjectScheduledTask,
    projectTask: projectTaskView,
    onOpenSettings: overlays.openSettings,
    onOpenProject: project.openProject,
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
      projectTaskView={projectTaskView}
      resolvedRailCollapsed={layout.resolvedRailCollapsed}
      narrowWeb={narrowWeb}
      compactDesktopRail={layout.compactDesktopRail}
      railHidden={layout.railHidden}
      showConversation={showConversation}
      conversationHydrating={navigationState.conversationHydrating}
      conversationHydrationFailed={navigationState.conversationHydrationFailed}
      machineError={machine.error}
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
    onNewChat: actions.startNewChatAndFocus,
    ...(brandName === undefined ? {} : { brandName }),
    ...(brandMark === undefined ? {} : { brandMark }),
    ...(brandLogoUrl === undefined ? {} : { brandLogoUrl }),
    ...(navigation === undefined ? {} : { navigation }),
    ...(featureFlags === undefined ? {} : { featureFlags }),
    chatHref,
    projectHref: projectRef ? `/app/project/${encodeURIComponent(projectRef)}` : "/app/project/kokoro",
    projectActive: projectWorkspace,
    onCreateProject: project.createProject,
    ...(activeNavigationKey === undefined ? {} : { activeNavigationKey }),
    preview,
    conversations,
    activeId,
    awaitingIds,
    onSelectConversation: actions.selectConversationWithUrl,
    onDeleteConversation: conversationsCtl.deleteConversation,
    onRenameConversation: conversationsCtl.renameConversation,
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
    onNewChat: actions.startNewChatFromCommand,
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
      engine={engine}
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
