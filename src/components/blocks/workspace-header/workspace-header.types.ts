import type { SessionClient } from "@/engine/client"
import type { SettingsTab } from "@/ui/settings/settings-modal"

export type ProjectRenameControl = {
  focusScopeToken: object
  available: boolean
  open: boolean
  name: string
  status: "idle" | "pending" | "confirming-read" | "unknown" | "read-error" | "error"
  problem: "invalid" | "permission" | "unknown" | "read" | "rejected" | null
  frozen: boolean
  onOpen: () => void
  onClose: () => void
  onChange: (name: string) => void
  onSave: () => void
  onRetry: () => void
  onRestart: () => void
}

export type WorkspaceHeaderProps = {
  activeId: string | null
  projectRename?: ProjectRenameControl
  shareClient: Pick<SessionClient, "createShare" | "revokeShare">
  onOpenSettings?: (tab: SettingsTab) => void
  brandName?: string
  emptyWorkspace?: boolean
  projectWorkspace?: boolean
  showNavigationTrigger?: boolean
  onNavigationToggle?: () => void
  navigationExpanded?: boolean
}

export type WorkspaceHeaderIdentityProps = Pick<
  WorkspaceHeaderProps,
  "brandName" | "onOpenSettings"
>

export type WorkspaceHeaderActionProps = Pick<
  WorkspaceHeaderProps,
  "activeId" | "projectRename" | "emptyWorkspace" | "onOpenSettings" | "projectWorkspace" | "shareClient"
>
