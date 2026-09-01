"use client"
import { Button } from "@/components/ui/button"
import { WebSkinProvider } from "@/components/ui/web-skin"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

// 装配层：页面级单例持有引擎，useSessionEngine 订阅快照，把纯投影接线到各 UI 域。每个能力域
// 抽为 controller hook（自持查询/store/回调，见相邻 use-*.ts + page-clients.ts）；本文件只做插槽
// 接线——布局/开合/快捷键在此收口，域内状态一律下沉。

import {
  type CSSProperties,
  type ComponentType,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { Cable, FilePlus2, Plus, Sparkles } from "lucide-react"

import { activeMode } from "@/core/conversations"
import type { ModelCandidate } from "@/contract/http"
import type { SkillCard } from "@/hub/schemas"
import { type SessionEngine } from "@/engine/machine"
import type { SessionClient } from "@/engine/client"
import { useSessionEngine } from "@/engine/use-session-engine"
import { useT } from "@/i18n/context"

import { useHydrated } from "@/lib/use-hydrated"
import { isCreditInsufficient } from "@/billing/rules"
import { Composer, MAX_INPUT_LENGTH } from "@/ui/composer/composer"
import type { CreationIntent } from "@/ui/composer/creation-intent-pill"
import { WorkspaceRail } from "@/components/blocks/workspace-rail/workspace-rail"
import {
  RAIL_COLLAPSED_WIDTH,
  RAIL_COMPACT_BREAKPOINT,
  RAIL_MAX,
  RAIL_MIN,
  useRailResize,
} from "@/ui/rail/use-rail-resize"
import { ConversationThread } from "@/ui/thread/conversation-thread"
import { TodoBar } from "@/ui/todo/todo-bar"
import { ContextPanel } from "@/components/blocks/context-panel/context-panel"
import { CANVAS_MAX, CANVAS_MIN, useCanvasResize } from "@/ui/canvas/use-canvas-resize"
import { WORKSPACE_MAIN_MIN } from "@/ui/shell/layout-constraints"
import { SettingsModal, normalizeSettingsTab, type SettingsTab } from "@/ui/settings/settings-modal"
import { overlayHandoffDelay } from "@/ui/shell/overlay-handoff"
import type { RuntimeFeatureFlag, RuntimeNavigationItem } from "@/system/runtime-navigation"
import { DIRECT_SESSION_SCOPE, type SessionScope } from "@/engine/session-scope"
import { useIsMobile } from "@/hooks/use-mobile"

import { browserEngine, browserHubClient, browserListClient, releaseBrowserEngine } from "@/ui/shell/page-clients"
import { McpCreateDialog, type McpCreateMode } from "@/ui/mcp/mcp-panel"
import { CustomApiDialog } from "@/ui/mcp/connector-catalog-dialog"
import { useAwaitingNotify } from "@/ui/shell/use-awaiting-notify"
import { useCanvasWorkspace } from "@/ui/shell/use-canvas-workspace"
import { useComposerSelectors } from "@/ui/shell/use-composer-selectors"
import { useConversationList } from "@/ui/shell/use-conversation-list"
import { stashConversationDraft, useDraft } from "@/ui/shell/use-draft"
import { removePinned, togglePinned, usePinnedSkills } from "@/ui/shell/use-pinned-skills"
import { WorkspaceHeader, WorkspaceNavigationTrigger } from "@/components/blocks/workspace-header/workspace-header"
import { navigateMountedSurface } from "@/ui/navigation/mounted-surface-navigation"
import { AppCommandMenu, type AppCommandMenuProps } from "./app-command-menu"
import type { ScheduledTaskClient } from "@/features/app/scheduled-task-client"

export type { AppCommandMenuProps }

import styles from "./app-frame.module.css"

// CommandDialog and SettingsDialog are both modal focus traps. Leave a short
// handoff window between them so the closing command overlay never overlaps
// the newly mounted settings overlay.
const COMMAND_SETTINGS_HANDOFF_MS = 220
// Keep the narrow desktop state at the same threshold as the reference
// workbench. This is a fine-pointer rule only; mobile presentation remains
// owned by useIsMobile and the Sheet surface. Narrow desktop hides the rail
// track and exposes one header menu trigger instead of leaving a 52px strip.
export const COMPACT_DESKTOP_RAIL_BREAKPOINT = RAIL_COMPACT_BREAKPOINT
const PENDING_CREATION_INTENT_KEY = "kokoro.web.pending-creation-intent"

function readRailCollapsedCookie(): boolean | null {
  if (typeof document === "undefined") return null
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("sidebar_state="))
  if (!cookie) return null
  const value = cookie.slice("sidebar_state=".length)
  return value === "true" ? false : value === "false" ? true : null
}

const CREATION_INTENTS: readonly CreationIntent[] = ["presentation", "website", "design", "game", "app"]

function isCreationIntent(value: string | null): value is CreationIntent {
  return value !== null && CREATION_INTENTS.includes(value as CreationIntent)
}

function readPendingCreationIntent(): CreationIntent | null {
  if (typeof window === "undefined") return null
  try {
    const value = window.sessionStorage.getItem(PENDING_CREATION_INTENT_KEY)
    return isCreationIntent(value) ? value : null
  } catch {
    return null
  }
}

function readInitialCreationIntent(): CreationIntent | null {
  const stored = readPendingCreationIntent()
  if (stored !== null) return stored
  // `qa=capsule-final` is a local screenshot fixture, not a product mode. It
  // makes the capsule comparison URL deterministic after a fresh tab while
  // keeping the real `/app` route neutral until the user chooses Website.
  if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    const qa = new URLSearchParams(window.location.search).get("qa")
    if (qa === "capsule-final") return "website"
  }
  return null
}

function writePendingCreationIntent(value: CreationIntent | null): void {
  if (typeof window === "undefined") return
  try {
    if (value === null) window.sessionStorage.removeItem(PENDING_CREATION_INTENT_KEY)
    else window.sessionStorage.setItem(PENDING_CREATION_INTENT_KEY, value)
  } catch {
    // Storage can be unavailable in a locked-down browser; the in-memory
    // React state still keeps the current tab usable.
  }
  // Remove the pre-sessionStorage key so an upgrade cannot resurrect an old
  // creation capsule from localStorage or leak it to another tab/site.
  try {
    window.localStorage.removeItem(PENDING_CREATION_INTENT_KEY)
  } catch {
    // Ignore storage cleanup failures; it is only compatibility hygiene.
  }
}

function useCompactDesktopRail(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const query = window.matchMedia(`(max-width: ${COMPACT_DESKTOP_RAIL_BREAKPOINT}px) and (pointer: fine)`)
      query.addEventListener("change", onStoreChange)
      return () => query.removeEventListener("change", onStoreChange)
    },
    () => window.matchMedia(`(max-width: ${COMPACT_DESKTOP_RAIL_BREAKPOINT}px) and (pointer: fine)`).matches,
    () => false,
  )
}

function isFocusTargetAvailable(target: HTMLElement | null): target is HTMLElement {
  if (!target || !target.isConnected || target.hasAttribute("disabled")) {
    return false
  }
  // Shell-owned return targets are explicitly mounted focus destinations. A
  // portal close can briefly report an empty computed style while the rail is
  // committing its next frame, so do not reject these stable markers.
  if (target.hasAttribute("data-settings-return-target")) {
    return true
  }
  if (target.matches('[data-sidebar="trigger"], [data-slot="sidebar-trigger"]')) {
    const rect = target.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }
  const style = window.getComputedStyle(target)
  return style.display !== "none" && style.visibility !== "hidden"
}

// 新对话快捷键 ⇧⌘O（mac）/ ⇧Ctrl O（其它平台）：与侧栏展示的提示一致。
function isNewChatShortcut(event: {
  key: string
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}): boolean {
  return (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "o"
}

export function settingsTabFromLocation(): SettingsTab | null {
  if (typeof window === "undefined") {
    return null
  }
  const search = new URLSearchParams(window.location.search)
  // Manus also exposes settings as a hash deep-link (`#settings/general`).
  // Accept both forms so a copied reference URL opens the same panel instead
  // of silently rendering the workspace with no modal.
  const hashSegments = window.location.hash
    .replace(/^#\/?/, "")
    .split(/[/?#]/)
    .filter(Boolean)
  const settingsIndex = hashSegments.lastIndexOf("settings")
  const hashTab = settingsIndex >= 0 ? hashSegments[settingsIndex + 1] ?? null : null
  const raw = search.get("settings") ?? hashTab
  return raw === null ? null : normalizeSettingsTab(raw)
}

// The address bar is a shareable view state, not an identity boundary. Keep
// the conversation reference opaque and leave tenant/site resolution to the
// server-side host binding.
function conversationIdFromLocation(): string | null {
  if (typeof window === "undefined") {
    return null
  }
  const queryValue = new URLSearchParams(window.location.search).get("conversation")
  if (queryValue?.trim()) {
    return queryValue.trim()
  }

  // Conversation links can also arrive from the hash router. Keep the
  // accepted forms deliberately narrow so settings/catalog hashes remain
  // untouched: `#conversation=ID` and `#/conversation/ID`.
  const hash = window.location.hash.replace(/^#\/?/, "")
  if (hash.startsWith("conversation=")) {
    const value = new URLSearchParams(hash).get("conversation")
    return value?.trim() || null
  }
  const match = hash.match(/^conversation\/([^/]+)$/)
  if (!match) {
    return null
  }
  try {
    return decodeURIComponent(match[1]).trim() || null
  } catch {
    return null
  }
}

export type AppFrameProps = {
  // 测试注入缝：不传则使用页面级单例引擎。
  engine?: SessionEngine | null
  // 显式预览档：沿用完整 User Web 布局，但使用本地假传输。
  preview?: boolean
  // 服务端按 host 解析的站点品牌名（SITE-REAL），透传给 rail。
  brandName?: string
  /** Runtime-projected site mark/logo; the shell only reserves the lockup slot. */
  brandMark?: string
  brandLogoUrl?: string
  /** Site-owned semantic skin. The shell never invents page-specific colors. */
  webSkin?: "kokoro"
  /** System-projected product menu. Undefined keeps the site-owned default menu for preview. */
  navigation?: readonly RuntimeNavigationItem[]
  featureFlags?: readonly RuntimeFeatureFlag[]
  /** Typed site capability projection consumed by the site-owned empty surface. */
  workspaceCapabilities?: WorkspaceCapabilities
  /** The site route that owns the conversation surface (preview and live may differ). */
  chatHref: string
  /** Site-owned empty-workspace surface. The shell only supplies the prompt action. */
  emptyState?: ComponentType<EmptyStateProps>
  /** Explicit live Scheduled adapter; the shell never guesses its transport. */
  scheduledTaskClient?: ScheduledTaskClient
  /** Site welcome may own the empty-state composer slot without owning its logic. */
  emptyStateOwnsComposer?: boolean
  /**
   * Catalog routes (Agent, Plugins, Scheduled, Library) own the whole main
   * surface. They must not be replaced by a restored conversation when the
   * shared engine happens to have an active direct-chat message.
   */
  standaloneSurface?: boolean
  /** Desktop site skins may prefer Manus-style icon rail on first visit. */
  desktopRailCollapsed?: boolean
  /** Route-owned catalog surfaces replace the conversation header with their own page header. */
  hideWorkspaceHeader?: boolean
  /** Route-level project workspace state owned by the site adapter. */
  projectWorkspace?: boolean
  /** Active command-rail destination; keeps route selection and visual selection in one source. */
  activeNavigationKey?: string
  /** Opaque project reference; absent selects the user's direct-chat inbox. */
  projectRef?: string
  commandMenu?: ComponentType<AppCommandMenuProps>
}

export type EmptyStateProps = {
  brandName?: string
  /** Route-owned desktop surfaces use the same preview/live transport as the shell. */
  preview?: boolean
  /** Explicit scheduled-task adapter passed through the mounted shell. */
  scheduledTaskClient?: ScheduledTaskClient
  /** Current shell-owned draft; site surfaces may project draft-dependent layout without owning editor state. */
  draft?: string
  /** Explicit creation mode; a non-empty draft alone never selects a product workflow. */
  creationIntent?: CreationIntent
  onPrompt: (prompt: string, intent?: CreationIntent) => void
  /** Selects a capability capsule without inventing prompt text in the editor. */
  onCreationIntentSelect?: (intent: CreationIntent) => void
  /** Session-backed conversations for a site-owned project workbench. */
  projectConversations?: readonly {
    id: string
    title: string
    status?: ProjectConversationStatus
    updatedAt?: number
  }[]
  activeProjectConversationId?: string | null
  onSelectProjectConversation?: (id: string) => void
  /** Open the artifact's source conversation without coupling a site surface to the engine. */
  onOpenSession?: (id: string) => void
  projectConversationsLoading?: boolean
  projectConversationsError?: boolean
  onRetryProjectConversations?: () => void
  /** Persisted project-level instructions loaded from the project projection. */
  projectInstructions?: string
  projectInstructionHistory?: readonly {
    id: string
    instruction: string
    updatedAt: number
    actorName: string
    current?: boolean
  }[]
  onSaveProjectInstructions?: (instructions: string) => Promise<void>
  onUploadProjectResources?: (files: FileList) => Promise<void>
  onSetProjectSkillEnabled?: (skill: string, enabled: boolean) => Promise<void>
  onCreateProjectScheduledTask?: (task: {
    title: string
    prompt: string
    frequency: string
    time: string
    expiresAt?: string
    autoApprove: boolean
  }) => Promise<void>
  /** Site-owned welcome actions can hand off to shared workspace settings. */
  onOpenSettings?: (tab: SettingsTab, returnTarget?: HTMLElement | null) => void
  /** Route-owned catalogs can open the shared MCP creation dialogs directly. */
  onCreateMcp?: (mode: McpCreateMode, returnTarget?: HTMLElement | null) => void
  onCreateCustomApi?: (returnTarget?: HTMLElement | null) => void
  /** Skill catalog actions hand off to the shell-owned direct Chat session. */
  onCreateSkillWithAi?: () => void
  onTrySkill?: (skill: SkillCard, prompt?: string) => void
  /** Optional live model catalog for site-owned empty surfaces. */
  models?: readonly ModelCandidate[]
  selectedModel?: string | null
  onModelChange?: (selector: string) => void
  composer?: ReactNode
  workspaceCapabilities?: WorkspaceCapabilities
  /** Project route renders the project workbench instead of the direct-chat home. */
  projectWorkspace?: boolean
  /** Desktop project task route keeps a fresh task distinct from the project overview. */
  projectTask?: boolean
  /** Session share capability for project-style desktop headers. */
  shareClient?: Pick<SessionClient, "createShare" | "revokeShare">
}

type ProjectConversationStatus = "queued" | "running" | "waiting" | "completed" | "failed"

export type WorkspaceCapabilities = {
  instructions: boolean
  connectors: boolean
  resources: boolean
  skills: boolean
  projectConversations: boolean
  /** Site-owned project surfaces may expose a task-backed website workspace. */
  websites?: boolean
  /** Site-owned project surfaces may expose scheduled-task creation. */
  scheduledTasks?: boolean
}

const DEFAULT_WORKSPACE_CAPABILITIES: WorkspaceCapabilities = {
  instructions: true,
  connectors: true,
  resources: true,
  skills: true,
  projectConversations: true,
  websites: true,
  scheduledTasks: true,
}

const WORKSPACE_CAPABILITY_KEYS: Readonly<Record<keyof WorkspaceCapabilities, readonly string[]>> = {
  instructions: ["workspace.instructions", "project.instructions"],
  connectors: ["workspace.connectors", "project.connectors"],
  resources: ["workspace.resources", "project.resources", "workspace.files"],
  skills: ["workspace.skills", "project.skills"],
  projectConversations: ["workspace.conversations", "project.conversations"],
  websites: ["workspace.websites", "project.websites"],
  scheduledTasks: ["workspace.scheduled_tasks", "project.scheduled_tasks"],
} as const

function projectWorkspaceCapabilities(
  flags: readonly RuntimeFeatureFlag[] | undefined,
  explicit: WorkspaceCapabilities | undefined,
): WorkspaceCapabilities {
  if (explicit) return explicit
  const fallback = flags === undefined ? DEFAULT_WORKSPACE_CAPABILITIES : {
    instructions: false,
    connectors: false,
    resources: false,
    skills: false,
    projectConversations: false,
  }
  return Object.fromEntries(
    Object.entries(WORKSPACE_CAPABILITY_KEYS).map(([capability, keys]) => {
      const flag = flags?.find((candidate) => keys.includes(candidate.key))
      return [capability, flag?.enabled ?? fallback[capability as keyof WorkspaceCapabilities]]
    }),
  ) as WorkspaceCapabilities
}

function DefaultEmptyState({ brandName }: EmptyStateProps) {
  const t = useT()
  return (
    <Empty className="min-h-0 flex-1 rounded-none border-0 px-6 py-10">
      <EmptyHeader>
        <EmptyTitle>{brandName ?? t("rail.workspace")}</EmptyTitle>
        <EmptyDescription>{t("shell.subhead")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

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
  activeNavigationKey,
  commandMenu: CommandMenu = AppCommandMenu,
  preview = false,
}: AppFrameProps) {
  const t = useT()
  const sessionScope = useMemo<SessionScope>(
    () => projectRef ? { kind: "project", projectRef } : DIRECT_SESSION_SCOPE,
    [projectRef],
  )
  const engine = injectedEngine !== undefined ? injectedEngine : browserEngine({ preview, scope: sessionScope })
  const snapshot = useSessionEngine(engine)
  const { machine, store, thread, pendingMode, staging } = snapshot
  const activeId = store?.activeId ?? null

  // A project/direct route change replaces the scope-owned engine while this
  // AppFrame stays mounted. Close the old scope immediately so its SSE,
  // storage subscription, and reattach timers cannot accumulate behind the
  // current rail selection. Injected test engines remain caller-owned.
  const browserEngineRef = useRef<SessionEngine | null>(engine)
  const browserEngineMountedRef = useRef(false)
  useEffect(() => {
    if (injectedEngine !== undefined) return
    const previous = browserEngineRef.current
    if (previous !== engine) {
      releaseBrowserEngine(previous)
    }
    browserEngineMountedRef.current = true
    browserEngineRef.current = engine
    return () => {
      // React Strict Mode deliberately runs effect cleanup/setup once during
      // development. Defer unmount disposal by one macrotask so that probe
      // cleanup does not dispose the engine that the immediately-following
      // setup is about to reuse. A real unmount has no setup to cancel it.
      browserEngineMountedRef.current = false
      window.setTimeout(() => {
        if (browserEngineMountedRef.current || engine !== browserEngineRef.current) return
        releaseBrowserEngine(engine)
        browserEngineRef.current = null
      }, 0)
    }
  }, [engine, injectedEngine])

  // 水合后才渲染主内容：rail 与 composer 立即就位，会话线随后淡入。
  const mounted = useHydrated()
  const narrowWeb = useIsMobile()
  const compactDesktopRail = useCompactDesktopRail()
  // The server cannot read the sidebar cookie. Start from the server-provided
  // default so hydration has an identical tree, then reconcile the persisted
  // preference in a layout effect before the first painted frame. Reading the
  // cookie inside the state initializer made a returning user render a
  // different rail tree on the client, triggering a hydration rebuild and the
  // visible dev "Issues" pill.
  const [railCollapsed, setRailCollapsed] = useState(desktopRailCollapsed)
  const railPreferenceReadRef = useRef(false)
  useLayoutEffect(() => {
    // The route adapter can change its default while this AppFrame stays
    // mounted. Cookie reconciliation is a first-mount concern only; reading
    // it again during mounted-surface navigation would submit a second rail
    // state in the same transition and bring back the one-frame flash.
    if (railPreferenceReadRef.current) return
    railPreferenceReadRef.current = true
    let active = true
    // Queue after the layout effect so the server/client tree stays identical
    // while still reconciling before the next user interaction. The async
    // callback also avoids a synchronous cascading render in React's effect
    // lint rule.
    queueMicrotask(() => {
      if (!active) return
      const persistedCollapsed = readRailCollapsedCookie()
      if (persistedCollapsed !== null) setRailCollapsed(persistedCollapsed)
    })
    return () => {
      active = false
    }
  }, [])
  const [compactRailOpen, setCompactRailOpen] = useState(false)
  const resolvedRailCollapsed = compactDesktopRail ? !compactRailOpen : railCollapsed
  const railHidden = compactDesktopRail && resolvedRailCollapsed

  // A compact expansion belongs only to the current narrow-window session.
  // Clear it after crossing back to the wide layout so a later shrink always
  // starts from the reference's automatic 52px command rail instead of
  // reviving an expanded rail from an earlier window size.
  useEffect(() => {
    if (compactDesktopRail) return
    let active = true
    queueMicrotask(() => {
      if (active) setCompactRailOpen(false)
    })
    return () => {
      active = false
    }
  }, [compactDesktopRail])
  const railBeforeCanvasRef = useRef<boolean | null>(null)
  const [commandOpen, setCommandOpen] = useState(false)
  // The command palette is controlled by the shell so every entry point shares
  // one focus-return contract.
  const commandTriggerRef = useRef<HTMLButtonElement | null>(null)
  // Keyboard shortcuts can open the palette without a mounted trigger (the
  // desktop header is intentionally hidden). Remember the actual invoker so
  // Escape closes back to the control the user came from instead of <body>.
  const commandReturnFocusRef = useRef<HTMLElement | null>(null)
  const commandSettingsTimerRef = useRef<number | null>(null)
  const commandNewChatTimerRef = useRef<number | null>(null)
  // Settings is also a controlled Dialog. Keep the invoking control alive for
  // rail and command-menu handoffs before the surface unmounts.
  const settingsReturnFocusRef = useRef<HTMLElement | null>(null)
  const mcpCreateReturnFocusRef = useRef<HTMLElement | null>(null)
  const [mcpCreateMode, setMcpCreateMode] = useState<McpCreateMode | null>(null)
  const customApiReturnFocusRef = useRef<HTMLElement | null>(null)
  const [customApiOpen, setCustomApiOpen] = useState(false)
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const composerResourcesTriggerRef = useRef<HTMLButtonElement | null>(null)
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const canvasWasOpenRef = useRef(false)
  // Keep the shell ref available to focus handoffs as well as resize
  // transactions; both are owned by this AppFrame instance.
  const { width: railWidth, isResizing, shellRef, onResizeStart, onResizeKeyDown } = useRailResize()

  // 域 controller：固定技能（含注入引擎的副作用）/ composer 选择器。
  const pinnedSkills = usePinnedSkills(engine)
  const selectors = useComposerSelectors(engine, { preview })

  // 设置中心(WEB-FACE 面三):浮在工作区之上的模态,null=关。开关态用 URL `?settings=<tab>` 同步
  // (深链/刷新/可分享),首次打开新增 history entry，切 tab 仅 replace 当前 entry；不引 useSearchParams
  // (免 Suspense 边界,也不动测试的 next/navigation mock)。rail 入口/错误恢复卡改为调 openSettings。
  // Client URL state starts from the server-safe empty value. Read the deep
  // link in a layout microtask so the first hydrated tree remains identical
  // to SSR while settings/capsules still appear before the next interaction.
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null)
  const [deploymentIntent, setDeploymentIntentState] = useState<CreationIntent | null>(null)
  useLayoutEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setSettingsTab(settingsTabFromLocation())
      setDeploymentIntentState(readInitialCreationIntent())
    })
    return () => {
      active = false
    }
  }, [])
  const setDeploymentIntent = useCallback((intent: CreationIntent | null) => {
    setDeploymentIntentState(intent)
    writePendingCreationIntent(intent)
  }, [])
  useEffect(() => {
    // A direct-chat creation mode belongs to the direct welcome route. Clear
    // its persisted projection when the App Router enters a project so a
    // later return to /app cannot resurrect a stale capsule from another
    // workflow.
    if (!projectWorkspace || deploymentIntent === null) return
    let active = true
    queueMicrotask(() => {
      if (active) setDeploymentIntent(null)
    })
    return () => { active = false }
  }, [deploymentIntent, projectWorkspace, setDeploymentIntent])
  const settingsWasOpenRef = useRef(false)
  const settingsHistoryEntryRef = useRef(false)
  const initialConversationRef = useRef<string | null>(conversationIdFromLocation())
  const conversationUrlRef = useRef<string | null>(conversationIdFromLocation())
  const conversationUrlHydratedRef = useRef(false)
  const [conversationRouteId, setConversationRouteId] = useState<string | null>(null)
  useLayoutEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) setConversationRouteId(conversationIdFromLocation())
    })
    return () => {
      active = false
    }
  }, [])
  const syncSettingsUrl = useCallback((tab: SettingsTab | null, mode: "push" | "replace"): void => {
    if (typeof window === "undefined") {
      return
    }
    const url = new URL(window.location.href)
    if (tab === null) {
      url.searchParams.delete("settings")
      if (/^#\/?settings\//.test(url.hash) || url.hash.includes("/settings/")) {
        url.hash = ""
      }
    } else {
      // Match Manus' shareable settings route. Keep the legacy query form
      // accepted on input, but emit one canonical URL so tab changes do not
      // alternate between two address-bar formats.
      url.searchParams.delete("settings")
      const routeTab = tab === "appearance" ? "general" : tab === "developer" ? "developers" : tab
      url.hash = `#/account/settings/${routeTab}`
    }
    const write = mode === "push" ? window.history.pushState : window.history.replaceState
    write.call(window.history, window.history.state, "", url.pathname + url.search + url.hash)
  }, [])

  const syncConversationUrl = useCallback((id: string | null, mode: "push" | "replace"): void => {
    if (typeof window === "undefined") {
      return
    }
    const url = new URL(window.location.href)
    const hashConversation = /^#\/?conversation(?:=|\/)/.test(url.hash)
    if (id === null) {
      url.searchParams.delete("conversation")
    } else {
      url.searchParams.set("conversation", id)
    }
    // Emit the query form as the canonical conversation URL after accepting
    // a hash deep-link; otherwise back/forward would keep two identities.
    if (hashConversation) {
      url.hash = ""
    }
    const next = url.pathname + (url.search ? url.search : "") + url.hash
    const current = window.location.pathname + window.location.search + window.location.hash
    conversationUrlRef.current = id
    if (next === current) {
      return
    }
    const write = mode === "push" ? window.history.pushState : window.history.replaceState
    write.call(window.history, window.history.state, "", next)
  }, [])

  // A settings URL is a real client-side view state. Back/forward updates the
  // mounted Dialog without navigating away from the workspace shell.
  useEffect(() => {
    const onPopState = () => {
      settingsHistoryEntryRef.current = false
      setSettingsTab(settingsTabFromLocation())
      const requestedConversation = conversationIdFromLocation()
      const previousConversation = conversationUrlRef.current
      conversationUrlRef.current = requestedConversation
      setConversationRouteId(requestedConversation)
      if (!projectWorkspace && requestedConversation !== previousConversation) {
        // Browser history is another conversation switch path. Settings-only
        // history entries keep the same conversation and must not consume a
        // pending direct-chat creation action.
        setDeploymentIntent(null)
      }
      const currentSnapshot = engine?.getSnapshot()
      const currentId = currentSnapshot?.store?.activeId ?? null
      if (requestedConversation !== null) {
        if (requestedConversation !== currentId) {
          engine?.openConversation(requestedConversation)
        }
      } else if (previousConversation !== null && currentId !== null) {
        // Going back from a conversation returns to a fresh workspace. Do not
        // clear a blank draft session that is already the current view, as can
        // happen when a Settings URL is closed without a conversation state.
        engine?.newConversation()
      }
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [engine, projectWorkspace, setDeploymentIntent])

  // AppFrame remains mounted across App Router transitions. Re-read the URL
  // when entering/leaving a project so a stale conversation query cannot make
  // the next project overview look like an active task.
  useEffect(() => {
    const requestedConversation = conversationIdFromLocation()
    conversationUrlRef.current = requestedConversation
    // Route leaves are intentionally empty so AppFrame stays mounted. Apply a
    // newly entered conversation query to the newly selected scope here; the
    // initial deep-link effect only runs once per shell mount.
    if (requestedConversation !== null && requestedConversation !== (engine?.getSnapshot().store?.activeId ?? null)) {
      engine?.openConversation(requestedConversation)
    }
    const frame = window.requestAnimationFrame(() => setConversationRouteId(requestedConversation))
    return () => window.cancelAnimationFrame(frame)
  }, [engine, projectRef, projectWorkspace])

  // Deep links are applied after hydration so the URL wins over the locally
  // remembered active session without changing the SSR/first paint contract.
  useEffect(() => {
    if (!mounted || conversationUrlHydratedRef.current) {
      return
    }
    conversationUrlHydratedRef.current = true
    const requestedConversation = initialConversationRef.current
    if (requestedConversation !== null && requestedConversation !== activeId) {
      engine?.openConversation(requestedConversation)
    }
  }, [activeId, engine, mounted])

  // A restored local session and a newly submitted first message both acquire
  // a stable URL without adding an extra history entry on every stream event.
  useEffect(() => {
    if (!mounted || activeId === null || thread.messages.length === 0) {
      return
    }
    if (conversationIdFromLocation() === null) {
      syncConversationUrl(activeId, "replace")
    }
  }, [activeId, mounted, syncConversationUrl, thread.messages.length])

  // The controlled Settings Dialog can unmount before Radix emits its portal
  // close-focus callback. Keep a shell-level handoff as the authoritative
  // fallback.
  useEffect(() => {
    const wasOpen = settingsWasOpenRef.current
    settingsWasOpenRef.current = settingsTab !== null
    if (!wasOpen || settingsTab !== null) return

    const frame = window.requestAnimationFrame(() => {
      const rememberedTarget = settingsReturnFocusRef.current
      const target = isFocusTargetAvailable(rememberedTarget) ? rememberedTarget : composerRef.current
      target?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [settingsTab])

  // A command palette can close in the same commit that schedules Settings.
  // Keep the selected Settings tab as the authoritative focus target so the
  // closing palette or a queued Composer handoff cannot leave focus behind it.
  useEffect(() => {
    if (!mounted || settingsTab === null) return
    const focusTab = () => {
      const target = document.querySelector<HTMLElement>(`[data-testid="settings-tab-${settingsTab}"]`)
      target?.focus()
    }
    focusTab()
    const frame = window.requestAnimationFrame(() => {
      focusTab()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [mounted, settingsTab])

  const openSettings = useCallback(
    (tab: SettingsTab, explicitReturnTarget?: HTMLElement | null): void => {
      // A queued command-menu → Composer handoff must not steal focus from a
      // Settings surface opened immediately afterwards.
      if (commandNewChatTimerRef.current !== null) {
        window.clearTimeout(commandNewChatTimerRef.current)
        commandNewChatTimerRef.current = null
      }
      if (isFocusTargetAvailable(explicitReturnTarget ?? null)) {
        settingsReturnFocusRef.current = explicitReturnTarget ?? null
      } else if (commandOpen) {
        settingsReturnFocusRef.current = commandReturnFocusRef.current ?? commandTriggerRef.current
      } else {
        const active = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
          ? document.activeElement
          : null
        // DropdownMenu content is portaled outside the shell and may still be
        // active when the delayed Settings handoff fires. Do not remember a
        // soon-to-be-removed menu item; return to this shell's account trigger.
        const scopedAccountTrigger = accountTriggerRef.current
        settingsReturnFocusRef.current = active
          && shellRef.current?.contains(active)
          && isFocusTargetAvailable(active)
          ? active
          : isFocusTargetAvailable(scopedAccountTrigger)
            ? scopedAccountTrigger
            : null
      }
      const open = () => {
        commandSettingsTimerRef.current = null
        setSettingsTab(tab)
        const hasSettingsUrl = settingsTabFromLocation() !== null
        if (hasSettingsUrl) {
          syncSettingsUrl(tab, "replace")
        } else {
          settingsHistoryEntryRef.current = true
          syncSettingsUrl(tab, "push")
        }
      }
      if (commandOpen) {
        if (commandSettingsTimerRef.current !== null) {
          window.clearTimeout(commandSettingsTimerRef.current)
        }
        commandSettingsTimerRef.current = window.setTimeout(
          open,
          overlayHandoffDelay(COMMAND_SETTINGS_HANDOFF_MS),
        )
        return
      }
      open()
    },
    [accountTriggerRef, commandOpen, shellRef, syncSettingsUrl],
  )
  const closeSettings = useCallback((): void => {
    if (commandSettingsTimerRef.current !== null) {
      window.clearTimeout(commandSettingsTimerRef.current)
      commandSettingsTimerRef.current = null
    }
    // Settings is controlled by AppFrame and therefore unmounts in the same
    // commit as `onClose`. Radix's close-auto-focus cannot reliably restore a
    // trigger that disappears before its portal finishes closing. Capture the
    // stable invoking control (or Composer for a deep link) and restore it
    // after the unmount commit as the final focus handoff.
    const rememberedTarget = settingsReturnFocusRef.current
    setSettingsTab(null)
    if (settingsHistoryEntryRef.current && settingsTabFromLocation() !== null) {
      settingsHistoryEntryRef.current = false
      window.history.back()
    } else {
      syncSettingsUrl(null, "replace")
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        // Re-resolve Composer inside the deferred callback. A viewport change
        // At close time the Composer is the stable return surface.
        const target = isFocusTargetAvailable(rememberedTarget) ? rememberedTarget : composerRef.current
        target?.focus()
      })
    })
  }, [composerRef, syncSettingsUrl])

  useEffect(() => () => {
    if (commandSettingsTimerRef.current !== null) {
      window.clearTimeout(commandSettingsTimerRef.current)
    }
    if (commandNewChatTimerRef.current !== null) {
      window.clearTimeout(commandNewChatTimerRef.current)
    }
  }, [])

  // canvas 第三栏拖拽改宽：与 rail 共用 shell 容器几何。
  const { width: canvasWidth, onLayoutChange: onCanvasLayoutChange } = useCanvasResize(workspaceRef)
  const canvasResizeCleanupRef = useRef<(() => void) | null>(null)
  const onCanvasResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const shell = shellRef.current
    if (!shell || shell.dataset.railResizing === "true") {
      return
    }

    // Resizable owns the pointer protocol. The shell only publishes a
    // transaction marker so the rail handle cannot start a competing drag in
    // the same frame, which was the remaining source of split-speed seams.
    shell.dataset.canvasResizing = "true"
    shell.dataset.resizing = "true"
    const handle = event.currentTarget
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    // Keep the page interaction contract identical to the rail drag. The
    // panel primitive owns the width math, while the shell owns the global
    // drag lock and guarantees that a cancelled gesture cannot leave the
    // workbench in a permanent `col-resize` state.
    handle.setPointerCapture?.(event.pointerId)
    const end = () => {
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
      window.removeEventListener("blur", end)
      handle.removeEventListener("lostpointercapture", end)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      if (handle.hasPointerCapture?.(event.pointerId)) {
        handle.releasePointerCapture?.(event.pointerId)
      }
      if (document.activeElement === handle) {
        handle.blur()
      }
      delete shell.dataset.canvasResizing
      if (shell.dataset.railResizing !== "true") {
        delete shell.dataset.resizing
      }
      if (canvasResizeCleanupRef.current === end) {
        canvasResizeCleanupRef.current = null
      }
    }
    canvasResizeCleanupRef.current?.()
    canvasResizeCleanupRef.current = end
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
    window.addEventListener("blur", end)
    handle.addEventListener("lostpointercapture", end)
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }, [shellRef])

  useEffect(() => () => {
    canvasResizeCleanupRef.current?.()
  }, [])

  const isStreaming = machine.phase !== "idle" && machine.phase !== "error"
  const isReconnecting = machine.phase === "reattaching"
  const hasMessages = thread.messages.length > 0
  // A mounted shell can cross from direct chat into a project overview without
  // replacing the engine instance. The URL is authoritative for that route:
  // never paint the direct thread while the project has no conversation route,
  // and never paint a stale thread while a deep-link is being opened.
  const routeOwnsConversation = !projectWorkspace || (conversationRouteId !== null && conversationRouteId === activeId)
  const showConversation = hasMessages && !standaloneSurface && routeOwnsConversation
  // 失败双源：client/机器错误态（machine.error）与 agent 裁决的 run.failed 终态，都显式呈现。
  const hasFailed = !isStreaming && (machine.phase === "error" || thread.runStatus === "failed")
  // 402：run 被 credit_insufficient 拒——错误码由 client 从错误体取出，落在 machine.error。据此给计费
  // 专用说明 + 价格/联系入口（不复用通用失败文案）。
  const creditRejected = hasFailed && isCreditInsufficient(machine.error)

  const mode = store ? activeMode(store) : pendingMode
  // 已开聊即锁定：线程有消息（本地追加或 snapshot 水合）后模式不可再切换。
  const modeLocked = thread.messages.length > 0

  const focusComposer = useCallback(() => {
    const node = composerRef.current
    if (node) {
      node.style.height = "auto"
      node.style.height = `${node.scrollHeight}px`
      node.focus({ preventScroll: true })
    }
  }, [])

  // Desktop welcome -> thread handoff remounts the site-owned welcome tree and
  // the shared Composer at a new stable slot. Re-focus after that commit so
  // the user's first submit never leaves focus on the unmounted textarea.
  const previousHasMessagesRef = useRef(hasMessages)
  useEffect(() => {
    const wasEmpty = !previousHasMessagesRef.current
    previousHasMessagesRef.current = hasMessages
    if (!wasEmpty || !hasMessages) {
      return
    }
    const frame = window.requestAnimationFrame(() => focusComposer())
    return () => window.cancelAnimationFrame(frame)
  }, [focusComposer, hasMessages])

  // Retrying removes the focused error card and mounts a new live turn. Keep
  // the user's next action target stable instead of letting focus fall to the
  // document body when the old button disappears.
  const retryAndFocusComposer = useCallback(() => {
    engine?.retry()
    window.requestAnimationFrame(() => focusComposer())
  }, [engine, focusComposer])

  // 未发送草稿（按会话持久化）与会话清单/待批/canvas 各自的 controller。
  const { draft, updateDraft, clearDraft } = useDraft(activeId, mounted)
  const conversationsCtl = useConversationList({ engine, preview, activeId, thread, isStreaming, focusComposer, scope: sessionScope })
  const awaitingIds = useAwaitingNotify(activeId, machine.phase, t, brandName)
  const canvas = useCanvasWorkspace(activeId, thread, mounted)

  // Narrow desktop windows still use the Web workbench, but an expanded rail
  // plus the main and Canvas minimums cannot fit at the same time. Manus-like
  // workbenches prioritize the active document: collapse only the rail while
  // Canvas is open, then restore the user's previous rail preference on close.
  // Keep the rail and Canvas constraints in one Web layout transaction.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return
    const reconcileRailForCanvas = () => {
      const shellWidth = shellRef.current?.getBoundingClientRect().width ?? window.innerWidth
      const availableMainAndCanvas = shellWidth - railWidth
      const requiredMainAndCanvas = WORKSPACE_MAIN_MIN + CANVAS_MIN + 1

      if (canvas.canvasOpen && !resolvedRailCollapsed && availableMainAndCanvas < requiredMainAndCanvas) {
        railBeforeCanvasRef.current = false
        setRailCollapsed(true)
        setCompactRailOpen(false)
        return
      }

      if (!canvas.canvasOpen && railBeforeCanvasRef.current === false) {
        railBeforeCanvasRef.current = null
        setRailCollapsed(false)
      }
    }

    reconcileRailForCanvas()
    window.addEventListener("resize", reconcileRailForCanvas)
    const observer = shellRef.current && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(reconcileRailForCanvas)
      : null
    if (observer && shellRef.current) observer.observe(shellRef.current)

    return () => {
      window.removeEventListener("resize", reconcileRailForCanvas)
      observer?.disconnect()
    }
  }, [canvas.canvasOpen, railWidth, resolvedRailCollapsed, shellRef])

  // Canvas is controlled by the shell rather than a trigger-owned Dialog.
  // Restore focus at the shell boundary after the panel unmounts; this also
  // covers virtualized/content-visibility message items whose opener was not
  // the browser's active element when the Canvas mounted.
  useEffect(() => {
    const wasOpen = canvasWasOpenRef.current
    canvasWasOpenRef.current = canvas.canvasOpen
    if (!wasOpen || canvas.canvasOpen) return
    const frame = window.requestAnimationFrame(() => {
      // ContextPanel captures the actual opener (not merely the last matching
      // button) and restores it when its controlled surface closes.  This
      // shell fallback is only for virtualized openers that disappeared from
      // the DOM.  Do not let a broad querySelector steal focus from a
      // successful panel-level restoration when several Canvas actions exist.
      const active = document.activeElement
      if (
        active instanceof HTMLElement
        && active !== document.body
        && isFocusTargetAvailable(active)
      ) {
        return
      }
      // The shell owns the Canvas instance. Keep the fallback inside this
      // workspace so an embedded site or a shared-thread preview cannot steal
      // focus from another mounted AppFrame.
      shellRef.current
        ?.querySelector<HTMLElement>('[data-canvas-opener="true"]:not([disabled])')
        ?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [canvas.canvasOpen, shellRef])


  const submitDraft = useCallback(() => {
    const content = draft.trim()
    if (!engine || !content || content.length > MAX_INPUT_LENGTH) {
      return
    }
    // 流式中提交=运行中插话（engine 识别活跃相位走 steer，不打断本轮）。
    engine.submit(content)
    clearDraft()
    // Creation intent belongs to the empty composer only. Clear its persisted
    // projection as soon as the user commits the first message so a later
    // blank conversation cannot inherit a stale Website/App capsule.
    setDeploymentIntent(null)
    focusComposer()
  }, [clearDraft, draft, engine, focusComposer, setDeploymentIntent])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submitDraft()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送 / Shift+Enter 换行；IME 合成期（拼音选词）的 Enter 只确认候选词，不发送。
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submitDraft()
    }
  }

  const handlePrompt = useCallback((prompt: string, intent?: CreationIntent) => {
    setDeploymentIntent(intent ?? null)
    updateDraft(prompt)
    // Radix restores focus to the DropdownMenu trigger after its close
    // commit. One frame is too early in a real browser: the textarea receives
    // focus and is then immediately replaced by the trigger. Hand off after
    // two frames so every prompt starter leaves the caret in the Composer.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => focusComposer())
    })
  }, [focusComposer, setDeploymentIntent, updateDraft])

  const handleCreationIntentSelect = useCallback((intent: CreationIntent) => {
    // A capability capsule is a mode switch, not a prompt starter. Manus
    // keeps the editor empty after this click so the selected workflow can
    // provide its own placeholder, model and examples below the Composer.
    setDeploymentIntent(intent)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => focusComposer())
    })
  }, [focusComposer, setDeploymentIntent])

  const openMcpCreate = useCallback((mode: McpCreateMode, returnTarget?: HTMLElement | null) => {
    mcpCreateReturnFocusRef.current = returnTarget ?? null
    setMcpCreateMode(mode)
  }, [])

  const openCustomApiCreate = useCallback((returnTarget?: HTMLElement | null) => {
    customApiReturnFocusRef.current = returnTarget ?? null
    setCustomApiOpen(true)
  }, [])

  const EmptyState = emptyState ?? DefaultEmptyState
  const projectedWorkspaceCapabilities = projectWorkspaceCapabilities(featureFlags, workspaceCapabilities)
  const [projectInstructions, setProjectInstructions] = useState("")
  const [projectInstructionHistory, setProjectInstructionHistory] = useState<NonNullable<EmptyStateProps["projectInstructionHistory"]>>([])

  useEffect(() => {
    let active = true
    const load = async () => {
      await Promise.resolve()
      if (!projectRef) {
        if (active) setProjectInstructions("")
        if (active) setProjectInstructionHistory([])
        return
      }
      if (preview) {
        const value = window.localStorage.getItem(`kokoro.preview.project.${projectRef}.instructions`) ?? ""
        const historyValue = window.localStorage.getItem(`kokoro.preview.project.${projectRef}.instruction-history`)
        let history: NonNullable<EmptyStateProps["projectInstructionHistory"]> = []
        if (historyValue) {
          try {
            const parsed = JSON.parse(historyValue)
            if (Array.isArray(parsed)) history = parsed
          } catch {
            history = []
          }
        }
        if (history.length === 0 && value) {
          history = [{ id: "preview-current", instruction: value, updatedAt: Date.now(), actorName: t("firstSite.you"), current: true }]
        }
        if (active) setProjectInstructions(value)
        if (active) setProjectInstructionHistory(history)
        return
      }
      try {
        const [response, historyResponse] = await Promise.all([
          fetch(`/api/hub/projects/${encodeURIComponent(projectRef)}`, { cache: "no-store" }),
          fetch(`/api/hub/projects/${encodeURIComponent(projectRef)}/instruction-revisions`, { cache: "no-store" }),
        ])
        if (!response.ok) return
        const payload = await response.json() as { instruction?: unknown; project?: { instruction?: unknown } }
        const value = payload.instruction ?? payload.project?.instruction
        if (active && typeof value === "string") setProjectInstructions(value)
        if (historyResponse.ok) {
          const historyPayload = await historyResponse.json() as { items?: unknown }
          if (active && Array.isArray(historyPayload.items)) {
            setProjectInstructionHistory(historyPayload.items as NonNullable<EmptyStateProps["projectInstructionHistory"]>)
          }
        }
      } catch {
        // Mutation errors remain visible in the editor; a failed read keeps
        // the empty projection instead of inventing project instructions.
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [preview, projectRef, t])

  const saveProjectInstructions = useCallback(async (instructions: string) => {
    if (!projectRef) return
    if (preview) {
      window.localStorage.setItem(`kokoro.preview.project.${projectRef}.instructions`, instructions)
      const revision = { id: crypto.randomUUID(), instruction: instructions, updatedAt: Date.now(), actorName: t("firstSite.you"), current: true }
      setProjectInstructionHistory((current) => {
        const next = [revision, ...current.map((item) => ({ ...item, current: false }))]
        window.localStorage.setItem(`kokoro.preview.project.${projectRef}.instruction-history`, JSON.stringify(next))
        return next
      })
      setProjectInstructions(instructions)
      return
    }
    const response = await fetch(`/api/hub/projects/${encodeURIComponent(projectRef)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: instructions }),
    })
    if (!response.ok) throw new Error(`project_instruction_update_failed:${response.status}`)
    const revision = { id: crypto.randomUUID(), instruction: instructions, updatedAt: Date.now(), actorName: t("firstSite.you"), current: true }
    setProjectInstructionHistory((current) => [revision, ...current.map((item) => ({ ...item, current: false }))])
    setProjectInstructions(instructions)
  }, [preview, projectRef, t])
  const uploadProjectResources = useCallback(async (files: FileList) => {
    if (!projectRef || files.length === 0) return
    const body = new FormData()
    for (const file of Array.from(files)) body.append("files", file)
    const response = await fetch(`/api/hub/projects/${encodeURIComponent(projectRef)}/resources`, { method: "POST", body })
    if (!response.ok) throw new Error(`project_resource_upload_failed:${response.status}`)
  }, [projectRef])
  const setProjectSkillEnabled = useCallback(async (skill: string, enabled: boolean) => {
    if (!projectRef) return
    const response = await fetch(`/api/hub/projects/${encodeURIComponent(projectRef)}/skills/${encodeURIComponent(skill)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    })
    if (!response.ok) throw new Error(`project_skill_update_failed:${response.status}`)
  }, [projectRef])
  const createProjectScheduledTask = useCallback(async (task: {
    title: string
    prompt: string
    frequency: string
    time: string
    expiresAt?: string
    autoApprove: boolean
  }) => {
    if (!projectRef) return
    const response = await fetch(`/api/hub/projects/${encodeURIComponent(projectRef)}/scheduled-tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(task),
    })
    if (!response.ok) throw new Error(`project_scheduled_task_create_failed:${response.status}`)
  }, [projectRef])

  // 新对话快捷键 ⇧⌘O（侧栏展示该提示，故全局接入键盘使其真实可用）。
  const startNewChat = conversationsCtl.startNewChat
  const startNewChatWithUrl = useCallback(() => {
    setDeploymentIntent(null)
    // Catalog pages share this mounted shell with the direct inbox. Starting
    // a task from Agent/Skills/etc. must leave the catalog surface; merely
    // clearing `conversation` keeps the catalog mounted and looks like a
    // dead button because its landing content has no Composer.
    if (standaloneSurface) {
      navigateMountedSurface(chatHref)
    }
    startNewChat()
    if (projectWorkspace) {
      // The project overview stays at `/app/project/{ref}`. A fresh task gets
      // its own opaque conversation route, which makes task creation and the
      // persistent project surface independently addressable.
      const nextProjectConversationId = engine?.getSnapshot().store?.activeId ?? null
      syncConversationUrl(nextProjectConversationId, "push")
      setConversationRouteId(nextProjectConversationId)
      return
    }
    syncConversationUrl(null, "push")
    setConversationRouteId(null)
  }, [chatHref, engine, projectWorkspace, setDeploymentIntent, standaloneSurface, startNewChat, syncConversationUrl])
  const selectConversationWithUrl = useCallback((id: string) => {
    // A creation mode is a pending action for the current direct-chat draft,
    // not a property of the conversation being opened. Clear both the shell
    // projection and its persisted fallback before activating another direct
    // session so the next empty composer starts neutral.
    if (!projectWorkspace && id !== activeId) {
      setDeploymentIntent(null)
    }
    if (standaloneSurface && typeof window !== "undefined") {
      // Library/other catalog pages share this shell, but the conversation
      // timeline only exists on the direct Chat route. Move the mounted
      // surface first and carry the selected id in the canonical query so an
      // "open source" action cannot appear to do nothing on the catalog.
      const next = new URL(chatHref, window.location.href)
      next.searchParams.set("conversation", id)
      navigateMountedSurface(`${next.pathname}${next.search}${next.hash}`)
    }
    syncConversationUrl(id, "push")
    setConversationRouteId(id)
    conversationsCtl.selectConversation(id)
  }, [activeId, chatHref, conversationsCtl, projectWorkspace, setDeploymentIntent, standaloneSurface, syncConversationUrl])
  // CommandDialog 的 workspace action 会抑制默认焦点回收；新对话仍需
  // 在关闭动画完成后把焦点交给 Composer，否则焦点会落到 body。
  const startNewChatFromCommand = useCallback(() => {
    if (commandNewChatTimerRef.current !== null) {
      window.clearTimeout(commandNewChatTimerRef.current)
    }
    startNewChatWithUrl()
    commandNewChatTimerRef.current = window.setTimeout(() => {
      commandNewChatTimerRef.current = null
      focusComposer()
    }, overlayHandoffDelay(COMMAND_SETTINGS_HANDOFF_MS))
  }, [focusComposer, startNewChatWithUrl])
  const startNewChatAndFocus = useCallback(() => {
    // Rail buttons and the keyboard shortcut do not have a closing Dialog to
    // hand off from; focus the fresh Composer in the same interaction instead
    // of leaving it on the document body or on a stale navigation action.
    startNewChatWithUrl()
    if (standaloneSurface || projectWorkspace) {
      // Catalog navigation and project-task creation both replace the empty
      // surface in the next React commit. Let the fresh Composer mount before
      // handing it focus; otherwise the click succeeds but focus stays on the
      // rail (or falls back to document.body).
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => focusComposer())
      })
    } else {
      focusComposer()
    }
  }, [focusComposer, projectWorkspace, standaloneSurface, startNewChatWithUrl])
  const startDeploymentFromSettings = useCallback((kind: "website" | "app") => {
    // Deployment shortcuts mirror the matching welcome actions: preserve the
    // current empty workspace and hand the prompt directly to its Composer.
    // Creating another session here would move the draft to a different
    // per-conversation key before React can render it.
    closeSettings()
    setDeploymentIntent(kind)
    window.requestAnimationFrame(() => {
      focusComposer()
    })
  }, [closeSettings, focusComposer, setDeploymentIntent])
  const startSkillCreationFromSettings = useCallback(() => {
    // Manus treats “create with AI” as a prompt starter, not an upload form:
    // close Settings, return to the direct Composer, and seed the skill
    // creator command in a fresh session.
    closeSettings()
    startNewChatWithUrl()
    const prompt = t("skills.createPrompt")
    const nextSessionId = engine?.getSnapshot().store?.activeId ?? null
    if (nextSessionId) stashConversationDraft(nextSessionId, prompt)
    else updateDraft(prompt)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => focusComposer())
    })
  }, [closeSettings, engine, focusComposer, startNewChatWithUrl, t, updateDraft])
  const startSkillUseFromSettings = useCallback((skill: SkillCard, prompt?: string) => {
    // Manus' skill detail CTA is a chat handoff, not a second detail dialog:
    // keep the skill pinned, start a fresh direct session, and seed one
    // inspectable example prompt so the user can edit it before submitting.
    closeSettings()
    startNewChatWithUrl()
    if (!pinnedSkills.includes(skill.name)) togglePinned(skill.name)
    const nextPrompt = prompt ?? t("skills.tryPrompt", { brand: brandName ?? "Kokoro", name: skill.name })
    const nextSessionId = engine?.getSnapshot().store?.activeId ?? null
    if (nextSessionId) stashConversationDraft(nextSessionId, nextPrompt)
    else updateDraft(nextPrompt)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => focusComposer())
    })
  }, [brandName, closeSettings, engine, focusComposer, pinnedSkills, startNewChatWithUrl, t, updateDraft])

  const dismissCreationIntent = useCallback(() => {
    setDeploymentIntent(null)
    // The pill is removed synchronously. Hand the caret back after the commit
    // so the next keystroke continues in the same composer without a second
    // click, matching the reference's inline control handoff.
    window.requestAnimationFrame(() => focusComposer())
  }, [focusComposer, setDeploymentIntent])
  const openCommand = useCallback(() => {
    // Re-opening the palette during the delayed new-chat handoff means the
    // palette is now the active surface. Cancel that pending Composer focus
    // before it can steal focus from the next command or Settings dialog.
    if (commandNewChatTimerRef.current !== null) {
      window.clearTimeout(commandNewChatTimerRef.current)
      commandNewChatTimerRef.current = null
    }
    const active = document.activeElement
    commandReturnFocusRef.current = active instanceof HTMLElement && active !== document.body
      ? active
      : commandTriggerRef.current
    setCommandOpen(true)
  }, [])
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

  // 事件到达（thread 引用更新）即滚动信号：不再做全量字符扫描。
  const canSend = draft.trim().length > 0
  const conversations = conversationsCtl.conversations
  // Keep the mobile presentation untouched: the project overview remains the
  // existing mobile surface until that layout is explicitly revisited.
  const projectTaskView = projectWorkspace && conversationRouteId !== null && !narrowWeb
  // Creation intent belongs to the direct-chat draft. A project workspace has
  // its own website/resources capabilities and must not inherit a pending
  // homepage mode merely because both surfaces share the Composer primitive.
  const projectedCreationIntent = projectWorkspace ? null : deploymentIntent
  const creationPlaceholder = projectWorkspace && !hasMessages
    ? t("firstSite.startTask")
    : !projectWorkspace && !hasMessages
      ? deploymentIntent === "website"
        ? t("settings.deploymentWebsitePlaceholder")
        : deploymentIntent === "app"
          ? t("settings.deploymentAppPlaceholder")
          : deploymentIntent === "presentation"
            ? t("firstSite.presentationPlaceholder")
            : deploymentIntent === "design"
              ? t("firstSite.designPlaceholder")
              : deploymentIntent === "game"
                ? t("firstSite.gamePlaceholder")
                : t("firstSite.homePlaceholder")
      : undefined
  const preferredCreationModel = !hasMessages
    ? deploymentIntent === "presentation" || deploymentIntent === "game"
      ? "kokoro:standard-new"
      : deploymentIntent === "design"
        ? "openai:gpt-image-2"
        : undefined
    : undefined

  const composer = (
    <div data-slot="composer" className="shrink-0">
      <Composer
      draft={draft}
      onDraftChange={updateDraft}
      onKeyDown={handleKeyDown}
      onSubmit={handleSubmit}
      isStreaming={isStreaming}
      isAwaitingApproval={machine.phase === "awaiting-hitl"}
      canSend={canSend}
      onStop={() => engine?.cancelRun()}
      composerRef={composerRef}
      emptyWorkspace={!hasMessages}
      placeholder={creationPlaceholder}
      mode={mode}
      onModeChange={(next) => engine?.setMode(next)}
      modeLocked={modeLocked}
      pinnedSkills={pinnedSkills}
      onUnpinSkill={removePinned}
      models={selectors.models}
      // Neutral and Website/App creation surfaces keep the reference's quiet
      // toolbar. Presentation/Design/Game expose their workflow model inline.
      hideModelSelector={!hasMessages && (!projectedCreationIntent || projectedCreationIntent === "website" || projectedCreationIntent === "app")}
      preferredModelSelector={preferredCreationModel}
      selectedModel={selectors.selectedModel}
      onModelChange={selectors.setSelectedModel}
      modelLocked={modeLocked}
      agents={selectors.agents}
      selectedAgent={selectors.selectedAgent}
      onAgentChange={selectors.setSelectedAgent}
      agentLocked={modeLocked}
      leadingActions={
        <>
          {projectedWorkspaceCapabilities.resources ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  ref={composerResourcesTriggerRef}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("firstSite.filesAndResources")}
                  title={t("firstSite.filesAndResources")}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className={styles.contextMenu} align="start" side="top" sideOffset={84}>
                <DropdownMenuItem onSelect={() => openSettings("library", composerResourcesTriggerRef.current)}>
                  <FilePlus2 data-icon="inline-start" />
                  {t("firstSite.filesAndResources")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openSettings("skills", composerResourcesTriggerRef.current)}>
                  <Sparkles data-icon="inline-start" />
                  {t("rail.navSkills")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {projectedWorkspaceCapabilities.connectors ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("firstSite.connectors")}
              title={t("firstSite.connectors")}
              onClick={() => openSettings("mcp")}
            >
              <Cable aria-hidden="true" />
            </Button>
          ) : null}
        </>
      }
      creationIntent={!hasMessages ? projectedCreationIntent ?? undefined : undefined}
      onCreationIntentDismiss={dismissCreationIntent}
      environmentLabel={t("settings.desktopApp", { brand: brandName ?? "Kokoro" })}
      projectWorkspace={projectWorkspace}
      environmentSelectorPlacement={projectWorkspace && hasMessages ? "floating" : "controls"}
      // A local authenticated session can still be backed by the fixture
      // transport while the speech/BFF integration is not deployed. Keep the
      // browser demo deterministic in development; production uses the live
      // SpeechRecognition path through the same Composer controller.
      voicePreview={preview || process.env.NODE_ENV !== "production"}
      />
    </div>
  )

  const mainSurface = (
    <section
      className={styles.main}
      data-desktop-web="true"
      data-standalone-surface={standaloneSurface ? "true" : undefined}
      data-rail-collapsed={resolvedRailCollapsed ? "true" : "false"}
      // Empty direct chat and project workspaces share one document geometry
      // with active conversations.
      data-web-view={showConversation ? "thread" : projectTaskView ? "project-task" : "welcome"}
    >
      {/* 会话头部（SHARE-1）：有活跃会话且已开聊时显分享入口——创建可撤销只读链接。 */}
      {mounted && !hideWorkspaceHeader ? (
        <WorkspaceHeader
          activeId={activeId}
          shareClient={browserListClient({ preview })}
          onOpenSettings={openSettings}
          brandName={brandName}
          emptyWorkspace={!showConversation}
          projectWorkspace={projectWorkspace}
          // The header owns the only menu trigger while the compact rail is
          // hidden. Once the rail is visible, its own shadcn trigger becomes
          // the owner so the canvas never shows two competing toggles.
          showNavigationTrigger={narrowWeb || (compactDesktopRail && railHidden)}
        />
      ) : null}
      <div
        className={styles.timelineStage}
        data-canvas-reopen={canvas.canReopenCanvas ? "true" : undefined}
      >
        {!mounted ? (
          <div className={styles.stage} aria-hidden />
        ) : showConversation ? (
          <div data-slot="conversation-timeline" className="min-h-0 flex-1">
            <ConversationThread
            brandName={brandName}
            sessionId={activeId}
            thread={thread}
            isStreaming={isStreaming}
            isReconnecting={isReconnecting}
            hasFailed={hasFailed}
            creditRejected={creditRejected}
            onOpenBilling={() => openSettings("credits")}
            onOpenPricing={() => openSettings("subscription")}
            onRetry={retryAndFocusComposer}
            mode={mode}
            stagingByRun={staging}
            hitlRunId={machine.phase === "awaiting-hitl" ? machine.runId : null}
            controlError={machine.phase === "awaiting-hitl" ? machine.error : null}
            onToolDecision={(runId, toolId, decision) =>
              engine?.stageToolDecision(runId, toolId, decision)
            }
            onCancelRun={() => engine?.cancelRun()}
            onOpenFile={canvas.openFile}
            onOpenDelivery={canvas.openDelivery}
            onOpenTool={canvas.openTool}
            />
          </div>
        ) : (
          <EmptyState
            // A new conversation is a fresh workbench, not a continuation of
            // the previous welcome surface. Keying by its session restores the
            // canvas scroll and site-local empty-state controls together.
            key={activeId ?? "new-workspace"}
            brandName={brandName}
            preview={preview}
            scheduledTaskClient={scheduledTaskClient}
            draft={draft}
            creationIntent={projectedCreationIntent ?? undefined}
            projectWorkspace={projectWorkspace}
            onPrompt={handlePrompt}
            onCreationIntentSelect={handleCreationIntentSelect}
            // The engine has already scoped this list by `project_ref` or the
            // direct inbox. A project workspace may therefore render its own
            // conversation list without ever reading a direct-chat session here.
            projectConversations={conversations.map((conversation) => ({
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
            }))}
            activeProjectConversationId={activeId}
            onSelectProjectConversation={selectConversationWithUrl}
            onOpenSession={selectConversationWithUrl}
            projectConversationsLoading={conversationsCtl.loading}
            projectConversationsError={conversationsCtl.error}
            onRetryProjectConversations={conversationsCtl.refresh}
            projectInstructions={projectInstructions}
            projectInstructionHistory={projectInstructionHistory}
            onSaveProjectInstructions={saveProjectInstructions}
            onUploadProjectResources={uploadProjectResources}
            onSetProjectSkillEnabled={setProjectSkillEnabled}
            onCreateProjectScheduledTask={createProjectScheduledTask}
            projectTask={projectTaskView}
            onOpenSettings={openSettings}
            onCreateMcp={openMcpCreate}
            onCreateCustomApi={openCustomApiCreate}
            onCreateSkillWithAi={startSkillCreationFromSettings}
            onTrySkill={startSkillUseFromSettings}
            models={selectors.models}
            selectedModel={selectors.selectedModel}
            onModelChange={selectors.setSelectedModel}
            composer={emptyStateOwnsComposer ? composer : undefined}
            workspaceCapabilities={projectedWorkspaceCapabilities}
            shareClient={browserListClient({ preview })}
          />
        )}

        {/* 仅在时间线层内显示，避免按钮覆盖 TodoBar 或 Composer。 */}
        {canvas.canReopenCanvas ? (
          <Button variant="outline" type="button" className={styles.canvasReopen} onClick={canvas.onReopen}>
            {t("canvas.reopen")}
          </Button>
        ) : null}
      </div>

      {/* 计划条钉在输入框正上方，可收缩；思考/工具/子智能体在 ConversationThread 内联呈现。 */}
      {mounted ? <TodoBar todos={thread.todos} /> : null}

      {/* Site-owned empty surfaces may move the same composer into their own
          welcome layout; active conversations always use the shell slot. */}
      {!standaloneSurface && (showConversation || !emptyStateOwnsComposer) ? composer : null}
    </section>
  )

  return (
    <WebSkinProvider value={webSkin}>
    <SidebarProvider
      ref={shellRef}
      className={styles.shell}
      // User Web keeps the desktop Sidebar primitive for fine-pointer windows;
      // the narrow desktop contract hides its track without switching to the
      // phone Sheet. Only a coarse-pointer phone uses the mobile surface.
      forceDesktop={!narrowWeb}
      data-desktop-web="true"
      data-web-skin={webSkin}
      data-compact-desktop={compactDesktopRail ? "true" : undefined}
      data-rail-collapsed={resolvedRailCollapsed ? "true" : "false"}
      data-rail-hidden={railHidden ? "true" : undefined}
      data-canvas-open={canvas.canvasOpen ? "true" : undefined}
      data-resizing={isResizing ? "true" : undefined}
      style={
        {
          "--rail-width": `${railWidth}px`,
          // The divider follows the same 200ms track as shadcn Sidebar when
          // The custom rail seam follows the same committed track as the
          // provider gap. It is intentionally separate from the user's
          // preferred width so collapsed mode has one explicit 52px edge.
          "--rail-seam-width": resolvedRailCollapsed ? `${RAIL_COLLAPSED_WIDTH}px` : `${railWidth}px`,
          "--canvas-width": `${canvasWidth}px`,
          "--sidebar-width": `${railWidth}px`,
          // Wide desktop uses a 52px icon track when explicitly collapsed.
          // Narrow desktop removes that track in CSS and keeps this token for
          // the wide-layout expand/collapse contract.
          "--sidebar-width-icon": `${RAIL_COLLAPSED_WIDTH}px`,
        } as CSSProperties
      }
      open={!resolvedRailCollapsed}
      onOpenChange={(open) => {
        if (compactDesktopRail) setCompactRailOpen(open)
        else setRailCollapsed(!open)
      }}
    >
      {compactDesktopRail && hideWorkspaceHeader && railHidden ? (
        <WorkspaceNavigationTrigger className={styles.compactNavigationTrigger} />
      ) : null}
      <WorkspaceRail
        withinProvider
        compactDesktopRail={compactDesktopRail}
        collapsed={resolvedRailCollapsed}
        onToggleCollapse={() => {
          if (compactDesktopRail) setCompactRailOpen((value) => !value)
          else setRailCollapsed((value) => !value)
        }}
        onNewChat={startNewChatAndFocus}
        brandName={brandName}
        brandMark={brandMark}
        brandLogoUrl={brandLogoUrl}
        navigation={navigation}
        featureFlags={featureFlags}
        chatHref={chatHref}
        projectHref={projectRef ? `/app/project/${encodeURIComponent(projectRef)}` : "/app/project/kokoro"}
        projectActive={projectWorkspace}
        activeNavigationKey={activeNavigationKey}
        preview={preview}
        conversations={conversations}
        activeId={activeId}
        awaitingIds={awaitingIds}
        onSelectConversation={(id) => {
          selectConversationWithUrl(id)
        }}
        onDeleteConversation={conversationsCtl.deleteConversation}
        onRenameConversation={conversationsCtl.renameConversation}
        onOpenSettings={openSettings}
        accountTriggerRef={accountTriggerRef}
        listLoading={conversationsCtl.loading}
        listLoadingMore={conversationsCtl.loadingMore}
        listError={conversationsCtl.error}
        onRetryList={conversationsCtl.refresh}
        hasMore={conversationsCtl.hasMore}
        onLoadMore={conversationsCtl.loadMore}
      />

      {/* 拖拽分隔条：调整 rail/main 宽度（两侧自由、各有最小宽度）。 */}
      {!narrowWeb && !railHidden ? (
        <div
            className={styles.resizer}
            data-seam="rail"
            data-collapsed={resolvedRailCollapsed ? "true" : "false"}
            role="separator"
            aria-orientation="vertical"
            aria-label={t("shell.resizeAria")}
            aria-valuemin={RAIL_MIN}
            aria-valuemax={RAIL_MAX}
            aria-valuenow={Math.round(railWidth)}
            aria-valuetext={`${Math.round(railWidth)}px`}
            tabIndex={resolvedRailCollapsed ? -1 : 0}
            aria-hidden={resolvedRailCollapsed || undefined}
            onPointerDown={onResizeStart}
            onKeyDown={onResizeKeyDown}
        />
      ) : null}

      <SidebarInset className={styles.inset}>
      <div
        ref={workspaceRef}
        className={styles.workspace}
        data-canvas-open={canvas.canvasOpen ? "true" : undefined}
      >
        <ResizablePanelGroup
            id="kokoro-workspace"
            orientation="horizontal"
            className={styles.workspaceGroup}
            onLayoutChange={onCanvasLayoutChange}
            resizeTargetMinimumSize={{ coarse: 28, fine: 20 }}
          >
            <ResizablePanel
              id="main"
              minSize={`${WORKSPACE_MAIN_MIN}px`}
              className={styles.mainPanel}
            >
              {mainSurface}
            </ResizablePanel>
            {canvas.resolvedCanvas !== null && activeId !== null ? (
              <>
                {!canvas.fullscreen ? (
                  <ResizableHandle
                    id="canvas-resize"
                    className={styles.canvasHandle}
                    aria-label={t("canvas.resizeAria")}
                    aria-valuemin={CANVAS_MIN}
                    aria-valuemax={CANVAS_MAX}
                    aria-valuenow={Math.round(canvasWidth)}
                    aria-valuetext={`${Math.round(canvasWidth)}px`}
                    onPointerDown={onCanvasResizeStart}
                    disableDoubleClick
                  />
                ) : null}
                <ResizablePanel
                  id="canvas"
                  defaultSize={`${canvasWidth}px`}
                  minSize={`${CANVAS_MIN}px`}
                  maxSize={`${CANVAS_MAX}px`}
                  groupResizeBehavior="preserve-pixel-size"
                  className={styles.canvasPanel}
                >
                  <ContextPanel
                    sessionId={activeId}
                    content={canvas.resolvedCanvas}
                    files={thread.files}
                    deliveries={thread.deliveries}
                    todos={thread.todos}
                    focusScopeRef={shellRef}
                    fullscreen={canvas.fullscreen}
                    onSelectFile={canvas.onSelectFile}
                    onSelectDelivery={canvas.onSelectDelivery}
                    onToggleFullscreen={canvas.onToggleFullscreen}
                    onClose={canvas.onClose}
                  />
                </ResizablePanel>
              </>
            ) : null}
        </ResizablePanelGroup>
      </div>
      </SidebarInset>

      {/* 设置中心:浮在工作区之上的模态卡片(rail 入口/错误恢复卡触发,语境原地保留)。
          门控 mounted:首帧不渲染(与 SSR 一致,水合安全)。key=settingsTab:shell 主动开到不同 tab
          时重挂载重置初值;内部切 tab 只改 URL 不改此 state,不触发重挂,选中态保持。 */}
      {mounted && settingsTab !== null ? (
        <SettingsModal
          key={settingsTab}
          engine={engine}
          brandName={brandName}
          initialTab={settingsTab}
          preview={preview}
          onClose={closeSettings}
          onTabChange={(tab) => syncSettingsUrl(tab, "replace")}
          onStartDeployment={startDeploymentFromSettings}
          onCreateSkillWithAi={startSkillCreationFromSettings}
          onTrySkill={startSkillUseFromSettings}
          returnFocusRef={settingsReturnFocusRef}
          focusScopeRef={shellRef}
        />
      ) : null}

      {mounted && mcpCreateMode !== null ? (
        <McpCreateDialog
          client={browserHubClient({ preview })}
          mode={mcpCreateMode}
          open
          onOpenChange={(open) => { if (!open) setMcpCreateMode(null) }}
          returnFocusRef={mcpCreateReturnFocusRef}
        />
      ) : null}

      {mounted ? (
        <CustomApiDialog
          client={browserHubClient({ preview })}
          open={customApiOpen}
          onOpenChange={setCustomApiOpen}
          returnFocusRef={customApiReturnFocusRef}
        />
      ) : null}

      <CommandMenu
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onNewChat={startNewChatFromCommand}
        onOpenSettings={openSettings}
        navigation={navigation}
        featureFlags={featureFlags}
        projectWorkspace={projectWorkspace}
        returnFocusRef={commandReturnFocusRef}
        focusScopeRef={shellRef}
      />

    </SidebarProvider>
    </WebSkinProvider>
  )
}
