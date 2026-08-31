"use client"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Cable, ChevronDown, Folder, ImageIcon, Link2, Plus, Search, Settings2, Trash2, Upload } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// 连接面板（MCP-UX）：hub self 面的 MCP server 池（注册/启停/软删）+ 凭据 handle 管理
// （创建/列表/删除，值只进不出）。scope 恒由 BFF 从信封 namespace 派生，前端不碰身份轴。
// official 位只读（徽标标注），namespace 自有项可启停/软删。revision/config_hash 是内部机制，
// 不向用户呈现——只呈现「已更新」语义。hub 拒绝（mutation 门 / 私网 URL / 非法凭据引用）经错误码人话化。

import { useCallback, useEffect, useRef, useState, type FormEvent, type RefObject } from "react"

import { useLocale, useT } from "@/i18n/context"
import { cn } from "@/lib/utils"
import { invalidate, useResource } from "@/lib/query"
import { HubClientError, type HubClient } from "@/hub/client"
import { MCP_TRANSPORTS, type McpSecret, type McpServerView, type McpTransport } from "@/hub/schemas"

import styles from "./mcp-panel.module.css"
import { ConnectorCatalogDialog } from "./connector-catalog-dialog"
import { useOverlayClose } from "@/ui/shell/use-overlay-close"

const OFFICIAL_SCOPE = "official"
// hub MCP 查询键：server/secret 任一变更（启停/软删/注册/建删凭据）后 invalidate 此键重取。
const MCP_KEY = "hub/mcp"

type Translate = ReturnType<typeof useT>

type McpData = { servers: McpServerView[]; secrets: McpSecret[] }
type ServerBusy = { name: string; action: "toggle" | "delete" } | null

export type McpCreateMode = "form" | "json" | "url"

type McpPanelProps = {
  client: HubClient
  onClose: () => void
  brandName?: string
}

// hub 稳定错误码 → 人话文案。非 HubClientError 或未知码回退通用失败。
function humanizeError(t: Translate, error: unknown): string {
  if (!(error instanceof HubClientError)) {
    return t("mcp.errGeneric")
  }
  switch (error.code) {
    case "capability_registration_disabled":
      return t("mcp.errMutationOff")
    case "secret_broker_disabled":
      return t("mcp.errSecretOff")
    case "hub.mcp_url_forbidden":
      return t("mcp.errUrl")
    case "hub.mcp_secret_ref_invalid":
    case "hub.mcp_secret_ref_unknown":
      return t("mcp.errSecretRef")
    case "hub.mcp_server_not_found":
      return t("mcp.errNotFound")
    case "request.invalid":
      return t("mcp.errInvalid")
    default:
      return t("mcp.errGeneric")
  }
}

function transportLabel(t: Translate, transport: McpTransport): string {
  return transport === "http" ? t("mcp.transportHttp") : t("mcp.transportStreamable")
}

export function McpPanel({ client, onClose, brandName }: McpPanelProps) {
  const t = useT()
  const { open, requestClose, onCloseAutoFocus } = useOverlayClose(onClose)
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) requestClose() }}>
      <DialogContent
        className={cn(styles.panel, "p-0 box-border")}
        data-testid="mcp-panel"
        closeLabel={t("mcp.close")}
        closeButtonTestId="mcp-close"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogTitle className="sr-only">{t("mcp.title")}</DialogTitle>
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>{t("mcp.title")}</h2>
            <p className={styles.subtitle}>{t("mcp.subtitle")}</p>
          </div>
        </header>
        <McpContent client={client} brandName={brandName} />
      </DialogContent>
    </Dialog>
  )
}

type McpContentProps = {
  client: HubClient
  embedded?: boolean
  brandName?: string
}

export function McpContent({ client, embedded = false, brandName = "Workspace" }: McpContentProps) {
  const t = useT()
  const [tab, setTab] = useState<"servers" | "secrets">("servers")
  const activeTabRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [tab])

  // server + secret 合并读经查询层：servers 是主体（失败即 error）；secrets 尽力而为——secret
  // broker 未配置（503 secret_broker_disabled）不该拖垮整个连接面板，容错回空池。
  const data = useResource<McpData>(
    MCP_KEY,
    useCallback(async (): Promise<McpData> => {
      const [servers, secrets] = await Promise.all([
        client.listMcpServers(),
        client.listMcpSecrets().catch(() => []),
      ])
      return { servers, secrets }
    }, [client]),
  )

  // 变更后失活重取（保持 async 签名，子组件仍可 await；invalidate 本身同步）。
  const reload = useCallback(async () => {
    invalidate(MCP_KEY)
  }, [])

  const servers = data.data?.servers ?? []
  const secrets = data.data?.secrets ?? []
  const failed = data.error !== undefined && data.data === undefined

  const renderUnavailable = () => data.data === undefined ? (
    failed ? (
      <div className={styles.hint}>
        <p>{t("mcp.loadError")}</p>
        <Button variant="outline" type="button" className={styles.retry} disabled={data.loading} aria-busy={data.loading} onClick={data.refetch}>
          {data.loading ? <Spinner aria-hidden="true" /> : null}
          {data.loading ? t("mcp.loading") : t("mcp.retry")}
        </Button>
      </div>
    ) : (
      <div className={styles.loadingState} role="status" aria-label={t("mcp.loading")}>
        <Skeleton className={styles.loadingLine} />
        <Skeleton className={styles.loadingLine} />
        <Skeleton className={styles.loadingLineShort} />
      </div>
    )
  ) : null

  return (
    <>
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as "servers" | "secrets")}
        className={cn(styles.tabs, embedded && styles.embeddedTabs)}
      >
        <TabsList variant="line" className={styles.tabList}>
          <TabsTrigger
            value="servers"
            className={styles.tab}
            ref={tab === "servers" ? activeTabRef : undefined}
            aria-label={embedded ? `${t("mcp.tabServers")} (${t("mcp.title")})` : undefined}
            onClick={() => setTab("servers")}
          >
            {t("mcp.tabServers")}
          </TabsTrigger>
          <TabsTrigger
            value="secrets"
            className={styles.tab}
            ref={tab === "secrets" ? activeTabRef : undefined}
            aria-label={embedded ? `${t("mcp.tabSecrets")} (${t("mcp.title")})` : undefined}
            onClick={() => setTab("secrets")}
          >
            {t("mcp.tabSecrets")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="servers" className={cn(styles.body, embedded && styles.embeddedBody)} data-embedded={embedded || undefined}>
          {data.data === undefined ? renderUnavailable() : <ServersTab client={client} servers={servers} secrets={secrets} onChanged={reload} embedded={embedded} brandName={brandName} />}
        </TabsContent>
        <TabsContent value="secrets" className={cn(styles.body, embedded && styles.embeddedBody)} data-embedded={embedded || undefined}>
          {data.data === undefined ? renderUnavailable() : <SecretsTab client={client} secrets={secrets} onChanged={reload} />}
        </TabsContent>
      </Tabs>
    </>
  )
}

export function McpCreateDialog({
  client,
  mode,
  open,
  onOpenChange,
  onDone,
  returnFocusRef,
}: {
  client: HubClient
  mode: McpCreateMode
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone?: () => Promise<void>
  returnFocusRef?: RefObject<HTMLElement | null>
}) {
  const t = useT()
  const close = (): void => onOpenChange(false)
  const complete = async (): Promise<void> => {
    await onDone?.()
    close()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          mode === "json" ? styles.jsonImportDialog : mode === "url" ? styles.urlMcpDialog : styles.registerDialog,
          "p-0 box-border",
        )}
        closeLabel={t("mcp.cancel")}
        overlayClassName={styles.createDialogOverlay}
        onOpenAutoFocus={(event) => {
          if (mode !== "form") return
          event.preventDefault()
          window.requestAnimationFrame(() => document.getElementById("custom-mcp-name")?.focus())
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current
          if (!target?.isConnected) return
          event.preventDefault()
          target.focus()
        }}
      >
        {mode === "json" ? (
          <JsonMcpImportForm client={client} onCancel={close} onDone={complete} />
        ) : mode === "url" ? (
          <UrlMcpForm client={client} onCancel={close} onDone={complete} />
        ) : (
          <>
            <DialogTitle className={styles.registerDialogTitle}>{t("mcp.registerDialogTitle")}</DialogTitle>
            <CustomMcpForm client={client} onDone={complete} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ServersTab({
  client,
  servers,
  secrets,
  onChanged,
  embedded = false,
  brandName,
}: {
  client: HubClient
  servers: McpServerView[]
  secrets: McpSecret[]
  onChanged: () => Promise<void>
  embedded?: boolean
  brandName: string
}) {
  const t = useT()
  const [busy, setBusy] = useState<ServerBusy>(null)
  const [error, setError] = useState<string | null>(null)
  const [registerMode, setRegisterMode] = useState<McpCreateMode | null>(null)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [query, setQuery] = useState("")
  // 删除是破坏性软删:两步确认(点删除入确认态,再点确认才执行)。
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const deleteTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const confirmDeleteRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const searchRef = useRef<HTMLInputElement | null>(null)
  const registerRef = useRef<HTMLButtonElement | null>(null)
  const catalogReturnRef = useRef<HTMLButtonElement | null>(null)

  // Inline confirmation replaces the destructive button in the same card.
  // Keep focus inside that action loop instead of letting the Radix scroll
  // viewport become active when the row re-renders.
  useEffect(() => {
    if (confirmingDelete === null) return
    const frame = window.requestAnimationFrame(() => {
      confirmDeleteRefs.current[confirmingDelete]?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [confirmingDelete])

  const focusStableControl = useCallback(() => {
    window.requestAnimationFrame(() => {
      if (searchRef.current?.isConnected) {
        searchRef.current.focus()
      } else {
        registerRef.current?.focus()
      }
    })
  }, [])

  const onToggle = useCallback(
    async (server: McpServerView) => {
      if (busy !== null) return
      setBusy({ name: server.name, action: "toggle" })
      setError(null)
      try {
        await client.setMcpEnabled(server.name, !server.enabled)
        await onChanged()
      } catch (err) {
        setError(humanizeError(t, err))
      } finally {
        setBusy(null)
      }
    },
    [busy, client, onChanged, t],
  )

  const onDelete = useCallback(
    async (server: McpServerView) => {
      if (busy !== null) return
      setBusy({ name: server.name, action: "delete" })
      setError(null)
      try {
        await client.deleteMcpServer(server.name)
        await onChanged()
      } catch (err) {
        setError(humanizeError(t, err))
      } finally {
        setBusy(null)
      }
    },
    [busy, client, onChanged, t],
  )

  const q = query.trim().toLowerCase()
  const filteredServers = servers.filter(
    (server) => q === "" || server.name.toLowerCase().includes(q) || server.url.toLowerCase().includes(q),
  )

  return (
    <>
      {error ? (
        <Alert variant="destructive" className={styles.feedback}>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {embedded ? (
        <div className={styles.embeddedToolbar}>
          <div className={styles.embeddedSearchField}>
            <Search aria-hidden="true" />
            <Input
              ref={searchRef}
              type="search"
              className={styles.embeddedSearch}
              value={query}
              placeholder={t("mcp.searchPlaceholder")}
              aria-label={t("mcp.searchPlaceholder")}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className={styles.embeddedActions}>
            <Button
              variant="outline"
              type="button"
              className={styles.browse}
              onClick={(event) => {
                catalogReturnRef.current = event.currentTarget
                setCatalogOpen(true)
              }}
            >
              {t("mcp.browse")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button ref={registerRef} variant="outline" type="button" className={styles.create}>
                  {t("mcp.create")}
                  <ChevronDown data-icon="inline-end" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setRegisterMode("form")}>
                  <Plus data-icon="inline-start" aria-hidden="true" />
                  {t("mcp.register")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ) : (
        <Button ref={registerRef} variant="outline" type="button" className={styles.register} onClick={() => setRegisterMode("form")}>
          {t("mcp.register")}
        </Button>
      )}

      {/* 搜索(按名/URL 客户端过滤;仅有 server 时出)。 */}
      {servers.length > 0 && !embedded ? (
        <Input
          ref={searchRef}
          type="search"
          className={styles.search}
          value={query}
          placeholder={t("mcp.searchPlaceholder")}
          aria-label={t("mcp.searchPlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}

      {servers.length === 0 ? (
          <Empty className={styles.emptyState} data-testid="mcp-empty">
          <EmptyHeader>
            {embedded ? <Cable className={styles.emptyIcon} aria-hidden="true" /> : null}
            {embedded ? (
              <EmptyDescription>{t("mcp.emptyGuideEmbedded", { brand: brandName })}</EmptyDescription>
            ) : (
              <>
                <EmptyTitle>{t("mcp.empty")}</EmptyTitle>
                <EmptyDescription>{t("mcp.emptyGuide")}</EmptyDescription>
              </>
            )}
          </EmptyHeader>
          {embedded ? (
            <Button
              variant="outline"
              type="button"
              className={styles.emptyCreate}
              onClick={(event) => {
                catalogReturnRef.current = event.currentTarget
                setCatalogOpen(true)
              }}
            >
              <Plus aria-hidden="true" />
              {t("mcp.addConnector")}
            </Button>
          ) : null}
        </Empty>
      ) : filteredServers.length === 0 ? (
        <Empty className={styles.noMatch}>
          <EmptyDescription>{t("mcp.noMatch")}</EmptyDescription>
        </Empty>
      ) : (
        <ul className={styles.list}>
          {filteredServers.map((server) => {
            const isOfficial = server.scope === OFFICIAL_SCOPE
            return (
              <li key={`${server.scope}/${server.name}`} data-testid="mcp-server">
              <Card className={styles.item}>
              <CardContent className={styles.itemContent}>
                <div className={styles.itemMain}>
                  <div className={styles.itemHead}>
                    <span className={styles.name}>{server.name}</span>
                    <Badge variant="outline" className={styles.badge} data-scope={isOfficial ? "official" : "own"}>
                      {isOfficial ? t("mcp.official") : t("mcp.own")}
                    </Badge>
                    <Badge variant="outline" className={styles.badge} data-state={server.enabled ? "on" : "off"}>
                      {server.enabled ? t("mcp.enabledBadge") : t("mcp.disabledBadge")}
                    </Badge>
                  </div>
                  <p className={styles.meta}>
                    {transportLabel(t, server.transport)} · {server.url}
                  </p>
                  <p className={styles.meta}>
                    {server.allowed_tools.length === 0
                      ? t("mcp.toolsAll")
                      : t("mcp.toolsCount", { count: server.allowed_tools.length })}
                    {" · "}
                    {server.secret_ref === null ? t("mcp.credNone") : t("mcp.credBound")}
                  </p>
                </div>
                {isOfficial ? null : (
                  <div className={styles.itemActions}>
                    <Button variant="outline"
                      type="button"
                      className={styles.toggle}
                      disabled={busy !== null}
                      aria-busy={busy?.name === server.name && busy.action === "toggle"}
                      aria-label={`${server.enabled ? t("mcp.disable") : t("mcp.enable")} ${server.name}`}
                      onClick={() => onToggle(server)}
                    >
                      {busy?.name === server.name && busy.action === "toggle" ? <Spinner aria-hidden="true" /> : null}
                      {server.enabled ? t("mcp.disable") : t("mcp.enable")}
                    </Button>
                    {confirmingDelete === server.name ? (
                      <span className={styles.confirmRow}>
                        <Button variant="destructive"
                          type="button"
                          className={styles.confirmYes}
                          ref={(element) => { confirmDeleteRefs.current[server.name] = element }}
                          aria-label={`${t("mcp.confirmDelete")} ${server.name}`}
                          disabled={busy !== null}
                          aria-busy={busy?.name === server.name && busy.action === "delete"}
                          onClick={() => {
                            setConfirmingDelete(null)
                            void onDelete(server).then(focusStableControl)
                          }}
                        >
                          {busy?.name === server.name && busy.action === "delete" ? <Spinner aria-hidden="true" /> : null}
                          {t("mcp.confirmDelete")}
                        </Button>
                        <Button variant="outline"
                          type="button"
                          className={styles.confirmNo}
                          aria-label={`${t("mcp.cancel")} ${server.name}`}
                          onClick={() => {
                            setConfirmingDelete(null)
                            window.requestAnimationFrame(() => deleteTriggerRefs.current[server.name]?.focus())
                          }}
                        >
                          {t("mcp.cancel")}
                        </Button>
                      </span>
                    ) : (
                      <Button variant="destructive"
                        type="button"
                        className={styles.danger}
                        ref={(element) => { deleteTriggerRefs.current[server.name] = element }}
                        disabled={busy !== null}
                        aria-busy={busy?.name === server.name && busy.action === "delete"}
                        aria-label={`${t("mcp.delete")} ${server.name}`}
                        onClick={() => setConfirmingDelete(server.name)}
                      >
                        {busy?.name === server.name && busy.action === "delete" ? <Spinner aria-hidden="true" /> : null}
                        {t("mcp.delete")}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
              </Card>
              </li>
            )
          })}
        </ul>
      )}
      {embedded ? (
        <ConnectorCatalogDialog
          client={client}
          open={catalogOpen}
          onOpenChange={setCatalogOpen}
          onCustomMcp={(mode = "form") => setRegisterMode(mode)}
          returnFocusRef={catalogReturnRef}
        />
      ) : null}
      <Dialog open={registerMode !== null} onOpenChange={(open) => { if (!open) setRegisterMode(null) }}>
        <DialogContent
          className={cn(
            registerMode === "json" ? styles.jsonImportDialog : registerMode === "url" ? styles.urlMcpDialog : styles.registerDialog,
            "p-0 box-border",
          )}
          closeLabel={t("mcp.cancel")}
          overlayClassName={styles.createDialogOverlay}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          {registerMode === "json" ? (
            <JsonMcpImportForm client={client} onCancel={() => setRegisterMode(null)} onDone={async () => {
              setRegisterMode(null)
              setCatalogOpen(false)
              await onChanged()
            }} />
          ) : registerMode === "url" ? (
            <UrlMcpForm client={client} onCancel={() => setRegisterMode(null)} onDone={async () => {
              setRegisterMode(null)
              setCatalogOpen(false)
              await onChanged()
            }} />
          ) : (
            <>
              <DialogTitle className={styles.registerDialogTitle}>{t("mcp.registerDialogTitle")}</DialogTitle>
              <RegisterForm
                client={client}
                secrets={secrets}
                referenceLayout={embedded}
                onCancel={() => setRegisterMode(null)}
                onDone={async () => {
                  setRegisterMode(null)
                  setCatalogOpen(false)
                  await onChanged()
                }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

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

function JsonMcpImportForm({ client, onCancel, onDone }: { client: HubClient; onCancel: () => void; onDone: () => Promise<void> }) {
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

function UrlMcpForm({ client, onCancel, onDone }: { client: HubClient; onCancel: () => void; onDone: () => Promise<void> }) {
  const t = useT()
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [advanced, setAdvanced] = useState(false)
  const [oauthClientId, setOauthClientId] = useState("")
  const [oauthClientSecret, setOauthClientSecret] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const canSubmit = name.trim().length > 0 && /^https:\/\//i.test(url.trim()) && !submitting

  const submit = async (enabled: boolean): Promise<void> => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await client.registerCustomMcp?.({
        name: name.trim(),
        transport: "streamable_http",
        endpoint_url: url.trim(),
        icon_asset_id: null,
        instructions: null,
        headers: [
          { name: "OAuth-Client-Id", value: oauthClientId },
          { name: "OAuth-Client-Secret", value: oauthClientSecret },
        ].filter((header) => header.value.length > 0),
        enabled,
      })
      await onDone()
    } finally {
      setSubmitting(false)
    }
  }

  return <form className={styles.urlMcpForm} onSubmit={(event) => { event.preventDefault(); void submit(false) }}>
    <DialogTitle className={styles.urlMcpTitle}>
      {t("mcp.urlTitle")}
      <span>{t("connectorCatalog.beta")}</span>
    </DialogTitle>
    <Field className={styles.urlMcpField}>
      <FieldLabel htmlFor="url-mcp-name">{t("mcp.customName")}<span>*</span></FieldLabel>
      <Input id="url-mcp-name" autoFocus value={name} placeholder={t("mcp.urlNamePlaceholder")} onChange={(event) => setName(event.target.value)} />
    </Field>
    <Field className={styles.urlMcpField}>
      <FieldLabel htmlFor="url-mcp-url">{t("mcp.customServerUrl")}<span>*</span></FieldLabel>
      <div className={styles.urlInput}><Link2 aria-hidden="true" /><Input id="url-mcp-url" value={url} placeholder="https://mcp.yourserver.com/mcp" onChange={(event) => setUrl(event.target.value)} /></div>
    </Field>
    <button type="button" className={styles.advancedToggle} aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>
      <Settings2 aria-hidden="true" />
      <span>{t("mcp.advancedSettings")}</span>
      <small>{t("mcp.optional")}</small>
      <ChevronDown aria-hidden="true" />
    </button>
    {advanced ? <div className={styles.advancedFields}>
      <Input autoComplete="off" aria-label={t("mcp.oauthClientId")} value={oauthClientId} placeholder={t("mcp.oauthClientId")} onChange={(event) => setOauthClientId(event.target.value)} />
      <Input type="password" autoComplete="new-password" aria-label={t("mcp.oauthClientSecret")} value={oauthClientSecret} placeholder={t("mcp.oauthClientSecret")} onChange={(event) => setOauthClientSecret(event.target.value)} />
    </div> : null}
    <p className={styles.urlWarning}>{t("mcp.urlWarning")}</p>
    <div className={styles.urlMcpActions}>
      <Button type="button" variant="outline" onClick={onCancel}>{t("mcp.cancel")}</Button>
      <span />
      <Button type="submit" variant="outline" disabled={!canSubmit}>{t("mcp.save")}</Button>
      <Button type="button" disabled={!canSubmit} onClick={() => void submit(true)}>{t("mcp.saveAndPublish")}<ChevronDown aria-hidden="true" /></Button>
    </div>
  </form>
}

type CustomHeaderDraft = { id: number; name: string; value: string }

function CustomMcpForm({
  client,
  onDone,
}: {
  client: HubClient
  onDone: () => Promise<void>
}) {
  const t = useT()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [name, setName] = useState("")
  const [transport, setTransport] = useState<McpTransport>("http")
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [instructions, setInstructions] = useState("")
  const [url, setUrl] = useState("")
  const [headers, setHeaders] = useState<CustomHeaderDraft[]>([])
  const [nextHeaderId, setNextHeaderId] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = name.trim().length > 0 && url.trim().length > 0 && !submitting

  const updateHeader = (id: number, field: "name" | "value", value: string): void => {
    setHeaders((current) => current.map((header) => header.id === id ? { ...header, [field]: value } : header))
  }

  const addHeader = (): void => {
    setHeaders((current) => [...current, { id: nextHeaderId, name: "", value: "" }])
    setNextHeaderId((current) => current + 1)
  }

  const submit = async (enabled: boolean): Promise<void> => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      if (!client.registerCustomMcp) {
        throw new Error("custom connector contract unavailable")
      }
      const asset = iconFile && client.uploadConnectorIcon
        ? await client.uploadConnectorIcon(iconFile)
        : null
      await client.registerCustomMcp({
        name: name.trim(),
        transport,
        endpoint_url: url.trim(),
        icon_asset_id: asset?.asset_id ?? null,
        instructions: instructions.trim() || null,
        headers: headers
          .map((header) => ({ name: header.name.trim(), value: header.value }))
          .filter((header) => header.name.length > 0 && header.value.length > 0),
        enabled,
      })
      await onDone()
    } catch (caught) {
      setError(humanizeError(t, caught))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      className={styles.customMcpForm}
      data-testid="custom-mcp-form"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault()
        void submit(true)
      }}
    >
      <div className={styles.customMcpFields}>
        <Field className={styles.customMcpField}>
          <FieldLabel htmlFor="custom-mcp-name">{t("mcp.customName")}</FieldLabel>
          <Input
            id="custom-mcp-name"
            value={name}
            placeholder={t("mcp.customNamePlaceholder")}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field className={styles.customMcpField}>
          <FieldLabel htmlFor="custom-mcp-transport">{t("mcp.customTransport")}</FieldLabel>
          <Select value={transport} onValueChange={(value) => setTransport(value as McpTransport)}>
            <SelectTrigger id="custom-mcp-transport" aria-label={t("mcp.customTransport")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="http">HTTP</SelectItem>
                <SelectItem value="streamable_http">Streamable HTTP</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field className={cn(styles.customMcpField, styles.customMcpWide)}>
          <FieldLabel>{t("mcp.customIcon")}</FieldLabel>
          <div className={styles.iconUploadRow}>
            <button type="button" className={styles.iconPreview} onClick={() => fileRef.current?.click()} aria-label={t("mcp.customUpload")}>
              <ImageIcon aria-hidden="true" />
            </button>
            <div className={styles.iconUploadCopy}>
              <Button variant="outline" type="button" className={styles.uploadButton} onClick={() => fileRef.current?.click()}>
                <Upload aria-hidden="true" />
                {t("mcp.customUpload")}
                <ChevronDown aria-hidden="true" />
              </Button>
              <span>{iconFile?.name ?? t("mcp.customIconHint")}</span>
            </div>
            <input
              ref={fileRef}
              className={styles.hiddenFile}
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null
                if (next && next.size > 1024 * 1024) {
                  setError(t("mcp.customIconTooLarge"))
                  event.target.value = ""
                  return
                }
                setError(null)
                setIconFile(next)
              }}
            />
          </div>
        </Field>

        <Field className={cn(styles.customMcpField, styles.customMcpWide, styles.customMcpNotes)}>
          <FieldLabel htmlFor="custom-mcp-instructions">{t("mcp.customInstructions")}<span>{t("mcp.optional")}</span></FieldLabel>
          <Textarea
            id="custom-mcp-instructions"
            value={instructions}
            placeholder={t("mcp.customInstructionsPlaceholder")}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </Field>

        <Field className={cn(styles.customMcpField, styles.customMcpWide)}>
          <FieldLabel htmlFor="custom-mcp-url">{t("mcp.customServerUrl")}</FieldLabel>
          <Input
            id="custom-mcp-url"
            value={url}
            placeholder="https://mcp.yourserver.com/mcp"
            onChange={(event) => setUrl(event.target.value)}
          />
        </Field>

        <div className={cn(styles.customMcpField, styles.customMcpWide)}>
          <FieldLabel>{t("mcp.customHeaders")}<span>{t("mcp.optional")}</span></FieldLabel>
          {headers.length > 0 ? <div className={styles.headerRows}>
            {headers.map((header, index) => (
              <div className={styles.headerRow} key={header.id}>
                <Input
                  value={header.name}
                  name={`custom-mcp-header-name-${header.id}`}
                  autoComplete="off"
                  aria-label={t("mcp.customHeaderName", { count: index + 1 })}
                  placeholder={t("mcp.customHeaderNamePlaceholder")}
                  onChange={(event) => updateHeader(header.id, "name", event.target.value)}
                />
                <Input
                  value={header.value}
                  type="password"
                  name={`custom-mcp-header-value-${header.id}`}
                  autoComplete="new-password"
                  aria-label={t("mcp.customHeaderValue", { count: index + 1 })}
                  placeholder={t("mcp.customHeaderValuePlaceholder")}
                  onChange={(event) => updateHeader(header.id, "value", event.target.value)}
                />
                <Button variant="ghost" size="icon-sm" type="button" onClick={() => setHeaders((current) => current.filter((entry) => entry.id !== header.id))} aria-label={t("mcp.customRemoveHeader")}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div> : null}
          <Button variant="outline" type="button" className={styles.addHeaderButton} onClick={addHeader}>
            <Plus aria-hidden="true" />
            {t("mcp.customAddHeader")}
          </Button>
        </div>
      </div>

      {error ? <p className={styles.customMcpError} role="alert">{error}</p> : null}

      <div className={styles.customMcpActions}>
        <div className={styles.splitSave}>
          <Button type="submit" disabled={!canSubmit}>{submitting ? t("mcp.submitting") : t("mcp.save")}</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" disabled={!canSubmit} aria-label={t("mcp.customSaveOptions")}><ChevronDown aria-hidden="true" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className={styles.publishMenu} align="end" side="top" sideOffset={4}>
              <DropdownMenuItem onSelect={() => void submit(false)}>
                <Folder aria-hidden="true" />
                {t("mcp.customPublishToProjects")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </form>
  )
}

function RegisterForm(props: {
  client: HubClient
  secrets: McpSecret[]
  referenceLayout?: boolean
  onCancel: () => void
  onDone: () => Promise<void>
}) {
  return props.referenceLayout
    ? <CustomMcpForm client={props.client} onDone={props.onDone} />
    : <LegacyRegisterForm client={props.client} secrets={props.secrets} onCancel={props.onCancel} onDone={props.onDone} />
}

// Standalone MCP management keeps the lower-level server/credential editor;
// Settings uses the connector composer above it.
function LegacyRegisterForm({
  client,
  secrets,
  onCancel,
  onDone,
}: {
  client: HubClient
  secrets: McpSecret[]
  onCancel: () => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const [name, setName] = useState("")
  const [transport, setTransport] = useState<McpTransport>("streamable_http")
  const [url, setUrl] = useState("")
  const [tools, setTools] = useState("")
  // 凭据选择："none" | handle(srt_...) | "new"（新建则同表单填名值，注册前先创建换 handle）。
  const [secretChoice, setSecretChoice] = useState<string>("none")
  const [newSecretName, setNewSecretName] = useState("")
  const [newSecretValue, setNewSecretValue] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  const nameRef = useRef<HTMLInputElement | null>(null)
  const urlRef = useRef<HTMLInputElement | null>(null)
  const newSecretNameRef = useRef<HTMLInputElement | null>(null)
  const newSecretValueRef = useRef<HTMLInputElement | null>(null)

  const onSubmit = useCallback(async () => {
    setSubmitting(true)
    setError(null)
    try {
      // 凭据 handle 归一化：新建则先创建换句柄；secret_ref 恒为 handle:srt_... 引用或 null。
      let secretRef: string | null = null
      if (secretChoice === "new") {
        const handle = await client.createMcpSecret(newSecretName.trim(), newSecretValue)
        secretRef = `handle:${handle}`
      } else if (secretChoice !== "none") {
        secretRef = `handle:${secretChoice}`
      }
      const allowedTools = tools
        .split(",")
        .map((tool) => tool.trim())
        .filter((tool) => tool.length > 0)
      await client.registerMcpServer({
        name: name.trim(),
        transport,
        url: url.trim(),
        allowed_tools: allowedTools,
        secret_ref: secretRef,
      })
      await onDone()
    } catch (err) {
      setError(humanizeError(t, err))
    } finally {
      setSubmitting(false)
    }
  }, [client, name, newSecretName, newSecretValue, onDone, secretChoice, t, tools, transport, url])

  const canSubmit =
    name.trim().length > 0 &&
    url.trim().length > 0 &&
    (secretChoice !== "new" || (newSecretName.trim().length > 0 && newSecretValue.length > 0))
  const nameInvalid = attempted && name.trim().length === 0
  const urlInvalid = attempted && url.trim().length === 0
  const newSecretNameInvalid = attempted && secretChoice === "new" && newSecretName.trim().length === 0
  const newSecretValueInvalid = attempted && secretChoice === "new" && newSecretValue.length === 0

  return (
    <form
      className={styles.form}
      data-testid="mcp-register-form"
      onSubmit={(e) => {
        e.preventDefault()
        setAttempted(true)
        if (!canSubmit) {
          window.requestAnimationFrame(() => {
            const target = name.trim().length === 0
              ? nameRef.current
              : url.trim().length === 0
                ? urlRef.current
                : newSecretName.trim().length === 0
                  ? newSecretNameRef.current
                  : newSecretValueRef.current
            target?.focus()
          })
          return
        }
        if (!submitting) void onSubmit()
      }}
    >
      <FieldGroup className={styles.fieldGroup}>
      <Field className={styles.field} data-invalid={nameInvalid || undefined}>
        <FieldLabel className={styles.fieldLabel} htmlFor="mcp-server-name">{t("mcp.fieldName")}</FieldLabel>
        <Input
          ref={nameRef}
          id="mcp-server-name"
          className={styles.input}
          value={name}
          aria-invalid={nameInvalid || undefined}
          placeholder={t("mcp.fieldNamePlaceholder")}
          onChange={(e) => setName(e.target.value)}
        />
        <FieldDescription className={styles.fieldHint}>{t("mcp.fieldNameHint")}</FieldDescription>
        {nameInvalid ? <FieldError>{t("mcp.required")}</FieldError> : null}
      </Field>

      <Field className={styles.field}>
        <FieldLabel className={styles.fieldLabel} htmlFor="mcp-transport">{t("mcp.fieldTransport")}</FieldLabel>
        <Select value={transport} onValueChange={(value) => setTransport(value as McpTransport)}>
          <SelectTrigger id="mcp-transport" className={styles.input} aria-label={t("mcp.fieldTransport")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {MCP_TRANSPORTS.map((value) => (
                <SelectItem key={value} value={value}>
                  {transportLabel(t, value)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <Field className={styles.field} data-invalid={urlInvalid || undefined}>
        <FieldLabel className={styles.fieldLabel} htmlFor="mcp-server-url">{t("mcp.fieldUrl")}</FieldLabel>
        <Input
          ref={urlRef}
          id="mcp-server-url"
          className={styles.input}
          value={url}
          aria-invalid={urlInvalid || undefined}
          placeholder={t("mcp.fieldUrlPlaceholder")}
          onChange={(e) => setUrl(e.target.value)}
        />
        <FieldDescription className={styles.fieldHint}>{t("mcp.fieldUrlHint")}</FieldDescription>
        {urlInvalid ? <FieldError>{t("mcp.required")}</FieldError> : null}
      </Field>

      <Field className={styles.field}>
        <FieldLabel className={styles.fieldLabel} htmlFor="mcp-tools">{t("mcp.fieldTools")}</FieldLabel>
        <Input
          id="mcp-tools"
          className={styles.input}
          value={tools}
          placeholder={t("mcp.fieldToolsPlaceholder")}
          onChange={(e) => setTools(e.target.value)}
        />
        <FieldDescription className={styles.fieldHint}>{t("mcp.fieldToolsHint")}</FieldDescription>
      </Field>

      <Field className={styles.field}>
        <FieldLabel className={styles.fieldLabel} htmlFor="mcp-secret-choice">{t("mcp.fieldSecret")}</FieldLabel>
        <Select value={secretChoice} onValueChange={setSecretChoice}>
          <SelectTrigger id="mcp-secret-choice" className={styles.input} aria-label={t("mcp.fieldSecret")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="none">{t("mcp.secretOptionNone")}</SelectItem>
              {secrets.map((secret) => (
                <SelectItem key={secret.handle} value={secret.handle}>
                  {secret.name}
                </SelectItem>
              ))}
              <SelectItem value="new">{t("mcp.secretOptionNew")}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      {secretChoice === "new" ? (
        <>
          <Field className={styles.field} data-invalid={newSecretNameInvalid || undefined}>
            <FieldLabel className={styles.fieldLabel} htmlFor="mcp-new-secret-name">{t("mcp.secretName")}</FieldLabel>
            <Input
              ref={newSecretNameRef}
              id="mcp-new-secret-name"
              className={styles.input}
              value={newSecretName}
              aria-invalid={newSecretNameInvalid || undefined}
              placeholder={t("mcp.secretNamePlaceholder")}
              onChange={(e) => setNewSecretName(e.target.value)}
            />
            {newSecretNameInvalid ? <FieldError>{t("mcp.required")}</FieldError> : null}
          </Field>
          <Field className={styles.field} data-invalid={newSecretValueInvalid || undefined}>
            <FieldLabel className={styles.fieldLabel} htmlFor="mcp-new-secret-value">{t("mcp.secretValue")}</FieldLabel>
            <Input
              ref={newSecretValueRef}
              id="mcp-new-secret-value"
              className={styles.input}
              type="password"
              value={newSecretValue}
              aria-invalid={newSecretValueInvalid || undefined}
              placeholder={t("mcp.secretValuePlaceholder")}
              onChange={(e) => setNewSecretValue(e.target.value)}
            />
            <FieldDescription className={styles.fieldHint}>{t("mcp.secretValueHint")}</FieldDescription>
            {newSecretValueInvalid ? <FieldError>{t("mcp.required")}</FieldError> : null}
          </Field>
        </>
      ) : null}
      </FieldGroup>

      {error ? (
        <Alert variant="destructive" className={styles.feedback}>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className={styles.formActions}>
        <Button
          variant="default"
          type="submit"
          className={styles.submit}
          disabled={submitting}
          aria-busy={submitting}
          data-incomplete={!canSubmit || undefined}
        >
          {submitting ? <><Spinner aria-hidden="true" />{t("mcp.submitting")}</> : t("mcp.save")}
        </Button>
        <Button variant="outline" type="button" className={styles.cancel} onClick={onCancel} disabled={submitting}>
          {t("mcp.cancel")}
        </Button>
      </div>
    </form>
  )
}

function SecretsTab({
  client,
  secrets,
  onChanged,
}: {
  client: HubClient
  secrets: McpSecret[]
  onChanged: () => Promise<void>
}) {
  const t = useT()
  const { locale } = useLocale()
  const [name, setName] = useState("")
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  const nameRef = useRef<HTMLInputElement | null>(null)
  const valueRef = useRef<HTMLInputElement | null>(null)
  const secretDeleteTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const secretConfirmRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const createSecretRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (confirmingDelete === null) return
    const frame = window.requestAnimationFrame(() => {
      secretConfirmRefs.current[confirmingDelete]?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [confirmingDelete])

  const onCreate = useCallback(async () => {
    if (creating || busy !== null) return
    setCreating(true)
    setError(null)
    try {
      await client.createMcpSecret(name.trim(), value)
      setName("")
      setValue("")
      await onChanged()
    } catch (err) {
      setError(humanizeError(t, err))
    } finally {
      setCreating(false)
    }
  }, [busy, client, creating, name, onChanged, t, value])

  const onDelete = useCallback(
    async (secret: McpSecret) => {
      if (creating || busy !== null) return
      setBusy(secret.handle)
      setError(null)
      try {
        await client.deleteMcpSecret(secret.handle)
        await onChanged()
      } catch (err) {
        setError(humanizeError(t, err))
      } finally {
        setBusy(null)
      }
    },
    [busy, client, creating, onChanged, t],
  )

  const canCreate = name.trim().length > 0 && value.length > 0
  const nameInvalid = attempted && name.trim().length === 0
  const valueInvalid = attempted && value.length === 0

  return (
    <div className={styles.secrets}>
      <p className={styles.hintLead}>{t("mcp.secretsHint")}</p>

      <form
        className={styles.form}
        data-testid="mcp-secret-form"
        onSubmit={(e) => {
          e.preventDefault()
          setAttempted(true)
          if (!canCreate) {
            window.requestAnimationFrame(() => {
              (name.trim().length === 0 ? nameRef.current : valueRef.current)?.focus()
            })
            return
          }
          if (!creating) void onCreate()
        }}
      >
        <FieldGroup className={styles.fieldGroup}>
        <Field className={styles.field} data-invalid={nameInvalid || undefined}>
          <FieldLabel className={styles.fieldLabel} htmlFor="mcp-secret-name">{t("mcp.secretName")}</FieldLabel>
          <Input
            ref={nameRef}
            id="mcp-secret-name"
            className={styles.input}
            value={name}
            aria-invalid={nameInvalid || undefined}
            placeholder={t("mcp.secretNamePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
          {nameInvalid ? <FieldError>{t("mcp.required")}</FieldError> : null}
        </Field>
        <Field className={styles.field} data-invalid={valueInvalid || undefined}>
          <FieldLabel className={styles.fieldLabel} htmlFor="mcp-secret-value">{t("mcp.secretValue")}</FieldLabel>
          <Input
            ref={valueRef}
            id="mcp-secret-value"
            className={styles.input}
            type="password"
            value={value}
            aria-invalid={valueInvalid || undefined}
            placeholder={t("mcp.secretValuePlaceholder")}
            onChange={(e) => setValue(e.target.value)}
          />
          <FieldDescription className={styles.fieldHint}>{t("mcp.secretValueHint")}</FieldDescription>
          {valueInvalid ? <FieldError>{t("mcp.required")}</FieldError> : null}
        </Field>
        </FieldGroup>
        <div className={styles.formActions}>
          <Button ref={createSecretRef} variant="default" type="submit" className={styles.submit} disabled={creating || busy !== null} aria-busy={creating}>
            {creating ? <><Spinner aria-hidden="true" />{t("mcp.secretCreating")}</> : t("mcp.secretCreate")}
          </Button>
        </div>
      </form>

      {error ? (
        <Alert variant="destructive" className={styles.feedback}>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {secrets.length === 0 ? (
        <p className={styles.hint}>{t("mcp.secretsEmpty")}</p>
      ) : (
        <ul className={styles.list}>
          {secrets.map((secret) => (
            <li key={secret.handle} className={styles.item} data-testid="mcp-secret">
              <div className={styles.itemMain}>
                <div className={styles.itemHead}>
                  <span className={styles.name}>{secret.name}</span>
                </div>
                <p className={styles.meta}>
                  {t("mcp.secretCreatedAt", { date: new Date(secret.createdAt).toLocaleDateString(locale) })}
                </p>
              </div>
              <div className={styles.itemActions}>
                {confirmingDelete === secret.handle ? (
                  <span className={styles.confirmRow}>
                    <Button
                      variant="destructive"
                      type="button"
                      className={styles.confirmYes}
                      ref={(element) => { secretConfirmRefs.current[secret.handle] = element }}
                      aria-label={`${t("mcp.secretDeleteConfirm")} ${secret.name}`}
                      disabled={busy !== null || creating}
                      aria-busy={busy === secret.handle}
                      onClick={() => {
                        setConfirmingDelete(null)
                        void onDelete(secret).then(() => {
                          window.requestAnimationFrame(() => createSecretRef.current?.focus())
                        })
                      }}
                    >
                      {busy === secret.handle ? <><Spinner aria-hidden="true" />{t("mcp.secretDeleteConfirm")}</> : t("mcp.secretDeleteConfirm")}
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      className={styles.confirmNo}
                      disabled={busy !== null || creating}
                      aria-busy={busy === secret.handle}
                      aria-label={`${t("mcp.cancel")} ${secret.name}`}
                      onClick={() => {
                        setConfirmingDelete(null)
                        window.requestAnimationFrame(() => secretDeleteTriggerRefs.current[secret.handle]?.focus())
                      }}
                    >
                      {t("mcp.cancel")}
                    </Button>
                  </span>
                ) : (
                  <Button variant="ghost"
                    type="button"
                    className={styles.dangerGhost}
                    ref={(element) => { secretDeleteTriggerRefs.current[secret.handle] = element }}
                    disabled={busy !== null || creating}
                    aria-busy={busy === secret.handle}
                    aria-label={`${t("mcp.secretDelete")} ${secret.name}`}
                    onClick={() => setConfirmingDelete(secret.handle)}
                  >
                    {t("mcp.secretDelete")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
