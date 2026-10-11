"use client"

import { type FormEvent, useEffect, useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import type { HubClient } from "@/hub/client"
import type { McpPersonalConnector, McpPersonalConnectorPage, McpPersonalProviderPage } from "@/hub/mcp-personal.schema"
import { useT } from "@/i18n/context"

type Projection = { connectors: McpPersonalConnectorPage; providers: McpPersonalProviderPage }
type ReadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: Projection }

function connectorStatusKey(status: McpPersonalConnector["status"]): "mcp.pending" | "mcp.active" | "mcp.error" | "mcp.revoked" {
  return `mcp.${status}` as "mcp.pending" | "mcp.active" | "mcp.error" | "mcp.revoked"
}

function connectorVariant(status: McpPersonalConnector["status"]): "secondary" | "default" | "destructive" | "outline" {
  if (status === "active") return "default"
  if (status === "error") return "destructive"
  if (status === "revoked") return "outline"
  return "secondary"
}

export function McpProjectionRead({ client, embedded = false, identity }: { client: HubClient; embedded?: boolean; identity: string }) {
  const t = useT()
  const [cursor, setCursor] = useState<string | null>(null)
  const [history, setHistory] = useState<Array<string | null>>([])
  const [generation, setGeneration] = useState(0)
  const [state, setState] = useState<ReadState>({ kind: "loading" })
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [actionError, setActionError] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [providerKey, setProviderKey] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [description, setDescription] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const requestCursor = cursor
    const requestGeneration = generation
    void Promise.all([
      client.listMcpPersonalConnectors(requestCursor === null ? {} : { cursor: requestCursor }, controller.signal),
      client.listMcpPersonalProviders({ limit: 100 }, controller.signal),
    ]).then(
      ([connectors, providers]) => {
        if (controller.signal.aborted || requestCursor !== cursor || requestGeneration !== generation) return
        setState({ kind: "ready", data: { connectors, providers } })
        setProviderKey((current) => current || providers.items[0]?.provider_key || "")
      },
      () => {
        if (controller.signal.aborted || requestCursor !== cursor || requestGeneration !== generation) return
        setRefreshError(true)
        setState((current) => current.kind === "ready" ? current : { kind: "error" })
      },
    ).finally(() => {
      if (!controller.signal.aborted && requestCursor === cursor && requestGeneration === generation) setRefreshing(false)
    })
    return () => { controller.abort() }
  }, [client, cursor, generation, identity])

  const projection = state.kind === "ready" ? state.data : null
  const providers = projection?.providers.items ?? []
  const providerByKey = new Map(providers.map((provider) => [provider.provider_key, provider]))

  const reload = () => {
    setRefreshing(true)
    setRefreshError(false)
    setGeneration((value) => value + 1)
  }
  const resetEditor = () => {
    setCreateOpen(false)
    setEditingId(null)
    setDeleteId(null)
    setDisplayName("")
    setDescription("")
  }
  const beginEdit = (connector: McpPersonalConnector) => {
    setEditingId(connector.connector_id)
    setDeleteId(null)
    setCreateOpen(false)
    setDisplayName(connector.display_name ?? "")
    setDescription(connector.description ?? "")
  }
  const runAction = async (id: string, action: () => Promise<unknown>) => {
    setActionId(id)
    setActionError(false)
    try {
      await action()
      resetEditor()
      reload()
    } catch {
      setActionError(true)
    } finally {
      setActionId(null)
    }
  }
  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!providerKey || !displayName.trim()) return
    void runAction("create", () => client.createMcpPersonalConnector({
      provider_key: providerKey,
      connector_type: "mcp",
      display_name: displayName.trim(),
      description: description.trim(),
    }))
  }
  const submitEdit = (event: FormEvent<HTMLFormElement>, connector: McpPersonalConnector) => {
    event.preventDefault()
    if (!displayName.trim()) return
    void runAction(connector.connector_id, () => client.updateMcpPersonalConnector(connector.connector_id, {
      display_name: displayName.trim(),
      description: description.trim(),
      expected_state_version: connector.state_version,
    }))
  }

  return <section className="space-y-4" data-testid="mcp-projection-read" aria-busy={refreshing || undefined}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      {embedded ? null : <h2 className="text-xl font-semibold">{t("mcp.title")}</h2>}
      <Button type="button" onClick={() => { setCreateOpen(true); setEditingId(null); setDeleteId(null); setActionError(false) }} disabled={providers.length === 0 || actionId !== null}>
        {t("mcp.addConnector")}
      </Button>
    </div>
    {state.kind === "loading" ? <div role="status" className="flex items-center gap-2"><Spinner aria-hidden="true" />{t("mcp.loading")}</div> : null}
    {state.kind === "error" ? <Alert variant="destructive" role="alert"><AlertDescription>{t("mcp.loadError")}</AlertDescription><Button type="button" variant="outline" onClick={reload}>{t("mcp.retry")}</Button></Alert> : null}
    {refreshError && projection ? <Alert variant="destructive" role="alert"><AlertDescription>{t("mcp.loadError")}</AlertDescription><Button type="button" variant="outline" onClick={reload}>{t("mcp.retry")}</Button></Alert> : null}
    {actionError ? <Alert variant="destructive" role="alert"><AlertDescription>{t("mcp.actionFailed")}</AlertDescription></Alert> : null}
    {createOpen ? <Card><CardContent className="p-4"><form className="grid gap-3 sm:max-w-xl" onSubmit={submitCreate}>
      <div className="grid gap-2"><Label htmlFor="mcp-provider">{t("mcp.provider")}</Label><select id="mcp-provider" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={providerKey} onChange={(event) => setProviderKey(event.target.value)}>{providers.map((provider) => <option key={provider.provider_key} value={provider.provider_key}>{provider.display_name}</option>)}</select></div>
      <div className="grid gap-2"><Label htmlFor="mcp-display-name">{t("mcp.fieldName")}</Label><Input id="mcp-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} required /></div>
      <div className="grid gap-2"><Label htmlFor="mcp-description">{t("mcp.description")}</Label><Textarea id="mcp-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} /></div>
      <div className="flex gap-2"><Button type="submit" disabled={actionId !== null || !providerKey}>{actionId === "create" ? <Spinner aria-hidden="true" /> : null}{t("mcp.create")}</Button><Button type="button" variant="outline" onClick={resetEditor} disabled={actionId !== null}>{t("mcp.cancel")}</Button></div>
    </form></CardContent></Card> : null}
    {projection?.connectors.items.length === 0 ? <div className="space-y-2"><p className="text-muted-foreground">{t("mcp.empty")}</p>{providers.length === 0 ? <p className="text-sm text-muted-foreground">{t("mcp.noProviders")}</p> : null}</div> : null}
    {projection ? <ul className="grid gap-3 sm:grid-cols-2">{projection.connectors.items.map((connector) => {
      const provider = providerByKey.get(connector.provider_key)
      const connectorName = connector.display_name || provider?.display_name || connector.provider_key
      const providerName = provider?.display_name ?? connector.provider_key
      const busy = actionId === connector.connector_id
      const editing = editingId === connector.connector_id
      const deleting = deleteId === connector.connector_id
      return <li key={connector.connector_id}><Card data-testid="mcp-projection"><CardContent className="space-y-3 p-4">
        {editing ? <form className="grid gap-3" onSubmit={(event) => submitEdit(event, connector)}>
          <div className="grid gap-2"><Label htmlFor={`mcp-edit-name-${connector.connector_id}`}>{t("mcp.fieldName")}</Label><Input id={`mcp-edit-name-${connector.connector_id}`} value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} required /></div>
          <div className="grid gap-2"><Label htmlFor={`mcp-edit-description-${connector.connector_id}`}>{t("mcp.description")}</Label><Textarea id={`mcp-edit-description-${connector.connector_id}`} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} /></div>
          <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? <Spinner aria-hidden="true" /> : null}{t("mcp.saveChanges")}</Button><Button type="button" variant="outline" onClick={resetEditor} disabled={busy}>{t("mcp.cancel")}</Button></div>
        </form> : <>
          <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{connectorName}</p>{providerName !== connectorName ? <p className="text-sm text-muted-foreground">{providerName}</p> : null}</div><Badge variant={connectorVariant(connector.status)}>{t(connectorStatusKey(connector.status))}</Badge></div>
          {connector.description ? <p className="text-sm text-muted-foreground">{connector.description}</p> : null}
          {connector.status === "pending" ? <p className="text-sm text-muted-foreground">{t("mcp.connectingHint")}</p> : null}
          {deleting ? <div className="flex flex-wrap gap-2"><Button type="button" variant="destructive" disabled={busy} onClick={() => void runAction(connector.connector_id, () => client.removeMcpPersonalConnector(connector.connector_id, { expected_state_version: connector.state_version }))}>{busy ? <Spinner aria-hidden="true" /> : null}{t("mcp.deleteConfirm")}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setDeleteId(null)}>{t("mcp.cancel")}</Button></div> : <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy || connector.status === "revoked"} onClick={() => beginEdit(connector)}>{t("mcp.edit")}</Button>{connector.status === "active" ? <Button type="button" variant="outline" disabled={busy} onClick={() => void runAction(connector.connector_id, () => client.setMcpPersonalConnectorEnabled(connector.connector_id, { enabled: !connector.enabled, expected_state_version: connector.state_version }))}>{busy ? <Spinner aria-hidden="true" /> : connector.enabled ? t("mcp.disable") : t("mcp.enable")}</Button> : null}<Button type="button" variant="ghost" disabled={busy || connector.status === "revoked"} onClick={() => { setDeleteId(connector.connector_id); setEditingId(null) }}>{t("mcp.delete")}</Button></div>}
        </>}
      </CardContent></Card></li>
    })}</ul> : null}
    {projection ? <nav className="flex gap-2" aria-label="MCP pages">
      <Button type="button" variant="outline" disabled={history.length === 0 || actionId !== null} onClick={() => { const previous = history.at(-1) ?? null; setRefreshing(true); setRefreshError(false); setHistory((items) => items.slice(0, -1)); setCursor(previous) }}>{t("plugins.previous")}</Button>
      <Button type="button" variant="outline" disabled={!projection.connectors.next_cursor || actionId !== null} onClick={() => { const next = projection.connectors.next_cursor; if (!next || next === cursor || history.includes(next)) { setRefreshError(true); return }; setRefreshing(true); setRefreshError(false); setHistory((items) => [...items, cursor]); setCursor(next) }}>{t("plugins.next")}</Button>
    </nav> : null}
  </section>
}
