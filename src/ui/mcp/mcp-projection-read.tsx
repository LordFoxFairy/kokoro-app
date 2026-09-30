"use client"

import { useEffect, useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type { HubClient } from "@/hub/client"
import type { McpProjectionPage } from "@/hub/schemas"
import { useT } from "@/i18n/context"

type ReadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; page: McpProjectionPage }

export function McpProjectionRead({ client }: { client: HubClient }) {
  const t = useT()
  const [cursor, setCursor] = useState<string | null>(null)
  const [history, setHistory] = useState<Array<string | null>>([])
  const [generation, setGeneration] = useState(0)
  const [state, setState] = useState<ReadState>({ kind: "loading" })
  useEffect(() => {
    let current = true
    void client.listMcpProjections(cursor ?? undefined).then(
      (page) => { if (current) setState({ kind: "ready", page }) },
      () => { if (current) setState({ kind: "error" }) },
    )
    return () => { current = false }
  }, [client, cursor, generation])

  const page = state.kind === "ready" ? state.page : null
  return <section className="space-y-4" data-testid="mcp-projection-read">
    <h2 className="text-xl font-semibold">{t("mcp.title")}</h2>
    {state.kind === "loading" ? <div role="status" className="flex items-center gap-2"><Spinner aria-hidden="true" />{t("mcp.loading")}</div> : null}
    {state.kind === "error" ? <Alert variant="destructive" role="alert"><AlertDescription>{t("mcp.loadError")}</AlertDescription><Button type="button" variant="outline" onClick={() => { setState({ kind: "loading" }); setGeneration((value) => value + 1) }}>{t("mcp.retry")}</Button></Alert> : null}
    {page?.servers.length === 0 ? <p className="text-muted-foreground">{t("mcp.empty")}</p> : null}
    {page ? <ul className="grid gap-3 sm:grid-cols-2">{page.servers.map((server) => <li key={server.server_id}>
      <Card data-testid="mcp-projection"><CardContent className="space-y-2 p-4">
        <p className="font-semibold">{server.server_identity}</p>
        <p className="text-sm text-muted-foreground">{server.provider_key} · {server.transport} · {server.status}</p>
        <p className="break-all text-xs text-muted-foreground">{server.server_id}</p>
        <p className="break-all text-xs text-muted-foreground">{server.declaration_digest}</p>
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
        setState({ kind: "loading" })
        setHistory((items) => [...items, cursor])
        setCursor(page.next_cursor ?? null)
      }}>{t("plugins.next")}</Button>
    </nav> : null}
  </section>
}
