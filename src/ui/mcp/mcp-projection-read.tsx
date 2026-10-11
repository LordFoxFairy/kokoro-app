"use client"

import { type FormEvent, useEffect, useState } from "react"
import { Cable, ExternalLink, Link2, LoaderCircle, MessageCircle, Pencil, Plus, Power, Search, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import type { HubClient } from "@/hub/client"
import type { McpPersonalConnector, McpPersonalConnectorPage, McpPersonalProvider, McpPersonalProviderPage } from "@/hub/mcp-personal.schema"
import { useT } from "@/i18n/context"

import styles from "./mcp-projection-read.module.css"

type Projection = { connectors: McpPersonalConnectorPage; providers: McpPersonalProviderPage }
type ReadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: Projection }
type Editor = { kind: "edit"; connector: McpPersonalConnector }

type ProjectionFlight = {
  controller: AbortController
  promise: Promise<Projection>
  subscribers: number
}

type ProjectionSubscription = {
  promise: Promise<Projection>
  release: () => void
}

// StrictMode intentionally replays effects during local development. One owner
// read is shared for one authenticated lifecycle. The final subscriber releases
// it on a microtask: StrictMode's immediate remount reclaims the same read,
// while a real logout or identity switch aborts the abandoned network request.
const projectionInflight = new WeakMap<object, Map<string, ProjectionFlight>>()

function subscribeProjection(client: HubClient, key: string, cursor: string | null): ProjectionSubscription {
  let requests = projectionInflight.get(client)
  if (requests === undefined) {
    requests = new Map()
    projectionInflight.set(client, requests)
  }
  let flight = requests.get(key)
  if (flight === undefined) {
    const controller = new AbortController()
    const promise = Promise.all([
      client.listMcpPersonalConnectors(cursor === null ? {} : { cursor }, controller.signal),
      client.listMcpPersonalProviders({ limit: 100 }, controller.signal),
    ]).then(([connectors, providers]) => ({ connectors, providers }))
    flight = { controller, promise, subscribers: 0 }
    requests.set(key, flight)
    const clear = (): void => {
      if (requests?.get(key) === flight) requests.delete(key)
    }
    void promise.then(clear, clear)
  }

  flight.subscribers += 1
  let released = false
  return {
    promise: flight.promise,
    release: () => {
      if (released) return
      released = true
      flight.subscribers -= 1
      if (flight.subscribers !== 0) return
      queueMicrotask(() => {
        if (flight?.subscribers !== 0 || requests?.get(key) !== flight) return
        requests.delete(key)
        flight.controller.abort()
      })
    },
  }
}

function connectorStatusKey(status: McpPersonalConnector["status"]): "mcp.pending" | "mcp.active" | "mcp.error" | "mcp.revoked" {
  return `mcp.${status}` as "mcp.pending" | "mcp.active" | "mcp.error" | "mcp.revoked"
}

function providerLinkLabel(value: string): string {
  const url = new URL(value)
  return `${url.host}${url.pathname === "/" ? "" : url.pathname}`
}

const categoryMessage = { efficiency: "mcp.categoryEfficiency", creation: "mcp.categoryCreation", business: "mcp.categoryBusiness", development: "mcp.categoryDevelopment", finance: "mcp.categoryFinance", travel: "mcp.categoryTravel", health: "mcp.categoryHealth" } as const

function providerMonogram(provider: McpPersonalProvider): string { return [...provider.display_name.trim()][0]?.toLocaleUpperCase() ?? "M" }

/**
 * Platform is the source of every provider and connector rendered here.  This
 * component only retains the last confirmed projection while a refresh is in
 * flight, so an asynchronous mutation never replaces the user's page with a
 * loading screen or shifts the list beneath the pointer.
 */
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
  const [editor, setEditor] = useState<Editor | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<McpPersonalProvider | null>(null)
  const [providerQuery, setProviderQuery] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [description, setDescription] = useState("")
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const requestCursor = cursor
    const requestGeneration = generation
    const requestKey = JSON.stringify([identity, requestCursor, requestGeneration])
    const subscription = subscribeProjection(client, requestKey, requestCursor)
    void subscription.promise.then(
      ({ connectors, providers }) => {
        if (!active || requestCursor !== cursor || requestGeneration !== generation) return
        setState({ kind: "ready", data: { connectors, providers } })
      },
      () => {
        if (!active || requestCursor !== cursor || requestGeneration !== generation) return
        setRefreshError(true)
        setState((current) => current.kind === "ready" ? current : { kind: "error" })
      },
    ).finally(() => {
      if (active && requestCursor === cursor && requestGeneration === generation) setRefreshing(false)
    })
    return () => {
      active = false
      subscription.release()
    }
  }, [client, cursor, generation, identity])

  const projection = state.kind === "ready" ? state.data : null
  const providers = projection?.providers.items ?? []
  // Revocation is retained by Platform for auditability, but is no longer a
  // usable user connection. Keep it out of this live-connection surface while
  // preserving the owner response (and its cursor) unchanged.
  const visibleConnectors = projection?.connectors.items.filter((connector) => connector.status !== "revoked") ?? []
  const normalizedProviderQuery = providerQuery.trim().toLocaleLowerCase()
  const displayedProviders = normalizedProviderQuery
    ? providers.filter((provider) => [provider.display_name, provider.description, provider.author, ...provider.category_keys]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase().includes(normalizedProviderQuery)))
    : providers
  const providerByKey = new Map(providers.map((provider) => [provider.provider_key, provider]))

  const reload = () => {
    setRefreshing(true)
    setRefreshError(false)
    setGeneration((value) => value + 1)
  }
  const resetEditor = () => {
    setEditor(null)
    setDeleteId(null)
    setDisplayName("")
    setDescription("")
  }
  const beginEdit = (connector: McpPersonalConnector) => {
    setDisplayName(connector.display_name ?? "")
    setDescription(connector.description ?? "")
    setDeleteId(null)
    setActionError(false)
    setEditor({ kind: "edit", connector })
  }
  const runAction = async (id: string, action: () => Promise<unknown>, onSuccess?: () => void) => {
    setActionId(id)
    setActionError(false)
    try {
      await action()
      resetEditor()
      onSuccess?.()
      reload()
    } catch {
      setActionError(true)
    } finally {
      setActionId(null)
    }
  }
  const connectProvider = (provider: McpPersonalProvider, onSuccess?: () => void) => {
    void runAction(`connect:${provider.provider_key}`, () => client.createMcpPersonalConnector({
      provider_key: provider.provider_key,
      connector_type: "mcp",
      display_name: provider.display_name,
      description: provider.description ?? "",
    }), onSuccess)
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

  const editorTitle = t("mcp.edit")
  const categoryLabel = (category: McpPersonalProvider["category_keys"][number]) => t(categoryMessage[category])

  return <section className={styles.surface} data-testid="mcp-projection-read" aria-busy={refreshing || undefined}>
    <header className={styles.header}>
      <h2>{embedded ? t("rail.navPlugins") : t("mcp.title")}</h2>
      <div className={styles.headerControls}>
        <label className={styles.searchField}>
          <Search aria-hidden="true" />
          <span className="sr-only">{t("plugins.search")}</span>
          <Input type="search" value={providerQuery} onChange={(event) => setProviderQuery(event.target.value)} placeholder={t("plugins.search")} />
        </label>
        {refreshing ? <span className={styles.refreshing} role="status"><LoaderCircle aria-hidden="true" />{t("mcp.loading")}</span> : null}
      </div>
    </header>

    {state.kind === "loading" ? <div className={styles.loading} role="status"><Spinner aria-hidden="true" />{t("mcp.loading")}</div> : null}
    {state.kind === "error" ? <Alert variant="destructive" role="alert" className={styles.alert}><AlertDescription>{t("mcp.loadError")}</AlertDescription><Button type="button" variant="outline" onClick={reload}>{t("mcp.retry")}</Button></Alert> : null}
    {refreshError && projection ? <Alert variant="destructive" role="alert" className={styles.alert}><AlertDescription>{t("mcp.loadError")}</AlertDescription><Button type="button" variant="outline" onClick={reload}>{t("mcp.retry")}</Button></Alert> : null}
    {actionError ? <Alert variant="destructive" role="alert" className={styles.alert}><AlertDescription>{t("mcp.actionFailed")}</AlertDescription></Alert> : null}

    {projection ? <div className={styles.content}>
      <section className={styles.providerSection} aria-label={t("mcp.provider")}>
        {providers.length === 0 ? <div className={styles.emptyProvider}><Link2 aria-hidden="true" /><p>{t("mcp.noProviders")}</p></div> : displayedProviders.length === 0 ? <div className={styles.emptyProvider}><Search aria-hidden="true" /><p>{t("mcp.noMatch")}</p></div> : <ul className={styles.providerGrid}>
          {displayedProviders.map((provider) => <li key={provider.provider_key} className={styles.providerCard} data-testid={`mcp-provider-card-${provider.provider_key}`}>
            <button type="button" className={styles.providerDetailTrigger} onClick={() => setSelectedProvider(provider)} aria-label={provider.display_name}>
              <span className={styles.providerMedia} aria-hidden="true"><span>{providerMonogram(provider)}</span></span>
              <span className={styles.providerCopy}>
                <span className={styles.providerName}>{provider.display_name}</span>
                {provider.description ? <span className={styles.providerDescription}>{provider.description}</span> : null}
                {provider.category_keys.length > 0 ? <span className={styles.categoryList}>{provider.category_keys.slice(0, 3).map((category) => <span key={category}>{categoryLabel(category)}</span>)}</span> : null}
              </span>
            </button>
            <Button type="button" variant="outline" size="sm" className={styles.providerAction} disabled={actionId !== null} onClick={() => connectProvider(provider)} aria-label={t("plugins.addConnector", { name: provider.display_name })}>
              {actionId === `connect:${provider.provider_key}` ? <Spinner aria-hidden="true" /> : <Plus aria-hidden="true" />}
            </Button>
          </li>)}
        </ul>}
      </section>

      <section className={styles.connectionSection} aria-label={t("mcp.title")}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>{t("mcp.title")}</p><h3>{t("mcp.tabServers")}</h3></div></div>
        {visibleConnectors.length === 0 ? <div className={styles.emptyConnections}><p>{t("mcp.empty")}</p></div> : <ul className={styles.connectorGrid}>{visibleConnectors.map((connector) => {
          const provider = providerByKey.get(connector.provider_key)
          const connectorName = connector.display_name || provider?.display_name || connector.provider_key
          const providerName = provider?.display_name ?? connector.provider_key
          const busy = actionId === connector.connector_id
          const deleting = deleteId === connector.connector_id
          return <li key={connector.connector_id} className={styles.connectorCard} data-testid="mcp-projection">
            <div className={styles.connectorTop}>
              <div className={styles.connectorIdentity}><span className={styles.connectorMark} aria-hidden="true"><Cable /></span><div><h4>{connectorName}</h4>{providerName !== connectorName ? <p>{providerName}</p> : null}</div></div>
              <span className={styles.status} data-status={connector.status}>{t(connectorStatusKey(connector.status))}</span>
            </div>
            {connector.description ? <p className={styles.connectorDescription}>{connector.description}</p> : null}
            {connector.status === "pending" ? <p className={styles.pendingHint}>{t("mcp.connectingHint")}</p> : null}
            {deleting ? <div className={styles.actions}><Button type="button" variant="destructive" disabled={busy} onClick={() => void runAction(connector.connector_id, () => client.removeMcpPersonalConnector(connector.connector_id, { expected_state_version: connector.state_version }))}>{busy ? <Spinner aria-hidden="true" /> : null}{t("mcp.deleteConfirm")}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setDeleteId(null)}>{t("mcp.cancel")}</Button></div> : <div className={styles.actions}><Button type="button" variant="outline" size="sm" disabled={busy || connector.status === "revoked"} onClick={() => beginEdit(connector)}><Pencil aria-hidden="true" />{t("mcp.edit")}</Button>{connector.status === "active" ? <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void runAction(connector.connector_id, () => client.setMcpPersonalConnectorEnabled(connector.connector_id, { enabled: !connector.enabled, expected_state_version: connector.state_version }))}>{busy ? <Spinner aria-hidden="true" /> : <Power aria-hidden="true" />}{connector.enabled ? t("mcp.disable") : t("mcp.enable")}</Button> : null}<Button type="button" variant="ghost" size="sm" className={styles.removeAction} disabled={busy || connector.status === "revoked"} onClick={() => { setDeleteId(connector.connector_id); setEditor(null) }}><Trash2 aria-hidden="true" />{t("mcp.delete")}</Button></div>}
          </li>
        })}</ul>}
      </section>

      <nav className={styles.pagination} aria-label="MCP pages">
        <Button type="button" variant="outline" disabled={history.length === 0 || actionId !== null} onClick={() => { const previous = history.at(-1) ?? null; setRefreshing(true); setRefreshError(false); setHistory((items) => items.slice(0, -1)); setCursor(previous) }}>{t("plugins.previous")}</Button>
        <Button type="button" variant="outline" disabled={!projection.connectors.next_cursor || actionId !== null} onClick={() => { const next = projection.connectors.next_cursor; if (!next || next === cursor || history.includes(next)) { setRefreshError(true); return }; setRefreshing(true); setRefreshError(false); setHistory((items) => [...items, cursor]); setCursor(next) }}>{t("plugins.next")}</Button>
      </nav>
    </div> : null}

    <Dialog open={editor !== null} onOpenChange={(open) => { if (!open && actionId === null) resetEditor() }}>
      <DialogContent className={styles.editorDialog} overlayClassName={styles.editorOverlay ?? ""} closeLabel={t("mcp.cancel")}>
        <DialogHeader className={styles.editorHeader}>
          <DialogTitle>{editorTitle}</DialogTitle>
          <DialogDescription>{t("mcp.description")}</DialogDescription>
        </DialogHeader>
        {editor ? <form className={styles.editorForm} onSubmit={(event) => submitEdit(event, editor.connector)}>
          <div className={styles.field}><Label htmlFor="mcp-display-name">{t("mcp.fieldName")}</Label><Input id="mcp-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} required autoFocus /></div>
          <div className={styles.field}><Label htmlFor="mcp-description">{t("mcp.description")}</Label><Textarea id="mcp-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} /></div>
          <footer className={styles.editorActions}><Button type="button" variant="outline" onClick={resetEditor} disabled={actionId !== null}>{t("mcp.cancel")}</Button><Button type="submit" disabled={actionId !== null}>{actionId === editor.connector.connector_id ? <Spinner aria-hidden="true" /> : null}{t("mcp.saveChanges")}</Button></footer>
        </form> : null}
      </DialogContent>
    </Dialog>

    <Dialog open={selectedProvider !== null} onOpenChange={(open) => { if (!open) setSelectedProvider(null) }}>
      <DialogContent className={styles.providerDetailDialog} overlayClassName={styles.editorOverlay ?? ""} closeLabel={t("mcp.cancel")} data-detail-layout="manus">
        {selectedProvider ? <>
          <header className={styles.providerDetailHeader}>
            <div className={styles.providerDetailCopy}>
              {selectedProvider.category_keys.length > 0 ? <div className={styles.detailCategories}>{selectedProvider.category_keys.map((category) => <span key={category}>{categoryLabel(category)}</span>)}</div> : null}
              <DialogTitle>{selectedProvider.display_name}</DialogTitle>
              {selectedProvider.author ? <DialogDescription>{selectedProvider.author}</DialogDescription> : null}
              <Button type="button" className={styles.detailAddAction} onClick={() => connectProvider(selectedProvider, () => setSelectedProvider(null))} disabled={actionId !== null}>{actionId === `connect:${selectedProvider.provider_key}` ? <Spinner aria-hidden="true" /> : <Plus aria-hidden="true" />}{t("mcp.addConnector")}</Button>
            </div>
            <div className={styles.providerDetailMedia} aria-hidden="true">{providerMonogram(selectedProvider)}</div>
          </header>
          <section className={styles.providerDetailBody}>
            {selectedProvider.description ? <p className={styles.providerDetailDescription}>{selectedProvider.description}</p> : null}
            {selectedProvider.example_prompts.length > 0 ? <ul className={styles.examplePromptList}>{selectedProvider.example_prompts.map((prompt) => <li key={prompt}><MessageCircle aria-hidden="true" />{prompt}</li>)}</ul> : null}
            {selectedProvider.website || selectedProvider.privacy_url ? <div className={styles.providerLinks}>
              {selectedProvider.website ? <a href={selectedProvider.website} target="_blank" rel="noreferrer">{providerLinkLabel(selectedProvider.website)}<ExternalLink aria-hidden="true" /></a> : null}
              {selectedProvider.privacy_url ? <a href={selectedProvider.privacy_url} target="_blank" rel="noreferrer">{providerLinkLabel(selectedProvider.privacy_url)}<ExternalLink aria-hidden="true" /></a> : null}
            </div> : null}
          </section>
        </> : null}
      </DialogContent>
    </Dialog>
  </section>
}
