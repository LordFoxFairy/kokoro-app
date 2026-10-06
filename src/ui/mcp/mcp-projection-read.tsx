"use client"

import { useEffect, useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type { HubClient } from "@/hub/client"
import type { McpConnectionPage } from "@/hub/schemas"
import { useT } from "@/i18n/context"

type ReadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; page: McpConnectionPage }

export function McpProjectionRead({ client, embedded = false, identity }: { client: HubClient; embedded?: boolean; identity: string }) {
  const t = useT()
  const [cursor, setCursor] = useState<string | null>(null)
  const [history, setHistory] = useState<Array<string | null>>([])
  const [generation, setGeneration] = useState(0)
  const [state, setState] = useState<ReadState>({ kind: "loading" })
  useEffect(() => {
    const controller = new AbortController()
    const requestCursor = cursor
    const requestGeneration = generation
    void client.listMcpConnections(requestCursor === null ? {} : { cursor: requestCursor }, controller.signal).then(
      (page) => { if (!controller.signal.aborted && requestCursor === cursor && requestGeneration === generation) setState({ kind: "ready", page }) },
      () => { if (!controller.signal.aborted && requestCursor === cursor && requestGeneration === generation) setState({ kind: "error" }) },
    )
    return () => { controller.abort() }
  }, [client, cursor, generation, identity])

  const page = state.kind === "ready" ? state.page : null
  return <section className="space-y-4" data-testid="mcp-projection-read">
    {embedded ? null : <h2 className="text-xl font-semibold">{t("mcp.title")}</h2>}
    {state.kind === "loading" ? <div role="status" className="flex items-center gap-2"><Spinner aria-hidden="true" />{t("mcp.loading")}</div> : null}
    {state.kind === "error" ? <Alert variant="destructive" role="alert"><AlertDescription>{t("mcp.loadError")}</AlertDescription><Button type="button" variant="outline" onClick={() => { setState({ kind: "loading" }); setGeneration((value) => value + 1) }}>{t("mcp.retry")}</Button></Alert> : null}
    {page?.connections.length === 0 ? <p className="text-muted-foreground">{t("mcp.empty")}</p> : null}
    {page ? <ul className="grid gap-3 sm:grid-cols-2">{page.connections.map((connection) => <li key={connection.connection_id}>
      <Card data-testid="mcp-projection"><CardContent className="space-y-2 p-4">
        <p className="font-semibold">{connection.provider_key}</p>
        <p className="text-sm text-muted-foreground">{t("settings.connected")} · {connection.transport}</p>
        <details className="text-xs text-muted-foreground">
          <summary>IDs</summary>
          <p className="break-all">{connection.connection_id}</p>
          <p className="break-all">{connection.connector_id}</p>
          <p className="break-all">{connection.server_id}</p>
        </details>
      </CardContent></Card>
    </li>)}</ul> : null}
    {page ? <nav className="flex gap-2" aria-label="MCP pages">
      <Button type="button" variant="outline" disabled={history.length === 0} onClick={() => {
        const previous = history.at(-1) ?? null
        setState({ kind: "loading" })
        setHistory((items) => items.slice(0, -1))
        setCursor(previous)
      }}>{t("plugins.previous")}</Button>
      <Button type="button" variant="outline" disabled={!page.next_cursor} onClick={() => {
        if (!page.next_cursor) return
        if (page.next_cursor === cursor || history.includes(page.next_cursor)) {
          setState({ kind: "error" })
          return
        }
        setState({ kind: "loading" })
        setHistory((items) => [...items, cursor])
        setCursor(page.next_cursor ?? null)
      }}>{t("plugins.next")}</Button>
    </nav> : null}
  </section>
}
