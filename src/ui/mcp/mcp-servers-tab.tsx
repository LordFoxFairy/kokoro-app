"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Cable, ChevronDown, Plus, Search } from "lucide-react"
import { useT } from "@/i18n/context"
import { cn } from "@/lib/utils"
import type { HubClient } from "@/hub/client"
import type { McpSecret, McpServerView } from "@/hub/schemas"

import panelStyles from "./mcp-panel.module.css"
import dialogStyles from "./mcp-create-dialog.module.css"
import listStyles from "./mcp-server-list.module.css"
import { ConnectorCatalogDialog } from "./connector-catalog-dialog"
import { JsonMcpImportForm } from "./mcp-json-import-form"
import { RegisterForm } from "./mcp-register-form"
import { UrlMcpForm } from "./mcp-url-form"
import { OFFICIAL_SCOPE, humanizeError, transportLabel, type McpCreateMode, type ServerBusy } from "./mcp-panel-model"

export function ServersTab({
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
        <Alert variant="destructive" className={panelStyles.feedback}>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {embedded ? (
        <div className={panelStyles.embeddedToolbar}>
          <div className={panelStyles.embeddedSearchField}>
            <Search aria-hidden="true" />
            <Input
              ref={searchRef}
              type="search"
              className={panelStyles.embeddedSearch}
              value={query}
              placeholder={t("mcp.searchPlaceholder")}
              aria-label={t("mcp.searchPlaceholder")}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className={panelStyles.embeddedActions}>
            <Button
              variant="outline"
              type="button"
              className={panelStyles.browse}
              onClick={(event) => {
                catalogReturnRef.current = event.currentTarget
                setCatalogOpen(true)
              }}
            >
              {t("mcp.browse")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button ref={registerRef} variant="outline" type="button" className={panelStyles.create}>
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
        <Button ref={registerRef} variant="outline" type="button" className={panelStyles.register} onClick={() => setRegisterMode("form")}>
          {t("mcp.register")}
        </Button>
      )}

      {/* 搜索(按名/URL 客户端过滤;仅有 server 时出)。 */}
      {servers.length > 0 && !embedded ? (
        <Input
          ref={searchRef}
          type="search"
          className={panelStyles.search}
          value={query}
          placeholder={t("mcp.searchPlaceholder")}
          aria-label={t("mcp.searchPlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}

      {servers.length === 0 ? (
          <Empty className={panelStyles.emptyState} data-testid="mcp-empty">
          <EmptyHeader>
            {embedded ? <Cable className={panelStyles.emptyIcon} aria-hidden="true" /> : null}
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
              className={panelStyles.emptyCreate}
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
        <Empty className={panelStyles.noMatch}>
          <EmptyDescription>{t("mcp.noMatch")}</EmptyDescription>
        </Empty>
      ) : (
        <ul className={listStyles.list}>
          {filteredServers.map((server) => {
            const isOfficial = server.scope === OFFICIAL_SCOPE
            return (
              <li key={`${server.scope}/${server.name}`} data-testid="mcp-server">
              <Card className={listStyles.item}>
              <CardContent className={listStyles.itemContent}>
                <div className={listStyles.itemMain}>
                  <div className={listStyles.itemHead}>
                    <span className={listStyles.name}>{server.name}</span>
                    <Badge variant="outline" className={listStyles.badge} data-scope={isOfficial ? "official" : "own"}>
                      {isOfficial ? t("mcp.official") : t("mcp.own")}
                    </Badge>
                    <Badge variant="outline" className={listStyles.badge} data-state={server.enabled ? "on" : "off"}>
                      {server.enabled ? t("mcp.enabledBadge") : t("mcp.disabledBadge")}
                    </Badge>
                  </div>
                  <p className={listStyles.meta}>
                    {transportLabel(t, server.transport)} · {server.url}
                  </p>
                  <p className={listStyles.meta}>
                    {server.allowed_tools.length === 0
                      ? t("mcp.toolsAll")
                      : t("mcp.toolsCount", { count: server.allowed_tools.length })}
                    {" · "}
                    {server.secret_ref === null ? t("mcp.credNone") : t("mcp.credBound")}
                  </p>
                </div>
                {isOfficial ? null : (
                  <div className={listStyles.itemActions}>
                    <Button variant="outline"
                      type="button"
                      className={listStyles.toggle}
                      disabled={busy !== null}
                      aria-busy={busy?.name === server.name && busy.action === "toggle"}
                      aria-label={`${server.enabled ? t("mcp.disable") : t("mcp.enable")} ${server.name}`}
                      onClick={() => onToggle(server)}
                    >
                      {busy?.name === server.name && busy.action === "toggle" ? <Spinner aria-hidden="true" /> : null}
                      {server.enabled ? t("mcp.disable") : t("mcp.enable")}
                    </Button>
                    {confirmingDelete === server.name ? (
                      <span className={listStyles.confirmRow}>
                        <Button variant="destructive"
                          type="button"
                          className={listStyles.confirmYes}
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
                          className={listStyles.confirmNo}
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
                        className={listStyles.danger}
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
            registerMode === "json" ? dialogStyles.jsonImportDialog : registerMode === "url" ? dialogStyles.urlMcpDialog : dialogStyles.registerDialog,
            "p-0 box-border",
          )}
          closeLabel={t("mcp.cancel")}
          overlayClassName={dialogStyles.createDialogOverlay ?? ""}
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
              <DialogTitle className={dialogStyles.registerDialogTitle}>{t("mcp.registerDialogTitle")}</DialogTitle>
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
