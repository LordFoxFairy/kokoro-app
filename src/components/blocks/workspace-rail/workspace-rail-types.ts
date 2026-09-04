import type { ComponentType, RefObject, SVGProps } from "react"

import type { SettingsTab } from "@/ui/settings/settings-modal"
import type { ConversationSummary } from "@/ui/rail/rail-search"
import type { RuntimeFeatureFlag, RuntimeNavigationItem } from "@/system/runtime-navigation"

/** Public inputs owned by the mounted desktop shell and standalone embeds. */
export type WorkspaceRailProps = {
  // AppFrame owns the shadcn SidebarProvider. Standalone tests/embeds keep
  // the provider here so the rail remains a self-contained primitive.
  withinProvider?: boolean
  /** Narrow fine-pointer Web hides the rail track and uses the header menu. */
  compactDesktopRail?: boolean
  collapsed: boolean
  onToggleCollapse: () => void
  onNewChat: () => void
  // 服务端按 host 解析的站点品牌名（SITE-REAL）；缺省回退硬编码 Kokoro。
  brandName?: string
  /** Site-owned mark/logo; the rail reserves the reference lockup slot. */
  brandMark?: string
  brandLogoUrl?: string
  /** Undefined means the site-owned default menu; [] is an intentional empty live menu. */
  navigation?: readonly RuntimeNavigationItem[]
  featureFlags?: readonly RuntimeFeatureFlag[]
  /** Site-owned route for the active conversation surface. */
  chatHref: string
  /** Site-owned project overview route. */
  projectHref?: string
  projectActive?: boolean
  /** Optional host action for the project-creation menu entry. */
  onCreateProject?: () => void
  /** Optional project collection. Undefined keeps the legacy single-project fixture. */
  projects?: readonly WorkspaceRailProject[]
  /** Receives the stable project order after a pointer/keyboard reorder. */
  onReorderProjects?: (projectIds: string[]) => void
  /** Optional task-specific action; falls back to onNewChat for compatibility. */
  onCreateTask?: () => void
  /** Receives the stable order for the currently scoped conversation list. */
  onReorderConversations?: (conversationIds: string[]) => void
  /** Alias for hosts that name project-scoped conversations “tasks”. */
  onReorderTasks?: (conversationIds: string[]) => void
  /** Route-owned active state for direct and catalog destinations. */
  activeNavigationKey?: string
  conversations: ConversationSummary[]
  activeId: string | null
  // 待批会话 id 集（HITL-NOTIFY）：命中的条目上挂待批徽标（跨会话可见性）。
  awaitingIds: ReadonlySet<string>
  onSelectConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
  onRequestDelete?: (conversation: ConversationSummary) => void
  /** Stable desktop fallback after a destructive delete removes the opener row. */
  deleteDialogFallbackFocusRef?: RefObject<HTMLButtonElement | null>
  /** Shell-owned focus target for settings opened from the portaled account menu. */
  accountTriggerRef?: RefObject<HTMLButtonElement | null>
  // 会话重命名（CONV-UX）：提交非空新题；乐观更新 + 失败回滚由上层处理。
  onRenameConversation: (id: string, title: string) => void
  // 打开设置中心模态到指定 tab（WEB-FACE 面三）：管理入口不再整页导航,浮层叠在工作区之上。
  onOpenSettings: (tab: SettingsTab) => void
  /** Bottom utility action opens the floating notification center, not Settings. */
  onOpenNotifications?: (returnTarget?: HTMLElement | null) => void
  preview?: boolean
  // 清单服务端水合态（SESS-LIST）：加载/错误态与滚动翻页入口。
  listLoading: boolean
  listLoadingMore?: boolean
  listError: boolean
  onRetryList?: () => void
  hasMore: boolean
  onLoadMore: () => void
}

export type WorkspaceRailProject = {
  id: string
  name: string
  href: string
  active?: boolean
}

export type WorkbenchNavigationItem = {
  key: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  settingsTab: SettingsTab | undefined
  href: string | undefined
}
