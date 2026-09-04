import type { ComponentType, ReactNode } from "react"

import type { ModelCandidate } from "@/contract/http"
import type { SkillCard } from "@/hub/schemas"
import type { SessionEngine } from "@/engine/machine"
import type { SessionClient } from "@/engine/client"
import type { CreationIntent } from "@/ui/composer/creation-intent-pill"
import type { McpCreateMode } from "@/ui/mcp/mcp-panel"
import type { SettingsTab } from "@/ui/settings/settings-modal"
import type { RuntimeFeatureFlag, RuntimeNavigationItem } from "@/system/runtime-navigation"

import type { ScheduledTaskClient } from "@/features/scheduled-tasks"

import type { AppCommandMenuProps } from "./app-command-menu"

export type ProjectConversationStatus = "queued" | "running" | "waiting" | "completed" | "failed"

export type ProjectConversation = {
  id: string
  title: string
  status?: ProjectConversationStatus
  updatedAt?: number
}

export type ProjectInstructionRevision = {
  id: string
  instruction: string
  updatedAt: number
  actorName: string
  current?: boolean
}

export type ProjectScheduledTaskInput = {
  title: string
  prompt: string
  frequency: string
  time: string
  expiresAt?: string
  autoApprove: boolean
}

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
  /** Site-owned welcome project picker hands the draft to a mounted project route. */
  onOpenProject?: (projectRef: string, draft?: string) => void
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
  projectConversations?: readonly ProjectConversation[]
  activeProjectConversationId?: string | null
  onSelectProjectConversation?: (id: string) => void
  /** Open the artifact's source conversation without coupling a site surface to the engine. */
  onOpenSession?: (id: string) => void
  projectConversationsLoading?: boolean
  projectConversationsError?: boolean
  onRetryProjectConversations?: () => void
  /** Persisted project-level instructions loaded from the project projection. */
  projectInstructions?: string
  projectInstructionHistory?: readonly ProjectInstructionRevision[]
  onSaveProjectInstructions?: (instructions: string) => Promise<void>
  onUploadProjectResources?: (files: FileList) => Promise<void>
  onSetProjectSkillEnabled?: (skill: string, enabled: boolean) => Promise<void>
  onCreateProjectScheduledTask?: (task: ProjectScheduledTaskInput) => Promise<void>
  /** Site-owned welcome actions can hand off to shared workspace settings. */
  onOpenSettings?: (tab: SettingsTab, returnTarget?: HTMLElement | null) => void
  /** Project picker handoff used by the direct welcome surface. */
  onOpenProject?: (projectRef: string, draft?: string) => void
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
