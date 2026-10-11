"use client"

import Image from "next/image"
import { type FormEvent, useEffect, useRef, useState } from "react"
import { Cable, ChevronDown, Link2, ListFilter, LoaderCircle, MessageCircle, Pencil, Plus, Power, Search, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import type { HubClient } from "@/hub/client"
import type { McpPersonalConnector, McpPersonalConnectorPage, McpPersonalProvider, McpPersonalProviderPage } from "@/hub/mcp-personal.schema"
import { useT } from "@/i18n/context"
import type { McpCreateMode } from "./mcp-panel-model"

import styles from "./mcp-projection-read.module.css"

type Projection = { connectors?: McpPersonalConnectorPage; providers: McpPersonalProviderPage }
type ReadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: Projection }
type Editor = { kind: "edit"; connector: McpPersonalConnector }

type ProjectionFlight = {
  controller: AbortController
  promise: Promise<Partial<Projection>>
  subscribers: number
}

type ProjectionSubscription = {
  promise: Promise<Partial<Projection>>
  release: () => void
}

// StrictMode intentionally replays effects during local development. One owner
// read is shared for one authenticated lifecycle. The final subscriber releases
// it on a microtask: StrictMode's immediate remount reclaims the same read,
// while a real logout or identity switch aborts the abandoned network request.
const projectionInflight = new WeakMap<object, Map<string, ProjectionFlight>>()

function subscribeProjection(
  client: HubClient,
  key: string,
  cursor: string | null,
  resource: "providers" | "connectors",
): ProjectionSubscription {
  let requests = projectionInflight.get(client)
  if (requests === undefined) {
    requests = new Map()
    projectionInflight.set(client, requests)
  }
  let flight = requests.get(key)
  if (flight === undefined) {
    const controller = new AbortController()
    const promise = resource === "providers"
      ? client.listMcpPersonalProviders({ limit: 100 }, controller.signal).then((providers) => ({ providers }))
      : client.listMcpPersonalConnectors(cursor === null ? {} : { cursor }, controller.signal).then((connectors) => ({ connectors }))
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

const categoryMessage = { efficiency: "mcp.categoryEfficiency", creation: "mcp.categoryCreation", business: "mcp.categoryBusiness", development: "mcp.categoryDevelopment", finance: "mcp.categoryFinance", travel: "mcp.categoryTravel", health: "mcp.categoryHealth" } as const

const providerLogoAssets: Readonly<Record<string, string>> = {
  "ahrefs-api": "/assets/connectors/ahrefs-api.webp",
  "cloudflare-api": "/assets/connectors/cloudflare-api.webp",
  "elevenlabs-api": "/assets/connectors/elevenlabs-api.webp",
  "github": "/assets/connectors/github.webp",
  "gmail": "/assets/connectors/gmail.webp",
  "google-calendar": "/assets/connectors/google-calendar.webp",
  "google-gemini": "/assets/connectors/google-gemini.webp",
  "google-workspace": "/assets/connectors/google-workspace.webp",
  "grok": "/assets/connectors/grok.webp",
  "higgsfield": "/assets/connectors/higgsfield.webp",
  "instagram": "/assets/connectors/instagram.svg",
  "instagram-creator": "/assets/connectors/instagram-creator.svg",
  "mailchimp": "/assets/connectors/mailchimp.webp",
  "meta-ads": "/assets/connectors/meta-ads.svg",
  "my-browser": "/assets/connectors/my-browser.webp",
  "n8n-api": "/assets/connectors/n8n-api.webp",
  "notion": "/assets/connectors/notion.webp",
  "openai": "/assets/connectors/openai.webp",
  "openrouter-api": "/assets/connectors/openrouter-api.webp",
  "outlook": "/assets/connectors/outlook.svg",
  "perplexity": "/assets/connectors/perplexity.webp",
  "similarweb-api": "/assets/connectors/similarweb-api.webp",
  "tiktok": "/assets/connectors/tiktok.svg",
  "typeform": "/assets/connectors/typeform.webp",
}

function providerLogo(provider: Pick<McpPersonalProvider, "provider_key">): string | undefined {
  return providerLogoAssets[provider.provider_key]
}

/**
 * Platform is the source of every provider and connector rendered here.  This
 * component only retains the last confirmed projection while a refresh is in
 * flight, so an asynchronous mutation never replaces the user's page with a
 * loading screen or shifts the list beneath the pointer.
 */
export function McpProjectionRead({ client, identity, onCreateMcp }: {
  client: HubClient
  embedded?: boolean
  identity: string
  onCreateMcp?: (mode: McpCreateMode, returnTarget?: HTMLElement | null) => void
}) {
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
  const [view, setView] = useState<"catalog" | "connections">("catalog")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [displayName, setDisplayName] = useState("")
  const [description, setDescription] = useState("")
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const completedReads = useRef(new Set<string>())
  const createTriggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    let active = true
    const requestCursor = cursor
    const requestGeneration = generation
    const resource = view === "catalog" ? "providers" : "connectors"
    const requestKey = JSON.stringify([identity, requestCursor, requestGeneration, resource])
    // Switching back to a populated catalog must not make a second full owner
    // request. A new generation is created only by an explicit refresh or a
    // successful mutation, so it remains the one clear invalidation boundary.
    if (completedReads.current.has(requestKey)) {
      setRefreshing(false)
      return
    }
    const subscription = subscribeProjection(client, requestKey, requestCursor, resource)
    void subscription.promise.then(
      (next) => {
        if (!active || requestCursor !== cursor || requestGeneration !== generation) return
        completedReads.current.add(requestKey)
        setState((current) => {
          if (resource === "providers") {
            if (next.providers === undefined) return current
            return {
              kind: "ready",
              data: {
                providers: next.providers,
                ...(current.kind === "ready" && current.data.connectors !== undefined ? { connectors: current.data.connectors } : {}),
              },
            }
          }
          if (next.connectors === undefined || current.kind !== "ready") return current
          return { kind: "ready", data: { ...current.data, connectors: next.connectors } }
        })
      },
      () => {
        completedReads.current.delete(requestKey)
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
  }, [client, cursor, generation, identity, view])

  const projection = state.kind === "ready" ? state.data : null
  const providers = projection?.providers.items ?? []
  // Revocation is retained by Platform for auditability, but is no longer a
  // usable user connection. Keep it out of this live-connection surface while
  // preserving the owner response (and its cursor) unchanged.
  const visibleConnectors = projection?.connectors?.items.filter((connector) => connector.status !== "revoked") ?? []
  const normalizedProviderQuery = providerQuery.trim().toLocaleLowerCase()
  const displayedProviders = providers.filter((provider) => {
    const matchesQuery = normalizedProviderQuery.length === 0 || [provider.display_name, provider.description, provider.author, ...provider.category_keys]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase().includes(normalizedProviderQuery))
    return matchesQuery && (categoryFilter === "all" || provider.category_keys.includes(categoryFilter as McpPersonalProvider["category_keys"][number]))
  })
  // Manus keeps the category rail stable even while the owner's current page is
  // sparse. The taxonomy is UI vocabulary, not a fabricated provider record;
  // cards still come only from the Platform projection above.
  const categoryOptions = Object.keys(categoryMessage) as Array<keyof typeof categoryMessage>
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
      <h2>{t("rail.navPlugins")}</h2>
      <label className={styles.searchField}>
        <Search aria-hidden="true" />
        <span className="sr-only">{t("plugins.search")}</span>
        <Input type="search" value={providerQuery} onChange={(event) => setProviderQuery(event.target.value)} placeholder={t("plugins.search")} />
      </label>
      <div className={styles.headerControls}>
        <Button type="button" variant="outline" className={styles.viewToggle} data-active={view === "connections" || undefined} aria-pressed={view === "connections"} onClick={() => {
          setRefreshing(true)
          setRefreshError(false)
          setView((current) => current === "catalog" ? "connections" : "catalog")
        }}>
          {view === "catalog" ? t("plugins.manageConnectors") : t("mcp.browse")}
        </Button>
        {onCreateMcp ? <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button ref={createTriggerRef} type="button" variant="outline" className={styles.createButton}>
              {t("plugins.create")}<ChevronDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={styles.createMenu}>
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => onCreateMcp("form", createTriggerRef.current)}>{t("mcp.register")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onCreateMcp("url", createTriggerRef.current)}>{t("mcp.urlTitle")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onCreateMcp("json", createTriggerRef.current)}>{t("mcp.jsonImportTitle")}</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu> : null}
        {refreshing ? <span className={styles.refreshing} role="status"><LoaderCircle aria-hidden="true" />{t("mcp.loading")}</span> : null}
      </div>
    </header>

    {state.kind === "loading" ? <div className={styles.loading} role="status"><Spinner aria-hidden="true" />{t("mcp.loading")}</div> : null}
    {state.kind === "error" ? <Alert variant="destructive" role="alert" className={styles.alert}><AlertDescription>{t("mcp.loadError")}</AlertDescription><Button type="button" variant="outline" onClick={reload}>{t("mcp.retry")}</Button></Alert> : null}
    {refreshError && projection ? <Alert variant="destructive" role="alert" className={styles.alert}><AlertDescription>{t("mcp.loadError")}</AlertDescription><Button type="button" variant="outline" onClick={reload}>{t("mcp.retry")}</Button></Alert> : null}
    {actionError ? <Alert variant="destructive" role="alert" className={styles.alert}><AlertDescription>{t("mcp.actionFailed")}</AlertDescription></Alert> : null}

    {projection ? <div className={styles.content}>
      {view === "catalog" ? <div className={styles.directoryControls}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className={styles.filterTrigger}>
              <ListFilter aria-hidden="true" />
              {categoryFilter === "all" ? t("mcp.categoryAll") : categoryLabel(categoryFilter as McpPersonalProvider["category_keys"][number])}
              <ChevronDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className={styles.filterMenu}>
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => setCategoryFilter("all")}>{t("mcp.categoryAll")}</DropdownMenuItem>
              {categoryOptions.map((category) => <DropdownMenuItem key={category} onSelect={() => setCategoryFilter(category)}>{categoryLabel(category)}</DropdownMenuItem>)}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div> : null}

      {view === "catalog" ? <section className={styles.providerSection} aria-label={t("mcp.provider")}>
        {providers.length === 0 ? <div className={styles.emptyProvider}><Link2 aria-hidden="true" /><p>{t("mcp.noProviders")}</p></div> : displayedProviders.length === 0 ? <div className={styles.emptyProvider}><Search aria-hidden="true" /><p>{t("mcp.noMatch")}</p></div> : <ul className={styles.providerGrid}>
          {displayedProviders.map((provider) => <li key={provider.provider_key} className={styles.providerCard} data-testid={`mcp-provider-card-${provider.provider_key}`}>
            <button type="button" className={styles.providerDetailTrigger} onClick={() => setSelectedProvider(provider)} aria-label={provider.display_name}>
              <span className={styles.providerLogo} aria-hidden="true">{providerLogo(provider) ? <Image src={providerLogo(provider)!} alt="" fill sizes="2.4rem" unoptimized /> : <Cable />}</span>
              <span className={styles.providerCopy}>
                <span className={styles.providerName}>{provider.display_name}</span>
                {provider.description ? <span className={styles.providerDescription}>{provider.description}</span> : null}
                {provider.category_keys.length > 0 ? <span className={styles.providerTags}>{provider.category_keys.map((category) => <span key={category}>{categoryLabel(category)}</span>)}</span> : null}
              </span>
            </button>
          </li>)}
        </ul>}
      </section> : <section className={styles.connectionSection} aria-label={t("mcp.title")}>
        {projection.connectors === undefined ? <div className={styles.loading} role="status"><Spinner aria-hidden="true" />{t("mcp.loading")}</div> : null}
        {projection.connectors !== undefined && (visibleConnectors.length === 0 ? <div className={styles.emptyConnections}><p>{t("mcp.empty")}</p></div> : <ul className={styles.connectorGrid}>{visibleConnectors.map((connector) => {
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
        })}</ul>)}
      </section>}

      {view === "connections" ? <nav className={styles.pagination} aria-label="MCP pages">
        <Button type="button" variant="outline" disabled={history.length === 0 || actionId !== null} onClick={() => { const previous = history.at(-1) ?? null; setRefreshing(true); setRefreshError(false); setHistory((items) => items.slice(0, -1)); setCursor(previous) }}>{t("plugins.previous")}</Button>
        <Button type="button" variant="outline" disabled={!projection.connectors?.next_cursor || actionId !== null} onClick={() => { const next = projection.connectors?.next_cursor; if (!next || next === cursor || history.includes(next)) { setRefreshError(true); return }; setRefreshing(true); setRefreshError(false); setHistory((items) => [...items, cursor]); setCursor(next) }}>{t("plugins.next")}</Button>
      </nav> : null}
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
          <header className={styles.providerDetailHeader} data-has-logo="true">
            <span className={styles.providerDetailLogo} data-testid="mcp-provider-detail-logo" aria-hidden="true">
              {providerLogo(selectedProvider) ? <Image src={providerLogo(selectedProvider)!} alt="" fill sizes="4rem" unoptimized /> : <Cable />}
            </span>
            <div className={styles.providerDetailCopy}>
              <DialogTitle>{selectedProvider.display_name}</DialogTitle>
              {selectedProvider.description ? <DialogDescription className={styles.providerDetailDescription}>{selectedProvider.description}</DialogDescription> : null}
              <div className={styles.providerDetailActions}>
                <Button type="button" disabled={actionId !== null} onClick={() => connectProvider(selectedProvider, () => { setSelectedProvider(null); setView("connections") })}>
                  {actionId === `connect:${selectedProvider.provider_key}` ? <Spinner aria-hidden="true" /> : <Plus aria-hidden="true" />}{t("settings.connect")}
                </Button>
              </div>
            </div>
          </header>
          <section className={styles.providerDetailBody}>
            {selectedProvider.example_prompts.length > 0 ? <ul className={styles.examplePromptList}>{selectedProvider.example_prompts.map((prompt) => <li key={prompt}><MessageCircle aria-hidden="true" /><span>{prompt}</span></li>)}</ul> : null}
            <section className={styles.providerDetailMetadata} data-testid="mcp-provider-detail-metadata" aria-label={t("mcp.details")}>
              <h3>{t("mcp.details")}</h3>
              <dl>
                {selectedProvider.category_keys.length > 0 ? <div><dt>{t("mcp.detailCategory")}</dt><dd>{selectedProvider.category_keys.map(categoryLabel).join("、")}</dd></div> : null}
                <div><dt>{t("mcp.detailConnectorType")}</dt><dd>{t(selectedProvider.directory_type === "app" ? "mcp.directoryTypeApp" : "mcp.directoryTypeDataSource")}</dd></div>
                {selectedProvider.author ? <div><dt>{t("mcp.detailAuthor")}</dt><dd>{selectedProvider.author}</dd></div> : null}
              </dl>
            </section>
          </section>
        </> : null}
      </DialogContent>
    </Dialog>
  </section>
}
