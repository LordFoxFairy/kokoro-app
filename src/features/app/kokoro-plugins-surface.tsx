"use client"

import { useMemo } from "react"

import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { browserHubClient } from "@/ui/shell/page-clients"
import { McpProjectionRead } from "@/ui/mcp/mcp-projection-read"

import styles from "./kokoro-plugins-surface.module.css"

type KokoroPluginsSurfaceProps = Pick<EmptyStateProps, "preview" | "onCreateMcp" | "projectReadBoundary">

/**
 * The plugins route is a live projection of Platform-owned MCP providers and
 * user connectors. It intentionally has no fixture directory: a card is only
 * rendered after the BFF has admitted and returned the provider metadata.
 */
export function KokoroPluginsSurface({ preview = false, projectReadBoundary, onCreateMcp }: KokoroPluginsSurfaceProps) {
  const client = useMemo(() => browserHubClient({ preview }), [preview])
  const boundary = projectReadBoundary

  // The full route is mounted by the workspace shell, so it must receive the
  // exact same verified admission boundary as Settings/MCP. A local browser
  // index is never authentication proof and must not trigger owner reads.
  const identity = preview
    ? "preview"
    : boundary?.admitted === true && boundary.subject !== null
      ? `${boundary.subject}:${boundary.generation}`
      : null

  return (
    <div className={styles.page} data-testid="plugins-page">
      <div className={styles.content}>
        {identity === null ? null : <McpProjectionRead key={identity} client={client} embedded identity={identity} {...(onCreateMcp === undefined ? {} : { onCreateMcp })} />}
      </div>
    </div>
  )
}
