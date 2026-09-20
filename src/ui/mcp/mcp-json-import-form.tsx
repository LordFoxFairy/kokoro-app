"use client"

import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/i18n/context"
import type { HubClient } from "@/hub/client"

import styles from "./mcp-create-dialog.module.css"

const MCP_JSON_PLACEHOLDER = `// You can use either format:
// STDIO example:
{
  "mcpServers": {
    "stdio-server-example": {
      "command": "npx",
      "args": ["-y", "mcp-server-example"]
    }
  }
}

// SSE example:
{
  "mcpServers": {
    "sse-server-example": {
      "type": "sse",
      "url": "https://sse.example.test/mcp"
    }
  }
}

// HTTP example:
{
  "mcpServers": {
    "http-server-example": {
      "type": "streamableHttp",
      "url": "https://mcp.example.test/mcp",
      "headers": {
        "Content-Type": "application/json",
        "Authorization": "Bearer TOKEN"
      }
    }
  }
}`

export function JsonMcpImportForm({ client, onCancel, onDone }: { client: HubClient; onCancel: () => void; onDone: () => Promise<void> }) {
  const t = useT()
  const [config, setConfig] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!config.trim() || submitting) return
    setError("")
    setSubmitting(true)
    try {
      const parsed = JSON.parse(config) as {
        mcpServers?: Record<string, { type?: string; url?: string; headers?: Record<string, string> }>
      }
      const first = Object.entries(parsed.mcpServers ?? {})[0]
      if (!first) throw new Error("missing mcpServers")
      const [name, server] = first
      if (!server.url || !client.registerCustomMcp) throw new Error("unsupported MCP configuration")
      await client.registerCustomMcp({
        name,
        transport: server.type === "streamableHttp" ? "streamable_http" : "http",
        endpoint_url: server.url,
        icon_asset_id: null,
        instructions: null,
        headers: Object.entries(server.headers ?? {}).map(([headerName, value]) => ({ name: headerName, value })),
        enabled: true,
      })
      await onDone()
    } catch {
      setError(t("mcp.jsonImportInvalid"))
    } finally {
      setSubmitting(false)
    }
  }

  return <form className={styles.jsonImportForm} onSubmit={(event) => void submit(event)}>
    <DialogTitle className={styles.compactDialogTitle}>{t("mcp.jsonImportTitle")}</DialogTitle>
    <p className={styles.compactDialogDescription}>{t("mcp.jsonImportDescription")}</p>
    <Textarea autoFocus value={config} aria-label={t("mcp.jsonImportDescription")} placeholder={MCP_JSON_PLACEHOLDER} onChange={(event) => setConfig(event.target.value)} />
    {error ? <p className={styles.compactDialogError} role="alert">{error}</p> : null}
    <div className={styles.jsonImportActions}>
      <Button type="button" variant="ghost" className={styles.visuallyHiddenCancel} onClick={onCancel}>{t("mcp.cancel")}</Button>
      <Button type="submit" disabled={!config.trim() || submitting}>{t("mcp.jsonImportAction")}</Button>
    </div>
  </form>
}
