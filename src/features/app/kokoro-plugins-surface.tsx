"use client"

import { useMemo } from "react"

import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { browserHubClient } from "@/ui/shell/page-clients"
import { McpProjectionRead } from "@/ui/mcp/mcp-projection-read"

import styles from "./kokoro-plugins-surface.module.css"

type KokoroPluginsSurfaceProps = Pick<
  EmptyStateProps,
  "onCreateMcp" | "onOpenSettings" | "preview" | "projectReadBoundary"
> & {
  onPrompt?: EmptyStateProps["onPrompt"]
}

/**
 * The plugins route is the connector plaza: it reads the Platform-owned
 * provider directory, while Settings/连接器 owns the user's installed list.
 * Both use the same admitted subject identity, but they intentionally start
 * in different views.  "管理连接器" opens the shared Settings surface rather
 * than replacing the plaza in place.
 */
export function KokoroPluginsSurface({
  preview = false,
  projectReadBoundary,
  onCreateMcp,
  onOpenSettings,
  onPrompt,
}: KokoroPluginsSurfaceProps) {
  const client = useMemo(() => browserHubClient({ preview }), [preview])
  const boundary = projectReadBoundary

  // The full route is mounted by the workspace shell, so it must receive the
  // exact same verified admission boundary as Settings/MCP. A local browser
  // index is never authentication proof and must not trigger owner reads.
  const identity = preview ? "preview" : boundary?.subject ?? null

  return (
    <div className={styles.page} data-testid="plugins-page">
      <div className={styles.content}>
        {identity === null ? null : (
          <McpProjectionRead
            key={identity}
            client={client}
            embedded
            identity={identity}
            admitted={preview || boundary?.admitted === true}
            readGeneration={preview ? 0 : boundary?.generation ?? 0}
            initialView="catalog"
            {...(onCreateMcp === undefined ? {} : { onCreateMcp })}
            {...(onOpenSettings === undefined
              ? {}
              : {
                  onManageConnectors: (target) =>
                    onOpenSettings("mcp", target),
                })}
            {...(onPrompt === undefined ? {} : { onPrompt })}
          />
        )}
      </div>
    </div>
  )
}
