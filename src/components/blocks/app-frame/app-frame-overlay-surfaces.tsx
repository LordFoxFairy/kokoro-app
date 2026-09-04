import type { ComponentType, RefObject } from "react"

import { CustomApiDialog } from "@/ui/mcp/connector-catalog-dialog"
import { McpCreateDialog, type McpCreateMode } from "@/ui/mcp/mcp-panel"
import { SettingsModal, type SettingsTab } from "@/ui/settings/settings-modal"
import type { SessionEngine } from "@/engine/machine"
import type { SkillCard } from "@/hub/schemas"
import { browserHubClient } from "@/ui/shell/page-clients"

import type { AppCommandMenuProps } from "./app-command-menu"

export type AppFrameOverlaySurfacesProps = {
  mounted: boolean
  settingsTab: SettingsTab | null
  engine: SessionEngine | null
  brandName: string | undefined
  preview: boolean
  onCloseSettings: () => void
  onTabChange: (tab: SettingsTab) => void
  onStartDeployment: (kind: "website" | "app") => void
  onCreateSkillWithAi: () => void
  onTrySkill: (skill: SkillCard, prompt?: string) => void
  settingsReturnFocusRef: RefObject<HTMLElement | null>
  shellRef: RefObject<HTMLDivElement | null>
  mcpCreateMode: McpCreateMode | null
  setMcpCreateMode: (mode: McpCreateMode | null) => void
  mcpCreateReturnFocusRef: RefObject<HTMLElement | null>
  customApiOpen: boolean
  setCustomApiOpen: (open: boolean) => void
  customApiReturnFocusRef: RefObject<HTMLElement | null>
  commandMenu: ComponentType<AppCommandMenuProps>
  commandProps: Omit<AppCommandMenuProps, "open" | "onOpenChange">
  commandOpen: boolean
  onCommandOpenChange: (open: boolean) => void
}

/** Owns the mounted Settings/MCP/command overlay surfaces and their adapters. */
export function AppFrameOverlaySurfaces({
  mounted,
  settingsTab,
  engine,
  brandName,
  preview,
  onCloseSettings,
  onTabChange,
  onStartDeployment,
  onCreateSkillWithAi,
  onTrySkill,
  settingsReturnFocusRef,
  shellRef,
  mcpCreateMode,
  setMcpCreateMode,
  mcpCreateReturnFocusRef,
  customApiOpen,
  setCustomApiOpen,
  customApiReturnFocusRef,
  commandMenu: CommandMenu,
  commandProps,
  commandOpen,
  onCommandOpenChange,
}: AppFrameOverlaySurfacesProps) {
  return (
    <>
      {/* 设置中心：浮在工作区之上的模态卡片，语境原地保留。 */}
      {mounted && settingsTab !== null ? (
        <SettingsModal
          key={settingsTab}
          engine={engine}
          {...(brandName === undefined ? {} : { brandName })}
          initialTab={settingsTab}
          preview={preview}
          onClose={onCloseSettings}
          onTabChange={onTabChange}
          onStartDeployment={onStartDeployment}
          onCreateSkillWithAi={onCreateSkillWithAi}
          onTrySkill={onTrySkill}
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
        {...commandProps}
        open={commandOpen}
        onOpenChange={onCommandOpenChange}
      />
    </>
  )
}
