"use client"

import { useMemo } from "react"

import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { browserHubClient, readBrowserAuthIndexSubject } from "@/ui/shell/page-clients"
import { McpProjectionRead } from "@/ui/mcp/mcp-projection-read"

import styles from "./kokoro-plugins-surface.module.css"

type KokoroPluginsSurfaceProps = Pick<EmptyStateProps, "preview" | "onOpenSettings">

/**
 * The plugins route is a live projection of Platform-owned MCP providers and
 * user connectors. It intentionally has no fixture directory: a card is only
 * rendered after the BFF has admitted and returned the provider metadata.
 */
export function KokoroPluginsSurface({ preview = false }: KokoroPluginsSurfaceProps) {
  const client = useMemo(() => browserHubClient({ preview }), [preview])
  // This is only a render generation key. Authentication remains HttpOnly and
  // every read is independently verified by the same-origin BFF.
  const identity = readBrowserAuthIndexSubject() ?? "session-pending"

  return (
    <div className={styles.page} data-testid="plugins-page">
      <div className={styles.content}>
        <McpProjectionRead client={client} embedded identity={identity} />
      </div>
    </div>
  )
}
