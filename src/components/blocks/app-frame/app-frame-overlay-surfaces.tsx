import { PersonalKnowledgeProvider } from "@/ui/settings/knowledge/session-context";
import { useEffect, type ComponentType, type RefObject } from "react";

import { McpCreateDialog } from "@/ui/mcp/mcp-create-dialog";
import type { McpCreateMode } from "@/ui/mcp/mcp-panel-model";
import { SettingsModal, type SettingsTab } from "@/ui/settings/settings-modal";
import type { SkillCard } from "@/hub/schemas";
import type { SettingsSkillsView } from "@/ui/settings/settings-location";
import type { SkillsScopeFilter } from "@/ui/skills/skills-scope";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { browserHubClient } from "@/ui/shell/page-clients";
import { warmCustomApiProjection } from "@/ui/mcp/use-custom-api-projection";
import { warmMcpProjection } from "@/ui/mcp/use-mcp-projection";
import { createManusSkillHubClient, retainManusSkillHubClient } from "@/ui/skills/manus-skill-client";
import { warmSkillsPool } from "@/ui/skills/skills-panel";

import type { AppCommandMenuProps } from "./app-command-menu";

export type AppFrameOverlaySurfacesProps = {
  onArchiveChanged?: (state: import("@/lib/archived-tasks.schema").ArchiveState) => void;
  mounted: boolean;
  settingsTab: SettingsTab | null;
  settingsSkillsScope?: SkillsScopeFilter;
  brandName: string | undefined;
  preview: boolean;
  readBoundary?: ProjectReadBoundary;
  onCloseSettings: () => void;
  onTabChange: (tab: SettingsTab, skillsView?: SettingsSkillsView) => void;
  onCreateSkillWithAi: (prompt?: string) => void;
  onTrySkill: (skill: SkillCard, prompt?: string) => boolean;
  settingsReturnFocusRef: RefObject<HTMLElement | null>;
  shellRef: RefObject<HTMLDivElement | null>;
  mcpCreateMode: McpCreateMode | null;
  setMcpCreateMode: (mode: McpCreateMode | null) => void;
  mcpCreateReturnFocusRef: RefObject<HTMLElement | null>;
  commandMenu: ComponentType<AppCommandMenuProps>;
  commandProps: Omit<AppCommandMenuProps, "open" | "onOpenChange">;
  commandOpen: boolean;
  onCommandOpenChange: (open: boolean) => void;
};

/** Owns the mounted Settings/MCP/command overlay surfaces and their adapters. */
export function AppFrameOverlaySurfaces({
  mounted,
  settingsTab,
  settingsSkillsScope,
  brandName,
  preview,
  readBoundary,
  onArchiveChanged,
  onCloseSettings,
  onTabChange,
  onCreateSkillWithAi,
  onTrySkill,
  settingsReturnFocusRef,
  shellRef,
  mcpCreateMode,
  setMcpCreateMode,
  mcpCreateReturnFocusRef,
  commandMenu: CommandMenu,
  commandProps,
  commandOpen,
  onCommandOpenChange,
}: AppFrameOverlaySurfacesProps) {
  // Start the small, read-only connector projections with the admitted app
  // session rather than when the Settings dialog first mounts. The Settings
  // section still joins this exact client/identity flight, but opening it no
  // longer has to show a transient placeholder before its known list appears.
  const connectorIdentity = preview
    ? "preview"
    : readBoundary?.admitted === true
      ? readBoundary.subject
      : null;
  useEffect(() => {
    if (!mounted || connectorIdentity === null) return undefined;
    const client = browserHubClient({ preview });
    const releaseMcp = warmMcpProjection({
      client,
      identity: connectorIdentity,
      readGeneration: preview ? 0 : readBoundary?.generation ?? 0,
    });
    const releaseCustomApi = warmCustomApiProjection({
      client,
      identity: connectorIdentity,
      readGeneration: preview ? 0 : readBoundary?.generation ?? 0,
    });
    return () => {
      releaseMcp();
      releaseCustomApi();
    };
  }, [connectorIdentity, mounted, preview, readBoundary?.generation]);

  useEffect(() => {
    if (!mounted) return undefined;
    const base = browserHubClient({ preview });
    if (preview) return warmSkillsPool(base);
    const boundary = readBoundary ?? { admitted: false, subject: null, generation: 0 };
    // A blocked generation retires the previous actor's fetcher. Only an
    // admitted lifetime warms data; its lease tolerates StrictMode replay.
    const client = createManusSkillHubClient(base, boundary);
    if (!boundary.admitted || boundary.subject === null) return undefined;
    const releaseLifetime = retainManusSkillHubClient(client);
    const releasePool = warmSkillsPool(client);
    return () => { releasePool(); releaseLifetime(); };
  }, [mounted, preview, readBoundary]);

  return (
    <PersonalKnowledgeProvider boundary={readBoundary ?? { subject: null, admitted: false, generation: 0 }} preview={preview}>
      {/* 设置中心：浮在工作区之上的模态卡片，语境原地保留。 */}
      {mounted && settingsTab !== null ? (
        <SettingsModal
        {...(onArchiveChanged===undefined?{}:{onArchiveChanged})}
          {...(brandName === undefined ? {} : { brandName })}
          initialTab={settingsTab}
          {...(settingsSkillsScope === undefined ? {} : { initialSkillsScope: settingsSkillsScope })}
          preview={preview}
          {...(readBoundary === undefined ? {} : { readBoundary })}
          onClose={onCloseSettings}
          onTabChange={onTabChange}
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
          onOpenChange={(open) => {
            if (!open) setMcpCreateMode(null);
          }}
          returnFocusRef={mcpCreateReturnFocusRef}
        />
      ) : null}

      <CommandMenu
        {...commandProps}
        open={commandOpen}
        onOpenChange={onCommandOpenChange}
      />
    </PersonalKnowledgeProvider>
  );
}
