import type { SessionClient } from "@/engine/client"
import type { SettingsTab } from "@/ui/settings/settings-modal"
import type { ProjectDeletionSnapshot } from "@/contract/project-deletion"

export type ProjectDeletionControl = {
  available: boolean
  open: boolean
  name: string
  status: "idle" | "pending" | "unknown" | "accepted" | "reading" | "status" | "error" | "read-error"
  problem: "permission" | "conflict" | "read" | "unknown" | "rate-limited" | "unavailable" | "in-progress" | "rejected" | null
  snapshot: ProjectDeletionSnapshot | null
  focusScopeToken: object
  canWriteProject: () => boolean
  onOpen: () => void
  onClose: () => void
  onConfirm: () => void
  onRetry: () => void
  onRead: () => void
}

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
  projectDeletion?: ProjectDeletionControl
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
  "activeId" | "projectRename" | "projectDeletion" | "emptyWorkspace" | "onOpenSettings" | "projectWorkspace" | "shareClient"
>
